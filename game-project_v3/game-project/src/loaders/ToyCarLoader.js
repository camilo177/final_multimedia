import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { createBoxShapeFromModel, createTrimeshShapeFromModel } from '../Experience/Utils/PhysicsShapeFactory.js';
import Prize from '../Experience/World/Prize.js';

export default class ToyCarLoader {
    constructor(experience) {
        this.experience = experience;
        this.scene = this.experience.scene;
        this.resources = this.experience.resources;
        this.physics = this.experience.physics;
        this.prizes = [];
        this.debug = false;
    }

    async loadFromAPI() {
        try {
            const listRes = await fetch('/config/precisePhysicsModels.json');
            const precisePhysicsModels = await listRes.json();

            const currentLevel = this.experience.world.levelManager.currentLevel || 1;
            console.log(`🌟 Loading level ${currentLevel}`);

            let blocks = [];
            let dataSource = 'unknown';

            // 🔄 TRY BACKEND FIRST
            if (import.meta.env.VITE_API_URL) {
                try {
                    const apiUrl = `${import.meta.env.VITE_API_URL}/api/blocks?level=${currentLevel}`;
                    console.log(`📡 Attempting to fetch from backend: ${apiUrl}`);
                    
                    const res = await fetch(apiUrl, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        // Add timeout to fail faster
                        signal: AbortSignal.timeout(5000) // 5 second timeout
                    });

                    if (!res.ok) {
                        throw new Error(`Backend responded with status: ${res.status}`);
                    }

                    blocks = await res.json();
                    dataSource = 'backend';
                    console.log(`✅ SUCCESS: Loaded ${blocks.length} blocks from backend for level ${currentLevel}`);
                    
                } catch (backendError) {
                    console.warn(`⚠️ Backend failed: ${backendError.message}`);
                    console.log('🔄 Falling back to local file...');
                    
                    // 📁 FALLBACK TO LOCAL FILE
                    try {
                        const localRes = await fetch('/data/threejs_blocks.json');
                        if (!localRes.ok) {
                            throw new Error(`Local file not found: ${localRes.status}`);
                        }
                        
                        const allBlocks = await localRes.json();
                        
                        // Filter by current level
                        blocks = allBlocks.filter(block => block.level === currentLevel);
                        dataSource = 'local';
                        console.log(`✅ SUCCESS: Loaded ${blocks.length} blocks from local file for level ${currentLevel}`);
                        
                    } catch (localError) {
                        console.error(`❌ Local file also failed: ${localError.message}`);
                        throw new Error('Both backend and local file failed');
                    }
                }
            } else {
                // No backend URL configured, go straight to local
                console.log('📁 No backend URL configured, loading from local file...');
                
                const localRes = await fetch('/data/threejs_blocks.json');
                if (!localRes.ok) {
                    throw new Error(`Local file not found: ${localRes.status}`);
                }
                
                const allBlocks = await localRes.json();
                blocks = allBlocks.filter(block => block.level === currentLevel);
                dataSource = 'local';
                console.log(`✅ SUCCESS: Loaded ${blocks.length} blocks from local file for level ${currentLevel}`);
            }

            // 🪙 Handle coins - add fallbacks if none found
            const coinBlocks = blocks.filter(block => block.name && block.name.startsWith('coin'));
            console.log(`🪙 Found ${coinBlocks.length} coins from ${dataSource}`);
            
            if (coinBlocks.length === 0) {
                console.warn('⚠️ No coins found, adding fallback coins');
                const fallbackCoins = this._getDefaultCoinsForLevel(currentLevel);
                blocks = [...blocks, ...fallbackCoins];
                console.log(`🪙 Added ${fallbackCoins.length} fallback coins for level ${currentLevel}`);
            } else {
                coinBlocks.forEach((coin, index) => {
                    console.log(`  ${index}: ${coin.name} at (${coin.x}, ${coin.y}, ${coin.z}), role: ${coin.role || 'default'}`);
                });
            }

            console.log(`📊 Data source: ${dataSource.toUpperCase()}, Total blocks: ${blocks.length}`);
            this._processBlocks(blocks, precisePhysicsModels);

        } catch (err) {
            console.error('❌ Complete failure loading blocks:', err);
            
            // 🚨 LAST RESORT: Use hardcoded fallback
            console.log('🚨 Using emergency fallback data...');
            const emergencyBlocks = this._getEmergencyFallbackBlocks(this.experience.world.levelManager.currentLevel || 1);
            const listRes = await fetch('/config/precisePhysicsModels.json');
            const precisePhysicsModels = await listRes.json();
            this._processBlocks(emergencyBlocks, precisePhysicsModels);
        }
    }

    async loadFromURL(apiUrl) {
        try {
            const listRes = await fetch('/config/precisePhysicsModels.json');
            const precisePhysicsModels = await listRes.json();

            const currentLevel = this.experience.world.levelManager.currentLevel || 1;
            console.log(`🏗️ Loading level ${currentLevel} from specific URL: ${apiUrl}`);
            
            // Add level parameter to the URL if not already there
            const levelUrl = apiUrl.includes('?') 
                ? `${apiUrl}&level=${currentLevel}` 
                : `${apiUrl}?level=${currentLevel}`;

            let blocks = [];
            let dataSource = 'unknown';

            try {
                console.log(`📡 Fetching from URL: ${levelUrl}`);
                const res = await fetch(levelUrl, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    signal: AbortSignal.timeout(5000) // 5 second timeout
                });
                
                if (!res.ok) {
                    throw new Error(`URL responded with status: ${res.status}`);
                }

                blocks = await res.json();
                dataSource = 'url';
                console.log(`✅ SUCCESS: Loaded ${blocks.length} blocks from URL for level ${currentLevel}`);
                
            } catch (urlError) {
                console.warn(`⚠️ URL failed: ${urlError.message}`);
                console.log('🔄 Falling back to local file...');
                
                // Fallback to local file
                const localRes = await fetch('/data/threejs_blocks.json');
                if (!localRes.ok) {
                    throw new Error(`Local file not found: ${localRes.status}`);
                }
                
                const allBlocks = await localRes.json();
                blocks = allBlocks.filter(block => block.level === currentLevel);
                dataSource = 'local';
                console.log(`✅ SUCCESS: Loaded ${blocks.length} blocks from local file for level ${currentLevel}`);
            }

            // Handle coins
            const coinBlocks = blocks.filter(block => block.name && block.name.startsWith('coin'));
            console.log(`🪙 Found ${coinBlocks.length} coins from ${dataSource}`);
            
            if (coinBlocks.length === 0) {
                console.warn('⚠️ No coins found, adding fallback coins');
                const fallbackCoins = this._getDefaultCoinsForLevel(currentLevel);
                blocks = [...blocks, ...fallbackCoins];
                console.log(`🪙 Added ${fallbackCoins.length} fallback coins`);
            }

            console.log(`📊 Data source: ${dataSource.toUpperCase()}, Total blocks: ${blocks.length}`);
            this._processBlocks(blocks, precisePhysicsModels);

        } catch (err) {
            console.error('❌ Error loading blocks from URL:', err);
        }
    }

    // Helper method to get default coins for a level
    _getDefaultCoinsForLevel(level) {
        if (level === 1) {
            return [
                {
                    "name": "coin_structure_detailed_lev1",
                    "x": -10,
                    "y": 1,
                    "z": 10,
                    "level": 1,
                    "role": "default",
                    "value": 1
                },
                {
                    "name": "coin_structure_detailed_lev1",
                    "x": 5,
                    "y": 1,
                    "z": 5,
                    "level": 1,
                    "role": "default",
                    "value": 1
                },
                {
                    "name": "coin_structure_detailed_lev1",
                    "x": 25,
                    "y": 1,
                    "z": 38,
                    "level": 1,
                    "role": "default",
                    "value": 1
                },
                {
                    "name": "coin_structure_detailed_lev1",
                    "x": 16,
                    "y": 1,
                    "z": -39,
                    "level": 1,
                    "role": "finalPrize",
                    "value": 5
                }
            ];
        } else {
            return [
                {
                    "name": "coin_structure_detailed_lev2",
                    "x": 25,
                    "y": 1,
                    "z": 38,
                    "level": 2,
                    "role": "default",
                    "value": 1
                },
                {
                    "name": "coin_structure_detailed_lev2",
                    "x": 30,
                    "y": 1,
                    "z": 38,
                    "level": 2,
                    "role": "default",
                    "value": 1
                },
                {
                    "name": "coin_structure_detailed_lev2",
                    "x": 16,
                    "y": 1,
                    "z": -39,
                    "level": 2,
                    "role": "finalPrize",
                    "value": 5
                }
            ];
        }
    }

    // Emergency fallback with basic blocks
    _getEmergencyFallbackBlocks(level) {
        console.log('🚨 Using emergency fallback blocks');
        const coins = this._getDefaultCoinsForLevel(level);
        
        const basicBlocks = [
            {
                "name": level === 1 ? "baked_lev1" : "baked_lev1_lev2",
                "x": 0,
                "y": 0,
                "z": 0,
                "level": level
            }
        ];
        
        return [...basicBlocks, ...coins];
    }

    _processBlocks(blocks, precisePhysicsModels) {
        // Clear previous prizes when loading a new level
        this.prizes = [];
        
        let processedCount = 0;
        let skippedCount = 0;
        let coinCount = 0;
        
        blocks.forEach(block => {
            if (!block.name) {
                console.warn('Bloque sin nombre:', block);
                skippedCount++;
                return;
            }
    
            const resourceKey = block.name;
            const glb = this.resources.items[resourceKey];
    
            if (!glb) {
                console.warn(`Modelo no encontrado: ${resourceKey}`);
                skippedCount++;
                return;
            }
    
            const model = glb.scene.clone();
            model.userData.levelObject = true;
    
            // Eliminar cámaras y luces embebidas
            model.traverse((child) => {
                if (child.isCamera || child.isLight) {
                    child.parent.remove(child);
                }
            });
    
            // 🎯 Manejo de carteles
            const cube = model.getObjectByName('Cylinder001');
            if (cube) {
                const textureLoader = new THREE.TextureLoader();
                const texture = textureLoader.load('/textures/ima1.jpg', () => {
                    texture.encoding = THREE.sRGBEncoding;
                    texture.wrapS = THREE.ClampToEdgeWrapping;
                    texture.wrapT = THREE.ClampToEdgeWrapping;
                    texture.anisotropy = this.experience.renderer.instance.capabilities.getMaxAnisotropy();
                    texture.center.set(0.5, 0.5);
                    texture.rotation = -Math.PI / 2;
                    cube.material = new THREE.MeshBasicMaterial({
                        map: texture,
                        side: THREE.DoubleSide
                    });
                    cube.material.needsUpdate = true;
                });
            }
    
            // 🧵 Integración especial para modelos baked
            if (block.name.includes('baked')) {
                const bakedTexture = new THREE.TextureLoader().load('/textures/baked.jpg');
                bakedTexture.flipY = false;
                bakedTexture.encoding = THREE.sRGBEncoding;
                model.traverse(child => {
                    if (child.isMesh) {
                        child.material = new THREE.MeshBasicMaterial({ map: bakedTexture });
                        child.material.needsUpdate = true;
                        if (child.name.toLowerCase().includes('portal')) {
                            this.experience.time.on('tick', () => {
                                child.rotation.y += 0.01;
                            });
                        }
                    }
                });
            }
            
            // 🎯 Si es un premio (coin)
            if (block.name.startsWith('coin')) {
                const coinValue = block.value !== undefined ? block.value : 1;
                
                console.log(`🪙 Processing coin: ${block.name}, level: ${block.level}, role: ${block.role || "default"}, position: (${block.x}, ${block.y}, ${block.z}), value: ${coinValue}`);
                coinCount++;
                
                const prize = new Prize({
                    model,
                    position: new THREE.Vector3(block.x, block.y, block.z),
                    scene: this.scene,
                    role: block.role || "default",
                    value: coinValue,
                    id: block._id || null,
                    metadata: {
                        level: block.level,
                        name: block.name,
                    }
                });

                prize.model.userData.levelObject = true;

                // Ocultar el coin final hasta que se recojan los default
                if (prize.role === 'finalPrize' && prize.pivot) {
                    prize.pivot.visible = false;
                }

                this.prizes.push(prize);
                processedCount++;
                return;
            }
                
            this.scene.add(model);
            processedCount++;
    
            // Físicas
            let shape;
            let position = new THREE.Vector3();
    
            if (precisePhysicsModels.includes(block.name)) {
                shape = createTrimeshShapeFromModel(model);
                if (!shape) {
                    console.warn(`No se pudo crear Trimesh para ${block.name}`);
                    return;
                }
                position.set(0, 0, 0);
            } else {
                shape = createBoxShapeFromModel(model, 0.9);
                const bbox = new THREE.Box3().setFromObject(model);
                const center = new THREE.Vector3();
                const size = new THREE.Vector3();
                bbox.getCenter(center);
                bbox.getSize(size);
                center.y -= size.y / 2;
                position.copy(center);
            }
    
            const body = new CANNON.Body({
                mass: 0,
                shape: shape,
                position: new CANNON.Vec3(position.x, position.y, position.z),
                material: this.physics.obstacleMaterial
            });
    
            body.userData = { levelObject: true };
            model.userData.physicsBody = body;   
            body.userData.linkedModel = model; 
            this.physics.world.addBody(body);
        });
        
        console.log(`📊 Resumen de carga: Procesados ${processedCount}, Ignorados ${skippedCount}, Monedas ${coinCount}`);
    }
}
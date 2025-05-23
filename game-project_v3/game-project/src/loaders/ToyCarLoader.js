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
        this.debug = false; // Activar para más logs
    }

    async loadFromAPI() {
        try {
            const listRes = await fetch('/config/precisePhysicsModels.json');
            const precisePhysicsModels = await listRes.json();

            // Get the current level
            const currentLevel = this.experience.world.levelManager.currentLevel || 1;
            console.log(`🌟 Loading level ${currentLevel}`);

            let blocks = [];

            try {
                // Try to connect to backend API first
                const backendUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL;
                
                if (!backendUrl) {
                    throw new Error('No backend URL configured');
                }

                // Add level parameter to API URL
                const apiUrl = `${backendUrl}/api/blocks?level=${currentLevel}`;
                console.log(`📡 Fetching blocks from API: ${apiUrl}`);
                
                const res = await fetch(apiUrl);

                if (!res.ok) throw new Error(`API response not ok: ${res.status}`);

                blocks = await res.json();
                console.log(`📦 Blocks for level ${currentLevel} from API: ${blocks.length}`);
                
                // Count and log coins that came from the API
                const coinBlocks = blocks.filter(block => block.name && block.name.startsWith('coin'));
                console.log(`🪙 Found ${coinBlocks.length} coins in API response`);
                
            } catch (apiError) {
                console.warn('⚠️ API connection failed:', apiError.message);
                console.log('📁 Loading from local file: /data/threejs_blocks.blocks.json');
                
                try {
                    const localRes = await fetch('/data/threejs_blocks.blocks.json');
                    
                    if (!localRes.ok) {
                        throw new Error(`Local file not found: ${localRes.status}`);
                    }
                    
                    let allBlocks = await localRes.json();
                    console.log(`📄 Total blocks in local file: ${allBlocks.length}`);
                    
                    // Filter by current level - check both 'level' property and '_lev' suffix in name
                    blocks = allBlocks.filter(block => {
                        // First check if block has explicit level property
                        if (block.level !== undefined) {
                            return block.level === currentLevel;
                        }
                        
                        // If no level property, check the name suffix
                        if (block.name && block.name.includes(`_lev${currentLevel}`)) {
                            return true;
                        }
                        
                        // For level 1, also include blocks without level suffix (backwards compatibility)
                        if (currentLevel === 1 && block.name && !block.name.includes('_lev')) {
                            return true;
                        }
                        
                        return false;
                    });
                    
                    console.log(`📦 Blocks from local file for level ${currentLevel}: ${blocks.length}`);
                    
                    // If no coins found in blocks, add hardcoded fallbacks
                    const coinBlocks = blocks.filter(block => block.name && block.name.startsWith('coin'));
                    if (coinBlocks.length === 0) {
                        console.warn('⚠️ No coins found in local blocks, adding fallback coins');
                        
                        // Use hardcoded fallbacks based on level
                        const fallbackCoins = this._getDefaultCoinsForLevel(currentLevel);
                        
                        console.log(`🪙 Using fallback coins for level ${currentLevel}: ${fallbackCoins.length}`);
                        blocks = [...blocks, ...fallbackCoins];
                    }
                    
                } catch (localError) {
                    console.error('❌ Failed to load local file:', localError.message);
                    
                    // Last resort: use completely hardcoded level data
                    console.log('🆘 Using emergency fallback data');
                    blocks = this._getEmergencyFallbackBlocks(currentLevel);
                }
            }

            this._processBlocks(blocks, precisePhysicsModels);
        } catch (err) {
            console.error('❌ Error loading blocks:', err);
            
            // Emergency fallback
            console.log('🆘 Using emergency fallback data due to critical error');
            const fallbackBlocks = this._getEmergencyFallbackBlocks(1); // Default to level 1
            const precisePhysicsModels = []; // Empty array as fallback
            this._processBlocks(fallbackBlocks, precisePhysicsModels);
        }
    }

    async loadFromURL(apiUrl) {
        try {
            const listRes = await fetch('/config/precisePhysicsModels.json');
            const precisePhysicsModels = await listRes.json();

            // Get the current level
            const currentLevel = this.experience.world.levelManager.currentLevel || 1;
            
            console.log(`🏗️ ToyCarLoader: Loading level ${currentLevel} from URL ${apiUrl}`);
            
            // Add level parameter to the URL if not already there
            const levelUrl = apiUrl.includes('?') 
                ? `${apiUrl}&level=${currentLevel}` 
                : `${apiUrl}?level=${currentLevel}`;

            console.log(`📡 Fetching blocks from URL: ${levelUrl}`);
            
            try {
                const res = await fetch(levelUrl);
                
                if (!res.ok) throw new Error(`API response not ok: ${res.status}`);

                let blocks = await res.json();
                console.log(`📦 Bloques cargados (${blocks.length}) desde ${levelUrl}`);
                
                // Log coins that are already in the API response
                const coinBlocks = blocks.filter(block => block.name && block.name.startsWith('coin'));
                console.log(`🪙 Found ${coinBlocks.length} coins in API response`);
                
                if (coinBlocks.length > 0) {
                    coinBlocks.forEach((coin, index) => {
                        console.log(`  ${index}: ${coin.name} at (${coin.x}, ${coin.y}, ${coin.z}), role: ${coin.role || 'default'}`);
                    });
                } else {
                    console.warn('⚠️ No coins found in API response, adding fallbacks');
                    
                    // Add fallback coins if none found in API response
                    const fallbackCoins = this._getDefaultCoinsForLevel(currentLevel);
                    
                    console.log(`🪙 Using fallback coins for level ${currentLevel}: ${fallbackCoins.length}`);
                    blocks = [...blocks, ...fallbackCoins];
                }
                
                console.log(`📊 Total bloques a procesar: ${blocks.length}`);
                this._processBlocks(blocks, precisePhysicsModels);
                
            } catch (apiError) {
                console.warn('⚠️ API URL failed, falling back to local file:', apiError.message);
                
                // Fallback to loadFromAPI which handles local file loading
                await this.loadFromAPI();
            }
            
        } catch (err) {
            console.error('❌ Error al cargar bloques desde URL:', err);
            
            // Final fallback
            await this.loadFromAPI();
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
                    "role": "default"
                },
                {
                    "name": "coin_structure_detailed_lev1", 
                    "x": 5,
                    "y": 1,
                    "z": 5,
                    "level": 1,
                    "role": "default"
                },
                {
                    "name": "coin_structure_detailed_lev1",
                    "x": 10,
                    "y": 1,
                    "z": -10,
                    "level": 1,
                    "role": "finalPrize"
                }
            ];
        } else if (level === 2) {
            return [
                {
                    "name": "coin_structure_detailed_lev2",
                    "x": -15,
                    "y": 1,
                    "z": 15,
                    "level": 2,
                    "role": "default"
                },
                {
                    "name": "coin_structure_detailed_lev2",
                    "x": 15,
                    "y": 1,
                    "z": 15,
                    "level": 2,
                    "role": "default"
                },
                {
                    "name": "coin_structure_detailed_lev2",
                    "x": 0,
                    "y": 1,
                    "z": -15,
                    "level": 2,
                    "role": "finalPrize"
                }
            ];
        } else {
            // Default fallback for any other level
            return [
                {
                    "name": "coin_structure_detailed_lev1",
                    "x": 0,
                    "y": 1,
                    "z": 0,
                    "level": level,
                    "role": "finalPrize"
                }
            ];
        }
    }

    // Emergency fallback method when everything else fails
    _getEmergencyFallbackBlocks(level) {
        console.log(`🆘 Generating emergency fallback blocks for level ${level}`);
        
        const blocks = [];
        
        // Add some basic road pieces based on level
        if (level === 1) {
            blocks.push(
                {
                    "name": "track-road-wide-straight_lev1",
                    "x": 0,
                    "y": 0,
                    "z": 0,
                    "level": 1
                },
                {
                    "name": "track-road-wide-corner-large_lev1",
                    "x": 10,
                    "y": 0,
                    "z": 0,
                    "level": 1
                }
            );
        } else {
            blocks.push(
                {
                    "name": "road-crossing_lev2",
                    "x": 0,
                    "y": 0,
                    "z": 0,
                    "level": 2
                },
                {
                    "name": "road-curve_lev2",
                    "x": 10,
                    "y": 0,
                    "z": 10,
                    "level": 2
                }
            );
        }
        
        // Add coins
        const coins = this._getDefaultCoinsForLevel(level);
        blocks.push(...coins);
        
        console.log(`🆘 Emergency fallback generated ${blocks.length} blocks`);
        return blocks;
    }

    _processBlocks(blocks, precisePhysicsModels) {
        // Clear previous prizes when loading a new level
        this.prizes = [];
        
        let processedCount = 0;
        let skippedCount = 0;
        let coinCount = 0;
        
        console.log(`🔄 Processing ${blocks.length} blocks...`);
        
        blocks.forEach((block, index) => {
            if (!block.name) {
                console.warn(`Block ${index} missing name:`, block);
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
    
            // 🔵 MARCAR modelo como perteneciente al nivel
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
                console.log('Cartel encontrado:', cube.name);
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
            
            if (block.name.startsWith('coin')) {
                // Extract the value property with fallback to 1
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
                        // Any other properties you want to keep
                    }
                });

                // 🔵 MARCAR modelo del premio
                prize.model.userData.levelObject = true;

                // 🔴 Ocultar el coin final hasta que se recojan los default
                if (prize.role === 'finalPrize' && prize.pivot) {
                    prize.pivot.visible = false;
                }

                this.prizes.push(prize);
                processedCount++;
                return;
            }
                
            // Add model to scene
            model.position.set(block.x || 0, block.y || 0, block.z || 0);
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
                position.set(block.x || 0, block.y || 0, block.z || 0);
            } else {
                shape = createBoxShapeFromModel(model, 0.9);
                const bbox = new THREE.Box3().setFromObject(model);
                const center = new THREE.Vector3();
                const size = new THREE.Vector3();
                bbox.getCenter(center);
                bbox.getSize(size);
                center.y -= size.y / 2;
                position.copy(center);
                // Add block position offset
                position.add(new THREE.Vector3(block.x || 0, block.y || 0, block.z || 0));
            }
    
            const body = new CANNON.Body({
                mass: 0,
                shape: shape,
                position: new CANNON.Vec3(position.x, position.y, position.z),
                material: this.physics.obstacleMaterial
            });
    
            // 🔵 MARCAR cuerpo físico
            body.userData = { levelObject: true };
            model.userData.physicsBody = body;   
            body.userData.linkedModel = model; 
            this.physics.world.addBody(body);
        });
        
        console.log(`📊 Resumen de carga: Procesados ${processedCount}, Ignorados ${skippedCount}, Monedas ${coinCount}`);
        
        if (coinCount === 0) {
            console.warn('⚠️ No coins were processed! Adding emergency coins...');
            const emergencyCoins = this._getDefaultCoinsForLevel(this.experience.world.levelManager.currentLevel || 1);
            this._processBlocks(emergencyCoins, precisePhysicsModels);
        }
    }
}
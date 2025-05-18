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
                // Add level parameter to API URL
                const apiUrl = `${import.meta.env.VITE_API_URL}/api/blocks?level=${currentLevel}`;
                console.log(`📡 Fetching blocks from API: ${apiUrl}`);
                
                const res = await fetch(apiUrl);

                if (!res.ok) throw new Error('Conexión fallida');

                blocks = await res.json();
                console.log(`📦 Blocks for level ${currentLevel}: ${blocks.length}`);
                
                // Count and log coins that came from the API
                const coinBlocks = blocks.filter(block => block.name && block.name.startsWith('coin'));
                console.log(`🪙 Found ${coinBlocks.length} coins in API response`);
                
                // Modify the coin positions here before processing
                // blocks = this._updateCoinPositions(blocks, currentLevel);
                
            } catch (apiError) {
                console.warn('⚠️ API connection failed. Loading from local file...');
                const localRes = await fetch('/data/threejs_blocks.blocks.json');
                let allBlocks = await localRes.json();
                
                // Filter by current level
                blocks = allBlocks.filter(block => block.level === currentLevel);
                console.log(`📦 Blocks from local file for level ${currentLevel}: ${blocks.length}`);
                
                // Modify the coin positions here before processing
                // blocks = this._updateCoinPositions(blocks, currentLevel);
                
                // If no coins found in blocks, add hardcoded fallbacks
                const coinBlocks = blocks.filter(block => block.name && block.name.startsWith('coin'));
                if (coinBlocks.length === 0) {
                    console.warn('⚠️ No coins found in local blocks, adding fallback coins');
                    
                    // Use hardcoded fallbacks based on level
                    const fallbackCoins = this._getDefaultCoinsForLevel(currentLevel);
                    
                    console.log(`🪙 Using fallback coins for level ${currentLevel}: ${fallbackCoins.length}`);
                    blocks = [...blocks, ...fallbackCoins];
                }
            }

            this._processBlocks(blocks, precisePhysicsModels);
        } catch (err) {
            console.error('❌ Error loading blocks:', err);
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
            const res = await fetch(levelUrl);
            
            if (!res.ok) throw new Error(`Conexión fallida al cargar bloques de nivel: ${res.status}`);

            let blocks = await res.json();
            console.log(`📦 Bloques cargados (${blocks.length}) desde ${levelUrl}`);
            
            // Update coin positions before processing
            // blocks = this._updateCoinPositions(blocks, currentLevel);
            
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
            
            if (this.debug) {
                console.log('Sample blocks:', blocks.slice(0, 2));
            }

            // Log the number of level-specific models
            const level1Models = blocks.filter(b => b.name && b.name.includes('_lev1')).length;
            const level2Models = blocks.filter(b => b.name && b.name.includes('_lev2')).length;
            console.log(`📊 Modelos nivel 1: ${level1Models}, Modelos nivel 2: ${level2Models}`);

            // Add additional debug blocks if needed for level 2
            if (currentLevel === 2 && blocks.length < 10) {
                console.warn('⚠️ Muy pocos bloques en nivel 2, añadiendo bloques de debug');
                // Add some debug blocks to level 2
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
            
            // If level 2 and still no blocks with lev2 suffix, add some manually
            if (currentLevel === 2) {
                const level2Blocks = blocks.filter(b => b.name && b.name.includes('_lev2')).length;
                
                if (level2Blocks < 5) {
                    console.warn(`⚠️ Solo ${level2Blocks} bloques de nivel 2 encontrados, añadiendo bloques manuales`);
                    
                    // Add level 2 blocks manually at different positions
                    const manualLevel2Blocks = [
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
                        },
                        {
                            "name": "road-bend-sidewalk_lev2",
                            "x": -10,
                            "y": 0,
                            "z": -10,
                            "level": 2
                        },
                        {
                            "name": "road-crossroad_lev2",
                            "x": -10,
                            "y": 0,
                            "z": 10,
                            "level": 2
                        },
                        {
                            "name": "road-roundabout_lev2",
                            "x": 10,
                            "y": 0,
                            "z": -10,
                            "level": 2
                        }
                    ];
                    
                    blocks = [...blocks, ...manualLevel2Blocks];
                    console.log(`📦 Añadidos ${manualLevel2Blocks.length} bloques manuales para nivel 2`);
                }
            }

            console.log(`📊 Total bloques a procesar: ${blocks.length}`);
            this._processBlocks(blocks, precisePhysicsModels);
        } catch (err) {
            console.error('❌ Error al cargar bloques desde URL:', err);
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
        } else {
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
        }
    }

    // // New method to update coin positions in the blocks array
    // _updateCoinPositions(blocks, level) {
    //     const coinBlocks = blocks.filter(block => block.name && block.name.startsWith('coin'));
    //     console.log(`🛠️ Updating ${coinBlocks.length} coin positions for level ${level}`);
        
    //     if (coinBlocks.length === 0) {
    //         return blocks; // No coins to update
    //     }
        
    //     // Remove existing coins
    //     const nonCoinBlocks = blocks.filter(block => !block.name || !block.name.startsWith('coin'));
        
    //     // Replace with new coins at better positions
    //     const newCoins = this._getDefaultCoinsForLevel(level);
        
    //     console.log(`🪙 Replaced ${coinBlocks.length} coins with ${newCoins.length} new coins at better positions`);
    //     newCoins.forEach((coin, index) => {
    //         console.log(`  ${index}: ${coin.name} at (${coin.x}, ${coin.y}, ${coin.z}), role: ${coin.role || 'default'}`);
    //     });
        
    //     return [...nonCoinBlocks, ...newCoins];
    // }

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
    
            // 🔵 MARCAR cuerpo físico
            body.userData = { levelObject: true };
            model.userData.physicsBody = body;   
            body.userData.linkedModel = model; 
            this.physics.world.addBody(body);
        });
        
        console.log(`📊 Resumen de carga: Procesados ${processedCount}, Ignorados ${skippedCount}, Monedas ${coinCount}`);
    }
}
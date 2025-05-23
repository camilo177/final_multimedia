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
        this.debug = true; // Enable detailed logging
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
                
            } catch (apiError) {
                console.warn('⚠️ API connection failed:', apiError.message);
                console.log('📁 Attempting to load from local file: /data/threejs_blocks.blocks.json');
                
                try {
                    const localRes = await fetch('/data/threejs_blocks.blocks.json');
                    
                    if (!localRes.ok) {
                        console.error(`❌ Local file request failed: ${localRes.status} ${localRes.statusText}`);
                        throw new Error(`Local file not found: ${localRes.status}`);
                    }
                    
                    const rawText = await localRes.text();
                    console.log(`📄 Raw file size: ${rawText.length} characters`);
                    console.log(`📄 First 200 characters:`, rawText.substring(0, 200));
                    
                    let allBlocks;
                    try {
                        allBlocks = JSON.parse(rawText);
                    } catch (parseError) {
                        console.error('❌ JSON parsing failed:', parseError.message);
                        throw parseError;
                    }
                    
                    console.log(`📄 Total blocks in local file: ${allBlocks.length}`);
                    
                    // Debug: Show sample of blocks structure
                    if (allBlocks.length > 0) {
                        console.log('📋 Sample blocks structure:');
                        allBlocks.slice(0, 3).forEach((block, i) => {
                            console.log(`  Block ${i}:`, {
                                name: block.name,
                                level: block.level,
                                x: block.x,
                                y: block.y,
                                z: block.z,
                                role: block.role,
                                hasLevSuffix: block.name ? block.name.includes('_lev') : false
                            });
                        });
                    }
                    
                    // Count by level before filtering
                    const level1Count = allBlocks.filter(block => {
                        return block.level === 1 || 
                               (block.name && block.name.includes('_lev1')) ||
                               (currentLevel === 1 && block.name && !block.name.includes('_lev'));
                    }).length;
                    
                    const level2Count = allBlocks.filter(block => {
                        return block.level === 2 || (block.name && block.name.includes('_lev2'));
                    }).length;
                    
                    console.log(`📊 Available blocks by level: Level 1: ${level1Count}, Level 2: ${level2Count}`);
                    
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
                    
                    // Debug: Show what blocks were selected
                    if (this.debug && blocks.length > 0) {
                        console.log('🔍 Selected blocks for current level:');
                        blocks.slice(0, 5).forEach((block, i) => {
                            console.log(`  ${i}: ${block.name} at (${block.x}, ${block.y}, ${block.z}), level: ${block.level}`);
                        });
                    }
                    
                    // If still no blocks, try less strict filtering
                    if (blocks.length === 0) {
                        console.warn('⚠️ No blocks found with strict filtering, trying relaxed approach...');
                        
                        // For level 1, get ALL blocks that don't have level 2 suffix
                        if (currentLevel === 1) {
                            blocks = allBlocks.filter(block => 
                                !block.name || !block.name.includes('_lev2')
                            );
                        } else {
                            // For level 2, get any blocks with lev2 in name
                            blocks = allBlocks.filter(block => 
                                block.name && block.name.includes('lev2')
                            );
                        }
                        
                        console.log(`📦 Relaxed filtering found ${blocks.length} blocks`);
                    }
                    
                    // Check for coins specifically
                    const coinBlocks = blocks.filter(block => block.name && block.name.startsWith('coin'));
                    console.log(`🪙 Found ${coinBlocks.length} coins in filtered blocks`);
                    
                    if (coinBlocks.length === 0) {
                        console.warn('⚠️ No coins found in local blocks, adding fallback coins');
                        const fallbackCoins = this._getDefaultCoinsForLevel(currentLevel);
                        console.log(`🪙 Using fallback coins for level ${currentLevel}: ${fallbackCoins.length}`);
                        blocks = [...blocks, ...fallbackCoins];
                    }
                    
                } catch (localError) {
                    console.error('❌ Failed to load local file:', localError.message);
                    console.log('🆘 Using emergency fallback data');
                    blocks = this._getEmergencyFallbackBlocks(currentLevel);
                }
            }

            console.log(`🔄 About to process ${blocks.length} blocks total`);
            this._processBlocks(blocks, precisePhysicsModels);
            
        } catch (err) {
            console.error('❌ Critical error in loadFromAPI:', err);
            console.log('🆘 Using emergency fallback data due to critical error');
            const fallbackBlocks = this._getEmergencyFallbackBlocks(1);
            const precisePhysicsModels = [];
            this._processBlocks(fallbackBlocks, precisePhysicsModels);
        }
    }

    async loadFromURL(apiUrl) {
        // This method can still call loadFromAPI as fallback
        try {
            const listRes = await fetch('/config/precisePhysicsModels.json');
            const precisePhysicsModels = await listRes.json();
            const currentLevel = this.experience.world.levelManager.currentLevel || 1;
            
            console.log(`🏗️ ToyCarLoader: Loading level ${currentLevel} from URL ${apiUrl}`);
            
            const levelUrl = apiUrl.includes('?') 
                ? `${apiUrl}&level=${currentLevel}` 
                : `${apiUrl}?level=${currentLevel}`;

            const res = await fetch(levelUrl);
            
            if (!res.ok) throw new Error(`API response not ok: ${res.status}`);

            let blocks = await res.json();
            console.log(`📦 Blocks loaded from URL: ${blocks.length}`);
            
            this._processBlocks(blocks, precisePhysicsModels);
            
        } catch (apiError) {
            console.warn('⚠️ API URL failed, falling back to loadFromAPI:', apiError.message);
            await this.loadFromAPI();
        }
    }

    _getDefaultCoinsForLevel(level) {
        const coinModel = level === 1 ? 'coin_structure_detailed_lev1' : 'coin_structure_detailed_lev2';
        
        if (level === 1) {
            return [
                {
                    "name": coinModel,
                    "x": -10,
                    "y": 1,
                    "z": 10,
                    "level": 1,
                    "role": "default"
                },
                {
                    "name": coinModel, 
                    "x": 10,
                    "y": 1,
                    "z": 10,
                    "level": 1,
                    "role": "default"
                },
                {
                    "name": coinModel,
                    "x": 0,
                    "y": 1,
                    "z": -10,
                    "level": 1,
                    "role": "finalPrize"
                }
            ];
        } else if (level === 2) {
            return [
                {
                    "name": coinModel,
                    "x": -15,
                    "y": 1,
                    "z": 15,
                    "level": 2,
                    "role": "default"
                },
                {
                    "name": coinModel,
                    "x": 15,
                    "y": 1,
                    "z": 15,
                    "level": 2,
                    "role": "default"
                },
                {
                    "name": coinModel,
                    "x": 0,
                    "y": 1,
                    "z": -15,
                    "level": 2,
                    "role": "finalPrize"
                }
            ];
        }
        
        return [{
            "name": "coin_structure_detailed_lev1",
            "x": 0,
            "y": 1,
            "z": 0,
            "level": level,
            "role": "finalPrize"
        }];
    }

    _getEmergencyFallbackBlocks(level) {
        console.log(`🆘 Generating emergency fallback blocks for level ${level}`);
        
        const blocks = [];
        
        // Add some basic environment based on level
        if (level === 1) {
            // Add level 1 blocks if available in resources
            const level1Models = [
                'baked_lev1',
                'palmtree_1_lev1', 
                'barn_lev1',
                'track-road-wide-straight_lev1',
                'track-road-wide-corner-large_lev1'
            ];
            
            level1Models.forEach((modelName, index) => {
                blocks.push({
                    "name": modelName,
                    "x": index * 5,
                    "y": 0,
                    "z": 0,
                    "level": 1
                });
            });
        } else {
            // Add level 2 blocks
            const level2Models = [
                'baked_lev1_lev2',
                'road-crossing_lev2',
                'road-curve_lev2',
                'road-bend-sidewalk_lev2',
                'road-crossroad_lev2'
            ];
            
            level2Models.forEach((modelName, index) => {
                blocks.push({
                    "name": modelName,
                    "x": index * 5,
                    "y": 0,
                    "z": index * 5,
                    "level": 2
                });
            });
        }
        
        // Add coins
        const coins = this._getDefaultCoinsForLevel(level);
        blocks.push(...coins);
        
        console.log(`🆘 Emergency fallback generated ${blocks.length} blocks`);
        return blocks;
    }

    _processBlocks(blocks, precisePhysicsModels) {
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
                if (this.debug) {
                    console.warn(`Modelo no encontrado: ${resourceKey}`);
                }
                skippedCount++;
                return;
            }
    
            const model = glb.scene.clone();
            model.userData.levelObject = true;
    
            // Remove embedded cameras and lights
            model.traverse((child) => {
                if (child.isCamera || child.isLight) {
                    child.parent.remove(child);
                }
            });
    
            // Handle special textures for signs
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
    
            // Handle baked models
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
            
            // Handle coins
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

                if (prize.role === 'finalPrize' && prize.pivot) {
                    prize.pivot.visible = false;
                }

                this.prizes.push(prize);
                processedCount++;
                return;
            }
                
            // Add regular models to scene
            model.position.set(block.x || 0, block.y || 0, block.z || 0);
            this.scene.add(model);
            processedCount++;
    
            // Physics
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
                position.add(new THREE.Vector3(block.x || 0, block.y || 0, block.z || 0));
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
        
        if (coinCount === 0) {
            console.warn('⚠️ No coins were processed! Adding emergency coins...');
            const emergencyCoins = this._getDefaultCoinsForLevel(this.experience.world.levelManager.currentLevel || 1);
            this._processBlocks(emergencyCoins, precisePhysicsModels);
        }
    }
}
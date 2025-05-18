import * as THREE from 'three'
import { gsap } from 'gsap'  

import Environment from './Environment.js'
import Fox from './Fox.js'
import Robot from './Robot.js'
import ToyCarLoader from '../../loaders/ToyCarLoader.js'
import Floor from './Floor.js'
import ThirdPersonCamera from './ThirdPersonCamera.js'
import Sound from './Sound.js'
import AmbientSound from './AmbientSound.js'
import MobileControls from '../../controls/MobileControls.js'
import LevelManager from './LevelManager.js'
import FinalPrizeParticles from '../Utils/FinalPrizeParticles.js'

export default class World {
    constructor(experience) {
        console.log('🌍 Iniciando constructor World')
        this.experience = experience
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.levelManager = new LevelManager(this.experience)

        // Sonidos
        this.coinSound = new Sound('/sounds/coin.ogg')
        this.ambientSound = new AmbientSound('/sounds/ambiente.mp3')
        this.winner = new Sound('/sounds/winner.mp3')
        this.portalSound = new Sound('/sounds/portal.mp3')

        this.allowPrizePickup = false
        this.hasMoved = false
        this.points = 0
        this.totalPoints = 0  // Total points across all levels
        this.totalDefaultCoins = undefined
        this.collectedCoins = 0
        this.portalAnimationId = null
        this.portalEffects = []

        // Coordinates for the circular portal arch from the image
        this.portalPosition = new THREE.Vector3(-15, 1, 6)

        setTimeout(() => {
            this.allowPrizePickup = true
        }, 2000)

        this.resources.on('ready', async () => {
            this.floor = new Floor(this.experience)
            this.environment = new Environment(this.experience)

            this.loader = new ToyCarLoader(this.experience)
            await this.loader.loadFromAPI()

            const modelTypes = ['robotModel', 'foxModel', 'lionModel', 'elephantModel']
            const playerCount = Object.keys(this.experience.socketManager?.players || {}).length || 0
            const modelType = modelTypes[playerCount % modelTypes.length]

            this.robot = new Robot(this.experience, modelType)

            const availableModels = ['robotModel', 'foxModel', 'lionModel', 'elephantModel']
                .filter(model => this.resources.items[model] !== undefined)

                console.log('📋 Available models:', availableModels)

                if (availableModels.length === 0) {
                console.error('❌ No models available! Defaulting to robot')
                this.robot = new Robot(this.experience, 'robotModel')
                } else {
                // For testing, force use the lion model
                const modelType = 'lionModel'  // Change this to test different models
                
                console.log(`🎯 Selecting model: ${modelType}`)
                console.log(`📦 Does it exist?: ${this.resources.items[modelType] ? 'YES' : 'NO'}`)
                
                this.robot = new Robot(this.experience, modelType)
                }


            this.experience.tracker.showCancelButton()
            this.experience.vr.bindCharacter(this.robot)
            this.thirdPersonCamera = new ThirdPersonCamera(this.experience, this.robot.group)

            

            this.mobileControls = new MobileControls({
                onUp: (pressed) => { this.experience.keyboard.keys.up = pressed },
                onDown: (pressed) => { this.experience.keyboard.keys.down = pressed },
                onLeft: (pressed) => { this.experience.keyboard.keys.left = pressed },
                onRight: (pressed) => { this.experience.keyboard.keys.right = pressed }
            })
        })
    }

    toggleAudio() {
        this.ambientSound.toggle()
    }

    update(delta) {
        this.fox?.update()
        this.robot?.update()
        this.blockPrefab?.update()

        if (this.totalDefaultCoins === undefined && this.loader?.prizes?.length) {
            this.totalDefaultCoins = this.loader.prizes.filter(p => p.role === "default").length;
            this.targetPointsForLevel = this.totalDefaultCoins; // How many points needed to complete this level
            console.log(`🎮 Level ${this.levelManager.currentLevel}: ${this.totalDefaultCoins} coins to collect`);
        }

        if (this.thirdPersonCamera && this.experience.isThirdPerson && !this.experience.renderer.instance.xr.isPresenting) {
            this.thirdPersonCamera.update()
        }

        this.loader?.prizes?.forEach(p => p.update(delta))

        if (!this.allowPrizePickup || !this.loader || !this.robot) return

        const pos = this.robot.body.position
        const speed = this.robot.body.velocity.length()
        const moved = speed > 0.5

        this.loader.prizes.forEach((prize, idx) => {
            if (prize.collected || !prize.pivot) return

            const dist = prize.pivot.position.distanceTo(pos)
            if (dist < 1.2 && moved) {
                prize.collect()
                this.loader.prizes.splice(idx, 1)

                if (prize.role === "default") {
                    if (this.points >= this.totalDefaultCoins) {
                        console.warn("⚠️ Intento de aumentar puntos por encima del total")
                        return
                    }
                    this.points++
                    this.totalPoints++  // Increment total points
                    this.collectedCoins++
                    this.robot.points = this.points

                    console.log(`🎯 Monedas recolectadas: ${this.points} / ${this.totalDefaultCoins} (Total: ${this.totalPoints})`)

                    if (this.points === this.totalDefaultCoins) {
                    const finalCoin = this.loader.prizes.find(p => p.role === "finalPrize");
                    
                    if (finalCoin) {
                        // Log the position from the database
                        console.log("🏆 Final prize at database position:",
                                    finalCoin.pivot.position.x,
                                    finalCoin.pivot.position.y,
                                    finalCoin.pivot.position.z);

                        // Make it visible
                        finalCoin.pivot.visible = true;

                        // Create particle effects at the COIN position
                        new FinalPrizeParticles({
                            scene: this.scene,
                            targetPosition: finalCoin.pivot.position.clone(),
                            sourcePosition: this.robot.body.position,
                            experience: this.experience
                        });

                        // Add a light at the coin position
                        const coinLight = new THREE.PointLight(0x00ffff, 2, 10);
                        coinLight.position.copy(finalCoin.pivot.position);
                        this.scene.add(coinLight);
                        this.portalEffects.push(coinLight);

                        // Activate ALL portal effects directly at the coin position
                        this.activatePortalEffects(finalCoin.pivot.position.clone());

                        // Play sound
                        if (window.userInteracted) {
                            this.portalSound.play();
                        }

                        console.log("🌀 Portal activado con efectos centrados en el premio final");
                    }
                }
            }

                if (prize.role === "finalPrize") {
                    console.log("🚪 Coin final recogido.")
                    
                    // Create teleport effect
                    this.createTeleportEffect();

                    // Level transition logic
                    if (this.levelManager.currentLevel < this.levelManager.totalLevels) {
                        setTimeout(() => {
                            try {
                                this.justLoadedLevel = true

                                this.levelManager.nextLevel()
                                const previousPoints = this.points  // Store points from previous level
                                this.points = 0  // Reset level points
                                this.totalDefaultCoins = undefined
                                this.collectedCoins = 0

                                if (this.experience.tracker?.showLevelUpModal) {
                                    this.experience.tracker.showLevelUpModal(this.levelManager.currentLevel, this.totalPoints)
                                }

                                this.robot.points = 0

                                setTimeout(() => {
                                    this.justLoadedLevel = false
                                    console.log("✅ Nivel listo para interacción")
                                }, 5000)

                                setTimeout(() => {
                                    this.isLevelCompletionProcessing = false
                                }, 1000)
                            } catch (error) {
                                console.error('Error en transición de nivel:', error)
                                this.isLevelCompletionProcessing = false
                                this.justLoadedLevel = false
                            }
                        }, 1500)
                    } else {
                        console.log('🏁 Completaste el último nivel, terminando partida...')
                        const elapsed = this.experience.tracker.stop()
                        this.experience.tracker.saveTime(elapsed)
                        this.experience.tracker.showEndGameModal(elapsed)

                        this.experience.obstacleWavesDisabled = true
                        clearTimeout(this.experience.obstacleWaveTimeout)
                        this.experience.raycaster?.removeAllObstacles()
                        if (window.userInteracted) {
                            this.winner.play()
                        }
                    }

                    return
                }

                if (this.experience.raycaster?.removeRandomObstacles) {
                    const reduction = 0.2 + Math.random() * 0.1
                    this.experience.raycaster.removeRandomObstacles(reduction)
                }

                if (window.userInteracted) {
                    this.coinSound.play()
                }

                if (this.experience.menu?.setStatus) {
                    this.experience.menu.setStatus(`🎖️ Puntos: ${this.totalPoints}`)
                }
            }
        })
    }

    // Method to add visual effects to the portal
    activatePortalEffects(position, portalObject = null) {
        // 1. Create a pulsing light at the portal
        const portalLight = new THREE.PointLight(0x00ffff, 2, 10)
        portalLight.position.copy(position)
        portalLight.position.y += 1
        this.scene.add(portalLight)
        this.portalEffects.push(portalLight)

        // 2. Create flowing particles from player to portal
        new FinalPrizeParticles({
            scene: this.scene,
            targetPosition: position.clone(),
            sourcePosition: this.robot.body.position,
            experience: this.experience
        })

        // 3. Add a portal ring if no portalObject was found
        if (!portalObject) {
            const portalRingGeometry = new THREE.TorusGeometry(1.5, 0.2, 16, 32)
            const portalRingMaterial = new THREE.MeshStandardMaterial({
                color: 0x00ffff,
                emissive: 0x00ffff,
                emissiveIntensity: 1,
                transparent: true,
                opacity: 0.7
            })
            
            const portalRing = new THREE.Mesh(portalRingGeometry, portalRingMaterial)
            portalRing.position.copy(position)
            portalRing.position.y += 0.5
            portalRing.rotation.x = Math.PI / 2
            this.scene.add(portalRing)
            this.portalEffects.push(portalRing)
            
            // Store for animation
            portalObject = portalRing
        }
        
        // 4. Add additional particle effect at the portal
        const portalParticleGeometry = new THREE.BufferGeometry()
        const particleCount = 50
        const particlePositions = new Float32Array(particleCount * 3)
        
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3
            const angle = Math.random() * Math.PI * 2
            const radius = 1 + Math.random() * 0.5
            
            particlePositions[i3] = position.x + Math.cos(angle) * radius
            particlePositions[i3 + 1] = position.y + 0.5 + Math.random() * 1
            particlePositions[i3 + 2] = position.z + Math.sin(angle) * radius
        }
        
        portalParticleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
        
        const portalParticleMaterial = new THREE.PointsMaterial({
            color: 0x00ffff,
            size: 0.1,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending
        })
        
        const portalParticles = new THREE.Points(portalParticleGeometry, portalParticleMaterial)
        this.scene.add(portalParticles)
        this.portalEffects.push(portalParticles)
        
        // 5. Set up animations
        if (portalObject) {
            // Store original scale if it exists
            const originalScale = portalObject.scale.clone()
            
            // Start animation
            this.portalAnimationId = setInterval(() => {
                // Animate portal object
                if (portalObject) {
                    const pulseFactor = 1 + Math.sin(Date.now() * 0.003) * 0.1
                    portalObject.scale.set(
                        originalScale.x * pulseFactor,
                        originalScale.y * pulseFactor,
                        originalScale.z * pulseFactor
                    )
                    
                    if (portalObject.rotation) {
                        portalObject.rotation.z += 0.01
                    }
                }
                
                // Animate light
                if (portalLight) {
                    portalLight.intensity = 1.5 + Math.sin(Date.now() * 0.005) * 0.5
                }
                
                // Animate particles
                if (portalParticles) {
                    const positions = portalParticles.geometry.attributes.position.array
                    for (let i = 0; i < particleCount; i++) {
                        const i3 = i * 3
                        const x = positions[i3] - position.x
                        const z = positions[i3 + 2] - position.z
                        
                        const angle = Math.atan2(z, x) + 0.01
                        const radius = Math.sqrt(x*x + z*z)
                        
                        positions[i3] = position.x + Math.cos(angle) * radius
                        positions[i3 + 2] = position.z + Math.sin(angle) * radius
                        positions[i3 + 1] += 0.01
                        
                        // Reset particles that go too high
                        if (positions[i3 + 1] > position.y + 2) {
                            positions[i3 + 1] = position.y + 0.5
                        }
                    }
                    portalParticles.geometry.attributes.position.needsUpdate = true
                }
            }, 16)
        }
        
        // 6. Play portal sound
        if (window.userInteracted) {
            this.portalSound.play()
        }
        
        console.log("🌀 Portal activado con efectos visuales")
    }
    
    // Method to create teleport effect when collecting final prize
    createTeleportEffect() {
        // Use the portal position for the teleport effect
        let teleportPosition = this.portalPosition.clone();
        
        // Create flash effect at player position
        const flashLight = new THREE.PointLight(0xffffff, 8, 15)
        flashLight.position.copy(this.robot.group.position)
        flashLight.position.y += 1
        this.scene.add(flashLight)
        
        // Create expanding ring effect
        const ringGeometry = new THREE.RingGeometry(0.1, 0.2, 32)
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        })
        
        const ring = new THREE.Mesh(ringGeometry, ringMaterial)
        ring.position.copy(this.robot.group.position)
        ring.position.y += 0.1
        ring.rotation.x = Math.PI / 2
        this.scene.add(ring)
        
        // Play teleport sound
        if (window.userInteracted) {
            this.portalSound.currentTime = 0
            this.portalSound.volume = 1
            this.portalSound.play()
        }
        
        // Temporary disable controls
        const originalState = { 
            up: this.experience.keyboard.keys.up,
            down: this.experience.keyboard.keys.down,
            left: this.experience.keyboard.keys.left,
            right: this.experience.keyboard.keys.right,
            space: this.experience.keyboard.keys.space
        }
        
        Object.keys(this.experience.keyboard.keys).forEach(key => {
            this.experience.keyboard.keys[key] = false
        })
        
        // Animate the effects
        gsap.to(flashLight, {
            intensity: 0,
            duration: 1.2,
            onComplete: () => {
                this.scene.remove(flashLight)
            }
        })
        
        gsap.to(ring.scale, {
            x: 20,
            y: 20,
            z: 1,
            duration: 1,
            ease: "power1.out",
            onComplete: () => {
                this.scene.remove(ring)
            }
        })
        
        gsap.to(ring.material, {
            opacity: 0,
            duration: 1,
        })
        
        // Restore controls after animation
        setTimeout(() => {
            Object.keys(originalState).forEach(key => {
                this.experience.keyboard.keys[key] = originalState[key]
            })
        }, 1500)
    }

    async loadLevel(level) {
        try {
            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
            const apiUrl = `${backendUrl}/api/blocks?level=${level}`
            await this.loader.loadFromURL(apiUrl)
            console.log(`✅ Nivel ${level} cargado.`)
            
            // Update level display in HUD
            if (this.experience.menu) {
                this.experience.menu.setLevel(level)
            }
            
        } catch (error) {
            console.error('❌ Error cargando nivel:', error)
        }
    }

    clearCurrentScene() {
        if (!this.experience || !this.scene) {
            console.warn('⚠️ No se puede limpiar: experience o escena destruida.')
            return
        }

        // Stop portal animations
        if (this.portalAnimationId) {
            clearInterval(this.portalAnimationId)
            this.portalAnimationId = null
        }
        
        // Remove portal effects
        this.portalEffects.forEach(effect => {
            if (effect) {
                this.scene.remove(effect)
                if (effect.geometry) effect.geometry.dispose()
                if (effect.material) {
                    if (Array.isArray(effect.material)) {
                        effect.material.forEach(mat => mat.dispose())
                    } else {
                        effect.material.dispose()
                    }
                }
            }
        })
        this.portalEffects = []

        let visualObjectsRemoved = 0
        let physicsBodiesRemoved = 0

        const childrenToRemove = []
        this.scene.children.forEach((child) => {
            if (child.userData && child.userData.levelObject) {
                childrenToRemove.push(child)
            }
        })

        childrenToRemove.forEach((child) => {
            if (child.geometry) child.geometry.dispose()
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose())
                } else {
                    child.material.dispose()
                }
            }
            this.scene.remove(child)
            if (child.userData.physicsBody) {
                this.experience.physics.world.removeBody(child.userData.physicsBody)
            }
            visualObjectsRemoved++
        })

        let physicsBodiesRemaining = -1

        if (
            this.experience.physics &&
            this.experience.physics.world &&
            Array.isArray(this.experience.physics.bodies) &&
            this.experience.physics.bodies.length > 0
        ) {
            const survivingBodies = []
            let bodiesBefore = this.experience.physics.bodies.length

            this.experience.physics.bodies.forEach((body) => {
                if (body.userData && body.userData.levelObject) {
                    this.experience.physics.world.removeBody(body)
                    physicsBodiesRemoved++
                } else {
                    survivingBodies.push(body)
                }
            })

            this.experience.physics.bodies = survivingBodies

            console.log(`🧹 Physics Cleanup Report:`)
            console.log(`✅ Cuerpos físicos eliminados: ${physicsBodiesRemoved}`)
            console.log(`🎯 Cuerpos físicos sobrevivientes: ${survivingBodies.length}`)
            console.log(`📦 Estado inicial: ${bodiesBefore} cuerpos → Estado final: ${survivingBodies.length} cuerpos`)
        } else {
            console.warn('⚠️ Physics system no disponible o sin cuerpos activos, omitiendo limpieza física.')
        }

        console.log(`🧹 Escena limpiada antes de cargar el nuevo nivel.`)
        console.log(`✅ Objetos 3D eliminados: ${visualObjectsRemoved}`)
        console.log(`✅ Cuerpos físicos eliminados: ${physicsBodiesRemoved}`)
        console.log(`🎯 Objetos 3D actuales en escena: ${this.scene.children.length}`)

        if (this.loader && this.loader.prizes.length > 0) {
            this.loader.prizes.forEach(prize => {
                if (prize.model) {
                    this.scene.remove(prize.model)
                    if (prize.model.geometry) prize.model.geometry.dispose()
                    if (prize.model.material) {
                        if (Array.isArray(prize.model.material)) {
                            prize.model.material.forEach(mat => mat.dispose())
                        } else {
                            prize.model.material.dispose()
                        }
                    }
                }
            })
            this.loader.prizes = []
            console.log('🎯 Premios del nivel anterior eliminados correctamente.')
        }
    }
}
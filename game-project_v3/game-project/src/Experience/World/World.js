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
import ImageCharacter from './ImageCharacter.js'

export default class World {
    constructor(experience) {
        console.log('🌍 Iniciando constructor World')
        this.experience = experience
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.levelManager = new LevelManager(this.experience)

        this.coinSound = new Sound('/sounds/coin.ogg')
        this.ambientSound = new AmbientSound('/sounds/ambiente.mp3')
        this.winner = new Sound('/sounds/winner.mp3')
        this.portalSound = new Sound('/sounds/portal.mp3')

        this.allowPrizePickup = false
        this.hasMoved = false
        this.points = 0
        this.totalPoints = 0
        this.totalDefaultCoins = undefined
        this.collectedCoins = 0
        this.portalAnimationId = null
        this.portalEffects = []

        this.portalPosition = new THREE.Vector3(-15, 1, 6)

        setTimeout(() => {
            this.allowPrizePickup = true
        }, 2000)

        this.resources.on('ready', async () => {
            this.floor = new Floor(this.experience)
            this.environment = new Environment(this.experience)

            this.loader = new ToyCarLoader(this.experience)
            await this.loader.loadFromAPI()

            const modelTypes = ['robotModel', 'foxModel', 'image2Model']
            const playerCount = Object.keys(this.experience.socketManager?.players || {}).length || 0
            const myModelKey = modelTypes[playerCount % modelTypes.length]

            this.robot = new ImageCharacter(this.experience, myModelKey)
            this.remotePlayers = {}

            this.experience.socketManager?.onPlayerJoined((id, modelType) => {
                if (id !== this.experience.socketManager.socket.id) {
                    this.remotePlayers[id] = new ImageCharacter(this.experience, modelType)
                }
            })

            this.experience.socketManager?.onPlayerTransform((id, position, rotation) => {
                const player = this.remotePlayers[id]
                if (player) {
                    player.group.position.set(position.x, position.y, position.z)
                    player.group.rotation.y = rotation
                }
            })

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

        for (const id in this.remotePlayers) {
            this.remotePlayers[id].update()
        }

        if (this.totalDefaultCoins === undefined && this.loader?.prizes?.length) {
            this.totalDefaultCoins = this.loader.prizes.filter(p => p.role === "default").length;
            this.targetPointsForLevel = this.totalDefaultCoins;
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
                    if (this.points >= this.totalDefaultCoins) return
                    this.points++
                    this.totalPoints++
                    this.collectedCoins++
                    this.robot.points = this.points

                    if (this.points === this.totalDefaultCoins) {
                        const finalCoin = this.loader.prizes.find(p => p.role === "finalPrize")
                        if (finalCoin) {
                            finalCoin.pivot.visible = true
                            new FinalPrizeParticles({
                                scene: this.scene,
                                targetPosition: finalCoin.pivot.position.clone(),
                                sourcePosition: this.robot.body.position,
                                experience: this.experience
                            })
                            const coinLight = new THREE.PointLight(0x00ffff, 2, 10)
                            coinLight.position.copy(finalCoin.pivot.position)
                            this.scene.add(coinLight)
                            this.portalEffects.push(coinLight)
                            this.activatePortalEffects(finalCoin.pivot.position.clone())
                            if (window.userInteracted) this.portalSound.play()
                        }
                    }
                }

                if (prize.role === "finalPrize") {
                    this.createTeleportEffect()
                    if (this.levelManager.currentLevel < this.levelManager.totalLevels) {
                        setTimeout(() => {
                            this.levelManager.nextLevel()
                            this.points = 0
                            this.totalDefaultCoins = undefined
                            this.collectedCoins = 0
                            this.robot.points = 0
                            if (this.experience.tracker?.showLevelUpModal) {
                                this.experience.tracker.showLevelUpModal(this.levelManager.currentLevel, this.totalPoints)
                            }
                        }, 1500)
                    } else {
                        const elapsed = this.experience.tracker.stop()
                        this.experience.tracker.saveTime(elapsed)
                        this.experience.tracker.showEndGameModal(elapsed)
                        if (window.userInteracted) this.winner.play()
                    }
                    return
                }

                if (this.experience.raycaster?.removeRandomObstacles) {
                    const reduction = 0.2 + Math.random() * 0.1
                    this.experience.raycaster.removeRandomObstacles(reduction)
                }

                if (window.userInteracted) this.coinSound.play()

                if (this.experience.menu?.setStatus) {
                    this.experience.menu.setStatus(`🎖️ Puntos: ${this.totalPoints}`)
                }
            }
        })
    }

    async loadLevel(level) {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
        const apiUrl = `${backendUrl}/api/blocks?level=${level}`
        await this.loader.loadFromURL(apiUrl)
        if (this.experience.menu) this.experience.menu.setLevel(level)
    }

    clearCurrentScene() {
        if (!this.experience || !this.scene) {
            console.warn('⚠️ No se puede limpiar: experience o escena destruida.')
            return
        }

        if (this.portalAnimationId) {
            clearInterval(this.portalAnimationId)
            this.portalAnimationId = null
        }

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

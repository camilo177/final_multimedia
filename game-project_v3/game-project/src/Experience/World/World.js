import * as THREE from 'three'

import Environment from './Environment.js'
import Fox from './Fox.js'
import Robot from './Robot.js'
import ToyCarLoader from '../../loaders/ToyCarLoader.js'
import Floor from './Floor.js'
import ThirdPersonCamera from './ThirdPersonCamera.js'
import Sound from './Sound.js'
import AmbientSound from './AmbientSound.js'
import MobileControls from '../../controls/MobileControls.js'
import LevelManager from './LevelManager.js';
import FinalPrizeParticles from '../Utils/FinalPrizeParticles.js'

export default class World {
    constructor(experience) {
        this.experience = experience
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.levelManager = new LevelManager(this.experience);

        // Sonidos
        this.coinSound = new Sound('/sounds/coin.ogg')
        this.ambientSound = new AmbientSound('/sounds/ambiente.mp3')
        this.winner = new Sound('/sounds/winner.mp3')
        this.portalSound = new Sound('/sounds/portal.mp3')

        this.allowPrizePickup = false
        this.hasMoved = false


        // Permitimos recoger premios tras 2s
        setTimeout(() => {
            this.allowPrizePickup = true
            // console.log('✅ Ahora se pueden recoger premios')
        }, 2000)

        // Cuando todo esté cargado...
        this.resources.on('ready', async () => {
            // 1️⃣ Mundo base
            this.floor = new Floor(this.experience)
            this.environment = new Environment(this.experience)

            this.loader = new ToyCarLoader(this.experience)
            await this.loader.loadFromAPI()

            // 2️⃣ Personajes
            this.fox = new Fox(this.experience)
            this.robot = new Robot(this.experience)


            this.experience.tracker.showCancelButton()
            //Registrando experiencia VR con el robot
            this.experience.vr.bindCharacter(this.robot)
            this.thirdPersonCamera = new ThirdPersonCamera(this.experience, this.robot.group)

            // 3️⃣ Cámara
            this.thirdPersonCamera = new ThirdPersonCamera(this.experience, this.robot.group)

            // 4️⃣ Controles móviles (tras crear robot)
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
        // Actualiza personajes y cámara
        this.fox?.update()
        this.robot?.update()
        this.blockPrefab?.update()

        // 🟡 Inicializar una vez el número de coins "default"
        if (this.totalDefaultCoins === undefined && this.loader?.prizes?.length) {
            this.totalDefaultCoins = this.loader.prizes.filter(p => p.role === "default").length
        }


        if (this.thirdPersonCamera && this.experience.isThirdPerson && !this.experience.renderer.instance.xr.isPresenting) {
            this.thirdPersonCamera.update()
        }

        // Gira premios
        this.loader?.prizes?.forEach(p => p.update(delta))


        // Lógica de recogida
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
                    // ✅ Incrementar puntos
                    this.points = (this.points || 0) + 1
                    this.robot.points = this.points

                    const pointsTarget = this.levelManager.getCurrentLevelTargetPoints()
                    console.log(`🎯 Monedas recolectadas: ${this.points} / ${pointsTarget}`)

                    // 🟡 Hacer visible el coin final cuando se recojan todos los 'default'
                    if (this.points === this.totalDefaultCoins) {
                        const finalCoin = this.loader.prizes.find(p => p.role === "finalPrize")
                        if (finalCoin) {
                            finalCoin.pivot.visible = true
                            // 🌀 Efecto de partículas
                            new FinalPrizeParticles({
                                scene: this.scene,
                                targetPosition: finalCoin.pivot.position,
                                sourcePosition: this.robot.body.position,
                                experience: this.experience
                            })

                            // Reproducir sonido de portal
                            if (window.userInteracted) {
                                this.portalSound.play()
                            }
                            console.log("🪙 Coin final ahora visible.")
                        }
                    }
                }

                // 🟢 Coin final recogido → cambiar nivel directamente
                if (prize.role === "finalPrize") {
                    console.log("🚪 Coin final recogido. Pasando al siguiente nivel...")
                    this.levelManager.nextLevel()
                    this.points = 0
                    this.robot.points = 0
                    return
                }

                const pointsTarget = this.levelManager.getCurrentLevelTargetPoints(); // 📈 Nivel actual

                console.log(`🎯 Monedas recolectadas: ${this.points} / ${pointsTarget}`);


                // 🧹 Limpiar obstáculos
                if (this.experience.raycaster?.removeRandomObstacles) {
                    const reduction = 0.2 + Math.random() * 0.1
                    this.experience.raycaster.removeRandomObstacles(reduction)
                }

                if (window.userInteracted) {
                    this.coinSound.play()
                }
                this.experience.menu.setStatus?.(`🎖️ Puntos: ${this.points}`)
                // console.log(`🟡 Premio recogido. Total: ${this.points}`)
            }
        })

        // ✅ Evaluar fuera del bucle de premios
        if (this.points === 2 && !this.experience.tracker.finished) {
            if (this.levelManager.currentLevel < this.levelManager.totalLevels) {
                console.log("✅ Completaste el nivel, pasando al siguiente...");

                if (!this.experience.tracker.finished) { // 🔵 AGREGAR ESTE CONTROL
                    this.levelManager.nextLevel();
                    this.points = 0;
                    this.robot.points = 0;
                }

                return; // 🔥 Importantísimo detener el flujo aquí
            } else {
                console.log('🏁 Completaste el último nivel, terminando partida...');
                const elapsed = this.experience.tracker.stop();
                this.experience.tracker.saveTime(elapsed);
                this.experience.tracker.showEndGameModal(elapsed);

                this.experience.obstacleWavesDisabled = true;
                clearTimeout(this.experience.obstacleWaveTimeout);
                this.experience.raycaster?.removeAllObstacles();
                if (window.userInteracted) {
                    this.winner.play();
                }
            }
        }
    }

    async loadLevel(level) {
        try {
            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
            const apiUrl = `${backendUrl}/api/blocks?level=${level}`;

            // 🔵 Usar el nuevo método de ToyCarLoader
            await this.loader.loadFromURL(apiUrl);

            console.log(`✅ Nivel ${level} cargado.`);
        } catch (error) {
            console.error('❌ Error cargando nivel:', error);
        }
    }

    clearCurrentScene() {
        if (!this.experience || !this.scene) {
            console.warn('⚠️ No se puede limpiar: experience o escena destruida.');
            return;
        }

        let visualObjectsRemoved = 0;
        let physicsBodiesRemoved = 0;

        // 🔵 Limpiar objetos visuales (Three.js)
        const childrenToRemove = [];

        this.scene.children.forEach((child) => {
            if (child.userData && child.userData.levelObject) {
                childrenToRemove.push(child);
            }
        });

        childrenToRemove.forEach((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose());
                } else {
                    child.material.dispose();
                }
            }

            this.scene.remove(child); // 🔵 Primero limpiar la escena

            if (child.userData.physicsBody) {
                this.experience.physics.world.removeBody(child.userData.physicsBody); // 🔵 Luego limpiar la física
            }

            visualObjectsRemoved++;
        });



        let physicsBodiesRemaining = -1;

        // 🔵 Limpiar cuerpos físicos de Cannon-es
        if (this.experience.physics
            && this.experience.physics.world
            && Array.isArray(this.experience.physics.bodies)
            && this.experience.physics.bodies.length > 0) { // 🔥 Nuevo filtro aquí
        
            const survivingBodies = [];
            let bodiesBefore = this.experience.physics.bodies.length;
        
            this.experience.physics.bodies.forEach((body) => {
                if (body.userData && body.userData.levelObject) {
                    this.experience.physics.world.removeBody(body);
                    physicsBodiesRemoved++;
                } else {
                    survivingBodies.push(body);
                }
            });
        
            this.experience.physics.bodies = survivingBodies;
        
            console.log(`🧹 Physics Cleanup Report:`);
            console.log(`✅ Cuerpos físicos eliminados: ${physicsBodiesRemoved}`);
            console.log(`🎯 Cuerpos físicos sobrevivientes: ${survivingBodies.length}`);
            console.log(`📦 Estado inicial: ${bodiesBefore} cuerpos → Estado final: ${survivingBodies.length} cuerpos`);
        } else {
            console.warn('⚠️ Physics system no disponible o sin cuerpos activos, omitiendo limpieza física.');
        }
        



        console.log(`🧹 Escena limpiada antes de cargar el nuevo nivel.`);
        console.log(`✅ Objetos 3D eliminados: ${visualObjectsRemoved}`);
        console.log(`✅ Cuerpos físicos eliminados: ${physicsBodiesRemoved}`);
        console.log(`🎯 Objetos 3D actuales en escena: ${this.scene.children.length}`);

        if (physicsBodiesRemaining !== -1) {
            console.log(`🎯 Cuerpos físicos actuales en Physics World: ${physicsBodiesRemaining}`);
        }

        if (this.loader && this.loader.prizes.length > 0) {
            this.loader.prizes.forEach(prize => {
                if (prize.model) {
                    this.scene.remove(prize.model);
                    if (prize.model.geometry) prize.model.geometry.dispose();
                    if (prize.model.material) {
                        if (Array.isArray(prize.model.material)) {
                            prize.model.material.forEach(mat => mat.dispose());
                        } else {
                            prize.model.material.dispose();
                        }
                    }
                }
            });
            this.loader.prizes = []; // 🔵 Limpiar lista de premios
            console.log('🎯 Premios del nivel anterior eliminados correctamente.');
        }


    }



}

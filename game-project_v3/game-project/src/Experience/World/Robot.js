// Modified Robot.js with enhanced lion animation
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import Sound from './Sound.js'

export default class Robot {
    constructor(experience, modelType = 'robotModel') {
        this.experience = experience
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.time = this.experience.time
        this.physics = this.experience.physics
        this.keyboard = this.experience.keyboard
        this.debug = this.experience.debug
        this.points = 0
        this.modelType = modelType // 'robotModel', 'foxModel', 'lionModel', 'elephantModel'
        
        // Special animation properties for lion
        this.isLion = modelType === 'lionModel'
        this.legAnimOffset = 0
        this.walkingTime = 0
        this.lionLegs = []
        this.useLegBobbing = false
        
        this.setModel()
        this.setSounds()
        this.setPhysics()
        this.setAnimation()
    }

    setModel() {
        // Load the appropriate model based on modelType
        if (!this.resources.items[this.modelType]) {
            console.warn(`Model ${this.modelType} not found, falling back to robotModel`)
            this.modelType = 'robotModel'
        }

        this.model = this.resources.items[this.modelType].scene.clone()
        
        // Apply different scaling depending on the model type
        switch(this.modelType) {
            case 'foxModel':
                this.model.scale.set(0.02, 0.02, 0.02)
                break
            case 'robotModel':
                this.model.scale.set(0.3, 0.3, 0.3)
                break
            case 'lionModel':
                this.model.scale.set(0.2, 0.2, 0.2)
                // Find potential leg bones for lion
                this.findLionLimbs()
                break
            case 'elephantModel':
                this.model.scale.set(0.2, 0.2, 0.2)
                break
            default:
                this.model.scale.set(0.3, 0.3, 0.3)
        }
        
        this.model.position.set(0, -0.1, 0) // Centrar respecto al cuerpo físico

        this.group = new THREE.Group()
        this.group.add(this.model)
        this.scene.add(this.group)

        // Add player name above model
        if (this.experience.socketManager?.socket) {
            const playerId = this.experience.socketManager.socket.id
            this.addPlayerLabel(playerId)
        }

        this.model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true
            }
        })
    }
    
    // Method to find lion limbs for custom animation
    findLionLimbs() {
        this.lionLegs = []
        this.lionTail = null
        this.lionHead = null
        
        // Check if the model has bones or skeleton
        let hasFoundSkeleton = false
        
        this.model.traverse((child) => {
            // First approach: look for skeleton/bones
            if (child.isBone || child.type === 'Bone') {
                hasFoundSkeleton = true
                const name = child.name.toLowerCase()
                
                if (name.includes('leg') || name.includes('paw') || name.includes('foot')) {
                    console.log(`🦁 Found lion leg bone: ${child.name}`)
                    this.lionLegs.push(child)
                } 
                else if (name.includes('tail')) {
                    console.log(`🦁 Found lion tail bone: ${child.name}`)
                    this.lionTail = child
                }
                else if (name.includes('head')) {
                    console.log(`🦁 Found lion head bone: ${child.name}`)
                    this.lionHead = child
                }
            }
        })
        
        // If no skeleton found, use meshes as a fallback
        if (!hasFoundSkeleton) {
            console.log("🦁 No skeleton found for lion, using meshes")
            this.model.traverse((child) => {
                if (child.isMesh) {
                    const name = child.name.toLowerCase()
                    
                    if (name.includes('leg') || name.includes('paw') || name.includes('foot')) {
                        console.log(`🦁 Found lion leg mesh: ${child.name}`)
                        this.lionLegs.push(child)
                    } 
                    else if (name.includes('tail')) {
                        console.log(`🦁 Found lion tail mesh: ${child.name}`)
                        this.lionTail = child
                    }
                    else if (name.includes('head')) {
                        console.log(`🦁 Found lion head mesh: ${child.name}`)
                        this.lionHead = child
                    }
                }
            })
        }
        
        // As a last resort, if still no limbs found, use vertical bobbing animation
        if (this.lionLegs.length === 0) {
            console.log("🦁 No specific lion limbs found, will use vertical bobbing")
            this.useLegBobbing = true
        }
    }

    // Hash string to float between 0-1 for consistent colors
    hashStringToFloat(str) {
        let hash = 0
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i)
            hash |= 0
        }
        // Normalize to 0-1 range
        return (hash & 0xFFFFFFFF) / 0xFFFFFFFF
    }

    addPlayerLabel(playerId) {
        // Create a text sprite to display above the model
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        canvas.width = 256
        canvas.height = 64
        
        context.font = 'Bold 24px Arial'
        context.fillStyle = 'white'
        context.textAlign = 'center'
        
        // Show a shortened version of the ID
        const shortId = playerId ? playerId.substring(0, 6) : 'Player'
        
        // Add model type emoji
        let emoji = '🤖' // Default robot
        if (this.modelType === 'foxModel') emoji = '🦊'
        if (this.modelType === 'lionModel') emoji = '🦁'
        if (this.modelType === 'elephantModel') emoji = '🐘'
        
        context.fillText(`${emoji} ${shortId}`, canvas.width / 2, 24)
        
        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas)
        
        // Create sprite material
        const spriteMaterial = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true,
            depthTest: false
        })
        
        // Create sprite
        const sprite = new THREE.Sprite(spriteMaterial)
        sprite.scale.set(1, 0.25, 1)
        sprite.position.y = 1.5 // Position above model
        
        this.group.add(sprite)
        this.nameSprite = sprite
    }

    setPhysics() {
        const shape = new CANNON.Sphere(0.4)

        this.body = new CANNON.Body({
            mass: 2,
            shape: shape,
            position: new CANNON.Vec3(0, 1.2, 0),
            linearDamping: 0.05,
            angularDamping: 0.9
        })

        this.body.angularFactor.set(0, 1, 0)

        // Estabilización inicial
        this.body.velocity.setZero()
        this.body.angularVelocity.setZero()
        this.body.sleep()
        this.body.material = this.physics.robotMaterial

        this.physics.world.addBody(this.body)
        
        // Activar cuerpo después de que el mundo haya dado al menos un paso de simulación
        setTimeout(() => {
            this.body.wakeUp()
        }, 100) // 100 ms ≈ 6 pasos de simulación si step = 1/60
    }

    setSounds() {
        this.walkSound = new Sound('/sounds/robot/walking.mp3', { loop: true, volume: 0.5 })
        this.jumpSound = new Sound('/sounds/robot/jump.mp3', { volume: 0.8 })
    }

    setAnimation() {
        this.animation = {}
        this.animation.mixer = new THREE.AnimationMixer(this.model)
        this.animation.actions = {}
        
        // Get model resource and its animations
        const modelData = this.resources.items[this.modelType]
        const animations = modelData?.animations || []
        
        console.log(`🎬 Setting up animations for ${this.modelType}. Found ${animations.length} animations.`)
        
        // Create a default animation if none exist
        if (animations.length === 0) {
            console.warn(`⚠️ No animations found for ${this.modelType}, creating dummy animation.`)
            
            // Create a dummy animation that slightly moves the model up and down
            const times = [0, 1, 2]  // keyframe times
            const values = [0, 0.05, 0]  // slight up and down movement
            
            // Create a position track
            const positionTrack = new THREE.NumberKeyframeTrack(
                '.position[y]',  // property to animate
                times,           // keyframe times
                values           // values at those times
            )
            
            // Create an animation clip with the track
            const dummyClip = new THREE.AnimationClip('idle', 2, [positionTrack])
            
            // Create actions from the dummy clip
            this.animation.actions.idle = this.animation.mixer.clipAction(dummyClip)
            this.animation.actions.walking = this.animation.mixer.clipAction(dummyClip)
            this.animation.actions.jump = this.animation.mixer.clipAction(dummyClip)
        } 
        else {
            try {
                // Handle specific model types
                if (this.modelType === 'robotModel') {
                    this.animation.actions.idle = this.animation.mixer.clipAction(animations[2] || animations[0])
                    this.animation.actions.walking = this.animation.mixer.clipAction(animations[10] || animations[0])
                    this.animation.actions.jump = this.animation.mixer.clipAction(animations[3] || animations[0])
                } 
                else if (this.modelType === 'foxModel') {
                    this.animation.actions.idle = this.animation.mixer.clipAction(animations[0])
                    this.animation.actions.walking = this.animation.mixer.clipAction(animations[1] || animations[0])
                    this.animation.actions.jump = this.animation.mixer.clipAction(animations[2] || animations[0])
                }
                else {
                    // Generic handling for any model
                    console.log(`⚡ Using generic animation setup for ${this.modelType}`)
                    // Use the first animation for all actions
                    const defaultAnim = animations[0]
                    this.animation.actions.idle = this.animation.mixer.clipAction(defaultAnim)
                    this.animation.actions.walking = animations[1] ? 
                        this.animation.mixer.clipAction(animations[1]) : 
                        this.animation.mixer.clipAction(defaultAnim)
                    this.animation.actions.jump = animations[2] ? 
                        this.animation.mixer.clipAction(animations[2]) : 
                        this.animation.mixer.clipAction(defaultAnim)
                }
            } catch (error) {
                console.error(`❌ Error setting up animations for ${this.modelType}:`, error)
                
                // As a last resort, create a single action for all states
                try {
                    const defaultAnim = animations[0]
                    const action = this.animation.mixer.clipAction(defaultAnim)
                    this.animation.actions.idle = action
                    this.animation.actions.walking = action
                    this.animation.actions.jump = action
                    console.log(`🔄 Using fallback to first animation for all actions`)
                } catch (fallbackError) {
                    console.error(`❌ Even fallback animation failed:`, fallbackError)
                    // Create dummy animation like above
                    this._createDummyAnimation()
                }
            }
        }

        // Set current action
        if (this.animation.actions.idle) {
            this.animation.actions.current = this.animation.actions.idle
            this.animation.actions.current.play()
        }

        // Setup jump animation
        if (this.animation.actions.jump) {
            this.animation.actions.jump.setLoop(THREE.LoopOnce)
            this.animation.actions.jump.clampWhenFinished = true
            
            this.animation.actions.jump.onFinished = () => {
                this.animation.play('idle')
            }
        }

        // Store original leg rotations for lion
        if (this.isLion && this.lionLegs.length > 0) {
            this.origLegRotations = this.lionLegs.map(leg => 
                leg.rotation ? leg.rotation.clone() : new THREE.Euler()
            )
        }

        // Animation play function
        this.animation.play = (name) => {
            const newAction = this.animation.actions[name]
            if (!newAction) {
                console.warn(`⚠️ Action "${name}" not found, using idle instead`)
                return
            }
            
            const oldAction = this.animation.actions.current
            
            // Don't crossfade to the same animation
            if (newAction === oldAction) return
            
            newAction.reset()
            newAction.play()
            
            if (oldAction) {
                newAction.crossFadeFrom(oldAction, 0.3)
            }
            
            this.animation.actions.current = newAction

            // Handle sound effects
            if (name === 'walking') {
                this.walkSound.play()
            } else {
                this.walkSound.stop()
            }

            if (name === 'jump') {
                this.jumpSound.play()
            }
        }
    }

    // Helper method to create a dummy animation when no animations are found
    _createDummyAnimation() {
        console.warn(`📍 Creating dummy animation for ${this.modelType}`)
        
        const times = [0, 1, 2]  // keyframe times
        const values = [0, 0.05, 0]  // slight up and down movement
        
        const positionTrack = new THREE.NumberKeyframeTrack(
            '.position[y]',
            times,
            values
        )
        
        const dummyClip = new THREE.AnimationClip('idle', 2, [positionTrack])
        
        this.animation.actions.idle = this.animation.mixer.clipAction(dummyClip)
        this.animation.actions.walking = this.animation.mixer.clipAction(dummyClip)
        this.animation.actions.jump = this.animation.mixer.clipAction(dummyClip)
        
        console.log(`✅ Dummy animation created successfully`)
    }
    
    // Custom update method for lion legs animation
    updateLionLegs(delta, isMoving) {
        // Only animate for lion model
        if (!this.isLion) return
        
        // For leg bobbing (when no legs found)
        if (this.useLegBobbing) {
            if (isMoving) {
                // Make the whole model bob up and down slightly when walking
                this.walkingTime += delta * 5
                const bobHeight = Math.sin(this.walkingTime) * 0.05
                this.model.position.y = -0.1 + bobHeight
            } else {
                // Reset position when idle
                this.model.position.y = -0.1
                this.walkingTime = 0
            }
            return
        }
        
        // For leg animation (when legs found)
        if (this.lionLegs.length > 0) {
            if (isMoving) {
                this.walkingTime += delta * 5
                
                // Animate each leg with an offset
                this.lionLegs.forEach((leg, i) => {
                    if (!leg || !leg.rotation) return
                    
                    const offset = i % 2 === 0 ? 0 : Math.PI // Opposite legs move in opposite directions
                    const swingAngle = Math.sin(this.walkingTime + offset) * 0.3 // Adjust swing amount
                    
                    // Apply rotation to leg
                    const origRotation = this.origLegRotations?.[i] || new THREE.Euler()
                    leg.rotation.x = origRotation.x + swingAngle
                })
                
                // Animate tail if found
                if (this.lionTail && this.lionTail.rotation) {
                    const tailWag = Math.sin(this.walkingTime * 0.7) * 0.2
                    this.lionTail.rotation.y = tailWag
                }
                
            } else {
                // Reset legs to original position when idle
                this.lionLegs.forEach((leg, i) => {
                    if (!leg || !leg.rotation) return
                    
                    const origRotation = this.origLegRotations?.[i] || new THREE.Euler()
                    leg.rotation.x = origRotation.x
                    leg.rotation.y = origRotation.y
                    leg.rotation.z = origRotation.z
                })
                
                // Subtle idle tail movement
                if (this.lionTail && this.lionTail.rotation) {
                    const tailWag = Math.sin(Date.now() * 0.001) * 0.05
                    this.lionTail.rotation.y = tailWag
                }
                
                this.walkingTime = 0
            }
        }
    }

    update() {
        const delta = this.time.delta * 0.001
        
        // Update animation mixer if it exists
        if (this.animation.mixer) {
            this.animation.mixer.update(delta)
        }

        const keys = this.keyboard.getState()
        const moveForce = 80
        const turnSpeed = 2.5
        let isMoving = false

        // Limitar velocidad si es demasiado alta
        const maxSpeed = 15
        this.body.velocity.x = Math.max(Math.min(this.body.velocity.x, maxSpeed), -maxSpeed)
        this.body.velocity.z = Math.max(Math.min(this.body.velocity.z, maxSpeed), -maxSpeed)

        // Calculate forward direction
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion)

        // Jump
        if (keys.space && this.body.position.y <= 0.51) {
            this.body.applyImpulse(new CANNON.Vec3(forward.x * 0.5, 3, forward.z * 0.5))
            this.animation.play('jump')
            return
        }
        
        // Safety check to prevent falling out of bounds
        if (this.body.position.y > 10) {
            console.warn('⚠️ Robot out of bounds. Repositioning...')
            this.body.position.set(0, 1.2, 0)
            this.body.velocity.set(0, 0, 0)
        }

        // Movement - forward
        if (keys.up) {
            const forwardVec = new THREE.Vector3(0, 0, 1)
            forwardVec.applyQuaternion(this.group.quaternion)
            this.body.applyForce(
                new CANNON.Vec3(forwardVec.x * moveForce, 0, forwardVec.z * moveForce),
                this.body.position
            )
            isMoving = true
        }

        // Movement - backward
        if (keys.down) {
            const backward = new THREE.Vector3(0, 0, -1)
            backward.applyQuaternion(this.group.quaternion)
            this.body.applyForce(
                new CANNON.Vec3(backward.x * moveForce, 0, backward.z * moveForce),
                this.body.position
            )
            isMoving = true
        }

        // Rotation - left/right
        if (keys.left) {
            this.group.rotation.y += turnSpeed * delta
            this.body.quaternion.setFromEuler(0, this.group.rotation.y, 0)
        }
        if (keys.right) {
            this.group.rotation.y -= turnSpeed * delta
            this.body.quaternion.setFromEuler(0, this.group.rotation.y, 0)
        }

        // Update animation based on movement
        if (isMoving) {
            if (this.animation.actions.current !== this.animation.actions.walking) {
                this.animation.play('walking')
            }
        } else {
            if (this.animation.actions.current !== this.animation.actions.idle && 
                this.animation.actions.current !== this.animation.actions.jump) {
                this.animation.play('idle')
            }
        }
        
        // Special handling for lion animation
        this.updateLionLegs(delta, isMoving)

        // Sync physics body with visual model
        this.group.position.copy(this.body.position)
        
        // Update name label to always face camera
        if (this.nameSprite && this.experience.camera?.instance) {
            this.nameSprite.lookAt(this.experience.camera.instance.position)
        }
        
        // Send position updates to server for multiplayer
        if (this.experience.socketManager?.socket) {
            this.experience.socketManager.sendTransform(
                this.body.position,
                this.group.rotation.y,
                this.modelType
            )
        }
    }

    // Method for VR movement
    moveInDirection(dir, speed) {
        if (!window.userInteracted || !this.experience.renderer.instance.xr.isPresenting) {
            return
        }

        // Handle mobile controls
        const mobile = window.experience?.mobileControls
        if (mobile?.intensity > 0) {
            const dir2D = mobile.directionVector
            const dir3D = new THREE.Vector3(dir2D.x, 0, dir2D.y).normalize()

            const adjustedSpeed = 250 * mobile.intensity // velocidad más fluida
            const force = new CANNON.Vec3(dir3D.x * adjustedSpeed, 0, dir3D.z * adjustedSpeed)

            this.body.applyForce(force, this.body.position)

            if (this.animation.actions.current !== this.animation.actions.walking) {
                this.animation.play('walking')
            }

            // Rotar suavemente en dirección de avance
            const angle = Math.atan2(dir3D.x, dir3D.z)
            this.group.rotation.y = angle
            this.body.quaternion.setFromEuler(0, this.group.rotation.y, 0)
        }
    }
}
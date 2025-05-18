import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import Sound from './Sound.js'

export default class ImageCharacter {
    constructor(experience) {
        this.experience = experience
        this.scene = experience.scene
        this.resources = experience.resources
        this.time = experience.time
        this.keyboard = experience.keyboard
        this.physics = experience.physics

        this.points = 0

        // Cargar modelo image2
        const resource = this.resources.items['image2Model']
        this.model = resource.scene
        this.model.scale.set(1.0, 1.0, 1.0)
        this.model.position.set(0, -0.1, 0.5)

        this.group = new THREE.Group()
        this.group.add(this.model)
        this.scene.add(this.group)

        this.model.traverse(child => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true
            }
        })

        this.setSounds()
        this.setAnimation(resource.animations || [])
        this.setPhysics()
    }

    setSounds() {
        this.walkSound = new Sound('/sounds/robot/walking.mp3', { loop: true, volume: 0.5 })
        this.jumpSound = new Sound('/sounds/robot/jump.mp3', { volume: 0.8 })
    }

    setAnimation(animations) {
        this.animation = {}
        this.animation.mixer = new THREE.AnimationMixer(this.model)

        const walk = animations.find(a => a.name.toLowerCase().includes('walk')) || animations[0]
        const idle = animations.find(a => a.name.toLowerCase().includes('idle')) || walk
        const jump = animations.find(a => a.name.toLowerCase().includes('jump')) || walk

        this.animation.actions = {
            idle: this.animation.mixer.clipAction(idle),
            walking: this.animation.mixer.clipAction(walk),
            jump: this.animation.mixer.clipAction(jump)
        }

        this.animation.actions.jump.setLoop(THREE.LoopOnce)
        this.animation.actions.jump.clampWhenFinished = true
        this.animation.actions.jump.onFinished = () => {
            this.animation.play('idle')
        }

        this.animation.actions.current = this.animation.actions.idle
        this.animation.actions.current.play()

        this.animation.play = (name) => {
            const newAction = this.animation.actions[name]
            const oldAction = this.animation.actions.current

            newAction.reset().play()
            if (oldAction && newAction !== oldAction) {
                newAction.crossFadeFrom(oldAction, 0.3)
            }
            this.animation.actions.current = newAction

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
        this.body.quaternion.setFromEuler(0, this.group.rotation.y, 0)
        this.physics.world.addBody(this.body)

        setTimeout(() => {
            this.body.wakeUp()
        }, 100)
    }

    update() {
        const delta = this.time.delta * 0.001

        if (this.animation.mixer) {
            this.animation.mixer.update(delta)
        }

        const keys = this.keyboard.getState()
        const moveForce = 80
        const turnSpeed = 2.5
        let isMoving = false

        const maxSpeed = 15
        this.body.velocity.x = Math.max(Math.min(this.body.velocity.x, maxSpeed), -maxSpeed)
        this.body.velocity.z = Math.max(Math.min(this.body.velocity.z, maxSpeed), -maxSpeed)

        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion)

        if (keys.space && this.body.position.y <= 0.51) {
            this.body.applyImpulse(new CANNON.Vec3(forward.x * 0.5, 3, forward.z * 0.5))
            this.animation.play('jump')
            return
        }

        if (this.body.position.y > 10) {
            this.body.position.set(0, 1.2, 0)
            this.body.velocity.set(0, 0, 0)
        }

        if (keys.up) {
            const forwardVec = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion)
            this.body.applyForce(
                new CANNON.Vec3(forwardVec.x * moveForce, 0, forwardVec.z * moveForce),
                this.body.position
            )
            isMoving = true
        }

        if (keys.down) {
            const backwardVec = new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion)
            this.body.applyForce(
                new CANNON.Vec3(backwardVec.x * moveForce, 0, backwardVec.z * moveForce),
                this.body.position
            )
            isMoving = true
        }

        if (keys.left) {
            this.group.rotation.y += turnSpeed * delta
            this.body.quaternion.setFromEuler(0, this.group.rotation.y, 0)
        }

        if (keys.right) {
            this.group.rotation.y -= turnSpeed * delta
            this.body.quaternion.setFromEuler(0, this.group.rotation.y, 0)
        }

        if (isMoving) {
            if (this.animation.actions.current !== this.animation.actions.walking) {
                this.animation.play('walking')
            }
        } else {
            if (this.animation.actions.current !== this.animation.actions.idle) {
                this.animation.play('idle')
            }
        }

        this.group.position.copy(this.body.position)
    }
}
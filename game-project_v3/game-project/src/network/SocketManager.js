// src/network/SocketManager.js
import * as THREE from 'three'
import { io } from 'socket.io-client'

export default class SocketManager {
    constructor(experience) {
        this.experience = experience
        this.scene = this.experience.scene
        this.robots = {}
        this.socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3001', {
            autoConnect: true, // permite conectar cuando queramos
            reconnection: false // ❌ evita que reconecte automáticamente
        })
        console.log(import.meta.env.VITE_API_URL)
        this.socket.on('connect', () => {
            console.log('🔌 Conectado a servidor:', this.socket.id)

            const initialPos = this.experience.world.robot?.body?.position || { x: 0, y: 0, z: 0 }
            this.socket.emit('new-player', { position: initialPos })
        })

        // Manejar rechazo de conexión por límite de jugadores
        this.socket.on('connection-rejected', (data) => {
            console.log('⛔ Conexión rechazada:', data.reason)
            
            // Mostrar modal informativo
            if (this.experience.modal) {
                this.experience.modal.show({
                    icon: '⛔',
                    message: data.reason,
                    buttons: [
                        {
                            text: '🔄 Reintentar',
                            onClick: () => {
                                this.socket.connect()
                            }
                        }
                    ]
                })
            }
            
            // Actualizar HUD
            if (this.experience.menu?.playersLabel) {
                this.experience.menu.playersLabel.innerText = '👥 Servidor lleno'
            }
        })

        this.socket.on('spawn-player', (data) => {
            if (data.id === this.socket.id) return

            console.log('🧍 Nuevo jugador:', data.id)
            this._createRemoteRobot(data.id, data.position)
        })

        this.socket.on('players-update', (players) => {
            const total = Object.keys(players).length
            console.log('📡 Jugadores conectados:', total)

            // ✅ Actualizar HUD si existe el menú
            if (this.experience.menu?.playersLabel) {
                this.experience.menu.playersLabel.innerText = `👥 Jugadores: ${total}`
            }
        })



        this.socket.on('update-player', ({ id, position, rotation }) => {
            const remote = this.robots[id]
            if (id !== this.socket.id && remote) {
                remote.model.position.set(position.x, position.y, position.z)
                remote.model.rotation.y = rotation
            }
        })

        this.socket.on('remove-player', (id) => {
            const data = this.robots[id]
          
            if (data) {
              if (data.model) {
                // 1. Quitar de la escena
                this.scene.remove(data.model)
          
                // 2. Liberar geometría y materiales
                data.model.traverse(child => {
                  if (child.isMesh) {
                    child.geometry?.dispose()
                    if (Array.isArray(child.material)) {
                      child.material.forEach(m => m.dispose?.())
                    } else {
                      child.material?.dispose?.()
                    }
                  }
                })
          
                // 3. Eliminar etiqueta flotante
                data.model.userData.label?.remove()
              }
          
              // 4. Eliminar del registro
              delete this.robots[id]
            }
          })
          

        this.socket.on('existing-players', (others) => {
            others.forEach(data => {
                if (data.id !== this.socket.id && !this.robots[data.id]) {
                    this._createRemoteRobot(data.id, data.position, data.rotation, data.color)
                }
            })
        })

    }

    sendTransform(position, rotationY) {
        this.socket.emit('update-position', {
            position,
            rotation: rotationY
        })
    }


    // In SocketManager.js
    _createRemoteRobot(id, position) {
        // Array of model types
        const modelTypes = ['robotModel', 'foxModel', 'lionModel', 'elephantModel']
        
        // Assign model based on number of existing players
        const playerCount = Object.keys(this.players || {}).length || 0
        const modelType = modelTypes[playerCount % modelTypes.length]
        
        // Try to get the selected model resource
        const modelResource = this.experience.resources.items[modelType]
        
        if (!modelResource || !modelResource.scene) {
            console.warn(`Model ${modelType} not found for remote player ${id}`)
            return
        }
        
        // Clone the model
        const model = modelResource.scene.clone()
        
        // Apply scaling based on model type
        if (modelType === 'robotModel') {
            model.scale.set(0.3, 0.3, 0.3)
        } else if (modelType === 'foxModel') {
            model.scale.set(0.02, 0.02, 0.02)
        } else if (modelType === 'lionModel') {
            model.scale.set(0.05, 0.05, 0.05)
        } else if (modelType === 'elephantModel') {
            model.scale.set(0.05, 0.05, 0.05)
        }
        
        model.position.set(position.x, position.y, position.z)
        
        // Setup animation mixer
        const mixer = new THREE.AnimationMixer(model)
        
        // Try to find and play idle animation
        let idleAnimation
        if (modelResource.animations && modelResource.animations.length > 0) {
            idleAnimation = modelResource.animations[0]
        } else if (this.experience.resources.items.robotModel.animations) {
            // Fallback to robot animations
            idleAnimation = this.experience.resources.items.robotModel.animations[2]
        }
        
        if (idleAnimation) {
            const action = mixer.clipAction(idleAnimation)
            action.play()
        }
        
        // Save to robots object
        this.robots[id] = {
            model,
            mixer,
            modelType
        }
        
        this.scene.add(model)
        
        // Create player label
        const label = document.createElement('div')
        
        // Change emoji based on model type
        let emoji = '🤖' // Default robot
        if (modelType === 'foxModel') emoji = '🦊'
        else if (modelType === 'lionModel') emoji = '🦁'
        else if (modelType === 'elephantModel') emoji = '🐘'
        
        label.textContent = `${emoji} ${id.slice(0, 4)}`
        Object.assign(label.style, {
            position: 'absolute',
            color: 'white',
            background: 'rgba(0,0,0,0.5)',
            padding: '2px 4px',
            fontSize: '12px',
            borderRadius: '4px',
            pointerEvents: 'none'
        })
        document.body.appendChild(label)
        model.userData.label = label
    }



    update(delta) {
        const robot = this.experience.world?.robot?.group
        if (robot) {
            const pos = robot.position
            const rotY = robot.rotation.y
            this.sendTransform(pos, rotY)
        }

        for (const id in this.robots) {
            const { model, mixer } = this.robots[id]
            if (mixer) mixer.update(delta)

            const label = model.userData.label
            if (label) {
                const screenPos = model.position.clone().project(this.experience.camera.instance)
                label.style.left = `${(screenPos.x * 0.5 + 0.5) * window.innerWidth}px`
                label.style.top = `${(-screenPos.y * 0.5 + 0.5) * window.innerHeight}px`
            }
        }
    }

    destroy() {
        // ⛔️ Desconectar socket
        this.socket.disconnect()
      
        // 🧹 Limpiar modelos y etiquetas
        for (const id in this.robots) {
          const { model } = this.robots[id]
      
          if (model) {
            // Eliminar de la escena
            this.scene.remove(model)
      
            // Eliminar geometrías y materiales
            model.traverse(child => {
              if (child.isMesh) {
                child.geometry?.dispose()
                if (Array.isArray(child.material)) {
                  child.material.forEach(mat => mat.dispose?.())
                } else {
                  child.material?.dispose?.()
                }
              }
            })
      
            // Eliminar etiqueta flotante
            if (model.userData.label) {
              model.userData.label.remove()
            }
          }
        }
      
        // Limpiar estructura
        this.robots = {}
      }
      

}

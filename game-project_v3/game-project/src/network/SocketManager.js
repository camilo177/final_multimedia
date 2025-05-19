// src/network/SocketManager.js
import * as THREE from 'three'
import { io } from 'socket.io-client'
import EventEmitter from '../Experience/Utils/EventEmitter.js'

export default class SocketManager extends EventEmitter {
    constructor(experience) {
        super()
        
        this.experience = experience
        this.scene = this.experience.scene
        this.robots = {}
        this.players = {}
        this.modelTypes = ['robotModel', 'foxModel', 'robotModel', 'foxModel', 'robotModel']
        
        this.socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3001', {
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 5
        })
        
        console.log('🔌 SocketManager: Connecting to server...')
        
        // Set up socket event handlers
        this.socket.on('connect', () => {
            console.log('🔌 Connected to server:', this.socket.id)
            
            // Wait for the robot to be created
            const checkRobot = () => {
                if (this.experience.world?.robot?.body) {
                    const initialPos = this.experience.world.robot.body.position
                    
                    // Determine which model to use
                    const playerCount = Object.keys(this.players).length
                    const modelType = this.modelTypes[playerCount % this.modelTypes.length]
                    
                    console.log(`🤖 Joining as player #${playerCount + 1} with model: ${modelType}`)
                    
                    // Send info to server
                    this.socket.emit('new-player', { 
                        position: initialPos,
                        modelType: modelType
                    })
                } else {
                    setTimeout(checkRobot, 500)
                }
            }
            
            checkRobot()
        })
        
        // Handle connection rejection (player limit exceeded)
        this.socket.on('connection-rejected', (data) => {
            console.warn('⛔ Connection rejected:', data.reason)
            
            // Show error modal
            this._showConnectionError(data.reason)
            
            // Update player count display
            if (this.experience.menu?.playersLabel) {
                this.experience.menu.playersLabel.innerText = '👥 Server Full (5/5)'
            }
        })
        
        // Handle updated player list
        this.socket.on('players-update', (players) => {
            this.players = players
            const total = Object.keys(players).length
            console.log('👥 Players connected:', total)
            
            // Update player counter
            if (this.experience.menu?.playersLabel) {
                this.experience.menu.playersLabel.innerText = `👥 Players: ${total}/5`
            }
            
            // Trigger event for other components
            this.trigger('players-update', players)
        })
        
        // New player joins
        this.socket.on('spawn-player', (data) => {
            if (data.id === this.socket.id) return
            
            console.log(`👤 New player joined: ${data.id} with model ${data.modelType || 'robotModel'}`)
            this._createRemotePlayer(data.id, data.position, data.rotation, data.modelType)
            
            // Let World.js know
            this.trigger('player-joined', data.id, data.modelType)
        })
        
        // Remote player moves
        this.socket.on('update-player', ({ id, position, rotation }) => {
            if (id === this.socket.id) return
            
            const remote = this.robots[id]
            if (remote && remote.model) {
                remote.model.position.set(position.x, position.y, position.z)
                remote.model.rotation.y = rotation
            }
            
            // Let World.js know
            this.trigger('player-transform', id, position, rotation)
        })
        
        // Player disconnects
        this.socket.on('remove-player', (id) => {
            if (this.robots[id]) {
                console.log(`👋 Player disconnected: ${id}`)
                this._removeRemotePlayer(id)
                
                // Let World.js know
                this.trigger('player-removed', id)
            }
        })
        
        // Get existing players
        this.socket.on('existing-players', (others) => {
            console.log(`🌎 Found ${others.length} existing players`)
            
            others.forEach(data => {
                if (data.id !== this.socket.id) {
                    console.log(`📝 Adding existing player: ${data.id} with model ${data.modelType || 'robotModel'}`)
                    this._createRemotePlayer(data.id, data.position, data.rotation, data.modelType)
                }
            })
        })
        
        // Debug info
        this.debugInterval = setInterval(() => {
            const playerCount = Object.keys(this.players).length
            const robotCount = Object.keys(this.robots).length
            console.log(`[🌐 MULTIPLAYER] Connected: ${this.socket.connected}, Players: ${playerCount}/5, Remote robots: ${robotCount}`)
        }, 10000) // Log every 10 seconds
    }
    
    _showConnectionError(message) {
        if (this.experience.modal) {
            this.experience.modal.show({
                icon: '⛔',
                message: message || 'Connection error',
                buttons: [
                    {
                        text: '🔄 Retry Connection',
                        onClick: () => {
                            this.socket.connect()
                        }
                    }
                ]
            })
        }
    }
    
    _createRemotePlayer(id, position, rotation = 0, modelType = 'robotModel') {
        // Check if player already exists
        if (this.robots[id]) {
            console.warn(`⚠️ Player ${id} already exists`)
            return
        }
        
        console.log(`🤖 Creating remote player: ${id} with model ${modelType}`)
        
        // Default model is robotModel
        let modelResource = this.experience.resources.items.robotModel
        let scale = 0.3
        let yOffset = 0
        let emoji = '🤖'
        
        // Select appropriate model based on type
        if (modelType === 'foxModel' && this.experience.resources.items.foxModel) {
            modelResource = this.experience.resources.items.foxModel
            scale = 0.02
            yOffset = 0.1
            emoji = '🦊'
        }
        
        // Ensure model is available
        if (!modelResource || !modelResource.scene) {
            console.error(`❌ Model '${modelType}' not found`)
            return
        }
        
        // Clone model
        const model = modelResource.scene.clone()
        model.scale.set(scale, scale, scale)
        model.position.set(position.x, position.y + yOffset, position.z)
        
        if (rotation) {
            model.rotation.y = rotation
        }
        
        // Random color for player identification
        const playerColor = new THREE.Color(
            Math.random() * 0.5 + 0.5,
            Math.random() * 0.5 + 0.5,
            Math.random() * 0.5 + 0.5
        )
        
        // Apply color to model materials
        model.traverse(child => {
            if (child instanceof THREE.Mesh) {
                child.material = child.material.clone()
                child.material.color = playerColor
                child.castShadow = true
            }
        })
        
        // Set up animation
        const mixer = new THREE.AnimationMixer(model)
        
        // Find appropriate idle animation
        if (modelResource.animations && modelResource.animations.length > 0) {
            let idleAnimation = modelResource.animations.find(
                anim => anim.name.toLowerCase().includes('idle')
            )
            
            // If no idle animation, use first one
            if (!idleAnimation) {
                idleAnimation = modelResource.animations[0]
            }
            
            const action = mixer.clipAction(idleAnimation)
            action.play()
        }
        
        // Add to scene
        this.scene.add(model)
        
        // Store player
        this.robots[id] = {
            model,
            mixer,
            modelType
        }
        
        // Create floating name tag
        const label = document.createElement('div')
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
        
        // Store label reference
        model.userData.label = label
    }
    
    _removeRemotePlayer(id) {
        const robotData = this.robots[id]
        if (!robotData) return
        
        // Remove from scene
        if (robotData.model) {
            this.scene.remove(robotData.model)
            
            // Clean up resources
            robotData.model.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    if (child.geometry) child.geometry.dispose()
                    
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose?.())
                    } else if (child.material) {
                        child.material.dispose()
                    }
                }
            })
            
            // Remove floating label
            if (robotData.model.userData.label) {
                robotData.model.userData.label.remove()
            }
        }
        
        // Remove from tracking
        delete this.robots[id]
    }
    
    // Public methods for World.js to use
    
    // Get connected player count
    getConnectedPlayers() {
        return Object.keys(this.players).length
    }
    
    // Send position update to server
    sendTransform(position, rotation) {
        if (this.socket.connected) {
            this.socket.emit('update-position', {
                position,
                rotation
            })
        }
    }
    
    // Event handlers for World.js
    onPlayerJoined(callback) {
        this.on('player-joined', callback)
    }
    
    onPlayerTransform(callback) {
        this.on('player-transform', callback)
    }
    
    onPlayerRemoved(callback) {
        this.on('player-removed', callback)
    }
    
    // Called in Experience's update method
    update(delta) {
        if (!this.socket.connected) return
        
        // Send local player position to server
        const robot = this.experience.world?.robot?.group
        if (robot) {
            this.sendTransform(robot.position, robot.rotation.y)
        }
        
        // Update animations and labels for remote players
        for (const id in this.robots) {
            const { model, mixer } = this.robots[id]
            
            // Update animation
            if (mixer) {
                mixer.update(delta)
            }
            
            // Update floating label position
            const label = model.userData.label
            if (label) {
                const screenPos = model.position.clone().project(this.experience.camera.instance)
                label.style.left = `${(screenPos.x * 0.5 + 0.5) * window.innerWidth}px`
                label.style.top = `${(-screenPos.y * 0.5 + 0.5) * window.innerHeight}px`
            }
        }
    }
    
    // Cleanup
    destroy() {
        console.log('🧹 Cleaning up SocketManager')
        
        // Clear debug interval
        clearInterval(this.debugInterval)
        
        // Disconnect
        if (this.socket) {
            this.socket.disconnect()
        }
        
        // Clean up all remote players
        Object.keys(this.robots).forEach(id => {
            this._removeRemotePlayer(id)
        })
        
        // Clear data
        this.robots = {}
        this.players = {}
    }
}
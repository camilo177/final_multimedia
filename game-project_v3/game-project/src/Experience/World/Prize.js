import * as THREE from 'three'

export default class Prize {
    constructor({ model, position, scene, role = 'default', value = 1, id = null, metadata = {} }) {
        this.scene = scene
        this.collected = false
        this.role = role // 🟡 Role of the prize (default or finalPrize)
        this.value = value // 💲 Points value of this prize (defaults to 1)
        this.id = id // 🔑 Unique identifier from DB if available
        this.metadata = metadata // 📑 Extra data from the database
    
        // 📌 Create the pivot (container group)
        this.pivot = new THREE.Group()
        this.pivot.position.copy(position)
    
        // ✅ Clone the model completely
        this.model = model.clone()
    
        // 🧠 Find the first child with geometry
        const visual = this.model.children[0] || this.model
    
        // 🛠️ Reset the visual's position to inherit from pivot
        visual.position.set(0, 0, 0)
        visual.rotation.set(0, 0, 0)
        visual.scale.set(1, 1, 1)
    
        // Add the visual to the pivot
        this.pivot.add(visual)
    
        // 🔍 Visual axes helper to verify real location
        const helper = new THREE.AxesHelper(0.5)
        this.pivot.add(helper)
    
        // 👻 Show or hide based on role
        this.pivot.visible = role !== 'finalPrize'
    
        // ➕ Add the pivot (not the model) to the scene
        this.scene.add(this.pivot)
    
        // 🪪 Debug
        console.log(`🎯 Premio en: (${position.x}, ${position.y}, ${position.z}) [role: ${this.role}, value: ${this.value}]`)
    }

    update(delta) {
        if (this.collected) return
        this.pivot.rotation.y += delta * 1.5
    }

    collect() {
        this.collected = true
        this.scene.remove(this.pivot)
        return this.value // 💰 Return the value for scoring
    }
}
export default class LevelManager {
    constructor(experience) {
        this.experience = experience
        this.currentLevel = 1  // Inicias en el nivel 1
        this.totalLevels = 2   // Total de niveles (puedes aumentar si agregas más)
        this.transitioning = false // Bandera para prevenir transiciones múltiples
        
        // Definir puntos necesarios para completar cada nivel
        this.pointsToComplete = {
            1: 2, // Nivel 1 requiere 2 puntos
            2: 2  // Nivel 2 requiere 2 puntos
        }
    }

    nextLevel() {
        // Prevenir transiciones múltiples
        if (this.transitioning) {
            console.log('⚠️ Ya hay una transición en progreso')
            return
        }
        
        this.transitioning = true
        
        if (this.currentLevel < this.totalLevels) {
            this.currentLevel++
    
            // Limpiar escena actual
            this.experience.world.clearCurrentScene()
    
            // Cargar siguiente nivel
            this.experience.world.loadLevel(this.currentLevel)
        } else {
            console.log('🏁 Juego completado')
            this._mostrarPantallaFinal()
        }
        
        // Restablecer bandera de transición
        setTimeout(() => {
            this.transitioning = false
        }, 2000)
    }
    
    resetLevel() {
        this.currentLevel = 1
        this.experience.world.clearCurrentScene()
        this.experience.world.loadLevel(this.currentLevel)
    }
    
    // Este método es el que faltaba y causaba el error
    getCurrentLevelTargetPoints() {
        return this.pointsToComplete[this.currentLevel] || 2
    }
    
    isLastLevel() {
        return this.currentLevel >= this.totalLevels
    }
    
    resetToFirstLevel() {
        this.currentLevel = 1
        this.experience.world.clearCurrentScene()
        this.experience.world.loadLevel(this.currentLevel)
    }
    
    _mostrarPantallaFinal() {
        if (!document.getElementById('pantalla-final')) {
            const overlay = document.createElement('div')
            overlay.id = 'pantalla-final'
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.8);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 2000;
                color: white;
                font-family: Arial, sans-serif;
            `
            
            const titulo = document.createElement('h1')
            titulo.textContent = '¡Felicidades!'
            titulo.style.fontSize = '3rem'
            titulo.style.marginBottom = '1rem'
            
            const mensaje = document.createElement('p')
            mensaje.textContent = 'Has completado todos los niveles del juego.'
            mensaje.style.fontSize = '1.5rem'
            mensaje.style.marginBottom = '2rem'
            
            const botonReinicio = document.createElement('button')
            botonReinicio.textContent = 'Jugar de nuevo'
            botonReinicio.style.cssText = `
                padding: 1rem 2rem;
                font-size: 1.2rem;
                background-color: #4CAF50;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
            `
            botonReinicio.addEventListener('click', () => {
                overlay.style.display = 'none'
                this.resetToFirstLevel()
            })
            
            overlay.appendChild(titulo)
            overlay.appendChild(mensaje)
            overlay.appendChild(botonReinicio)
            document.body.appendChild(overlay)
        } else {
            document.getElementById('pantalla-final').style.display = 'flex'
        }
    }
}
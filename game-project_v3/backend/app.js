require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const blockRoutes = require('./routes/blockRoutes')

const app = express()
const port = process.env.PORT || 3001

// ✅ CORS mejorado - cambia origin: '*' por configuración específica
const corsOptions = {
    origin: [
        'http://localhost:3000',           // React dev local
        'http://localhost:5173',           // Vite dev local
        'https://finalmultimedia.vercel.app'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}

app.use(cors(corsOptions))
app.use(express.json())

app.get('/', (req, res) => {
    res.json({
        message: '🎮 API de bloques para juego multijugador',
        status: 'healthy',
        jugadores_conectados: Object.keys(players).length,
        maximo_jugadores: MAX_PLAYERS,
        puerto: port,
        timestamp: new Date().toISOString()
    })
})

// ✅ Endpoint de prueba CORS
app.get('/test-cors', (req, res) => {
    res.json({
        message: 'CORS funcionando correctamente',
        origin: req.headers.origin,
        timestamp: new Date().toISOString()
    })
})

// Rutas
app.use('/api/blocks', blockRoutes)

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Conectado a MongoDB')
    })
    .catch(err => console.error('Error al conectar a MongoDB:', err))

/**
 * Implementacion experiencia multijugador
 */
const http = require('http')
const socketio = require('socket.io')

const server = http.createServer(app)

// ✅ CORS para Socket.IO también mejorado
const io = socketio(server, {
    cors: {
        origin: [
            'http://localhost:3000',
            'http://localhost:5173',
            'https://finalmultimedia.vercel.app' 
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
})

// Constante para el límite máximo de jugadores
const MAX_PLAYERS = 5

// Almacén temporal de jugadores
let players = {}

io.on('connection', (socket) => {
    console.log(`🟢 Usuario conectado: ${socket.id}`)
    
    // ✅ Verificar límite ANTES de que el jugador envíe 'new-player'
    const currentPlayerCount = Object.keys(players).length
    
    if (currentPlayerCount >= MAX_PLAYERS) {
        console.log(`⛔ Límite alcanzado (${MAX_PLAYERS}). Rechazando conexión ${socket.id}`)
        socket.emit('connection-rejected', {
            reason: 'server-full',
            message: `Servidor lleno. Máximo ${MAX_PLAYERS} jugadores permitidos.`,
            currentPlayers: currentPlayerCount,
            maxPlayers: MAX_PLAYERS
        })
        socket.disconnect(true) // ✅ Desconectar inmediatamente
        return
    }

    socket.on('new-player', (data) => {
        // ✅ Verificación adicional por si acaso
        if (Object.keys(players).length >= MAX_PLAYERS) {
            console.log(`⛔ Límite alcanzado durante new-player para ${socket.id}`)
            socket.emit('connection-rejected', {
                reason: 'server-full',
                message: `Servidor lleno. Máximo ${MAX_PLAYERS} jugadores permitidos.`,
                currentPlayers: Object.keys(players).length,
                maxPlayers: MAX_PLAYERS
            })
            socket.disconnect(true)
            return
        }

        console.log(`👤 Jugador inicializado: ${socket.id}`, data)

        players[socket.id] = {
            id: socket.id,
            position: data.position || { x: 0, y: 0, z: 0 },
            rotation: data.rotation || 0,
            color: data.color || '#ffffff'
        }

        // Notificar a los demás jugadores
        socket.broadcast.emit('spawn-player', {
            id: socket.id,
            position: players[socket.id].position,
            rotation: players[socket.id].rotation,
            color: players[socket.id].color
        })

        // Enviar al nuevo jugador la lista de jugadores ya conectados
        socket.emit('players-update', players)

        // Enviar al nuevo jugador los que ya estaban conectados
        const others = Object.entries(players)
            .filter(([id]) => id !== socket.id)
            .map(([id, info]) => ({
                id,
                position: info.position,
                rotation: info.rotation,
                color: info.color
            }))

        socket.emit('existing-players', others)
        
        // ✅ Log del estado actual
        console.log(`📊 Jugadores conectados: ${Object.keys(players).length}/${MAX_PLAYERS}`)
    })

    socket.on('update-position', ({ position, rotation }) => {
        if (players[socket.id]) {
            players[socket.id].position = position
            players[socket.id].rotation = rotation
            socket.broadcast.emit('update-player', {
                id: socket.id,
                position,
                rotation
            })
        }
    })

    socket.on('disconnect', () => {
        console.log(`🔴 Usuario desconectado: ${socket.id}`)
      
        delete players[socket.id]
      
        // Notificar a todos para eliminar al jugador desconectado
        io.emit('remove-player', socket.id)
      
        // Actualizar la lista completa
        io.emit('players-update', players)
        
        // ✅ Log del estado actual
        console.log(`📊 Jugadores restantes: ${Object.keys(players).length}/${MAX_PLAYERS}`)
    })
})

// Escucha en el puerto
const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en puerto ${PORT}`)
    console.log(`🌐 CORS configurado para desarrollo y producción`)
    console.log(`👥 Máximo ${MAX_PLAYERS} jugadores concurrentes`)
    console.log(`📡 Socket.IO habilitado en ${PORT}`)
})
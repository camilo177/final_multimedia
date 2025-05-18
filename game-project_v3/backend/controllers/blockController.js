const Block = require('../models/Block')


exports.getBlocks = async (req, res) => {
    try {
        const level = parseInt(req.query.level) || 1;

        const blocks = await Block.find({ level: level }).select('name x y z level role -_id'); 

        res.json(blocks);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener bloques', error });
    }
};

// Agregar un nuevo bloque
exports.addBlock = async (req, res) => {
    const { name, x, y, z, level, rol } = req.body;
    const newBlock = new Block({ name, x, y, z, level, rol });
    await newBlock.save();

    res.status(201).json({ message: 'Bloque guardado', block: newBlock });
}

exports.addMultipleBlocks = async (req, res) => {
    try {
        const blocks = req.body;
        
        // Create operations for bulkWrite
        const operations = blocks.map(block => ({
            updateOne: {
                filter: { 
                    name: block.name,
                    x: block.x, 
                    y: block.y, 
                    z: block.z,
                    level: block.level
                },
                update: { $set: block },
                upsert: true // Create if not exists
            }
        }));
        
        const result = await Block.bulkWrite(operations);
        
        res.status(201).json({ 
            message: 'Bloques guardados', 
            count: blocks.length,
            inserted: result.upsertedCount,
            updated: result.modifiedCount
        });
    } catch (error) {
        console.error('Error en addMultipleBlocks:', error);
        res.status(500).json({ message: 'Error al guardar bloques', error: error.message });
    }
}
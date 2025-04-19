const express = require('express');
const router = express.Router();
const Jugada = require('../models/Jugada');



// Guardar jugada
router.post('/', async (req, res) => {
    try {
        const jugada = new Jugada(req.body);
        await jugada.save();
        res.status(201).json(jugada);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Ver todas
router.get('/', async (req, res) => {
    const jugadas = await Jugada.find().sort({ turno: 1 });
    res.json(jugadas);
});

module.exports = router;

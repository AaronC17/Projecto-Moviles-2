const express = require('express');
const router = express.Router();
const Adivinanza = require('../models/Adivinanza');

// Guardar adivinanza
router.post('/', async (req, res) => {
    try {
        const adivinanza = new Adivinanza(req.body);
        await adivinanza.save();
        res.status(201).json({ mensaje: "Adivinanza registrada", adivinanza });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;

const mongoose = require('mongoose');

const JugadaSchema = new mongoose.Schema({
    jugador: String,
    turno: Number,
    peso: Number,
    equipo: Number,
    eliminado: Boolean,
    fecha: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Jugada', JugadaSchema);

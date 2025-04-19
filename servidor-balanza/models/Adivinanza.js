const mongoose = require('mongoose');

const AdivinanzaSchema = new mongoose.Schema({
    jugador: String,
    bloques: [
        {
            intento: Number,
            pesoReal: Number,
            acertado: Boolean,
        },
    ],
    aciertos: Number,
    fecha: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Adivinanza', AdivinanzaSchema);

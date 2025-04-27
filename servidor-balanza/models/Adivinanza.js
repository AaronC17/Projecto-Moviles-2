// models/Adivinanza.js
const mongoose = require('mongoose');

const AdivinanzaSchema = new mongoose.Schema({
    jugador: { type: String, required: true },
    bloques: [
        {
            intento: { type: Number, required: true },
            pesoReal: { type: Number, required: true },
            acertado: { type: Boolean, required: true },
        }
    ],
    aciertos: { type: Number, required: true },
    fecha: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Adivinanza', AdivinanzaSchema);

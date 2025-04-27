const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const conectarDB = require("./db");
const Jugada = require("./models/Jugada");
const Adivinanza = require("./models/Adivinanza");
const jugadasRoute = require("./routes/jugadas");
const adivinanzasRoute = require("./routes/adivinanzas");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use("/jugadas", jugadasRoute);
app.use("/adivinanzas", adivinanzasRoute);

conectarDB();

// ----------------- Variables Globales -----------------
let jugadores = [];
let turnoActual = 0;
let pesoIzquierdo = 0;
let pesoDerecho = 0;
let totalJugadas = 0;
let bloquesTotales = 0;
let bloquesPorJugador = {};
let sesionesIndividuales = {};
let jugadasMultijugador = [];
let turnoTimeout = null;

const COLORES = ["red", "blue", "green", "orange", "purple"];

// ----------------- WebSocket -----------------
wss.on("connection", (ws) => {
    ws.id = Math.random().toString(36).substring(2);
    ws.eliminado = false;

    ws.on("message", async (data) => {
        try {
            const msg = JSON.parse(data);

            if (msg.type === "ENTRADA") {
                ws.nombre = msg.jugador;
                ws.modo = msg.modo || "multijugador";

                if (ws.modo === "individual") {
                    if (!sesionesIndividuales[ws.nombre]) {
                        const bloques = [];
                        COLORES.forEach((color) => {
                            for (let i = 0; i < 2; i++) {
                                bloques.push({ color, peso: Math.floor(Math.random() * 19) + 2 });
                            }
                        });
                        sesionesIndividuales[ws.nombre] = {
                            pesoIzquierdo: 0,
                            pesoDerecho: 0,
                            bloques,
                            jugadas: [],
                            terminado: false,
                        };
                    }

                    ws.send(JSON.stringify({
                        type: "TURNO",
                        tuTurno: true,
                        jugadorEnTurno: ws.nombre,
                    }));

                } else {
                    const yaExiste = jugadores.find(j => j.nombre === msg.jugador);
                    if (yaExiste) {
                        ws.send(JSON.stringify({ type: "ERROR", mensaje: "Nombre duplicado" }));
                        ws.close();
                        return;
                    }

                    jugadores.push(ws);

                    if (!bloquesPorJugador[msg.jugador]) {
                        const bloques = [];
                        COLORES.forEach(color => {
                            for (let i = 0; i < 2; i++) {
                                bloques.push({ color, peso: Math.floor(Math.random() * 19) + 2 });
                                bloquesTotales++;
                            }
                        });
                        bloquesPorJugador[msg.jugador] = bloques;
                    }

                    broadcast({ type: "ENTRADA", totalJugadores: jugadores.length });

                    if (jugadores.length >= 2) {
                        enviarTurno();
                    }
                }
            }

            if (msg.type === "JUGADA") {
                if (ws.modo === "individual") {
                    procesarJugadaIndividual(ws, msg);
                } else {
                    procesarJugadaMultijugador(ws, msg);
                }
            }
        } catch (err) {
            console.error("❌ Error:", err.message);
        }
    });

    ws.on("close", () => {
        jugadores = jugadores.filter(j => j !== ws);
    
        broadcast({ type: "ENTRADA", totalJugadores: jugadores.length });
    
        if (turnoActual >= jugadores.length) turnoActual = 0;
        enviarTurno();
    });
});

// ----------------- Funciones -----------------
function procesarJugadaIndividual(ws, msg) {
    const sesion = sesionesIndividuales[ws.nombre];
    if (!sesion || sesion.terminado) return;

    sesion.jugadas.push({ ...msg });

    if (msg.lado === "izquierdo") sesion.pesoIzquierdo += msg.peso;
    else sesion.pesoDerecho += msg.peso;

    ws.send(JSON.stringify({
        type: "ACTUALIZAR_BALANZA",
        izquierdo: sesion.pesoIzquierdo,
        derecho: sesion.pesoDerecho,
        jugador: msg.jugador,
    }));

    if (sesion.jugadas.length >= 10) {
        sesion.terminado = true;
        const resumen = {
            contenido: sesion.jugadas,
            totales: {
                izquierdo: sesion.pesoIzquierdo,
                derecho: sesion.pesoDerecho,
            },
            sobrevivientes: [ws.nombre],
            ganador: calcularGanador(sesion.pesoIzquierdo, sesion.pesoDerecho),
            bloquesPorJugador: { [ws.nombre]: sesion.bloques },
        };

        ws.send(JSON.stringify({ type: "RESUMEN", ...resumen }));
    } else {
        ws.send(JSON.stringify({
            type: "TURNO",
            tuTurno: true,
            jugadorEnTurno: ws.nombre,
        }));
    }
}

async function procesarJugadaMultijugador(ws, msg) {
    clearTimeout(turnoTimeout);

    const jugadorActual = jugadores[turnoActual];
    if (!jugadorActual) return;

    if (msg.lado === "izquierdo") pesoIzquierdo += msg.peso;
    else pesoDerecho += msg.peso;

    const diferencia = Math.abs(pesoIzquierdo - pesoDerecho);

    if (diferencia > 15) {
        ws.eliminado = true;

        broadcast({
            type: "MENSAJE",
            contenido: `${ws.nombre} fue eliminado por desequilibrar la balanza.`,
        });

        broadcast({
            type: "ACTUALIZAR_BALANZA",
            izquierdo: pesoIzquierdo,
            derecho: pesoDerecho,
            jugador: msg.jugador,
            bloque: {
                peso: msg.peso,
                color: msg.color,
                lado: msg.lado,
            },
        });

        // 🔥🔥🔥 🔥 Aquí la corrección importante 🔥🔥🔥 🔥
        const jugadoresActivos = jugadores.filter(j => !j.eliminado);
        if (jugadoresActivos.length === 1) {
            enviarResumenFinal();
            return;
        }

        avanzarTurno();
        return;
    }

    // 👇 SOLO SI NO hubo desequilibrio
    jugadasMultijugador.push({
        turno: totalJugadas + 1,
        jugador: msg.jugador,
        peso: msg.peso,
        color: msg.color || null,
    });

    broadcast({
        type: "ACTUALIZAR_BALANZA",
        izquierdo: pesoIzquierdo,
        derecho: pesoDerecho,
        jugador: msg.jugador,
        bloque: {
            peso: msg.peso,
            color: msg.color,
            lado: msg.lado,
        },
    });

    broadcast({
        type: "MENSAJE",
        contenido: `${msg.jugador} colocó ${msg.peso}g en el lado ${msg.lado}`,
    });

    totalJugadas++;

    if (totalJugadas >= bloquesTotales) {
        enviarResumenFinal();
    } else {
        avanzarTurno();
    }
}



function avanzarTurno() {
    if (jugadores.length === 0) return;

    do {
        turnoActual = (turnoActual + 1) % jugadores.length;
    } while (jugadores[turnoActual]?.eliminado);

    enviarTurno();
}

function enviarTurno() {
    clearTimeout(turnoTimeout);

    if (!jugadores.length || turnoActual >= jugadores.length) return;

    const jugadorActual = jugadores[turnoActual];
    if (!jugadorActual) return;

    jugadores.forEach((j, i) => {
        if (j.readyState === WebSocket.OPEN) {
            j.send(JSON.stringify({
                type: "TURNO",
                tuTurno: i === turnoActual && !j.eliminado,
                jugadorEnTurno: jugadorActual.nombre,
            }));
        }
    });

    turnoTimeout = setTimeout(() => {
        jugadores[turnoActual].eliminado = true;
        broadcast({
            type: "MENSAJE",
            contenido: `${jugadores[turnoActual].nombre} fue eliminado por inactividad.`,
        });
        avanzarTurno();
    }, 60000); // 60 segundos
}

function calcularGanador(izq, der) {
    if (izq === der) return "Empate";
    return izq < der ? "Izquierdo" : "Derecho";
}

function broadcast(data) {
    const mensaje = JSON.stringify(data);
    jugadores.forEach((j) => {
        if (j.readyState === WebSocket.OPEN) {
            j.send(mensaje);
        }
    });
}

function enviarResumenFinal() {
    const sobrevivientes = jugadores.filter(j => !j.eliminado).map(j => j.nombre || "Jugador");

    broadcast({
        type: "RESUMEN",
        contenido: jugadasMultijugador,
        totales: {
            izquierdo: pesoIzquierdo,
            derecho: pesoDerecho,
        },
        sobrevivientes,
        ganador: calcularGanador(pesoIzquierdo, pesoDerecho),
        bloquesPorJugador,
    });

    jugadores.forEach(j => j.eliminado = false);
    jugadores = [];
    turnoActual = 0;
    pesoIzquierdo = 0;
    pesoDerecho = 0;
    totalJugadas = 0;
    bloquesTotales = 0;
    bloquesPorJugador = {};
    jugadasMultijugador = [];
}

// ----------------- Server Start -----------------
const PORT = 5000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor activo en http://localhost:${PORT}`);
});

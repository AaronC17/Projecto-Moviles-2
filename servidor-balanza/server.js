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

let jugadores = [];
let turnoActual = 0;
let pesoIzquierdo = 0;
let pesoDerecho = 0;
let totalJugadas = 0;
let bloquesTotales = 0;
let bloquesPorJugador = {};
let turnoTimeout = null;

const sesionesIndividuales = {};
const COLORES = ["red", "blue", "green", "orange", "purple"];

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
                                const peso = Math.floor(Math.random() * 19) + 2;
                                bloques.push({ color, peso });
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
                    const yaExiste = jugadores.find((j) => j.nombre === msg.jugador);
                    if (yaExiste) {
                        ws.send(JSON.stringify({
                            type: "ERROR",
                            mensaje: "Este nombre de jugador ya está en uso en esta partida.",
                        }));
                        ws.close();
                        return;
                    }

                    if (jugadores.length >= 3) {
                        ws.send(JSON.stringify({
                            type: "ERROR",
                            mensaje: "El número máximo de jugadores (4) ya ha sido alcanzado.",
                        }));
                        ws.close();
                        return;
                    }

                    if (!bloquesPorJugador[msg.jugador]) {
                        const bloques = [];
                        COLORES.forEach((color) => {
                            for (let i = 0; i < 2; i++) {
                                const peso = Math.floor(Math.random() * 19) + 2;
                                bloques.push({ color, peso });
                                bloquesTotales++;
                            }
                        });
                        bloquesPorJugador[msg.jugador] = bloques;
                    }

                    jugadores.push(ws);

                    broadcast({
                        type: "MENSAJE",
                        contenido: `${msg.jugador} se unió al juego.`,
                    });

                    broadcast({
                        type: "ENTRADA",
                        totalJugadores: jugadores.length,
                    });

                    enviarTurno();
                }
            }

            if (msg.type === "JUGADA") {
                if (ws.modo === "individual") {
                    const sesion = sesionesIndividuales[ws.nombre];
                    if (!sesion || sesion.terminado) return;

                    sesion.jugadas.push({ ...msg });
                    if (msg.lado === "izquierdo") sesion.pesoIzquierdo += msg.peso;
                    else if (msg.lado === "derecho") sesion.pesoDerecho += msg.peso;

                    ws.send(JSON.stringify({
                        type: "ACTUALIZAR_BALANZA",
                        izquierdo: sesion.pesoIzquierdo,
                        derecho: sesion.pesoDerecho,
                        jugador: msg.jugador,
                    }));

                    ws.send(JSON.stringify({
                        type: "MENSAJE",
                        contenido: `${msg.jugador} colocó ${msg.peso}g en lado ${msg.lado}`,
                    }));

                    if (sesion.jugadas.length >= 10) {
                        sesion.terminado = true;

                        const resumen = {
                            jugador: ws.nombre,
                            totales: {
                                izquierdo: sesion.pesoIzquierdo,
                                derecho: sesion.pesoDerecho,
                            },
                            contenido: sesion.jugadas,
                            sobrevivientes: [ws.nombre],
                            ganador:
                                sesion.pesoIzquierdo === sesion.pesoDerecho
                                    ? "Empate"
                                    : sesion.pesoIzquierdo < sesion.pesoDerecho
                                        ? "Izquierdo"
                                        : "Derecho",
                            bloquesPorJugador: {
                                [ws.nombre]: sesion.bloques,
                            },
                        };

                        ws.send(JSON.stringify({
                            type: "RESUMEN",
                            ...resumen,
                        }));
                    } else {
                        ws.send(JSON.stringify({
                            type: "TURNO",
                            tuTurno: true,
                            jugadorEnTurno: ws.nombre,
                        }));
                    }

                } else {
                    clearTimeout(turnoTimeout);
                    const jugadorActual = jugadores[turnoActual];
                    if (!jugadorActual) return;

                    const jugada = new Jugada({
                        jugador: msg.jugador,
                        turno: totalJugadas + 1,
                        peso: msg.peso,
                        equipo: 0,
                        eliminado: false,
                        color: msg.color,
                    });
                    await jugada.save();

                    if (msg.lado === "izquierdo") pesoIzquierdo += msg.peso;
                    else pesoDerecho += msg.peso;

                    broadcast({
                        type: "ACTUALIZAR_BALANZA",
                        izquierdo: pesoIzquierdo,
                        derecho: pesoDerecho,
                        jugador: msg.jugador,
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
            }
        } catch (err) {
            console.error("❌ Error:", err.message);
        }
    });

    ws.on("close", () => {
        console.log(`🔴 Jugador desconectado: ${ws.id}`);
        jugadores = jugadores.filter((j) => j !== ws);
        if (turnoActual >= jugadores.length) turnoActual = 0;
        enviarTurno();
    });
});

function avanzarTurno() {
    if (jugadores.length === 0) return;

    let intentos = 0;
    do {
        turnoActual = (turnoActual + 1) % jugadores.length;
        intentos++;
    } while (jugadores[turnoActual]?.eliminado && intentos < jugadores.length);

    enviarTurno();
}

function enviarTurno() {
    clearTimeout(turnoTimeout);

    if (!jugadores.length || turnoActual >= jugadores.length) {
        console.warn("⚠️ No hay jugadores activos para el turno.");
        return;
    }

    const jugadorActual = jugadores[turnoActual];
    if (!jugadorActual) return;

    const nombreActual = jugadorActual.nombre || `Jugador ${turnoActual + 1}`;

    jugadores.forEach((j, i) => {
        if (j.readyState === WebSocket.OPEN) {
            try {
                j.send(JSON.stringify({
                    type: "TURNO",
                    tuTurno: i === turnoActual && !j.eliminado,
                    jugadorEnTurno: nombreActual,
                }));
            } catch (err) {
                console.error("❌ Error al enviar turno:", err.message);
            }
        }
    });

    turnoTimeout = setTimeout(() => {
        const jugadorTimeout = jugadores[turnoActual];
        if (!jugadorTimeout) {
            console.warn("⚠️ Jugador ya no existe en turnoActual:", turnoActual);
            avanzarTurno();
            return;
        }

        if (!jugadorTimeout.eliminado) {
            jugadorTimeout.eliminado = true;
            try {
                jugadorTimeout.send(JSON.stringify({
                    type: "ELIMINADO",
                    mensaje: "Has sido eliminado por inactividad (60s sin mover bloque).",
                }));
            } catch (err) {
                console.error("❌ Error al notificar eliminación:", err.message);
            }

            broadcast({
                type: "MENSAJE",
                contenido: `${jugadorTimeout.nombre} fue eliminado por inactividad.`,
            });
        }

        avanzarTurno();
    }, 60000);
}

function broadcast(data) {
    const mensaje = typeof data === "string" ? data : JSON.stringify(data);
    jugadores.forEach((j) => {
        if (j.readyState === WebSocket.OPEN) {
            try {
                j.send(mensaje);
            } catch (err) {
                console.error("❌ Error al enviar broadcast:", err.message);
            }
        }
    });
}

async function enviarResumenFinal() {
    const jugadas = await Jugada.find().sort({ turno: 1 });

    const resumen = jugadas.map((j) => ({
        jugador: j.jugador,
        turno: j.turno,
        peso: j.peso,
        color: j.color || null,
    }));

    const sobrevivientes = jugadores
        .filter((j) => !j.eliminado)
        .map((j) => j.nombre || "Jugador");

    const ladoGanador =
        pesoIzquierdo === pesoDerecho
            ? "Empate"
            : pesoIzquierdo < pesoDerecho
                ? "Izquierdo"
                : "Derecho";

    broadcast({
        type: "RESUMEN",
        contenido: resumen,
        totales: {
            izquierdo: pesoIzquierdo,
            derecho: pesoDerecho,
        },
        sobrevivientes,
        ganador: ladoGanador,
        bloquesPorJugador,
    });
}

const PORT = 5000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
});

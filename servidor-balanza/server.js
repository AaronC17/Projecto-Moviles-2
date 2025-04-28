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

// Variables globales
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
let equipos = {};
let pesosPorColor = {};  // 🔥 Peso fijo global
let partidaEnCurso = false;

const COLORES = ["red", "blue", "green", "orange", "purple"];

function generaId(color) {
    return `${color}-${Math.random().toString(36).substr(2, 5)}-${Date.now()}`;
}

wss.on("connection", (ws) => {
    ws.id = Math.random().toString(36).substring(2);
    ws.eliminado = false;

    ws.on("message", async (data) => {
        try {
            const msg = JSON.parse(data);

            if (msg.type === "FORZAR_RESUMEN") {
                enviarResumenFinal();
                return;
            }

            if (msg.type === "ENTRADA") {
                ws.nombre = msg.jugador;
                ws.modo = msg.modo || "multijugador";

                if (ws.modo === "multijugador" && partidaEnCurso) {
                    ws.send(JSON.stringify({ type: "ERROR", mensaje: "La partida ya inició, no puedes ingresar." }));
                    ws.close();
                    return;
                }

                if (ws.modo === "multijugador" && !partidaEnCurso && Object.keys(pesosPorColor).length === 0) {
                    COLORES.forEach(color => {
                        pesosPorColor[color] = (Math.floor(Math.random() * 10) + 1) * 2;
                    });
                    console.log("Pesos generados por color:", pesosPorColor);
                }


                if (ws.modo === "individual") {
                    if (!sesionesIndividuales[ws.nombre]) {
                        const bloques = [];
                        COLORES.forEach(color => {
                            for (let i = 0; i < 2; i++) {
                                bloques.push({
                                    id: generaId(color),
                                    color,
                                    peso: pesosPorColor[color]  // 🔥 NO genera nuevo peso nunca
                                });
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
                    if (jugadores.find(j => j.nombre === msg.jugador)) {
                        ws.send(JSON.stringify({ type: "ERROR", mensaje: "Nombre duplicado" }));
                        ws.close();
                        return;
                    }
                    jugadores.push(ws);

                    if (!bloquesPorJugador[msg.jugador]) {
                        const arr = [];
                        COLORES.forEach(color => {
                            for (let i = 0; i < 2; i++) {
                                arr.push({
                                    id: generaId(color),
                                    color,
                                    peso: pesosPorColor[color]
                                });
                                bloquesTotales++;
                            }
                        });
                        bloquesPorJugador[msg.jugador] = arr;
                    }

                    ws.send(JSON.stringify({
                        type: "BLOQUES",
                        bloques: bloquesPorJugador[msg.jugador],
                    }));

                    broadcast({ type: "ENTRADA", totalJugadores: jugadores.length, pesosPorColor });

                    if (jugadores.length === 10) {
                        pesoIzquierdo = 0;
                        pesoDerecho = 0;
                        totalJugadas = 0;
                        jugadasMultijugador = [];
                        partidaEnCurso = true;
                        generarEquipos();
                        broadcast({ type: "PISTA", contenido: generarPista() });
                        enviarTurno();
                    }
                }
            }

            if (msg.type === "JUGADA") {
                if (ws.modo === "individual") procesarJugadaIndividual(ws, msg);
                else procesarJugadaMultijugador(ws, msg);
            }
        } catch (err) {
            console.error("❌ Error:", err.message);
        }
    });

    ws.on("close", () => {
        jugadores = jugadores.filter(j => j !== ws);
        broadcast({ type: "ENTRADA", totalJugadores: jugadores.length, pesosPorColor }); // 🔥 AÑADIDO
        if (turnoActual >= jugadores.length) turnoActual = 0;
        enviarTurno();
    });

});

function procesarJugadaIndividual(ws, msg) {
    const sesion = sesionesIndividuales[ws.nombre];
    if (!sesion || sesion.terminado) return;
    const peso = pesosPorColor[msg.color];

    sesion.jugadas.push({ ...msg, peso });

    if (msg.lado === "izquierdo") sesion.pesoIzquierdo += peso;
    else sesion.pesoDerecho += peso;

    ws.send(JSON.stringify({
        type: "ACTUALIZAR_BALANZA",
        izquierdo: sesion.pesoIzquierdo,
        derecho: sesion.pesoDerecho,
        bloque: { id: msg.id, color: msg.color, peso, lado: msg.lado },
    }));

    if (sesion.jugadas.length >= 10) {
        sesion.terminado = true;
        ws.send(JSON.stringify({
            type: "RESUMEN",
            contenido: sesion.jugadas,
            totales: { izquierdo: sesion.pesoIzquierdo, derecho: sesion.pesoDerecho },
            sobrevivientes: [ws.nombre],
            ganador: calcularGanador(sesion.pesoIzquierdo, sesion.pesoDerecho),
            bloquesPorJugador: { [ws.nombre]: sesion.bloques },
        }));
    } else {
        ws.send(JSON.stringify({
            type: "TURNO",
            tuTurno: true,
            jugadorEnTurno: ws.nombre,
        }));
    }
}

function procesarJugadaMultijugador(ws, msg) {
    clearTimeout(turnoTimeout);
    const peso = pesosPorColor[msg.color];

    if (msg.lado === "izquierdo") pesoIzquierdo += peso;
    else pesoDerecho += peso;

    const diff = Math.abs(pesoIzquierdo - pesoDerecho);

    if (totalJugadas > 0 && diff > 16) {
        ws.eliminado = true;
        broadcast({
            type: "MENSAJE",
            contenido: `${ws.nombre} fue eliminado por exceder 16 g de diferencia.`,
        });
        broadcast({
            type: "ACTUALIZAR_BALANZA",
            izquierdo: pesoIzquierdo,
            derecho: pesoDerecho,
            bloque: { id: msg.id, color: msg.color, peso, lado: msg.lado },
        });
        if (jugadores.filter(j => !j.eliminado).length === 1) {
            enviarResumenFinal();
            return;
        }
        avanzarTurno();
        return;
    }

    jugadasMultijugador.push({
        turno: totalJugadas + 1,
        jugador: msg.jugador,
        id: msg.id,
        color: msg.color,
        peso,
    });
    totalJugadas++;

    broadcast({
        type: "ACTUALIZAR_BALANZA",
        izquierdo: pesoIzquierdo,
        derecho: pesoDerecho,
        bloque: { id: msg.id, color: msg.color, peso, lado: msg.lado },
    });
    broadcast({
        type: "MENSAJE",
        contenido: `${msg.jugador} colocó ${peso}g en el lado ${msg.lado}.`,
    });

    if (totalJugadas >= bloquesTotales) {
        enviarResumenFinal();
    } else {
        avanzarTurno();
    }
}

function avanzarTurno() {
    if (!jugadores.length) return;
    const actualIndex = turnoActual;
    const jugadorActual = jugadores[actualIndex];

    let siguienteIndex = actualIndex;
    for (let i = 0; i < jugadores.length; i++) {
        siguienteIndex = (siguienteIndex + 1) % jugadores.length;
        const candidato = jugadores[siguienteIndex];
        if (!candidato.eliminado && equipos[jugadorActual.nombre] !== candidato.nombre) {
            turnoActual = siguienteIndex;
            enviarTurno();
            return;
        }
    }

    do {
        turnoActual = (turnoActual + 1) % jugadores.length;
    } while (jugadores[turnoActual]?.eliminado);
    enviarTurno();
}

function enviarTurno() {
    clearTimeout(turnoTimeout);
    const actual = jugadores[turnoActual];
    jugadores.forEach((j, i) => {
        if (j.readyState === WebSocket.OPEN) {
            j.send(JSON.stringify({
                type: "TURNO",
                tuTurno: i === turnoActual && !j.eliminado,
                jugadorEnTurno: actual.nombre,
            }));
        }
    });
    turnoTimeout = setTimeout(() => {
        jugadores[turnoActual].eliminado = true;
        broadcast({ type: "MENSAJE", contenido: `${jugadores[turnoActual].nombre} fue eliminado por inactividad.` });
        avanzarTurno();
    }, 300000);
}

function calcularGanador(izq, der) {
    if (izq === der) return "Empate";
    return izq < der ? "Izquierdo" : "Derecho";
}

function generarEquipos() {
    const mezclados = [...jugadores.map(j => j.nombre)].sort(() => Math.random() - 0.5);
    equipos = {};
    for (let i = 0; i < mezclados.length; i += 2) {
        const a = mezclados[i], b = mezclados[i + 1];
        equipos[a] = b;
        equipos[b] = a;
    }
    jugadores.forEach(j => {
        if (j.readyState === WebSocket.OPEN) {
            j.send(JSON.stringify({ type: "EQUIPO", compañero: equipos[j.nombre] }));
        }
    });
}

function generarPista() {
    const traducciones = {
        red: "rojo",
        blue: "azul",
        green: "verde",
        orange: "amarillo",
        purple: "morado",
    };

    const arr = Object.entries(pesosPorColor).map(([color, peso]) => ({ color, peso }));
    arr.sort((a, b) => b.peso - a.peso); // Ordenar de mayor a menor

    const idx = Math.floor(Math.random() * arr.length);
    const { color, peso } = arr[idx];

    let descripcion;
    switch (idx) {
        case 0:
            descripcion = "el más pesado";
            break;
        case 1:
            descripcion = "el segundo más pesado";
            break;
        case 2:
            descripcion = "el tercero más pesado";
            break;
        case 3:
            descripcion = "el cuarto más pesado";
            break;
        case 4:
            descripcion = "el más liviano";
            break;
        default:
            descripcion = `${idx + 1}º más pesado`;
            break;
    }

    return `🔎 Pista: El bloque ${traducciones[color]} es ${descripcion} y pesa ${peso} g.`;
}



function broadcast(data) {
    const msg = JSON.stringify(data);
    jugadores.forEach(j => {
        if (j.readyState === WebSocket.OPEN) j.send(msg);
    });
}

function enviarResumenFinal() {
    const sobrevivientes = jugadores.filter(j => !j.eliminado).map(j => j.nombre);
    broadcast({
        type: "RESUMEN",
        contenido: jugadasMultijugador,
        totales: { izquierdo: pesoIzquierdo, derecho: pesoDerecho },
        sobrevivientes,
        ganador: calcularGanador(pesoIzquierdo, pesoDerecho),
        bloquesPorJugador,
    });
    // reset
    jugadores = [];
    turnoActual = 0;
    pesoIzquierdo = 0;
    pesoDerecho = 0;
    totalJugadas = 0;
    bloquesTotales = 0;
    bloquesPorJugador = {};
    jugadasMultijugador = [];
    equipos = {};
    pesosPorColor = {};
    partidaEnCurso = false;
}


const PORT = 5000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor activo en http://localhost:${PORT}`);
});

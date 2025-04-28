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
let pesosPorColor = {};  // peso uniforme por color

const COLORES = ["red", "blue", "green", "orange", "purple"];

// Generador de IDs
function generaId(color) {
    return `${color}-${Math.random().toString(36).substr(2, 5)}-${Date.now()}`;
}

wss.on("connection", (ws) => {
    ws.id = Math.random().toString(36).substring(2);
    ws.eliminado = false;

    ws.on("message", async (data) => {
        try {
            const msg = JSON.parse(data);

            if (msg.type === "ENTRADA") {
                ws.nombre = msg.jugador;
                ws.modo = msg.modo || "multijugador";

                // 1) Generar pesosPorColor una sola vez al arrancar multijugador
                if (ws.modo === "multijugador" && Object.keys(pesosPorColor).length === 0) {
                    COLORES.forEach(color => {
                        pesosPorColor[color] = (Math.floor(Math.random() * 10) + 1) * 2;
                    });
                }

                if (ws.modo === "individual") {
                    // Sesión individual: bloques con ID + peso uniforme
                    if (!sesionesIndividuales[ws.nombre]) {
                        const bloques = [];
                        COLORES.forEach(color => {
                            for (let i = 0; i < 2; i++) {
                                bloques.push({
                                    id: generaId(color),
                                    color,
                                    peso: pesosPorColor[color]
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
                    // Multijugador
                    if (jugadores.find(j => j.nombre === msg.jugador)) {
                        ws.send(JSON.stringify({ type: "ERROR", mensaje: "Nombre duplicado" }));
                        ws.close();
                        return;
                    }
                    jugadores.push(ws);

                    // Crear bloques del jugador (si no existen), todos con ID únicos
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

                    // Enviar bloques iniciales al cliente
                    ws.send(JSON.stringify({
                        type: "BLOQUES",
                        bloques: bloquesPorJugador[msg.jugador],
                    }));

                    broadcast({ type: "ENTRADA", totalJugadores: jugadores.length });

                    if (jugadores.length === 10) {
                        // --- Reinicio de la balanza y conteo de jugadas ---
                        pesoIzquierdo = 0;
                        pesoDerecho = 0;
                        totalJugadas = 0;
                        jugadasMultijugador = [];

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
        broadcast({ type: "ENTRADA", totalJugadores: jugadores.length });
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

    if (diff > 20) {
        ws.eliminado = true;
        broadcast({ type: "MENSAJE", contenido: `${ws.nombre} fue eliminado por desequilibrar la balanza.` });
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

    jugadasMultijugador.push({ turno: totalJugadas + 1, jugador: msg.jugador, id: msg.id, color: msg.color, peso });
    totalJugadas++;

    broadcast({
        type: "ACTUALIZAR_BALANZA",
        izquierdo: pesoIzquierdo,
        derecho: pesoDerecho,
        bloque: { id: msg.id, color: msg.color, peso, lado: msg.lado },
    });

    broadcast({ type: "MENSAJE", contenido: `${msg.jugador} colocó ${peso}g en el lado ${msg.lado}` });

    if (totalJugadas >= bloquesTotales) {
        enviarResumenFinal();
    } else {
        avanzarTurno();
    }
}

function avanzarTurno() {
    if (!jugadores.length) return;
    do {
        turnoActual = (turnoActual + 1) % jugadores.length;
    } while (jugadores[turnoActual].eliminado);
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
    // Traductor de colores
    const traducciones = {
        red: "rojo",
        blue: "azul",
        green: "verde",
        orange: "naranja",
        purple: "morado",
    };

    // 1) Construir array de { color, peso }
    const arr = Object.entries(pesosPorColor).map(
        ([color, peso]) => ({ color, peso })
    );

    // 2) Ordenar de mayor a menor peso
    arr.sort((a, b) => b.peso - a.peso);

    // 3) Elegir un bloque al azar
    const idx = Math.floor(Math.random() * arr.length);
    const { color, peso } = arr[idx];

    // 4) Ordinales en español
    const ordinales = ["primero", "segundo", "tercero", "cuarto", "quinto"];
    const ordinal = ordinales[idx] || `${idx + 1}º`;

    // 5) Devolver la pista
    return `🔎 Pista: El bloque ${traducciones[color]} es el ${ordinal} más pesado y pesa ${peso} g.`;
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
}

const PORT = 5000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor activo en http://localhost:${PORT}`);
});

// server.js

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

// ─── Variables globales ────────────────────────────────────────────────────────
let jugadores = [];
let jugadoresExpulsados = [];
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
let pesosPorColor = {};
let partidaEnCurso = false;

const COLORES = ["red", "blue", "green", "orange", "purple"];

function generaId(color) {
    return `${color}-${Math.random().toString(36).substr(2, 5)}-${Date.now()}`;
}

// ─── WebSocket ────────────────────────────────────────────────────────────────
wss.on("connection", (ws) => {
    ws.eliminado = false;

    ws.on("message", async (data) => {
        try {
            const msg = JSON.parse(data);

            if (msg.type === "FORZAR_RESUMEN") {
                enviarResumenFinal();
                return;
            }

            if (msg.type === "ENTRADA") {
                // Expulsados no pueden volver a entrar
                if (jugadoresExpulsados.includes(msg.jugador)) {
                    ws.send(JSON.stringify({
                        type: "ERROR",
                        mensaje: "No puedes volver a entrar, fuiste expulsado de esta partida."
                    }));
                    ws.close();
                    return;
                }

                ws.nombre = msg.jugador;
                ws.modo = msg.modo || "multijugador";

                // Si multijugador y partida ya empezó => rechazar
                if (ws.modo === "multijugador" && partidaEnCurso) {
                    ws.send(JSON.stringify({
                        type: "ERROR",
                        mensaje: "La partida ya inició, no puedes ingresar."
                    }));
                    ws.close();
                    return;
                }

                // Generar pesos por color al iniciar la primera conexión multijugador
                if (ws.modo === "multijugador" && !partidaEnCurso && Object.keys(pesosPorColor).length === 0) {
                    COLORES.forEach(color => {
                        pesosPorColor[color] = (Math.floor(Math.random() * 10) + 1) * 2;
                    });
                    console.log("🎯 Pesos generados por color:", pesosPorColor);
                }

                // ─── MODO INDIVIDUAL ────────────────────────────────────────────
                if (ws.modo === "individual") {
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
                    return;
                }

                // ─── MODO MULTIJUGADOR ──────────────────────────────────────────
                // prevenir duplicados
                if (jugadores.find(j => j.nombre === msg.jugador)) {
                    ws.send(JSON.stringify({ type: "ERROR", mensaje: "Nombre duplicado" }));
                    ws.close();
                    return;
                }
                jugadores.push(ws);

                // crear bloques del jugador
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

                // enviar bloques iniciales
                ws.send(JSON.stringify({
                    type: "BLOQUES",
                    bloques: bloquesPorJugador[msg.jugador],
                }));

                broadcast({ type: "ENTRADA", totalJugadores: jugadores.length, pesosPorColor });

                // si llegamos a 10, arrancar partida
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
        // expulsar quien se desconecta
        if (ws.nombre) jugadoresExpulsados.push(ws.nombre);

        // quitarlo de jugadores activos
        jugadores = jugadores.filter(j => j !== ws);

        // si partida no empezó, actualizar contador y seguir esperando
        if (!partidaEnCurso) {
            broadcast({ type: "ENTRADA", totalJugadores: jugadores.length, pesosPorColor });
        }

        // si ya no quedan, resetear todo
        if (jugadores.length === 0) {
            resetearServidor();
            return;
        }

        // si partida en curso, avanzamos turno
        if (partidaEnCurso) {
            if (turnoActual >= jugadores.length) turnoActual = 0;
            avanzarTurno();
        }
    });
});

// ─── LÓGICA INDIVIDUAL ────────────────────────────────────────────────────────
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
            totales: {
                izquierdo: sesion.pesoIzquierdo,
                derecho: sesion.pesoDerecho
            },
            sobrevivientes: [ws.nombre],
            ganador: calcularGanador(sesion.pesoIzquierdo, sesion.pesoDerecho),
            bloquesPorJugador: { [ws.nombre]: sesion.bloques },
        }));
    } else {
        ws.send(JSON.stringify({
            type: "TURNO",
            tuTurno: true,
            jugadorEnTurno: ws.nombre
        }));
    }
}

// ─── LÓGICA MULTIJUGADOR ─────────────────────────────────────────────────────
function procesarJugadaMultijugador(ws, msg) {
    clearTimeout(turnoTimeout);
    const peso = pesosPorColor[msg.color];
    if (msg.lado === "izquierdo") pesoIzquierdo += peso;
    else pesoDerecho += peso;

    const diff = Math.abs(pesoIzquierdo - pesoDerecho);
    if (totalJugadas > 0 && diff > 16) {
        ws.eliminado = true;
        broadcast({ type: "MENSAJE", contenido: `${ws.nombre} fue eliminado por exceder 16 g de diferencia.` });
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

    // ─── Verificar si el último vivo ya usó todos sus bloques ───────
    const vivos = jugadores.filter(j => !j.eliminado);
    if (vivos.length === 1) {
        const ultimo = vivos[0];
        const totalBloques = bloquesPorJugador[ultimo.nombre]?.length || 0;
        const usadas = jugadasMultijugador.filter(j => j.jugador === ultimo.nombre).length;
        if (usadas >= totalBloques) {
            enviarResumenFinal();
            return;
        }
    }

    broadcast({
        type: "ACTUALIZAR_BALANZA",
        izquierdo: pesoIzquierdo,
        derecho: pesoDerecho,
        bloque: { id: msg.id, color: msg.color, peso, lado: msg.lado },
    });
    broadcast({ type: "MENSAJE", contenido: `${msg.jugador} colocó ${peso}g en el lado ${msg.lado}.` });

    if (totalJugadas >= bloquesTotales) {
        enviarResumenFinal();
    } else {
        avanzarTurno();
    }
}

// ─── AVANZAR TURNO ──────────────────────────────────────────────────────────
function avanzarTurno() {
    if (!jugadores.length) return;
    const actualIndex = turnoActual;
    const jugadorActual = jugadores[actualIndex];

    let siguiente = actualIndex;
    for (let i = 0; i < jugadores.length; i++) {
        siguiente = (siguiente + 1) % jugadores.length;
        const cand = jugadores[siguiente];
        if (!cand.eliminado && equipos[jugadorActual.nombre] !== cand.nombre) {
            turnoActual = siguiente;
            enviarTurno();
            return;
        }
    }

    do {
        turnoActual = (turnoActual + 1) % jugadores.length;
    } while (jugadores[turnoActual]?.eliminado);
    enviarTurno();
}

// ─── ENVIAR TURNO ───────────────────────────────────────────────────────────
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
    }, 300_000);
}

// ─── CALCULAR GANADOR ────────────────────────────────────────────────────────
function calcularGanador(izq, der) {
    if (izq === der) return "Empate";
    return izq < der ? "Izquierdo" : "Derecho";
}

// ─── GENERAR EQUIPOS ─────────────────────────────────────────────────────────
function generarEquipos() {
    const names = jugadores.map(j => j.nombre).sort(() => Math.random() - 0.5);
    equipos = {};
    for (let i = 0; i < names.length; i += 2) {
        const a = names[i], b = names[i + 1];
        equipos[a] = b;
        equipos[b] = a;
    }
    jugadores.forEach(j => {
        if (j.readyState === WebSocket.OPEN) {
            j.send(JSON.stringify({ type: "EQUIPO", compañero: equipos[j.nombre] }));
        }
    });
}

// ─── GENERAR PISTA ───────────────────────────────────────────────────────────
function generarPista() {
    const tradu = { red: "rojo", blue: "azul", green: "verde", orange: "naranja", purple: "morado" };
    const arr = Object.entries(pesosPorColor).map(([c, p]) => ({ color: c, peso: p }));
    arr.sort((a, b) => b.peso - a.peso);
    const idx = Math.floor(Math.random() * arr.length);
    const { color, peso } = arr[idx];
    const descs = ["el más pesado", "el segundo más pesado", "el tercero más pesado", "el cuarto más pesado", "el más liviano"];
    const desc = idx < descs.length ? descs[idx] : `${idx + 1}º más pesado`;
    return `🔎 Pista: El bloque ${tradu[color]} es ${desc} y pesa ${peso} g.`;
}

// ─── BROADCAST ──────────────────────────────────────────────────────────────
function broadcast(data) {
    const m = JSON.stringify(data);
    jugadores.forEach(j => {
        if (j.readyState === WebSocket.OPEN) j.send(m);
    });
}

// ─── ENVÍO DE RESUMEN FINAL ─────────────────────────────────────────────────
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
    resetearServidor();
}

// ─── RESETEAR SERVIDOR ───────────────────────────────────────────────────────
function resetearServidor() {
    jugadores = [];
    turnoActual = 0;
    pesoIzquierdo = 0;
    pesoDerecho = 0;
    totalJugadas = 0;
    bloquesTotales = 0;
    bloquesPorJugador = {};
    sesionesIndividuales = {};
    jugadasMultijugador = [];
    equipos = {};
    pesosPorColor = {};
    partidaEnCurso = false;
    jugadoresExpulsados = [];
    console.log("🔄 Servidor reseteado: esperando nueva partida.");
}

// ─── INICIAR SERVER ─────────────────────────────────────────────────────────
const PORT = 5000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor activo en http://localhost:${PORT}`);
});

import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
} from "react-native";

const traducirColor = (colorIngles) => {
    const traducciones = {
        red: "rojo",
        blue: "azul",
        green: "verde",
        orange: "amarillo", // 🔥 Cambiado a amarillo
        purple: "morado",
    };
    return traducciones[colorIngles] || colorIngles;
};

export default function ResultScreen() {
    const { resumen, nombre } = useLocalSearchParams();
    const router = useRouter();
    const resumenData = JSON.parse(decodeURIComponent(resumen));

    const esSobreviviente = resumenData.sobrevivientes.includes(nombre);
    const misBloques = resumenData.bloquesPorJugador[nombre] || [];

    const [adivinanzas, setAdivinanzas] = useState({});
    const [resultadoAciertos, setResultadoAciertos] = useState(null);
    const [enviando, setEnviando] = useState(false);

    const bloquesUnicos = [];
    const coloresVistos = new Set();
    misBloques.forEach((bloque) => {
        if (!coloresVistos.has(bloque.color)) {
            coloresVistos.add(bloque.color);
            bloquesUnicos.push(bloque);
        }
    });

    const enviarAdivinanza = async () => {
        setEnviando(true);
        let aciertos = 0;
        const detalle = [];

        bloquesUnicos.forEach((bloque, i) => {
            const intento = parseInt(adivinanzas[i]);
            const acertado = intento === bloque.peso;
            if (acertado) aciertos++;
            detalle.push({ intento, pesoReal: bloque.peso, acertado });
        });

        try {
            await fetch("http://192.168.100.101:5000/adivinanzas", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jugador: nombre,
                    bloques: detalle,
                    aciertos,
                }),
            });
            setResultadoAciertos(aciertos);
        } catch (error) {
            console.error("❌ Error al registrar adivinanza:", error.message);
        }
        setEnviando(false);
    };

    const frasesFinales = [
        "¡Excelente memoria visual!",
        "¡Nada mal! Podés mejorar aún más.",
        "¡Qué puntería!",
        "¡Buena intuición!",
        "¡Toca practicar más, pero vas bien!",
    ];

    const fraseAleatoria = () => {
        const idx = Math.min(resultadoAciertos, frasesFinales.length - 1);
        return frasesFinales[idx];
    };

    return (
        <ScrollView style={{ padding: 20, backgroundColor: '#f7fafd' }}>
            <Text style={styles.titulo}>🏁 Juego Finalizado</Text>

            <View style={styles.resumenBox}>
                <Text style={styles.textoResumen}>⚖️ <Text style={styles.bold}>Izquierdo:</Text> {resumenData.totales.izquierdo}g</Text>
                <Text style={styles.textoResumen}>⚖️ <Text style={styles.bold}>Derecho:</Text> {resumenData.totales.derecho}g</Text>
                <Text style={styles.textoResumen}>🥇 <Text style={styles.bold}>Ganador:</Text> {resumenData.ganador}</Text>
                <Text style={styles.textoResumen}>🧍 <Text style={styles.bold}>Sobrevivientes:</Text> {resumenData.sobrevivientes.join(", ") || "Ninguno"}</Text>
            </View>

            <Text style={styles.subtitulo}>📜 Jugadas:</Text>
            <View style={styles.jugadasBox}>
                {resumenData.contenido.length > 0 ? resumenData.contenido.map((j, i) => (
                    <Text key={i}>• Turno {j.turno}: {j.jugador} colocó {j.peso}g ({traducirColor(j.color)})</Text>
                )) : <Text style={{ fontStyle: 'italic' }}>No hubo jugadas registradas.</Text>}
            </View>

            {esSobreviviente && resultadoAciertos === null && (
                <View style={{ marginTop: 30 }}>
                    <Text style={styles.subtitulo}>🎯 Adivina el peso de tus bloques</Text>
                    {bloquesUnicos.map((bloque, i) => {
                        const colorPastel = {
                            red: '#f9a3a3',     // 🔥 Rojo pastel corregido
                            blue: '#a3d8f4',
                            green: '#b8e994',
                            orange: '#fff7ae',  // 🔥 Amarillo pastel
                            purple: '#d7bce8',
                        }[bloque.color] || '#eee';

                        return (
                            <View key={i} style={styles.bloqueBox}>
                                <Text>Bloque {i + 1} (color {traducirColor(bloque.color)}):</Text>
                                <ScrollView horizontal>
                                    {[...Array(10)].map((_, n) => {
                                        const valor = (n + 1) * 2;
                                        const seleccionado = adivinanzas[i] === valor;
                                        return (
                                            <TouchableOpacity
                                                key={valor}
                                                onPress={() =>
                                                    setAdivinanzas((prev) => ({
                                                        ...prev,
                                                        [i]: valor,
                                                    }))
                                                }
                                                style={[
                                                    styles.valorBtn,
                                                    { backgroundColor: colorPastel },
                                                    seleccionado && styles.valorActivo,
                                                ]}
                                            >
                                                <Text style={seleccionado ? styles.valorBtnTextoActivo : {}}>
                                                    {valor}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                        );
                    })}

                    <TouchableOpacity
                        style={styles.boton}
                        onPress={enviarAdivinanza}
                        disabled={enviando}
                    >
                        <Text style={styles.botonTexto}>✅ Enviar adivinanza</Text>
                    </TouchableOpacity>
                    {enviando && <ActivityIndicator style={{ marginTop: 10 }} color="blue" />}
                </View>
            )}

            {resultadoAciertos !== null && (
                <View style={{ alignItems: 'center', marginTop: 30 }}>
                    <Text style={styles.aciertos}>🎉 ¡Adivinaste correctamente {resultadoAciertos} de {bloquesUnicos.length} bloques!</Text>
                    <Text style={styles.frase}>{fraseAleatoria()}</Text>
                </View>
            )}

            <TouchableOpacity
                onPress={() => router.replace("/")}
                style={[styles.boton, { backgroundColor: "#444", marginTop: 40 }]}
            >
                <Text style={styles.botonTexto}>🔄 Volver al inicio</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    titulo: { fontSize: 24, fontWeight: "bold", marginBottom: 20, textAlign: "center" },
    subtitulo: { fontSize: 18, fontWeight: "bold", marginTop: 30, marginBottom: 10 },
    aciertos: { fontSize: 18, fontWeight: "bold", color: "green", marginBottom: 6 },
    frase: { fontSize: 16, fontStyle: "italic", color: "#444" },
    boton: {
        backgroundColor: "#2c3e50",
        padding: 12,
        borderRadius: 8,
        alignItems: "center",
    },
    botonTexto: { color: "white", fontWeight: "bold", fontSize: 16 },
    resumenBox: {
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 15,
        marginBottom: 20,
        elevation: 2,
    },
    textoResumen: {
        fontSize: 16,
        marginBottom: 4,
    },
    bold: { fontWeight: 'bold' },
    jugadasBox: {
        backgroundColor: '#fff',
        padding: 12,
        borderRadius: 8,
        elevation: 1,
    },
    bloqueBox: {
        marginBottom: 15,
    },
    valorBtn: {
        padding: 10,
        margin: 3,
        borderWidth: 1,
        borderColor: '#bbb',
        borderRadius: 6,
        minWidth: 40,
        alignItems: 'center',
    },
    valorActivo: {
        backgroundColor: '#2c3e50', // 🔥 Azul oscuro
        borderColor: '#00307a',
    },
    valorBtnTextoActivo: {
        color: 'white',
        fontWeight: 'bold',
    },
});

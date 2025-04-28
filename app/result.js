// ResultScreen.js

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

const traducirColor = (colorIngles) => {
    const traducciones = {
        red: 'rojo',
        blue: 'azul',
        green: 'verde',
        orange: 'amarillo',
        purple: 'morado',
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
        const detalle = bloquesUnicos.map((bloque, i) => {
            const intento = parseInt(adivinanzas[i], 10);
            const acertado = intento === bloque.peso;
            if (acertado) aciertos++;
            return { intento, pesoReal: bloque.peso, acertado };
        });

        try {
            await fetch('http://192.168.100.101:5000/adivinanzas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jugador: nombre, bloques: detalle, aciertos }),
            });
            setResultadoAciertos(aciertos);
        } catch (error) {
            console.error('❌ Error al registrar adivinanza:', error.message);
        }
        setEnviando(false);
    };

    const fraseFinal = () => {
        switch (resultadoAciertos) {
            case 0:
                return 'No acertaste ningún bloque, ¡toca practicar más!';
            case 1:
                return '¡Toca practicar más, pero vas bien!';
            case 2:
                return '¡Nada mal! Podés mejorar aún más.';
            case 3:
                return '¡Vas bastante bien!';
            case 4:
                return '¡Muy buena intuición!';
            case 5:
                return '¡Excelente memoria visual!';
            default:
                return '';
        }
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            <View style={styles.innerContainer}>

                {/* Pesos Izquierdo / Derecho */}
                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        <Text style={styles.statIcon}>⚖️</Text>
                        <Text style={styles.statLabel}>Izquierdo</Text>
                        <Text style={styles.statValue}>{resumenData.totales.izquierdo} g</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statIcon}>⚖️</Text>
                        <Text style={styles.statLabel}>Derecho</Text>
                        <Text style={styles.statValue}>{resumenData.totales.derecho} g</Text>
                    </View>
                </View>

                {/* Sobrevivientes */}
                <View style={styles.survivorsContainer}>
                    <Text style={styles.statIcon}>🧍</Text>
                    <Text style={styles.statLabel}>Sobrevivientes</Text>
                    <View style={styles.chips}>
                        {resumenData.sobrevivientes.map((j) => (
                            <View key={j} style={styles.chip}>
                                <Text style={styles.chipText}>{j}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Adivinanza */}
                {esSobreviviente && resultadoAciertos === null && (
                    <>
                        <Text style={styles.subtitulo}>🎯 Adivina el peso de tus bloques</Text>
                        {bloquesUnicos.map((bloque, i) => {
                            const colorPastel = {
                                red: '#f9a3a3',
                                blue: '#a3d8f4',
                                green: '#b8e994',
                                orange: '#fff7ae',
                                purple: '#d7bce8',
                            }[bloque.color] || '#eee';

                            return (
                                <View key={i} style={styles.bloqueBox}>
                                    <Text>Bloque {i + 1} (color {traducirColor(bloque.color)}):</Text>
                                    <View style={styles.selectorRow}>
                                        {[...Array(10)].map((_, n) => {
                                            const valor = (n + 1) * 2;
                                            const seleccionado = adivinanzas[i] === valor;
                                            return (
                                                <TouchableOpacity
                                                    key={valor}
                                                    onPress={() =>
                                                        setAdivinanzas((prev) => ({ ...prev, [i]: valor }))
                                                    }
                                                    style={[
                                                        styles.valorBtn,
                                                        { backgroundColor: colorPastel },
                                                        seleccionado && styles.valorActivo,
                                                    ]}
                                                >
                                                    <Text
                                                        style={seleccionado && styles.valorBtnTextoActivo}
                                                    >
                                                        {valor}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>
                            );
                        })}

                        <TouchableOpacity style={styles.boton} onPress={enviarAdivinanza} disabled={enviando}>
                            <Text style={styles.botonTexto}>✅ Enviar adivinanza</Text>
                        </TouchableOpacity>
                        {enviando && <ActivityIndicator style={{ marginTop: 10 }} color="blue" />}
                    </>
                )}

                {resultadoAciertos !== null && (
                    <View style={styles.resultadoSection}>
                        <Text style={styles.aciertos}>
                            🎉 ¡Adivinaste correctamente {resultadoAciertos} de {bloquesUnicos.length} bloques!
                        </Text>
                        <Text style={styles.frase}>{fraseFinal()}</Text>
                    </View>
                )}

                <TouchableOpacity
                    onPress={() => router.replace('/')}
                    style={[styles.boton, { backgroundColor: '#444' }]}
                >
                    <Text style={styles.botonTexto}>🔄 Volver al inicio</Text>
                </TouchableOpacity>

            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f7fafd',
    },
    contentContainer: {
        flexGrow: 1,
        alignItems: 'center',
        paddingVertical: 20,
        paddingHorizontal: 16,
    },
    innerContainer: {
        width: '100%',
        maxWidth: 400,
        alignSelf: 'center',
    },
    statsGrid: {
        flexDirection: 'row',
        width: '100%',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginVertical: 16,
    },
    statCard: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 16,
        marginHorizontal: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ddd',
        elevation: 3,
    },
    survivorsContainer: {
        width: '100%',
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 16,
        marginVertical: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ddd',
        elevation: 3,
    },
    statIcon: {
        fontSize: 28,
        marginBottom: 8,
    },
    statLabel: {
        fontSize: 14,
        color: '#444',
    },
    statValue: {
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: 4,
        color: '#222',
    },
    chips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        marginTop: 6,
    },
    chip: {
        backgroundColor: '#2c3e50',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 4,
        margin: 4,
    },
    chipText: {
        fontSize: 12,
        color: '#fff',
    },
    subtitulo: {
        fontSize: 18,
        fontWeight: 'bold',
        marginTop: 30,
        marginBottom: 10,
        textAlign: 'center',
    },
    bloqueBox: {
        width: '100%',
        alignItems: 'center',
        marginBottom: 15,
    },
    selectorRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        width: '100%',
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
        backgroundColor: '#2c3e50',
        borderColor: '#00307a',
    },
    valorBtnTextoActivo: {
        color: 'white',
        fontWeight: 'bold',
    },
    boton: {
        backgroundColor: '#2c3e50',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
        width: '100%',
        maxWidth: 400,
        marginTop: 20,
    },
    botonTexto: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    },
    resultadoSection: {
        alignItems: 'center',
        marginTop: 30,
    },
    aciertos: {
        fontSize: 18,
        fontWeight: 'bold',
        color: 'green',
        marginBottom: 6,
    },
    frase: {
        fontSize: 16,
        fontStyle: 'italic',
        color: '#444',
        textAlign: 'center',
    },
});

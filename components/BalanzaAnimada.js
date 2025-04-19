import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";

export default function BalanzaAnimada({ pesoIzq, pesoDer, bloquesIzq, bloquesDer, setDropAreas }) {
    const inclinacionAnimada = useRef(new Animated.Value(0)).current;
    const refIzq = useRef(null);
    const refDer = useRef(null);
    const [bloquesAnimados, setBloquesAnimados] = useState(new Set());

    useEffect(() => {
        const diff = pesoIzq - pesoDer;
        const inclinacionFinal = Math.max(Math.min(diff, 50), -50);

        Animated.timing(inclinacionAnimada, {
            toValue: inclinacionFinal,
            duration: 500,
            useNativeDriver: true,
        }).start();
    }, [pesoIzq, pesoDer]);

    useEffect(() => {
        if (refIzq.current) {
            refIzq.current.measureInWindow((x, y, width, height) => {
                setDropAreas((prev) => ({ ...prev, izquierdo: { x, y, width, height } }));
            });
        }
        if (refDer.current) {
            refDer.current.measureInWindow((x, y, width, height) => {
                setDropAreas((prev) => ({ ...prev, derecho: { x, y, width, height } }));
            });
        }
    }, [bloquesIzq.length, bloquesDer.length]);

    const renderBloques = (bloques, lado) =>
        bloques.map((bloque, i) => {
            const key = `${lado}-${bloque.color}-${bloque.peso}-${i}`;
            const yaAnimado = bloquesAnimados.has(key);

            const styleBase = [
                styles.miniBloque,
                { backgroundColor: bloque.color },
            ];

            if (yaAnimado) {
                return <View key={key} style={styleBase} />;
            }

            const anim = new Animated.Value(0);
            Animated.spring(anim, {
                toValue: 1,
                friction: 5,
                useNativeDriver: true,
            }).start();

            setBloquesAnimados((prev) => new Set(prev).add(key));

            return (
                <Animated.View
                    key={key}
                    style={[
                        ...styleBase,
                        {
                            transform: [
                                {
                                    translateY: anim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [-20, 0],
                                    }),
                                },
                            ],
                            opacity: anim,
                        },
                    ]}
                />
            );
        });

    return (
        <View style={styles.wrapper}>
            <Text style={styles.titulo}>⚖️ Balanza</Text>

            <View style={styles.soporte}>
                <View style={styles.baseVertical} />

                <Animated.View
                    style={[
                        styles.barra,
                        {
                            transform: [
                                {
                                    rotate: inclinacionAnimada.interpolate({
                                        inputRange: [-50, 0, 50],
                                        outputRange: ["10deg", "0deg", "-10deg"],
                                    }),
                                },
                            ],
                        },
                    ]}
                >
                    {/* CUERDAS */}
                    <View style={styles.cuerdaIzq} />
                    <View style={styles.cuerdaDer} />

                    {/* PLATO IZQ */}
                    <View style={styles.platoIzq}>
                        <Text style={styles.pesoTextoInclinado}>{pesoIzq}g</Text>
                        <View ref={refIzq} style={styles.platoCaja}>
                            {renderBloques(bloquesIzq, "izq")}
                        </View>
                    </View>

                    {/* PLATO DER */}
                    <View style={styles.platoDer}>
                        <Text style={styles.pesoTextoInclinado}>{pesoDer}g</Text>
                        <View ref={refDer} style={styles.platoCaja}>
                            {renderBloques(bloquesDer, "der")}
                        </View>
                    </View>
                </Animated.View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        alignItems: "center",
        marginTop: 30,
    },
    titulo: {
        marginBottom: 10,
        fontSize: 18,
        fontWeight: "bold",
        color: "#333",
    },
    soporte: {
        height: 200,
        justifyContent: "flex-start",
        alignItems: "center",
    },
    baseVertical: {
        width: 8,
        height: 70,
        backgroundColor: "#666",
        borderRadius: 4,
    },
    barra: {
        width: 270,
        height: 15,
        backgroundColor: "#2c3e50",
        borderRadius: 6,
        marginTop: -6,
        justifyContent: "center",
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    cuerdaIzq: {
        position: "absolute",
        left: 46,          // alineado con el centro del cuadro izquierdo
        bottom: -14,       // lo ajustamos para que baje desde la barra hasta el cuadro
        width: 2,
        height: 15,
        backgroundColor: "#2c3e50",
        zIndex: 3,
    },
    cuerdaDer: {
        position: "absolute",
        right: 48,         // alineado con el centro del cuadro derecho
        bottom: -14,
        width: 2,
        height: 15,
        backgroundColor: "#2c3e50",
        zIndex: 3,
    },

    platoIzq: {
        position: "absolute",
        left: 0,
        bottom: -110,
        alignItems: "center",
    },
    platoDer: {
        position: "absolute",
        right: 0,
        bottom: -110,
        alignItems: "center",
    },
    platoCaja: {
        width: 96,
        height: 96,
        backgroundColor: "#f5f5f5",
        borderRadius: 10,
        padding: 4,
        flexWrap: "wrap",
        flexDirection: "row",
        justifyContent: "flex-start",
        alignItems: "flex-start",
        borderWidth: 1,
        borderColor: "#ccc",
        shadowColor: "ray",
        shadowOpacity: 0.1,
        shadowOffset: { width: 1, height: 1 },
        shadowRadius: 3,
    },
    pesoTextoInclinado: {
        position: "absolute",
        bottom: 11,
        fontSize: 12,
        fontWeight: "bold",
        color: "black",
        paddingHorizontal: 5,
        borderRadius: 5,
        zIndex: 2,
    },
    miniBloque: {
        width: 15,
        height: 15,
        borderRadius: 4,
        margin: 1.5,
        elevation: 1.5,
    },
});

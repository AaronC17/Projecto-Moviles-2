import React, { useRef, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    Animated,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';

export default function BalanzaAnimada({
    pesoIzq,
    pesoDer,
    bloquesIzq,
    bloquesDer,
    setDropAreas,
    allowRemove = true,
    onRemove,
    onPlace,
}) {
    const inclinAnim = useRef(new Animated.Value(0)).current;
    const refIzq = useRef(null);
    const refDer = useRef(null);

    const barraIzq = useRef(new Animated.Value(0)).current;
    const barraDer = useRef(new Animated.Value(0)).current;

    const pesoMaximo = 200; // Peso máximo para llenar la barra

    useEffect(() => {
        const diff = pesoIzq - pesoDer;
        const final = Math.max(Math.min(diff, 50), -50);
        Animated.timing(inclinAnim, {
            toValue: final,
            duration: 400,
            useNativeDriver: true,
        }).start();

        Animated.timing(barraIzq, {
            toValue: Math.min(pesoIzq / pesoMaximo, 1),
            duration: 500,
            useNativeDriver: false,
        }).start();

        Animated.timing(barraDer, {
            toValue: Math.min(pesoDer / pesoMaximo, 1),
            duration: 500,
            useNativeDriver: false,
        }).start();
    }, [pesoIzq, pesoDer]);

    const medirAreas = useCallback(() => {
        if (refIzq.current) {
            refIzq.current.measureInWindow((x, y, width, height) =>
                setDropAreas(prev => ({ ...prev, izquierdo: { x, y, width, height } }))
            );
        }
        if (refDer.current) {
            refDer.current.measureInWindow((x, y, width, height) =>
                setDropAreas(prev => ({ ...prev, derecho: { x, y, width, height } }))
            );
        }
    }, [setDropAreas]);

    useEffect(() => {
        setTimeout(medirAreas, 200);
    }, [bloquesIzq.length, bloquesDer.length, medirAreas]);

    const agruparBloques = (bloques) => {
        const agrupados = {};
        bloques.forEach(b => {
            agrupados[b.color] = (agrupados[b.color] || 0) + 1;
        });
        return Object.entries(agrupados).map(([color, cantidad]) => ({ color, cantidad }));
    };

    const renderBloques = (bloques, lado) =>
        agruparBloques(bloques).map((b, idx) => (
            <View
                key={`${lado}-${b.color}-${idx}`}
                style={{ alignItems: 'center', margin: 3 }}
                onStartShouldSetResponder={() => true}
                onResponderLongPress={() => {
                    if (allowRemove && onRemove) onRemove(b, lado);
                }}
            >
                <View style={[styles.miniBloque, { backgroundColor: b.color, justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={styles.cantidadTexto}>{b.cantidad}</Text>
                </View>
            </View>
        ));

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
                                    rotate: inclinAnim.interpolate({
                                        inputRange: [-50, 0, 50],
                                        outputRange: ['10deg', '0deg', '-10deg'],
                                    }),
                                },
                            ],
                        },
                    ]}
                >
                    <View style={styles.cuerdaIzq} />
                    <View style={styles.cuerdaDer} />

                    {/* Platillo izquierdo */}
                    <TouchableOpacity
                        ref={refIzq}
                        onLayout={medirAreas}
                        onPress={() => onPlace && onPlace('izquierdo')}
                        activeOpacity={0.6}
                        style={styles.platoIzq}
                    >
                        <View style={[styles.platoCaja, styles.dropZona]}>
                            {renderBloques(bloquesIzq, 'izq')}
                        </View>
                        <View style={styles.progresoWrapper}>
                            <Animated.View style={[styles.progresoBarra, {
                                width: barraIzq.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0%', '100%'],
                                })
                            }]} />
                        </View>
                        <Text style={styles.pesoTexto}>{pesoIzq} g</Text> {/* 🔥 peso mostrado */}
                    </TouchableOpacity>

                    {/* Platillo derecho */}
                    <TouchableOpacity
                        ref={refDer}
                        onLayout={medirAreas}
                        onPress={() => onPlace && onPlace('derecho')}
                        activeOpacity={0.6}
                        style={styles.platoDer}
                    >
                        <View style={[styles.platoCaja, styles.dropZona]}>
                            {renderBloques(bloquesDer, 'der')}
                        </View>
                        <View style={styles.progresoWrapper}>
                            <Animated.View style={[styles.progresoBarra, {
                                width: barraDer.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0%', '100%'],
                                })
                            }]} />
                        </View>
                        <Text style={styles.pesoTexto}>{pesoDer} g</Text> {/* 🔥 peso mostrado */}
                    </TouchableOpacity>

                </Animated.View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        alignItems: 'center',
        marginTop: 30,
    },
    titulo: {
        marginBottom: 10,
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    soporte: {
        height: 240,
        justifyContent: 'flex-start',
        alignItems: 'center',
    },
    baseVertical: {
        width: 8,
        height: 70,
        backgroundColor: '#666',
        borderRadius: 4,
    },
    barra: {
        width: 270,
        height: 15,
        backgroundColor: '#2c3e50',
        borderRadius: 6,
        marginTop: -6,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    cuerdaIzq: {
        position: 'absolute',
        left: 46,
        bottom: -14,
        width: 2,
        height: 15,
        backgroundColor: '#2c3e50',
    },
    cuerdaDer: {
        position: 'absolute',
        right: 48,
        bottom: -14,
        width: 2,
        height: 15,
        backgroundColor: '#2c3e50',
    },
    platoIzq: {
        position: 'absolute',
        left: 0,
        bottom: -130,
        alignItems: 'center',
    },
    platoDer: {
        position: 'absolute',
        right: 0,
        bottom: -130,
        alignItems: 'center',
    },
    platoCaja: {
        width: 96,
        height: 96,
        borderRadius: 10,
        padding: 4,
        flexWrap: 'wrap',
        flexDirection: 'row',
        alignItems: 'flex-start',
        borderWidth: 1,
        borderColor: '#ccc',
    },
    dropZona: {
        backgroundColor: '#ddd',
    },
    miniBloque: {
        width: 20,
        height: 20,
        borderRadius: 4,
        margin: 2,
    },
    cantidadTexto: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    progresoWrapper: {
        width: 96,
        height: 6,
        backgroundColor: '#ccc',
        borderRadius: 3,
        marginTop: 6,
        overflow: 'hidden',
    },
    progresoBarra: {
        height: 6,
        backgroundColor: '#3498db',
        borderRadius: 3,
    },
    pesoTexto: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333',
        marginTop: 4,
    },
});

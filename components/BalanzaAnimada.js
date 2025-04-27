import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

export default function BalanzaAnimada({
    pesoIzq,
    pesoDer,
    bloquesIzq,
    bloquesDer,
    setDropAreas,
    allowRemove = true,
    onRemove,
}) {
    const inclinAnim = useRef(new Animated.Value(0)).current;
    const refIzq = useRef(null);
    const refDer = useRef(null);

    useEffect(() => {
        const diff = pesoIzq - pesoDer;
        const final = Math.max(Math.min(diff, 50), -50);
        Animated.timing(inclinAnim, {
            toValue: final,
            duration: 400,
            useNativeDriver: true,
        }).start();
    }, [pesoIzq, pesoDer]);

    const medirAreas = useCallback(() => {
        if (refIzq.current) {
            refIzq.current.measureInWindow((x, y, width, height) => {
                setDropAreas(prev => ({ ...prev, izquierdo: { x, y, width, height } }));
            });
        }
        if (refDer.current) {
            refDer.current.measureInWindow((x, y, width, height) => {
                setDropAreas(prev => ({ ...prev, derecho: { x, y, width, height } }));
            });
        }
    }, [setDropAreas]);

    useEffect(() => {
        setTimeout(medirAreas, 200);
    }, [bloquesIzq.length, bloquesDer.length, medirAreas]);

    const renderBloques = (bloques, lado) =>
        bloques.map(b => (
            <View
                key={b.id}
                style={[styles.miniBloque, { backgroundColor: b.color }]}
                onStartShouldSetResponder={() => true}
                onResponderLongPress={() => {
                    if (allowRemove && onRemove) onRemove(b, lado);
                }}
            >
                <Text style={styles.numero} selectable={false}>{b.numero}</Text>
            </View>
        ));

    return (
        <View style={styles.wrapper}>
            <Text style={styles.titulo} selectable={false}>⚖️ Balanza</Text>
            <View style={styles.soporte}>
                <View style={styles.baseVertical} />

                <Animated.View
                    style={[
                        styles.barra,
                        {
                            transform: [{
                                rotate: inclinAnim.interpolate({
                                    inputRange: [-50, 0, 50],
                                    outputRange: ['10deg', '0deg', '-10deg'],
                                }),
                            }],
                        },
                    ]}
                >
                    <View style={styles.cuerdaIzq} />
                    <View style={styles.cuerdaDer} />

                    <View style={styles.platoIzq}>
                        <Text style={styles.pesoText} selectable={false}>{pesoIzq}g</Text>
                        <View ref={refIzq} style={styles.platoCaja}>
                            {renderBloques(bloquesIzq, 'izquierdo')}
                        </View>
                    </View>

                    <View style={styles.platoDer}>
                        <Text style={styles.pesoText} selectable={false}>{pesoDer}g</Text>
                        <View ref={refDer} style={styles.platoCaja}>
                            {renderBloques(bloquesDer, 'derecho')}
                        </View>
                    </View>

                </Animated.View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: { alignItems: 'center', marginTop: 30 },
    titulo: { marginBottom: 10, fontSize: 18, fontWeight: 'bold', color: '#333' },
    soporte: { height: 200, justifyContent: 'flex-start', alignItems: 'center' },
    baseVertical: { width: 8, height: 70, backgroundColor: '#666', borderRadius: 4 },
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
    cuerdaIzq: { position: 'absolute', left: 46, bottom: -14, width: 2, height: 15, backgroundColor: '#2c3e50', zIndex: 3 },
    cuerdaDer: { position: 'absolute', right: 48, bottom: -14, width: 2, height: 15, backgroundColor: '#2c3e50', zIndex: 3 },
    platoIzq: { position: 'absolute', left: 0, bottom: -110, alignItems: 'center' },
    platoDer: { position: 'absolute', right: 0, bottom: -110, alignItems: 'center' },
    platoCaja: {
        width: 96,
        height: 96,
        backgroundColor: '#f5f5f5',
        borderRadius: 10,
        padding: 4,
        flexWrap: 'wrap',
        flexDirection: 'row',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        borderWidth: 1,
        borderColor: '#ccc',
    },
    pesoText: { position: 'absolute', bottom: 11, fontSize: 12, fontWeight: 'bold', color: 'black', zIndex: 2 },
    miniBloque: {
        width: 15,
        height: 15,
        borderRadius: 4,
        margin: 1.5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    numero: {
        color: 'black',
        fontSize: 10,
        fontWeight: 'bold',
        textAlign: 'center',
    },
});

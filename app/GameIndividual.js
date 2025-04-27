import React, { useEffect, useState, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    Animated,
    PanResponder,
    Button,
    Alert,
} from 'react-native';
import { getSocket } from '../sockets/connection';
import BalanzaAnimada from '../components/BalanzaAnimada';

const COLORES = ['red', 'blue', 'green', 'orange', 'purple'];

export default function GameIndividual() {
    const { nombre } = useLocalSearchParams();
    const router = useRouter();

    const [bloques, setBloques] = useState([]);
    const [pesoIzq1, setPesoIzq1] = useState(0);
    const [pesoDer1, setPesoDer1] = useState(0);
    const [pesoIzq2, setPesoIzq2] = useState(0);
    const [pesoDer2, setPesoDer2] = useState(0);
    const [bloquesIzq1, setBloquesIzq1] = useState([]);
    const [bloquesDer1, setBloquesDer1] = useState([]);
    const [bloquesIzq2, setBloquesIzq2] = useState([]);
    const [bloquesDer2, setBloquesDer2] = useState([]);
    const [dropAreas1, setDropAreas1] = useState({ izquierdo: null, derecho: null });
    const [dropAreas2, setDropAreas2] = useState({ izquierdo: null, derecho: null });
    const [jugadas, setJugadas] = useState([]);

    useEffect(() => {
        const nuevos = [];
        COLORES.forEach(color => {
            // 🔥 Cada color tiene dos bloques, uno con número 1 y otro con número 2
            nuevos.push({
                id: `${color}-1-${Math.random().toString(36).substring(2, 7)}`,
                color,
                peso: Math.floor(Math.random() * 19) + 2,
                pan: new Animated.ValueXY(),
                numero: 1,
            });
            nuevos.push({
                id: `${color}-2-${Math.random().toString(36).substring(2, 7)}`,
                color,
                peso: Math.floor(Math.random() * 19) + 2,
                pan: new Animated.ValueXY(),
                numero: 2,
            });
        });
        setBloques(nuevos);
    }, []);

    const enviarJugada = (bloque, lado, balanza) => {
        if (balanza === 1) {
            if (lado === 'izquierdo') {
                setPesoIzq1(p => p + bloque.peso);
                setBloquesIzq1(prev => [...prev, bloque]);
            } else {
                setPesoDer1(p => p + bloque.peso);
                setBloquesDer1(prev => [...prev, bloque]);
            }
            setJugadas(prev => [...prev, {
                jugador: nombre,
                turno: prev.length + 1,
                peso: bloque.peso,
                color: bloque.color,
            }]);
        } else {
            if (lado === 'izquierdo') {
                setPesoIzq2(p => p + bloque.peso);
                setBloquesIzq2(prev => [...prev, bloque]);
            } else {
                setPesoDer2(p => p + bloque.peso);
                setBloquesDer2(prev => [...prev, bloque]);
            }
        }

        setBloques(prev => {
            const restantes = prev.filter(b => b.id !== bloque.id);

            if (restantes.length === 0 && bloquesIzq1.length + bloquesDer1.length === 9 && balanza === 1) {
                router.replace({
                    pathname: '/result',
                    params: {
                        nombre,
                        resumen: encodeURIComponent(JSON.stringify({
                            contenido: [...jugadas, {
                                jugador: nombre,
                                turno: jugadas.length + 1,
                                peso: bloque.peso,
                                color: bloque.color,
                            }],
                            totales: {
                                izquierdo: pesoIzq1 + (lado === 'izquierdo' ? bloque.peso : 0),
                                derecho: pesoDer1 + (lado === 'derecho' ? bloque.peso : 0),
                            },
                            ganador: (pesoIzq1 + (lado === 'izquierdo' ? bloque.peso : 0)) >
                                (pesoDer1 + (lado === 'derecho' ? bloque.peso : 0))
                                ? 'Izquierdo' : 'Derecho',
                            sobrevivientes: [nombre],
                            bloquesPorJugador: {
                                [nombre]: [...bloquesIzq1, ...bloquesDer1, bloque],
                            },
                        })),
                    },
                });
            }

            return restantes;
        });
    };

    const quitarUltimoBloque = (lado) => {
        let bloque;
        if (lado === 'izquierdo' && bloquesIzq2.length) {
            bloque = bloquesIzq2[bloquesIzq2.length - 1];
            setBloquesIzq2(prev => prev.slice(0, -1));
            setPesoIzq2(p => p - bloque.peso);
        } else if (lado === 'derecho' && bloquesDer2.length) {
            bloque = bloquesDer2[bloquesDer2.length - 1];
            setBloquesDer2(prev => prev.slice(0, -1));
            setPesoDer2(p => p - bloque.peso);
        } else {
            Alert.alert("Nada que quitar en ese lado");
            return;
        }
        setBloques(prev => [...prev, bloque]);
    };

    const isInDropArea = (gesture, area) => {
        if (!area) return false;
        const { moveX, moveY } = gesture;
        return moveX > area.x && moveX < area.x + area.width && moveY > area.y && moveY < area.y + area.height;
    };

    const renderBloque = (bloque) => {
        const panResponder = PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderGrant: () => bloque.pan.extractOffset(),
            onPanResponderMove: Animated.event([null, { dx: bloque.pan.x, dy: bloque.pan.y }], { useNativeDriver: false }),
            onPanResponderRelease: (_, gesture) => {
                bloque.pan.flattenOffset();
                if (isInDropArea(gesture, dropAreas2.izquierdo)) enviarJugada(bloque, 'izquierdo', 2);
                else if (isInDropArea(gesture, dropAreas2.derecho)) enviarJugada(bloque, 'derecho', 2);
                else if (isInDropArea(gesture, dropAreas1.izquierdo)) enviarJugada(bloque, 'izquierdo', 1);
                else if (isInDropArea(gesture, dropAreas1.derecho)) enviarJugada(bloque, 'derecho', 1);
                else {
                    Animated.spring(bloque.pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
                }
            },
        });

        return (
            <Animated.View
                key={bloque.id}
                {...panResponder.panHandlers}
                style={[
                    styles.bloque,
                    { backgroundColor: bloque.color },
                    { transform: bloque.pan.getTranslateTransform() },
                ]}
            >
                <Text style={styles.numero}>{bloque.numero}</Text>
            </Animated.View>
        );
    };

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.titulo}>Jugador: {nombre}</Text>
            <Text style={styles.subtitulo}>Modo Individual</Text>

            <Text style={styles.section}>Balanza 1 (finaliza juego):</Text>
            <BalanzaAnimada
                pesoIzq={pesoIzq1}
                pesoDer={pesoDer1}
                bloquesIzq={bloquesIzq1}
                bloquesDer={bloquesDer1}
                setDropAreas={setDropAreas1}
                allowRemove={false}
            />

            <Text style={styles.section}>Balanza 2 (pruebas libres):</Text>
            <BalanzaAnimada
                pesoIzq={pesoIzq2}
                pesoDer={pesoDer2}
                bloquesIzq={bloquesIzq2}
                bloquesDer={bloquesDer2}
                setDropAreas={setDropAreas2}
                allowRemove={true}
            />

            <View style={styles.botonera}>
                <View style={{ flex: 1, marginRight: 10 }}>
                    <Button title="Quitar izquierdo" onPress={() => quitarUltimoBloque('izquierdo')} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                    <Button title="Quitar derecho" onPress={() => quitarUltimoBloque('derecho')} />
                </View>
            </View>

            <View style={styles.bloquesContainer}>
                {bloques.map(renderBloque)}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flexGrow: 1, padding: 20, backgroundColor: '#fff' },
    titulo: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
    subtitulo: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#666' },
    section: { fontSize: 16, fontWeight: 'bold', marginTop: 20 },
    bloquesContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 20 },
    bloque: { width: 60, height: 60, borderRadius: 8, margin: 8, justifyContent: 'center', alignItems: 'center' },
    botonera: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
    numero: { fontSize: 24, fontWeight: 'bold', color: 'black', textAlign: 'center' },
});

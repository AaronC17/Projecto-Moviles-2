import React, { useEffect, useState, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    Button,
    Alert,
    Modal,
    TouchableOpacity,
    Animated,
} from 'react-native';
import { getSocket } from '../sockets/connection';
import BalanzaAnimada from '../components/BalanzaAnimada';
import { Platform } from 'react-native';

const COLORES = ['red', 'blue', 'green', 'orange', 'purple'];

export default function GameMultijugador() {
    const { nombre } = useLocalSearchParams();
    const router = useRouter();
    const socket = getSocket();
    const [bloques, setBloques] = useState([]);
    const [pesoIzq1, setPesoIzq1] = useState(0);
    const [pesoDer1, setPesoDer1] = useState(0);
    const [pesoIzq2, setPesoIzq2] = useState(0);
    const [pesoDer2, setPesoDer2] = useState(0);
    const [pesosPorColor, setPesosPorColor] = useState({});
    const [bloquesIzq1, setBloquesIzq1] = useState([]);
    const [bloquesDer1, setBloquesDer1] = useState([]);
    const [bloquesIzq2, setBloquesIzq2] = useState([]);
    const [bloquesDer2, setBloquesDer2] = useState([]);
    const [miTurno, setMiTurno] = useState(false);
    const [jugadorEnTurno, setJugadorEnTurno] = useState('');
    const [companero, setCompanero] = useState('');
    const [dropAreas1, setDropAreas1] = useState({ izquierdo: null, derecho: null });
    const [dropAreas2, setDropAreas2] = useState({ izquierdo: null, derecho: null });
    const [contador, setContador] = useState(300);
    const [jugadoresConectados, setJugadoresConectados] = useState(0);
    const [mostrarPista, setMostrarPista] = useState(false);
    const [pista, setPista] = useState('');
    const [selectedBlock, setSelectedBlock] = useState(null);
    const [esperandoInicio, setEsperandoInicio] = useState(true);
    const intervaloRef = useRef(null);

    useEffect(() => {
        const nuevos = [];
        COLORES.forEach(color => {
            for (let i = 0; i < 2; i++) {
                nuevos.push({ id: `${color}-${i}`, color, pan: new Animated.ValueXY() });
            }
        });
        setBloques(nuevos);
    }, []);

    useEffect(() => {
        if (!socket) return;
        socket.onmessage = e => {
            const data = JSON.parse(e.data);
            switch (data.type) {
                case 'ENTRADA':
                    setJugadoresConectados(data.totalJugadores || 0);
                    if (data.pesosPorColor) {
                        setPesosPorColor(data.pesosPorColor);
                    }
                    if (data.totalJugadores === 10) {
                        setEsperandoInicio(false);
                    } else {
                        setEsperandoInicio(true);
                    }
                    break;
                case 'TURNO':
                    setMiTurno(data.tuTurno);
                    setJugadorEnTurno(data.jugadorEnTurno);
                    if (data.tuTurno) {
                        clearInterval(intervaloRef.current);
                        setContador(300);
                        intervaloRef.current = setInterval(() => {
                            setContador(p => (p <= 1 ? (clearInterval(intervaloRef.current), 0) : p - 1));
                        }, 1000);
                    }
                    break;
                case 'ACTUALIZAR_BALANZA':
                    setPesoIzq1(data.izquierdo || 0);
                    setPesoDer1(data.derecho || 0);
                    if (data.bloque) {
                        const nb = { ...data.bloque, pan: new Animated.ValueXY() };
                        if (data.bloque.lado === 'izquierdo') setBloquesIzq1(b => [...b, nb]);
                        else setBloquesDer1(b => [...b, nb]);
                    }
                    break;
                case 'MENSAJE':
                    if (data.contenido.includes('fue eliminado')) {
                        const nombreEnMensaje = data.contenido.split(' ')[0].trim();
                        if (nombreEnMensaje.toLowerCase() === nombre.toLowerCase()) {
                            if (Platform.OS === 'web') {
                                alert('¡Has sido eliminado!\n' + data.contenido);
                                router.replace('/');
                            } else {
                                Alert.alert(
                                    '¡Has sido eliminado!',
                                    data.contenido,
                                    [{ text: 'OK', onPress: () => router.replace('/') }],
                                    { cancelable: false }
                                );
                            }
                        } else {
                            if (Platform.OS === 'web') {
                                alert(data.contenido);
                            } else {
                                Alert.alert('Eliminación', data.contenido);
                            }
                        }
                    }
                    break;
                case 'EQUIPO':
                    setCompanero(data.compañero || '');
                    Alert.alert('¡Equipo asignado!', `Tu compañero es: ${data.compañero}`);
                    break;
                case 'PISTA':
                    setPista(data.contenido);
                    setMostrarPista(true);
                    setTimeout(() => setMostrarPista(false), 5000);
                    break;
                case 'RESUMEN':
                    router.replace({
                        pathname: '/result',
                        params: {
                            resumen: encodeURIComponent(JSON.stringify(data)),
                            nombre,
                            bonus: data.bonusEquilibrio || 0,
                        },
                    });
                    break;
            }
        };
        const msg = JSON.stringify({ type: 'ENTRADA', jugador: nombre, modo: 'multijugador' });
        if (socket.readyState === WebSocket.OPEN) socket.send(msg);
        else socket.onopen = () => socket.send(msg);
        return () => clearInterval(intervaloRef.current);
    }, []);

    const renderBloque = bloque => {
        const isSel = selectedBlock?.id === bloque.id;
        return (
            <TouchableOpacity
                key={bloque.id}
                onPress={() => setSelectedBlock(bloque)}
                activeOpacity={0.7}
                style={styles.bloqueWrapper}
            >
                <Animated.View
                    style={[
                        styles.bloque,
                        { backgroundColor: bloque.color },
                        isSel && { transform: [{ scale: 1.2 }] },
                    ]}
                />
            </TouchableOpacity>
        );
    };

    const enviarJugada = lado => {
        if (!miTurno || !selectedBlock) return;
        socket.send(
            JSON.stringify({
                type: 'JUGADA',
                jugador: nombre,
                color: selectedBlock.color,
                lado,
            })
        );
        setBloques(b => b.filter(x => x.id !== selectedBlock.id));
        setSelectedBlock(null);
        setMiTurno(false);
        clearInterval(intervaloRef.current);
    };

    const colocarPrueba = lado => {
        if (!selectedBlock) return;
        const pesoReal = pesosPorColor[selectedBlock.color] || 0;
        if (lado === 'izquierdo') {
            setPesoIzq2(p => p + pesoReal);
            setBloquesIzq2(b => [...b, selectedBlock]);
        } else {
            setPesoDer2(p => p + pesoReal);
            setBloquesDer2(b => [...b, selectedBlock]);
        }
        setBloques(b => b.filter(x => x.id !== selectedBlock.id));
        setSelectedBlock(null);
    };

    const quitarUltimoBloque = lado => {
        let bloque;
        if (lado === 'izquierdo' && bloquesIzq2.length) {
            bloque = bloquesIzq2.pop();
            setPesoIzq2(p => p - (pesosPorColor[bloque.color] || 0));
            setBloques(b => [...b, bloque]);
            setBloquesIzq2([...bloquesIzq2]);
        } else if (lado === 'derecho' && bloquesDer2.length) {
            bloque = bloquesDer2.pop();
            setPesoDer2(p => p - (pesosPorColor[bloque.color] || 0));
            setBloques(b => [...b, bloque]);
            setBloquesDer2([...bloquesDer2]);
        } else {
            Alert.alert('Nada que quitar en ese lado');
        }
    };

    if (esperandoInicio) {
        return (
            <View style={styles.centered}>
                <Text style={styles.esperando}>Esperando jugadores... ({jugadoresConectados}/10)</Text>
                <Text style={styles.esperando}>Necesitamos 10 jugadores para empezar.</Text>
            </View>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Modal visible={mostrarPista} transparent animationType="fade">
                <View style={styles.modalBackground}>
                    <View style={styles.modalContainer}>
                        <Text style={styles.pistaTexto}>{pista}</Text>
                    </View>
                </View>
            </Modal>

            <View style={styles.header}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{nombre.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.info}>
                    <Text style={styles.playerText}>Jugador: <Text style={styles.highlight}>{nombre}</Text></Text>
                    <Text style={styles.playerText}>Compañero: <Text style={styles.highlight}>{companero}</Text></Text>
                    <Text style={styles.playerText}>Turno de: <Text style={styles.highlight}>{jugadorEnTurno}</Text></Text>
                </View>
            </View>

            {miTurno && (
                <Text style={styles.contador}>⏱️ {Math.floor(contador / 60)}:{String(contador % 60).padStart(2, '0')}</Text>
            )}

            <Text style={styles.section}>Balanza 1:</Text>
            <BalanzaAnimada
                pesoIzq={pesoIzq1}
                pesoDer={pesoDer1}
                bloquesIzq={bloquesIzq1}
                bloquesDer={bloquesDer1}
                setDropAreas={setDropAreas1}
                allowRemove={false}
                onPlace={enviarJugada}
            />

            <Text style={styles.section}>Balanza 2:</Text>
            <BalanzaAnimada
                pesoIzq={pesoIzq2}
                pesoDer={pesoDer2}
                bloquesIzq={bloquesIzq2}
                bloquesDer={bloquesDer2}
                setDropAreas={setDropAreas2}
                allowRemove={true}
                onPlace={colocarPrueba}
            />

            <View style={styles.ra}>
                <Button title="Quitar izquierdo" onPress={() => quitarUltimoBloque('izquierdo')} />
                <Button title="Quitar derecho" onPress={() => quitarUltimoBloque('derecho')} />
            </View>

            <View style={styles.bloquesContainer}>
                {bloques.map(renderBloque)}
            </View>


        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flexGrow: 1, padding: 20, backgroundColor: '#fff' },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, padding: 10, backgroundColor: '#eef3f8', borderRadius: 8 },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2c3e50', justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    info: { marginLeft: 10 },
    playerText: { fontSize: 16, color: '#333' },
    highlight: { color: '#2c3e50', fontWeight: 'bold' },
    contador: { fontSize: 16, color: 'red', marginBottom: 10 },
    section: { fontSize: 16, fontWeight: 'bold', marginTop: 20 },
    bloquesContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 20 },
    bloqueWrapper: { margin: 8 },
    bloque: { width: 60, height: 60, borderRadius: 8 },
    ra: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
    finish: { marginTop: 20 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    esperando: { fontSize: 18, color: '#666', marginVertical: 4 },
    modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContainer: { backgroundColor: 'white', padding: 20, borderRadius: 10, alignItems: 'center' },
    pistaTexto: { fontSize: 18, fontWeight: 'bold', color: '#333', textAlign: 'center' },
});

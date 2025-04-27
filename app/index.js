import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
    View,
    Text,
    TextInput,
    Button,
    StyleSheet,
    Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Home() {
    const [nombre, setNombre] = useState('');
    const router = useRouter();

    useEffect(() => {
        const cargarNombre = async () => {
            const guardado = await AsyncStorage.getItem('nombreJugador');
            if (guardado) setNombre(guardado);
        };
        cargarNombre();
    }, []);

    const navegar = (modo) => {
        if (!nombre.trim()) return Alert.alert('⚠️ Escribe tu nombre');
        AsyncStorage.setItem('nombreJugador', nombre);
        router.push({
            pathname: modo === 'individual' ? '/GameIndividual' : '/GameMultijugador',
            params: { nombre, modo },
        });
    };

    return (
        <View style={styles.container}>
            <Text style={styles.titulo}>🎮 Juego de la Balanza</Text>
            <TextInput
                style={styles.input}
                placeholder="Ingresa tu nombre"
                value={nombre}
                onChangeText={setNombre}
            />
            <View style={styles.boton}>
                <Button title="Jugar Individual" onPress={() => navegar('individual')} />
            </View>
            <View style={styles.boton}>
                <Button title="Jugar Multijugador" onPress={() => navegar('multijugador')} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 20 },
    titulo: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 30 },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 10,
        marginBottom: 20,
    },
    boton: { marginTop: 10 },
});

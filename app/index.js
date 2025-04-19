import { useRouter } from "expo-router";
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from "react-native";
import { useState } from "react";

export default function Index() {
    const router = useRouter();
    const [nombre, setNombre] = useState("");

    const navegar = (modo) => {
        if (!nombre.trim()) return alert("Ingresá tu nombre");
        router.push(`/game?nombre=${encodeURIComponent(nombre)}&modo=${modo}`);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.titulo}>🎮 Juego de la Balanza</Text>
            <TextInput
                placeholder="Tu nombre"
                value={nombre}
                onChangeText={setNombre}
                style={styles.input}
            />
            <TouchableOpacity style={styles.boton} onPress={() => navegar("individual")}>
                <Text style={styles.botonTexto}>Jugar Individual</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.boton} onPress={() => navegar("multijugador")}>
                <Text style={styles.botonTexto}>Jugar Multijugador</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
    titulo: { fontSize: 24, fontWeight: "bold", marginBottom: 30 },
    input: {
        borderWidth: 1,
        borderColor: "#ccc",
        padding: 10,
        width: "100%",
        marginBottom: 20,
        borderRadius: 6,
    },
    boton: {
        backgroundColor: "#2c3e50",
        padding: 12,
        marginVertical: 8,
        borderRadius: 6,
        width: "100%",
    },
    botonTexto: { color: "white", textAlign: "center", fontWeight: "bold" },
});

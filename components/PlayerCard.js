import { View, Text } from 'react-native';

export default function PlayerCard({ player }) {
    return (
        <View style={{ margin: 10, padding: 10, backgroundColor: '#eee', borderRadius: 8 }}>
            <Text>{player.name}</Text>
            <Text>Peso: {player.weight}g</Text>
        </View>
    );
}

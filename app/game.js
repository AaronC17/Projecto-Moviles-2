// game.js
import { useLocalSearchParams } from "expo-router";
import GameIndividual from "./GameIndividual";
import GameMultijugador from "./GameMultijugador";

export default function Game() {
    const { modo } = useLocalSearchParams();

    if (modo === "multijugador") {
        return <GameMultijugador />;
    }
    return <GameIndividual />;
}

import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import GameCreator from "../components/CreateChat";
import { router } from "expo-router";

export default function CreateTab() {
  const handleGamePublished = (game: any) => {
    // Navigate to discover tab after publishing a game
    router.push("/(tabs)/discover");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }} edges={[]}> 
      <GameCreator onGamePublished={handleGamePublished} />
    </SafeAreaView>
  );
}

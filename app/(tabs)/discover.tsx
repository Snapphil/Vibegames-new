import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import PlayFeed from "../components/PlayFeed";

export default function DiscoverTab() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }} edges={[]}> 
      <PlayFeed />
    </SafeAreaView>
  );
}

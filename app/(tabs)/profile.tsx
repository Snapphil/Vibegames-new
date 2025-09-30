import React, { useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import Profile from "../components/Profile";
import type { PlayFeedRef } from "../components/PlayFeed";
import { router } from "expo-router";

export default function ProfileTab() {
  const feedRef = useRef<PlayFeedRef | null>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }} edges={["top"]}>
      <Profile 
        onClose={() => { /* no-op in tabs */ }} 
        onCreateGame={() => router.push("/(tabs)/create" as any)}
        onPlayGame={(game) => {
          // Optional: navigate user to Discover tab and surface the game
          router.push("/(tabs)/explore" as any);
          // PlayFeed exposes imperative API via ref in its own screen; here we keep it simple
        }}
      />
    </SafeAreaView>
  );
}

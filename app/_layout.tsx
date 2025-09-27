import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, Platform } from "react-native";
import GenerationProvider from "./components/components/GenerationState";
import GenerationOverlay from "./components/components/GenerationOverlay";
import { useKeepAwake } from "expo-keep-awake";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./auth/AuthProvider";

// Wrapper component to conditionally use keep awake hook
function KeepAwakeWrapper() {
  if (Platform.OS !== 'web') {
    useKeepAwake();
  }
  return null;
}

export default function RootLayout() {

  return (
    <AuthProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
        <StatusBar style="light" />
        <SafeAreaProvider>
          <KeepAwakeWrapper />
          <GenerationProvider>
            <View style={{ flex: 1, backgroundColor: "#000" }}>
              <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
              <GenerationOverlay />
            </View>
          </GenerationProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AuthProvider>
  );
}

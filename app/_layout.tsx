import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, Platform, AppState, ActivityIndicator, Text } from "react-native";
import GenerationProvider from "./components/components/GenerationState";
import GenerationOverlay from "./components/components/GenerationOverlay";
import { useKeepAwake } from "expo-keep-awake";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import SignInScreen from "./auth/SignInScreen";
import ErrorBoundary from "./components/ErrorBoundary";
import SimpleGameService from "./services/SimpleGameService";
import * as ScreenOrientation from 'expo-screen-orientation';

// Wrapper component to conditionally use keep awake hook
function KeepAwakeWrapper() {
  if (Platform.OS !== 'web') {
    useKeepAwake();
  }
  return null;
}

// Memory management and app lifecycle handler
function AppLifecycleManager() {
  useEffect(() => {
    // Set screen orientation for better gaming experience
    if (Platform.OS !== 'web') {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
    }

    // Handle app state changes for memory management
    const subscription = AppState.addEventListener('change', nextAppState => {
      const gameService = SimpleGameService.getInstance();

      if (nextAppState === 'background') {
        // App going to background - reduce memory usage
        console.log('App going to background - optimizing memory');
        // Clear caches after a delay to allow for quick resume
        setTimeout(() => {
          if (AppState.currentState === 'background') {
            gameService.clearAllCaches();
          }
        }, 30000); // Clear after 30 seconds in background
      } else if (nextAppState === 'active') {
        // App coming back to foreground
        console.log('App returning to foreground');
      }
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  return null;
}

// Main app content with auth check
function AppContent() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#FF3040" size="large" />
        <Text style={{ color: "#FFFFFF", marginTop: 16, fontSize: 16, fontWeight: "500" }}>
          Initializing...
        </Text>
      </View>
    );
  }

  if (!user) {
    return <SignInScreen />;
  }

  return (
    <GenerationProvider>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
        <GenerationOverlay />
      </View>
    </GenerationProvider>
  );
}

export default function RootLayout() {
  
  return (
    <AuthProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
        <StatusBar style="light" />
        <SafeAreaProvider>
          <KeepAwakeWrapper />
          <AppLifecycleManager />
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AuthProvider>
  );
}

// app/index.tsx

import React, { useState, useRef } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
 // You may need to install this: expo install expo-blur
import PlayFeed from "./components/PlayFeed";
import CreateChat from "./components/CreateChat";
import Profile from "./components/Profile";
import type { PlayFeedRef } from "./components/PlayFeed";
import ActivityTrackerInstance from "./services/ActivityTracker";

import { AuthProvider, useAuth } from "./auth/AuthProvider";
import SignInScreen from "./auth/SignInScreen";

// Onboarding imports
import OnboardingOverlay from "./components/OnboardingOverlayNew";
import { useOnboarding, useOnboardingTarget } from "./hooks/useOnboarding";
import { onboardingSteps } from "./config/onboardingConfig";
import OnboardingServiceInstance from "./services/OnboardingService";

// Animated Tab Button Component
function AnimatedTabButton({ 
  isActive, 
  icon, 
  activeIcon, 
  onPress, 
  label,
  refId,
  onLayout,
}: {
  isActive: boolean;
  icon: string;
  activeIcon: string;
  onPress: () => void;
  label: string;
  refId?: string;
  onLayout?: (event: any) => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const buttonRef = useRef<any>(null);

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: isActive ? 1.05 : 1,
        useNativeDriver: true,
        tension: 300,
        friction: 10,
      }),
      Animated.timing(glowAnim, {
        toValue: isActive ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  }, [isActive]);

  const handlePress = () => {
    // Haptic feedback for better UX
    if (Platform.OS === 'ios') {
      // Add haptic feedback if available
    }
    
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 0.98,
        useNativeDriver: true,
        tension: 300,
        friction: 10,
      }),
      Animated.spring(scaleAnim, {
        toValue: isActive ? 1.05 : 1,
        useNativeDriver: true,
        tension: 300,
        friction: 10,
      }),
    ]).start();
    
    onPress();
  };

  const handleLayout = (event: any) => {
    if (onLayout && refId) {
      // Measure button position in window
      if (buttonRef.current) {
        buttonRef.current.measure((x, y, width, height, pageX, pageY) => {
          onLayout({
            nativeEvent: {
              layout: { x: pageX, y: pageY, width, height }
            },
            target: buttonRef.current
          });
        });
      }
    }
  };

  return (
    <Pressable 
      style={styles.tabButton} 
      onPress={handlePress}
      onLayout={handleLayout}
    >
      <Animated.View 
        ref={buttonRef}
        style={[
          styles.tabIconContainer,
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Subtle background highlight for active state */}
        <Animated.View
          style={[
            styles.activeBackground,
            {
              opacity: glowAnim,
              transform: [{ scale: glowAnim }],
            },
          ]}
        />
        
        {/* Main icon */}
        <View style={styles.iconWrapper}>
          <Ionicons 
            name={isActive ? activeIcon as any : icon as any} 
            size={26} 
            color={isActive ? "#FFFFFF" : "#8E8E93"} 
          />
        </View>
        
        {/* Thin line indicator */}
        <Animated.View
          style={[
            styles.activeIndicator,
            {
              opacity: glowAnim,
              transform: [{ scaleX: glowAnim }],
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<"play" | "create" | "profile">("play");
  const playFeedRef = useRef<PlayFeedRef>(null);
  const [pendingGame, setPendingGame] = useState<any>(null);
  
  const insets = useSafeAreaInsets();
  const { user, initializing, authError } = useAuth();

  // Onboarding state
  const {
    showOnboarding,
    isReady,
    targetRefs,
    registerTarget,
    completeOnboarding,
    skipOnboarding,
  } = useOnboarding();

  // Create onLayout handlers for each tab button
  const playTabLayout = useOnboardingTarget('tab-play', registerTarget);
  const createTabLayout = useOnboardingTarget('tab-create', registerTarget);
  const profileTabLayout = useOnboardingTarget('tab-profile', registerTarget);

  // TEMPORARY: Reset button for testing
  const [showResetButton, setShowResetButton] = React.useState(true);
  const handleResetOnboarding = async () => {
    console.log('🔄 MANUAL RESET: Resetting onboarding...');
    await OnboardingServiceInstance.resetOnboarding();
    setShowResetButton(false);
    setTimeout(() => {
      console.log('🔄 Please reload the app to see the tutorial!');
      alert('Onboarding reset! Close and reopen the app to see the tutorial.');
    }, 500);
  };

  // Start/stop activity tracking based on user authentication
  React.useEffect(() => {
    if (user) {
      ActivityTrackerInstance.startTracking();
    } else {
      ActivityTrackerInstance.stopTracking();
    }
  }, [user]);

  React.useEffect(() => {
    if (activeTab === "play" && pendingGame && playFeedRef.current) {
      playFeedRef.current.addGame(pendingGame);
      setPendingGame(null);
    }
  }, [activeTab, pendingGame]);

  const handlePlayGameFromProfile = (game: any) => {
    setTimeout(() => {
      playFeedRef.current?.addGame(game);
      setActiveTab("play");
    }, 300);
  };

  const handleGamePublished = (game: any) => {
    setPendingGame(game);
    setActiveTab("play");
  };

  if (initializing) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#FF3040" size="large" />
          <Text style={styles.loadingText}>
            Initializing...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return <SignInScreen />;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.content}>
        <View style={[styles.tabContent, activeTab !== "play" && styles.hidden]}>
          <PlayFeed ref={playFeedRef} />
        </View>
        <View style={[styles.tabContent, activeTab !== "create" && styles.hidden]}>
          <CreateChat onGamePublished={handleGamePublished} />
        </View>
        <View style={[styles.tabContent, activeTab !== "profile" && styles.hidden]}>
          <Profile 
            onClose={() => setActiveTab("play")} 
            onPlayGame={handlePlayGameFromProfile}
            onCreateGame={() => setActiveTab("create")}
          />
        </View>
      </View>

      {/* Instagram-style Navigation Bar */}
      <View style={[
        styles.tabBarContainer,
        { 
          paddingBottom: Platform.OS === 'android' 
            ? Math.max(insets.bottom, 8)
            : insets.bottom + 4
        }
      ]}>
        {/* Backdrop blur effect */}
        <View style={styles.tabBarBackdrop} />
        
        {/* Main tab bar */}
        <View style={styles.tabBar}>
          <AnimatedTabButton
            isActive={activeTab === "play"}
            icon="flash-outline"
            activeIcon="flash"
            onPress={() => setActiveTab("play")}
            label="Play"
            refId="tab-play"
            onLayout={playTabLayout.onLayout}
          />
          
          <AnimatedTabButton
            isActive={activeTab === "create"}
            icon="add-circle-outline"
            activeIcon="add-circle"
            onPress={() => setActiveTab("create")}
            label="Create"
            refId="tab-create"
            onLayout={createTabLayout.onLayout}
          />
          
          <AnimatedTabButton
            isActive={activeTab === "profile"}
            icon="person-outline"
            activeIcon="person"
            onPress={() => setActiveTab("profile")}
            label="Profile"
            refId="tab-profile"
            onLayout={profileTabLayout.onLayout}
          />
        </View>
      </View>

      {/* Onboarding Overlay */}
      {isReady && (
        <OnboardingOverlay
          visible={showOnboarding}
          steps={onboardingSteps}
          onComplete={completeOnboarding}
          onSkip={skipOnboarding}
          targetRefs={targetRefs}
        />
      )}

      {/* TEMPORARY: Floating reset button for testing */}
      {showResetButton && (
        <Pressable
          onPress={handleResetOnboarding}
          style={{
            position: 'absolute',
            bottom: 100,
            right: 20,
            backgroundColor: '#FF3040',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 25,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
            zIndex: 9999,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
            🔄 Reset Tutorial
          </Text>
        </Pressable>
      )}




    </SafeAreaView>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  content: {
    flex: 1,
  },
  tabContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  hidden: {
    display: 'none',
  },
  loadingContainer: {
    flex: 1, 
    alignItems: "center", 
    justifyContent: "center"
  },
  loadingText: {
    color: "#FFFFFF", 
    marginTop: 16, 
    fontSize: 16,
    fontWeight: "500",
  },
  
  // Instagram-style Navigation Styles
  tabBarContainer: {
    position: 'relative',
  },
  tabBarBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  tabBar: {
    flexDirection: "row",
    paddingTop: 10,
    paddingHorizontal: 24,
    position: 'relative',
    zIndex: 1,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
  },
  tabIconContainer: {
    alignItems: "center",
    justifyContent: "center",
    position: 'relative',
  },
  activeBackground: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    top: -9,
    left: -9,
  },
  iconWrapper: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  activeIndicator: {
    width: 24,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#FFFFFF",
    marginTop: 6,
  },
  
  // Enhanced Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 60,
    paddingRight: 16,
  },
  overflowMenu: {
    backgroundColor: "rgba(18, 18, 25, 0.95)",
    borderRadius: 20,
    padding: 8,
    minWidth: 220,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
    } : {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 12,
    }),
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginVertical: 2,
  },
  menuIconContainer: {
    width: 32,
    alignItems: 'center',
    marginRight: 16,
  },
  menuText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  menuDivider: {
    height: 0.5,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginVertical: 8,
    marginHorizontal: 12,
  },
});
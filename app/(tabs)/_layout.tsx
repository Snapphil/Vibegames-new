import { Tabs } from 'expo-router';
import React, { Suspense, lazy } from 'react';
import { Platform, ActivityIndicator, View } from 'react-native';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

// Lazy load heavy components
const CustomIcon = lazy(async () => ({ default: (await import('@/components/ui/CustomIcon')).CustomIcon }));
const HapticTab = lazy(async () => ({ default: (await import('@/components/HapticTab')).HapticTab }));
const IconSymbol = lazy(async () => ({ default: (await import('@/components/ui/IconSymbol')).IconSymbol }));
const TabBarBackground = lazy(async () => ({ default: (await import('@/components/ui/TabBarBackground')).default ?? (() => null) }));

// Loading component for lazy loaded elements
const TabIconLoader = () => (
  <View style={{ width: 28, height: 28, justifyContent: 'center', alignItems: 'center' }}>
    <ActivityIndicator size="small" color={Colors.light.tint} />
  </View>
);

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      initialRouteName="discover"
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: (props) => (
          <Suspense fallback={null}>
            <HapticTab {...props} />
          </Suspense>
        ),
        tabBarBackground: () => (
          <Suspense fallback={null}>
            <TabBarBackground />
          </Suspense>
        ),
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            position: 'absolute',
          },
          default: {},
        }),
      }}>
      {/* Hide legacy index route from the tab bar (we will redirect it to Discover) */}
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, size }) => (
            <Suspense fallback={<TabIconLoader />}>
              <CustomIcon name="game-controller-outline" size={size ?? 28} color={color} />
            </Suspense>
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarIcon: ({ color, size }) => (
            <Suspense fallback={<TabIconLoader />}>
              <CustomIcon name="add-circle" size={size ?? 28} color={color} />
            </Suspense>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Suspense fallback={<TabIconLoader />}>
              <IconSymbol size={size ?? 28} name="person.fill" color={color} />
            </Suspense>
          ),
        }}
      />
    </Tabs>
  );
}

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

interface PixelIconProps {
  type: 'gamepad' | 'play' | 'create' | 'profile' | 'check';
  size?: number;
  animate?: boolean;
}

export default function PixelIcon({ type, size = 64, animate = true }: PixelIconProps) {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animate) return;

    // Bounce animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: -8,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [animate]);

  const pixelSize = size / 8;

  // Pixel art patterns - each is an 8x8 grid
  const patterns = {
    gamepad: [
      [0, 0, 1, 1, 1, 1, 0, 0],
      [0, 1, 2, 2, 2, 2, 1, 0],
      [1, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 3, 2, 2, 3, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 1],
      [1, 2, 2, 4, 4, 2, 2, 1],
      [0, 1, 2, 2, 2, 2, 1, 0],
      [0, 0, 1, 1, 1, 1, 0, 0],
    ],
    play: [
      [0, 0, 1, 1, 1, 1, 0, 0],
      [0, 1, 2, 2, 2, 2, 1, 0],
      [1, 2, 3, 3, 2, 2, 2, 1],
      [1, 2, 3, 3, 3, 2, 2, 1],
      [1, 2, 3, 3, 2, 2, 2, 1],
      [1, 2, 2, 2, 2, 2, 2, 1],
      [0, 1, 2, 2, 2, 2, 1, 0],
      [0, 0, 1, 1, 1, 1, 0, 0],
    ],
    create: [
      [0, 0, 0, 1, 1, 0, 0, 0],
      [0, 0, 1, 3, 3, 1, 0, 0],
      [0, 1, 2, 3, 3, 2, 1, 0],
      [1, 2, 2, 2, 2, 2, 2, 1],
      [1, 4, 4, 2, 2, 5, 5, 1],
      [1, 4, 4, 2, 2, 5, 5, 1],
      [0, 1, 1, 2, 2, 1, 1, 0],
      [0, 0, 0, 1, 1, 0, 0, 0],
    ],
    profile: [
      [0, 0, 1, 1, 1, 1, 0, 0],
      [0, 1, 2, 3, 3, 2, 1, 0],
      [0, 1, 3, 4, 4, 3, 1, 0],
      [0, 1, 3, 3, 3, 3, 1, 0],
      [0, 0, 1, 3, 3, 1, 0, 0],
      [0, 1, 2, 3, 3, 2, 1, 0],
      [1, 2, 2, 3, 3, 2, 2, 1],
      [0, 1, 1, 1, 1, 1, 1, 0],
    ],
    check: [
      [0, 0, 0, 0, 0, 1, 1, 0],
      [0, 0, 0, 0, 1, 2, 2, 1],
      [0, 0, 0, 1, 2, 2, 1, 0],
      [1, 1, 1, 2, 2, 1, 0, 0],
      [1, 2, 2, 2, 1, 0, 0, 0],
      [1, 2, 2, 1, 0, 0, 0, 0],
      [0, 1, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
  };

  // Color palette - iOS blue theme with pixel art shading
  const getColor = (value: number): string => {
    switch (value) {
      case 0: return 'transparent';
      case 1: return '#0051D5'; // Dark blue (outline)
      case 2: return '#007AFF'; // iOS blue (main)
      case 3: return '#4DA2FF'; // Light blue (highlight)
      case 4: return '#FF3040'; // Red accent
      case 5: return '#FFD60A'; // Yellow accent
      default: return 'transparent';
    }
  };

  const pattern = patterns[type];

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            { translateY: bounceAnim },
            { scale: pulseAnim },
          ],
        },
      ]}
    >
      <View style={styles.pixelGrid}>
        {pattern.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.pixelRow}>
            {row.map((pixel, colIndex) => (
              <View
                key={`${rowIndex}-${colIndex}`}
                style={[
                  styles.pixel,
                  {
                    width: pixelSize,
                    height: pixelSize,
                    backgroundColor: getColor(pixel),
                  },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
      {/* Pixel shadow for depth */}
      <View style={[styles.shadow, { width: size, height: size / 8, top: size }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pixelGrid: {
    flexDirection: 'column',
  },
  pixelRow: {
    flexDirection: 'row',
  },
  pixel: {
    // Pixels are squares with sharp edges
  },
  shadow: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 81, 213, 0.2)',
    borderRadius: 100,
  },
});

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { OnboardingStep } from '../services/OnboardingService';
import OnboardingServiceInstance from '../services/OnboardingService';
import PixelIcon from './PixelIcon';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface OnboardingOverlayProps {
  visible: boolean;
  steps: OnboardingStep[];
  onComplete: () => void;
  onSkip: () => void;
  targetRefs?: Map<string, { x: number; y: number; width: number; height: number }>;
}

// Bouncing arrow that points to elements
function BouncingArrow({ 
  targetPosition, 
  tooltipPosition 
}: { 
  targetPosition: { x: number; y: number; width: number; height: number } | null;
  tooltipPosition: 'top' | 'bottom' | 'center';
}) {
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 10,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  if (!targetPosition) return null;

  const arrowStyle = tooltipPosition === 'top' 
    ? {
        left: targetPosition.x + targetPosition.width / 2 - 16,
        bottom: SCREEN_HEIGHT - targetPosition.y + 10,
        transform: [{ translateY: bounceAnim }],
      }
    : {
        left: targetPosition.x + targetPosition.width / 2 - 16,
        top: targetPosition.y + targetPosition.height + 10,
        transform: [{ translateY: Animated.multiply(bounceAnim, -1) }],
      };

  return (
    <Animated.View style={[styles.arrowContainer, arrowStyle]}>
      <View style={styles.arrowShadow}>
        <Ionicons 
          name={tooltipPosition === 'top' ? "arrow-down" : "arrow-up"} 
          size={32} 
          color="#007AFF" 
        />
      </View>
    </Animated.View>
  );
}

// iOS-style Spotlight
function IOSSpotlight({
  position,
  type = 'circle',
}: {
  position: { x: number; y: number; width: number; height: number } | null;
  type?: 'circle' | 'rect' | 'none';
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (position && type !== 'none') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [position, type]);

  if (!position || type === 'none') return null;

  const isCircle = type === 'circle';
  const size = isCircle ? Math.max(position.width, position.height) + 24 : null;
  const radius = size ? size / 2 : 0;

  const spotlightStyle = isCircle
    ? {
        width: size,
        height: size,
        borderRadius: radius,
        left: position.x + position.width / 2 - radius,
        top: position.y + position.height / 2 - radius,
      }
    : {
        left: position.x - 12,
        top: position.y - 12,
        width: position.width + 24,
        height: position.height + 24,
        borderRadius: 20,
      };

  return (
    <>
      {/* Outer glow */}
      <Animated.View
        style={[
          styles.spotlightOuter,
          spotlightStyle,
          {
            transform: [{ scale: pulseAnim }],
          },
        ]}
      />
      {/* Inner highlight */}
      <View
        style={[
          styles.spotlightInner,
          spotlightStyle,
        ]}
      />
    </>
  );
}

// Helper function to get pixel icon type for each step
function getPixelIconType(stepId: string): 'gamepad' | 'play' | 'create' | 'profile' | 'check' {
  switch (stepId) {
    case 'welcome': return 'gamepad';
    case 'play-tab': return 'play';
    case 'create-tab': return 'create';
    case 'profile-tab': return 'profile';
    case 'ready': return 'check';
    default: return 'gamepad';
  }
}

// iOS-style Tooltip Card
function IOSTooltip({ 
  step, 
  currentStepIndex, 
  totalSteps, 
  onNext, 
  onSkip,
  position 
}: { 
  step: OnboardingStep;
  currentStepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
  position: { x: number; y: number; width: number; height: number } | null;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();
  }, [step.id]);

  const getTooltipPosition = (): any => {
    const tooltipHeight = 300; // Increased for pixel icon
    const margin = 24;
    const sideMargin = 20;

    if (!position) {
      // Center of screen
      return {
        top: SCREEN_HEIGHT / 2 - tooltipHeight / 2,
        left: sideMargin,
        right: sideMargin,
      };
    }

    const spaceAbove = position.y;
    const spaceBelow = SCREEN_HEIGHT - (position.y + position.height);

    // Prioritize showing tooltip below the element (more natural)
    if (spaceBelow > tooltipHeight + margin + 60) {
      return {
        top: position.y + position.height + margin + 40, // Leave room for arrow
        left: sideMargin,
        right: sideMargin,
      };
    } else if (spaceAbove > tooltipHeight + margin + 60) {
      return {
        bottom: SCREEN_HEIGHT - position.y + margin + 40, // Leave room for arrow
        left: sideMargin,
        right: sideMargin,
      };
    } else {
      // Not enough space, show in center
      return {
        top: SCREEN_HEIGHT / 2 - tooltipHeight / 2,
        left: sideMargin,
        right: sideMargin,
      };
    }
  };

  const tooltipPos = getTooltipPosition();

  return (
    <Animated.View
      style={[
        styles.tooltipCard,
        tooltipPos,
        {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      {/* iOS-style blur background */}
      {Platform.OS === 'ios' ? (
        <BlurView intensity={95} tint="dark" style={StyleSheet.absoluteFill}>
          <View style={styles.tooltipContent} />
        </BlurView>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.androidBlur]} />
      )}

      <View style={styles.tooltipContent}>
        {/* Header */}
        <View style={styles.tooltipHeader}>
          <View style={styles.progressDots}>
            {Array.from({ length: totalSteps }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.progressDot,
                  i === currentStepIndex && styles.progressDotActive,
                  i < currentStepIndex && styles.progressDotCompleted,
                ]}
              />
            ))}
          </View>
          <Pressable onPress={onSkip} style={styles.skipButtonIOS} hitSlop={10}>
            <Text style={styles.skipTextIOS}>Skip</Text>
          </Pressable>
        </View>

        {/* Content */}
        <View style={styles.iconContainer}>
          <PixelIcon type={getPixelIconType(step.id)} size={72} animate={true} />
        </View>
        <Text style={styles.tooltipTitleIOS}>{step.title}</Text>
        <Text style={styles.tooltipDescIOS}>{step.description}</Text>

        {/* Action indicator */}
        {step.action && step.action !== 'none' && (
          <View style={styles.actionIndicator}>
            <View style={styles.actionIconContainer}>
              <Ionicons
                name={step.action === 'tap' ? 'hand-left' : 'swap-horizontal'}
                size={22}
                color="#007AFF"
              />
            </View>
            <Text style={styles.actionTextIOS}>
              {step.action === 'tap' ? 'Tap to continue' : 'Swipe to continue'}
            </Text>
          </View>
        )}

        {/* Next button */}
        {(!step.action || step.action === 'none') && (
          <Pressable onPress={onNext} style={styles.nextButtonIOS}>
            <LinearGradient
              colors={['#007AFF', '#0051D5']}
              style={styles.nextButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.nextButtonTextIOS}>
                {currentStepIndex === totalSteps - 1 ? 'Get Started' : 'Continue'}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </LinearGradient>
          </Pressable>
        )}

        {/* Step indicator */}
        <Text style={styles.stepCounter}>
          {currentStepIndex + 1} of {totalSteps}
        </Text>
      </View>
    </Animated.View>
  );
}

export default function OnboardingOverlay({
  visible,
  steps,
  onComplete,
  onSkip,
  targetRefs = new Map(),
}: OnboardingOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetPosition, setTargetPosition] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const currentStepData = steps[currentStep];

  // Update position when step changes
  useEffect(() => {
    if (currentStepData?.targetRef) {
      const position = targetRefs.get(currentStepData.targetRef);
      if (position) {
        setTargetPosition(position);
      } else {
        setTargetPosition(null);
      }
    } else {
      setTargetPosition(null);
    }

    OnboardingServiceInstance.updateStep(currentStep, steps.length);
  }, [currentStep, currentStepData, targetRefs]);

  // Fade in animation
  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      OnboardingServiceInstance.saveProgress(currentStep + 1, steps.length);
    } else {
      handleComplete();
    }
  }, [currentStep, steps.length]);

  const handleComplete = useCallback(async () => {
    await OnboardingServiceInstance.markOnboardingCompleted(false);
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onComplete();
    });
  }, [onComplete]);

  const handleSkip = useCallback(async () => {
    await OnboardingServiceInstance.markOnboardingCompleted(true);
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onSkip();
    });
  }, [onSkip]);

  const handleTargetPress = useCallback(() => {
    if (currentStepData?.action === 'tap') {
      handleNext();
    }
  }, [currentStepData, handleNext]);

  if (!visible) return null;

  // Determine tooltip position for arrow
  const tooltipPosition = (() => {
    if (!targetPosition) return 'center';
    const spaceBelow = SCREEN_HEIGHT - (targetPosition.y + targetPosition.height);
    return spaceBelow > 280 ? 'bottom' : 'top';
  })();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleSkip}
    >
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        {/* Dimmed overlay */}
        <View style={styles.overlay} />

        {/* Spotlight effect */}
        <IOSSpotlight position={targetPosition} type={currentStepData?.highlightType || 'circle'} />

        {/* Arrow pointing to element */}
        {targetPosition && currentStepData?.highlightType !== 'none' && (
          <BouncingArrow 
            targetPosition={targetPosition} 
            tooltipPosition={tooltipPosition as 'top' | 'bottom' | 'center'} 
          />
        )}

        {/* Interactive area */}
        {targetPosition && currentStepData?.action === 'tap' && (
          <Pressable
            onPress={handleTargetPress}
            style={[
              styles.interactiveArea,
              {
                left: targetPosition.x - 12,
                top: targetPosition.y - 12,
                width: targetPosition.width + 24,
                height: targetPosition.height + 24,
              },
            ]}
          />
        )}

        {/* Tooltip card */}
        <IOSTooltip
          step={currentStepData}
          currentStepIndex={currentStep}
          totalSteps={steps.length}
          onNext={handleNext}
          onSkip={handleSkip}
          position={targetPosition}
        />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  spotlightOuter: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#007AFF',
    backgroundColor: 'transparent',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  spotlightInner: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 122, 255, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 122, 255, 0.4)',
  },
  arrowContainer: {
    position: 'absolute',
    zIndex: 100,
  },
  arrowShadow: {
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  interactiveArea: {
    position: 'absolute',
    zIndex: 1000,
    borderRadius: 20,
  },
  tooltipCard: {
    position: 'absolute',
    borderRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 30,
      },
      android: {
        elevation: 20,
      },
    }),
  },
  androidBlur: {
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
  },
  tooltipContent: {
    padding: 24,
  },
  tooltipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  progressDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  progressDotActive: {
    width: 20,
    backgroundColor: '#007AFF',
  },
  progressDotCompleted: {
    backgroundColor: 'rgba(0, 122, 255, 0.5)',
  },
  skipButtonIOS: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  skipTextIOS: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  tooltipTitleIOS: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: -0.5,
    lineHeight: 34,
    textAlign: 'center',
  },
  tooltipDescIOS: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 17,
    lineHeight: 24,
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  actionIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 122, 255, 0.12)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.3)',
  },
  actionIconContainer: {
    marginRight: 12,
  },
  actionTextIOS: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  nextButtonIOS: {
    marginBottom: 12,
    borderRadius: 14,
    overflow: 'hidden',
  },
  nextButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 8,
  },
  nextButtonTextIOS: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  stepCounter: {
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
});

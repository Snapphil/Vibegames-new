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
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { OnboardingStep } from '../services/OnboardingService';
import OnboardingServiceInstance from '../services/OnboardingService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Arrow component pointing to highlighted element
function Arrow({ position, direction }: { position: { x: number; y: number }; direction: 'up' | 'down' | 'left' | 'right' }) {
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1,
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
  }, []);

  const getArrowStyle = () => {
    const offset = bounceAnim.interpolate({
      inputRange: [0, 1],
      outputRange: direction === 'up' || direction === 'down' ? [0, -8] : [-8, 0],
    });

    const rotation = {
      up: '0deg',
      down: '180deg',
      left: '-90deg',
      right: '90deg',
    }[direction];

    return {
      left: position.x,
      top: position.y,
      transform: [
        { rotate: rotation },
        { translateY: direction === 'up' || direction === 'down' ? offset : 0 },
        { translateX: direction === 'left' || direction === 'right' ? offset : 0 },
      ],
    };
  };

  return (
    <Animated.View style={[styles.arrowContainer, getArrowStyle()]}>
      <Ionicons name="arrow-up" size={32} color="#007AFF" />
    </Animated.View>
  );
}

interface OnboardingOverlayProps {
  visible: boolean;
  steps: OnboardingStep[];
  onComplete: () => void;
  onSkip: () => void;
  targetRefs?: Map<string, { x: number; y: number; width: number; height: number }>;
}

interface TooltipProps {
  step: OnboardingStep;
  currentStepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
  position: { x: number; y: number; width: number; height: number } | null;
}

function Tooltip({ step, currentStepIndex, totalSteps, onNext, onSkip, position }: TooltipProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [step.id]);

  const getTooltipPosition = (): any => {
    if (!position) {
      return {
        top: SCREEN_HEIGHT / 2 - 150,
        left: 20,
        right: 20,
      };
    }

    const tooltipHeight = 200;
    const margin = 20;

    // Determine best position based on available space
    const spaceAbove = position.y;
    const spaceBelow = SCREEN_HEIGHT - (position.y + position.height);

    if (step.tooltipPosition === 'top' || (spaceAbove > tooltipHeight + margin && spaceBelow < tooltipHeight + margin)) {
      return {
        bottom: SCREEN_HEIGHT - position.y + margin,
        left: 20,
        right: 20,
      };
    } else if (step.tooltipPosition === 'bottom' || spaceBelow > tooltipHeight + margin) {
      return {
        top: position.y + position.height + margin,
        left: 20,
        right: 20,
      };
    } else {
      // Center if not enough space above or below
      return {
        top: SCREEN_HEIGHT / 2 - tooltipHeight / 2,
        left: 20,
        right: 20,
      };
    }
  };

  return (
    <Animated.View
      style={[
        styles.tooltip,
        getTooltipPosition(),
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.tooltipHeader}>
        <View style={styles.stepIndicator}>
          <Text style={styles.stepText}>
            {currentStepIndex + 1} / {totalSteps}
          </Text>
        </View>
        <Pressable onPress={onSkip} style={styles.skipButton} hitSlop={10}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <Text style={styles.tooltipTitle}>{step.title}</Text>
      <Text style={styles.tooltipDescription}>{step.description}</Text>

      {step.action && step.action !== 'none' && (
        <View style={styles.actionPrompt}>
          <Ionicons
            name={step.action === 'tap' ? 'hand-left-outline' : 'swap-horizontal-outline'}
            size={20}
            color="#FF3040"
          />
          <Text style={styles.actionText}>
            {step.action === 'tap' ? 'Tap the highlighted area' : 'Swipe to continue'}
          </Text>
        </View>
      )}

      {(!step.action || step.action === 'none') && (
        <Pressable onPress={onNext} style={styles.nextButton}>
          <Text style={styles.nextButtonText}>
            {currentStepIndex === totalSteps - 1 ? 'Finish' : 'Next'}
          </Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </Pressable>
      )}
    </Animated.View>
  );
}

function Spotlight({
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
            toValue: 1.08,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [position, type]);

  if (!position || type === 'none') {
    return null;
  }

  const isCircle = type === 'circle';
  const size = isCircle ? Math.max(position.width, position.height) + 20 : null;
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
        left: position.x - 10,
        top: position.y - 10,
        width: position.width + 20,
        height: position.height + 20,
        borderRadius: 16,
      };

  return (
    <>
      {/* Main highlight */}
      <Animated.View
        style={[
          styles.spotlight,
          spotlightStyle,
          {
            transform: [{ scale: pulseAnim }],
          },
        ]}
      />
      
      {/* Inner glow */}
      <View
        style={[
          styles.spotlightInner,
          spotlightStyle,
        ]}
      />
    </>
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

    // Update service progress
    OnboardingServiceInstance.updateStep(currentStep, steps.length);
  }, [currentStep, currentStepData, targetRefs]);

  // Fade in animation
  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
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
    // If this step requires a tap action, advance to next step
    if (currentStepData?.action === 'tap') {
      handleNext();
    }
  }, [currentStepData, handleNext]);

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleSkip}
    >
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        {/* Dark overlay with hole for spotlight */}
        <TouchableWithoutFeedback>
          <View style={styles.overlay}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.85)' }]} />
            )}
          </View>
        </TouchableWithoutFeedback>

        {/* Spotlight effect */}
        <Spotlight position={targetPosition} type={currentStepData?.highlightType || 'circle'} />

        {/* Interactive area for highlighted element */}
        {targetPosition && currentStepData?.action === 'tap' && (
          <Pressable
            onPress={handleTargetPress}
            style={[
              styles.interactiveArea,
              {
                left: targetPosition.x - 10,
                top: targetPosition.y - 10,
                width: targetPosition.width + 20,
                height: targetPosition.height + 20,
              },
            ]}
          />
        )}

        {/* Tooltip */}
        <Tooltip
          step={currentStepData}
          currentStepIndex={currentStep}
          totalSteps={steps.length}
          onNext={handleNext}
          onSkip={handleSkip}
          position={targetPosition}
        />

        {/* Progress dots */}
        <View style={styles.progressContainer}>
          {steps.map((_, index) => (
            <View
              key={index}
              style={[
                styles.progressDot,
                index === currentStep && styles.progressDotActive,
                index < currentStep && styles.progressDotCompleted,
              ]}
            />
          ))}
        </View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
  spotlight: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#FF3040',
    backgroundColor: 'transparent',
    shadowColor: '#FF3040',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 10,
  },
  spotlightInner: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 48, 64, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 48, 64, 0.3)',
  },
  interactiveArea: {
    position: 'absolute',
    zIndex: 1000,
  },
  tooltip: {
    position: 'absolute',
    backgroundColor: 'rgba(18, 18, 25, 0.98)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  tooltipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepIndicator: {
    backgroundColor: 'rgba(255, 48, 64, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 48, 64, 0.3)',
  },
  stepText: {
    color: '#FF3040',
    fontSize: 12,
    fontWeight: '700',
  },
  skipButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  skipText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  tooltipTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  tooltipDescription: {
    color: '#ABABAB',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  actionPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 48, 64, 0.1)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 48, 64, 0.2)',
    marginTop: 8,
  },
  actionText: {
    color: '#FF3040',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 10,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3040',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    marginTop: 12,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  progressDotActive: {
    width: 24,
    backgroundColor: '#FF3040',
  },
  progressDotCompleted: {
    backgroundColor: 'rgba(255, 48, 64, 0.5)',
  },
});

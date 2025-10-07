import { useState, useEffect, useCallback, useRef } from 'react';
import { LayoutRectangle } from 'react-native';
import OnboardingServiceInstance from '../services/OnboardingService';
import type { OnboardingProgress } from '../services/OnboardingService';

interface TargetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Custom hook for managing onboarding state and element references
 */
export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const targetRefs = useRef(new Map<string, TargetPosition>()).current;
  const checkTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Check if onboarding should be shown
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      try {
        console.log('🎓 Checking onboarding status...');
        const completed = await OnboardingServiceInstance.hasCompletedOnboarding();
        const currentProgress = await OnboardingServiceInstance.getProgress();
        
        console.log('🎓 Onboarding completed:', completed);
        setProgress(currentProgress);
        setIsReady(true);

        // Show onboarding if not completed (DEFAULT for first-time users)
        if (!completed) {
          console.log('🎓 First-time user detected! Starting onboarding tutorial...');
          // Small delay to ensure UI is mounted and elements are measured
          checkTimeoutRef.current = setTimeout(() => {
            console.log('🎓 Displaying onboarding overlay');
            setShowOnboarding(true);
          }, 800); // Slightly longer delay to ensure tab buttons are measured
        } else {
          console.log('🎓 User has completed onboarding, skipping tutorial');
        }
      } catch (error) {
        console.error('❌ Error checking onboarding status:', error);
        // On error, default to showing onboarding for safety
        console.log('⚠️ Defaulting to show onboarding due to error');
        setIsReady(true);
        checkTimeoutRef.current = setTimeout(() => {
          setShowOnboarding(true);
        }, 800);
      }
    };

    checkOnboardingStatus();

    // Subscribe to progress updates
    const unsubscribe = OnboardingServiceInstance.subscribe((newProgress) => {
      setProgress(newProgress);
      if (newProgress.completed) {
        setShowOnboarding(false);
      }
    });

    return () => {
      unsubscribe();
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Register a UI element for highlighting during onboarding
   */
  const registerTarget = useCallback(
    (refId: string, layout: LayoutRectangle) => {
      if (layout && layout.width > 0 && layout.height > 0) {
        targetRefs.set(refId, {
          x: layout.x,
          y: layout.y,
          width: layout.width,
          height: layout.height,
        });
      }
    },
    [targetRefs]
  );

  /**
   * Unregister a UI element
   */
  const unregisterTarget = useCallback(
    (refId: string) => {
      targetRefs.delete(refId);
    },
    [targetRefs]
  );

  /**
   * Manually trigger onboarding (for testing or reset)
   */
  const startOnboarding = useCallback(() => {
    setShowOnboarding(true);
  }, []);

  /**
   * Complete onboarding
   */
  const completeOnboarding = useCallback(async () => {
    console.log('✅ Onboarding completed!');
    await OnboardingServiceInstance.markOnboardingCompleted(false);
    setShowOnboarding(false);
  }, []);

  /**
   * Skip onboarding
   */
  const skipOnboarding = useCallback(async () => {
    console.log('⏭️ User skipped onboarding');
    await OnboardingServiceInstance.markOnboardingCompleted(true);
    setShowOnboarding(false);
  }, []);

  /**
   * Reset onboarding (useful for testing)
   */
  const resetOnboarding = useCallback(async () => {
    await OnboardingServiceInstance.resetOnboarding();
    setShowOnboarding(true);
  }, []);

  return {
    showOnboarding,
    isReady,
    progress,
    targetRefs,
    registerTarget,
    unregisterTarget,
    startOnboarding,
    completeOnboarding,
    skipOnboarding,
    resetOnboarding,
  };
}

/**
 * Helper hook for measuring and registering a single element
 */
export function useOnboardingTarget(refId: string, registerTarget: (id: string, layout: LayoutRectangle) => void) {
  const onLayout = useCallback(
    (event: any) => {
      const { x, y, width, height } = event.nativeEvent.layout;
      
      // Measure element position relative to window
      if (event.target && event.target.measure) {
        event.target.measure((fx: number, fy: number, fwidth: number, fheight: number, px: number, py: number) => {
          registerTarget(refId, {
            x: px,
            y: py,
            width: fwidth,
            height: fheight,
          });
        });
      } else {
        registerTarget(refId, { x, y, width, height });
      }
    },
    [refId, registerTarget]
  );

  return { onLayout };
}

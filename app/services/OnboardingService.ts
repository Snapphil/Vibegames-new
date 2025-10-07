import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, auth } from './firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const ONBOARDING_KEY = '@vibegames_onboarding_completed';

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  targetRef?: string; // Reference ID for the UI element to highlight
  action?: 'tap' | 'swipe' | 'none'; // Required action to progress
  position?: 'top' | 'bottom' | 'center';
  highlightType?: 'circle' | 'rect' | 'none';
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
}

export interface OnboardingProgress {
  completed: boolean;
  currentStep: number;
  totalSteps: number;
  skipped: boolean;
  lastUpdated: number;
}

class OnboardingService {
  private listeners: Set<(progress: OnboardingProgress) => void> = new Set();
  private currentProgress: OnboardingProgress | null = null;

  /**
   * Check if user has completed onboarding
   * Returns FALSE by default for first-time users (shows tutorial)
   */
  async hasCompletedOnboarding(): Promise<boolean> {
    try {
      // First check AsyncStorage for quick access
      const localValue = await AsyncStorage.getItem(ONBOARDING_KEY);
      console.log('📱 AsyncStorage onboarding status:', localValue);
      
      if (localValue === 'true') {
        console.log('✅ User has completed onboarding (from AsyncStorage)');
        return true;
      }

      // Check Firestore if user is authenticated
      const user = auth.currentUser;
      if (user) {
        console.log('👤 Checking Firestore for user:', user.uid);
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const data = userDoc.data();
          const completed = data?.onboardingCompleted === true;
          console.log('🔥 Firestore onboarding status:', completed);
          
          // Sync to AsyncStorage
          if (completed) {
            await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
          }
          
          return completed;
        } else {
          console.log('📝 No user document found - first time user!');
        }
      } else {
        console.log('🔓 No authenticated user yet');
      }

      // DEFAULT: Return false to show onboarding for first-time users
      console.log('🎯 Returning FALSE - onboarding will be shown (default for new users)');
      return false;
    } catch (error) {
      console.error('❌ Error checking onboarding status:', error);
      // DEFAULT on error: Show onboarding for safety
      console.log('⚠️ Error occurred - defaulting to FALSE (will show onboarding)');
      return false;
    }
  }

  /**
   * Mark onboarding as completed
   */
  async markOnboardingCompleted(skipped: boolean = false): Promise<void> {
    try {
      console.log('💾 Marking onboarding as completed (skipped:', skipped, ')');
      
      // Save to AsyncStorage
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      console.log('✅ Saved to AsyncStorage');

      // Save to Firestore if user is authenticated
      const user = auth.currentUser;
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, {
          onboardingCompleted: true,
          onboardingSkipped: skipped,
          onboardingCompletedAt: new Date().toISOString(),
        }, { merge: true });
        console.log('✅ Saved to Firestore');
      }

      // Update current progress
      if (this.currentProgress) {
        this.currentProgress.completed = true;
        this.currentProgress.skipped = skipped;
        this.currentProgress.lastUpdated = Date.now();
        this.notifyListeners();
      }

      console.log('🎉 Onboarding marked as completed! Tutorial will not show again.');
    } catch (error) {
      console.error('❌ Error marking onboarding as completed:', error);
      throw error;
    }
  }

  /**
   * Reset onboarding (useful for testing)
   */
  async resetOnboarding(): Promise<void> {
    try {
      console.log('🔄 Resetting onboarding...');
      await AsyncStorage.removeItem(ONBOARDING_KEY);
      console.log('🗑️ Removed from AsyncStorage');

      const user = auth.currentUser;
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, {
          onboardingCompleted: false,
          onboardingSkipped: false,
          onboardingResetAt: new Date().toISOString(),
        }, { merge: true });
        console.log('🗑️ Reset in Firestore');
      }

      this.currentProgress = null;
      this.notifyListeners();

      console.log('✅ Onboarding reset complete! Tutorial will show on next app load.');
    } catch (error) {
      console.error('❌ Error resetting onboarding:', error);
      throw error;
    }
  }

  /**
   * Get current onboarding progress
   */
  async getProgress(): Promise<OnboardingProgress> {
    if (this.currentProgress) {
      return this.currentProgress;
    }

    const completed = await this.hasCompletedOnboarding();
    
    this.currentProgress = {
      completed,
      currentStep: 0,
      totalSteps: 0,
      skipped: false,
      lastUpdated: Date.now(),
    };

    return this.currentProgress;
  }

  /**
   * Update current step
   */
  updateStep(step: number, totalSteps: number): void {
    if (!this.currentProgress) {
      this.currentProgress = {
        completed: false,
        currentStep: step,
        totalSteps,
        skipped: false,
        lastUpdated: Date.now(),
      };
    } else {
      this.currentProgress.currentStep = step;
      this.currentProgress.totalSteps = totalSteps;
      this.currentProgress.lastUpdated = Date.now();
    }

    this.notifyListeners();
  }

  /**
   * Subscribe to progress updates
   */
  subscribe(listener: (progress: OnboardingProgress) => void): () => void {
    this.listeners.add(listener);
    
    // Immediately call with current progress
    if (this.currentProgress) {
      listener(this.currentProgress);
    }

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of progress changes
   */
  private notifyListeners(): void {
    if (this.currentProgress) {
      this.listeners.forEach(listener => listener(this.currentProgress!));
    }
  }

  /**
   * Save partial progress to Firestore
   */
  async saveProgress(currentStep: number, totalSteps: number): Promise<void> {
    try {
      const user = auth.currentUser;
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, {
          onboardingProgress: {
            currentStep,
            totalSteps,
            lastUpdated: new Date().toISOString(),
          }
        }, { merge: true });
      }
    } catch (error) {
      console.error('Error saving onboarding progress:', error);
    }
  }
}

// Export singleton instance
const OnboardingServiceInstance = new OnboardingService();
export default OnboardingServiceInstance;

// Add default export for Expo Router
export { OnboardingServiceInstance as OnboardingServiceDefault };

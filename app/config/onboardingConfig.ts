import type { OnboardingStep } from '../services/OnboardingService';

/**
 * Onboarding configuration for VibeGames app
 * 
 * Customize these steps to guide users through your app's main features.
 * Each step can highlight specific UI elements and require user interaction.
 */
export const onboardingSteps: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to VibeGames!',
    description: 'Create and play AI-generated games instantly. Let\'s take a quick tour of the main features.',
    action: 'none',
    position: 'center',
    highlightType: 'none',
    tooltipPosition: 'bottom',
  },
  {
    id: 'play-tab',
    title: 'Play Tab',
    description: 'This is where all the action happens! Discover and play games created by you and the community.',
    targetRef: 'tab-play',
    action: 'tap',
    position: 'bottom',
    highlightType: 'circle',
    tooltipPosition: 'top',
  },
  {
    id: 'create-tab',
    title: 'Create Tab',
    description: 'Turn your ideas into playable games! Our AI will help you build games from simple descriptions.',
    targetRef: 'tab-create',
    action: 'tap',
    position: 'bottom',
    highlightType: 'circle',
    tooltipPosition: 'top',
  },
  {
    id: 'profile-tab',
    title: 'Profile Tab',
    description: 'View your created games, track your stats, and manage your account settings here.',
    targetRef: 'tab-profile',
    action: 'tap',
    position: 'bottom',
    highlightType: 'circle',
    tooltipPosition: 'top',
  },
  {
    id: 'ready',
    title: 'You\'re All Set!',
    description: 'Now you know the basics. Start creating amazing games or explore what others have made!',
    action: 'none',
    position: 'center',
    highlightType: 'none',
    tooltipPosition: 'bottom',
  },
];

/**
 * Configuration options for onboarding behavior
 */
export const onboardingConfig = {
  // Show onboarding automatically for new users
  autoShow: true,
  
  // Allow users to skip the onboarding
  allowSkip: true,
  
  // Delay before showing onboarding (ms)
  showDelay: 500,
  
  // Enable haptic feedback on interactions (iOS)
  enableHaptics: true,
  
  // Save progress to cloud (requires authentication)
  syncToCloud: true,
};

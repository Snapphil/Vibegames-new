# Onboarding System Documentation

## Overview

The VibeGames onboarding system provides an interactive, step-by-step tutorial for first-time users. It features:

- ✨ Visual highlights with animated spotlights
- 🎯 Interactive element targeting
- 📱 Touch-to-progress functionality
- 💾 Progress tracking (AsyncStorage + Firestore)
- ⏭️ Skip option
- 🔧 Fully configurable steps

## Architecture

### Core Components

1. **OnboardingService** (`app/services/OnboardingService.ts`)
   - Manages onboarding state
   - Handles persistence (AsyncStorage + Firestore)
   - Tracks progress
   - Provides subscription mechanism

2. **OnboardingOverlay** (`app/components/OnboardingOverlay.tsx`)
   - Renders the overlay with dark backdrop
   - Shows highlighted elements with animated spotlights
   - Displays tooltips with instructions
   - Handles user interactions

3. **useOnboarding Hook** (`app/hooks/useOnboarding.ts`)
   - Custom hook for managing onboarding state
   - Registers and tracks UI element positions
   - Provides control functions

4. **Configuration** (`app/config/onboardingConfig.ts`)
   - Defines onboarding steps
   - Configurable behavior options

## Usage

### Basic Integration

The onboarding system is already integrated into the main app (`app/index.tsx`). For reference:

```typescript
import { useOnboarding, useOnboardingTarget } from './hooks/useOnboarding';
import OnboardingOverlay from './components/OnboardingOverlay';
import { onboardingSteps } from './config/onboardingConfig';

function MyComponent() {
  const {
    showOnboarding,
    isReady,
    targetRefs,
    registerTarget,
    completeOnboarding,
    skipOnboarding,
  } = useOnboarding();

  // Register a UI element for highlighting
  const myButtonLayout = useOnboardingTarget('my-button-id', registerTarget);

  return (
    <View>
      <Pressable onLayout={myButtonLayout.onLayout}>
        <Text>My Button</Text>
      </Pressable>

      {isReady && (
        <OnboardingOverlay
          visible={showOnboarding}
          steps={onboardingSteps}
          onComplete={completeOnboarding}
          onSkip={skipOnboarding}
          targetRefs={targetRefs}
        />
      )}
    </View>
  );
}
```

### Configuring Steps

Edit `app/config/onboardingConfig.ts` to customize the tutorial:

```typescript
export const onboardingSteps: OnboardingStep[] = [
  {
    id: 'unique-step-id',
    title: 'Step Title',
    description: 'Step description explaining what this feature does.',
    targetRef: 'button-id', // ID of element to highlight (optional)
    action: 'tap', // 'tap' | 'swipe' | 'none'
    position: 'bottom', // 'top' | 'bottom' | 'center'
    highlightType: 'circle', // 'circle' | 'rect' | 'none'
    tooltipPosition: 'top', // 'top' | 'bottom' | 'left' | 'right'
  },
  // Add more steps...
];
```

### Step Properties

- **id**: Unique identifier for the step
- **title**: Main heading for the tooltip
- **description**: Detailed explanation of the feature
- **targetRef**: Reference ID of the UI element to highlight (optional)
- **action**: Required user action to progress
  - `'tap'`: User must tap the highlighted element
  - `'swipe'`: User must swipe (auto-advances after gesture)
  - `'none'`: Show "Next" button to continue
- **position**: Vertical positioning preference
- **highlightType**: Visual highlight style
  - `'circle'`: Circular spotlight (best for buttons)
  - `'rect'`: Rectangular spotlight (best for cards/sections)
  - `'none'`: No highlight (for intro/outro steps)
- **tooltipPosition**: Where to place the tooltip relative to highlighted element

## API Reference

### OnboardingService

```typescript
// Check if user has completed onboarding
await OnboardingServiceInstance.hasCompletedOnboarding(): Promise<boolean>

// Mark onboarding as completed
await OnboardingServiceInstance.markOnboardingCompleted(skipped?: boolean): Promise<void>

// Reset onboarding (for testing)
await OnboardingServiceInstance.resetOnboarding(): Promise<void>

// Get current progress
await OnboardingServiceInstance.getProgress(): Promise<OnboardingProgress>

// Subscribe to progress updates
const unsubscribe = OnboardingServiceInstance.subscribe((progress) => {
  console.log('Progress:', progress);
});
```

### useOnboarding Hook

```typescript
const {
  showOnboarding,    // boolean: whether to show overlay
  isReady,          // boolean: whether initialization is complete
  progress,         // OnboardingProgress | null: current progress
  targetRefs,       // Map: registered element positions
  registerTarget,   // Function: register a new target element
  unregisterTarget, // Function: unregister a target
  startOnboarding,  // Function: manually start onboarding
  completeOnboarding, // Function: mark as completed
  skipOnboarding,   // Function: mark as skipped
  resetOnboarding,  // Function: reset for testing
} = useOnboarding();
```

## Testing

### Reset Onboarding

To test the onboarding flow, add a reset button:

```typescript
import OnboardingServiceInstance from './services/OnboardingService';

<Pressable onPress={() => OnboardingServiceInstance.resetOnboarding()}>
  <Text>Reset Onboarding (Dev)</Text>
</Pressable>
```

### Console Commands

In development, you can use the service directly:

```javascript
// Check status
await OnboardingServiceInstance.hasCompletedOnboarding()

// Reset
await OnboardingServiceInstance.resetOnboarding()
```

## Customization

### Styling

Edit styles in `app/components/OnboardingOverlay.tsx`:

- `styles.overlay`: Dark backdrop
- `styles.spotlight`: Highlight border
- `styles.tooltip`: Tooltip card
- `styles.progressDot`: Progress indicators

### Animation

Adjust animation parameters:

```typescript
// In OnboardingOverlay.tsx
Animated.timing(fadeAnim, {
  toValue: 1,
  duration: 300, // Change duration
  useNativeDriver: true,
})
```

### Colors

Main colors used:
- Primary: `#FF3040` (red)
- Background: `rgba(18, 18, 25, 0.98)` (dark)
- Text: `#FFFFFF` (white)
- Secondary text: `#ABABAB` (gray)

## Best Practices

1. **Keep steps concise**: 5-7 steps maximum
2. **Use clear language**: Avoid jargon
3. **Test on different devices**: Ensure tooltips fit properly
4. **Progressive disclosure**: Start with essential features
5. **Allow skipping**: Don't force users through entire tutorial
6. **Persist progress**: Users can resume if they close the app

## Troubleshooting

### Onboarding not showing

1. Check if user is authenticated
2. Verify `hasCompletedOnboarding()` returns `false`
3. Check console for errors
4. Ensure `isReady` is `true`

### Element not highlighting

1. Verify `targetRef` matches registered element ID
2. Check if `onLayout` is called on the element
3. Ensure element is visible when onboarding starts
4. Try adding a delay before measuring

### Tooltip position incorrect

1. Adjust `tooltipPosition` in step config
2. Ensure element layout is measured correctly
3. Check device screen dimensions

## Future Enhancements

Potential improvements:

- [ ] Add gesture animations (swipe hints)
- [ ] Support for multiple onboarding flows
- [ ] Analytics tracking for step completion rates
- [ ] A/B testing for different tutorial variations
- [ ] Video or GIF demonstrations
- [ ] Voice-over support
- [ ] Multi-language support

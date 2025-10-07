# 🚀 Onboarding Quick Start Guide

## ✅ Current Status

**The onboarding tutorial is NOW configured to show BY DEFAULT on first app load!**

## 🎯 How It Works

### For First-Time Users
1. User opens the app for the first time
2. App checks AsyncStorage for `@vibegames_onboarding_completed` key
3. **Key not found = First-time user** → Tutorial shows automatically (800ms after UI mounts)
4. User completes or skips tutorial
5. Status saved to AsyncStorage + Firestore
6. Tutorial never shows again

### For Returning Users
1. App checks AsyncStorage
2. **Key exists = Returning user** → Tutorial skipped
3. User proceeds directly to main app

## 🔍 Console Output

When the app loads, you'll see these logs:

### First-Time User (Tutorial Shows):
```
🎓 Checking onboarding status...
📱 AsyncStorage onboarding status: null
👤 Checking Firestore for user: [user-id]
📝 No user document found - first time user!
🎯 Returning FALSE - onboarding will be shown (default for new users)
🎓 Onboarding completed: false
🎓 First-time user detected! Starting onboarding tutorial...
🎓 Displaying onboarding overlay
```

### Returning User (Tutorial Skipped):
```
🎓 Checking onboarding status...
📱 AsyncStorage onboarding status: true
✅ User has completed onboarding (from AsyncStorage)
🎓 Onboarding completed: true
🎓 User has completed onboarding, skipping tutorial
```

## 🧪 Testing

### Method 1: Using Debug Panel
1. Open app → Go to **Profile** tab
2. Scroll to bottom → Find **"Onboarding Debug"** panel
3. Click **"Reset Onboarding"**
4. **Reload the app** (close and reopen)
5. Tutorial will show automatically!

### Method 2: Clear App Data
- **iOS**: Delete and reinstall app
- **Android**: Go to Settings → Apps → VibeGames → Clear Data

### Method 3: Code Method
Add this to any button temporarily:
```typescript
import OnboardingServiceInstance from './app/services/OnboardingService';

<Pressable onPress={async () => {
  await OnboardingServiceInstance.resetOnboarding();
  alert('Onboarding reset! Reload the app to see tutorial.');
}}>
  <Text>Reset Tutorial</Text>
</Pressable>
```

## 📊 Data Storage

### AsyncStorage
- **Key**: `@vibegames_onboarding_completed`
- **Value**: `'true'` (only when completed)
- **Location**: Local device storage

### Firestore
- **Collection**: `users`
- **Document**: `{userId}`
- **Fields**:
  ```json
  {
    "onboardingCompleted": true,
    "onboardingSkipped": false,
    "onboardingCompletedAt": "2025-10-07T05:45:33.000Z"
  }
  ```

## 🎮 Tutorial Flow

### 5 Default Steps:
1. **Welcome Screen** - Introduction
2. **Play Tab** - (Tap to continue) Explore games
3. **Create Tab** - (Tap to continue) AI game creation
4. **Profile Tab** - (Tap to continue) View profile
5. **Ready Screen** - Completion message

### User Actions:
- **Tap highlighted elements** → Progress to next step
- **Click "Skip"** → Exit tutorial (marked as completed)
- **Complete all steps** → Marked as completed, never shows again

## ⚙️ Configuration

All settings are in `app/config/onboardingConfig.ts`:

```typescript
export const onboardingConfig = {
  autoShow: true,        // Shows automatically for new users
  allowSkip: true,       // Users can skip
  showDelay: 800,        // 800ms delay (in hook)
  enableHaptics: true,   // iOS haptic feedback
  syncToCloud: true,     // Sync to Firestore
};
```

## 🎨 Customization

### Add New Steps
Edit `app/config/onboardingConfig.ts`:
```typescript
{
  id: 'feature-name',
  title: '✨ New Feature',
  description: 'What this does...',
  targetRef: 'element-id',
  action: 'tap', // 'tap' | 'swipe' | 'none'
  highlightType: 'circle',
  tooltipPosition: 'top',
}
```

### Register UI Elements
In your component:
```typescript
import { useOnboardingTarget } from './hooks/useOnboarding';

const myLayout = useOnboardingTarget('element-id', registerTarget);

<Pressable onLayout={myLayout.onLayout}>
  <Text>My Button</Text>
</Pressable>
```

## ✅ Verification Checklist

- [x] Tutorial shows automatically on first app load
- [x] Tutorial doesn't show for returning users
- [x] Skip button works and marks as completed
- [x] Complete flow saves status to AsyncStorage + Firestore
- [x] Reset functionality works in debug panel
- [x] Console logs confirm behavior
- [x] Works regardless of dev mode
- [x] Works regardless of authentication status

## 🐛 Troubleshooting

### Tutorial Not Showing?
1. Check console for: `🎓 First-time user detected!`
2. Verify AsyncStorage is empty: `📱 AsyncStorage onboarding status: null`
3. Try reset in Profile → Onboarding Debug
4. Clear app data and reinstall

### Tutorial Shows Every Time?
1. Check if AsyncStorage is being cleared
2. Verify completion callback is being called
3. Check console for: `🎉 Onboarding marked as completed!`
4. Ensure no errors in save operation

### Elements Not Highlighted?
1. Verify element has `onLayout` handler
2. Check if `targetRef` matches registered ID
3. Add delay before showing overlay (already set to 800ms)
4. Check console for position measurements

## 📝 Key Changes Made

### Enhanced Logging
- Added comprehensive console logs throughout the flow
- Emoji indicators for easy scanning
- Clear status messages at each step

### Default Behavior
- Returns `false` by default (shows tutorial)
- On error, defaults to showing tutorial (safe behavior)
- First-time detection works without authentication

### Timing
- Increased delay to 800ms to ensure UI elements are measured
- Gives time for tab buttons to mount and register positions

## 🎉 Summary

**Your onboarding system is now configured to automatically show the tutorial to all first-time users by default!**

No special configuration needed - just run the app and it works. The tutorial guides users through the main features and never shows again once completed or skipped.

# True Background Processing Setup

## Problem
Expo Go doesn't support true background processing. When you exit the app, generation stops completely.

## Solution: Development Build

To enable true background processing, create a development build instead of using Expo Go.

### Steps:

1. **Install EAS CLI** (if not already installed):
   ```bash
   npm install -g @expo/eas-cli
   ```

2. **Login to EAS**:
   ```bash
   eas login
   ```

3. **Configure your project**:
   ```bash
   eas build:configure
   ```

4. **Build for development**:
   ```bash
   # For Android
   eas build --platform android --profile development

   # For iOS
   eas build --platform ios --profile development
   ```

5. **Install the development build** on your device

6. **Run with background processing**:
   ```bash
   npx expo run:android  # or :ios
   ```

## What Changes with Development Build

- ✅ **True background processing** - generation continues when app is closed
- ✅ **Background notifications** - get notified when generation completes
- ✅ **App can be killed** - generation survives app restarts/crashes
- ✅ **Better performance** - native modules work properly

## Current Expo Go Limitations

- ❌ Generation stops when app exits
- ❌ No background notifications
- ❌ No true background processing
- ✅ Progress persistence (resume when reopening)
- ✅ In-app notifications during generation

## Quick Test

After creating a development build, you can:
1. Start a game generation
2. Exit the app completely (swipe away)
3. Wait a few minutes
4. Reopen app - generation should continue or complete

The development build will have all the background processing features working properly!

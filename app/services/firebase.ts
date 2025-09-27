import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyBm5b6_R8D5ULbxz47hmni5jZRqAR8M0sE",
  authDomain: "vibegames-platform.firebaseapp.com",
  projectId: "vibegames-platform",
  storageBucket: "vibegames-platform.firebasestorage.app",
  messagingSenderId: "820937877459",
  appId: "1:820937877459:ios:b3658a6f17c6d674617126",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Configure Firebase Auth to persist authentication state
const configurePersistence = async () => {
  try {
    if (Platform.OS === 'web') {
      await setPersistence(auth, browserLocalPersistence);
      console.log('✅ Firebase Auth persistence configured with browserLocalPersistence');
      return;
    }

    const { getReactNativePersistence } = await import('firebase/auth/react-native');
    await setPersistence(auth, getReactNativePersistence(AsyncStorage));
    console.log('✅ Firebase Auth persistence configured with AsyncStorage');
  } catch (error) {
    console.error('❌ Firebase Auth persistence configuration failed:', error);
  }
};

void configurePersistence();

export { AsyncStorage };

// Add default export for Expo Router
export default {
  app,
  auth,
  db,
  AsyncStorage
};

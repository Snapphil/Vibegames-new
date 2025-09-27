import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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

// Configure Firebase Auth persistence for React Native
if (typeof document !== 'undefined') {
  // Web environment
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error('Error setting auth persistence:', error);
  });
} else {
  // React Native environment - persistence is automatic
  console.log('🔐 Firebase Auth: Using React Native default persistence');
}

console.log('✅ Firebase initialized successfully with auth persistence');

// Add default export for Expo Router
export default {
  app,
  auth,
  db
};

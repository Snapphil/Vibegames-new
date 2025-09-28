import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
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

// Firebase Auth persistence will use default behavior
// Persistence configuration removed to avoid import issues with Firebase v11
console.log('✅ Firebase initialized successfully (cache cleared)');

// Add default export for Expo Router
export default {
  app,
  auth,
  db
};

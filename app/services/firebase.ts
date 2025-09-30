import { Platform } from 'react-native';

// Use compat mode for web to avoid import.meta issues
let firebase: any;
let auth: any;
let db: any;

const firebaseConfig = {
  apiKey: "AIzaSyBm5b6_R8D5ULbxz47hmni5jZRqAR8M0sE",
  authDomain: "vibegames-platform.firebaseapp.com",
  projectId: "vibegames-platform",
  storageBucket: "vibegames-platform.firebasestorage.app",
  messagingSenderId: "820937877459",
  appId: "1:820937877459:ios:b3658a6f17c6d674617126",
};

if (Platform.OS === 'web') {
  // Use compat mode for web to avoid import.meta issues with Firebase v10+
  const compat = require('firebase/compat/app');
  require('firebase/compat/auth');
  require('firebase/compat/firestore');
  
  if (!compat.apps.length) {
    firebase = compat.initializeApp(firebaseConfig);
  } else {
    firebase = compat.app();
  }
  
  auth = firebase.auth();
  db = firebase.firestore();
  
  console.log('✅ Firebase initialized (web compat mode)');
} else {
  // Use modular SDK for native platforms
  const { initializeApp, getApps, getApp } = require('firebase/app');
  const { getAuth } = require('firebase/auth');
  const { getFirestore } = require('firebase/firestore');
  
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  
  console.log('✅ Firebase initialized (native modular mode)');
}

export { auth, db };

// Add default export for Expo Router
export default {
  auth,
  db
};

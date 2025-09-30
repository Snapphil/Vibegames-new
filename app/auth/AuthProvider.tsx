import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { auth } from '../services/firebase';
import { ensureUserDocument } from '../services/userRegistry';
import { UserService } from '../services/UserService';
import { SessionService } from '../services/SessionService';

// Import Firebase auth functions based on platform
let createUserWithEmailAndPassword: any;
let signInWithEmailAndPassword: any;
let onAuthStateChanged: any;
let signOut: any;
let sendPasswordResetEmail: any;
let User: any;

if (Platform.OS === 'web') {
  // Compat mode doesn't export these as separate functions - they're methods on auth
  // We'll use them directly from the auth object
} else {
  // Modular SDK for native
  const firebaseAuth = require('firebase/auth');
  createUserWithEmailAndPassword = firebaseAuth.createUserWithEmailAndPassword;
  signInWithEmailAndPassword = firebaseAuth.signInWithEmailAndPassword;
  onAuthStateChanged = firebaseAuth.onAuthStateChanged;
  signOut = firebaseAuth.signOut;
  sendPasswordResetEmail = firebaseAuth.sendPasswordResetEmail;
  User = firebaseAuth.User;
}

type AuthContextValue = {
  user: any | null;
  initializing: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOutFirebase: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signInAsAdmin: (passcode: string) => Promise<void>;
  authError: string | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<any | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Initialize Firebase Auth state listener

  useEffect(() => {
    // Handle both compat (web) and modular (native) APIs
    const handleAuthStateChange = async (u: any) => {
      setUser(u);
      
      if (u) {
        try {
          // Initialize user session
          await SessionService.initializeSession(u);
          console.log('✅ User session initialized');

          // Sync user profile when auth state changes (e.g., app restart with logged in user)
          if (!initializing) {
            const userService = UserService.getInstance();
            await userService.syncProfileFromFirebase(u);
            console.log('🔄 User profile synced on auth state change');
          }
        } catch (error) {
          console.error('Error setting up user session and profile:', error);
        }
      } else {
        // End session when user logs out
        try {
          await SessionService.endSession();
          console.log('✅ User session ended');
        } catch (error) {
          console.error('Error ending session:', error);
        }
      }
      
      if (initializing) setInitializing(false);
    };
    
    let unsub: any;
    if (Platform.OS === 'web') {
      // Compat API: auth.onAuthStateChanged is a method
      unsub = auth.onAuthStateChanged(handleAuthStateChange);
    } else {
      // Modular API: onAuthStateChanged is a function
      unsub = onAuthStateChanged(auth, handleAuthStateChange);
    }
    
    return unsub;
  }, [initializing]);

  const signInWithEmail = async (email: string, password: string) => {
    try {
      setAuthError(null);
      
      if (!email.trim() || !password.trim()) {
        throw new Error('Please enter both email and password');
      }

      console.log('🔐 Starting Email Sign-In:', {
        email: email,
        platform: Platform.OS,
      });

      let firebaseResult: any;
      if (Platform.OS === 'web') {
        // Compat API: method on auth object
        firebaseResult = await auth.signInWithEmailAndPassword(email, password);
      } else {
        // Modular API: standalone function
        firebaseResult = await signInWithEmailAndPassword(auth, email, password);
      }
      
      console.log('🔥 Firebase email sign-in successful:', {
        uid: firebaseResult.user.uid,
        email: firebaseResult.user.email,
        platform: Platform.OS,
      });
      
      await ensureUserDocument(firebaseResult.user);
      console.log('👤 User document ensured');
      
      // Initialize user session
      await SessionService.initializeSession(firebaseResult.user);
      console.log('✅ User session initialized');
      
      // Sync user profile from Firebase to local storage
      const userService = UserService.getInstance();
      await userService.syncProfileFromFirebase(firebaseResult.user);
      console.log('🔄 User profile synced from Firebase');
      
    } catch (error) {
      console.error('🚨 Email Sign-In Error:', error);
      
      let errorMessage = 'Sign-in failed. Please try again.';
      
      if (error instanceof Error) {
        if (error.message.includes('user-not-found')) {
          errorMessage = 'No account found with this email address.';
        } else if (error.message.includes('wrong-password')) {
          errorMessage = 'Incorrect password. Please try again.';
        } else if (error.message.includes('invalid-email')) {
          errorMessage = 'Please enter a valid email address.';
        } else if (error.message.includes('too-many-requests')) {
          errorMessage = 'Too many failed attempts. Please try again later.';
        } else if (error.message.includes('network')) {
          errorMessage = 'Network error. Please check your internet connection.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setAuthError(errorMessage);
      throw error;
    }
  };

  const signUpWithEmail = async (email: string, password: string) => {
    try {
      setAuthError(null);
      
      if (!email.trim() || !password.trim()) {
        throw new Error('Please enter both email and password');
      }

      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      console.log('🔐 Starting Email Sign-Up:', {
        email: email,
        platform: Platform.OS,
      });

      let firebaseResult: any;
      if (Platform.OS === 'web') {
        // Compat API: method on auth object
        firebaseResult = await auth.createUserWithEmailAndPassword(email, password);
      } else {
        // Modular API: standalone function
        firebaseResult = await createUserWithEmailAndPassword(auth, email, password);
      }
      
      console.log('🔥 Firebase email sign-up successful:', {
        uid: firebaseResult.user.uid,
        email: firebaseResult.user.email,
        platform: Platform.OS,
      });
      
      await ensureUserDocument(firebaseResult.user);
      console.log('👤 User document ensured');
      
      // Initialize user session
      await SessionService.initializeSession(firebaseResult.user);
      console.log('✅ User session initialized');
      
      // Sync user profile from Firebase to local storage
      const userService = UserService.getInstance();
      await userService.syncProfileFromFirebase(firebaseResult.user);
      console.log('🔄 User profile synced from Firebase');
      
    } catch (error) {
      console.error('🚨 Email Sign-Up Error:', error);
      
      let errorMessage = 'Sign-up failed. Please try again.';
      
      if (error instanceof Error) {
        if (error.message.includes('email-already-in-use')) {
          errorMessage = 'An account with this email already exists. Please sign in instead.';
        } else if (error.message.includes('weak-password')) {
          errorMessage = 'Password is too weak. Please use at least 6 characters.';
        } else if (error.message.includes('invalid-email')) {
          errorMessage = 'Please enter a valid email address.';
        } else if (error.message.includes('network')) {
          errorMessage = 'Network error. Please check your internet connection.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setAuthError(errorMessage);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      setAuthError(null);
      
      if (!email.trim()) {
        throw new Error('Please enter your email address');
      }

      if (Platform.OS === 'web') {
        // Compat API: method on auth object
        await auth.sendPasswordResetEmail(email);
      } else {
        // Modular API: standalone function
        await sendPasswordResetEmail(auth, email);
      }
      console.log('📧 Password reset email sent to:', email);
      
    } catch (error) {
      console.error('🚨 Password Reset Error:', error);
      
      let errorMessage = 'Failed to send password reset email.';
      
      if (error instanceof Error) {
        if (error.message.includes('user-not-found')) {
          errorMessage = 'No account found with this email address.';
        } else if (error.message.includes('invalid-email')) {
          errorMessage = 'Please enter a valid email address.';
        } else if (error.message.includes('network')) {
          errorMessage = 'Network error. Please check your internet connection.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setAuthError(errorMessage);
      throw error;
    }
  };

  const signOutFirebase = async () => {
    try {
      // Update user's last logout timestamp in Firebase before signing out
      if (user) {
        try {
          const userService = UserService.getInstance();
          const username = user.email?.split('@')[0]?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || user.uid.slice(0, 10);
          
          const { db } = await import('../services/firebase');
          
          if (Platform.OS === 'web') {
            // Compat API
            const userRef = db.collection('users').doc(username);
            await userRef.update({
              lastLogoutAt: (window as any).firebase?.firestore?.FieldValue?.serverTimestamp() || new Date(),
              updatedAt: (window as any).firebase?.firestore?.FieldValue?.serverTimestamp() || new Date()
            });
          } else {
            // Modular API
            const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
            const userRef = doc(db, 'users', username);
            await updateDoc(userRef, {
              lastLogoutAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
          console.log('📝 Updated user logout timestamp in Firebase');
        } catch (updateError) {
          console.error('⚠️ Failed to update logout timestamp:', updateError);
          // Don't throw - continue with sign out even if this fails
        }
      }

      if (Platform.OS === 'web') {
        // Compat API: method on auth object
        await auth.signOut();
      } else {
        // Modular API: standalone function
        await signOut(auth);
      }
      setAuthError(null);
      console.log('👋 User signed out successfully');
    } catch (error) {
      console.error('Sign-out error:', error);
      throw error;
    }
  };

  const signInAsAdmin = async (passcode: string) => {
    try {
      setAuthError(null);
      
      if (passcode !== 'kkkkkkkk') {
        throw new Error('Invalid admin passcode');
      }

      // Create a mock admin user object with minimal required properties
      const adminUser = {
        uid: 'admin-user-123',
        email: 'admin@vibegames.com',
        displayName: 'Admin User',
        photoURL: null,
        emailVerified: true,
        isAnonymous: false,
        metadata: {},
        providerData: [],
        refreshToken: 'admin-refresh-token',
        tenantId: null,
        delete: async () => {},
        getIdToken: async () => 'admin-id-token',
        getIdTokenResult: async () => ({} as any),
        reload: async () => {},
        toJSON: () => ({}),
        phoneNumber: null,
        providerId: 'admin',
      } as any;

      // Set the admin user directly
      setUser(adminUser);
      setInitializing(false);
      
      console.log('🔐 Admin sign-in successful:', {
        uid: adminUser.uid,
        email: adminUser.email,
        displayName: adminUser.displayName,
      });
      
    } catch (error) {
      console.error('🚨 Admin Sign-In Error:', error);
      throw error;
    }
  };

  const value = useMemo(
    () => ({ user, initializing, signInWithEmail, signUpWithEmail, signOutFirebase, resetPassword, signInAsAdmin, authError }),
    [user, initializing, signInWithEmail, signUpWithEmail, resetPassword, signInAsAdmin, authError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Add default export for Expo Router
export default AuthProvider;

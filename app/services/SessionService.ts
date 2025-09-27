import { User } from 'firebase/auth';
import { db } from './firebase';
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserSession {
  sessionId: string;
  userId: string;
  userHandle: string;
  startTime: any;
  lastActivity: any;
  platform: string;
  isActive: boolean;
}

class SessionManager {
  private static instance: SessionManager;
  private currentSession: UserSession | null = null;
  
  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Create or restore user session when app starts
   */
  async initializeSession(user: User): Promise<UserSession> {
    try {
      // Generate session ID
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Get user handle from Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userHandle = userDoc.exists() ? userDoc.data().handle : `@${user.uid.slice(0, 8)}`;
      
      // Create session object
      const session: UserSession = {
        sessionId,
        userId: user.uid,
        userHandle,
        startTime: serverTimestamp(),
        lastActivity: serverTimestamp(),
        platform: 'mobile', // Could be 'web', 'ios', 'android'
        isActive: true
      };

      // Store session in Firestore for tracking
      await setDoc(doc(db, 'user_sessions', sessionId), session);
      
      // Store session locally for quick access
      await AsyncStorage.setItem('currentSession', JSON.stringify({
        ...session,
        startTime: Date.now(),
        lastActivity: Date.now()
      }));

      this.currentSession = session;
      console.log('✅ Session initialized:', sessionId);
      
      return session;
    } catch (error) {
      console.error('Error initializing session:', error);
      throw error;
    }
  }

  /**
   * Get current active session
   */
  async getCurrentSession(): Promise<UserSession | null> {
    if (this.currentSession) {
      return this.currentSession;
    }

    try {
      const sessionData = await AsyncStorage.getItem('currentSession');
      if (sessionData) {
        this.currentSession = JSON.parse(sessionData);
        return this.currentSession;
      }
    } catch (error) {
      console.error('Error getting current session:', error);
    }

    return null;
  }

  /**
   * Update session activity timestamp
   */
  async updateActivity(): Promise<void> {
    const session = await this.getCurrentSession();
    if (!session) return;

    try {
      // Update Firestore
      await updateDoc(doc(db, 'user_sessions', session.sessionId), {
        lastActivity: serverTimestamp()
      });

      // Update local storage
      const updatedSession = {
        ...session,
        lastActivity: Date.now()
      };
      await AsyncStorage.setItem('currentSession', JSON.stringify(updatedSession));
      
      this.currentSession = updatedSession;
    } catch (error) {
      console.error('Error updating session activity:', error);
    }
  }

  /**
   * End current session
   */
  async endSession(): Promise<void> {
    const session = await this.getCurrentSession();
    if (!session) return;

    try {
      // Mark session as inactive in Firestore
      await updateDoc(doc(db, 'user_sessions', session.sessionId), {
        isActive: false,
        endTime: serverTimestamp()
      });

      // Clear local session
      await AsyncStorage.removeItem('currentSession');
      this.currentSession = null;
      
      console.log('✅ Session ended:', session.sessionId);
    } catch (error) {
      console.error('Error ending session:', error);
    }
  }

  /**
   * Get user identifier for tracking (handles both Firebase UID and session-based IDs)
   */
  getUserIdentifier(): string {
    if (this.currentSession) {
      return this.currentSession.userId;
    }
    return '@anonymous';
  }

  /**
   * Get user handle for display purposes
   */
  getUserHandle(): string {
    if (this.currentSession) {
      return this.currentSession.userHandle;
    }
    return '@anonymous';
  }
}

export const SessionService = SessionManager.getInstance();
export default SessionService;

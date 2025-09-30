import { Platform } from 'react-native';
import { db } from './firebase';
import { GameStorage } from './GameStorage';
import type { User } from 'firebase/auth';

// Import Firestore functions only for non-web platforms
let doc: any, getDoc: any, updateDoc: any, serverTimestamp: any, collection: any, query: any, where: any, limit: any, getDocs: any;

if (Platform.OS !== 'web') {
  const firestore = require('firebase/firestore');
  doc = firestore.doc;
  getDoc = firestore.getDoc;
  updateDoc = firestore.updateDoc;
  serverTimestamp = firestore.serverTimestamp;
  collection = firestore.collection;
  query = firestore.query;
  where = firestore.where;
  limit = firestore.limit;
  getDocs = firestore.getDocs;
}

export interface UserProfile {
  displayName: string;
  bio: string;
  avatar: string;
  handle: string;
  email: string | null;
  photoURL: string | null;
  totals: {
    totalLikes: number;
    totalViews: number;
    totalGames: number;
  };
  likedGames?: string[]; // Array of game IDs that user has liked
  createdGames?: string[]; // Array of game IDs that user has created
  createdAt: any;
  updatedAt: any;
  lastLoginAt: any;
}

export interface LocalUserProfile {
  name: string;
  bio: string;
  avatar: string;
  totalLikes: number;
  totalViews: number;
  totalGames: number;
  likedGames?: string[]; // Array of game IDs that user has liked
  createdGames?: string[]; // Array of game IDs that user has created
}

export class UserService {
  private static instance: UserService;

  public static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  /**
   * Helper function to extract username from user email or handle
   */
  private getUsernameFromUser(user: User): string {
    if (user.email && user.email.includes('@')) {
      const emailUsername = user.email.split('@')[0];
      const cleanUsername = emailUsername.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (cleanUsername.length > 0) {
        return cleanUsername;
      }
    }
    
    // Fallback to displayName or UID
    const base = (user.displayName || user.uid)
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase() || user.uid.slice(0, 10);
    return base;
  }

  /**
   * Get user profile from Firebase by username
   */
  async getFirebaseUserProfile(username: string): Promise<UserProfile | null> {
    try {
      // Remove @ prefix if present
      const cleanUsername = username.startsWith('@') ? username.slice(1) : username;
      console.log('🔍 Getting Firebase profile for username:', cleanUsername);
      
      const userRef = doc(db, 'users', cleanUsername);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data() as UserProfile;
        console.log('✅ Firebase profile found:', data);
        return data;
      } else {
        console.log('❌ No Firebase profile document found for username:', cleanUsername);
        return null;
      }
    } catch (error) {
      console.error('❌ Error getting Firebase user profile:', error);
      return null;
    }
  }

  /**
   * Get user profile from Firebase by Firebase UID (for backward compatibility)
   */
  async getFirebaseUserProfileByUID(uid: string): Promise<UserProfile | null> {
    try {
      // Query users collection to find document with matching uid field
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('uid', '==', uid), limit(1));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        return userDoc.data() as UserProfile;
      }
      return null;
    } catch (error) {
      console.error('Error getting Firebase user profile by UID:', error);
      return null;
    }
  }

  /**
   * Get user profile from local storage
   */
  async getLocalUserProfile(): Promise<LocalUserProfile | null> {
    try {
      return await GameStorage.getUserProfile();
    } catch (error) {
      console.error('Error getting local user profile:', error);
      return null;
    }
  }

  /**
   * Sync user profile from Firebase to local storage
   */
  async syncProfileFromFirebase(user: User): Promise<LocalUserProfile | null> {
    try {
      // Get username from user
      const username = this.getUsernameFromUser(user);
      console.log('🔍 Syncing profile for user:', {
        uid: user.uid,
        email: user.email,
        username: username
      });
      
      // Get Firebase profile using username
      const firebaseProfile = await this.getFirebaseUserProfile(username);
      
      if (!firebaseProfile) {
        console.log('❌ No Firebase profile found for username:', username);
        console.log('🔄 Attempting to find profile by UID as fallback...');
        
        // Try to find by UID as fallback
        const profileByUID = await this.getFirebaseUserProfileByUID(user.uid);
        if (profileByUID) {
          console.log('✅ Found profile by UID, using that instead');
          const localProfile: LocalUserProfile = {
            name: profileByUID.displayName,
            bio: profileByUID.bio,
            avatar: profileByUID.avatar,
            totalLikes: profileByUID.totals?.totalLikes || 0,
            totalViews: profileByUID.totals?.totalViews || 0,
            totalGames: profileByUID.totals?.totalGames || 0,
          };
          await GameStorage.updateUserProfile(localProfile);
          return localProfile;
        }
        
        return null;
      }

      // Convert to local format
      const localProfile: LocalUserProfile = {
        name: firebaseProfile.displayName,
        bio: firebaseProfile.bio,
        avatar: firebaseProfile.avatar,
        totalLikes: firebaseProfile.totals?.totalLikes || 0,
        totalViews: firebaseProfile.totals?.totalViews || 0,
        totalGames: firebaseProfile.totals?.totalGames || 0,
      };

      // Update local storage
      await GameStorage.updateUserProfile(localProfile);
      
      console.log('✅ Synced profile from Firebase to local storage:', localProfile);
      return localProfile;
    } catch (error) {
      console.error('❌ Error syncing profile from Firebase:', error);
      return null;
    }
  }

  /**
   * Sync user profile from local storage to Firebase
   */
  async syncProfileToFirebase(user: User): Promise<void> {
    try {
      const localProfile = await this.getLocalUserProfile();
      
      if (!localProfile) {
        console.log('No local profile found');
        return;
      }

      // Get username from user
      const username = this.getUsernameFromUser(user);
      const userRef = doc(db, 'users', username);
      
      // Update Firebase with local data (but preserve Firebase-specific fields)
      await updateDoc(userRef, {
        displayName: localProfile.name,
        bio: localProfile.bio,
        avatar: localProfile.avatar,
        updatedAt: serverTimestamp(),
        // Note: Don't overwrite totals - they should be managed by the game actions
      });
      
      console.log('✅ Synced profile from local storage to Firebase');
    } catch (error) {
      console.error('Error syncing profile to Firebase:', error);
    }
  }

  /**
   * Get combined profile (Firebase totals + local display data)
   */
  async getCombinedProfile(user: User): Promise<LocalUserProfile | null> {
    try {
      // Get username from user
      const username = this.getUsernameFromUser(user);
      console.log('🔍 Getting combined profile for user:', {
        uid: user.uid,
        email: user.email,
        username: username
      });
      
      // First try to get Firebase profile for accurate totals
      const firebaseProfile = await this.getFirebaseUserProfile(username);
      const localProfile = await this.getLocalUserProfile();

      console.log('📊 Profile data found:', {
        hasFirebaseProfile: !!firebaseProfile,
        hasLocalProfile: !!localProfile,
        firebaseData: firebaseProfile ? {
          displayName: firebaseProfile.displayName,
          bio: firebaseProfile.bio,
          avatar: firebaseProfile.avatar,
          totals: firebaseProfile.totals
        } : null,
        localData: localProfile
      });

      if (firebaseProfile) {
        // Use Firebase totals but local display data if available
        const combined = {
          name: localProfile?.name || firebaseProfile.displayName,
          bio: localProfile?.bio || firebaseProfile.bio,
          avatar: localProfile?.avatar || firebaseProfile.avatar,
          totalLikes: firebaseProfile.totals?.totalLikes || 0,
          totalViews: firebaseProfile.totals?.totalViews || 0,
          totalGames: firebaseProfile.totals?.totalGames || 0,
        };
        console.log('✅ Using combined profile (Firebase + local):', combined);
        return combined;
      } else if (localProfile) {
        // Fallback to local profile
        console.log('⚠️ Using local profile only (no Firebase data):', localProfile);
        return localProfile;
      }

      console.log('❌ No profile data found at all');
      return null;
    } catch (error) {
      console.error('❌ Error getting combined profile:', error);
      return null;
    }
  }

  /**
   * Update user profile (both local and Firebase)
   */
  async updateUserProfile(user: User, updates: Partial<LocalUserProfile>): Promise<LocalUserProfile | null> {
    try {
      // Update local storage
      const updatedLocal = await GameStorage.updateUserProfile(updates);

      // Get username from user
      const username = this.getUsernameFromUser(user);
      
      // Update Firebase display fields (not totals)
      const userRef = doc(db, 'users', username);
      const firebaseUpdates: any = {
        updatedAt: serverTimestamp()
      };

      if (updates.name !== undefined) {
        firebaseUpdates.displayName = updates.name;
      }
      if (updates.bio !== undefined) {
        firebaseUpdates.bio = updates.bio;
      }
      if (updates.avatar !== undefined) {
        firebaseUpdates.avatar = updates.avatar;
      }

      await updateDoc(userRef, firebaseUpdates);
      
      console.log('✅ Updated user profile in both local and Firebase');
      return updatedLocal;
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  }

  /**
   * Add a game to user's liked games list
   */
  async addLikedGame(user: User, gameId: string): Promise<void> {
    try {
      const username = this.getUsernameFromUser(user);
      const userRef = doc(db, 'users', username);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        console.log(`⚠️ User document not found: ${username}`);
        return;
      }

      const userData = userDoc.data();
      const currentLikedGames = userData.likedGames || [];
      
      // Only add if not already in the list
      if (!currentLikedGames.includes(gameId)) {
        const updatedLikedGames = [...currentLikedGames, gameId];
        
        await updateDoc(userRef, {
          likedGames: updatedLikedGames,
          updatedAt: serverTimestamp()
        });
        
        console.log(`✅ Added game ${gameId} to user's liked games list`);
      } else {
        console.log(`ℹ️ Game ${gameId} already in user's liked games list`);
      }
    } catch (error) {
      console.error('Error adding liked game:', error);
      throw error;
    }
  }

  /**
   * Remove a game from user's liked games list
   */
  async removeLikedGame(user: User, gameId: string): Promise<void> {
    try {
      const username = this.getUsernameFromUser(user);
      const userRef = doc(db, 'users', username);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        console.log(`⚠️ User document not found: ${username}`);
        return;
      }

      const userData = userDoc.data();
      const currentLikedGames = userData.likedGames || [];
      
      // Remove the game from the list
      const updatedLikedGames = currentLikedGames.filter((id: string) => id !== gameId);
      
      await updateDoc(userRef, {
        likedGames: updatedLikedGames,
        updatedAt: serverTimestamp()
      });
      
      console.log(`✅ Removed game ${gameId} from user's liked games list`);
    } catch (error) {
      console.error('Error removing liked game:', error);
      throw error;
    }
  }

  /**
   * Get user's liked games with full game details
   */
  async getUserLikedGames(user: User): Promise<any[]> {
    try {
      const username = this.getUsernameFromUser(user);
      const userRef = doc(db, 'users', username);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        console.log(`⚠️ User document not found: ${username}`);
        return [];
      }

      const userData = userDoc.data();
      const likedGameIds = userData.likedGames || [];
      
      if (likedGameIds.length === 0) {
        return [];
      }

      // Fetch game details for each liked game ID
      const games: any[] = [];
      for (const gameId of likedGameIds) {
        try {
          const gameRef = doc(db, 'games', gameId);
          const gameDoc = await getDoc(gameRef);
          
          if (gameDoc.exists()) {
            const gameData = gameDoc.data();
            games.push({
              id: gameDoc.id,
              title: gameData.title || 'Untitled Game',
              author: gameData.author || 'Unknown',
              category: gameData.category || 'Other',
              difficulty: gameData.difficulty || 'medium',
              duration: gameData.duration || 60,
              likes: gameData.likes || 0,
              views: gameData.views || 0,
              plays: gameData.plays || 0,
              isActive: gameData.isActive !== false,
              createdAt: gameData.createdAt,
              html: gameData.html,
              description: gameData.description,
              liked: true, // Always true for liked games
              commentCount: gameData.commentCount || 0
            });
          }
        } catch (gameError) {
          console.error(`Error fetching liked game ${gameId}:`, gameError);
          // Continue with other games
        }
      }

      console.log(`✅ Retrieved ${games.length} liked games for user ${username}`);
      return games.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); // Sort by creation date, newest first
    } catch (error) {
      console.error('Error getting user liked games:', error);
      return [];
    }
  }

  /**
   * Update user totals when they perform actions (like viewing or liking games)
   */
  async updateUserActionTotals(user: User, action: 'liked_game' | 'unliked_game' | 'viewed_game'): Promise<void> {
    try {
      const username = this.getUsernameFromUser(user);
      const userRef = doc(db, 'users', username);
      
      // Check if user document exists
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        console.log(`⚠️ User document not found for totals update: ${username}`);
        return;
      }

      const userData = userDoc.data();
      const currentTotals = userData.totals || { totalLikes: 0, totalViews: 0, totalGames: 0 };
      
      let updateData: any = {
        updatedAt: serverTimestamp()
      };

      switch (action) {
        case 'liked_game':
          // Track how many games this user has liked (different from totalLikes which is likes received on their games)
          // We'll add a new field for this if needed
          console.log(`📊 User ${username} liked a game - action tracked`);
          break;
        case 'unliked_game':
          // Track unliked games
          console.log(`📊 User ${username} unliked a game - action tracked`);
          break;
        case 'viewed_game':
          // Track games viewed by this user
          console.log(`📊 User ${username} viewed a game - action tracked`);
          break;
      }

      // Always update the timestamp
      await updateDoc(userRef, updateData);
      console.log(`✅ Updated user action tracking for ${username}: ${action}`);
    } catch (error) {
      console.error('Error updating user action totals:', error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Update user's total likes count (when they receive likes on their games)
   */
  async updateUserTotalLikes(user: User, increment: boolean = true): Promise<void> {
    try {
      const username = this.getUsernameFromUser(user);
      const userRef = doc(db, 'users', username);
      
      // Check if user document exists
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        console.log(`⚠️ User document not found for totals update: ${username}`);
        return;
      }

      const userData = userDoc.data();
      const currentTotalLikes = userData.totals?.totalLikes || 0;
      const newTotalLikes = increment ? currentTotalLikes + 1 : Math.max(0, currentTotalLikes - 1);
      
      await updateDoc(userRef, {
        'totals.totalLikes': newTotalLikes,
        updatedAt: serverTimestamp()
      });
      
      console.log(`✅ Updated user ${username} total likes: ${currentTotalLikes} → ${newTotalLikes}`);
    } catch (error) {
      console.error('Error updating user total likes:', error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Update user's total views count (when their games get viewed)
   */
  async updateUserTotalViews(user: User, increment: boolean = true): Promise<void> {
    try {
      const username = this.getUsernameFromUser(user);
      const userRef = doc(db, 'users', username);
      
      // Check if user document exists
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        console.log(`⚠️ User document not found for totals update: ${username}`);
        return;
      }

      const userData = userDoc.data();
      const currentTotalViews = userData.totals?.totalViews || 0;
      const newTotalViews = increment ? currentTotalViews + 1 : Math.max(0, currentTotalViews - 1);
      
      await updateDoc(userRef, {
        'totals.totalViews': newTotalViews,
        updatedAt: serverTimestamp()
      });
      
      console.log(`✅ Updated user ${username} total views: ${currentTotalViews} → ${newTotalViews}`);
    } catch (error) {
      console.error('Error updating user total views:', error);
      // Don't throw - this is not critical
    }
  }
}

// Add default export for Expo Router
export default UserService;

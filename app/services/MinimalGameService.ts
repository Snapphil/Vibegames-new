import { db } from './firebase';
import { 
  collection, 
  doc, 
  getDoc,
  getDocs,
  setDoc,
  updateDoc, 
  deleteDoc,
  increment,
  serverTimestamp,
  query,
  orderBy,
  limit,
  where,
  collectionGroup,
  writeBatch
} from 'firebase/firestore';

// ============================================================================
// STAGE-1 MVP MINIMAL SCHEMA IMPLEMENTATION
// ============================================================================
// This service implements the minimal Firestore schema as specified:
// - users (top-level)
// - games (kept as-is, no changes)
// - game_stats (kept as-is, no changes) 
// - app_config (kept as-is, no changes)
// - games/{gameId}/likes (subcollection)
// - games/{gameId}/comments (subcollection)
// - games/{gameId}/comments/{commentId}/likes (subcollection)

// User Profile Interface
export interface UserProfile {
  displayName: string;
  bio: string;
  avatar: string;
  totals: {
    totalLikes: number;
    totalViews: number;
    totalGames: number;
  };
  createdAt: any;
  updatedAt: any;
}

// Game Interface (matches existing schema)
export interface Game {
  id: string;
  title: string;
  author: string;
  category: string;
  difficulty: string;
  duration: number;
  likes: number;
  views: number;
  plays: number;
  isActive: boolean;
  html: string;
  description: string;
  createdAt: any;
  publishedAt: any;
  isPublic: boolean;
  contentType: string;
  commentCount: number;
  // Derived at read-time
  liked?: boolean;
}

// Like Interface (simplified)
export interface GameLike {
  userId: string;
  gameId: string;
  createdAt: any;
}

// Comment Interface
export interface Comment {
  id: string;
  userId: string;
  text: string;
  likes: number;
  createdAt: any;
}

// Comment Like Interface
export interface CommentLike {
  userId: string;
  gameId: string;
  commentId: string;
  createdAt: any;
}

export class MinimalGameService {
  private static instance: MinimalGameService;
  
  public static getInstance(): MinimalGameService {
    if (!MinimalGameService.instance) {
      MinimalGameService.instance = new MinimalGameService();
    }
    return MinimalGameService.instance;
  }

  // ============================================================================
  // USER MANAGEMENT
  // ============================================================================

  /**
   * Create or update user profile
   */
  async createOrUpdateUser(userId: string, profileData: Partial<UserProfile>): Promise<UserProfile> {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      let userData: UserProfile;
      
      if (userDoc.exists()) {
        // Update existing user
        userData = {
          ...userDoc.data() as UserProfile,
          ...profileData,
          updatedAt: serverTimestamp()
        };
      } else {
        // Create new user with defaults
        userData = {
          displayName: profileData.displayName || 'Player',
          bio: profileData.bio || 'Creating awesome games',
          avatar: profileData.avatar || '🎮',
          totals: {
            totalLikes: 0,
            totalViews: 0,
            totalGames: 0,
            ...(profileData.totals || {})
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
      }
      
      await setDoc(userRef, userData);
      console.log(`✅ User profile saved: ${userId}`);
      return userData;
    } catch (error) {
      console.error('Error creating/updating user:', error);
      throw error;
    }
  }

  /**
   * Get user profile
   */
  async getUser(userId: string): Promise<UserProfile | null> {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        return userDoc.data() as UserProfile;
      }
      return null;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  /**
   * Update user totals (called when publishing/liking/viewing)
   */
  async updateUserTotals(userId: string, updates: Partial<UserProfile['totals']>): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      const updateData: any = {
        updatedAt: serverTimestamp()
      };
      
      // Add totals updates with dot notation
      if (updates.totalLikes !== undefined) {
        updateData['totals.totalLikes'] = updates.totalLikes;
      }
      if (updates.totalViews !== undefined) {
        updateData['totals.totalViews'] = updates.totalViews;
      }
      if (updates.totalGames !== undefined) {
        updateData['totals.totalGames'] = updates.totalGames;
      }
      
      await updateDoc(userRef, updateData);
      console.log(`✅ User totals updated: ${userId}`);
    } catch (error) {
      console.error('Error updating user totals:', error);
      throw error;
    }
  }

  // ============================================================================
  // GAME MANAGEMENT (Using existing games collection)
  // ============================================================================

  /**
   * Publish a new game (same as before, but ensure user exists)
   */
  async publishGame(gameData: Omit<Game, 'createdAt' | 'publishedAt'>): Promise<void> {
    try {
      // Ensure user exists
      await this.createOrUpdateUser(gameData.author, {});
      
      const gameRef = doc(db, 'games', gameData.id);
      
      const gameDocument: Game = {
        ...gameData,
        createdAt: serverTimestamp(),
        publishedAt: serverTimestamp()
      };
      
      await setDoc(gameRef, gameDocument);
      
      // Update user total games count
      const userGames = await this.getUserGames(gameData.author);
      await this.updateUserTotals(gameData.author, {
        totalGames: userGames.length + 1
      });
      
      console.log(`✅ Game published: ${gameData.id}`);
    } catch (error) {
      console.error('Error publishing game:', error);
      throw error;
    }
  }

  /**
   * Get all active games with user like status
   */
  async getAllGames(userId: string = '@you'): Promise<Game[]> {
    try {
      const gamesRef = collection(db, 'games');
      let q = query(gamesRef, where('isActive', '==', true));
      
      // Try ordered query, fallback to simple if index not ready
      try {
        q = query(gamesRef, where('isActive', '==', true), orderBy('createdAt', 'desc'));
      } catch (error) {
        console.log('⚠️ Using simple query (index building)');
      }
      
      const querySnapshot = await getDocs(q);
      const games = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Game));
      
      // Add user like status for each game
      const gamesWithLikeStatus = await Promise.all(
        games.map(async (game) => {
          const liked = await this.hasUserLikedGame(game.id, userId);
          return { ...game, liked };
        })
      );
      
      console.log(`📦 Retrieved ${games.length} games`);
      return gamesWithLikeStatus;
    } catch (error) {
      console.error('Error getting games:', error);
      return [];
    }
  }

  /**
   * Get games by a specific user
   */
  async getUserGames(userId: string): Promise<Game[]> {
    try {
      const gamesRef = collection(db, 'games');
      const q = query(gamesRef, where('author', '==', userId), where('isActive', '==', true));
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Game));
    } catch (error) {
      console.error('Error getting user games:', error);
      return [];
    }
  }

  // ============================================================================
  // LIKE MANAGEMENT (New simplified subcollection approach)
  // ============================================================================

  /**
   * Like/Unlike a game - ATOMIC OPERATION
   */
  async likeGame(gameId: string, userId: string = '@you'): Promise<{ liked: boolean; likes: number }> {
    try {
      const gameRef = doc(db, 'games', gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (!gameDoc.exists()) {
        throw new Error('Game not found');
      }

      const gameData = gameDoc.data() as Game;
      const likeRef = doc(db, 'games', gameId, 'likes', userId);
      const likeDoc = await getDoc(likeRef);
      const wasLiked = likeDoc.exists();
      
      const batch = writeBatch(db);
      
      if (wasLiked) {
        // Unlike: Remove like and decrement count
        batch.delete(likeRef);
        batch.update(gameRef, { likes: increment(-1) });
        
        await batch.commit();
        
        console.log(`✅ Unliked game: ${gameId}`);
        return { liked: false, likes: (gameData.likes || 0) - 1 };
      } else {
        // Like: Add like and increment count
        batch.set(likeRef, {
          userId,
          gameId,
          createdAt: serverTimestamp()
        } as GameLike);
        batch.update(gameRef, { likes: increment(1) });
        
        await batch.commit();
        
        console.log(`✅ Liked game: ${gameId}`);
        return { liked: true, likes: (gameData.likes || 0) + 1 };
      }
    } catch (error) {
      console.error('Error liking/unliking game:', error);
      throw error;
    }
  }

  /**
   * Check if user has liked a game
   */
  async hasUserLikedGame(gameId: string, userId: string = '@you'): Promise<boolean> {
    try {
      const likeRef = doc(db, 'games', gameId, 'likes', userId);
      const likeDoc = await getDoc(likeRef);
      return likeDoc.exists();
    } catch (error) {
      console.error('Error checking like status:', error);
      return false;
    }
  }

  /**
   * Get all games liked by a user (collection group query)
   */
  async getLikedGamesByUser(userId: string): Promise<string[]> {
    try {
      const likesQuery = query(
        collectionGroup(db, 'likes'),
        where('userId', '==', userId)
      );
      const querySnapshot = await getDocs(likesQuery);
      
      return querySnapshot.docs.map(doc => doc.data().gameId);
    } catch (error) {
      console.error('Error getting liked games:', error);
      return [];
    }
  }

  // ============================================================================
  // COMMENT MANAGEMENT
  // ============================================================================

  /**
   * Add a comment to a game
   */
  async addComment(gameId: string, text: string, userId: string = '@you'): Promise<Comment> {
    try {
      const gameRef = doc(db, 'games', gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (!gameDoc.exists()) {
        throw new Error('Game not found');
      }

      const commentId = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const commentRef = doc(db, 'games', gameId, 'comments', commentId);
      
      const comment: Comment = {
        id: commentId,
        userId,
        text,
        likes: 0,
        createdAt: serverTimestamp()
      };

      const batch = writeBatch(db);
      batch.set(commentRef, comment);
      batch.update(gameRef, { commentCount: increment(1) });
      
      await batch.commit();

      console.log(`✅ Comment added to game: ${gameId}`);
      return comment;
    } catch (error) {
      console.error('Error adding comment:', error);
      throw error;
    }
  }

  /**
   * Get all comments for a game
   */
  async getGameComments(gameId: string): Promise<Comment[]> {
    try {
      const commentsRef = collection(db, 'games', gameId, 'comments');
      const q = query(commentsRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Comment));
    } catch (error) {
      console.error('Error getting game comments:', error);
      return [];
    }
  }

  /**
   * Get all comments by a user (collection group query)
   */
  async getCommentsByUser(userId: string): Promise<Comment[]> {
    try {
      const commentsQuery = query(
        collectionGroup(db, 'comments'),
        where('userId', '==', userId)
      );
      const querySnapshot = await getDocs(commentsQuery);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Comment));
    } catch (error) {
      console.error('Error getting user comments:', error);
      return [];
    }
  }

  // ============================================================================
  // COMMENT LIKE MANAGEMENT
  // ============================================================================

  /**
   * Like/Unlike a comment - ATOMIC OPERATION
   */
  async likeComment(gameId: string, commentId: string, userId: string = '@you'): Promise<{ liked: boolean; likes: number }> {
    try {
      const commentRef = doc(db, 'games', gameId, 'comments', commentId);
      const commentDoc = await getDoc(commentRef);
      
      if (!commentDoc.exists()) {
        throw new Error('Comment not found');
      }

      const commentData = commentDoc.data() as Comment;
      const likeRef = doc(db, 'games', gameId, 'comments', commentId, 'likes', userId);
      const likeDoc = await getDoc(likeRef);
      const wasLiked = likeDoc.exists();
      
      const batch = writeBatch(db);
      
      if (wasLiked) {
        // Unlike: Remove like and decrement count
        batch.delete(likeRef);
        batch.update(commentRef, { likes: increment(-1) });
        
        await batch.commit();
        
        console.log(`✅ Comment unliked: ${commentId}`);
        return { liked: false, likes: (commentData.likes || 0) - 1 };
      } else {
        // Like: Add like and increment count
        batch.set(likeRef, {
          userId,
          gameId,
          commentId,
          createdAt: serverTimestamp()
        } as CommentLike);
        batch.update(commentRef, { likes: increment(1) });
        
        await batch.commit();
        
        console.log(`✅ Comment liked: ${commentId}`);
        return { liked: true, likes: (commentData.likes || 0) + 1 };
      }
    } catch (error) {
      console.error('Error liking/unliking comment:', error);
      throw error;
    }
  }

  /**
   * Check if user has liked a comment
   */
  async hasUserLikedComment(gameId: string, commentId: string, userId: string = '@you'): Promise<boolean> {
    try {
      const likeRef = doc(db, 'games', gameId, 'comments', commentId, 'likes', userId);
      const likeDoc = await getDoc(likeRef);
      return likeDoc.exists();
    } catch (error) {
      console.error('Error checking comment like status:', error);
      return false;
    }
  }

  // ============================================================================
  // VIEW/PLAY TRACKING (Same as before)
  // ============================================================================

  /**
   * View a game - ATOMIC OPERATION
   */
  async viewGame(gameId: string): Promise<void> {
    try {
      const gameRef = doc(db, 'games', gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (!gameDoc.exists()) {
        console.log(`Game ${gameId} doesn't exist`);
        return;
      }

      await updateDoc(gameRef, {
        views: increment(1)
      });

      console.log(`✅ Viewed game: ${gameId}`);
    } catch (error) {
      console.error('Error viewing game:', error);
      throw error;
    }
  }

  /**
   * Play a game - ATOMIC OPERATION  
   */
  async playGame(gameId: string): Promise<void> {
    try {
      const gameRef = doc(db, 'games', gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (!gameDoc.exists()) {
        console.log(`Game ${gameId} doesn't exist`);
        return;
      }

      await updateDoc(gameRef, {
        plays: increment(1)
      });

      console.log(`✅ Played game: ${gameId}`);
    } catch (error) {
      console.error('Error playing game:', error);
      throw error;
    }
  }
}

export default MinimalGameService;

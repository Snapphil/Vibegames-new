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
  where
} from 'firebase/firestore';

// Simplified Game Interface - Only Essential Fields
export interface SimpleGame {
  id: string;
  title: string;
  author: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  duration: number;
  likes: number;
  views: number;
  plays: number;
  isActive: boolean;
  createdAt: any;
  html?: string; // HTML content for display in feed
  description?: string; // Game description
  liked?: boolean; // User's like status for this game
  commentCount?: number; // Total number of comments
}

// Platform Statistics
export interface PlatformStats {
  totalGames: number;
  totalLikes: number;
  totalViews: number;
  totalPlays: number;
  lastUpdated: any;
}

export class SimpleGameService {
  private static instance: SimpleGameService;
  
  public static getInstance(): SimpleGameService {
    if (!SimpleGameService.instance) {
      SimpleGameService.instance = new SimpleGameService();
    }
    return SimpleGameService.instance;
  }

  /**
   * Publish a new game to Firebase with HTML content and metadata
   */
  async publishGame(gameData: Omit<SimpleGame, 'createdAt'>, userId?: string): Promise<void> {
    try {
      // Validate that HTML content exists
      if (!gameData.html || gameData.html.trim().length === 0) {
        throw new Error('Cannot publish game: HTML content is required for public display');
      }
      
      const gameRef = doc(db, 'games', gameData.id);
      
      // Create the game document with complete data including HTML
      const gameDocument = {
        ...gameData,
        html: gameData.html, // Ensure HTML is explicitly stored as 'html' key
        createdAt: serverTimestamp(),
        publishedAt: serverTimestamp(),
        isPublic: true, // Mark as publicly visible
        contentType: 'html_game' // Identify as HTML game content
      };
      
      console.log(`📄 Publishing game to Firebase:`, {
        id: gameData.id,
        title: gameData.title,
        author: gameData.author,
        htmlLength: gameData.html.length,
        hasDescription: !!gameData.description
      });
      
      await setDoc(gameRef, gameDocument);
      
      console.log(`✅ Game published to Firebase with HTML content: ${gameData.id}`);
      console.log(`🌐 Game is now publicly visible in feed with ${gameData.html.length} character HTML`);

      // Update platform stats (create if doesn't exist)
      const statsRef = doc(db, 'game_stats', 'platform');
      try {
        await updateDoc(statsRef, {
          totalGames: increment(1),
          lastUpdated: serverTimestamp()
        });
      } catch (error) {
        // If document doesn't exist, create it
        await setDoc(statsRef, {
          totalGames: 1,
          totalLikes: 0,
          totalViews: 0,
          totalPlays: 0,
          lastUpdated: serverTimestamp()
        });
      }

      // Update user totals and track created game if we can identify the user
      if (userId && this.isValidFirebaseUID(userId)) {
        // Use the provided userId directly (Firebase UID)
        console.log(`📊 Updating user totals for publisher: ${userId}`);
        await this.updateUserTotalsDirect(userId, 'game_published');
        await this.addGameToUserCreatedList(userId, gameData.id);
      } else if (gameData.author && this.isValidFirebaseUID(gameData.author)) {
        // Use author as Firebase UID if it looks like one
        console.log(`📊 Updating user totals for author: ${gameData.author}`);
        await this.updateUserTotalsDirect(gameData.author, 'game_published');
        await this.addGameToUserCreatedList(gameData.author, gameData.id);
      } else {
        console.log(`⚠️ Could not identify user for totals update. userId: ${userId}, author: ${gameData.author}`);
      }

      console.log(`✅ Published game to Firebase: ${gameData.id}`);
    } catch (error) {
      console.error('Error publishing game:', error);
      throw error;
    }
  }

  /**
   * Check if a string is a valid Firebase UID
   */
  private isValidFirebaseUID(uid: string): boolean {
    return Boolean(uid && 
           uid.length >= 10 && 
           !uid.startsWith('@') && 
           !uid.includes('@') &&
           /^[a-zA-Z0-9]+$/.test(uid));
  }

  /**
   * Add a game ID to user's created games list
   */
  private async addGameToUserCreatedList(userIdentifier: string, gameId: string): Promise<void> {
    try {
      // Find user document by Firebase UID
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('uid', '==', userIdentifier), limit(1));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        console.log(`⚠️ User not found for UID: ${userIdentifier}`);
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      const existingCreatedGames = userData.createdGames || [];
      
      // Only add if not already in the list
      if (!existingCreatedGames.includes(gameId)) {
        const updatedCreatedGames = [...existingCreatedGames, gameId];
        
        await updateDoc(userDoc.ref, {
          createdGames: updatedCreatedGames,
          updatedAt: serverTimestamp()
        });
        
        console.log(`✅ Added game ${gameId} to user's created games list (${userDoc.id})`);
      } else {
        console.log(`ℹ️ Game ${gameId} already in user's created games list`);
      }
    } catch (error) {
      console.error('Error adding game to user created list:', error);
      // Don't throw - this is not critical for game publishing
    }
  }

  /**
   * Get user's created games by Firebase UID
   */
  async getUserCreatedGames(userIdentifier: string): Promise<SimpleGame[]> {
    try {
      // Find user document by Firebase UID
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('uid', '==', userIdentifier), limit(1));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        console.log(`⚠️ User not found for UID: ${userIdentifier}`);
        return [];
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      const createdGameIds = userData.createdGames || [];
      
      if (createdGameIds.length === 0) {
        return [];
      }

      // Fetch game details for each created game ID
      const games: SimpleGame[] = [];
      for (const gameId of createdGameIds) {
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
              liked: false, // Default to false for created games
              commentCount: gameData.commentCount || 0
            });
          }
        } catch (gameError) {
          console.error(`Error fetching game ${gameId}:`, gameError);
          // Continue with other games
        }
      }

      console.log(`✅ Retrieved ${games.length} created games for user ${userDoc.id}`);
      return games.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); // Sort by creation date, newest first
    } catch (error) {
      console.error('Error getting user created games:', error);
      return [];
    }
  }

  /**
   * Update user totals for various game actions with improved error handling
   * Now works with username-based document IDs
   */
  private async updateUserTotalsDirect(userIdentifier: string, action: 'game_published' | 'game_liked' | 'game_unliked' | 'game_viewed'): Promise<void> {
    // Convert userIdentifier to username (remove @ prefix if present)
    const username = userIdentifier.startsWith('@') ? userIdentifier.slice(1) : userIdentifier;
    
    // Skip if username is invalid
    if (!username || username.length === 0) {
      console.log(`⚠️ Skipping totals update for invalid username: ${userIdentifier}`);
      return;
    }

    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        const userRef = doc(db, 'users', username);
        
        // First check if user document exists
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
          console.log(`⚠️ User document not found for username: ${username}, skipping totals update`);
          return;
        }

        let updateData: any = {
          updatedAt: serverTimestamp()
        };

        switch (action) {
          case 'game_published':
            updateData['totals.totalGames'] = increment(1);
            break;
          case 'game_liked':
            updateData['totals.totalLikes'] = increment(1);
            break;
          case 'game_unliked':
            updateData['totals.totalLikes'] = increment(-1);
            break;
          case 'game_viewed':
            updateData['totals.totalViews'] = increment(1);
            break;
        }

        await updateDoc(userRef, updateData);
        console.log(`✅ Updated user totals for ${username}: ${action}`);
        return; // Success, exit retry loop
        
      } catch (error: any) {
        retryCount++;
        console.error(`❌ Error updating user totals for ${username} (attempt ${retryCount}/${maxRetries}):`, error);
        
        // Check if it's a connectivity issue
        if (error.code === 'unavailable' || error.code === 'deadline-exceeded' || 
            error.message?.includes('network') || error.message?.includes('timeout')) {
          
          if (retryCount < maxRetries) {
            console.log(`🔄 Retrying totals update for ${username} in ${retryCount * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryCount * 1000));
            continue;
          } else {
            console.error(`💥 Failed to update user totals for ${username} after ${maxRetries} attempts`);
            // Don't throw error, just log it to prevent breaking the main flow
            return;
          }
        } else {
          // Non-connectivity error, don't retry
          console.error(`💥 Non-retryable error updating user totals for ${username}:`, error);
          return;
        }
      }
    }
  }

  /**
   * Update user totals for various game actions
   */
  private async updateUserTotalsForGameAction(authorHandle: string, action: 'game_published' | 'game_liked' | 'game_unliked' | 'game_viewed'): Promise<void> {
    try {
      // Convert handle to username (remove @ prefix if present)
      const username = authorHandle.startsWith('@') ? authorHandle.slice(1) : authorHandle;
      
      // Use username directly as document ID
      const userRef = doc(db, 'users', username);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        console.log(`⚠️ User document not found for username: ${username}`);
        return;
      }

      const userData = userDoc.data();
      const currentTotals = userData.totals || { totalLikes: 0, totalViews: 0, totalGames: 0 };

      let updateData: any = {
        updatedAt: serverTimestamp()
      };

      switch (action) {
        case 'game_published':
          updateData['totals.totalGames'] = increment(1);
          break;
        case 'game_liked':
          updateData['totals.totalLikes'] = increment(1);
          break;
        case 'game_unliked':
          updateData['totals.totalLikes'] = increment(-1);
          break;
        case 'game_viewed':
          updateData['totals.totalViews'] = increment(1);
          break;
      }

      await updateDoc(userRef, updateData);
      console.log(`✅ Updated user totals for ${username} (${authorHandle}): ${action}`);
    } catch (error) {
      console.error(`Error updating user totals for ${authorHandle}:`, error);
    }
  }

  /**
   * Convert handle to username (for backward compatibility)
   * @deprecated This method is no longer needed since we use username as document ID
   */
  private handleToUsername(handle: string): string {
    return handle.startsWith('@') ? handle.slice(1) : handle;
  }

  /**
   * Get all active games with HTML content for public feed
   */
  async getAllGames(userId: string = '@you'): Promise<SimpleGame[]> {
    try {
      const gamesRef = collection(db, 'games');
      
      // Use simple query first (no composite index required)
      let q = query(gamesRef, where('isActive', '==', true));
      let querySnapshot = await getDocs(q);
      
      // If successful, try to add ordering (may require index)
      try {
        q = query(gamesRef, where('isActive', '==', true), orderBy('createdAt', 'desc'));
        querySnapshot = await getDocs(q);
        console.log('✅ Using ordered query (newest first)');
      } catch (orderError) {
        console.log('⚠️ Ordered query failed, using simple query (index building required)');
        console.log('💡 This is normal during initial setup. Index will be created automatically.');
        // Continue with the simple query result
      }
      
      const games = querySnapshot.docs.map(doc => {
        const data = doc.data();
        const game = {
          id: doc.id,
          ...data
        } as SimpleGame;
        
        // Log HTML content availability for debugging
        if (game.html) {
          console.log(`📄 Retrieved game with HTML: ${game.id} (${game.html.length} chars)`);
        } else {
          console.log(`⚠️ Game missing HTML content: ${game.id}`);
        }
        
        return game;
      });
      
      // Sort manually if ordering failed (fallback)
      if (games.length > 0 && games[0].createdAt) {
        try {
          games.sort((a, b) => {
            const aTime = a.createdAt?.toMillis?.() || a.createdAt || 0;
            const bTime = b.createdAt?.toMillis?.() || b.createdAt || 0;
            return bTime - aTime; // Newest first
          });
          console.log('✅ Applied manual sorting (newest first)');
        } catch (sortError) {
          console.log('⚠️ Manual sorting failed, keeping original order');
        }
      }
      
      // Add user like status for each game
      const gamesWithLikeStatus = await Promise.all(
        games.map(async (game) => {
          try {
            const liked = await this.hasUserLikedGame(game.id, userId);
            return { ...game, liked };
          } catch (error) {
            console.log(`⚠️ Could not check like status for game ${game.id}:`, error);
            return { ...game, liked: false };
          }
        })
      );
      
      console.log(`📦 Retrieved ${games.length} games from Firebase`);
      console.log(`🌐 Games with HTML content: ${games.filter(g => g.html).length}`);
      
      return gamesWithLikeStatus;
    } catch (error) {
      console.error('Error getting games:', error);
      return [];
    }
  }

  /**
   * Get a specific game by ID
   */
  async getGame(gameId: string): Promise<SimpleGame | null> {
    try {
      const gameRef = doc(db, 'games', gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (gameDoc.exists()) {
        return {
          id: gameDoc.id,
          ...gameDoc.data()
        } as SimpleGame;
      }
      return null;
    } catch (error) {
      console.error('Error getting game:', error);
      return null;
    }
  }

  /**
   * Like/Unlike a game - ATOMIC OPERATION with user tracking and liked games list management
   */
  async likeGame(gameId: string, userId: string = '@you', firebaseUser?: any): Promise<{ liked: boolean; likes: number }> {
    try {
      // Check if game exists first
      const gameRef = doc(db, 'games', gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (!gameDoc.exists()) {
        console.log(`Game ${gameId} doesn't exist, skipping like`);
        throw new Error('Game not found');
      }

      const gameData = gameDoc.data();
      
      // Check if user already liked this game
      const userLikesRef = doc(db, 'games', gameId, 'user_likes', userId);
      const userLikeDoc = await getDoc(userLikesRef);
      const wasLiked = userLikeDoc.exists();
      
      if (wasLiked) {
        // Unlike: Remove user like and decrement count
        await deleteDoc(userLikesRef);
        await updateDoc(gameRef, {
          likes: increment(-1)
        });
        
        // Update platform stats
        const statsRef = doc(db, 'game_stats', 'platform');
        try {
          await updateDoc(statsRef, {
            totalLikes: increment(-1),
            lastUpdated: serverTimestamp()
          });
        } catch (error) {
          // Stats document might not exist, that's okay
        }

        // Update game author's totalLikes (decrement) - only if author has Firebase UID
        if (gameData.author && this.isValidFirebaseUID(gameData.author)) {
          console.log(`📊 Updating user totals for unliked game author: ${gameData.author}`);
          await this.updateUserTotalsDirect(gameData.author, 'game_unliked');
        } else {
          console.log(`⚠️ Could not identify author for totals update on unlike. author: ${gameData.author}`);
        }

        // Remove from user's liked games list if Firebase user is provided
        if (firebaseUser) {
          try {
            const { UserService } = await import('./UserService');
            const userService = UserService.getInstance();
            await userService.removeLikedGame(firebaseUser, gameId);
            await userService.updateUserActionTotals(firebaseUser, 'unliked_game');
          } catch (error) {
            console.error('Error updating user liked games list on unlike:', error);
            // Don't throw - this is not critical for the main like functionality
          }
        }
        
        console.log(`✅ Unliked game: ${gameId}`);
        return { liked: false, likes: (gameData.likes || 0) - 1 };
      } else {
        // Like: Add user like and increment count
        await setDoc(userLikesRef, {
          userId,
          gameId,
          likedAt: serverTimestamp()
        });
        
        await updateDoc(gameRef, {
          likes: increment(1)
        });
        
        // Update platform stats
        const statsRef = doc(db, 'game_stats', 'platform');
        try {
          await updateDoc(statsRef, {
            totalLikes: increment(1),
            lastUpdated: serverTimestamp()
          });
        } catch (error) {
          // If document doesn't exist, create it
          await setDoc(statsRef, {
            totalGames: 0,
            totalLikes: 1,
            totalViews: 0,
            totalPlays: 0,
            lastUpdated: serverTimestamp()
          });
        }

        // Update game author's totalLikes (increment) - only if author has Firebase UID
        if (gameData.author && this.isValidFirebaseUID(gameData.author)) {
          console.log(`📊 Updating user totals for liked game author: ${gameData.author}`);
          await this.updateUserTotalsDirect(gameData.author, 'game_liked');
        } else {
          console.log(`⚠️ Could not identify author for totals update on like. author: ${gameData.author}`);
        }

        // Add to user's liked games list if Firebase user is provided
        if (firebaseUser) {
          try {
            const { UserService } = await import('./UserService');
            const userService = UserService.getInstance();
            await userService.addLikedGame(firebaseUser, gameId);
            await userService.updateUserActionTotals(firebaseUser, 'liked_game');
          } catch (error) {
            console.error('Error updating user liked games list on like:', error);
            // Don't throw - this is not critical for the main like functionality
          }
        }
        
        console.log(`✅ Liked game: ${gameId}`);
        return { liked: true, likes: (gameData.likes || 0) + 1 };
      }
    } catch (error) {
      console.error('Error liking/unliking game:', error);
      throw error;
    }
  }

  /**
   * Check if user has liked a specific game
   */
  async hasUserLikedGame(gameId: string, userId: string = '@you'): Promise<boolean> {
    try {
      const userLikesRef = doc(db, 'games', gameId, 'user_likes', userId);
      const userLikeDoc = await getDoc(userLikesRef);
      return userLikeDoc.exists();
    } catch (error) {
      console.error('Error checking user like status:', error);
      return false;
    }
  }

  /**
   * Add a comment to a game
   */
  async addComment(gameId: string, text: string, author: string = '@you'): Promise<void> {
    try {
      const gameRef = doc(db, 'games', gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (!gameDoc.exists()) {
        throw new Error('Game not found');
      }

      const commentId = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const commentRef = doc(db, 'games', gameId, 'comments', commentId);
      
      const comment = {
        id: commentId,
        text,
        author,
        likes: 0,
        createdAt: serverTimestamp(),
        gameId
      };

      await setDoc(commentRef, comment);

      // Update game comment count
      await updateDoc(gameRef, {
        commentCount: increment(1)
      });

      console.log(`✅ Comment added to game: ${gameId}`);
    } catch (error) {
      console.error('Error adding comment:', error);
      throw error;
    }
  }

  /**
   * Get all comments for a game
   */
  async getGameComments(gameId: string): Promise<any[]> {
    try {
      const commentsRef = collection(db, 'games', gameId, 'comments');
      const q = query(commentsRef, orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error getting game comments:', error);
      return [];
    }
  }

  /**
   * Like/Unlike a comment
   */
  async likeComment(gameId: string, commentId: string, userId: string = '@you'): Promise<void> {
    try {
      const commentRef = doc(db, 'games', gameId, 'comments', commentId);
      const commentDoc = await getDoc(commentRef);
      
      if (!commentDoc.exists()) {
        throw new Error('Comment not found');
      }

      const userLikeRef = doc(db, 'games', gameId, 'comments', commentId, 'user_likes', userId);
      const userLikeDoc = await getDoc(userLikeRef);
      const wasLiked = userLikeDoc.exists();

      if (wasLiked) {
        // Unlike
        await deleteDoc(userLikeRef);
        await updateDoc(commentRef, {
          likes: increment(-1)
        });
        console.log(`✅ Comment unliked: ${commentId}`);
      } else {
        // Like
        await setDoc(userLikeRef, {
          userId,
          commentId,
          likedAt: serverTimestamp()
        });
        await updateDoc(commentRef, {
          likes: increment(1)
        });
        console.log(`✅ Comment liked: ${commentId}`);
      }
    } catch (error) {
      console.error('Error liking/unliking comment:', error);
      throw error;
    }
  }

  /**
   * View a game - ATOMIC OPERATION
   */
  async viewGame(gameId: string): Promise<void> {
    try {
      // Check if game exists first
      const gameRef = doc(db, 'games', gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (!gameDoc.exists()) {
        console.log(`Game ${gameId} doesn't exist, skipping view`);
        return;
      }

      const gameData = gameDoc.data();

      // Atomic increment operations
      await updateDoc(gameRef, {
        views: increment(1)
      });

      // Update platform stats (create if doesn't exist)
      const statsRef = doc(db, 'game_stats', 'platform');
      try {
        await updateDoc(statsRef, {
          totalViews: increment(1),
          lastUpdated: serverTimestamp()
        });
      } catch (error) {
        // If document doesn't exist, create it
        await setDoc(statsRef, {
          totalGames: 0,
          totalLikes: 0,
          totalViews: 1,
          totalPlays: 0,
          lastUpdated: serverTimestamp()
        });
      }

      // Update game author's totalViews - only if author has Firebase UID
      if (gameData.author && this.isValidFirebaseUID(gameData.author)) {
        console.log(`📊 Updating user totals for viewed game author: ${gameData.author}`);
        await this.updateUserTotalsDirect(gameData.author, 'game_viewed');
      } else {
        console.log(`⚠️ Could not identify author for totals update on view. author: ${gameData.author}`);
      }

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
      // Check if game exists first
      const gameRef = doc(db, 'games', gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (!gameDoc.exists()) {
        console.log(`Game ${gameId} doesn't exist, skipping play`);
        return;
      }

      // Atomic increment operations
      await updateDoc(gameRef, {
        plays: increment(1)
      });

      // Update platform stats (create if doesn't exist)
      const statsRef = doc(db, 'game_stats', 'platform');
      try {
        await updateDoc(statsRef, {
          totalPlays: increment(1),
          lastUpdated: serverTimestamp()
        });
      } catch (error) {
        // If document doesn't exist, create it
        await setDoc(statsRef, {
          totalGames: 0,
          totalLikes: 0,
          totalViews: 0,
          totalPlays: 1,
          lastUpdated: serverTimestamp()
        });
      }

      console.log(`✅ Played game: ${gameId}`);
    } catch (error) {
      console.error('Error playing game:', error);
      throw error;
    }
  }

  /**
   * Get popular games by likes
   */
  async getPopularGames(limitCount: number = 10): Promise<SimpleGame[]> {
    try {
      const gamesRef = collection(db, 'games');
      const q = query(
        gamesRef, 
        where('isActive', '==', true),
        orderBy('likes', 'desc'),
        limit(limitCount)
      );
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as SimpleGame));
    } catch (error) {
      console.error('Error getting popular games:', error);
      return [];
    }
  }

  /**
   * Get games by category
   */
  async getGamesByCategory(category: string): Promise<SimpleGame[]> {
    try {
      const gamesRef = collection(db, 'games');
      const q = query(
        gamesRef, 
        where('category', '==', category),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as SimpleGame));
    } catch (error) {
      console.error('Error getting games by category:', error);
      return [];
    }
  }

  /**
   * Get platform statistics
   */
  async getPlatformStats(): Promise<PlatformStats | null> {
    try {
      const statsRef = doc(db, 'game_stats', 'platform');
      const statsDoc = await getDoc(statsRef);
      
      if (statsDoc.exists()) {
        return statsDoc.data() as PlatformStats;
      }
      return null;
    } catch (error) {
      console.error('Error getting platform stats:', error);
      return null;
    }
  }
}

export default SimpleGameService;

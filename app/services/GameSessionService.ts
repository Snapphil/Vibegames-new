import { db } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  updateDoc, 
  increment,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit
} from 'firebase/firestore';

export interface GameSession {
  id: string;
  title: string;
  description: string;
  author: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  duration: number;
  likeCount: number;
  viewCount: number;
  commentCount: number;
  shareCount: number;
  playCount: number;
  tags: string[];
  gameType: 'canvas' | '3d' | 'html';
  controls: string[];
  features: string[];
  isActive: boolean;
  isFeatured: boolean;
  highScore: number;
  averageScore: number;
  completionRate: number;
  rating: number;
  ratingCount: number;
  createdAt: any;
  updatedAt: any;
  lastPlayed?: any;
  lastLiked?: any;
}

export interface GamePlay {
  id: string;
  gameId: string;
  userId?: string;
  score: number;
  duration: number;
  completed: boolean;
  timestamp: any;
}

export class GameSessionService {
  private static instance: GameSessionService;
  
  public static getInstance(): GameSessionService {
    if (!GameSessionService.instance) {
      GameSessionService.instance = new GameSessionService();
    }
    return GameSessionService.instance;
  }

  /**
   * Get all active game sessions
   */
  async getAllGameSessions(): Promise<GameSession[]> {
    try {
      const gamesRef = collection(db, 'posts');
      const q = query(gamesRef, where('type', '==', 'game'), where('isActive', '==', true));
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as GameSession));
    } catch (error) {
      console.error('Error getting game sessions:', error);
      return [];
    }
  }

  /**
   * Get a specific game session by ID
   */
  async getGameSession(gameId: string): Promise<GameSession | null> {
    try {
      const gameRef = doc(db, 'posts', gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (gameDoc.exists() && gameDoc.data()?.type === 'game') {
        return {
          id: gameDoc.id,
          ...gameDoc.data()
        } as GameSession;
      }
      return null;
    } catch (error) {
      console.error('Error getting game session:', error);
      return null;
    }
  }

  /**
   * Like a game
   */
  async likeGame(gameId: string, userId?: string): Promise<void> {
    try {
      const gameRef = doc(db, 'posts', gameId);
      
      // First check if document exists
      const gameDoc = await getDoc(gameRef);
      if (!gameDoc.exists()) {
        console.log(`Document ${gameId} doesn't exist, skipping like increment`);
        return;
      }
      
      await updateDoc(gameRef, {
        likeCount: increment(1),
        lastLiked: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Update analytics
      const analyticsRef = doc(db, 'analytics', 'platform_stats');
      await updateDoc(analyticsRef, {
        totalLikes: increment(1),
        lastUpdated: serverTimestamp()
      });

      console.log(`Successfully liked game: ${gameId}`);
    } catch (error) {
      console.error('Error liking game:', error);
      throw error;
    }
  }

  /**
   * View a game (increment view count)
   */
  async viewGame(gameId: string, userId?: string): Promise<void> {
    try {
      const gameRef = doc(db, 'posts', gameId);
      
      // First check if document exists, if not create it
      const gameDoc = await getDoc(gameRef);
      if (!gameDoc.exists()) {
        console.log(`Document ${gameId} doesn't exist, skipping view increment`);
        return;
      }
      
      await updateDoc(gameRef, {
        viewCount: increment(1),
        updatedAt: serverTimestamp()
      });

      // Update analytics
      const analyticsRef = doc(db, 'analytics', 'platform_stats');
      await updateDoc(analyticsRef, {
        totalViews: increment(1),
        lastUpdated: serverTimestamp()
      });

      console.log(`Successfully viewed game: ${gameId}`);
    } catch (error) {
      console.error('Error viewing game:', error);
      throw error;
    }
  }

  /**
   * Play a game (increment play count)
   */
  async playGame(gameId: string, userId?: string): Promise<void> {
    try {
      const gameRef = doc(db, 'posts', gameId);
      
      // First check if document exists
      const gameDoc = await getDoc(gameRef);
      if (!gameDoc.exists()) {
        console.log(`Document ${gameId} doesn't exist, skipping play increment`);
        return;
      }
      
      await updateDoc(gameRef, {
        playCount: increment(1),
        lastPlayed: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Update analytics
      const analyticsRef = doc(db, 'analytics', 'platform_stats');
      await updateDoc(analyticsRef, {
        totalPlays: increment(1),
        lastUpdated: serverTimestamp()
      });

      console.log(`Successfully played game: ${gameId}`);
    } catch (error) {
      console.error('Error playing game:', error);
      throw error;
    }
  }

  /**
   * Record a game play session with score
   */
  async recordGamePlay(gameId: string, score: number, duration: number, completed: boolean, userId?: string): Promise<void> {
    try {
      // Record the play session
      const playRef = doc(collection(db, 'game_plays'));
      const playData: GamePlay = {
        id: playRef.id,
        gameId,
        userId,
        score,
        duration,
        completed,
        timestamp: serverTimestamp()
      };
      await setDoc(playRef, playData);

      // Update game statistics
      const gameRef = doc(db, 'posts', gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (gameDoc.exists()) {
        const gameData = gameDoc.data() as GameSession;
        const newHighScore = Math.max(gameData.highScore || 0, score);
        const totalPlays = (gameData.playCount || 0) + 1;
        const newAverageScore = ((gameData.averageScore || 0) * (totalPlays - 1) + score) / totalPlays;
        const newCompletionRate = completed 
          ? ((gameData.completionRate || 0) * (totalPlays - 1) + 1) / totalPlays
          : (gameData.completionRate || 0) * (totalPlays - 1) / totalPlays;

        await updateDoc(gameRef, {
          highScore: newHighScore,
          averageScore: Math.round(newAverageScore * 100) / 100,
          completionRate: Math.round(newCompletionRate * 100) / 100,
          updatedAt: serverTimestamp()
        });
      }

      console.log(`Successfully recorded game play: ${gameId}, score: ${score}`);
    } catch (error) {
      console.error('Error recording game play:', error);
      throw error;
    }
  }

  /**
   * Get featured games
   */
  async getFeaturedGames(): Promise<GameSession[]> {
    try {
      const gamesRef = collection(db, 'posts');
      const q = query(
        gamesRef, 
        where('type', '==', 'game'),
        where('isFeatured', '==', true),
        where('isActive', '==', true)
      );
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as GameSession));
    } catch (error) {
      console.error('Error getting featured games:', error);
      return [];
    }
  }

  /**
   * Get games by category
   */
  async getGamesByCategory(category: string): Promise<GameSession[]> {
    try {
      const gamesRef = collection(db, 'game_sessions');
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
      } as GameSession));
    } catch (error) {
      console.error('Error getting games by category:', error);
      return [];
    }
  }

  /**
   * Search games by title or tags
   */
  async searchGames(searchTerm: string): Promise<GameSession[]> {
    try {
      const gamesRef = collection(db, 'game_sessions');
      const q = query(gamesRef, where('isActive', '==', true));
      const querySnapshot = await getDocs(q);
      
      const allGames = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as GameSession));

      // Client-side filtering for title and tags
      const searchLower = searchTerm.toLowerCase();
      return allGames.filter(game => 
        game.title.toLowerCase().includes(searchLower) ||
        game.tags.some(tag => tag.toLowerCase().includes(searchLower)) ||
        game.description.toLowerCase().includes(searchLower)
      );
    } catch (error) {
      console.error('Error searching games:', error);
      return [];
    }
  }

  /**
   * Get top games by likes
   */
  async getTopGames(limitCount: number = 10): Promise<GameSession[]> {
    try {
      const gamesRef = collection(db, 'game_sessions');
      const q = query(
        gamesRef, 
        where('isActive', '==', true),
        orderBy('likeCount', 'desc'),
        limit(limitCount)
      );
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as GameSession));
    } catch (error) {
      console.error('Error getting top games:', error);
      return [];
    }
  }

  /**
   * Test Firebase connection specifically for game sessions
   */
  async testGameSessionConnection(): Promise<boolean> {
    try {
      // Try to read the first game post
      const gamesRef = collection(db, 'posts');
      const q = query(gamesRef, where('type', '==', 'game'), limit(1));
      const querySnapshot = await getDocs(q);
      
      console.log('Game Sessions connection test:', querySnapshot.empty ? 'NO DATA' : 'SUCCESS');
      return !querySnapshot.empty;
    } catch (error) {
      console.error('Game Sessions connection test failed:', error);
      return false;
    }
  }

  /**
   * Debug method to check if specific game documents exist
   */
  async debugCheckGameDocuments(): Promise<void> {
    const gameIds = ['game_flappy_neon_001', 'game_snake_swipe_002', 'game_runner_3d_003'];
    
    console.log('🔍 Checking game documents in Firebase...');
    for (const gameId of gameIds) {
      try {
        const gameRef = doc(db, 'posts', gameId);
        const gameDoc = await getDoc(gameRef);
        console.log(`📄 ${gameId}: ${gameDoc.exists() ? '✅ EXISTS' : '❌ MISSING'}`);
        if (gameDoc.exists()) {
          const data = gameDoc.data();
          console.log(`   - Type: ${data?.type}, Title: ${data?.title}, Views: ${data?.viewCount || 0}`);
        }
      } catch (error) {
        console.error(`❌ Error checking ${gameId}:`, error);
      }
    }
  }
}

export default GameSessionService;

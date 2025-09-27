// Cross-platform storage implementation
const storage = {
  async setItem(key: string, value: string): Promise<void> {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    } else {
      (global as any).__gameStorage = (global as any).__gameStorage || {};
      (global as any).__gameStorage[key] = value;
    }
  },
  
  async getItem(key: string): Promise<string | null> {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    } else {
      (global as any).__gameStorage = (global as any).__gameStorage || {};
      return (global as any).__gameStorage[key] || null;
    }
  },
  
  async removeItem(key: string): Promise<void> {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    } else {
      (global as any).__gameStorage = (global as any).__gameStorage || {};
      delete (global as any).__gameStorage[key];
    }
  },
  
  async multiRemove(keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.removeItem(key);
    }
  }
};

export interface Comment {
  id: string;
  gameId: string;
  text: string;
  author: string;
  createdAt: number;
  likes: number;
  liked?: boolean;
}

export interface StoredGame {
  id: string;
  title: string;
  description: string;
  html: string;
  author: string;
  createdAt: number;
  updatedAt: number;
  likes: number;
  liked?: boolean;
  duration?: number;
  category?: string;
  views: number;
  comments: number;
}

export interface CreateTabState {
  input: string;
  gameHtml: string;
  hasCustomGame: boolean;
  gameName: string;
  gameDescription: string;
  generationSession?: any;
}

export interface OngoingGeneration {
  id: string;
  prompt: string;
  currentHtml?: string;
  status: 'generating' | 'completed' | 'failed';
  startedAt: number;
  lastUpdated: number;
  result?: string;
  error?: string;
}

export interface UserProfile {
  name: string;
  bio: string;
  avatar: string;
  totalLikes: number;
  totalViews: number;
  totalGames: number;
}

const STORAGE_KEYS = {
  GAMES: '@user_games',
  CREATE_TAB_STATE: '@create_tab_state',
  COMMENTS: '@game_comments',
  USER_PROFILE: '@user_profile',
  GAME_STATS: '@game_stats',
  ONGOING_GENERATION: '@ongoing_generation',
} as const;

class GameStorageManager {
  // Initialize default profile
  async initializeProfile(): Promise<void> {
    const profile = await this.getUserProfile();
    if (!profile) {
      await this.updateUserProfile({
        name: 'Player',
        bio: 'Creating awesome games',
        avatar: '🎮',
        totalLikes: 0,
        totalViews: 0,
        totalGames: 0,
      });
    }
  }

  // User Profile Management
  async getUserProfile(): Promise<UserProfile | null> {
    try {
      const profileJson = await storage.getItem(STORAGE_KEYS.USER_PROFILE);
      if (!profileJson) return null;
      return JSON.parse(profileJson);
    } catch (error) {
      console.error('Failed to get user profile:', error);
      return null;
    }
  }

  async updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    try {
      const current = await this.getUserProfile() || {
        name: 'Player',
        bio: '',
        avatar: '🎮',
        totalLikes: 0,
        totalViews: 0,
        totalGames: 0,
      };
      const updated = { ...current, ...updates };
      await storage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(updated));
      return updated;
    } catch (error) {
      console.error('Failed to update user profile:', error);
      throw error;
    }
  }

  // Game management
  async saveGame(game: Omit<StoredGame, 'id' | 'createdAt' | 'updatedAt' | 'views' | 'comments'>): Promise<StoredGame> {
    try {
      const games = await this.getAllGames();
      
      // Generate a more unique ID
      const timestamp = Date.now();
      const random = Math.random().toString(36).substr(2, 9);
      const uniqueId = `game_${timestamp}_${random}_${games.length}`;
      
      const newGame: StoredGame = {
        ...game,
        id: uniqueId,
        createdAt: timestamp,
        updatedAt: timestamp,
        views: 0,
        comments: 0,
      };
      
      // Double-check for uniqueness
      const exists = games.some(g => g.id === newGame.id);
      if (exists) {
        // If somehow still not unique, add extra randomness
        newGame.id = `${newGame.id}_${Math.random().toString(36).substr(2, 5)}`;
      }
      
      const updatedGames = [newGame, ...games];
      await storage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(updatedGames));
      
      // Update user profile stats
      const profile = await this.getUserProfile();
      if (profile) {
        await this.updateUserProfile({
          totalGames: profile.totalGames + 1,
        });
      }
      
      return newGame;
    } catch (error) {
      console.error('Failed to save game:', error);
      throw error;
    }
  }

  async getAllGames(): Promise<StoredGame[]> {
    try {
      const gamesJson = await storage.getItem(STORAGE_KEYS.GAMES);
      if (!gamesJson) return [];
      return JSON.parse(gamesJson);
    } catch (error) {
      console.error('Failed to get games:', error);
      return [];
    }
  }

  async getUserGames(): Promise<StoredGame[]> {
    try {
      const games = await this.getAllGames();
      return games.filter(g => g.author === '@you');
    } catch (error) {
      console.error('Failed to get user games:', error);
      return [];
    }
  }

  async getLikedGames(): Promise<StoredGame[]> {
    try {
      const games = await this.getAllGames();
      return games.filter(g => g.liked === true);
    } catch (error) {
      console.error('Failed to get liked games:', error);
      return [];
    }
  }

  async updateGame(gameId: string, updates: Partial<StoredGame>): Promise<StoredGame | null> {
    try {
      const games = await this.getAllGames();
      const gameIndex = games.findIndex(g => g.id === gameId);
      
      if (gameIndex === -1) return null;
      
      const updatedGame = {
        ...games[gameIndex],
        ...updates,
        updatedAt: Date.now(),
      };
      
      games[gameIndex] = updatedGame;
      await storage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(games));
      
      // Update profile stats if likes changed
      if ('likes' in updates) {
        const profile = await this.getUserProfile();
        if (profile && games[gameIndex].author === '@you') {
          const totalLikes = games
            .filter(g => g.author === '@you')
            .reduce((sum, g) => sum + g.likes, 0);
          await this.updateUserProfile({ totalLikes });
        }
      }
      
      return updatedGame;
    } catch (error) {
      console.error('Failed to update game:', error);
      throw error;
    }
  }

  async incrementGameViews(gameId: string): Promise<void> {
    try {
      const games = await this.getAllGames();
      const game = games.find(g => g.id === gameId);
      if (game) {
        await this.updateGame(gameId, { views: (game.views || 0) + 1 });
        
        // Update total views in profile
        if (game.author === '@you') {
          const profile = await this.getUserProfile();
          if (profile) {
            await this.updateUserProfile({ 
              totalViews: profile.totalViews + 1 
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to increment views:', error);
    }
  }

  async deleteGame(gameId: string): Promise<boolean> {
    try {
      const games = await this.getAllGames();
      const game = games.find(g => g.id === gameId);
      const filteredGames = games.filter(g => g.id !== gameId);
      
      if (filteredGames.length === games.length) return false;
      
      await storage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(filteredGames));
      
      // Delete all comments for this game
      const comments = await this.getGameComments(gameId);
      const allComments = await this.getAllComments();
      const filteredComments = allComments.filter(c => c.gameId !== gameId);
      await storage.setItem(STORAGE_KEYS.COMMENTS, JSON.stringify(filteredComments));
      
      // Update profile stats
      if (game && game.author === '@you') {
        const profile = await this.getUserProfile();
        if (profile) {
          const userGames = filteredGames.filter(g => g.author === '@you');
          const totalLikes = userGames.reduce((sum, g) => sum + g.likes, 0);
          await this.updateUserProfile({
            totalGames: userGames.length,
            totalLikes,
          });
        }
      }
      
      return true;
    } catch (error) {
      console.error('Failed to delete game:', error);
      throw error;
    }
  }

  async likeGame(gameId: string): Promise<StoredGame | null> {
    try {
      const games = await this.getAllGames();
      const game = games.find(g => g.id === gameId);
      
      if (!game) return null;
      
      const wasLiked = game.liked || false;
      const updatedGame = await this.updateGame(gameId, {
        liked: !wasLiked,
        likes: game.likes + (wasLiked ? -1 : 1),
      });
      
      return updatedGame;
    } catch (error) {
      console.error('Failed to like game:', error);
      throw error;
    }
  }

  // Comment Management
  async addComment(gameId: string, text: string, author: string = '@you'): Promise<Comment> {
    try {
      const comments = await this.getAllComments();
      const newComment: Comment = {
        id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        gameId,
        text,
        author,
        createdAt: Date.now(),
        likes: 0,
        liked: false,
      };
      
      const updatedComments = [newComment, ...comments];
      await storage.setItem(STORAGE_KEYS.COMMENTS, JSON.stringify(updatedComments));
      
      // Update game comment count
      const game = (await this.getAllGames()).find(g => g.id === gameId);
      if (game) {
        await this.updateGame(gameId, { 
          comments: (game.comments || 0) + 1 
        });
      }
      
      return newComment;
    } catch (error) {
      console.error('Failed to add comment:', error);
      throw error;
    }
  }

  async getAllComments(): Promise<Comment[]> {
    try {
      const commentsJson = await storage.getItem(STORAGE_KEYS.COMMENTS);
      if (!commentsJson) return [];
      return JSON.parse(commentsJson);
    } catch (error) {
      console.error('Failed to get comments:', error);
      return [];
    }
  }

  async getGameComments(gameId: string): Promise<Comment[]> {
    try {
      const comments = await this.getAllComments();
      return comments
        .filter(c => c.gameId === gameId)
        .sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error('Failed to get game comments:', error);
      return [];
    }
  }

  async likeComment(commentId: string): Promise<Comment | null> {
    try {
      const comments = await this.getAllComments();
      const commentIndex = comments.findIndex(c => c.id === commentId);
      
      if (commentIndex === -1) return null;
      
      const comment = comments[commentIndex];
      const wasLiked = comment.liked || false;
      
      comments[commentIndex] = {
        ...comment,
        liked: !wasLiked,
        likes: comment.likes + (wasLiked ? -1 : 1),
      };
      
      await storage.setItem(STORAGE_KEYS.COMMENTS, JSON.stringify(comments));
      return comments[commentIndex];
    } catch (error) {
      console.error('Failed to like comment:', error);
      throw error;
    }
  }

  async deleteComment(commentId: string): Promise<boolean> {
    try {
      const comments = await this.getAllComments();
      const comment = comments.find(c => c.id === commentId);
      const filteredComments = comments.filter(c => c.id !== commentId);
      
      if (filteredComments.length === comments.length) return false;
      
      await storage.setItem(STORAGE_KEYS.COMMENTS, JSON.stringify(filteredComments));
      
      // Update game comment count
      if (comment) {
        const game = (await this.getAllGames()).find(g => g.id === comment.gameId);
        if (game) {
          await this.updateGame(comment.gameId, { 
            comments: Math.max(0, (game.comments || 0) - 1) 
          });
        }
      }
      
      return true;
    } catch (error) {
      console.error('Failed to delete comment:', error);
      throw error;
    }
  }

  // Create tab state management
  async saveCreateTabState(state: CreateTabState): Promise<void> {
    try {
      await storage.setItem(STORAGE_KEYS.CREATE_TAB_STATE, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save create tab state:', error);
    }
  }

  async getCreateTabState(): Promise<CreateTabState | null> {
    try {
      const stateJson = await storage.getItem(STORAGE_KEYS.CREATE_TAB_STATE);
      if (!stateJson) return null;
      return JSON.parse(stateJson);
    } catch (error) {
      console.error('Failed to get create tab state:', error);
      return null;
    }
  }

  async clearCreateTabState(): Promise<void> {
    try {
      await storage.removeItem(STORAGE_KEYS.CREATE_TAB_STATE);
    } catch (error) {
      console.error('Failed to clear create tab state:', error);
    }
  }

  // Ongoing Generation Management
  async saveOngoingGeneration(generation: OngoingGeneration): Promise<void> {
    try {
      await storage.setItem(STORAGE_KEYS.ONGOING_GENERATION, JSON.stringify(generation));
    } catch (error) {
      console.error('Failed to save ongoing generation:', error);
    }
  }

  async getOngoingGeneration(): Promise<OngoingGeneration | null> {
    try {
      const generationJson = await storage.getItem(STORAGE_KEYS.ONGOING_GENERATION);
      if (!generationJson) return null;
      return JSON.parse(generationJson);
    } catch (error) {
      console.error('Failed to get ongoing generation:', error);
      return null;
    }
  }

  async clearOngoingGeneration(): Promise<void> {
    try {
      await storage.removeItem(STORAGE_KEYS.ONGOING_GENERATION);
    } catch (error) {
      console.error('Failed to clear ongoing generation:', error);
    }
  }

  async updateGenerationStatus(
    id: string, 
    status: 'generating' | 'completed' | 'failed', 
    result?: string, 
    error?: string
  ): Promise<void> {
    try {
      const generation = await this.getOngoingGeneration();
      if (generation && generation.id === id) {
        const updatedGeneration: OngoingGeneration = {
          ...generation,
          status,
          lastUpdated: Date.now(),
          ...(result && { result }),
          ...(error && { error }),
        };
        await this.saveOngoingGeneration(updatedGeneration);
      }
    } catch (error) {
      console.error('Failed to update generation status:', error);
    }
  }

  // Utility methods
  async clearAllData(): Promise<void> {
    try {
      await storage.multiRemove(Object.values(STORAGE_KEYS));
    } catch (error) {
      console.error('Failed to clear all data:', error);
      throw error;
    }
  }

  async getStorageInfo(): Promise<{ 
    gamesCount: number; 
    commentsCount: number;
    totalSize: number;
  }> {
    try {
      const games = await this.getAllGames();
      const comments = await this.getAllComments();
      const gamesJson = JSON.stringify(games);
      const commentsJson = JSON.stringify(comments);
      const createStateJson = await storage.getItem(STORAGE_KEYS.CREATE_TAB_STATE) || '';
      const profileJson = await storage.getItem(STORAGE_KEYS.USER_PROFILE) || '';
      const generationJson = await storage.getItem(STORAGE_KEYS.ONGOING_GENERATION) || '';
      
      return {
        gamesCount: games.length,
        commentsCount: comments.length,
        totalSize: gamesJson.length + commentsJson.length + createStateJson.length + profileJson.length + generationJson.length,
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return { gamesCount: 0, commentsCount: 0, totalSize: 0 };
    }
  }
}

export const GameStorage = new GameStorageManager();

// Initialize profile on first load
GameStorage.initializeProfile();

// Add default export for Expo Router
export default GameStorage;

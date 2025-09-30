/**
 * Centralized Game Store using Zustand
 * 
 * Replaces scattered state management across components
 * Optimized for performance with selective re-renders
 */

import { create } from 'zustand';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Types matching your existing SimpleGame interface
export interface Game {
  id: string;
  title: string;
  author: string;
  category: string;
  html: string;
  likes: number;
  views: number;
  plays: number;
  createdAt: any;
  liked?: boolean;
  difficulty?: 'easy' | 'medium' | 'hard';
  duration?: number;
  description?: string;
  commentCount?: number;
}

interface GameSession {
  gameId: string;
  startTime: number;
  score: number;
  completed: boolean;
}

interface GenerationState {
  isGenerating: boolean;
  progress: number;
  currentStep: string;
  error?: string;
}

interface PerformanceMetrics {
  fps: number;
  memoryUsage: number;
  cacheHitRate: number;
}

interface GameStore {
  // State
  games: Map<string, Game>;
  currentGameId: string | null;
  activeSession: GameSession | null;
  generationState: GenerationState;
  feedGames: string[]; // Array of game IDs for the feed
  likedGames: Set<string>;
  metrics: PerformanceMetrics;

  // Actions
  setGames: (games: Game[]) => void;
  addGame: (game: Game) => void;
  updateGame: (id: string, updates: Partial<Game>) => void;
  removeGame: (id: string) => void;
  
  setCurrentGame: (id: string | null) => void;
  startSession: (gameId: string) => void;
  endSession: (score: number, completed: boolean) => void;
  
  setGenerationState: (state: Partial<GenerationState>) => void;
  resetGenerationState: () => void;
  
  toggleLike: (gameId: string) => Promise<void>;
  incrementView: (gameId: string) => void;
  incrementPlay: (gameId: string) => void;
  
  updateMetrics: (metrics: Partial<PerformanceMetrics>) => void;
  
  // Selectors
  getGame: (id: string) => Game | undefined;
  getFeedGames: () => Game[];
  getLikedGames: () => Game[];
  getGamesByCategory: (category: string) => Game[];
  
  // Batch operations
  batchUpdateGames: (updates: Array<{ id: string; updates: Partial<Game> }>) => void;
  clearOldGames: (keepCount: number) => void;
}

// Create store with minimal middleware for Expo compatibility
const useGameStore = create<GameStore>((set, get) => ({
  // Initial state
  games: new Map(),
  currentGameId: null,
  activeSession: null,
  generationState: {
    isGenerating: false,
    progress: 0,
    currentStep: '',
  },
  feedGames: [],
  likedGames: new Set(),
  metrics: {
    fps: 60,
    memoryUsage: 0,
    cacheHitRate: 0,
  },

  // Actions
  setGames: (games) => set((state) => {
    const newGames = new Map(state.games);
    const newFeedGames: string[] = [];
    
    games.forEach(game => {
      newGames.set(game.id, game);
      newFeedGames.push(game.id);
    });
    
    return {
      games: newGames,
      feedGames: newFeedGames,
    };
  }),

  addGame: (game) => set((state) => {
    const newGames = new Map(state.games);
    newGames.set(game.id, game);
    
    return {
      games: newGames,
      feedGames: [...state.feedGames, game.id],
    };
  }),

  updateGame: (id, updates) => set((state) => {
    const game = state.games.get(id);
    if (!game) return state;
    
    const newGames = new Map(state.games);
    newGames.set(id, { ...game, ...updates });
    
    return { games: newGames };
  }),

  removeGame: (id) => set((state) => {
    const newGames = new Map(state.games);
    newGames.delete(id);
    
    const newLikedGames = new Set(state.likedGames);
    newLikedGames.delete(id);
    
    return {
      games: newGames,
      feedGames: state.feedGames.filter(gid => gid !== id),
      likedGames: newLikedGames,
    };
  }),

  setCurrentGame: (id) => set({ currentGameId: id }),

  startSession: (gameId) => set({
    activeSession: {
      gameId,
      startTime: Date.now(),
      score: 0,
      completed: false,
    },
  }),

  endSession: (score, completed) => set((state) => {
    if (!state.activeSession) return state;
    
    const gameId = state.activeSession.gameId;
    const game = state.games.get(gameId);
    
    if (game) {
      const newGames = new Map(state.games);
      newGames.set(gameId, {
        ...game,
        plays: (game.plays || 0) + 1,
      });
      
      return {
        activeSession: null,
        games: newGames,
      };
    }
    
    return { activeSession: null };
  }),

  setGenerationState: (updates) => set((state) => ({
    generationState: { ...state.generationState, ...updates },
  })),

  resetGenerationState: () => set({
    generationState: {
      isGenerating: false,
      progress: 0,
      currentStep: '',
      error: undefined,
    },
  }),

  toggleLike: async (gameId) => {
    const state = get();
    const game = state.games.get(gameId);
    
    if (!game) return;
    
    const isLiked = state.likedGames.has(gameId);
    const newLikedGames = new Set(state.likedGames);
    const newGames = new Map(state.games);
    
    if (isLiked) {
      newLikedGames.delete(gameId);
      newGames.set(gameId, {
        ...game,
        likes: Math.max(0, (game.likes || 0) - 1),
        liked: false,
      });
    } else {
      newLikedGames.add(gameId);
      newGames.set(gameId, {
        ...game,
        likes: (game.likes || 0) + 1,
        liked: true,
      });
    }
    
    set({ likedGames: newLikedGames, games: newGames });
    
    // Persist to AsyncStorage
    try {
      await AsyncStorage.setItem(
        'liked_games',
        JSON.stringify(Array.from(newLikedGames))
      );
    } catch (error) {
      console.error('[GameStore] Failed to persist likes:', error);
    }
  },

  incrementView: (gameId) => set((state) => {
    const game = state.games.get(gameId);
    if (!game) return state;
    
    const newGames = new Map(state.games);
    newGames.set(gameId, {
      ...game,
      views: (game.views || 0) + 1,
    });
    
    return { games: newGames };
  }),

  incrementPlay: (gameId) => set((state) => {
    const game = state.games.get(gameId);
    if (!game) return state;
    
    const newGames = new Map(state.games);
    newGames.set(gameId, {
      ...game,
      plays: (game.plays || 0) + 1,
    });
    
    return { games: newGames };
  }),

  updateMetrics: (metrics) => set((state) => ({
    metrics: { ...state.metrics, ...metrics },
  })),

  // Selectors
  getGame: (id) => {
    return get().games.get(id);
  },

  getFeedGames: () => {
    const state = get();
    return state.feedGames
      .map(id => state.games.get(id))
      .filter((game): game is Game => game !== undefined);
  },

  getLikedGames: () => {
    const state = get();
    return Array.from(state.likedGames)
      .map(id => state.games.get(id))
      .filter((game): game is Game => game !== undefined);
  },

  getGamesByCategory: (category) => {
    const state = get();
    return Array.from(state.games.values())
      .filter(game => game.category === category);
  },

  // Batch operations for performance
  batchUpdateGames: (updates) => set((state) => {
    const newGames = new Map(state.games);
    
    updates.forEach(({ id, updates }) => {
      const game = newGames.get(id);
      if (game) {
        newGames.set(id, { ...game, ...updates });
      }
    });
    
    return { games: newGames };
  }),

  clearOldGames: (keepCount) => set((state) => {
    if (state.feedGames.length <= keepCount) return state;
    
    const newGames = new Map(state.games);
    const toRemove = state.feedGames.slice(0, state.feedGames.length - keepCount);
    
    toRemove.forEach(id => {
      newGames.delete(id);
    });
    
    const newLikedGames = new Set(state.likedGames);
    toRemove.forEach(id => newLikedGames.delete(id));
    
    return {
      games: newGames,
      feedGames: state.feedGames.slice(-keepCount),
      likedGames: newLikedGames,
    };
  }),
}));

// Optimized selector hooks for better performance
export const useCurrentGame = () => useGameStore((state) => {
  if (!state.currentGameId) return null;
  return state.games.get(state.currentGameId);
});

export const useIsGenerating = () => 
  useGameStore((state) => state.generationState.isGenerating);

export const useGenerationProgress = () => 
  useGameStore((state) => state.generationState.progress);

export const useFeedGames = () => 
  useGameStore((state) => state.getFeedGames());

export const useGameMetrics = () => 
  useGameStore((state) => state.metrics);

// Action hooks
export const useGameActions = () => useGameStore((state) => ({
  addGame: state.addGame,
  updateGame: state.updateGame,
  removeGame: state.removeGame,
  toggleLike: state.toggleLike,
  setCurrentGame: state.setCurrentGame,
  startSession: state.startSession,
  endSession: state.endSession,
  incrementView: state.incrementView,
  incrementPlay: state.incrementPlay,
}));

// Load persisted data on app start
if (Platform.OS !== 'web') {
  AsyncStorage.getItem('liked_games').then(data => {
    if (data) {
      const likedIds = JSON.parse(data);
      useGameStore.setState({ likedGames: new Set(likedIds) });
    }
  }).catch(err => console.error('[GameStore] Failed to load likes:', err));
}

export default useGameStore;

// app/components/PlayFeed.tsx
/**
 * PlayFeed Component with Dynamic Pagination and Bounce Loader
 *
 * This component implements a TikTok-style feed with dynamic loading:
 * - Initially loads PAGE_SIZE games (default: 3)
 * - Loads more games when user reaches LOAD_TRIGGER_INDEX (default: 2, which is the 3rd game)
 * - Loads additional PAGE_SIZE games each time the trigger is reached
 * - Shows loading indicator while fetching more games
 * - Displays bouncing loader animation when user tries to navigate beyond available games
 *
 * Configuration variables:
 * - PAGE_SIZE: Number of games to load per page
 * - LOAD_TRIGGER_INDEX: Index at which to trigger loading more games (0-based)
 *
 * Features:
 * - Progressive loading: Games load as user scrolls
 * - Bounce loader: Animated loading screen when user tries to access unloaded games
 * - Smart navigation: Prevents navigation to non-existent games
 */

import React, { useMemo, useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  Easing,
  AccessibilityInfo,
  Keyboard,
  PanResponder,
} from "react-native";
import * as Haptics from "expo-haptics";
import { WebView } from "react-native-webview";
import { CustomIcon } from "../../components/ui/CustomIcon";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

import SimpleGameService from "../services/SimpleGameService";
import { getGameErrorMonitoringScript, getWebViewConfig, getPerformanceMonitoringScript } from "../services/WebViewUtils";
import { SessionService } from "../services/SessionService";
import ActivityTrackerInstance from "../services/ActivityTracker";
import { useAuth } from "../auth/AuthProvider";
import usePerformanceMonitor from "../../hooks/usePerformanceMonitor";

// Performance optimization: Preload next game
const PRELOAD_COUNT = 2; // Number of games to preload ahead

type Game = {
  id: string;
  title: string;
  author: string;
  likes: number;
  liked?: boolean;
  html: string;
  duration?: number;
  category?: string;
  views?: number;
  comments?: number;
};

export interface PlayFeedRef {
  addGame: (game: Game) => void;
  refreshFeed: () => void;
}

const PlayFeed = forwardRef<PlayFeedRef, {}>(({}, ref) => {
  const { user } = useAuth();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const tabBarHeight = Platform.OS === 'android' ? 56 : 49;
  const cardHeight = screenHeight - insets.top - insets.bottom - tabBarHeight;
  const cardWidth = screenWidth;

  // Enhanced pagination configuration for smooth infinite scroll
  const PAGE_SIZE = 12; // Load more games per page for smoother scrolling
  const LOAD_TRIGGER_INDEX = 8; // Load more when user reaches this index (0-based, so 8 = 9th game)
  const PRELOAD_BUFFER = 6; // Start loading more games when user is within 6 games of the end
  const MAX_VISIBLE_GAMES = 50; // Limit visible games to prevent memory issues

  const [games, setGames] = useState<Game[]>([]);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showResultSheet, setShowResultSheet] = useState(false);
  const [lastScore, setLastScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [muted, setMuted] = useState(false);
  const [resetVersionById, setResetVersionById] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreGames, setHasMoreGames] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [showBounceLoader, setShowBounceLoader] = useState(false);
  const [isNearEnd, setIsNearEnd] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const viewRef = useRef<FlatList>(null);
  const prevIndexRef = useRef(0);
  const gamesRef = useRef<Game[]>([]);
  const hasMoreGamesRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const showBounceLoaderRef = useRef(false);
  const loadMoreGamesRef = useRef<(() => Promise<void>) | null>(null);
  const isNearEndRef = useRef(false);
  const gameService = SimpleGameService.getInstance();

  // Memory management: Track preloaded games
  const preloadedGames = useRef<Set<string>>(new Set());
  const visibleRange = useRef({ start: 0, end: 0 });

  // Performance monitoring
  const { getCurrentFPS } = usePerformanceMonitor((metrics) => {
    // Log performance metrics for debugging
    if (__DEV__) {
      console.log('PlayFeed Performance:', metrics);
    }
  }, 10000); // Monitor every 10 seconds

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const bounceAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Load initial games with progress indication
    const loadInitialGames = async () => {
      setLoading(true);
      setLoadingProgress(0);
      progressAnim.setValue(0);

      // Simulate loading progress for better UX
      const progressInterval = setInterval(() => {
        setLoadingProgress(prev => {
          const newProgress = prev + 5;
          if (newProgress >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          progressAnim.setValue(newProgress);
          return newProgress;
        });
      }, 100);

      try {
        await loadGamesFromFirebase();
        clearInterval(progressInterval);
        setLoadingProgress(100);
        progressAnim.setValue(100);
        setTimeout(() => {
          setLoadingProgress(0);
          progressAnim.setValue(0);
        }, 500);
      } catch (error) {
        clearInterval(progressInterval);
        setLoadingProgress(0);
        progressAnim.setValue(0);
        console.error('Error loading initial games:', error);
      } finally {
        setLoading(false);
      }
    };

    loadInitialGames();

    // Smooth entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Bounce loader animation effect
  useEffect(() => {
    if (showBounceLoader) {
      // Stop any existing animation
      if (bounceAnimationRef.current) {
        bounceAnimationRef.current.stop();
      }

      // Start bounce animation
      bounceAnimationRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(bounceAnim, {
            toValue: -20,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(bounceAnim, {
            toValue: 0,
            duration: 300,
            easing: Easing.bounce,
            useNativeDriver: true,
          }),
        ])
      );
      bounceAnimationRef.current.start();
    } else {
      // Stop bounce animation
      if (bounceAnimationRef.current) {
        bounceAnimationRef.current.stop();
        bounceAnimationRef.current = null;
      }
      bounceAnim.setValue(0);
    }

    return () => {
      if (bounceAnimationRef.current) {
        bounceAnimationRef.current.stop();
        bounceAnimationRef.current = null;
      }
    };
  }, [showBounceLoader, bounceAnim]);

  // 🚀 PERFORMANCE OPTIMIZATION: Memoized game loading with better error handling
  const loadGamesFromFirebase = useCallback(async (page: number = 0, append: boolean = false) => {
    try {
      if (page === 0) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const userId = user?.uid || SessionService.getUserIdentifier();
      const simpleGames = await gameService.getAllGames(userId);

      if (simpleGames.length > 0) {
        const firebaseGames: Game[] = simpleGames
          .filter(game => game.html && game.html.trim().length > 0)
          .map(game => ({
            id: game.id,
            title: game.title,
            author: game.author,
            likes: game.likes,
            html: game.html!,
            duration: game.duration,
            views: game.views,
            comments: game.commentCount || 0,
            liked: game.liked || false
          }));

        // Calculate pagination
        const startIndex = page * PAGE_SIZE;
        const endIndex = startIndex + PAGE_SIZE;
        const paginatedGames = firebaseGames.slice(startIndex, endIndex);

        if (append) {
          setGames(prevGames => {
            // 🚀 PERFORMANCE: Avoid duplicates when appending
            const existingIds = new Set(prevGames.map(g => g.id));
            const newGames = paginatedGames.filter(g => !existingIds.has(g.id));
            return [...prevGames, ...newGames];
          });
        } else {
          setGames(paginatedGames);
        }

        // Check if there are more games available
        setHasMoreGames(endIndex < firebaseGames.length);
        setCurrentPage(page);
      } else {
        if (!append) {
          setGames([]);
        }
        setHasMoreGames(false);
      }
    } catch (error) {
      console.error('Error loading games:', error);
      if (!append) {
        setGames([]);
      }
      setHasMoreGames(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user?.uid, gameService]); // 🚀 PERFORMANCE: More specific dependencies

  const loadMoreGames = useCallback(async () => {
    if (loadingMore || !hasMoreGames) return;

    const nextPage = currentPage + 1;
    setLoadingProgress(0);
    progressAnim.setValue(0);

    // Animate loading progress for smooth UX
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        const newProgress = prev + 10;
        if (newProgress >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        progressAnim.setValue(newProgress);
        return newProgress;
      });
    }, 100);

    try {
      await loadGamesFromFirebase(nextPage, true);
      clearInterval(progressInterval);
      setLoadingProgress(100);
      progressAnim.setValue(100);
      setTimeout(() => {
        setLoadingProgress(0);
        progressAnim.setValue(0);
      }, 500);
    } catch (error) {
      clearInterval(progressInterval);
      setLoadingProgress(0);
      progressAnim.setValue(0);
      console.error('Error loading more games:', error);
    }
  }, [loadingMore, hasMoreGames, currentPage, loadGamesFromFirebase, progressAnim]);

  // Enhanced loading strategy with predictive loading and memory management
  const checkAndLoadMore = useCallback(async (currentIndex: number) => {
    const totalGames = gamesRef.current.length;
    const gamesUntilEnd = totalGames - currentIndex - 1;

    // Check if user is near the end (within buffer zone)
    const shouldLoadMore = gamesUntilEnd <= PRELOAD_BUFFER && hasMoreGamesRef.current && !loadingMoreRef.current;

    if (shouldLoadMore) {
      setIsNearEnd(true);
      loadMoreGamesRef.current?.();
    } else {
      setIsNearEnd(false);
    }

    // Memory management: Clean up old games when loading new ones
    if (totalGames > MAX_VISIBLE_GAMES * 1.5) {
      const gamesToKeep = gamesRef.current.slice(Math.max(0, currentIndex - 10), currentIndex + PRELOAD_BUFFER + 5);
      if (gamesToKeep.length < totalGames) {
        setGames(gamesToKeep);
        console.log(`Memory optimization: Reduced from ${totalGames} to ${gamesToKeep.length} games`);
      }
    }
  }, []);

  // Preload games for better performance
  const preloadGames = useCallback(async (gamesToPreload: Game[]) => {
    const preloadPromises = gamesToPreload
      .filter(game => !preloadedGames.current.has(game.id))
      .slice(0, PRELOAD_COUNT)
      .map(async (game) => {
        try {
          // Preload game data and mark as preloaded
          preloadedGames.current.add(game.id);
          console.log(`Preloaded game: ${game.title}`);
        } catch (error) {
          console.warn(`Failed to preload game ${game.id}:`, error);
        }
      });

    await Promise.allSettled(preloadPromises);
  }, []);

  useImperativeHandle(ref, () => ({
    addGame: (game: Game) => {
      // Reset pagination and reload from start
      setCurrentPage(0);
      setHasMoreGames(true);
      loadGamesFromFirebase(0, false).then(() => {
        requestAnimationFrame(() => {
          setGames(prevGames => {
            const index = prevGames.findIndex(g => g.id === game.id);
            if (index !== -1) {
              setCurrent(index);
              viewRef.current?.scrollToIndex({ index, animated: true });
            }
            return prevGames;
          });
        });
      });
    },
    refreshFeed: () => {
      setCurrentPage(0);
      setHasMoreGames(true);
      loadGamesFromFirebase(0, false);
    },
  }), []);

  const resetCurrentGame = useCallback(() => {
    const currentGame = games[current];
    if (currentGame) {
      setResetVersionById((m) => ({
        ...m,
        [currentGame.id]: (m[currentGame.id] ?? 0) + 1,
      }));
    }
    setPlaying(false);
    setShowResultSheet(false);
    setLastScore(0);
  }, [games, current]);

    // Use ref to store the callback to keep it stable for FlatList
    const onViewableItemsChangedRef = useRef(({ viewableItems }: any) => {
      if (viewableItems?.[0]) {
        const idx = viewableItems[0].index ?? 0;
        const previousIndex = prevIndexRef.current;
        const previousGame = gamesRef.current[previousIndex];

        if (previousGame) {
          setResetVersionById((m) => ({
            ...m,
            [previousGame.id]: (m[previousGame.id] ?? 0) + 1,
          }));
        }

        const currentGame = gamesRef.current[idx];
        if (currentGame) {
          setResetVersionById((m) => ({
            ...m,
            [currentGame.id]: (m[currentGame.id] ?? 0) + 1,
          }));
        }

        prevIndexRef.current = idx;
        setCurrent(idx);
        setPlaying(false);
        setShowResultSheet(false);
        setLastScore(0);

        // Update visible range for memory management
        visibleRange.current = { start: Math.max(0, idx - 1), end: Math.min(gamesRef.current.length - 1, idx + 1) };

        // Use enhanced loading strategy with predictive loading
        checkAndLoadMore(idx);

        // Preload upcoming games for better performance
        const upcomingGames = gamesRef.current.slice(idx + 1, idx + 1 + PRELOAD_COUNT);
        if (upcomingGames.length > 0) {
          preloadGames(upcomingGames);
        }

        // If user somehow scrolls to an index that doesn't exist, show bounce loader
        if (idx >= gamesRef.current.length && hasMoreGamesRef.current && !loadingMoreRef.current && !showBounceLoaderRef.current) {
          setShowBounceLoader(true);
          loadMoreGamesRef.current?.().then(() => {
            setShowBounceLoader(false);
          }).catch(() => {
            setShowBounceLoader(false);
          });
        }
      }
    });

    // Update refs when dependencies change
    useEffect(() => {
      gamesRef.current = games;
    }, [games]);

    useEffect(() => {
      hasMoreGamesRef.current = hasMoreGames;
    }, [hasMoreGames]);

    useEffect(() => {
      loadingMoreRef.current = loadingMore;
    }, [loadingMore]);

    useEffect(() => {
      showBounceLoaderRef.current = showBounceLoader;
    }, [showBounceLoader]);

    useEffect(() => {
      isNearEndRef.current = isNearEnd;
    }, [isNearEnd]);

    useEffect(() => {
      loadMoreGamesRef.current = loadMoreGames;
    }, [loadMoreGames]);

  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 85 }), []);

  const handleGameMessage = useCallback((gameId: string, message: any) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'score') {
        setLastScore(data.score);
        setBestScore(prev => Math.max(prev, data.score));
      } else if (data.type === 'gameEnd') {
        setLastScore(data.score);
        setBestScore(prev => Math.max(prev, data.score));
        setShowResultSheet(true);
        setPlaying(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (data.type === 'error') {
        console.error('ERROR IN GENERATED CODE: PlayFeed WebView error:', data.message, 'Game ID:', gameId);
      } else if (data.type === 'console.error') {
        console.error('ERROR IN GENERATED CODE: PlayFeed console error:', data.message, 'Game ID:', gameId);
      } else if (data.type === 'console.warn') {
        console.warn('ERROR IN GENERATED CODE: PlayFeed console warning:', data.message, 'Game ID:', gameId);
      } else if (data.type === 'runtime-error') {
        console.error('ERROR IN GENERATED CODE: PlayFeed runtime error:', data.message, data.stack || '', 'Game ID:', gameId);
      } else if (data.type === 'syntax-error') {
        console.error('ERROR IN GENERATED CODE: PlayFeed syntax error:', data.message, 'at line', data.line || 'unknown', 'Game ID:', gameId);
      } else if (data.type === 'network-error') {
        console.error('ERROR IN GENERATED CODE: PlayFeed network error:', data.message, 'Game ID:', gameId);
      }
    } catch {}
  }, []);

  const handleReplay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowResultSheet(false);
    setLastScore(0);
    viewRef.current?.scrollToIndex({ index: current, animated: false });
    setTimeout(() => setPlaying(true), 100);
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowResultSheet(false);
    setLastScore(0);
    resetCurrentGame();

    const nextIndex = current + 1;

    // If trying to go beyond available games, show bounce loader and load more
    if (nextIndex >= games.length) {
      if (hasMoreGames && !loadingMore) {
        setShowBounceLoader(true);
        loadMoreGames().then(() => {
          setShowBounceLoader(false);
          // After loading, navigate to the new game if it exists
          if (games.length > nextIndex) {
            viewRef.current?.scrollToIndex({ index: nextIndex, animated: true });
          }
        }).catch(() => {
          setShowBounceLoader(false);
        });
      }
      return;
    }

    viewRef.current?.scrollToIndex({ index: nextIndex, animated: true });
  };

  const handlePrev = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowResultSheet(false);
    setLastScore(0);
    resetCurrentGame();
    const prevIndex = (current - 1 + games.length) % games.length;
    viewRef.current?.scrollToIndex({ index: prevIndex, animated: true });
  };

  const handleBackToFeed = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlaying(false);
    resetCurrentGame();
  };

  const renderItem = ({ item, index }: { item: Game; index: number }) => (
    <GameCard
      game={item}
      isActive={index === current}
      resetKey={resetVersionById[item.id] ?? 0}
      playing={playing && index === current}
      muted={muted}
      user={user}
      onExit={handleBackToFeed}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onMessage={(msg: any) => handleGameMessage(item.id, msg)}
      onLike={async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        ActivityTrackerInstance.recordActivity();
        const wasLiked = item.liked;
        const newLikeCount = wasLiked ? item.likes - 1 : item.likes + 1;

        setGames(gs => gs.map(g =>
          g.id === item.id ? { ...g, liked: !wasLiked, likes: newLikeCount } : g
        ));

        try {
          const userId = user?.uid || SessionService.getUserIdentifier();
          await gameService.likeGame(item.id, userId, user);
        } catch (error) {
          console.error('Error syncing like:', error);
          setGames(gs => gs.map(g =>
            g.id === item.id ? { ...g, liked: wasLiked, likes: item.likes } : g
          ));
        }
      }}
      onRequestNext={handleNext}
      onRequestPrev={handlePrev}
      cardHeight={cardHeight}
      cardWidth={cardWidth}
      onMuteToggle={() => setMuted(!muted)}
      onBackToFeed={handleBackToFeed}
    />
  );

  const renderFooter = () => {
    if (loadingMore || isNearEnd) {
      return (
        <View style={[styles.loadingMoreContainer, { height: cardHeight }]}>
          <View style={styles.loadingProgressContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <View style={styles.progressBar}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 100],
                      outputRange: ['0%', '100%']
                    })
                  }
                ]}
              />
            </View>
            <Text style={styles.loadingMoreText}>
              {loadingMore ? 'Loading more games...' : 'Preparing more games...'}
            </Text>
            {loadingProgress > 0 && (
              <Text style={styles.loadingProgressText}>
                {Math.round(loadingProgress)}%
              </Text>
            )}
          </View>
        </View>
      );
    }
    return null;
  };

  const renderBounceLoader = () => {
    if (!showBounceLoader) return null;

    return (
      <Animated.View
        style={[
          styles.bounceLoaderOverlay,
          {
            transform: [{ translateY: bounceAnim }],
            height: cardHeight,
            width: cardWidth,
          },
        ]}
      >
        <BlurView intensity={80} tint="dark" style={styles.bounceLoaderContent}>
          <View style={styles.bounceLoaderIcon}>
            <CustomIcon name="game-controller-outline" size={48} color="#007AFF" />
          </View>
          <Text style={styles.bounceLoaderText}>Loading next game...</Text>
          <Text style={styles.bounceLoaderSubtext}>Please wait</Text>
        </BlurView>
      </Animated.View>
    );
  };

  if (games.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Animated.View style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }]
        }}>
          <BlurView intensity={80} tint="dark" style={styles.emptyCard}>
            <View style={styles.emptyContent}>
              <View style={styles.emptyIconContainer}>
                <CustomIcon name="game-controller-outline" size={48} color="#007AFF" />
              </View>
              <Text style={styles.emptyTitle}>
                {loading ? 'Loading Games...' : 'No Games Yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {loading ? 'Discovering amazing games for you' : 'Create your first game to see it here'}
              </Text>
              {loading && (
                <View style={styles.emptyLoaderContainer}>
                  <ActivityIndicator size="large" color="#007AFF" />
                  {loadingProgress > 0 && (
                    <View style={styles.emptyProgressContainer}>
                      <View style={styles.emptyProgressBar}>
                        <Animated.View
                          style={[
                            styles.emptyProgressFill,
                            {
                              width: progressAnim.interpolate({
                                inputRange: [0, 100],
                                outputRange: ['0%', '100%']
                              })
                            }
                          ]}
                        />
                      </View>
                      <Text style={styles.emptyProgressText}>
                        {Math.round(loadingProgress)}%
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </BlurView>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={viewRef}
        data={games}
        keyExtractor={(g) => g.id}
        renderItem={renderItem}
        ListFooterComponent={renderFooter}
        showsVerticalScrollIndicator={false}
        pagingEnabled
        decelerationRate="fast"
        bounces={false}
        scrollsToTop={false}
        snapToAlignment="start"
        snapToInterval={cardHeight}
        disableIntervalMomentum
        scrollEnabled={!playing && !showBounceLoader}
        onViewableItemsChanged={onViewableItemsChangedRef.current}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, i) => ({ length: cardHeight, offset: cardHeight * i, index: i })}
      />

      {/* Bounce Loader Overlay */}
      {renderBounceLoader()}

      {/* Result Sheet Modal */}
      <Modal visible={showResultSheet} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setShowResultSheet(false)}>
          <BlurView intensity={100} tint="dark" style={styles.resultSheet}>
            <View style={styles.resultContent}>
              <View style={styles.dragIndicator} />
              
              <Text style={styles.resultTitle}>Game Over</Text>
              
              <View style={styles.scoreRow}>
                <View style={styles.scoreCard}>
                  <Text style={styles.scoreLabel}>Score</Text>
                  <Text style={styles.scoreValue}>{lastScore}</Text>
                </View>
                <View style={styles.scoreCard}>
                  <Text style={styles.scoreLabel}>Best</Text>
                  <Text style={styles.scoreValue}>{bestScore}</Text>
                </View>
              </View>

              <View style={styles.resultActions}>
                <Pressable style={styles.secondaryButton} onPress={handleReplay}>
                  <BlurView intensity={80} tint="dark" style={styles.buttonBlur}>
                    <CustomIcon name="refresh" size={20} color="#FFFFFF" />
                    <Text style={styles.secondaryButtonText}>Replay</Text>
                  </BlurView>
                </Pressable>
                
                <Pressable style={styles.primaryButton} onPress={handleNext}>
                  <View style={styles.primaryButtonInner}>
                    <Text style={styles.primaryButtonText}>Next Game</Text>
                    <CustomIcon name="arrow-forward" size={20} color="#FFFFFF" />
                  </View>
                </Pressable>
              </View>
            </View>
          </BlurView>
        </Pressable>
      </Modal>
    </View>
  );
});

PlayFeed.displayName = 'PlayFeed';
export default PlayFeed;

// Game Card Component
function GameCard({
  game,
  isActive,
  resetKey,
  playing,
  muted,
  user,
  onPlay,
  onPause,
  onExit,
  onMessage,
  onLike,
  onRequestNext,
  onRequestPrev,
  cardHeight,
  cardWidth,
  onMuteToggle,
  onBackToFeed,
}: any) {
  const [showOverlay, setShowOverlay] = useState(true);
  const [viewCount, setViewCount] = useState(game.views || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState("");
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentCount, setCommentCount] = useState(game.comments || 0);

  // Animation values
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.98)).current;
  const likeScale = useRef(new Animated.Value(1)).current;
  const playScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive) {
      // Smooth entrance
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      // Track view
      ActivityTrackerInstance.recordActivity();
      const gameService = SimpleGameService.getInstance();
      gameService.viewGame(game.id).then(() => {
        setViewCount((prev: number) => prev + 1);
      }).catch(console.error);
    }
  }, [isActive, game.id]);

  useEffect(() => {
    if (showComments) {
      setIsLoadingComments(true);
      const gameService = SimpleGameService.getInstance();
      gameService.getGameComments(game.id).then(gameComments => {
        setComments(gameComments);
        setIsLoadingComments(false);
      }).catch(error => {
        console.error('Error loading comments:', error);
        setIsLoadingComments(false);
      });
    }
  }, [showComments, game.id]);

  const handlePlayTap = async () => {
    if (!showOverlay) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Animate play button press
    Animated.sequence([
      Animated.timing(playScale, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(playScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
    
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setShowOverlay(false);
      onPlay();
    });

    // Announce for VoiceOver
    AccessibilityInfo.announceForAccessibility(`Playing ${game.title}`);

    try {
      const gameService = SimpleGameService.getInstance();
      await gameService.playGame(game.id);
    } catch (error) {
      console.error('Error tracking play:', error);
    }
  };

  const animateLike = () => {
    Animated.sequence([
      Animated.timing(likeScale, {
        toValue: 1.3,
        duration: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(likeScale, {
        toValue: 1,
        duration: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleSendComment = async () => {
    const trimmed = commentText.trim();
    if (!trimmed) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    ActivityTrackerInstance.recordActivity();
    
    const tempComment = {
      id: `temp_${Date.now()}`,
      text: trimmed,
      author: '@you',
      createdAt: Date.now(),
      likes: 0,
      liked: false,
    };

    setComments((prev: any[]) => [tempComment, ...prev]);
    setCommentCount((prev: number) => prev + 1);
    setCommentText("");

    try {
      const gameService = SimpleGameService.getInstance();
      const userId = user?.uid || SessionService.getUserIdentifier();
      await gameService.addComment(game.id, trimmed, userId);
      const updated = await gameService.getGameComments(game.id);
      setComments(updated);
      setCommentCount(updated.length);
    } catch (error) {
      console.error('Error sending comment:', error);
      setComments((prev: any[]) => prev.filter(c => c.id !== tempComment.id));
      setCommentCount((prev: number) => prev - 1);
      setCommentText(trimmed);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    ActivityTrackerInstance.recordActivity();
    const original = [...comments];
    
    setComments(prev => prev.map(c => {
      if (c.id === commentId) {
        return {
          ...c,
          liked: !c.liked,
          likes: c.liked ? c.likes - 1 : c.likes + 1
        };
      }
      return c;
    }));

    try {
      const gameService = SimpleGameService.getInstance();
      const userId = user?.uid || SessionService.getUserIdentifier();
      await gameService.likeComment(game.id, commentId, userId);
    } catch (error) {
      console.error('Error liking comment:', error);
      setComments(original);
    }
  };

  const source = useMemo(() => ({ 
    html: wrapHTML(game.html, muted) 
  }), [game.html, resetKey, muted]);

  const getInitial = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  return (
    <Animated.View style={[
      styles.gameCard, 
      { 
        height: cardHeight, 
        width: cardWidth,
        transform: [{ scale: scaleAnim }]
      }
    ]}>
      {/* Compact Header */}
      {!playing && (
        <BlurView intensity={60} tint="dark" style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.headerLeft}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitial(game.author)}</Text>
              </View>
              <View style={styles.headerInfo}>
                <Text style={styles.headerTitle} numberOfLines={1}>{game.title}</Text>
                <Text style={styles.headerAuthor}>{game.author}</Text>
              </View>
            </View>
            <Pressable style={styles.moreButton}>
              <CustomIcon name="ellipsis-horizontal" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </BlurView>
      )}

      {/* Playing Header */}
      {playing && (
        <BlurView intensity={60} tint="dark" style={styles.playingHeader}>
          <View style={styles.playingHeaderContent}>
            <Pressable style={styles.backButton} onPress={onBackToFeed}>
              <CustomIcon name="chevron-back" size={24} color="#FFFFFF" />
            </Pressable>
            <View style={styles.playingInfo}>
              <Text style={styles.playingTitle} numberOfLines={1}>{game.title}</Text>
            </View>
            <Pressable style={styles.muteButton} onPress={onMuteToggle}>
              <CustomIcon name={muted ? "volume-mute" : "volume-high"} size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </BlurView>
      )}

      {/* Game Content */}
      <View style={styles.gameContent}>
        <View style={styles.webviewContainer}>
          <WebView
            key={`${game.id}_${resetKey}`}
            source={source}
            style={styles.webview}
            {...getWebViewConfig()}
            mediaPlaybackRequiresUserAction={false}
            userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1"
            allowsBackForwardNavigationGestures={false}
            onShouldStartLoadWithRequest={() => true}
            injectedJavaScript={`${getGameErrorMonitoringScript()}; ${getPerformanceMonitoringScript()}; true;`}
            onMessage={(event) => {
              onMessage(event.nativeEvent.data);
              // Handle performance monitoring messages
              try {
                const data = JSON.parse(event.nativeEvent.data);
                if (data.type === 'performance') {
                  console.log(`Game ${game.id} Performance:`, data);
                }
              } catch {}
            }}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error('ERROR IN GENERATED CODE: PlayFeed WebView load error:', nativeEvent, 'Game ID:', game.id);
            }}
            onHttpError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error('ERROR IN GENERATED CODE: PlayFeed WebView HTTP error:', nativeEvent, 'Game ID:', game.id);
            }}
            onRenderProcessGone={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error('ERROR IN GENERATED CODE: PlayFeed WebView render process gone:', nativeEvent, 'Game ID:', game.id);
            }}
          />
        </View>
      </View>

      {/* Action Bar */}
      {!playing && (
        <BlurView intensity={60} tint="dark" style={styles.actionBar}>
          <View style={styles.actionBarContent}>
            <Pressable 
              style={styles.actionButton}
              onPress={() => {
                animateLike();
                onLike();
              }}
              accessibilityLabel={`Like, ${game.likes} likes`}
              accessibilityRole="button"
            >
              <Animated.View style={{ transform: [{ scale: likeScale }] }}>
                <CustomIcon
                  name={game.liked ? "heart" : "heart-outline"}
                  size={22}
                  color={game.liked ? "#FF3B30" : "#FFFFFF"}
                />
              </Animated.View>
              <Text style={[styles.actionCount, game.liked && styles.actionCountActive]}>
                {formatCount(game.likes)}
              </Text>
            </Pressable>

            <Pressable 
              style={styles.actionButton} 
              onPress={() => setShowComments(true)}
              accessibilityLabel={`Comments, ${commentCount} comments`}
              accessibilityRole="button"
            >
              <CustomIcon name="chatbubble-outline" size={22} color="#FFFFFF" />
              <Text style={styles.actionCount}>{formatCount(commentCount)}</Text>
            </Pressable>

            <View style={styles.actionButton}>
              <CustomIcon name="eye-outline" size={22} color="#FFFFFF" />
              <Text style={styles.actionCount}>{formatCount(viewCount)}</Text>
            </View>

            <Pressable 
              style={styles.actionButton}
              accessibilityLabel="Share"
              accessibilityRole="button"
            >
              <CustomIcon name="share-outline" size={22} color="#FFFFFF" />
            </Pressable>

            <View style={styles.spacer} />

            <Pressable 
              style={styles.actionButton}
              accessibilityLabel="Save"
              accessibilityRole="button"
            >
              <CustomIcon name="bookmark-outline" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        </BlurView>
      )}

      {/* Play Overlay */}
      {showOverlay && isActive && !playing && (
        <Animated.View style={[styles.playOverlay, { opacity: overlayOpacity }]} pointerEvents="box-none">
          <Pressable 
            style={styles.playButtonArea} 
            onPress={handlePlayTap}
            accessibilityLabel={`Play ${game.title}`}
            accessibilityRole="button"
          >
            <Animated.View style={{ transform: [{ scale: playScale }] }}>
              <View style={styles.playButton}>
                <CustomIcon name="play" size={28} color="#FFFFFF" />
              </View>
            </Animated.View>
            {game.duration && (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{game.duration}s</Text>
              </View>
            )}
          </Pressable>
        </Animated.View>
      )}

      {/* Comments Modal */}
      <CommentModal
        visible={showComments}
        onClose={() => setShowComments(false)}
        game={game}
        comments={comments}
        commentText={commentText}
        onCommentTextChange={setCommentText}
        onSendComment={handleSendComment}
        onLikeComment={handleLikeComment}
        isLoading={isLoadingComments}
        cardHeight={cardHeight}
      />
    </Animated.View>
  );
}

// Comment Modal Component
function CommentModal({
  visible,
  onClose,
  game,
  comments,
  commentText,
  onCommentTextChange,
  onSendComment,
  onLikeComment,
  isLoading,
  cardHeight,
}: any) {
  const translateY = useRef(new Animated.Value(cardHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const inputContainerY = useRef(new Animated.Value(0)).current;
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const lastGesture = useRef({ dy: 0, vy: 0 });
  
  const minTranslateY = -100; // Can be dragged up by 100 pixels
  const maxTranslateY = cardHeight * 0.7; // Can be dragged down by 70% of card height

  // Keyboard event listeners
  useEffect(() => {
    const keyboardShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        // Move only the input field up to touch the keyboard (0 distance)
        Animated.timing(inputContainerY, {
          toValue: -e.endCoordinates.height,
          duration: Platform.OS === 'ios' ? e.duration || 250 : 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }
    );

    const keyboardHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (e) => {
        setKeyboardHeight(0);
        // Return input field to original position
        Animated.timing(inputContainerY, {
          toValue: 0,
          duration: Platform.OS === 'ios' ? e.duration || 250 : 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }
    );

    return () => {
      keyboardShowListener.remove();
      keyboardHideListener.remove();
    };
  }, []);

  // Input focus/blur handlers
  const handleInputFocus = () => {
    setIsInputFocused(true);
  };

  const handleInputBlur = () => {
    setIsInputFocused(false);
  };

  // Backdrop press handler
  const handleBackdropPress = () => {
    Keyboard.dismiss();
    handleInputBlur();
    onClose();
  };

  // Pan gesture responder for dragging
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (evt, gestureState) => {
      // Allow gestures on the entire header area and drag indicator
      return true;
    },
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      // Only start dragging if the movement is primarily vertical
      return Math.abs(gestureState.dy) > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
    },
    onPanResponderGrant: (evt, gestureState) => {
      // Dismiss keyboard when starting to drag
      if (isInputFocused) {
        Keyboard.dismiss();
      }
      // Add haptic feedback when starting to drag
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      translateY.setOffset(dragPosition);
      translateY.setValue(0);
    },
    onPanResponderMove: (evt, gestureState) => {
      lastGesture.current = { dy: gestureState.dy, vy: gestureState.vy };
      // Allow dragging up (negative) and down (positive)
      // Limit upward movement but allow more downward movement for closing
      const newY = Math.max(minTranslateY, Math.min(cardHeight, gestureState.dy));
      translateY.setValue(newY);
    },
    onPanResponderRelease: (evt, gestureState) => {
      translateY.flattenOffset();
      const { dy, vy } = lastGesture.current;
      
      // Auto-close if dragged down significantly or with high velocity
      if (dy > cardHeight * 0.25 || vy > 800) {
        // Add haptic feedback when closing
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        // Animate to close
        Animated.timing(translateY, {
          toValue: cardHeight,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          onClose();
        });
        return;
      }
      
      // Snap back to appropriate position based on drag distance
      let targetY = 0;
      if (dy > 100) {
        targetY = 80; // Slightly lowered position
      } else if (dy < -50) {
        targetY = -40; // Slightly raised position
      } else {
        targetY = 0; // Original position
      }
      
      setDragPosition(targetY);
      Animated.spring(translateY, {
        toValue: targetY,
        tension: 120,
        friction: 8,
        useNativeDriver: true,
      }).start();
    },
    onPanResponderTerminate: (evt, gestureState) => {
      // If gesture is terminated, snap back to original position
      translateY.flattenOffset();
      setDragPosition(0);
      Animated.spring(translateY, {
        toValue: 0,
        tension: 120,
        friction: 8,
        useNativeDriver: true,
      }).start();
    },
  });

  useEffect(() => {
    if (visible) {
      setDragPosition(0);
      translateY.setValue(cardHeight);
      inputContainerY.setValue(0);
      setIsInputFocused(false);
      
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          tension: 65,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Keyboard.dismiss();
      setIsInputFocused(false);
      
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: cardHeight,
          duration: 250,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(inputContainerY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return new Date(timestamp).toLocaleDateString();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none">
        <Animated.View style={[styles.commentBackdrop, { opacity: backdropOpacity }]}>
          <Pressable style={{ flex: 1 }} onPress={handleBackdropPress} />
          
          <Animated.View style={[
            styles.commentSheet,
            { transform: [{ translateY }] }
          ]}>
            <BlurView intensity={100} tint="dark" style={styles.commentBlur}>
                          <View style={styles.commentContent}>
              <View style={styles.dragIndicator} />
              
              <View style={styles.commentHeader} {...panResponder.panHandlers}>
                <Text style={styles.commentTitle}>Comments</Text>
                <Pressable onPress={onClose} style={styles.closeButton}>
                  <CustomIcon name="close" size={22} color="#FFFFFF" />
                </Pressable>
              </View>

                <ScrollView 
                  style={styles.commentsList}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.commentsListContent}
                  keyboardShouldPersistTaps="handled"
                >
                  {isLoading ? (
                    <ActivityIndicator size="large" color="#007AFF" style={styles.commentLoader} />
                  ) : comments.length === 0 ? (
                    <View style={styles.emptyComments}>
                      <CustomIcon name="chatbubble-outline" size={40} color="#8E8E93" />
                      <Text style={styles.emptyCommentsText}>No comments yet</Text>
                      <Text style={styles.emptyCommentsSubtext}>Be the first to comment</Text>
                    </View>
                  ) : (
                    comments.map((comment: any) => (
                      <View key={comment.id} style={styles.commentItem}>
                        <View style={styles.commentAvatar}>
                          <Text style={styles.commentAvatarText}>
                            {comment.author?.[1]?.toUpperCase() || '?'}
                          </Text>
                        </View>
                        <View style={styles.commentBody}>
                          <View style={styles.commentMeta}>
                            <Text style={styles.commentAuthor}>{comment.author}</Text>
                            <Text style={styles.commentTime}>{formatTime(comment.createdAt)}</Text>
                          </View>
                          <Text style={styles.commentText}>{comment.text}</Text>
                          <Pressable 
                            style={styles.commentLikeButton} 
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              onLikeComment(comment.id);
                            }}
                          >
                            <CustomIcon 
                              name={comment.liked ? "heart" : "heart-outline"} 
                              size={16} 
                              color={comment.liked ? "#FF3B30" : "#8E8E93"} 
                            />
                            {comment.likes > 0 && (
                              <Text style={[
                                styles.commentLikeCount,
                                comment.liked && styles.commentLikeCountActive
                              ]}>
                                {comment.likes}
                              </Text>
                            )}
                          </Pressable>
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>

                <Animated.View style={[
                  styles.commentInputBar,
                  { transform: [{ translateY: inputContainerY }] }
                ]}>
                  <BlurView intensity={80} tint="dark">
                    <View style={styles.commentInputContainer}>
                      <TextInput
                        placeholder="Add a comment..."
                        placeholderTextColor="#8E8E93"
                        value={commentText}
                        onChangeText={onCommentTextChange}
                        style={styles.commentInput}
                        multiline
                        maxLength={500}
                        onFocus={handleInputFocus}
                        onBlur={handleInputBlur}
                        blurOnSubmit={false}
                        returnKeyType="send"
                        onSubmitEditing={onSendComment}
                      />
                      <Pressable 
                        style={[
                          styles.sendButton,
                          !commentText.trim() && styles.sendButtonDisabled
                        ]}
                        onPress={onSendComment}
                        disabled={!commentText.trim()}
                      >
                        <CustomIcon 
                          name="send" 
                          size={20} 
                          color={commentText.trim() ? "#007AFF" : "#8E8E93"} 
                        />
                      </Pressable>
                    </View>
                  </BlurView>
                </Animated.View>
              </View>
            </BlurView>
          </Animated.View>
        </Animated.View>
    </Modal>
  );
}

// Helper Functions
function wrapHTML(innerHtml: string, muted: boolean) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      width: 100%;
      overflow: auto;
      background: #000000;
      -webkit-overflow-scrolling: touch;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      touch-action: manipulation;
    }
    * { 
      box-sizing: border-box;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
      -webkit-tap-highlight-color: transparent;
    }
    input, textarea {
      -webkit-user-select: text;
      -moz-user-select: text;
      -ms-user-select: text;
      user-select: text;
    }
  </style>
</head>
<body>
  ${innerHtml}
  ${muted ? '<script>document.querySelectorAll("audio").forEach(a => a.muted = true);</script>' : ''}
  <script>
    document.addEventListener('selectstart', function(e) {
      e.preventDefault();
      return false;
    });
    document.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      return false;
    });
    document.addEventListener('dragstart', function(e) {
      e.preventDefault();
      return false;
    });
  </script>
</body>
</html>`;
}

function formatCount(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

// Styles
const styles = StyleSheet.create({
  // Container
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },

  // Loading More Indicator
  loadingMoreContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingProgressContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  progressBar: {
    width: 200,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    marginTop: 16,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
  loadingMoreText: {
    color: '#8E8E93',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  loadingProgressText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },

  // Bounce Loader
  bounceLoaderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  bounceLoaderContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 16,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  bounceLoaderIcon: {
    marginBottom: 16,
  },
  bounceLoaderText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  bounceLoaderSubtext: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  emptyContent: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: 'rgba(28, 28, 30, 0.6)',
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  emptyIconContainer: {
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#8E8E93',
    fontSize: 15,
    textAlign: 'center',
  },
  emptyLoader: {
    marginTop: 24,
  },
  emptyLoaderContainer: {
    alignItems: 'center',
    marginTop: 24,
  },
  emptyProgressContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  emptyProgressBar: {
    width: 200,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    marginBottom: 8,
    overflow: 'hidden',
  },
  emptyProgressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
  emptyProgressText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '600',
  },

  // Game Card
  gameCard: {
    backgroundColor: '#000000',
    position: 'relative',
  },

  // Header
  header: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 44 : 24,
    left: 16,
    right: 16,
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    zIndex: 10,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(28, 28, 30, 0.6)',
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  headerAuthor: {
    color: '#8E8E93',
    fontSize: 13,
    lineHeight: 18,
  },
  moreButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Playing Header
  playingHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 44 : 24,
    left: 16,
    right: 16,
    height: 48,
    borderRadius: 16,
    overflow: 'hidden',
    zIndex: 10,
  },
  playingHeaderContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    backgroundColor: 'rgba(28, 28, 30, 0.8)',
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playingInfo: {
    flex: 1,
    paddingHorizontal: 8,
  },
  playingTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  muteButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Game Content
  gameContent: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 108 : 88,
    paddingBottom: 80,
    paddingHorizontal: 16,
  },
  webviewContainer: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000000',
  },

  // Action Bar
  actionBar: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    zIndex: 10,
  },
  actionBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(28, 28, 30, 0.8)',
    borderRadius: 28,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionButton: {
    minWidth: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  actionCount: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  actionCountActive: {
    color: '#FF3B30',
  },
  spacer: {
    flex: 1,
  },

  // Play Overlay
  playOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  playButtonArea: {
    alignItems: 'center',
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  durationBadge: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(28, 28, 30, 0.8)',
    borderRadius: 12,
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // Result Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  resultSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  resultContent: {
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 32,
    backgroundColor: 'rgba(28, 28, 30, 0.9)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  dragIndicator: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  resultTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 24,
  },
  scoreRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  scoreCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  scoreLabel: {
    color: '#8E8E93',
    fontSize: 13,
    marginBottom: 4,
    fontWeight: '500',
  },
  scoreValue: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
  },
  resultActions: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  buttonBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    overflow: 'hidden',
  },
  primaryButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },

  // Comments Modal
  commentBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  commentSheet: {
    height: '70%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  commentBlur: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  commentContent: {
    flex: 1,
    backgroundColor: 'rgba(28, 28, 30, 0.9)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  commentTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentsList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  commentsListContent: {
    paddingBottom: 20,
  },
  commentLoader: {
    marginTop: 40,
  },
  emptyComments: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyCommentsText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyCommentsSubtext: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 4,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  commentBody: {
    flex: 1,
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  commentAuthor: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  commentTime: {
    color: '#8E8E93',
    fontSize: 12,
  },
  commentText: {
    color: '#E5E7EB',
    fontSize: 15,
    lineHeight: 20,
  },
  commentLikeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  commentLikeCount: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
  },
  commentLikeCountActive: {
    color: '#FF3B30',
  },
  commentInputBar: {
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(28, 28, 30, 0.6)',
  },
  commentInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 15,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sendButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
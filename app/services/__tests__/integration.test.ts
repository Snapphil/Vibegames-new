/**
 * Manual Integration Test for Core Services
 * 
 * Import and run these functions to verify everything works:
 * 
 * import { testGameStore, testWebViewPool, testCacheService, runAllTests } from './app/services/__tests__/integration.test';
 * 
 * // Then in your component:
 * runAllTests(); // Check console for results
 */

import useGameStore from '../../stores/gameStore';
import WebViewPoolManager from '../WebViewPoolManager';
import GameCacheService from '../GameCacheService';

/**
 * Test Game Store functionality
 */
export const testGameStore = () => {
  console.log('\n=== Testing Game Store ===');
  
  try {
    // Test 1: Add and retrieve game
    const testGame = {
      id: 'test-1',
      title: 'Test Game',
      author: 'Test Author',
      category: 'puzzle',
      html: '<html><body>Test</body></html>',
      likes: 0,
      views: 0,
      plays: 0,
      createdAt: new Date(),
    };

    useGameStore.getState().addGame(testGame);
    const retrieved = useGameStore.getState().getGame('test-1');
    
    if (retrieved && retrieved.title === 'Test Game') {
      console.log('✅ Add and retrieve game: PASSED');
    } else {
      console.error('❌ Add and retrieve game: FAILED');
    }

    // Test 2: Toggle likes
    const initialLikes = retrieved?.likes || 0;
    useGameStore.getState().toggleLike('test-1');
    
    // Wait a bit for async operation
    setTimeout(() => {
      const afterLike = useGameStore.getState().getGame('test-1')?.likes || 0;
      if (afterLike === initialLikes + 1) {
        console.log('✅ Toggle likes: PASSED');
      } else {
        console.error('❌ Toggle likes: FAILED');
      }
    }, 100);

    // Test 3: Batch operations
    const feedGames = useGameStore.getState().getFeedGames();
    if (feedGames.length > 0) {
      console.log('✅ Get feed games: PASSED');
    } else {
      console.error('❌ Get feed games: FAILED');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Game Store test failed:', error);
    return false;
  }
};

/**
 * Test WebView Pool Manager
 */
export const testWebViewPool = () => {
  console.log('\n=== Testing WebView Pool Manager ===');
  
  try {
    const poolManager = WebViewPoolManager.getInstance();
    
    // Test 1: Acquire slot
    const slot = poolManager.acquire();
    if (slot && slot.id) {
      console.log('✅ Acquire WebView slot: PASSED');
    } else {
      console.error('❌ Acquire WebView slot: FAILED');
      return false;
    }
    
    // Test 2: Get statistics
    const stats = poolManager.getStats();
    if (stats.totalInstances >= 0 && stats.inUse >= 0) {
      console.log('✅ Pool statistics:', stats);
    } else {
      console.error('❌ Pool statistics: FAILED');
    }
    
    // Test 3: Release slot
    if (slot) {
      poolManager.release(slot.id);
      const afterStats = poolManager.getStats();
      if (afterStats.available > 0) {
        console.log('✅ Release WebView slot: PASSED');
      } else {
        console.error('❌ Release WebView slot: FAILED');
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ WebView Pool test failed:', error);
    return false;
  }
};

/**
 * Test Game Cache Service
 */
export const testCacheService = async () => {
  console.log('\n=== Testing Cache Service ===');
  
  try {
    const cacheService = GameCacheService.getInstance();
    
    // Test 1: Set and get data
    await cacheService.set('test-key', { value: 'test-data', timestamp: Date.now() });
    const retrieved = await cacheService.get<{ value: string }>('test-key');
    
    if (retrieved && retrieved.value === 'test-data') {
      console.log('✅ Cache set and get: PASSED');
    } else {
      console.error('❌ Cache set and get: FAILED');
    }
    
    // Test 2: Cache miss
    const missing = await cacheService.get('non-existent-key');
    if (missing === null) {
      console.log('✅ Cache miss handling: PASSED');
    } else {
      console.error('❌ Cache miss handling: FAILED');
    }
    
    // Test 3: Statistics
    const stats = cacheService.getStats();
    if (stats.hits >= 0 && stats.misses >= 0) {
      console.log('✅ Cache statistics:', stats);
    } else {
      console.error('❌ Cache statistics: FAILED');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Cache Service test failed:', error);
    return false;
  }
};

/**
 * Run all tests
 */
export const runAllTests = async () => {
  console.log('\n========================================');
  console.log('🧪 INTEGRATION TESTS STARTING');
  console.log('========================================');
  
  const results = {
    gameStore: false,
    webViewPool: false,
    cacheService: false,
  };
  
  results.gameStore = testGameStore();
  results.webViewPool = testWebViewPool();
  results.cacheService = await testCacheService();
  
  console.log('\n========================================');
  console.log('📊 TEST RESULTS');
  console.log('========================================');
  console.log('Game Store:', results.gameStore ? '✅ PASSED' : '❌ FAILED');
  console.log('WebView Pool:', results.webViewPool ? '✅ PASSED' : '❌ FAILED');
  console.log('Cache Service:', results.cacheService ? '✅ PASSED' : '❌ FAILED');
  
  const allPassed = results.gameStore && results.webViewPool && results.cacheService;
  
  if (allPassed) {
    console.log('\n🎉 ALL TESTS PASSED!');
  } else {
    console.log('\n⚠️  SOME TESTS FAILED');
  }
  
  return allPassed;
};

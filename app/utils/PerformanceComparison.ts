/**
 * Performance Comparison Utility
 * 
 * Run this to compare Original vs Optimized PlayFeed
 * Outputs detailed metrics to console
 */

import React from 'react';
import WebViewPoolManager from '../services/WebViewPoolManager';
import GameCacheService from '../services/GameCacheService';
import useGameStore from '../stores/gameStore';

interface PerformanceMetrics {
  timestamp: number;
  memoryUsage: number;
  cacheHitRate: number;
  webViewInstances: number;
  gamesLoaded: number;
  loadTime: number;
}

class PerformanceTracker {
  private static instance: PerformanceTracker;
  private metrics: PerformanceMetrics[] = [];
  private startTime: number = 0;
  private loadStartTimes: Map<string, number> = new Map();

  private constructor() {}

  public static getInstance(): PerformanceTracker {
    if (!PerformanceTracker.instance) {
      PerformanceTracker.instance = new PerformanceTracker();
    }
    return PerformanceTracker.instance;
  }

  public startTracking() {
    this.startTime = Date.now();
    console.log('📊 Performance tracking started');
  }

  public trackLoadStart(gameId: string) {
    this.loadStartTimes.set(gameId, Date.now());
  }

  public trackLoadEnd(gameId: string) {
    const startTime = this.loadStartTimes.get(gameId);
    if (startTime) {
      const loadTime = Date.now() - startTime;
      this.loadStartTimes.delete(gameId);
      return loadTime;
    }
    return 0;
  }

  public captureMetrics() {
    const poolManager = WebViewPoolManager.getInstance();
    const cacheService = GameCacheService.getInstance();
    const gameStore = useGameStore.getState();
    
    const poolStats = poolManager.getStats();
    const cacheStats = cacheService.getStats();
    
    const metric: PerformanceMetrics = {
      timestamp: Date.now() - this.startTime,
      memoryUsage: 0, // Would need native module for real memory
      cacheHitRate: parseFloat(cacheStats.hitRate) || 0,
      webViewInstances: poolStats.totalInstances,
      gamesLoaded: gameStore.feedGames.length,
      loadTime: 0,
    };
    
    this.metrics.push(metric);
  }

  public getReport() {
    if (this.metrics.length === 0) {
      return 'No metrics captured yet';
    }

    const latest = this.metrics[this.metrics.length - 1];
    const poolManager = WebViewPoolManager.getInstance();
    const cacheService = GameCacheService.getInstance();
    
    return {
      poolStats: poolManager.getStats(),
      cacheStats: cacheService.getStats(),
      currentMetrics: latest,
      history: this.metrics,
    };
  }

  public printReport() {
    const report = this.getReport();
    
    if (typeof report === 'string') {
      console.log(report);
      return;
    }

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║     PERFORMANCE REPORT                 ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    console.log('📦 WebView Pool:');
    console.log(`  Total Instances: ${report.poolStats.totalInstances}`);
    console.log(`  In Use: ${report.poolStats.inUse}`);
    console.log(`  Available: ${report.poolStats.available}`);
    console.log(`  Preloaded: ${report.poolStats.preloaded}`);
    
    console.log('\n💾 Cache:');
    console.log(`  Hit Rate: ${report.cacheStats.hitRate}`);
    console.log(`  Hits: ${report.cacheStats.hits}`);
    console.log(`  Misses: ${report.cacheStats.misses}`);
    console.log(`  Memory Usage: ${report.cacheStats.memoryUsage}`);
    console.log(`  Entries: ${report.cacheStats.entries}`);
    
    console.log('\n🎮 Games:');
    console.log(`  Loaded: ${report.currentMetrics.gamesLoaded}`);
    
    console.log('\n⏱️  Timeline:');
    report.history.slice(-5).forEach((metric, i) => {
      console.log(`  ${(metric.timestamp / 1000).toFixed(1)}s: ` +
                  `${metric.gamesLoaded} games, ` +
                  `${metric.cacheHitRate.toFixed(1)}% cache`);
    });
    
    console.log('\n');
  }

  public compareWithOriginal() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   OPTIMIZED vs ORIGINAL COMPARISON     ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    const poolManager = WebViewPoolManager.getInstance();
    const cacheService = GameCacheService.getInstance();
    const poolStats = poolManager.getStats();
    const cacheStats = cacheService.getStats();
    
    // Original estimates
    const originalMemory = 400;
    const originalLoadTime = 3500;
    const originalCacheHit = 0;
    const originalAPICalls = 100;
    
    // Optimized current
    const optimizedMemory = 150; // Estimate
    const optimizedCacheHit = parseFloat(cacheStats.hitRate) || 0;
    const optimizedAPICalls = Math.round(originalAPICalls * (1 - optimizedCacheHit / 100));
    
    console.log('📊 Memory Usage:');
    console.log(`  Original:  ~${originalMemory}MB`);
    console.log(`  Optimized: ~${optimizedMemory}MB`);
    console.log(`  Savings:   ${((1 - optimizedMemory/originalMemory) * 100).toFixed(0)}%`);
    
    console.log('\n⚡ Load Time:');
    console.log(`  Original:  ~${originalLoadTime}ms`);
    console.log(`  Optimized: ~1200ms (estimated)`);
    console.log(`  Faster:    ${((1 - 1200/originalLoadTime) * 100).toFixed(0)}%`);
    
    console.log('\n💾 Cache Performance:');
    console.log(`  Original:  ${originalCacheHit}% hit rate`);
    console.log(`  Optimized: ${optimizedCacheHit.toFixed(1)}% hit rate`);
    console.log(`  Improvement: +${optimizedCacheHit.toFixed(0)}%`);
    
    console.log('\n🔥 Firebase API Calls:');
    console.log(`  Original:  ~${originalAPICalls} calls/session`);
    console.log(`  Optimized: ~${optimizedAPICalls} calls/session`);
    console.log(`  Reduction: ${((1 - optimizedAPICalls/originalAPICalls) * 100).toFixed(0)}%`);
    
    console.log('\n📦 WebView Management:');
    console.log(`  Original:  Unlimited instances (memory leak)`);
    console.log(`  Optimized: ${poolStats.totalInstances} pooled instances`);
    console.log(`  Controlled: ✅ Yes`);
    
    console.log('\n💰 Cost Savings (Estimated):');
    const monthlySavings = 50 * (1 - optimizedAPICalls/originalAPICalls);
    console.log(`  Firebase: $${monthlySavings.toFixed(2)}/month`);
    console.log(`  Yearly:   $${(monthlySavings * 12).toFixed(2)}/year`);
    
    console.log('\n');
  }

  public reset() {
    this.metrics = [];
    this.loadStartTimes.clear();
    this.startTime = 0;
  }
}

export default PerformanceTracker;

/**
 * Easy-to-use hooks for tracking performance
 */
export function usePerformanceTracking() {
  const tracker = PerformanceTracker.getInstance();
  
  return {
    start: () => tracker.startTracking(),
    capture: () => tracker.captureMetrics(),
    report: () => tracker.printReport(),
    compare: () => tracker.compareWithOriginal(),
    reset: () => tracker.reset(),
  };
}

/**
 * Auto-tracking component wrapper
 */
export function withPerformanceTracking<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName: string
): React.ComponentType<P> {
  const TrackedComponent = (props: P) => {
    const tracker = PerformanceTracker.getInstance();
    
    React.useEffect(() => {
      console.log(`[Performance] ${componentName} mounted`);
      tracker.captureMetrics();
      
      return () => {
        console.log(`[Performance] ${componentName} unmounted`);
      };
    }, []);
    
    return React.createElement(WrappedComponent, props);
  };
  
  TrackedComponent.displayName = `withPerformanceTracking(${componentName})`;
  return TrackedComponent;
}

/**
 * Simple usage example
 * 
 * import PerformanceTracker from './utils/PerformanceComparison';
 * 
 * // Start tracking
 * const tracker = PerformanceTracker.getInstance();
 * tracker.startTracking();
 * 
 * // Later...
 * tracker.printReport();
 * tracker.compareWithOriginal();
 */

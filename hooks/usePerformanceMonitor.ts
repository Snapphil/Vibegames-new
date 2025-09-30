import { useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';

interface PerformanceMetrics {
  fps: number;
  memoryUsage: {
    used: number;
    total: number;
    limit: number;
  } | null;
  loadTime: number;
}

export function usePerformanceMonitor(
  onMetrics?: (metrics: PerformanceMetrics) => void,
  interval: number = 5000
) {
  const frameCount = useRef(0);
  const lastFrameTime = useRef(performance.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const measurePerformance = useCallback(() => {
    frameCount.current++;
    const now = performance.now();
    const fps = 1000 / (now - lastFrameTime.current);

    if (frameCount.current % (60 * (interval / 1000)) === 0) { // Report based on interval
      const memory = (performance as any).memory;
      const metrics: PerformanceMetrics = {
        fps: Math.round(fps),
        memoryUsage: memory ? {
          used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
          limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024)
        } : null,
        loadTime: Math.round(now - performance.now())
      };

      console.log(`Performance Metrics (${Platform.OS}):`, metrics);
      onMetrics?.(metrics);
    }

    lastFrameTime.current = now;
    requestAnimationFrame(measurePerformance);
  }, [onMetrics, interval]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Start performance monitoring
      requestAnimationFrame(measurePerformance);

      // Set up interval for periodic reporting
      intervalRef.current = setInterval(() => {
        // Trigger metrics collection
        measurePerformance();
      }, interval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [measurePerformance, interval]);

  return {
    measurePerformance,
    getCurrentFPS: () => {
      const now = performance.now();
      return 1000 / (now - lastFrameTime.current);
    }
  };
}

export default usePerformanceMonitor;

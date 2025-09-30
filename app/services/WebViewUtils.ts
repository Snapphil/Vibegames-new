// WebView utility functions for error monitoring and configuration
import { Platform } from 'react-native';
import type { WebViewProps } from 'react-native-webview';

export const getGameErrorMonitoringScript = () => `
  const originalConsoleError = console.error;
  console.error = function(...args) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'console.error',
      message: args.join(' ')
    }));
    originalConsoleError.apply(console, args);
  };

  window.onerror = function(message, source, lineno, colno, error) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'runtime-error',
      message: message,
      source: source,
      line: lineno,
      stack: error ? error.stack : 'No stack trace available'
    }));
    return false;
  };

  window.addEventListener('unhandledrejection', function(event) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'runtime-error',
      message: 'Unhandled Promise Rejection: ' + (event.reason ? event.reason.toString() : 'Unknown reason'),
      stack: event.reason && event.reason.stack ? event.reason.stack : 'No stack trace available'
    }));
  });

  true;
`;

// 🚀 PERFORMANCE: Optimized WebView configuration
export const getWebViewConfig = (): Partial<WebViewProps> => {
  const baseConfig: Partial<WebViewProps> = {
    javaScriptEnabled: true,
    domStorageEnabled: true,
    allowsInlineMediaPlayback: true,
    mediaPlaybackRequiresUserAction: false,
    mixedContentMode: 'always',
    allowFileAccess: true,
    allowUniversalAccessFromFileURLs: true,
    allowFileAccessFromFileURLs: true,
    webviewDebuggingEnabled: false, // 🚀 Disable in production for performance
    cacheEnabled: true,
    allowsFullscreenVideo: true,
    allowsLinkPreview: false,
    allowsBackForwardNavigationGestures: false,
    allowsAirPlayForMediaPlayback: true,
    nestedScrollEnabled: false,
    setBuiltInZoomControls: false,
    setDisplayZoomControls: false,
    thirdPartyCookiesEnabled: false, // 🚀 Reduce overhead
    saveFormDataDisabled: true,
    originWhitelist: ['*'],
    scrollEnabled: false,
    bounces: false,
    showsVerticalScrollIndicator: false,
    showsHorizontalScrollIndicator: false,
  } as const;

  // Platform-specific optimizations
  if (Platform.OS === 'android') {
    const { contentInsetAdjustmentBehavior, automaticallyAdjustContentInsets, ...androidConfig } = baseConfig;
    return {
      ...androidConfig,
      cacheMode: 'LOAD_CACHE_ELSE_NETWORK',
      overScrollMode: 'never',
      setSupportMultipleWindows: false,
      javaScriptCanOpenWindowsAutomatically: false,
      // 🚀 PERFORMANCE: Reduce memory usage
      androidLayerType: 'hardware',
    };
  }

  if (Platform.OS === 'web') {
    return {
      ...baseConfig,
      cacheMode: 'LOAD_DEFAULT',
      contentInsetAdjustmentBehavior: 'never',
      automaticallyAdjustContentInsets: false,
    };
  }

  const { setBuiltInZoomControls, setDisplayZoomControls, ...iosConfig } = baseConfig;
  return iosConfig;
};

// 🚀 PERFORMANCE OPTIMIZATION: Lighter WebView monitoring
export const getPerformanceMonitoringScript = () => `
  // 🚀 OPTIMIZED: Less frequent performance monitoring
  const perfStart = performance.now();
  let frameCount = 0;
  let lastFrameTime = performance.now();
  let lastReportTime = performance.now();

  function monitorPerformance() {
    frameCount++;
    const now = performance.now();
    
    // 🚀 PERFORMANCE: Only report every 5 seconds instead of every 60 frames
    if (now - lastReportTime > 5000) {
      const fps = frameCount * 1000 / (now - lastReportTime);
      const memory = (performance as any).memory;
      
      // 🚀 PERFORMANCE: Only send data if there are performance issues
      if (fps < 30 || (memory && memory.usedJSHeapSize > 50 * 1024 * 1024)) {
        window.ReactNativeWebView?.postMessage(JSON.stringify({
          type: 'performance',
          fps: Math.round(fps),
          memoryUsage: memory ? {
            used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
            total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
            limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024)
          } : null,
          loadTime: Math.round(now - perfStart)
        }));
      }
      
      frameCount = 0;
      lastReportTime = now;
    }

    lastFrameTime = now;
    requestAnimationFrame(monitorPerformance);
  }

  // Start monitoring after game loads
  setTimeout(() => {
    requestAnimationFrame(monitorPerformance);
  }, 2000);

  true;
`;

// WebView message handler for error monitoring
export const createWebViewMessageHandler = (onError?: (error: string) => void) => (event: any) => {
  try {
    const data = JSON.parse(event.nativeEvent.data);
    console.log('WebView message:', data);

    switch (data.type) {
      case 'error':
      case 'console.error':
      case 'runtime-error':
      case 'syntax-error':
      case 'network-error':
        console.error('WebView Error:', data.message, data);
        if (onError) onError(`${data.type}: ${data.message}`);
        break;
      case 'game-ready':
        console.log('Game Ready:', data.message);
        break;
      default:
        console.log('Other WebView message:', data);
    }
  } catch (parseError) {
    console.log('WebView message (non-JSON):', event.nativeEvent.data);
  }
};


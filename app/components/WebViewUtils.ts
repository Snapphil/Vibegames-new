// WebView utility functions for error monitoring and configuration

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

// WebView configuration for games
export const getWebViewConfig = () => ({
  javaScriptEnabled: true,
  domStorageEnabled: true,
  allowsInlineMediaPlayback: true,
  mediaPlaybackRequiresUserAction: false,
  mixedContentMode: 'always' as const,
  hardwareAccelerationDisabled: false,
  allowFileAccess: true,
  allowUniversalAccessFromFileURLs: true,
  allowFileAccessFromFileURLs: true,
  webviewDebuggingEnabled: __DEV__,
  cacheEnabled: true,
  cacheMode: 'LOAD_DEFAULT' as const,
  allowsFullscreenVideo: true,
  allowsLinkPreview: false,
  allowsBackForwardNavigationGestures: false,
  allowsAirPlayForMediaPlayback: true,
  nestedScrollEnabled: false,
  setBuiltInZoomControls: false,
  setDisplayZoomControls: false,
  thirdPartyCookiesEnabled: true,
  saveFormDataDisabled: true,
  originWhitelist: ['*', 'data:*', 'blob:*'],
});

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


import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ActivityIndicator,
  Modal,
  Animated,
  ScrollView,
  Keyboard,
  Alert,
  Easing,
} from "react-native";
import { CustomIcon } from "../../components/ui/CustomIcon";
import { WebView } from "react-native-webview";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { GenerationActions, useGeneration } from "./components/GenerationState";
import { GameStorage } from "./GameStorage";
import SimpleGameService from "../services/SimpleGameService";
import AppConfigService from "../services/AppConfigService";
import { useAuth } from "../auth/AuthProvider";
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");

// WebView configuration helper for Three.js/WebGL support
const getWebViewConfig = () => ({
  // Core settings
  javaScriptEnabled: true,
  domStorageEnabled: true,
  
  // WebGL/Three.js support
  allowsInlineMediaPlayback: true,
  mediaPlaybackRequiresUserAction: false,
  mixedContentMode: 'always' as const,
  
  // Hardware acceleration (Android)
  hardwareAccelerationDisabled: false,
  
  // File access for textures/assets
  allowFileAccess: true,
  allowUniversalAccessFromFileURLs: true,
  allowFileAccessFromFileURLs: true,
  
  // Debugging
  webviewDebuggingEnabled: __DEV__,
  
  // Performance
  cacheEnabled: true,
  cacheMode: 'LOAD_DEFAULT' as const,
  
  // iOS specific
  allowsFullscreenVideo: true,
  allowsLinkPreview: false,
  allowsBackForwardNavigationGestures: false,
  allowsAirPlayForMediaPlayback: true,
  
  // Android specific
  nestedScrollEnabled: false,
  setBuiltInZoomControls: false,
  setDisplayZoomControls: false,
  thirdPartyCookiesEnabled: true,
  saveFormDataDisabled: true,
  
  // Data URI support
  originWhitelist: ['*', 'data:*', 'blob:*'],
});

// Three.js game validator
function validateThreeJsContent(html: string) {
  const hasThreeJs = html.includes('three.js') || 
                     html.includes('THREE') || 
                     html.includes('WebGLRenderer');
  
  const hasCanvas = html.includes('<canvas') || 
                    html.includes('document.createElement("canvas")') ||
                    html.includes("document.createElement('canvas')");
  
  const hasWebGLCheck = html.includes('WebGL') || 
                        html.includes('webgl');
  
  return {
    isThreeJsGame: hasThreeJs,
    hasCanvas: hasCanvas,
    hasWebGLCheck: hasWebGLCheck,
    isValid: hasThreeJs && hasCanvas
  };
}

// Enhanced WebView message handler with detailed error collection
const createWebViewMessageHandler = (
  onError?: (error: string) => void,
  onWarning?: (warning: string) => void,
  onDebug?: (debug: string) => void
) => (event: any) => {
  try {
    const data = JSON.parse(event.nativeEvent.data);
    console.log('📱 WebView message:', data);

    switch (data.type) {
      case 'error':
        console.error('🚨 WebView Error:', data.message, data);
        if (onError) onError(`WebView Error: ${data.message}${data.source ? ` (${data.source})` : ''}`);
        break;
      case 'console.error':
        console.error('🚨 Console Error:', data.message, data);
        if (onError) onError(`Console Error: ${data.message}${data.stack ? `\nStack: ${data.stack}` : ''}`);
        break;
      case 'console.warn':
        console.warn('⚠️ Console Warning:', data.message, data);
        if (onWarning) onWarning(`Console Warning: ${data.message}`);
        break;
      case 'runtime-error':
        console.error('💥 Runtime Error:', data.message, data);
        if (onError) onError(`Runtime Error: ${data.message}${data.stack ? `\nStack: ${data.stack}` : ''}${data.source ? `\nSource: ${data.source}` : ''}${data.line ? `\nLine: ${data.line}` : ''}`);
        break;
      case 'syntax-error':
        console.error('🔧 Syntax Error:', data.message, data);
        if (onError) onError(`Syntax Error: ${data.message}${data.line ? ` at line ${data.line}` : ''}${data.source ? ` in ${data.source}` : ''}`);
        break;
      case 'network-error':
        console.error('🌐 Network Error:', data.message, data);
        if (onError) onError(`Network Error: ${data.message}${data.element ? ` (${data.element})` : ''}`);
        break;
      case 'three-js-ready':
        console.log('🎮 Three.js Ready:', data.message);
        if (onDebug) onDebug(`Three.js initialized successfully`);
        break;
      case 'game-ready':
        console.log('🎯 Game Ready:', data.message);
        if (onDebug) onDebug(`Game loaded and ready to play`);
        break;
      case 'debug-info':
        console.log('🔍 Debug Info:', data.message);
        if (onDebug) onDebug(`Debug: ${data.message}`);
        break;
      default:
        console.log('📝 Other WebView message:', data);
    }
  } catch (parseError) {
    console.log('❓ WebView message (non-JSON):', event.nativeEvent.data);
    // Try to extract useful information from non-JSON messages
    if (event.nativeEvent.data.includes('error') || event.nativeEvent.data.includes('Error')) {
      if (onError) onError(`WebView Error: ${event.nativeEvent.data}`);
    }
  }
};

// WebView error handlers
const handleWebViewError = (syntheticEvent: any) => {
  const { nativeEvent } = syntheticEvent;
  console.error('ERROR IN GENERATED CODE: WebView load error:', nativeEvent);
};

const handleWebViewHttpError = (syntheticEvent: any) => {
  const { nativeEvent } = syntheticEvent;
  console.error('ERROR IN GENERATED CODE: WebView HTTP error:', nativeEvent);
};

const handleWebViewRenderProcessGone = (syntheticEvent: any) => {
  const { nativeEvent } = syntheticEvent;
  console.error('ERROR IN GENERATED CODE: WebView render process gone:', nativeEvent);
};

// Shared injected JavaScript for game error monitoring
export const getGameErrorMonitoringScript = () => `
  // Override console methods for comprehensive debugging
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalConsoleLog = console.log;
  
  console.error = function(...args) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'console.error',
      message: args.join(' ')
    }));
    originalConsoleError.apply(console, args);
  };
  
  console.warn = function(...args) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'console.warn',
      message: args.join(' ')
    }));
    originalConsoleWarn.apply(console, args);
  };
  
  // Global error handler for uncaught exceptions
  window.onerror = function(message, source, lineno, colno, error) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'runtime-error',
      message: message,
      source: source,
      line: lineno,
      column: colno,
      stack: error ? error.stack : 'No stack trace available'
    }));
    return false; // Let the default handler run too
  };
  
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'runtime-error',
      message: 'Unhandled Promise Rejection: ' + (event.reason ? event.reason.toString() : 'Unknown reason'),
      stack: event.reason && event.reason.stack ? event.reason.stack : 'No stack trace available'
    }));
  });
  
  // Handle resource loading errors
  window.addEventListener('error', function(event) {
    if (event.target !== window) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'network-error',
        message: 'Failed to load resource: ' + (event.target.src || event.target.href || 'unknown resource'),
        element: event.target.tagName || 'unknown'
      }));
    }
  }, true);
  
  // Syntax error detection (for dynamically executed code)
  const originalEval = window.eval;
  window.eval = function(code) {
    try {
      return originalEval.call(this, code);
    } catch (error) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'syntax-error',
        message: error.message,
        line: error.lineNumber || 'unknown',
        stack: error.stack || 'No stack trace available'
      }));
      throw error;
    }
  };
`;

// Injected JavaScript for Three.js support
const getThreeJsInjectedJavaScript = () => `
  // Ensure WebGL is available
  if (!window.WebGLRenderingContext) {
    console.error('WebGL not supported');
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'error',
      message: 'WebGL not supported'
    }));
  }
  
  // Fix for data URI audio issues
  (function() {
    const originalAudio = window.Audio;
    window.Audio = function(src) {
      try {
        if (src && typeof src === 'string' && src.startsWith('data:audio')) {
          // Validate base64 audio data
          const base64Part = src.split(',')[1];
          if (!base64Part || base64Part.length < 50) {
            console.warn('Invalid audio data URI detected, using silent audio');
            // Use a valid silent audio file instead
            src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAAA=';
          }
        }
        return new originalAudio(src);
      } catch (e) {
        console.warn('Audio creation failed:', e);
        return new originalAudio();
      }
    };
    
    // Patch createElement for audio elements
    const originalCreateElement = document.createElement;
    document.createElement = function(tagName) {
      const element = originalCreateElement.call(document, tagName);
      if (tagName.toLowerCase() === 'audio') {
        const originalSetAttribute = element.setAttribute;
        element.setAttribute = function(name, value) {
          if (name === 'src' && value && value.startsWith('data:audio')) {
            const base64Part = value.split(',')[1];
            if (!base64Part || base64Part.length < 50) {
              console.warn('Invalid audio data URI in element, using silent audio');
              value = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAAA=';
            }
          }
          originalSetAttribute.call(this, name, value);
        };
      }
      return element;
    };
  })();
  
  ${getGameErrorMonitoringScript()}
  
  true; // Required for injectedJavaScript
`;

// Background task management for continuous game generation
const BACKGROUND_TASK_NAME = 'game-generation-task';

// Types
interface GameVersion {
  html: string;
  prompt: string;
  timestamp: number;
  status: 'generating' | 'success' | 'error';
  error?: string;
}

interface GenerationSession {
  initialPrompt: string;
  option1: GameVersion | null;
  option2: GameVersion | null;
  selectedOption: 1 | 2 | null;
  versions: GameVersion[];
  currentVersionIndex: number;
}

// Register background task
TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  try {
    const ongoingGeneration = await GameStorage.getOngoingGeneration();
    if (ongoingGeneration && ongoingGeneration.status === 'generating') {
      const result = await continueGameGeneration(ongoingGeneration);
      if (result) {
        await GameStorage.updateGenerationStatus(ongoingGeneration.id, 'completed', result);
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }
    }
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    console.error('Background task error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Function to continue game generation in background
async function continueGameGeneration(generation: any): Promise<string | null> {
  try {
    const appConfigService = AppConfigService.getInstance();
    const config = await appConfigService.getConfig();
    
    const apiKey = config.api_key_gpt || 
      (typeof process !== "undefined" &&
        (process as any).env &&
        (((process as any).env.EXPO_PUBLIC_OPENAI_API_KEY as string) || (process as any).env.OPENAI_API_KEY)) ||
      "";

    if (!apiKey) {
      throw new Error("Missing OpenAI API key");
    }

    const systemPrompt = await appConfigService.getSystemPrompt();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model_name,
        messages: [
          {
            role: "developer",
            content: [
              {
                type: "text",
                text: systemPrompt,
              },
            ],
          },
          ...(generation.currentHtml && [{
            role: "developer",
            content: [
              {
                type: "text",
                text: `Iterative mode:
Apply the user's new instructions as a minimal, targeted change to the provided CURRENT_HTML. Preserve the current structure, controls and logic unless asked to replace them.
Maintain all constraints from the base prompt.
Return a strict JSON object with "html": "<full updated document>". No extra keys or explanations.`,
              },
              {
                type: "text",
                text: `CURRENT_HTML_START\n${generation.currentHtml}\nCURRENT_HTML_END`,
              },
            ],
          }]),
          {
            role: "user",
            content: [{ type: "text", text: generation.prompt }],
          },
        ],
        response_format: {
          type: 'text'
        },
        verbosity: config.verbosity,
        reasoning_effort: config.reasoning_effort,
        stream: false
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("No content received from the API");
    }

    try {
      const obj = parseFirstJsonObject(content);
      if (obj && typeof obj.html === "string") {
        const finalHtml = finalizeHtmlString(obj.html);
        return finalHtml;
      }

      const htmlBlock = extractHtmlBlock(content);
      if (htmlBlock) {
        return htmlBlock;
      }

      return content;
    } catch (error) {
      console.warn('Error processing API response:', error);
      return content;
    }
  } catch (error) {
    console.error('Background generation failed:', error);
    await GameStorage.updateGenerationStatus(generation.id, 'failed', undefined, error instanceof Error ? error.message : String(error));
    return null;
  }
}

interface GameCreatorProps {
  onGamePublished?: (game: any) => void;
}

export default function GameCreator({ onGamePublished }: GameCreatorProps = {}) {
  const { user } = useAuth();
  const { state: genState } = useGeneration();
  const insets = useSafeAreaInsets();

  // Core state
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationSession, setGenerationSession] = useState<GenerationSession | null>(null);
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  // Publishing state
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [gameName, setGameName] = useState("");
  const [gameDescription, setGameDescription] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  // Streaming state
  const [showStreamingWindow, setShowStreamingWindow] = useState(false);
  const [streamingTexts, setStreamingTexts] = useState<{ [key: string]: string }>({});
  const streamingScrollRefs = useRef<{ [key: string]: ScrollView | null }>({});

  // Advanced streaming state
  const [streamingStatus, setStreamingStatus] = useState<{ [key: string]: 'connecting' | 'streaming' | 'waiting' | 'timeout' | 'error' }>({});

  // 2-stage generation state
  const [currentGenerationStage, setCurrentGenerationStage] = useState<'initial' | 'optimization' | 'complete'>('initial');
  const [generationErrors, setGenerationErrors] = useState<string[]>([]);
  const [webviewErrors, setWebviewErrors] = useState<string[]>([]);
  const [debugMessages, setDebugMessages] = useState<string[]>([]);
  const [mobileImprovements, setMobileImprovements] = useState<string[]>([]);
  const [tokenUsage, setTokenUsage] = useState<{prompt?: number, completion?: number, total?: number} | null>(null);

  // Keyboard state
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Animations
  const successAnimation = useRef(new Animated.Value(0)).current;
  const scaleAnimation = useRef(new Animated.Value(0)).current;
  // Removed tabSlideAnimation since we removed the purple indicator

  // Glassmorphic streaming window animations
  const overlayIn = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const [trackW, setTrackW] = useState(0);

  // Get current game HTML
  const getCurrentGameHtml = (): string => {
    if (!generationSession) {
      return generateDefaultGame();
    }

    // If user has selected an option and there are versions, use current version
    if (generationSession.selectedOption && generationSession.versions.length > 0) {
      const currentVersion = generationSession.versions[generationSession.currentVersionIndex];
      if (currentVersion && currentVersion.status === 'success') {
        return currentVersion.html;
      }
    }

    // If no selection made yet, show the active tab (option 1 or 2)
    if (!generationSession.selectedOption) {
      if (activeTabIndex === 0 && generationSession.option1?.status === 'success') {
        return generationSession.option1.html;
      }
      if (activeTabIndex === 1 && generationSession.option2?.status === 'success') {
        return generationSession.option2.html;
      }
    }

    return generateDefaultGame();
  };

  // Background task registration
  useEffect(() => {
    const registerBackgroundTask = async () => {
      try {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK_NAME, {
          minimumInterval: 15,
          stopOnTerminate: false,
          startOnBoot: true,
        });
      } catch (error) {
        console.warn('Failed to register background task:', error);
      }
    };

    registerBackgroundTask();

    return () => {
      BackgroundFetch.unregisterTaskAsync(BACKGROUND_TASK_NAME).catch(console.warn);
    };
  }, []);

  // Load saved state
  useEffect(() => {
    const loadSavedState = async () => {
      try {
        const savedState = await GameStorage.getCreateTabState();
        if (savedState) {
          setInput(savedState.input || "");
          setGameName(savedState.gameName || "");
          setGameDescription(savedState.gameDescription || "");
          
          if (savedState.generationSession) {
            setGenerationSession(savedState.generationSession);
          }
        }
      } catch (error) {
        console.warn("Failed to load saved create tab state:", error);
      }
    };
    loadSavedState();
  }, []);

  // Save state
  useEffect(() => {
    const saveState = async () => {
      try {
        await GameStorage.saveCreateTabState({
          input,
          gameHtml: getCurrentGameHtml(),
          hasCustomGame: !!generationSession,
          gameName,
          gameDescription,
          generationSession,
        });
      } catch (error) {
        console.warn("Failed to save create tab state:", error);
      }
    };
    const timeoutId = setTimeout(saveState, 500);
    return () => clearTimeout(timeoutId);
  }, [input, generationSession, gameName, gameDescription, activeTabIndex]);

  // Keyboard listeners
  useEffect(() => {
    const keyboardWillShow = (event: any) => {
      setKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates.height);
    };

    const keyboardWillHide = () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    };

    const keyboardDidShow = (event: any) => {
      setKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates.height);
    };

    const keyboardDidHide = () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    };

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showListener = Keyboard.addListener(showEvent, Platform.OS === 'ios' ? keyboardWillShow : keyboardDidShow);
    const hideListener = Keyboard.addListener(hideEvent, Platform.OS === 'ios' ? keyboardWillHide : keyboardDidHide);

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  // Tab animation removed since we removed the purple indicator

  // Glassmorphic streaming window animations
  useEffect(() => {
    if (showStreamingWindow) {
      Animated.spring(overlayIn, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 180 }).start();
      Animated.loop(
        Animated.timing(shine, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: true })
        ])
      ).start();
    } else {
      overlayIn.setValue(0);
    }
  }, [showStreamingWindow]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: genState.progress01 ?? 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    }).start();
  }, [genState?.progress01]);

  // Animation interpolation variables
  const overlayAnim = {
    opacity: overlayIn,
    transform: [
      { translateY: overlayIn.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
      { scale: overlayIn.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }
    ]
  };
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const progressWidth = Animated.multiply(progressAnim, trackW);
  const shineX = shine.interpolate({
    inputRange: [0, 1],
    outputRange: [-trackW * 0.3, trackW * 1.3]
  });

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isGenerating) return;

    setInput("");
    Keyboard.dismiss();
    setIsGenerating(true);
    setShowStreamingWindow(true);
    setStreamingTexts({});
    setStreamingStatus({});
    setCurrentGenerationStage('initial');
    setGenerationErrors([]);
    setWebviewErrors([]);
    setDebugMessages([]);
    setMobileImprovements([]);
    setTokenUsage(null);

    if (!generationSession) {
      // First generation - create two options with 2-stage process
      await handleInitialGeneration(text);
    } else if (generationSession.selectedOption === null) {
      // Auto-select the active tab option and proceed with iteration
      console.log('Second request: selecting option', activeTabIndex + 1);
      const updatedSession = handleOptionSelection();
      if (!updatedSession) {
        // Failed to select option - stop generation
        console.error('Failed to select option');
        setIsGenerating(false);
        setShowStreamingWindow(false);
        Alert.alert("Error", "Please select a valid game option to continue.");
        return;
      }
      console.log('Option selected successfully, starting iteration...');
      // Use the updated session for iteration
      await handleIterativeGenerationWithSession(text, updatedSession);
    } else {
      // User has already selected an option, iterate on it
      await handleIterativeGeneration(text);
    }
  };

  const handleInitialGeneration = async (prompt: string) => {
    GenerationActions.start(6 * 60 * 1000); // 6 minutes for dual generation + optimization
    GenerationActions.show();
    GenerationActions.setInlineActive(true);

    const newSession: GenerationSession = {
      initialPrompt: prompt,
      option1: {
      html: '',
      prompt,
      timestamp: Date.now(),
      status: 'generating',
      },
      option2: {
      html: '',
      prompt,
      timestamp: Date.now() + 1,
      status: 'generating',
      },
      selectedOption: null,
      versions: [],
      currentVersionIndex: -1,
    };

    setGenerationSession(newSession);
    setActiveTabIndex(0);

    try {
      // Stage 1: Generate initial HTML for both options
      setCurrentGenerationStage('initial');
      setStreamingTexts(prev => ({ ...prev, 'stage1': 'Generating initial game concepts...' }));
      console.log('🎮 Starting Stage 1: Initial Generation');

      const [result1, result2] = await Promise.allSettled([
        generateWithTokenUsage(
          prompt,
          undefined,
          (text) => {
            setStreamingTexts(prev => ({ ...prev, 'option1': text }));
            setTimeout(() => {
              streamingScrollRefs.current['option1']?.scrollToEnd({ animated: true });
              streamingScrollRefs.current['options']?.scrollToEnd({ animated: true });
            }, 100);
          },
          'option1',
          (status) => setStreamingStatus(prev => ({ ...prev, 'option1': status }))
        ),
        generateWithTokenUsage(
          prompt,
          undefined,
          (text) => {
            setStreamingTexts(prev => ({ ...prev, 'option2': text }));
            setTimeout(() => {
              streamingScrollRefs.current['option2']?.scrollToEnd({ animated: true });
              streamingScrollRefs.current['options']?.scrollToEnd({ animated: true });
            }, 100);
          },
          'option2',
          (status) => setStreamingStatus(prev => ({ ...prev, 'option2': status }))
        ),
      ]);

      const updatedSession = { ...newSession };
      let hasSuccessfulGeneration = false;

      if (result1.status === 'fulfilled') {
        const { content, tokenUsage } = result1.value;
        updatedSession.option1 = {
          ...newSession.option1!,
          html: content,
          status: 'success',
        };
        hasSuccessfulGeneration = true;
        // Set token usage for initial generation
        if (tokenUsage) {
          setTokenUsage(tokenUsage);
        }
      } else {
        updatedSession.option1 = {
          ...newSession.option1!,
          status: 'error',
          error: result1.reason?.message || 'Generation failed',
        };
        setGenerationErrors(prev => {
          const newErrors = [...prev, `Option 1: ${result1.reason?.message || 'Generation failed'}`];
          console.log('❌ Added generation error:', newErrors[newErrors.length - 1]);
          return newErrors;
        });
      }

      if (result2.status === 'fulfilled') {
        const { content, tokenUsage } = result2.value;
        updatedSession.option2 = {
          ...newSession.option2!,
          html: content,
          status: 'success',
        };
        hasSuccessfulGeneration = true;
        // Combine token usage from both generations
        if (tokenUsage) {
          setTokenUsage(prev => {
            if (!prev) return tokenUsage;
            return {
              prompt: (prev.prompt || 0) + (tokenUsage.prompt || 0),
              completion: (prev.completion || 0) + (tokenUsage.completion || 0),
              total: (prev.total || 0) + (tokenUsage.total || 0)
            };
          });
        }
      } else {
        updatedSession.option2 = {
          ...newSession.option2!,
          status: 'error',
          error: result2.reason?.message || 'Generation failed',
        };
        setGenerationErrors(prev => {
          const newErrors = [...prev, `Option 2: ${result2.reason?.message || 'Generation failed'}`];
          console.log('❌ Added generation error:', newErrors[newErrors.length - 1]);
          return newErrors;
        });
      }

      // Stage 2: Optimize successful generations for mobile compatibility
      if (hasSuccessfulGeneration) {
        setCurrentGenerationStage('optimization');
        setStreamingTexts(prev => ({
          ...prev,
          'stage1': '', // Clear stage 1 text
          'stage2': 'Optimizing for mobile compatibility and fixing errors...'
        }));
        console.log('📱 Starting Stage 2: Mobile Optimization');

        const optimizationPromises = [];

        if (updatedSession.option1?.status === 'success') {
          // Collect errors from stage 1 for option 1
          const option1Errors = [];
          if (updatedSession.option1?.error) {
            option1Errors.push(updatedSession.option1.error);
          }
          if (generationErrors.some(error => error.includes('Option 1'))) {
            option1Errors.push(...generationErrors.filter(error => error.includes('Option 1')));
          }

          optimizationPromises.push(
            optimizeWithTokenUsage(
              updatedSession.option1.html,
              option1Errors.length > 0 ? option1Errors : undefined,
              (text) => {
                setStreamingTexts(prev => ({ ...prev, 'optimization1': text }));
                setTimeout(() => {
                  streamingScrollRefs.current['optimization1']?.scrollToEnd({ animated: true });
                }, 100);
              },
              (status) => setStreamingStatus(prev => ({ ...prev, 'optimization1': status }))
            )            .then(result => ({
              option: 1,
              optimizedHtml: result.optimizedHtml,
              errors: result.errors,
              errors_found: result.errors_found,
              warnings: result.warnings,
              tokenUsage: result.tokenUsage
            })).catch(error => ({
              option: 1,
              optimizedHtml: updatedSession.option1!.html,
              errors: [`Optimization failed: ${error.message}`],
              tokenUsage: null
            }))
          );
        }

        if (updatedSession.option2?.status === 'success') {
          // Collect errors from stage 1 for option 2
          const option2Errors = [];
          if (updatedSession.option2?.error) {
            option2Errors.push(updatedSession.option2.error);
          }
          if (generationErrors.some(error => error.includes('Option 2'))) {
            option2Errors.push(...generationErrors.filter(error => error.includes('Option 2')));
          }

          optimizationPromises.push(
            optimizeWithTokenUsage(
              updatedSession.option2.html,
              option2Errors.length > 0 ? option2Errors : undefined,
              (text) => {
                setStreamingTexts(prev => ({ ...prev, 'optimization2': text }));
                setTimeout(() => {
                  streamingScrollRefs.current['optimization2']?.scrollToEnd({ animated: true });
                }, 100);
              },
              (status) => setStreamingStatus(prev => ({ ...prev, 'optimization2': status }))
            )            .then(result => ({
              option: 2,
              optimizedHtml: result.optimizedHtml,
              errors: result.errors,
              errors_found: result.errors_found,
              warnings: result.warnings,
              tokenUsage: result.tokenUsage
            })).catch(error => ({
              option: 2,
              optimizedHtml: updatedSession.option2!.html,
              errors: [`Optimization failed: ${error.message}`],
              tokenUsage: null
            }))
          );
        }

        const optimizationResults = await Promise.allSettled(optimizationPromises);

        optimizationResults.forEach(result => {
          if (result.status === 'fulfilled') {
            const value = result.value as any; // Type assertion to handle optional properties
            const { option, optimizedHtml, errors, errors_found = [], warnings = [], mobile_improvements = [], tokenUsage } = value;
            if (option === 1 && updatedSession.option1) {
              updatedSession.option1.html = optimizedHtml;
              if (errors.length > 0) {
                setGenerationErrors(prev => [...prev, ...errors.map((err: string) => `Option 1 Optimization: ${err}`)]);
              }
              if (errors_found.length > 0) {
                setGenerationErrors(prev => [...prev, ...errors_found.map((err: string) => `Option 1 Fixed: ${err}`)]);
                console.log('🔧 Option 1 Errors Fixed:', errors_found);
              }
              if (warnings.length > 0) {
                setDebugMessages(prev => [...prev, ...warnings.map((warn: string) => `Option 1 Warning: ${warn}`)]);
                console.log('⚠️ Option 1 Warnings:', warnings);
              }
              if (mobile_improvements.length > 0) {
                setMobileImprovements(prev => [...prev, ...mobile_improvements.map((imp: string) => `Option 1: ${imp}`)]);
                console.log('📱 Option 1 Mobile Improvements:', mobile_improvements);
              }
              // Add optimization token usage
              if (tokenUsage) {
                setTokenUsage(prev => {
                  if (!prev) return tokenUsage;
                  return {
                    prompt: (prev.prompt || 0) + (tokenUsage.prompt || 0),
                    completion: (prev.completion || 0) + (tokenUsage.completion || 0),
                    total: (prev.total || 0) + (tokenUsage.total || 0)
                  };
                });
              }
            } else if (option === 2 && updatedSession.option2) {
              updatedSession.option2.html = optimizedHtml;
              if (errors.length > 0) {
                setGenerationErrors(prev => [...prev, ...errors.map((err: string) => `Option 2 Optimization: ${err}`)]);
              }
              if (errors_found.length > 0) {
                setGenerationErrors(prev => [...prev, ...errors_found.map((err: string) => `Option 2 Fixed: ${err}`)]);
                console.log('🔧 Option 2 Errors Fixed:', errors_found);
              }
              if (warnings.length > 0) {
                setDebugMessages(prev => [...prev, ...warnings.map((warn: string) => `Option 2 Warning: ${warn}`)]);
                console.log('⚠️ Option 2 Warnings:', warnings);
              }
              if (mobile_improvements.length > 0) {
                setMobileImprovements(prev => [...prev, ...mobile_improvements.map((imp: string) => `Option 2: ${imp}`)]);
                console.log('📱 Option 2 Mobile Improvements:', mobile_improvements);
              }
              // Add optimization token usage
              if (tokenUsage) {
                setTokenUsage(prev => {
                  if (!prev) return tokenUsage;
                  return {
                    prompt: (prev.prompt || 0) + (tokenUsage.prompt || 0),
                    completion: (prev.completion || 0) + (tokenUsage.completion || 0),
                    total: (prev.total || 0) + (tokenUsage.total || 0)
                  };
                });
              }
            }
          } else {
            // Handle optimization failure
            console.error('❌ Optimization failed:', result.reason);
            setGenerationErrors(prev => [...prev, `Optimization Error: ${result.reason?.message || 'Unknown error'}`]);
          }
        });
      }

      setGenerationSession(updatedSession);
      setCurrentGenerationStage('complete');
      console.log('✅ Generation Complete - Both stages finished');

    } catch (error) {
      console.error("Initial generation failed:", error);
      setGenerationErrors(prev => [...prev, `Generation failed: ${error instanceof Error ? error.message : String(error)}`]);
      Alert.alert("Error", "Failed to generate games. Please try again.");
    } finally {
      setIsGenerating(false);
      setShowStreamingWindow(false);
      setStreamingStatus({});
      GenerationActions.stop();
      GenerationActions.hide();
      GenerationActions.setInlineActive(false);
    }
  };

  const handleOptionSelection = () => {
    if (!generationSession || generationSession.selectedOption !== null) return null;

    const selectedOption = activeTabIndex === 0 ? 1 : 2;
    const selectedVersion = selectedOption === 1 ? generationSession.option1 : generationSession.option2;

    if (!selectedVersion || selectedVersion.status !== 'success') {
      return null;
    }

    // Add the selected option as the first version
    const updatedSession: GenerationSession = {
      ...generationSession,
      selectedOption: selectedOption as 1 | 2,
      versions: [selectedVersion],
      currentVersionIndex: 0,
    };

    setGenerationSession(updatedSession);
    return updatedSession;
  };

  const handleIterativeGeneration = async (prompt: string) => {
    if (!generationSession || generationSession.selectedOption === null) return;
    await handleIterativeGenerationWithSession(prompt, generationSession);
  };

  const handleIterativeGenerationWithSession = async (prompt: string, session: GenerationSession) => {
    console.log('Starting iterative generation with session:', session);
    const currentVersion = session.versions[session.currentVersionIndex];
    console.log('Current version:', currentVersion);
    
    if (!currentVersion || currentVersion.status !== 'success') {
      console.error('No valid version to iterate on');
      setIsGenerating(false);
      setShowStreamingWindow(false);
      Alert.alert("Error", "No valid version to iterate on.");
      return;
    }
    
    GenerationActions.start(2 * 60 * 1000);
    GenerationActions.show();
    GenerationActions.setInlineActive(true);

    try {
      console.log('Calling generateGameHtmlWithGPT with:', {
      prompt,
        currentHtml: currentVersion.html.slice(0, 100) + '...',
      });
      
      const { content, tokenUsage } = await generateWithTokenUsage(
        prompt,
        currentVersion.html,
        (text) => {
          setStreamingTexts(prev => ({ ...prev, 'iteration': text }));
          setTimeout(() => {
            streamingScrollRefs.current['iteration']?.scrollToEnd({ animated: true });
          }, 100);
        },
        'iteration',
        (status) => setStreamingStatus(prev => ({ ...prev, 'iteration': status }))
      );

      // Set token usage for iteration
      if (tokenUsage) {
        setTokenUsage(tokenUsage);
      }

      console.log('Generation completed successfully');

      // Validate Three.js content if applicable
      const validation = validateThreeJsContent(content);
      if (validation.isThreeJsGame && !validation.isValid) {
        console.warn('Three.js game detected but missing required elements:', validation);
      }

      const newVersion: GameVersion = {
        html: content,
        prompt,
        timestamp: Date.now(),
        status: 'success',
      };

      // Add new version and make it current
      const updatedVersions = [...session.versions, newVersion];
      const updatedSession: GenerationSession = {
        ...session,
        versions: updatedVersions,
        currentVersionIndex: updatedVersions.length - 1,
      };

      setGenerationSession(updatedSession);

    } catch (error) {
      console.error("Iterative generation failed:", error);
      Alert.alert("Error", "Failed to update game. Please try again.");
    } finally {
      setIsGenerating(false);
      setShowStreamingWindow(false);
      setStreamingStatus({});
      GenerationActions.stop();
      GenerationActions.hide();
      GenerationActions.setInlineActive(false);
    }
  };



  // Version navigation functions
  const canNavigateToPreviousVersion = (): boolean => {
    return generationSession ? generationSession.currentVersionIndex > 0 : false;
  };

  const canNavigateToNextVersion = (): boolean => {
    if (!generationSession) return false;
    return generationSession.currentVersionIndex < generationSession.versions.length - 1;
  };

  const handleVersionChange = (versionIndex: number) => {
    if (!generationSession || versionIndex < 0 || versionIndex >= generationSession.versions.length) return;
    
    const updatedSession: GenerationSession = {
          ...generationSession,
      currentVersionIndex: versionIndex,
    };
    
        setGenerationSession(updatedSession);
  };

  const handleRetry = async () => {
    if (!generationSession) return;

    const lastPrompt = generationSession.initialPrompt;
    if (!lastPrompt) return;

    await handleInitialGeneration(lastPrompt);
  };

  const handleNewChat = () => {
    setGenerationSession(null);
    setInput("");
    setGameName("");
    setGameDescription("");
    setStreamingTexts({});
    setIsGenerating(false);
    setShowStreamingWindow(false);
    setActiveTabIndex(0);
    setStreamingStatus({});
    setCurrentGenerationStage('initial');
    setGenerationErrors([]);
    setWebviewErrors([]);
    setDebugMessages([]);
    setMobileImprovements([]);

    GameStorage.clearCreateTabState().catch(console.warn);

    GenerationActions.stop();
    GenerationActions.hide();
    GenerationActions.setInlineActive(false);
  };

  const handlePublish = () => {
    if (!generationSession || !getCurrentGameHtml()) {
      Alert.alert("No Game", "Please create a game first before publishing.");
      return;
    }

    // With auto-voting, this check is no longer needed as selection happens automatically

    setShowPublishModal(true);
    setPublishSuccess(false);
    scaleAnimation.setValue(0);
    Animated.spring(scaleAnimation, {
      toValue: 1,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();
  };

  const confirmPublish = async () => {
    if (!gameName.trim()) return;

    setIsPublishing(true);

    try {
      const authorHandle = user
        ? `@${(user.displayName || user.uid).replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}`
        : "@you";

      const gameHtml = getCurrentGameHtml();

      const savedGame = await GameStorage.saveGame({
        title: gameName.trim(),
        description: gameDescription.trim() || "A fun game created with AI",
        html: gameHtml,
        author: authorHandle,
        likes: 0,
        duration: 60,
        category: "AI Generated",
      });

      if (!savedGame.html || savedGame.html.trim().length === 0) {
        throw new Error("No HTML content to publish");
      }

      try {
        const gameService = SimpleGameService.getInstance();
        await gameService.publishGame({
          id: savedGame.id,
          title: savedGame.title,
          author: user?.uid || authorHandle,
          category: savedGame.category || "AI Generated",
          difficulty: "medium",
          duration: savedGame.duration || 60,
          likes: 0,
          views: 0,
          plays: 0,
          isActive: true,
          html: savedGame.html,
          description: savedGame.description || "A fun game created with AI",
        }, user?.uid);
      } catch (firebaseError) {
        console.error("Failed to save game to Firebase:", firebaseError);
      }

      const callbackToExecute = onGamePublished;

      setIsPublishing(false);
      setPublishSuccess(true);

      Animated.sequence([
        Animated.timing(successAnimation, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.delay(1500),
        Animated.timing(successAnimation, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowPublishModal(false);
        setGameName("");
        setGameDescription("");
        setPublishSuccess(false);

        GameStorage.clearCreateTabState().catch(console.warn);

        handleNewChat();

        requestAnimationFrame(() => {
          if (callbackToExecute && typeof callbackToExecute === "function") {
            const feedGame = {
              id: savedGame.id,
              title: savedGame.title,
              author: savedGame.author,
              likes: savedGame.likes,
              liked: savedGame.liked || false,
              html: savedGame.html,
              duration: savedGame.duration,
              category: savedGame.category,
              views: savedGame.views,
              comments: savedGame.comments,
            };
            callbackToExecute(feedGame);
          }
        });
      });
    } catch (error) {
      console.error("Failed to publish game:", error);
      setIsPublishing(false);
      Alert.alert("Error", "Failed to publish game. Please try again.");
    }
  };

  const closeModal = () => {
    setShowPublishModal(false);
    setGameName("");
    setGameDescription("");
    setPublishSuccess(false);
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  // Render tab content
  const renderTabContent = () => {
    if (!generationSession) {
      return (
        <View style={styles.gameFrame}>
          <WebView
            source={{ html: generateDefaultGame() }}
            style={styles.gameWebview}
            scrollEnabled={false}
            bounces={false}
            {...getWebViewConfig()}
            onMessage={createWebViewMessageHandler(
              (error) => setWebviewErrors(prev => [...prev, error]),
              (warning) => setWebviewErrors(prev => [...prev, warning])
            )}
            injectedJavaScript={getThreeJsInjectedJavaScript()}
            onError={handleWebViewError}
            onHttpError={handleWebViewHttpError}
            onRenderProcessGone={handleWebViewRenderProcessGone}
            allowsProtectedMedia={true}
            mediaPlaybackRequiresUserAction={false}
            startInLoadingState={true}
            renderLoading={() => <ActivityIndicator size="large" color="#7C3AED" />}
          />
        </View>
      );
    }

    // If user has selected an option, show the current version
    if (generationSession.selectedOption) {
      const currentVersion = generationSession.versions[generationSession.currentVersionIndex];
      
      return (
        <View style={styles.gameFrame}>
          {currentVersion && currentVersion.status === 'success' ? (
            <WebView
              key={`version-${generationSession.currentVersionIndex}`}
              source={{ html: currentVersion.html }}
              style={styles.gameWebview}
              scrollEnabled={false}
              bounces={false}
              {...getWebViewConfig()}
              onMessage={createWebViewMessageHandler(
                (error) => setWebviewErrors(prev => [...prev, error]),
                (warning) => setWebviewErrors(prev => [...prev, warning]),
                (debug) => console.log('🎯 Game Debug:', debug)
              )}
              injectedJavaScript={getThreeJsInjectedJavaScript()}
              onError={handleWebViewError}
              onHttpError={handleWebViewHttpError}
              onRenderProcessGone={handleWebViewRenderProcessGone}
              allowsProtectedMedia={true}
              mediaPlaybackRequiresUserAction={false}
              startInLoadingState={true}
              renderLoading={() => <ActivityIndicator size="large" color="#7C3AED" />}
            />
          ) : currentVersion && currentVersion.status === 'generating' ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#7C3AED" />
              <Text style={styles.loadingText}>Applying Changes to Version {generationSession.currentVersionIndex + 1}...</Text>
            </View>
          ) : currentVersion && currentVersion.status === 'error' ? (
            <View style={styles.errorOverlay}>
              <CustomIcon name="alert-circle" size={SCREEN_W * 0.12} color="#EF4444" />
              <Text style={styles.errorTitle}>Generation Failed</Text>
              <Text style={styles.errorMessage}>{currentVersion.error || 'Unknown error occurred'}</Text>
              <Pressable style={styles.retryButton} onPress={handleRetry}>
                <CustomIcon name="refresh" size={SCREEN_W * 0.04} color="#FFFFFF" />
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <WebView
              source={{ html: generateDefaultGame() }}
              style={styles.gameWebview}
              scrollEnabled={false}
              bounces={false}
              {...getWebViewConfig()}
              onMessage={createWebViewMessageHandler(
                (error) => setWebviewErrors(prev => [...prev, error]),
                (warning) => setWebviewErrors(prev => [...prev, warning]),
                (debug) => console.log('🎯 Game Debug:', debug)
              )}
              injectedJavaScript={getThreeJsInjectedJavaScript()}
              onError={handleWebViewError}
              onHttpError={handleWebViewHttpError}
              onRenderProcessGone={handleWebViewRenderProcessGone}
              allowsProtectedMedia={true}
              mediaPlaybackRequiresUserAction={false}
              startInLoadingState={true}
              renderLoading={() => <ActivityIndicator size="large" color="#7C3AED" />}
            />
          )}

          {/* Streaming Window */}
          {showStreamingWindow && (
            <View style={styles.inlineOverlayContainer} pointerEvents="box-none">
              <Animated.View style={[styles.inlineShadow, overlayAnim]} pointerEvents="auto">
                <BlurView tint="dark" intensity={28} style={styles.inlineGlassCard}>
                  <View style={styles.glassStroke} pointerEvents="none" />
                  <View style={styles.inlineCardBody}>
                    <View style={styles.inlineHeader}>
                      <View style={styles.inlineTitleContainer}>
                        <Text style={styles.inlineTitle}>
                          {currentGenerationStage === 'initial' && 'Stage 1: Generating Game Concepts...'}
                          {currentGenerationStage === 'optimization' && 'Stage 2: Optimizing for Mobile...'}
                          {currentGenerationStage === 'complete' && 'Generation Complete'}
                          {!currentGenerationStage && `Applying Changes to Version ${generationSession.versions.length + 1}...`}
                        </Text>
                        {/* Token usage for iterations (no stage indicators) */}
                        {tokenUsage && (
                          <View style={styles.tokenUsageContainer}>
                            <CustomIcon name="analytics-outline" size={SCREEN_W * 0.025} color="#6B7280" />
                            <Text style={styles.tokenUsageText}>
                              {tokenUsage.total || 0} tokens
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.inlineCountdown}>{genState.countdownText}</Text>
                    </View>

                    {/* Network Status */}
                    <View style={styles.networkStatusContainer}>
                      {streamingStatus['iteration'] && (() => {
                        const s = streamingStatus['iteration'];
                        const color =
                          s === 'streaming' ? '#10B981' :
                          s === 'connecting' || s === 'waiting' ? '#F59E0B' :
                          '#EF4444';
                        const label =
                          s === 'connecting' ? 'Connecting…' :
                          s === 'streaming'   ? 'Streaming' :
                          s === 'waiting'     ? 'Waiting for response…' :
                          s === 'timeout'     ? 'Connection timeout, retrying…' :
                          'Network error, retrying…';
                        return (
                          <View style={styles.networkStatus}>
                            <Animated.View style={[styles.networkDot, { backgroundColor: color, transform: [{ scale: pulseScale }] }]} />
                            <CustomIcon
                              name={s === 'connecting' ? 'wifi-outline' : s === 'streaming' ? 'wifi' : s === 'waiting' ? 'time-outline' : 'warning-outline'}
                              size={SCREEN_W * 0.03}
                              color={color}
                            />
                            <Text style={[styles.networkStatusText, { color }]}>{label}</Text>
                          </View>
                        );
                      })()}
                    </View>

                    {/* Progress with animated width + shimmer */}
                    <View
                      style={styles.inlineTrack}
                      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
                    >
                      <Animated.View style={[styles.inlineFill, { width: progressWidth }]}>
                        <LinearGradient
                          style={StyleSheet.absoluteFill}
                          colors={['#4CA9FF', '#0A84FF', '#0060DF']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                        />
                      </Animated.View>
                      <Animated.View style={[styles.shineWrap, { transform: [{ translateX: shineX }] }]}>
                        <LinearGradient
                          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']}
                          start={{ x: 0, y: 0.5 }}
                          end={{ x: 1, y: 0.5 }}
                          style={{ flex: 1 }}
                        />
                      </Animated.View>
                    </View>

                    {/* Error Display Section */}
                    {(generationErrors.length > 0 || webviewErrors.length > 0 || debugMessages.length > 0) && (
                      <View style={styles.errorDisplayContainer}>
                        <View style={styles.errorHeader}>
                          <CustomIcon name="warning-outline" size={SCREEN_W * 0.03} color="#EF4444" />
                          <Text style={styles.errorHeaderText}>Issues Found & Fixed</Text>
                        </View>
                        <ScrollView style={styles.errorList} showsVerticalScrollIndicator={false}>
                          {/* Generation & Optimization Errors */}
                          {generationErrors.map((error, index) => {
                            const isFixed = error.includes('Fixed:');
                            const isOptimization = error.includes('Optimization:');
                            return (
                              <View key={`gen-error-${index}`} style={styles.errorItem}>
                                <CustomIcon
                                  name={isFixed ? "checkmark-circle-outline" : isOptimization ? "construct-outline" : "code-working-outline"}
                                  size={SCREEN_W * 0.025}
                                  color={isFixed ? "#10B981" : isOptimization ? "#F59E0B" : "#EF4444"}
                                />
                                <Text style={[styles.errorText, isFixed && styles.fixedErrorText]}>{error}</Text>
                              </View>
                            );
                          })}

                          {/* WebView Runtime Errors */}
                          {webviewErrors.map((error, index) => (
                            <View key={`webview-error-${index}`} style={styles.errorItem}>
                              <CustomIcon name="bug-outline" size={SCREEN_W * 0.025} color="#DC2626" />
                              <Text style={styles.errorText}>{error}</Text>
                            </View>
                          ))}

                          {/* Mobile Improvements */}
                          {mobileImprovements.map((improvement, index) => (
                            <View key={`mobile-${index}`} style={styles.mobileImprovementItem}>
                              <CustomIcon name="phone-portrait-outline" size={SCREEN_W * 0.025} color="#10B981" />
                              <Text style={styles.mobileImprovementText}>{improvement}</Text>
                            </View>
                          ))}

                          {/* Debug Messages & Warnings */}
                          {debugMessages.map((debug, index) => (
                            <View key={`debug-${index}`} style={styles.debugItem}>
                              <CustomIcon name="information-circle-outline" size={SCREEN_W * 0.025} color="#6B7280" />
                              <Text style={styles.debugText}>{debug}</Text>
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    )}

                    {/* Streaming text (unchanged, just styles) */}
                    {streamingTexts['iteration'] && (
                      <ScrollView
                        ref={(ref) => { streamingScrollRefs.current['iteration'] = ref; }}
                        style={styles.streamingTextContainer}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled
                      >
                        <Text style={styles.streamingText}>{streamingTexts['iteration']}</Text>
                      </ScrollView>
                    )}

                    {/* Stage-specific streaming text */}
                    {streamingTexts['stage1'] && currentGenerationStage === 'initial' && (
                      <ScrollView style={styles.stageTextContainer} showsVerticalScrollIndicator={false}>
                        <Text style={styles.stageText}>{streamingTexts['stage1']}</Text>
                      </ScrollView>
                    )}

                    {streamingTexts['stage2'] && currentGenerationStage === 'optimization' && (
                      <ScrollView style={styles.stageTextContainer} showsVerticalScrollIndicator={false}>
                        <Text style={styles.stageText}>{streamingTexts['stage2']}</Text>
                      </ScrollView>
                    )}

                    {(streamingTexts['optimization1'] || streamingTexts['optimization2']) && (
                      <ScrollView style={styles.optimizationTextContainer} showsVerticalScrollIndicator={false}>
                        {streamingTexts['optimization1'] && (
                          <Text style={styles.optimizationText}>Option 1: {streamingTexts['optimization1']}</Text>
                        )}
                        {streamingTexts['optimization2'] && (
                          <Text style={styles.optimizationText}>Option 2: {streamingTexts['optimization2']}</Text>
                        )}
                      </ScrollView>
                    )}
                  </View>
                </BlurView>
              </Animated.View>
            </View>
          )}
        </View>
      );
    }

    // Show initial options with tabs
    const shouldShowTabs = generationSession.option1 && generationSession.option2;

    return (
      <View style={styles.tabContainer}>
        {/* Tab Headers */}
        {shouldShowTabs && (
          <View style={styles.tabHeaders}>
            <View style={styles.tabButtonsContainer}>
                    <Pressable
                      style={[
                        styles.tabButton,
                  activeTabIndex === 0 && styles.tabButtonActive,
                      ]}
                onPress={() => setActiveTabIndex(0)}
                    >
                      <View style={styles.tabTextContainer}>
                        <Text style={[
                          styles.tabButtonText,
                    activeTabIndex === 0 && styles.tabButtonTextActive,
                        ]}>
                    Option 1
                        </Text>
                      </View>
                {generationSession.option1?.status === 'generating' && (
                        <ActivityIndicator size="small" color="#7C3AED" style={styles.tabLoader} />
                      )}
                {generationSession.option1?.status === 'error' && (
                        <CustomIcon name="alert-circle" size={SCREEN_W * 0.04} color="#EF4444" />
                      )}
              </Pressable>

              <Pressable
                style={[
                  styles.tabButton,
                  activeTabIndex === 1 && styles.tabButtonActive,
                ]}
                onPress={() => setActiveTabIndex(1)}
              >
                <View style={styles.tabTextContainer}>
                  <Text style={[
                    styles.tabButtonText,
                    activeTabIndex === 1 && styles.tabButtonTextActive,
                  ]}>
                    Option 2
                  </Text>
                </View>
                {generationSession.option2?.status === 'generating' && (
                  <ActivityIndicator size="small" color="#7C3AED" style={styles.tabLoader} />
                )}
                {generationSession.option2?.status === 'error' && (
                  <CustomIcon name="alert-circle" size={SCREEN_W * 0.04} color="#EF4444" />
                      )}
                    </Pressable>
            </View>
          </View>
        )}

        {/* Tab Content */}
        <View style={styles.gameFrame}>
          {(() => {
            const activeOption = activeTabIndex === 0 ? generationSession.option1 : generationSession.option2;
            
            if (activeOption && activeOption.status === 'success') {
              return (
                        <WebView
              key={`option-${activeTabIndex}`}
              source={{ html: activeOption.html }}
              style={styles.gameWebview}
              scrollEnabled={false}
              bounces={false}
              {...getWebViewConfig()}
              onMessage={createWebViewMessageHandler(
                (error) => setWebviewErrors(prev => [...prev, error]),
                (warning) => setWebviewErrors(prev => [...prev, warning]),
                (debug) => console.log('🎯 Game Debug:', debug)
              )}
              injectedJavaScript={getThreeJsInjectedJavaScript()}
              onError={handleWebViewError}
              onHttpError={handleWebViewHttpError}
              onRenderProcessGone={handleWebViewRenderProcessGone}
              allowsProtectedMedia={true}
              mediaPlaybackRequiresUserAction={false}
              startInLoadingState={true}
              renderLoading={() => <ActivityIndicator size="large" color="#7C3AED" />}
            />
              );
            } else if (activeOption && activeOption.status === 'generating') {
              return (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#7C3AED" />
              <Text style={styles.loadingText}>Generating Option {activeTabIndex + 1}...</Text>
            </View>
              );
            } else if (activeOption && activeOption.status === 'error') {
              return (
            <View style={styles.errorOverlay}>
              <CustomIcon name="alert-circle" size={SCREEN_W * 0.12} color="#EF4444" />
              <Text style={styles.errorTitle}>Generation Failed</Text>
                  <Text style={styles.errorMessage}>{activeOption.error || 'Unknown error occurred'}</Text>
              <Pressable style={styles.retryButton} onPress={handleRetry}>
                <CustomIcon name="refresh" size={SCREEN_W * 0.04} color="#FFFFFF" />
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
              );
            } else {
              return (
            <WebView
              source={{ html: generateDefaultGame() }}
              style={styles.gameWebview}
              scrollEnabled={false}
              bounces={false}
              {...getWebViewConfig()}
              onMessage={createWebViewMessageHandler(
                (error) => setWebviewErrors(prev => [...prev, error]),
                (warning) => setWebviewErrors(prev => [...prev, warning]),
                (debug) => console.log('🎯 Game Debug:', debug)
              )}
              injectedJavaScript={getThreeJsInjectedJavaScript()}
              onError={handleWebViewError}
              onHttpError={handleWebViewHttpError}
              onRenderProcessGone={handleWebViewRenderProcessGone}
              allowsProtectedMedia={true}
              mediaPlaybackRequiresUserAction={false}
              startInLoadingState={true}
              renderLoading={() => <ActivityIndicator size="large" color="#7C3AED" />}
            />
              );
            }
          })()}

          {/* Streaming Window */}
          {showStreamingWindow && (
            <View style={styles.inlineOverlayContainer} pointerEvents="box-none">
              <Animated.View style={[styles.inlineShadow, overlayAnim]} pointerEvents="auto">
                <BlurView tint="dark" intensity={28} style={styles.inlineGlassCard}>
                  <View style={styles.glassStroke} pointerEvents="none" />
                  <View style={styles.inlineCardBody}>
                    <View style={styles.inlineHeader}>
                      <View style={styles.inlineTitleContainer}>
                        <Text style={styles.inlineTitle}>
                          {currentGenerationStage === 'initial' && 'Stage 1: Generating Game Concepts...'}
                          {currentGenerationStage === 'optimization' && 'Stage 2: Optimizing for Mobile...'}
                          {currentGenerationStage === 'complete' && 'Generation Complete'}
                          {!currentGenerationStage && 'Generating Options...'}
                        </Text>
                        {/* Stage indicators and token usage for initial generation only */}
                        {(currentGenerationStage === 'initial' || currentGenerationStage === 'optimization') && (
                          <View style={styles.stageIndicatorContainer}>
                            <View style={styles.stageIndicator}>
                              <View style={[styles.stageDot, currentGenerationStage === 'initial' && styles.stageDotActive]} />
                              <View style={[styles.stageDot, currentGenerationStage === 'optimization' && styles.stageDotActive]} />
                            </View>
                            {tokenUsage && (
                              <View style={styles.tokenUsageContainer}>
                                <CustomIcon name="analytics-outline" size={SCREEN_W * 0.025} color="#6B7280" />
                                <Text style={styles.tokenUsageText}>
                                  {tokenUsage.total || 0} tokens
                                </Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                      <Text style={styles.inlineCountdown}>{genState.countdownText}</Text>
                    </View>

                    {/* Network Status */}
                    <View style={styles.networkStatusContainer}>
                      {(streamingStatus['option1'] || streamingStatus['option2']) && (
                        <View style={styles.networkStatus}>
                          <Animated.View style={[styles.networkDot, { backgroundColor: '#10B981', transform: [{ scale: pulseScale }] }]} />
                          <CustomIcon name="wifi" size={SCREEN_W * 0.03} color="#10B981" />
                          <Text style={[styles.networkStatusText, { color: '#10B981' }]}>Generating both options…</Text>
                        </View>
                      )}
                    </View>

                    {/* Progress with animated width + shimmer */}
                    <View
                      style={styles.inlineTrack}
                      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
                    >
                      <Animated.View style={[styles.inlineFill, { width: progressWidth }]}>
                        <LinearGradient
                          style={StyleSheet.absoluteFill}
                          colors={['#4CA9FF', '#0A84FF', '#0060DF']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                        />
                      </Animated.View>
                      <Animated.View style={[styles.shineWrap, { transform: [{ translateX: shineX }] }]}>
                        <LinearGradient
                          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']}
                          start={{ x: 0, y: 0.5 }}
                          end={{ x: 1, y: 0.5 }}
                          style={{ flex: 1 }}
                        />
                      </Animated.View>
                    </View>

                    {/* Error Display Section */}
                    {(generationErrors.length > 0 || webviewErrors.length > 0 || debugMessages.length > 0) && (
                      <View style={styles.errorDisplayContainer}>
                        <View style={styles.errorHeader}>
                          <CustomIcon name="warning-outline" size={SCREEN_W * 0.03} color="#EF4444" />
                          <Text style={styles.errorHeaderText}>Issues Found & Fixed</Text>
                        </View>
                        <ScrollView style={styles.errorList} showsVerticalScrollIndicator={false}>
                          {/* Generation & Optimization Errors */}
                          {generationErrors.map((error, index) => {
                            const isFixed = error.includes('Fixed:');
                            const isOptimization = error.includes('Optimization:');
                            return (
                              <View key={`gen-error-${index}`} style={styles.errorItem}>
                                <CustomIcon
                                  name={isFixed ? "checkmark-circle-outline" : isOptimization ? "construct-outline" : "code-working-outline"}
                                  size={SCREEN_W * 0.025}
                                  color={isFixed ? "#10B981" : isOptimization ? "#F59E0B" : "#EF4444"}
                                />
                                <Text style={[styles.errorText, isFixed && styles.fixedErrorText]}>{error}</Text>
                              </View>
                            );
                          })}

                          {/* WebView Runtime Errors */}
                          {webviewErrors.map((error, index) => (
                            <View key={`webview-error-${index}`} style={styles.errorItem}>
                              <CustomIcon name="bug-outline" size={SCREEN_W * 0.025} color="#DC2626" />
                              <Text style={styles.errorText}>{error}</Text>
                            </View>
                          ))}

                          {/* Mobile Improvements */}
                          {mobileImprovements.map((improvement, index) => (
                            <View key={`mobile-${index}`} style={styles.mobileImprovementItem}>
                              <CustomIcon name="phone-portrait-outline" size={SCREEN_W * 0.025} color="#10B981" />
                              <Text style={styles.mobileImprovementText}>{improvement}</Text>
                            </View>
                          ))}

                          {/* Debug Messages & Warnings */}
                          {debugMessages.map((debug, index) => (
                            <View key={`debug-${index}`} style={styles.debugItem}>
                              <CustomIcon name="information-circle-outline" size={SCREEN_W * 0.025} color="#6B7280" />
                              <Text style={styles.debugText}>{debug}</Text>
                            </View>
                          ))}
                        </ScrollView>
                      </View>
                    )}

                    {/* Stage-specific streaming text */}
                    {streamingTexts['stage1'] && currentGenerationStage === 'initial' && (
                      <ScrollView style={styles.stageTextContainer} showsVerticalScrollIndicator={false}>
                        <Text style={styles.stageText}>{streamingTexts['stage1']}</Text>
                      </ScrollView>
                    )}

                    {streamingTexts['stage2'] && currentGenerationStage === 'optimization' && (
                      <ScrollView style={styles.stageTextContainer} showsVerticalScrollIndicator={false}>
                        <Text style={styles.stageText}>{streamingTexts['stage2']}</Text>
                      </ScrollView>
                    )}

                    {(streamingTexts['optimization1'] || streamingTexts['optimization2']) && (
                      <ScrollView style={styles.optimizationTextContainer} showsVerticalScrollIndicator={false}>
                        {streamingTexts['optimization1'] && (
                          <Text style={styles.optimizationText}>Option 1: {streamingTexts['optimization1']}</Text>
                        )}
                        {streamingTexts['optimization2'] && (
                          <Text style={styles.optimizationText}>Option 2: {streamingTexts['optimization2']}</Text>
                        )}
                      </ScrollView>
                    )}

                    {/* Streaming text (unchanged, just styles) */}
                    {(streamingTexts['option1'] || streamingTexts['option2']) && (
                      <ScrollView
                        ref={(ref) => {
                          streamingScrollRefs.current['options'] = ref;
                          // Auto-scroll when content updates
                          if (ref && (streamingTexts['option1'] || streamingTexts['option2'])) {
                            setTimeout(() => {
                              ref.scrollToEnd({ animated: true });
                            }, 100);
                          }
                        }}
                        style={styles.streamingTextContainer}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled
                      >
                        <Text style={styles.streamingText}>
                          {activeTabIndex === 0
                            ? (streamingTexts['option1'] || 'Generating Option 1...')
                            : (streamingTexts['option2'] || 'Generating Option 2...')}
                        </Text>
                      </ScrollView>
                    )}
                  </View>
                </BlurView>
              </Animated.View>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Fixed Header */}
      <View style={styles.headerContainer}>
        <BlurView intensity={30} tint="dark" style={styles.headerBlur}>
          <View style={styles.header}>
            <Text style={styles.title}>Game Studio</Text>
            <View style={styles.headerButtons}>
              {/* Version Dropdown */}
              {generationSession && generationSession.selectedOption && generationSession.versions.length > 0 && (
                <View style={styles.versionDropdown}>
                  <Pressable
                    style={styles.versionButton}
                    onPress={() => {
                      // For now, cycle through versions - later can be expanded to a dropdown
                      const nextIndex = (generationSession.currentVersionIndex + 1) % generationSession.versions.length;
                      handleVersionChange(nextIndex);
                    }}
                  >
                    <Text style={styles.versionText}>V{generationSession.currentVersionIndex + 1}</Text>
                    <CustomIcon name="chevron-down" size={SCREEN_W * 0.03} color="#FFFFFF" />
                  </Pressable>
                </View>
              )}
              
              {generationSession && generationSession.selectedOption === null && generationSession.option1 && generationSession.option2 && (
                <Pressable
                  style={styles.retryBtn}
                  onPress={handleRetry}
                >
                  <CustomIcon name="refresh" size={SCREEN_W * 0.045} color="#FFFFFF" />
                </Pressable>
              )}
              <Pressable
                style={styles.newChatBtn}
                onPress={handleNewChat}
              >
                <CustomIcon name="add" size={SCREEN_W * 0.05} color="#FFFFFF" />
              </Pressable>
              <Pressable style={styles.publishBtn} onPress={handlePublish}>
                <CustomIcon name="arrow-up" size={SCREEN_W * 0.05} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </BlurView>
      </View>

      {/* Main Content Area */}
      <KeyboardAvoidingView 
        style={styles.mainContent}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* Game Container */}
        <Pressable style={styles.gameContainer} onPress={dismissKeyboard}>
          {renderTabContent()}
        </Pressable>

        {/* Input Section */}
        <View style={[
          styles.inputSectionContainer,
          { 
            paddingBottom: keyboardVisible 
              ? Math.max(insets.bottom + SCREEN_H * 0.05, SCREEN_H * 0.06)
              : Math.max(insets.bottom, SCREEN_H * 0.02)
          }
        ]}>
          <BlurView intensity={24} tint="dark" style={styles.inputBlur}>
            <View style={styles.inputContainer}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={
                  generationSession?.selectedOption 
                    ? "What would you like to change?"
                    : "Describe your game idea..."
                }
                placeholderTextColor="#6B7280"
                style={styles.input}
                multiline
                maxLength={1000}
                textAlignVertical="top"
                returnKeyType="send"
                onSubmitEditing={handleSend}
              />
              <Pressable
                style={[styles.sendBtn, (!input.trim() || isGenerating) && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!input.trim() || isGenerating}
              >
                <CustomIcon 
                  name={isGenerating ? "hourglass" : "arrow-forward"} 
                  size={SCREEN_W * 0.04} 
                  color="#FFFFFF" 
                />
              </Pressable>
            </View>
          </BlurView>
        </View>
      </KeyboardAvoidingView>

      {/* Publish Modal */}
      <Modal visible={showPublishModal} transparent animationType="fade" onRequestClose={closeModal}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={styles.modalBackdrop} onPress={closeModal} />
          <Animated.View
            style={[
              styles.modalContent,
              { transform: [{ scale: scaleAnimation }] },
            ]}
          >
            {!publishSuccess ? (
              <>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>Publish Game</Text>
                    {generationSession?.selectedOption && (
                      <Text style={styles.modalSubtitle}>
                        Publishing Option {generationSession.selectedOption} - Version {generationSession.currentVersionIndex + 1}
                      </Text>
                    )}
                  </View>
                  <Pressable onPress={closeModal}>
                    <CustomIcon name="close" size={SCREEN_W * 0.06} color="#6B7280" />
                  </Pressable>
                </View>

                <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Game Name</Text>
                    <TextInput
                      value={gameName}
                      onChangeText={setGameName}
                      placeholder="Enter game name..."
                      placeholderTextColor="#6B7280"
                      style={styles.modalInput}
                      returnKeyType="next"
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Description</Text>
                    <TextInput
                      value={gameDescription}
                      onChangeText={setGameDescription}
                      placeholder="Describe your game..."
                      placeholderTextColor="#6B7280"
                      style={[styles.modalInput, styles.textArea]}
                      multiline
                      numberOfLines={3}
                      returnKeyType="done"
                    />
                  </View>
                </ScrollView>

                <View style={styles.modalFooter}>
                  <Pressable style={styles.cancelBtn} onPress={closeModal}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.confirmBtn, (!gameName.trim() || isPublishing) && styles.confirmBtnDisabled]}
                    onPress={confirmPublish}
                    disabled={!gameName.trim() || isPublishing}
                  >
                    {isPublishing ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.confirmText}>Publish</Text>
                    )}
                  </Pressable>
                </View>
              </>
            ) : (
              <Animated.View
                style={[
                  styles.successContainer,
                  {
                    opacity: successAnimation,
                    transform: [
                      {
                        scale: successAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.8, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={styles.successIcon}>
                  <CustomIcon name="checkmark" size={SCREEN_W * 0.12} color="#FFFFFF" />
                </View>
                <Text style={styles.successTitle}>Game Published!</Text>
                <Text style={styles.successMessage}>"{gameName}" is now live and ready to play</Text>
              </Animated.View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// Advanced streaming constants
const STREAM_TIMEOUT_MS = 90000; // 90 seconds without tokens
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000; // 2 seconds between retries

// Function to extract token usage from API response
const extractTokenUsage = (responseData: any) => {
  if (responseData && responseData.usage) {
    return {
      prompt: responseData.usage.prompt_tokens,
      completion: responseData.usage.completion_tokens,
      total: responseData.usage.total_tokens
    };
  }
  return null;
};

// Wrapper function to get token usage after generation
async function generateWithTokenUsage(
  userPrompt: string,
  currentHtml?: string,
  onStreamUpdate?: (text: string) => void,
  codeId?: string,
  setStreamingStatus?: (status: 'connecting' | 'streaming' | 'waiting' | 'timeout' | 'error') => void,
  retryAttempt: number = 0
): Promise<{ content: string; tokenUsage: {prompt?: number, completion?: number, total?: number} | null }> {
  try {
    // Generate the content
    const content = await generateGameHtmlWithGPT(
      userPrompt,
      currentHtml,
      onStreamUpdate,
      codeId,
      setStreamingStatus,
      retryAttempt
    );

    // For now, we'll estimate token usage since streaming responses don't include usage
    // In a production app, you'd make a separate API call to get usage data
    const estimatedTokens = Math.ceil((userPrompt.length + (currentHtml?.length || 0) + content.length) / 4);
    const tokenUsage = {
      prompt: Math.ceil((userPrompt.length + (currentHtml?.length || 0)) / 4),
      completion: Math.ceil(content.length / 4),
      total: estimatedTokens
    };

    return { content, tokenUsage };
  } catch (error) {
    throw error;
  }
}

// Wrapper function for optimization with token usage
async function optimizeWithTokenUsage(
  htmlContent: string,
  stage1Errors?: string[],
  onStreamUpdate?: (text: string) => void,
  setStreamingStatus?: (status: 'connecting' | 'streaming' | 'waiting' | 'timeout' | 'error') => void,
  retryAttempt: number = 0
): Promise<{ optimizedHtml: string; errors: string[]; errors_found?: string[]; warnings?: string[]; tokenUsage: {prompt?: number, completion?: number, total?: number} | null }> {
  try {
    // Optimize the content
    const result = await optimizeHtmlForMobile(
      htmlContent,
      stage1Errors,
      onStreamUpdate,
      setStreamingStatus,
      retryAttempt
    );

    // Estimate token usage for optimization
    const estimatedTokens = Math.ceil((htmlContent.length + result.optimizedHtml.length) / 4);
    const tokenUsage = {
      prompt: Math.ceil(htmlContent.length / 4),
      completion: Math.ceil(result.optimizedHtml.length / 4),
      total: estimatedTokens
    };

    return { ...result, tokenUsage };
  } catch (error) {
    throw error;
  }
}

// Mobile/WebView compatibility optimization function
async function optimizeHtmlForMobile(
  htmlContent: string,
  stage1Errors?: string[],
  onStreamUpdate?: (text: string) => void,
  setStreamingStatus?: (status: 'connecting' | 'streaming' | 'waiting' | 'timeout' | 'error') => void,
  retryAttempt: number = 0
): Promise<{ optimizedHtml: string; errors: string[]; errors_found?: string[]; warnings?: string[]; mobile_improvements?: string[] }> {
  const appConfigService = AppConfigService.getInstance();
  const config = await appConfigService.getConfig();

  const apiKey = config.api_key_gpt ||
    (typeof process !== "undefined" &&
      (process as any).env &&
      (((process as any).env.EXPO_PUBLIC_OPENAI_API_KEY as string) || (process as any).env.OPENAI_API_KEY)) ||
    "";

  if (!apiKey) {
    throw new Error("Missing OpenAI API key");
  }

  const systemPrompt = await appConfigService.getSystemPrompt();

  // Prepare error information for the prompt
  const errorInfo = stage1Errors && stage1Errors.length > 0
    ? `**STAGE 1 ERRORS TO FIX:**\n${stage1Errors.map(error => `- ${error}`).join('\n')}`
    : '**STAGE 1 STATUS:** No errors detected in Stage 1 generation.';

    const optimizationPrompt = `<io_constraints>
    - Output format must be exactly:
    {"html":"<full, self-contained document>"}
    - Do not emit any extra text before or after the JSON object.
    - The HTML must remain a single, self-contained file (inline CSS/JS).
    </io_constraints>
    <mobile_optimizer>
<role>You rewrite a Stage‑1 single‑file HTML game into a mobile‑ready, error‑free, logic‑safe build.</role>
<context_fix priority="high">${errorInfo}</context_fix>
<input_html>${htmlContent}</input_html>
<reasoning level="high">Fix syntax/runtime first; preserve good logic; correct unsafe logic only.</reasoning>
<io>
Return exactly one JSON: {"html":"<full, self-contained document>"} — no extra text.
</io>
<mobile>
Add viewport meta. Canvas/WebGL fills innerWidth/innerHeight and updates on resize/orientation. Touch start/move/end call preventDefault. Add WebAudio blip for fire/jump and boom for collisions. Trigger navigator.vibrate(50) on fire/collisions when supported.
</mobile>
<controls>
Keep keyboard/mouse. Add left virtual joystick for movement; right drag/swipe for aim/camera; tap or double‑tap to fire/action.
</controls>
<loop>
Use requestAnimationFrame. Fixed‑step physics; if FPS < 30, throttle or interpolate.
</loop>
<overlay>Small help overlay bottom‑right; auto‑hide after 5s; toggle with H.</overlay>
<persistence>Assume no CDNs or large assets. Be concise and deterministic.</persistence>
</mobile_optimizer>

    &lt;task&gt; Rewrite Stage 1 HTML into a full mobile-ready version. Auto-fix any errors in code, syntax, or logic (unless existing logic is already correct). If Stage 1 errors were provided above, prioritize fixing those issues. Integrate joystick, audio, vibration, overlays, and performance improvements where applicable. &lt;/task&gt;
    &lt;input_html&gt;
    ${htmlContent}
    &lt;/input_html&gt;
    </mobile_optimizer_rules>`;

  const inputMessages: any[] = [
    {
      role: "developer",
      content: [
        {
          type: "text",
          text: systemPrompt,
        },
      ],
    },
    {
      role: "user",
      content: [{ type: "text", text: optimizationPrompt }],
    },
  ];

  return new Promise((resolve, reject) => {
    if (setStreamingStatus) setStreamingStatus('connecting');

    const abortController = new AbortController();
    let accumulatedText = '';
    let buffer = '';
    let lastTokenReceived = Date.now();
    let timeoutId: number;
    let hasReceivedFirstToken = false;

    const checkTimeout = () => {
      const now = Date.now();
      const timeSinceLastToken = now - lastTokenReceived;

      if (timeSinceLastToken > STREAM_TIMEOUT_MS) {
        console.log(`Optimization timeout: ${timeSinceLastToken}ms since last token`);
        if (setStreamingStatus) setStreamingStatus('timeout');
        abortController.abort();

        if (retryAttempt < MAX_RETRY_ATTEMPTS) {
          console.log(`Retrying optimization... Attempt ${retryAttempt + 1}/${MAX_RETRY_ATTEMPTS}`);
          setTimeout(() => {
            optimizeHtmlForMobile(
              htmlContent,
              stage1Errors,
              onStreamUpdate,
              setStreamingStatus,
              retryAttempt + 1
            ).then(resolve).catch(reject);
          }, RETRY_DELAY_MS);
          return;
        } else {
          reject(new Error(`Optimization timeout after ${MAX_RETRY_ATTEMPTS} attempts`));
          return;
        }
      }

      if (!hasReceivedFirstToken) {
        if (setStreamingStatus) setStreamingStatus('connecting');
      } else if (timeSinceLastToken > 10000) {
        if (setStreamingStatus) setStreamingStatus('waiting');
      } else {
        if (setStreamingStatus) setStreamingStatus('streaming');
      }

      timeoutId = setTimeout(checkTimeout, 2000);
    };

    timeoutId = setTimeout(checkTimeout, 2000);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://api.openai.com/v1/chat/completions', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);

    abortController.signal.addEventListener('abort', () => {
      xhr.abort();
      clearTimeout(timeoutId);
    });

    xhr.onprogress = (event) => {
      const responseText = xhr.responseText;
      const newData = responseText.slice(buffer.length);
      buffer = responseText;

      if (newData) {
        lastTokenReceived = Date.now();
        hasReceivedFirstToken = true;
        if (setStreamingStatus) setStreamingStatus('streaming');

        const lines = newData.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]') {
                clearTimeout(timeoutId);
                return;
              }

              const data = JSON.parse(jsonStr);
              if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                accumulatedText += data.choices[0].delta.content;
                if (onStreamUpdate) {
                  onStreamUpdate(accumulatedText);
                }
              }
            } catch (e) {
              // ignore non-JSON lines
            }
          }
        }
      }
    };

    xhr.onload = () => {
      clearTimeout(timeoutId);

      if (xhr.status !== 200) {
        if (setStreamingStatus) setStreamingStatus('error');
        reject(new Error(`OpenAI API error: HTTP ${xhr.status} ${xhr.statusText}`));
        return;
      }

      if (accumulatedText) {
        try {
          const obj = parseFirstJsonObject(accumulatedText);
          if (obj && typeof obj.html === "string") {
            const result = {
              optimizedHtml: finalizeHtmlString(obj.html),
              errors: Array.isArray(obj.errors) ? obj.errors : []
            };
            resolve(result);
            return;
          }

          // If no structured response, return original with empty errors
          resolve({
            optimizedHtml: htmlContent,
            errors: [],
            errors_found: [],
            warnings: []
          });
        } catch (error) {
          console.warn('Error processing optimization response:', error);
          resolve({
            optimizedHtml: htmlContent,
            errors: [],
            errors_found: [],
            warnings: []
          });
        }
      } else {
        if (setStreamingStatus) setStreamingStatus('error');
        reject(new Error("No content received from optimization API"));
      }
    };

    xhr.onerror = (error) => {
      clearTimeout(timeoutId);
      console.error('Optimization XHR Error:', error);
      if (setStreamingStatus) setStreamingStatus('error');

      if (retryAttempt < MAX_RETRY_ATTEMPTS) {
        console.log(`Optimization network error, retrying... Attempt ${retryAttempt + 1}/${MAX_RETRY_ATTEMPTS}`);
        setTimeout(() => {
          optimizeHtmlForMobile(
            htmlContent,
            stage1Errors,
            onStreamUpdate,
            setStreamingStatus,
            retryAttempt + 1
          ).then(resolve).catch(reject);
        }, RETRY_DELAY_MS);
      } else {
        reject(new Error(`Optimization network error after ${MAX_RETRY_ATTEMPTS} attempts`));
      }
    };

    const requestBody = {
      model: config.model_name,
      messages: inputMessages,
      response_format: {
        type: 'text'
      },
      verbosity: config.verbosity,
      reasoning_effort: config.reasoning_effort,
      stream: true
    };

    xhr.send(JSON.stringify(requestBody));
  });
}

// Generate game HTML with advanced streaming
async function generateGameHtmlWithGPT(
  userPrompt: string,
  currentHtml?: string,
  onStreamUpdate?: (text: string) => void,
  codeId?: string,
  setStreamingStatus?: (status: 'connecting' | 'streaming' | 'waiting' | 'timeout' | 'error') => void,
  retryAttempt: number = 0
): Promise<string> {
  const appConfigService = AppConfigService.getInstance();
  const config = await appConfigService.getConfig();
  
  const apiKey = config.api_key_gpt || 
    (typeof process !== "undefined" &&
      (process as any).env &&
      (((process as any).env.EXPO_PUBLIC_OPENAI_API_KEY as string) || (process as any).env.OPENAI_API_KEY)) ||
    "";

  if (!apiKey) {
    throw new Error("Missing OpenAI API key");
  }

  const systemPrompt = await appConfigService.getSystemPrompt();

  const inputMessages: any[] = [
    {
      role: "developer",
      content: [
        {
          type: "text",
          text: systemPrompt,
        },
      ],
    },
  ];

  if (currentHtml && currentHtml.trim().length > 0) {
    // Use HTML Patch Emitter for iterative changes
    const patchEmitterPrompt = `<patch_emitter_rules>
<role>System Prompt: HTML Patch Emitter — You are an automated HTML patch generator. Your only job is to output edit directives that transform the provided HTML to satisfy the user's request.</role>

<inputs> - The user will provide the current HTML source with line numbers in the format: "LINE_NUMBER|CONTENT". - Line numbers are 1-based (e.g., 1|<html>). - The user will also describe the desired feature, fix, or change. </inputs>
<output_protocol>
- Emit only edit directives. One directive per line. No extra text, commentary, explanations, or code fences.
</output_protocol>

<format> - Insert (add): <lnN|+TEXT|> → Inserts TEXT on a new line immediately after line N. - Use ln0 to insert at the very top of the file. - Remove (delete): <lnN|-TEXT|> → Removes TEXT from line N. If the whole line should be deleted, include the full current line content as TEXT. - Multi-line inserts/removals: emit one directive per line of code to add or remove, in the desired order. - Replacement: emit removal directive(s) and insertion directive(s) for the same location within the same response. The order of + and - lines does not matter. </format> <constraints> - Produce all required additions and removals in a single response; do not split edits across messages. - Do not modify unrelated lines or formatting/whitespace. - Keep TEXT exactly as it should appear in the final file (including indentation). - Only modify HTML or inline <style>/<script> if necessary to fulfill the request. </constraints> <reasoning level="medium"> - Be precise and avoid conflicting edits. - Emit the minimal set of directives needed to achieve the requested change. </reasoning> <persistence> - If the request cannot be unambiguously mapped to specific lines, ask the user to provide the current HTML with sufficient context and target locations; do not guess. </persistence> <examples> - Add a button after line 22: <ln22|+<button id="save">Save</button>|> - Remove a meta tag on line 5: <ln5|-<meta name="viewport" content="width=device-width, initial-scale=1.0">|> - Replace an h1 on line 12: <ln12|-<h1>Old</h1>|> <ln12|+<h1>New</h1>|> - Insert at top of file: <ln0|+<!doctype html>|> </examples> </patch_emitter_rules>`;
    inputMessages.push({
      role: "developer",
      content: [
        {
          type: "text",
          text: patchEmitterPrompt,
        },
        {
          type: "text",
          text: `CURRENT_HTML_START\n${addLineNumbersToHtml(currentHtml)}\nCURRENT_HTML_END`,
        },
      ],
    });
  }

  inputMessages.push({
    role: "user",
    content: [{ type: "text", text: userPrompt }],
  });

  return new Promise((resolve, reject) => {
    if (setStreamingStatus) setStreamingStatus('connecting');
    
    const abortController = new AbortController();
    let accumulatedText = '';
    let buffer = '';
    let lastTokenReceived = Date.now();
    let timeoutId: number;
    let hasReceivedFirstToken = false;

    // Set up timeout monitoring
    const checkTimeout = () => {
      const now = Date.now();
      const timeSinceLastToken = now - lastTokenReceived;
      
      if (timeSinceLastToken > STREAM_TIMEOUT_MS) {
        console.log(`Stream timeout detected: ${timeSinceLastToken}ms since last token`);
        if (setStreamingStatus) setStreamingStatus('timeout');
        
        abortController.abort();
        
        // Retry if we haven't exceeded max attempts
        if (retryAttempt < MAX_RETRY_ATTEMPTS) {
          console.log(`Retrying stream... Attempt ${retryAttempt + 1}/${MAX_RETRY_ATTEMPTS}`);
          setTimeout(() => {
            generateGameHtmlWithGPT(
              userPrompt,
              currentHtml,
              onStreamUpdate,
              codeId,
              setStreamingStatus,
              retryAttempt + 1
            ).then(resolve).catch(reject);
          }, RETRY_DELAY_MS);
          return;
        } else {
          reject(new Error(`Stream timeout after ${MAX_RETRY_ATTEMPTS} attempts`));
          return;
        }
      }
      
      // Update UI status
      if (!hasReceivedFirstToken) {
        if (setStreamingStatus) setStreamingStatus('connecting');
      } else if (timeSinceLastToken > 10000) { // 10 seconds without tokens
        if (setStreamingStatus) setStreamingStatus('waiting');
      } else {
        if (setStreamingStatus) setStreamingStatus('streaming');
      }
      
      timeoutId = setTimeout(checkTimeout, 2000); // Check every 2 seconds
    };

    timeoutId = setTimeout(checkTimeout, 2000);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://api.openai.com/v1/chat/completions', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);

    // Handle abort
    abortController.signal.addEventListener('abort', () => {
      xhr.abort();
      clearTimeout(timeoutId);
    });

    xhr.onprogress = (event) => {
      const responseText = xhr.responseText;
      const newData = responseText.slice(buffer.length);
      buffer = responseText;

      if (newData) {
        lastTokenReceived = Date.now();
        hasReceivedFirstToken = true;
        if (setStreamingStatus) setStreamingStatus('streaming');

        const lines = newData.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]') {
                clearTimeout(timeoutId);
                return;
              }
              
              const data = JSON.parse(jsonStr);
              if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                accumulatedText += data.choices[0].delta.content;
                if (onStreamUpdate) {
                  onStreamUpdate(accumulatedText);
                }
              }
            } catch (e) {
              // ignore non-JSON lines
            }
          }
        }
      }
    };

    xhr.onload = () => {
      clearTimeout(timeoutId);
      
      if (xhr.status !== 200) {
        if (setStreamingStatus) setStreamingStatus('error');
        reject(new Error(`OpenAI API error: HTTP ${xhr.status} ${xhr.statusText}`));
        return;
      }

      if (accumulatedText) {
        try {
          // Check if this is an iterative generation (patch-based) or initial generation (JSON-based)
          if (currentHtml && currentHtml.trim().length > 0) {
            // This is a patch response - parse directives and apply to current HTML
            const patches = parsePatchDirectives(accumulatedText);
            if (patches.length > 0) {
              const patchedHtml = applyPatches(currentHtml, patches);
              resolve(patchedHtml);
              return;
            }
            // If no patches found, fall back to treating as regular response
          }

          // Handle initial generation responses (JSON/HTML)
          const obj = parseFirstJsonObject(accumulatedText);
          if (obj && typeof obj.html === "string") {
            const finalHtml = finalizeHtmlString(obj.html);
            resolve(finalHtml);
            return;
          }

          const htmlBlock = extractHtmlBlock(accumulatedText);
          if (htmlBlock) {
            resolve(htmlBlock);
            return;
          }

          const cleaned = stripCodeFences(accumulatedText).trim();
          const cleanedObj = parseFirstJsonObject(cleaned);
          if (cleanedObj && typeof cleanedObj.html === "string") {
            const finalHtml = finalizeHtmlString(cleanedObj.html);
            resolve(finalHtml);
            return;
          }

          resolve(accumulatedText);
        } catch (error) {
          console.warn('Error processing accumulated text:', error);
          resolve(accumulatedText);
        }
      } else {
        if (setStreamingStatus) setStreamingStatus('error');
        reject(new Error("No content received from the API"));
      }
    };

    xhr.onerror = (error) => {
      clearTimeout(timeoutId);
      console.error('XHR Error:', error);
      if (setStreamingStatus) setStreamingStatus('error');
      
      // Retry on network error if we haven't exceeded max attempts
      if (retryAttempt < MAX_RETRY_ATTEMPTS) {
        console.log(`Network error, retrying... Attempt ${retryAttempt + 1}/${MAX_RETRY_ATTEMPTS}`);
        setTimeout(() => {
          generateGameHtmlWithGPT(
            userPrompt,
            currentHtml,
            onStreamUpdate,
            codeId,
            setStreamingStatus,
            retryAttempt + 1
          ).then(resolve).catch(reject);
        }, RETRY_DELAY_MS);
      } else {
        reject(new Error(`Network error after ${MAX_RETRY_ATTEMPTS} attempts`));
      }
    };

    const requestBody = {
      model: config.model_name,
      messages: inputMessages,
      response_format: {
        type: 'text'
      },
      verbosity: config.verbosity,
      reasoning_effort: config.reasoning_effort,
      stream: true
    };

    xhr.send(JSON.stringify(requestBody));
  });
}

// HTML Patch Parser and Applier
interface PatchDirective {
  lineNumber: number;
  action: 'insert' | 'remove';
  text: string;
}

function parsePatchDirectives(patchText: string): PatchDirective[] {
  const directives: PatchDirective[] = [];
  const lines = patchText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match <lnN|+TEXT|> or <lnN|-TEXT|>
    const match = trimmed.match(/^<ln(\d+)\|([+-])(.+)\|>$/);
    if (match) {
      const [, lineNum, action, text] = match;
      directives.push({
        lineNumber: parseInt(lineNum, 10),
        action: action === '+' ? 'insert' : 'remove',
        text: text
      });
    }
  }

  return directives;
}

function applyPatches(html: string, patches: PatchDirective[]): string {
  const lines = html.split('\n');
  let resultLines = [...lines];

  // Sort patches by line number (descending for removals, ascending for insertions)
  const sortedPatches = patches.sort((a, b) => {
    if (a.lineNumber !== b.lineNumber) {
      return b.lineNumber - a.lineNumber; // Process higher line numbers first
    }
    // For same line, process removals before insertions
    return a.action === 'remove' ? -1 : 1;
  });

  for (const patch of sortedPatches) {
    if (patch.action === 'remove') {
      // Find and remove the exact text from the line
      if (patch.lineNumber === 0) continue; // ln0 is only for inserts

      const lineIndex = patch.lineNumber - 1; // Convert to 0-based
      if (lineIndex >= 0 && lineIndex < resultLines.length) {
        const currentLine = resultLines[lineIndex];
        const textIndex = currentLine.indexOf(patch.text);
        if (textIndex !== -1) {
          const beforeText = currentLine.substring(0, textIndex);
          const afterText = currentLine.substring(textIndex + patch.text.length);
          resultLines[lineIndex] = beforeText + afterText;
        }
      }
    } else if (patch.action === 'insert') {
      const insertText = patch.text;

      if (patch.lineNumber === 0) {
        // Insert at the very beginning
        resultLines.unshift(insertText);
      } else {
        // Insert after the specified line
        const lineIndex = patch.lineNumber - 1; // Convert to 0-based
        if (lineIndex >= 0 && lineIndex < resultLines.length) {
          resultLines.splice(lineIndex + 1, 0, insertText);
        } else if (lineIndex >= resultLines.length) {
          // Append to end if line number is beyond current lines
          resultLines.push(insertText);
        }
      }
    }
  }

  return resultLines.join('\n');
}

// Add line numbers to HTML for patch emitter
function addLineNumbersToHtml(html: string): string {
  const lines = html.split('\n');
  const maxLineNumber = lines.length;
  const lineNumberWidth = maxLineNumber.toString().length;

  const numberedLines = lines.map((line, index) => {
    const lineNumber = (index + 1).toString().padStart(lineNumberWidth, ' ');
    return `${lineNumber}|${line}`;
  });

  return numberedLines.join('\n');
}

// Helper functions
function stripCodeFences(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith("```")) {
    const firstLineEnd = trimmed.indexOf("\n");
    const bodyStart = firstLineEnd !== -1 ? firstLineEnd + 1 : 3;
    const closing = trimmed.lastIndexOf("```");
    if (closing > bodyStart) {
      return trimmed.slice(bodyStart, closing).trim();
    }
  }
  return s;
}

function parseFirstJsonObject(s: string): any | null {
  try {
    if (s.trim().startsWith("{")) {
      return JSON.parse(s);
    }
  } catch {
    // ignore
  }
  const slice = extractJsonObjectAsString(s);
  if (!slice) return null;
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function extractJsonObjectAsString(s: string): string | null {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return s.slice(start, end + 1);
  }
  return null;
}

function extractHtmlBlock(s: string): string | null {
  const lower = s.toLowerCase();
  const doctypeIdx = lower.indexOf("<!doctype html");
  const htmlIdx = lower.indexOf("<html");
  const start = doctypeIdx !== -1 ? doctypeIdx : htmlIdx;
  if (start !== -1) {
    const end = lower.lastIndexOf("</html>");
    if (end !== -1) {
      return s.slice(start, end + "</html>".length);
    }
  }
  return null;
}

function decodeJsonStringLiteralIfAny(s: string): string | null {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    try {
      const normalized = t.startsWith("'") ? `"${t.slice(1, -1).replace(/"/g, '\\"')}"` : t;
      return JSON.parse(normalized);
    } catch {
      // ignore
    }
  }
  return null;
}

function finalizeHtmlString(htmlMaybeEscaped: string): string {
  const decoded = decodeJsonStringLiteralIfAny(htmlMaybeEscaped);
  const html = decoded ?? htmlMaybeEscaped;

  if (/[\n\r\t"]/g.test(html)) {
    try {
      const wrapped = `"${html.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      const once = JSON.parse(wrapped);
      if (isLikelyHtml(once)) return once;
    } catch {
      // ignore
    }
  }
  return html;
}

function isLikelyHtml(s: string): boolean {
  const lower = s.toLowerCase();
  return lower.includes("<!doctype html") || (lower.includes("<html") && lower.includes("</html>"));
}

function generateDefaultGame() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"/>
<meta name="theme-color" content="#000000"/>
<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; media-src * data: blob:; img-src * data: blob:;">
<title>Three.js Preview</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #000;
    touch-action: none;
  }
  #canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .info {
    position: absolute;
    top: 10px;
    left: 10px;
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
    background: rgba(0,0,0,0.5);
    padding: 10px;
    border-radius: 5px;
  }
  .error {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    text-align: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>
  <canvas id="canvas"></canvas>
  <div class="info">Three.js Ready - Describe your 3D game below</div>
  
  <script>
    // Check WebGL support
    function webglAvailable() {
      try {
        const canvas = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && 
          (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
      } catch(e) {
        return false;
      }
    }
    
    if (!webglAvailable()) {
      document.body.innerHTML = '<div class="error"><h2>WebGL Not Supported</h2><p>Your device does not support WebGL</p></div>';
    } else {
      // Simple Three.js scene
      try {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        
        const canvas = document.getElementById('canvas');
        const renderer = new THREE.WebGLRenderer({ 
          canvas: canvas,
          antialias: true,
          alpha: true,
          powerPreference: "high-performance"
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        // Add a simple cube
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ 
          color: 0x7C3AED,
          wireframe: true 
        });
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);
        
        camera.position.z = 3;
        
        // Animation loop
        function animate() {
          requestAnimationFrame(animate);
          cube.rotation.x += 0.01;
          cube.rotation.y += 0.01;
          renderer.render(scene, camera);
        }
        
        // Handle resize
        window.addEventListener('resize', () => {
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        animate();
        
        // Post message to React Native
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'three-js-ready',
            message: 'Three.js initialized successfully'
          }));
        }
        
      } catch(error) {
        console.error('Three.js initialization error:', error);
        document.body.innerHTML = '<div class="error"><h2>Three.js Error</h2><p>' + error.message + '</p></div>';
      }
    }
  </script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SCREEN_W * 0.05,
    paddingTop: SCREEN_H * 0.02, // Add some top padding for status bar
    paddingBottom: SCREEN_H * 0.015,
    borderBottomWidth: 1,
    borderBottomColor: "#111111",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  headerBlur: {
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  title: {
    fontSize: SCREEN_W * 0.045,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  headerButtons: {
    flexDirection: "row",
    gap: SCREEN_W * 0.01,
    alignItems: "center",
  },
  versionDropdown: {
    marginRight: SCREEN_W * 0.02,
  },
  versionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SCREEN_W * 0.01,
    backgroundColor: "#374151",
    paddingHorizontal: SCREEN_W * 0.025,
    paddingVertical: SCREEN_H * 0.008,
    borderRadius: SCREEN_W * 0.02,
    borderWidth: 1,
    borderColor: "#4B5563",
  },
  versionText: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.032,
    fontWeight: "600",
  },
  newChatBtn: {
    padding: SCREEN_W * 0.02,
    alignItems: "center",
    justifyContent: "center",
  },
  // Removed voteBtn style since auto-vote is implemented
  retryBtn: {
    padding: SCREEN_W * 0.02,
    alignItems: "center",
    justifyContent: "center",
  },
  publishBtn: {
    padding: SCREEN_W * 0.02,
    alignItems: "center",
    justifyContent: "center",
  },
  mainContent: {
    flex: 1,
    paddingTop: SCREEN_H * 0.06, // Reduced gap significantly
  },
  gameContainer: {
    flex: 1,
    paddingHorizontal: SCREEN_W * 0.02,
    paddingTop: SCREEN_H * 0.01,
    paddingBottom: SCREEN_H * 0.01,
    justifyContent: "center",
  },
  tabContainer: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    borderRadius: Math.min(SCREEN_W * 0.04, 16),
    overflow: "hidden",
    minHeight: SCREEN_H * 0.5,
    maxHeight: SCREEN_H * 0.8,
  },
  tabHeaders: {
    backgroundColor: "#000000",
    position: "relative",
    paddingHorizontal: SCREEN_W * 0.03,
    paddingVertical: SCREEN_H * 0.008,
  },
  tabButtonsContainer: {
    flexDirection: "row",
    gap: SCREEN_W * 0.02,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SCREEN_H * 0.008,
    paddingHorizontal: SCREEN_W * 0.025,
    gap: SCREEN_W * 0.015,
    backgroundColor: "#2D2D2D",
    borderRadius: SCREEN_W * 0.015,
  },
  tabButtonActive: {
    backgroundColor: "#4A4A4A",
  },
  tabButtonSelected: {
    backgroundColor: "#4A4A4A",
  },
  tabButtonFullWidth: {
    flex: 1,
    marginHorizontal: SCREEN_W * 0.02,
  },
  tabTextContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: SCREEN_W * 0.01,
  },
  tabButtonText: {
    fontSize: SCREEN_W * 0.032,
    fontWeight: "600",
    color: "#A1A1AA",
  },
  tabButtonTextActive: {
    color: "#FFFFFF",
  },

  tabLoader: {
    marginLeft: SCREEN_W * 0.01,
  },
  // Removed tabIndicator style since we removed the purple indicator
  gameFrame: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    borderRadius: Math.min(SCREEN_W * 0.04, 16),
    overflow: "hidden",
    minHeight: SCREEN_H * 0.5,
    maxHeight: SCREEN_H * 0.8,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
    } : {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: SCREEN_H * 0.005 },
      shadowOpacity: 0.3,
      shadowRadius: SCREEN_H * 0.015,
      elevation: 8,
    }),
    position: "relative",
  },
  gameWebview: {
    flex: 1,
    backgroundColor: "transparent",
    // Add these for better Three.js performance
    opacity: 0.99, // Forces GPU acceleration
    overflow: 'hidden',
  },
  loadingOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    gap: SCREEN_H * 0.02,
    borderRadius: Math.min(SCREEN_W * 0.04, 16),
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.04,
    fontWeight: "600",
  },
  errorOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    gap: SCREEN_H * 0.02,
    borderRadius: Math.min(SCREEN_W * 0.04, 16),
    padding: SCREEN_W * 0.04,
  },
  errorTitle: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.05,
    fontWeight: "700",
  },
  errorMessage: {
    color: "#A1A1AA",
    fontSize: SCREEN_W * 0.035,
    textAlign: "center",
    lineHeight: SCREEN_H * 0.025,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SCREEN_W * 0.02,
    backgroundColor: "#7C3AED",
    paddingHorizontal: SCREEN_W * 0.05,
    paddingVertical: SCREEN_H * 0.013,
    borderRadius: SCREEN_W * 0.03,
    marginTop: SCREEN_H * 0.01,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.04,
    fontWeight: "600",
  },
  selectionOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: Math.min(SCREEN_W * 0.04, 16),
    overflow: "hidden",
  },
  selectionBlur: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: SCREEN_W * 0.06,
  },
  selectionContent: {
    backgroundColor: "#1A1A1A",
    borderRadius: SCREEN_W * 0.04,
    padding: SCREEN_W * 0.06,
    width: "100%",
    maxWidth: SCREEN_W * 0.85,
    borderWidth: 1,
    borderColor: "#333333",
  },
  selectionTitle: {
    fontSize: SCREEN_W * 0.05,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: SCREEN_H * 0.01,
  },
  selectionDescription: {
    fontSize: SCREEN_W * 0.035,
    color: "#A1A1AA",
    textAlign: "center",
    marginBottom: SCREEN_H * 0.03,
    lineHeight: SCREEN_H * 0.025,
  },
  selectionButtons: {
    gap: SCREEN_H * 0.015,
  },
  selectionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SCREEN_W * 0.03,
    backgroundColor: "#111111",
    paddingVertical: SCREEN_H * 0.018,
    paddingHorizontal: SCREEN_W * 0.05,
    borderRadius: SCREEN_W * 0.03,
    borderWidth: 2,
    borderColor: "#7C3AED",
  },
  selectionButtonDisabled: {
    opacity: 0.5,
    borderColor: "#333333",
  },
  selectionButtonText: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.04,
    fontWeight: "600",
  },
  selectionButtonError: {
    color: "#EF4444",
    fontSize: SCREEN_W * 0.03,
    fontWeight: "500",
  },
  votingActionButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: SCREEN_H * 0.02,
    gap: SCREEN_W * 0.04,
  },
  voteLaterButton: {
    backgroundColor: "#374151",
    paddingHorizontal: SCREEN_W * 0.04,
    paddingVertical: SCREEN_H * 0.01,
    borderRadius: SCREEN_W * 0.02,
    flex: 1,
    alignItems: "center",
  },
  voteLaterText: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.035,
    fontWeight: "600",
  },
  retryLink: {
    flex: 1,
    alignItems: "center",
  },
  retryLinkText: {
    color: "#7C3AED",
    fontSize: SCREEN_W * 0.035,
    fontWeight: "600",
    textDecorationLine: "underline",
    textAlign: "center",
  },
  inlineOverlayContainer: {
    position: "absolute",
    left: SCREEN_W * 0.03,
    right: SCREEN_W * 0.03,
    bottom: SCREEN_W * 0.03
  },
  inlineShadow: {
    borderRadius: SCREEN_W * 0.035,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    overflow: "visible"
  },
  inlineGlassCard: {
    borderRadius: SCREEN_W * 0.035,
    overflow: "hidden"
  },
  inlineCardBody: {
    paddingHorizontal: SCREEN_W * 0.03,
    paddingVertical: SCREEN_H * 0.012
  },
  glassStroke: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)"
  },
  inlineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SCREEN_H * 0.01
  },
  inlineTitle: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.032,
    fontWeight: "700",
    letterSpacing: -0.2
  },
  inlineTitleContainer: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  inlineCountdown: {
    color: "#FFFFFF",
    opacity: 0.9,
    fontSize: SCREEN_W * 0.03,
    fontVariant: ["tabular-nums"]
  },
  networkStatusContainer: {
    marginVertical: SCREEN_H * 0.006
  },
  networkStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: SCREEN_W * 0.02,
    paddingHorizontal: SCREEN_W * 0.025,
    paddingVertical: SCREEN_H * 0.006,
    borderRadius: 14,
    backgroundColor: "rgba(118,118,128,0.24)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)"
  },
  networkDot: {
    width: SCREEN_W * 0.02,
    height: SCREEN_W * 0.02,
    borderRadius: 999
  },
  networkStatusText: {
    fontSize: SCREEN_W * 0.026,
    fontWeight: "600",
    color: "#FFFFFF"
  },
  inlineTrack: {
    height: SCREEN_H * 0.008,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: SCREEN_H * 0.01
  },
  inlineFill: {
    height: "100%",
    backgroundColor: "#0A84FF",
    borderRadius: 999,
    overflow: "hidden"
  },
  shineWrap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: SCREEN_W * 0.18,
    opacity: 0.55
  },
  streamingTextContainer: {
    maxHeight: SCREEN_H * 0.16,
    marginTop: SCREEN_H * 0.012,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: SCREEN_W * 0.025,
    padding: SCREEN_W * 0.025,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)"
  },
  streamingText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: SCREEN_W * 0.026,
    fontFamily: Platform.OS === "ios" ? "SFMono-Regular" : "monospace",
    lineHeight: SCREEN_H * 0.018
  },
  inputSectionContainer: {
    paddingHorizontal: SCREEN_W * 0.04,
    paddingTop: SCREEN_H * 0.01,
    backgroundColor: "transparent",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#111111",
    borderRadius: SCREEN_W * 0.06,
    paddingLeft: SCREEN_W * 0.04,
    paddingRight: SCREEN_W * 0.015,
    borderWidth: 1,
    borderColor: "#333333",
    minHeight: SCREEN_H * 0.06,
  },
  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.04,
    maxHeight: SCREEN_H * 0.1,
    minHeight: SCREEN_H * 0.045,
    paddingVertical: SCREEN_H * 0.015,
    paddingRight: SCREEN_W * 0.02,
    textAlignVertical: "center",
  },
  sendBtn: {
    width: SCREEN_W * 0.09,
    height: SCREEN_W * 0.09,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7C3AED",
    borderRadius: SCREEN_W * 0.045,
    marginBottom: SCREEN_H * 0.005,
    marginLeft: SCREEN_W * 0.02,
    marginVertical: SCREEN_H * 0.005,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  inputBlur: {
    borderRadius: SCREEN_W * 0.07,
    overflow: "hidden",
    backgroundColor: "rgba(17,17,17,0.4)",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: SCREEN_W * 0.05,
    paddingVertical: SCREEN_H * 0.08,
  },
  modalBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  modalContent: {
    backgroundColor: "#111111",
    borderRadius: SCREEN_W * 0.06,
    width: "100%",
    maxWidth: SCREEN_W * 0.9,
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: "#333333",
    alignSelf: "center",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SCREEN_W * 0.06,
    paddingTop: SCREEN_H * 0.06,
    paddingBottom: SCREEN_H * 0.04,
  },
  modalTitle: {
    fontSize: SCREEN_W * 0.05,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  modalSubtitle: {
    fontSize: SCREEN_W * 0.035,
    fontWeight: "500",
    color: "#A1A1AA",
    marginTop: SCREEN_H * 0.005,
  },
  modalBody: {
    paddingHorizontal: SCREEN_W * 0.06,
    paddingVertical: SCREEN_H * 0.01,
    maxHeight: SCREEN_H * 0.4,
  },
  inputGroup: {
    gap: SCREEN_H * 0.01,
    marginBottom: SCREEN_H * 0.025,
  },
  inputLabel: {
    fontSize: SCREEN_W * 0.035,
    fontWeight: "600",
    color: "#A1A1AA",
  },
  modalInput: {
    backgroundColor: "#000000",
    borderRadius: SCREEN_W * 0.03,
    paddingHorizontal: SCREEN_W * 0.04,
    paddingVertical: SCREEN_H * 0.015,
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.04,
    borderWidth: 1,
    borderColor: "#333333",
  },
  textArea: {
    height: SCREEN_H * 0.1,
    textAlignVertical: "top",
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: SCREEN_W * 0.06,
    paddingVertical: SCREEN_H * 0.06,
    gap: SCREEN_W * 0.03,
  },
  cancelBtn: {
    paddingHorizontal: SCREEN_W * 0.05,
    paddingVertical: SCREEN_H * 0.012,
  },
  cancelText: {
    color: "#A1A1AA",
    fontSize: SCREEN_W * 0.04,
    fontWeight: "600",
  },
  confirmBtn: {
    backgroundColor: "#7C3AED",
    paddingHorizontal: SCREEN_W * 0.06,
    paddingVertical: SCREEN_H * 0.015,
    borderRadius: SCREEN_W * 0.03,
    minWidth: SCREEN_W * 0.25,
    alignItems: "center",
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmText: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.04,
    fontWeight: "700",
  },
  successContainer: {
    alignItems: "center",
    padding: SCREEN_W * 0.1,
    gap: SCREEN_H * 0.02,
  },
  successIcon: {
    width: SCREEN_W * 0.2,
    height: SCREEN_W * 0.2,
    backgroundColor: "#10B981",
    borderRadius: SCREEN_W * 0.1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SCREEN_H * 0.01,
  },
  successTitle: {
    fontSize: SCREEN_W * 0.06,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  successMessage: {
    fontSize: SCREEN_W * 0.04,
    color: "#A1A1AA",
    textAlign: "center",
    lineHeight: SCREEN_H * 0.027,
  },

  // 2-stage generation styles
  stageIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SCREEN_W * 0.03,
    marginTop: SCREEN_H * 0.005,
  },
  stageIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SCREEN_W * 0.015,
  },
  stageDot: {
    width: SCREEN_W * 0.02,
    height: SCREEN_W * 0.02,
    borderRadius: SCREEN_W * 0.01,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  stageDotActive: {
    backgroundColor: '#10B981',
  },
  tokenUsageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SCREEN_W * 0.01,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: SCREEN_W * 0.02,
    paddingVertical: SCREEN_H * 0.004,
    borderRadius: SCREEN_W * 0.015,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  tokenUsageText: {
    color: '#6B7280',
    fontSize: SCREEN_W * 0.024,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },

  // Error display styles
  errorDisplayContainer: {
    marginVertical: SCREEN_H * 0.01,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: SCREEN_W * 0.025,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: SCREEN_W * 0.03,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SCREEN_W * 0.02,
    marginBottom: SCREEN_H * 0.01,
  },
  errorHeaderText: {
    color: '#EF4444',
    fontSize: SCREEN_W * 0.032,
    fontWeight: '600',
  },
  errorList: {
    maxHeight: SCREEN_H * 0.12,
  },
  errorItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SCREEN_W * 0.02,
    marginBottom: SCREEN_H * 0.008,
    paddingVertical: SCREEN_H * 0.005,
  },
  errorText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: SCREEN_W * 0.028,
    flex: 1,
    lineHeight: SCREEN_H * 0.02,
  },
  fixedErrorText: {
    color: '#10B981',
    fontWeight: '600',
  },
  debugItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SCREEN_W * 0.02,
    marginBottom: SCREEN_H * 0.008,
    paddingVertical: SCREEN_H * 0.005,
    opacity: 0.8,
  },
  debugText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: SCREEN_W * 0.026,
    flex: 1,
    lineHeight: SCREEN_H * 0.018,
    fontStyle: 'italic',
  },
  mobileImprovementItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SCREEN_W * 0.02,
    marginBottom: SCREEN_H * 0.008,
    paddingVertical: SCREEN_H * 0.005,
    opacity: 0.9,
  },
  mobileImprovementText: {
    color: '#10B981',
    fontSize: SCREEN_W * 0.028,
    flex: 1,
    lineHeight: SCREEN_H * 0.02,
    fontWeight: '500',
  },

  // Stage-specific text containers
  stageTextContainer: {
    maxHeight: SCREEN_H * 0.08,
    marginTop: SCREEN_H * 0.01,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: SCREEN_W * 0.02,
    padding: SCREEN_W * 0.02,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  stageText: {
    color: '#10B981',
    fontSize: SCREEN_W * 0.028,
    fontFamily: Platform.OS === 'ios' ? 'SFMono-Regular' : 'monospace',
    lineHeight: SCREEN_H * 0.02,
  },

  // Optimization text container
  optimizationTextContainer: {
    maxHeight: SCREEN_H * 0.12,
    marginTop: SCREEN_H * 0.01,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: SCREEN_W * 0.02,
    padding: SCREEN_W * 0.02,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  optimizationText: {
    color: '#F59E0B',
    fontSize: SCREEN_W * 0.026,
    fontFamily: Platform.OS === 'ios' ? 'SFMono-Regular' : 'monospace',
    lineHeight: SCREEN_H * 0.018,
    marginBottom: SCREEN_H * 0.005,
  },
});
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
  AppState,
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

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");

// Types
interface GameVersion {
  html: string;
  prompt: string;
  timestamp: number;
  stage: 'simple' | 'checklist' | 'mvp' | 'mobile' | 'final';
}

interface GenerationSession {
  initialPrompt: string;
  versions: GameVersion[];
  currentVersionIndex: number;
}

interface AgentStep {
  name: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  output?: string;
  error?: string;
}

interface LintError {
  message: string;
  line: number;
  snippet: string;
}

interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

// HTML Linter (simplified version of Python linter)
const VOID_TAGS = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr","command","keygen","menuitem"]);

function removeBlocks(html: string, tag: string): string {
  const regex = new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, 'gi');
  return html.replace(regex, "");
}

function stripComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function lintHtml(html: string): LintError[] {
  const errors: LintError[] = [];
  const lines = html.split('\n');
  
  // Remove code fences if present
  const cleanHtml = html.replace(/^\s*```[a-zA-Z]*\s*|\s*```\s*$/gm, "");
  const checkHtml = stripComments(cleanHtml);
  const scrubbed = removeBlocks(removeBlocks(checkHtml, "script"), "style");

  // Check for DOCTYPE
  if (!checkHtml.toLowerCase().includes('<!doctype html')) {
    errors.push({
      message: "Missing <!DOCTYPE html> at top",
      line: 1,
      snippet: lines[0]?.trim() || ""
    });
  }

  // Check for required tags
  for (const tag of ['html', 'head', 'body']) {
    const matches = (checkHtml.match(new RegExp(`<\\s*${tag}\\b`, 'gi')) || []).length;
    if (matches === 0) {
      errors.push({
        message: `Missing <${tag}> tag`,
        line: 1,
        snippet: ""
      });
    } else if (matches > 1) {
      errors.push({
        message: `Multiple <${tag}> tags found (${matches})`,
        line: 1,
        snippet: ""
      });
    }
  }

  // Basic tag balance check
  const tagMatches = scrubbed.matchAll(/<\s*(\/)?([a-zA-Z][a-zA-Z0-9\-]*)\b[^>]*?>/g);
  const stack: string[] = [];
  
  for (const match of tagMatches) {
    const [fullMatch, closing, tag] = match;
    const tagLower = tag.toLowerCase();
    
    if (tagLower === 'doctype') continue;
    
    const isSelfClosed = fullMatch.trim().endsWith('/>');
    
    if (!closing) {
      if (!VOID_TAGS.has(tagLower) && !isSelfClosed) {
        stack.push(tagLower);
      }
    } else {
      if (VOID_TAGS.has(tagLower)) {
        errors.push({
          message: `Unexpected closing tag </${tagLower}> for void element`,
          line: 1,
          snippet: ""
        });
        continue;
      }
      
      if (stack.length === 0) {
        errors.push({
          message: `Unmatched closing tag </${tagLower}>`,
          line: 1,
          snippet: ""
        });
        continue;
      }
      
      const lastTag = stack[stack.length - 1];
      if (lastTag !== tagLower) {
        errors.push({
          message: `Mismatched closing tag </${tagLower}>; expected </${lastTag}>`,
          line: 1,
          snippet: ""
        });
      }
      stack.pop();
    }
  }

  // Check for unclosed tags
  for (const unclosedTag of stack) {
    errors.push({
      message: `Unclosed <${unclosedTag}> tag`,
      line: 1,
      snippet: ""
    });
  }

  return errors;
}

function formatErrorsForPrompt(errors: LintError[], maxItems: number = 8): string {
  const formattedErrors = errors.slice(0, maxItems).map((error, index) => {
    const snippet = error.snippet.slice(0, 260) + (error.snippet.length > 260 ? "..." : "");
    return `${index + 1}. Line ${error.line}: ${error.message} | Snippet: ${snippet}`;
  });
  
  if (errors.length > maxItems) {
    formattedErrors.push(`... and ${errors.length - maxItems} more`);
  }
  
  return formattedErrors.join('\n');
}

// Agent Functions (exact prompts from Python)
async function agentSimpleCode(userTopic: string): Promise<{ html: string; tokenUsage: TokenUsage }> {
  const systemPrompt = `You are SimpleCoderAgent. Write the simplest and shortest working HTML code for the given game idea.
Output ONLY a complete, valid HTML5 document with inline <style> and <script>. No markdown, no prose.
Make it playable and functional with minimal features.`;

  const userPrompt = `write the simplest and shortest code for below prompt in html single code\n\n${userTopic}`;
  
  return await callGPTAPI(systemPrompt, userPrompt);
}

async function agentChecklist(htmlCode: string, userTopic: string): Promise<{ checklist: string; tokenUsage: TokenUsage }> {
  const systemPrompt = `You are ChecklistAgent. Analyze the provided HTML code for the given game idea.
Check for missing items that would make it a good working game.
Create a simple checklist of improvements needed.
Output ONLY the checklist in format:
- [ ] Item 1
- [ ] Item 2
etc.
Be concise and focus on essential game features.`;

  const userPrompt = `Game idea: ${userTopic}\n\nHTML code:\n${htmlCode}\n\nCheck for missing items and create a simple checklist to achieve a good working game.`;
  
  const result = await callGPTAPI(systemPrompt, userPrompt);
  return { checklist: result.html, tokenUsage: result.tokenUsage };
}

async function agentCode(checklist: string, priorHtml: string, lintFeedback?: string): Promise<{ html: string; tokenUsage: TokenUsage }> {
  const systemPrompt = `You are CodingAgent. Implement the checklist items in the provided HTML code.

Output:
- Exactly one full, valid HTML5 document with inline <style> and <script>. Return ONLY the HTML. No markdown, no prose.
- Modify the existing HTML to add the checklist features while preserving existing functionality.

Rules:
- Implement ALL checklist items marked with [ ] or [x]
- Keep existing code working and add new features
- Maintain <!doctype html> and single-file structure
- No external <link> or <script> tags

Visual Design:
- High contrast colors (white #FFFFFF on black #000000)
- Primary action: #7C4DFF
- Success: #10B981, Danger: #EF4444
- Large, readable text (minimum 16px)
- Smooth animations with CSS transitions
- Rounded corners for containers

*Avoid such errors*
Failed to load resource: "data:audio/wav;base64
Do not include these libs or attempted audio`;

  const userPrompt = lintFeedback 
    ? `Fix the HTML SYNTAX issues listed without adding features. Return the FULL corrected HTML only.\nIssues:\n${lintFeedback}\n\nCurrent HTML:\n${priorHtml}`
    : `Implement the checklist items in the existing HTML code.\nChecklist:\n${checklist}\nCurrent HTML:\n${priorHtml}`;

  return await callGPTAPI(systemPrompt, userPrompt);
}

async function agentMobileOptimize(priorHtml: string, lintFeedback?: string, inspectionFeedback?: string): Promise<{ html: string; tokenUsage: TokenUsage }> {
  const systemPrompt = `You are MobileOptimizerAgent. Transform the provided HTML5 game into a mobile-first, touch-friendly, single-file document.
Rules:
- Preserve ALL existing core logic (including WebGL/Three.js or other 3D code). Do not simplify or downgrade graphics.
- Only adjust layout, viewport, and controls to make the game mobile-ready.
- Remove excessive text from frontend visible, remove all the references to ASWD keys or arrow keys in code.
- Add <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">.
- Ensure canvas or container uses 100vw/100vh (or 100dvh) and respects env(safe-area-inset-*).
- Controls: map touch events to the existing input system (swipe, drag, joystick, taps). Keep buttons only if already present.
- UI: large tap targets (≥44px), high contrast colors, readable text (≥16px), smooth CSS transitions.
- Do NOT remove or alter shaders, WebGL context, Three.js setup, or rendering loops.
- Output must be a complete valid <!DOCTYPE html> file with inline CSS/JS. No markdown fences, no explanations.`;

  let userPrompt: string;
  if (inspectionFeedback) {
    userPrompt = `Fix the FUNCTIONALITY issues identified in the final inspection while maintaining mobile optimization. Address all button connections, movement logic, game loops, and control issues mentioned. Return the FULL corrected HTML only.\nInspection Issues:\n${inspectionFeedback}\n\nCurrent HTML:\n${priorHtml}`;
  } else if (lintFeedback) {
    userPrompt = `Fix the HTML SYNTAX issues while keeping mobile optimization intact. Return the FULL corrected HTML only.\nIssues:\n${lintFeedback}\n\nCurrent HTML:\n${priorHtml}`;
  } else {
    userPrompt = `Rewrite the given HTML to be mobile-only optimized and touch-friendly, preserving MVP functionality. Output the full HTML only.\n\nHTML:\n${priorHtml}`;
  }

  return await callGPTAPI(systemPrompt, userPrompt);
}

async function agentFinalInspection(mobileHtml: string, userTopic: string): Promise<{ inspection: string; tokenUsage: TokenUsage }> {
  const systemPrompt = `You are FinalInspectorAgent. Thoroughly analyze the mobile HTML game for functionality and connectivity issues.

CRITICAL CHECKS TO PERFORM:
- Button connections: restart button functionality, start/pause buttons, menu buttons
- Movement controls: joystick/wasd/arrow key connections, touch controls, gesture handling
- Game loops: main game loop execution, animation loops, physics updates
- Event handlers: click/touch event listeners properly attached and functional
- Game state management: score tracking, level progression, win/lose conditions
- Collision detection: object interactions, boundary checking
- Audio/visual feedback: sound effects, animations, visual state changes
- Mobile optimization: viewport, touch targets, responsive design
- Error handling: try-catch blocks, graceful failure handling
- Variable scoping: proper variable declarations, no undefined references

SPECIFIC ISSUES TO DETECT:
- Non-functional restart button or reset mechanism
- Broken movement controls or input handling
- Incomplete game loops or update cycles
- Missing event listeners or disconnected UI elements
- Logic errors in scoring, collision, or game progression
- Mobile-specific issues: touch events, viewport problems

Output: 5-line summary maximum. State issues ONLY if found. End with DONE.
Be specific about what's broken and why it won't work.`;

  const userPrompt = `Game idea: ${userTopic}\n\nAnalyze this final mobile HTML game code for functionality issues:\n\n${mobileHtml}\n\nCheck all button connections, movement logic, game loops, and controls. Report any broken functionality in 5 lines maximum.`;
  
  const result = await callGPTAPI(systemPrompt, userPrompt);
  return { inspection: result.html, tokenUsage: result.tokenUsage };
}

// API Call Function
async function callGPTAPI(systemPrompt: string, userPrompt: string): Promise<{ html: string; tokenUsage: TokenUsage }> {
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

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model_name || "gpt-4",
      messages: [
        {
          role: "developer",
          content: [{ type: "text", text: systemPrompt }],
        },
        {
          role: "user", 
          content: [{ type: "text", text: userPrompt }],
        },
      ],
      response_format: { type: 'text' },
      verbosity: config.verbosity || "low",
      reasoning_effort: config.reasoning_effort || "low",
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: HTTP ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  
  // Extract token usage
  const tokenUsage: TokenUsage = {
    prompt: data.usage?.prompt_tokens || 0,
    completion: data.usage?.completion_tokens || 0,
    total: data.usage?.total_tokens || 0,
  };

  return { html: content, tokenUsage };
}

// WebView Configuration
const getWebViewConfig = () => ({
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

// WebView Error Monitoring
const createWebViewMessageHandler = (onError?: (error: string) => void) => (event: any) => {
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

const getGameErrorMonitoringScript = () => `
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

// Default Game
function generateDefaultGame() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"/>
<title>Game Studio</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%; height: 100%; overflow: hidden; background: #000;
    touch-action: none; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .container {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100%; color: white; text-align: center; padding: 20px;
  }
  h1 { font-size: 2rem; margin-bottom: 1rem; color: #7C3AED; }
  p { font-size: 1.2rem; opacity: 0.8; line-height: 1.5; }
</style>
</head>
<body>
  <div class="container">
    <h1>Game Studio</h1>
    <p>Describe your game idea below to get started</p>
  </div>
</body>
</html>`;
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
  const [generationSession, setGenerationSession] = useState<GenerationSession | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [cumulativeTokens, setCumulativeTokens] = useState<TokenUsage>({ prompt: 0, completion: 0, total: 0 });

  // Publishing state
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [gameName, setGameName] = useState("");
  const [gameDescription, setGameDescription] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);

  // Animations
  const progressAnimation = useRef(new Animated.Value(0)).current;
  const scaleAnimation = useRef(new Animated.Value(0)).current;

  // Initialize agent steps
  const initializeAgentSteps = () => {
    return [
      { name: "Simple Coder", status: 'pending' as const },
      { name: "Checklist", status: 'pending' as const },
      { name: "MVP Builder", status: 'pending' as const },
      { name: "Mobile Optimizer", status: 'pending' as const },
      { name: "Final Inspector", status: 'pending' as const },
    ];
  };

  // Update agent step status
  const updateAgentStep = (index: number, status: AgentStep['status'], output?: string, error?: string) => {
    setAgentSteps(prev => prev.map((step, i) => 
      i === index ? { ...step, status, output, error } : step
    ));
  };

  // Get current game HTML
  const getCurrentGameHtml = (): string => {
    if (!generationSession || generationSession.versions.length === 0) {
      return generateDefaultGame();
    }
    return generationSession.versions[generationSession.currentVersionIndex].html;
  };

  // Main generation workflow
  const handleSend = async () => {
    const text = input.trim();
    if (!text || isGenerating) return;

    setInput("");
    Keyboard.dismiss();
    setIsGenerating(true);
    setCurrentStep(0);
    setAgentSteps(initializeAgentSteps());
    setCumulativeTokens({ prompt: 0, completion: 0, total: 0 });

    if (!generationSession) {
      await handleInitialGeneration(text);
    } else {
      await handleIterativeGeneration(text);
    }
  };

  // Initial 5-agent workflow
  const handleInitialGeneration = async (prompt: string) => {
    GenerationActions.start(5 * 60 * 1000); // 5 minutes for workflow
    GenerationActions.show();

    const newSession: GenerationSession = {
      initialPrompt: prompt,
      versions: [],
      currentVersionIndex: -1,
    };
    setGenerationSession(newSession);

    try {
      // Step 1: Simple Coder Agent
      setCurrentStep(1);
      updateAgentStep(0, 'running');
      Animated.timing(progressAnimation, { toValue: 0.2, duration: 300, useNativeDriver: false }).start();
      
      const { html: simpleHtml, tokenUsage: tokens1 } = await agentSimpleCode(prompt);
      updateAgentStep(0, 'complete', 'Generated basic HTML game');
      setCumulativeTokens(prev => ({
        prompt: prev.prompt + tokens1.prompt,
        completion: prev.completion + tokens1.completion,
        total: prev.total + tokens1.total,
      }));

      // Step 2: Checklist Agent
      setCurrentStep(2);
      updateAgentStep(1, 'running');
      Animated.timing(progressAnimation, { toValue: 0.4, duration: 300, useNativeDriver: false }).start();
      
      const { checklist, tokenUsage: tokens2 } = await agentChecklist(simpleHtml, prompt);
      updateAgentStep(1, 'complete', 'Created improvement checklist');
      setCumulativeTokens(prev => ({
        prompt: prev.prompt + tokens2.prompt,
        completion: prev.completion + tokens2.completion,
        total: prev.total + tokens2.total,
      }));

      // Step 3: MVP Builder with linting loop
      setCurrentStep(3);
      updateAgentStep(2, 'running');
      Animated.timing(progressAnimation, { toValue: 0.6, duration: 300, useNativeDriver: false }).start();
      
      let mvpHtml = simpleHtml;
      let lintAttempts = 0;
      const maxLintAttempts = 5;

      // Initial MVP build
      const { html: initialMvp, tokenUsage: tokens3a } = await agentCode(checklist, mvpHtml);
      mvpHtml = initialMvp;
      setCumulativeTokens(prev => ({
        prompt: prev.prompt + tokens3a.prompt,
        completion: prev.completion + tokens3a.completion,
        total: prev.total + tokens3a.total,
      }));

      // Linting loop for MVP
      while (lintAttempts < maxLintAttempts) {
        const lintErrors = lintHtml(mvpHtml);
        if (lintErrors.length === 0) break;

        lintAttempts++;
        const lintFeedback = formatErrorsForPrompt(lintErrors);
        const { html: fixedHtml, tokenUsage: tokensLint } = await agentCode(checklist, mvpHtml, lintFeedback);
        mvpHtml = fixedHtml;
        setCumulativeTokens(prev => ({
          prompt: prev.prompt + tokensLint.prompt,
          completion: prev.completion + tokensLint.completion,
          total: prev.total + tokensLint.total,
        }));
      }

      updateAgentStep(2, 'complete', `Built MVP with ${lintAttempts} lint fixes`);

      // Step 4: Mobile Optimizer with linting loop
      setCurrentStep(4);
      updateAgentStep(3, 'running');
      Animated.timing(progressAnimation, { toValue: 0.8, duration: 300, useNativeDriver: false }).start();
      
      let mobileHtml = mvpHtml;
      lintAttempts = 0;

      // Initial mobile optimization
      const { html: initialMobile, tokenUsage: tokens4a } = await agentMobileOptimize(mobileHtml);
      mobileHtml = initialMobile;
      setCumulativeTokens(prev => ({
        prompt: prev.prompt + tokens4a.prompt,
        completion: prev.completion + tokens4a.completion,
        total: prev.total + tokens4a.total,
      }));

      // Linting loop for mobile
      while (lintAttempts < maxLintAttempts) {
        const lintErrors = lintHtml(mobileHtml);
        if (lintErrors.length === 0) break;

        lintAttempts++;
        const lintFeedback = formatErrorsForPrompt(lintErrors);
        const { html: fixedMobile, tokenUsage: tokensLint } = await agentMobileOptimize(mobileHtml, lintFeedback);
        mobileHtml = fixedMobile;
        setCumulativeTokens(prev => ({
          prompt: prev.prompt + tokensLint.prompt,
          completion: prev.completion + tokensLint.completion,
          total: prev.total + tokensLint.total,
        }));
      }

      updateAgentStep(3, 'complete', `Mobile optimized with ${lintAttempts} lint fixes`);

      // Step 5: Final Inspector
      setCurrentStep(5);
      updateAgentStep(4, 'running');
      Animated.timing(progressAnimation, { toValue: 1.0, duration: 300, useNativeDriver: false }).start();
      
      const { inspection, tokenUsage: tokens5 } = await agentFinalInspection(mobileHtml, prompt);
      setCumulativeTokens(prev => ({
        prompt: prev.prompt + tokens5.prompt,
        completion: prev.completion + tokens5.completion,
        total: prev.total + tokens5.total,
      }));

      // Check if final fixes needed
      if (inspection.includes("DONE") && inspection.split('\n').length > 1) {
        const { html: finalHtml, tokenUsage: tokens5b } = await agentMobileOptimize(mobileHtml, undefined, inspection);
        mobileHtml = finalHtml;
        setCumulativeTokens(prev => ({
          prompt: prev.prompt + tokens5b.prompt,
          completion: prev.completion + tokens5b.completion,
          total: prev.total + tokens5b.total,
        }));
        updateAgentStep(4, 'complete', 'Fixed final inspection issues');
      } else {
        updateAgentStep(4, 'complete', 'No issues found in final inspection');
      }

      // Add final version to session
      const finalVersion: GameVersion = {
        html: mobileHtml,
        prompt,
        timestamp: Date.now(),
        stage: 'final',
      };

      const updatedSession: GenerationSession = {
        ...newSession,
        versions: [finalVersion],
        currentVersionIndex: 0,
      };

      setGenerationSession(updatedSession);
      setCurrentStep(6);

    } catch (error) {
      console.error("Generation failed:", error);
      updateAgentStep(currentStep - 1, 'error', undefined, error instanceof Error ? error.message : String(error));
      Alert.alert("Error", "Failed to generate game. Please try again.");
    } finally {
      setIsGenerating(false);
      GenerationActions.stop();
      GenerationActions.hide();
    }
  };

  // Iterative generation (simplified single-agent approach)
  const handleIterativeGeneration = async (prompt: string) => {
    if (!generationSession || generationSession.versions.length === 0) return;

    GenerationActions.start(1 * 60 * 1000); // 1 minute for iteration
    GenerationActions.show();

    try {
      setCurrentStep(1);
      setAgentSteps([{ name: "Iteration", status: 'running' }]);
      
      const currentHtml = getCurrentGameHtml();
      const { html: newHtml, tokenUsage } = await agentMobileOptimize(currentHtml, undefined, `Apply this change: ${prompt}`);
      
      setCumulativeTokens(tokenUsage);
      
      const newVersion: GameVersion = {
        html: newHtml,
        prompt,
        timestamp: Date.now(),
        stage: 'mobile',
      };

      const updatedSession: GenerationSession = {
        ...generationSession,
        versions: [...generationSession.versions, newVersion],
        currentVersionIndex: generationSession.versions.length,
      };

      setGenerationSession(updatedSession);
      updateAgentStep(0, 'complete', 'Applied changes successfully');

    } catch (error) {
      console.error("Iteration failed:", error);
      updateAgentStep(0, 'error', undefined, error instanceof Error ? error.message : String(error));
      Alert.alert("Error", "Failed to update game. Please try again.");
    } finally {
      setIsGenerating(false);
      GenerationActions.stop();
      GenerationActions.hide();
    }
  };

  // New chat
  const handleNewChat = () => {
    setGenerationSession(null);
    setInput("");
    setGameName("");
    setGameDescription("");
    setIsGenerating(false);
    setCurrentStep(0);
    setAgentSteps([]);
    setCumulativeTokens({ prompt: 0, completion: 0, total: 0 });
    progressAnimation.setValue(0);
    GameStorage.clearCreateTabState().catch(console.warn);
  };

  // Publishing
  const handlePublish = () => {
    if (!generationSession || generationSession.versions.length === 0) {
      Alert.alert("No Game", "Please create a game first before publishing.");
      return;
    }
    setShowPublishModal(true);
    Animated.spring(scaleAnimation, { toValue: 1, useNativeDriver: true, tension: 50, friction: 8 }).start();
  };

  const confirmPublish = async () => {
    if (!gameName.trim()) return;
    setIsPublishing(true);

    try {
      const authorHandle = user ? `@${(user.displayName || user.uid).replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}` : "@you";
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

      setIsPublishing(false);
      setShowPublishModal(false);
      setGameName("");
      setGameDescription("");
      handleNewChat();

      if (onGamePublished) {
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
        onGamePublished(feedGame);
      }

      Alert.alert("Success", "Game published successfully!");

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
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <BlurView intensity={30} tint="dark" style={styles.headerBlur}>
          <View style={styles.header}>
            <Text style={styles.title}>Game Studio</Text>
            <View style={styles.headerButtons}>
              <Pressable style={styles.newChatBtn} onPress={handleNewChat}>
                <CustomIcon name="add" size={SCREEN_W * 0.05} color="#FFFFFF" />
              </Pressable>
              <Pressable style={styles.publishBtn} onPress={handlePublish}>
                <CustomIcon name="arrow-up" size={SCREEN_W * 0.05} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </BlurView>
      </View>

      {/* Main Content */}
      <KeyboardAvoidingView 
        style={styles.mainContent}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* Game Display */}
        <View style={styles.gameContainer}>
          <View style={styles.gameFrame}>
            <WebView
              key={generationSession?.currentVersionIndex || 0}
              source={{ html: getCurrentGameHtml() }}
              style={styles.gameWebview}
              scrollEnabled={false}
              bounces={false}
              {...getWebViewConfig()}
              onMessage={createWebViewMessageHandler()}
              injectedJavaScript={getGameErrorMonitoringScript()}
              startInLoadingState={true}
              renderLoading={() => <ActivityIndicator size="large" color="#7C3AED" />}
            />

            {/* Agent Progress Overlay */}
            {isGenerating && (
              <View style={styles.progressOverlay}>
                <BlurView intensity={25} tint="dark" style={styles.progressBlur}>
                  <View style={styles.progressContent}>
                    <Text style={styles.progressTitle}>Building Your Game</Text>
                    
                    {/* Progress Bar */}
                    <View style={styles.progressBarContainer}>
                      <Animated.View 
                        style={[
                          styles.progressBar, 
                          { width: progressAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%']
                          })}
                        ]} 
                      />
                    </View>

                    {/* Agent Steps */}
                    <View style={styles.agentSteps}>
                      {agentSteps.map((step, index) => (
                        <View key={index} style={styles.agentStep}>
                          <View style={styles.agentStepIcon}>
                            {step.status === 'pending' && <View style={styles.stepPending} />}
                            {step.status === 'running' && <ActivityIndicator size="small" color="#7C3AED" />}
                            {step.status === 'complete' && <CustomIcon name="checkmark" size={16} color="#10B981" />}
                            {step.status === 'error' && <CustomIcon name="close" size={16} color="#EF4444" />}
                          </View>
                          <Text style={[
                            styles.agentStepText,
                            step.status === 'complete' && styles.agentStepComplete,
                            step.status === 'error' && styles.agentStepError,
                          ]}>
                            {step.name}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {/* Token Usage */}
                    {cumulativeTokens.total > 0 && (
                      <View style={styles.tokenUsage}>
                        <CustomIcon name="analytics-outline" size={14} color="#6B7280" />
                        <Text style={styles.tokenUsageText}>
                          {cumulativeTokens.total.toLocaleString()} tokens used
                        </Text>
                      </View>
                    )}
                  </View>
                </BlurView>
              </View>
            )}
          </View>
        </View>

        {/* Input Section */}
        <View style={[styles.inputSectionContainer, { paddingBottom: Math.max(insets.bottom, SCREEN_H * 0.02) }]}>
          <BlurView intensity={24} tint="dark" style={styles.inputBlur}>
            <View style={styles.inputContainer}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={generationSession ? "What would you like to change?" : "Describe your game idea..."}
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
          <Animated.View style={[styles.modalContent, { transform: [{ scale: scaleAnimation }] }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Publish Game</Text>
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
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
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
    paddingTop: SCREEN_H * 0.02,
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
  newChatBtn: {
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
    paddingTop: SCREEN_H * 0.06,
  },
  gameContainer: {
    flex: 1,
    paddingHorizontal: SCREEN_W * 0.02,
    paddingTop: SCREEN_H * 0.01,
    paddingBottom: SCREEN_H * 0.01,
    justifyContent: "center",
  },
  gameFrame: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    borderRadius: Math.min(SCREEN_W * 0.04, 16),
    overflow: "hidden",
    minHeight: SCREEN_H * 0.5,
    maxHeight: SCREEN_H * 0.8,
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: SCREEN_H * 0.005 },
    shadowOpacity: 0.3,
    shadowRadius: SCREEN_H * 0.015,
    elevation: 8,
  },
  gameWebview: {
    flex: 1,
    backgroundColor: "transparent",
    opacity: 0.99,
    overflow: 'hidden',
  },
  progressOverlay: {
    position: "absolute",
    left: SCREEN_W * 0.04,
    right: SCREEN_W * 0.04,
    bottom: SCREEN_W * 0.04,
    borderRadius: SCREEN_W * 0.03,
    overflow: "hidden",
  },
  progressBlur: {
    paddingHorizontal: SCREEN_W * 0.04,
    paddingVertical: SCREEN_H * 0.02,
  },
  progressContent: {
    alignItems: "center",
    gap: SCREEN_H * 0.015,
  },
  progressTitle: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.04,
    fontWeight: "700",
    textAlign: "center",
  },
  progressBarContainer: {
    width: "100%",
    height: SCREEN_H * 0.008,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: SCREEN_H * 0.004,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#7C3AED",
    borderRadius: SCREEN_H * 0.004,
  },
  agentSteps: {
    gap: SCREEN_H * 0.01,
    width: "100%",
  },
  agentStep: {
    flexDirection: "row",
    alignItems: "center",
    gap: SCREEN_W * 0.03,
    paddingHorizontal: SCREEN_W * 0.02,
  },
  agentStepIcon: {
    width: SCREEN_W * 0.06,
    height: SCREEN_W * 0.06,
    alignItems: "center",
    justifyContent: "center",
  },
  stepPending: {
    width: SCREEN_W * 0.015,
    height: SCREEN_W * 0.015,
    borderRadius: SCREEN_W * 0.0075,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  agentStepText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: SCREEN_W * 0.035,
    fontWeight: "500",
    flex: 1,
  },
  agentStepComplete: {
    color: "#10B981",
    fontWeight: "600",
  },
  agentStepError: {
    color: "#EF4444",
    fontWeight: "600",
  },
  tokenUsage: {
    flexDirection: "row",
    alignItems: "center",
    gap: SCREEN_W * 0.02,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: SCREEN_W * 0.03,
    paddingVertical: SCREEN_H * 0.008,
    borderRadius: SCREEN_W * 0.02,
    marginTop: SCREEN_H * 0.01,
  },
  tokenUsageText: {
    color: "#6B7280",
    fontSize: SCREEN_W * 0.03,
    fontWeight: "500",
    fontVariant: ['tabular-nums'],
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
});
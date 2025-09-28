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
import { GameStorage } from "./GameStorage";
import SimpleGameService from "../services/SimpleGameService";
import AppConfigService from "../services/AppConfigService";
import { useAuth } from "../auth/AuthProvider";

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");

// WebView configuration
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

// Void HTML tags for linting
const VOID_TAGS = new Set([
  "area","base","br","col","embed","hr","img","input",
  "link","meta","param","source","track","wbr","command",
  "keygen","menuitem"
]);

// Protocol Commands
type ProtocolCommand = 'DO:LINT' | 'DO:QG_CHECK' | 'TOSELF' | 'ASK:FINAL_OK?' | 'FINAL';

interface LintError {
  message: string;
  line: number;
  snippet: string;
}

interface GeneralIssue {
  name: string;
  detail: string;
  hint: string;
  severity: 'error' | 'warn';
}

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface GameCreatorProps {
  onGamePublished?: (game: any) => void;
}

export default function GameCreator({ onGamePublished }: GameCreatorProps = {}) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // Core state
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [gameHtml, setGameHtml] = useState<string>("");
  const [currentRound, setCurrentRound] = useState(0);
  const [agentMessage, setAgentMessage] = useState<string>("");
  
  // Token tracking
  const [cumulativeTokens, setCumulativeTokens] = useState<TokenUsage>({
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  });

  // Publishing state
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [gameName, setGameName] = useState("");
  const [gameDescription, setGameDescription] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  // Animations
  const successAnimation = useRef(new Animated.Value(0)).current;
  const scaleAnimation = useRef(new Animated.Value(0)).current;
  const agentCardAnimation = useRef(new Animated.Value(0)).current;

  // Load saved state
  useEffect(() => {
    const loadSavedState = async () => {
      try {
        const savedState = await GameStorage.getCreateTabState();
        if (savedState) {
          setInput(savedState.input || "");
          setGameHtml(savedState.gameHtml || "");
          setGameName(savedState.gameName || "");
          setGameDescription(savedState.gameDescription || "");
        }
      } catch (error) {
        console.warn("Failed to load saved state:", error);
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
          gameHtml,
          hasCustomGame: !!gameHtml,
          gameName,
          gameDescription,
        });
      } catch (error) {
        console.warn("Failed to save state:", error);
      }
    };
    const timeoutId = setTimeout(saveState, 500);
    return () => clearTimeout(timeoutId);
  }, [input, gameHtml, gameName, gameDescription]);

  // Show/hide agent card animation
  useEffect(() => {
    if (agentMessage) {
      Animated.timing(agentCardAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [agentMessage]);

  // Utilities
  const stripCodeFences = (text: string): string => {
    return text.replace(/^\s*```[a-zA-Z]*\s*|\s*```\s*$/gm, '');
  };

  const stripComments = (html: string): string => {
    return html.replace(/<!--[\s\S]*?-->/g, '');
  };

  const removeBlocks = (html: string, tag: string): string => {
    const regex = new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, 'gi');
    return html.replace(regex, '');
  };

  const buildLineIndex = (text: string) => {
    const lines = text.split('\n');
    const starts: number[] = [];
    let pos = 0;
    for (const ln of lines) {
      starts.push(pos);
      pos += ln.length + 1;
    }
    return { lines, starts };
  };

  const posToLineCol = (pos: number, starts: number[]): [number, number] => {
    let line = 0;
    for (let i = 0; i < starts.length; i++) {
      if (starts[i] <= pos) {
        line = i;
      } else {
        break;
      }
    }
    const col = pos - starts[line] + 1;
    return [line, col];
  };

  // HTML Linting
  const lintHtml = (html: string): LintError[] => {
    const errors: LintError[] = [];
    
    html = html.replace(/^\s*```[a-zA-Z]*\s*|\s*```\s*$/gm, '');
    const checkHtml = stripComments(html);
    const scrubbed = removeBlocks(removeBlocks(checkHtml, 'script'), 'style');
    const { lines, starts } = buildLineIndex(checkHtml);

    if (!/^\s*<!doctype\s+html\s*>/i.test(checkHtml)) {
      const snippet = lines[0]?.trim() || '';
      errors.push({ message: 'Missing <!DOCTYPE html> at top', line: 1, snippet });
    }

    for (const tag of ['html', 'head', 'body']) {
      const regex = new RegExp(`<\\s*${tag}\\b`, 'gi');
      const matches = checkHtml.match(regex) || [];
      if (matches.length === 0) {
        errors.push({ message: `Missing <${tag}> tag`, line: 1, snippet: '' });
      } else if (matches.length > 1) {
        errors.push({ message: `Multiple <${tag}> tags found (${matches.length})`, line: 1, snippet: '' });
      }
    }

    for (const tag of ['script', 'style']) {
      const openRegex = new RegExp(`<\\s*${tag}\\b`, 'gi');
      const closeRegex = new RegExp(`</\\s*${tag}\\s*>`, 'gi');
      const opens = (checkHtml.match(openRegex) || []).length;
      const closes = (checkHtml.match(closeRegex) || []).length;
      if (opens !== closes) {
        errors.push({
          message: `Unbalanced <${tag}> tags (open=${opens}, close=${closes})`,
          line: 1,
          snippet: ''
        });
      }
    }

    const tagRegex = /<\s*(\/)??\s*([a-zA-Z][a-zA-Z0-9\-]*)\b[^>]*?>/g;
    const stack: Array<[string, number]> = [];
    let match;

    while ((match = tagRegex.exec(scrubbed)) !== null) {
      const isClosing = !!match[1];
      const tagName = match[2].toLowerCase();
      const pos = match.index;

      if (tagName === '!doctype') continue;

      const isSelfClosed = match[0].trim().endsWith('/>');

      if (!isClosing) {
        if (!VOID_TAGS.has(tagName) && !isSelfClosed) {
          stack.push([tagName, pos]);
        }
      } else {
        if (VOID_TAGS.has(tagName)) {
          const [line] = posToLineCol(pos, starts);
          const snippet = lines[line]?.trim() || '';
          errors.push({
            message: `Unexpected closing tag </${tagName}> for void element`,
            line: line + 1,
            snippet
          });
          continue;
        }
        
        if (stack.length === 0) {
          const [line] = posToLineCol(pos, starts);
          const snippet = lines[line]?.trim() || '';
          errors.push({ message: `Unmatched closing tag </${tagName}>`, line: line + 1, snippet });
          continue;
        }
        
        const [openTag] = stack[stack.length - 1];
        if (openTag !== tagName) {
          const [line] = posToLineCol(pos, starts);
          const snippet = lines[line]?.trim() || '';
          errors.push({
            message: `Mismatched closing tag </${tagName}>; expected </${openTag}>`,
            line: line + 1,
            snippet
          });
          stack.pop();
        } else {
          stack.pop();
        }
      }
    }

    for (const [openTag, openPos] of stack) {
      const [line] = posToLineCol(openPos, starts);
      const snippet = lines[line]?.trim() || '';
      errors.push({ message: `Unclosed <${openTag}> tag`, line: line + 1, snippet });
    }

    return errors;
  };

  const formatErrorsForPrompt = (errors: LintError[], maxItems = 12): string => {
    const out: string[] = [];
    for (let i = 0; i < Math.min(errors.length, maxItems); i++) {
      const e = errors[i];
      const snippet = e.snippet.substring(0, 240) + (e.snippet.length > 240 ? '...' : '');
      out.push(`${i + 1}. Line ${e.line}: ${e.message} | Snippet: ${snippet}`);
    }
    
    const remaining = errors.length - out.length;
    if (remaining > 0) {
      out.push(`... and ${remaining} more`);
    }
    
    return out.join('\n');
  };

  // General Issue Analyzer
  const analyzeGeneralIssues = (html: string): GeneralIssue[] => {
    const issues: GeneralIssue[] = [];

    const addIssue = (name: string, detail: string, hint: string, severity: 'error' | 'warn' = 'warn') => {
      issues.push({ name, detail, hint, severity });
    };

    if (!/meta\s+name=['"]viewport['"]/i.test(html)) {
      addIssue('viewport_meta_missing',
        'No viewport meta for mobile.',
        'Add: <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">',
        'error');
    }

    const hasTouch = /addEventListener\(\s*['"](?:touchstart|touchmove|touchend|pointerdown|pointermove|pointerup)['"]/.test(html);
    if (!hasTouch) {
      addIssue('touch_controls_missing',
        'No touch or pointer event handlers detected.',
        'Add touch/pointer event handlers or on-screen controls for mobile.',
        'error');
    }

    if (/\b(?:WASD|arrow keys|Arrow(?:Left|Right|Up|Down)|Key[WASD])\b/i.test(html)) {
      addIssue('keyboard_instructions_present',
        'UI or code references keyboard controls.',
        'Update UI text to reflect touch controls, map keyboard to touch as fallback.',
        'warn');
    }

    if (!/requestAnimationFrame\s*\(/.test(html)) {
      addIssue('no_game_loop',
        'No requestAnimationFrame game loop detected.',
        'Ensure there is a main loop to update and render the game each frame.',
        'warn');
    }

    if (/data:audio\/wav;base64/i.test(html)) {
      addIssue('embedded_audio_data_uri',
        'Large base64 audio embedded can fail to load and bloat file.',
        'Prefer small SFX or remove embedded audio for MVP.',
        'warn');
    }

    if (!/<canvas\b/.test(html) && !/id\s*=\s*['"]game['"]/.test(html)) {
      addIssue('no_game_surface',
        'No obvious game surface like <canvas> or #game container found.',
        'Add a canvas or a game container element.',
        'warn');
    }

    const buttonIds = html.match(/id\s*=\s*["'](restart|start|pause|menu)["']/gi) || [];
    buttonIds.forEach(match => {
      const id = match.match(/["']([^"']+)["']/)?.[1];
      if (id && !new RegExp(`getElementById\\(\\s*['"]${id}['"]\\s*\\)\\.addEventListener`).test(html)) {
        addIssue('button_no_handler',
          `Button #${id} lacks event listener.`,
          `Add: document.getElementById('${id}').addEventListener('click', ...)`,
          'warn');
      }
    });

    if (!/collision|intersect|hitTest/i.test(html) && /<canvas\b/.test(html)) {
      addIssue('no_collision_logic',
        'No explicit collision or boundary checks detected.',
        'Add simple boundary or collision checks appropriate to the game.',
        'warn');
    }

    const scriptOpens = (html.match(/<\s*script\b/gi) || []).length;
    const scriptCloses = (html.match(/<\/\s*script\s*>/gi) || []).length;
    if (scriptOpens !== scriptCloses) {
      addIssue('unbalanced_script_tags',
        `Script tags open=${scriptOpens} close=${scriptCloses}.`,
        'Fix unbalanced <script> tags.',
        'error');
    }

    return issues;
  };

  const formatQGFeedback = (issues: GeneralIssue[]): string => {
    if (!issues.length) {
      return 'QG_CHECK: OK\nNo general issues detected.';
    }
    const lines = ['QG_CHECK: ISSUES'];
    issues.forEach((it, i) => {
      lines.push(`${i + 1}. [${it.severity.toUpperCase()}] ${it.name}: ${it.detail} | Hint: ${it.hint}`);
    });
    return lines.join('\n');
  };

  // Protocol parsing
  const parseCommands = (text: string): Array<[string, string]> => {
    const commands: Array<[string, string]> = [];
    const pattern = /\[\[\s*([A-Z_]+)(?::\s*(.+?))?\s*\]\]/gim;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const cmd = match[1].toUpperCase().trim();
      const arg = (match[2] || '').trim();
      commands.push([cmd, arg]);
    }
    return commands;
  };

  const extractHtmlDoc = (text: string): string | null => {
    text = stripCodeFences(text);
    const match = text.match(/<!doctype\s+html[^>]*>[\s\S]*?<\/html\s*>/i);
    return match ? match[0] : null;
  };

  const extractPatchBlock = (text: string): string | null => {
    const match = text.match(/\*\*\*\s*Begin Patch[\s\S]*?\*\*\*\s*End Patch/i);
    return match ? match[0] : null;
  };

  // Patch application
  const applyPatchToHtml = (currentHtml: string, patchText: string): { html: string; success: boolean; error: string } => {
    try {
      const block = extractPatchBlock(patchText);
      if (!block) {
        return { html: currentHtml, success: false, error: 'No patch block found.' };
      }

      const lines = block.split('\n');
      const delNums: number[] = [];
      const addLines: string[] = [];

      for (const raw of lines) {
        if (raw.trim().startsWith('***')) continue;
        if (raw.trim().startsWith('@@')) continue;
        
        if (raw.startsWith('-')) {
          const match = raw.trim().match(/^-\s*(\d+)\s*$/);
          if (match) {
            delNums.push(parseInt(match[1]));
          }
        } else if (raw.startsWith('+')) {
          let addLine = raw.substring(1);
          if (addLine.startsWith(' ')) {
            addLine = addLine.substring(1);
          }
          addLines.push(addLine.replace(/\n$/, ''));
        }
      }

      const fileLines = currentHtml.split('\n');

      // Process deletions (descending order)
      const delNumsSorted = [...new Set(delNums)].sort((a, b) => b - a);
      for (const dn of delNumsSorted) {
        if (dn >= 1 && dn <= fileLines.length) {
          fileLines.splice(dn - 1, 1);
        }
      }

      // Determine insertion index
      const insertionIndex = delNums.length > 0
        ? Math.max(Math.min(Math.min(...delNums) - 1, fileLines.length), 0)
        : fileLines.length;

      // Insert additions
      fileLines.splice(insertionIndex, 0, ...addLines);

      const newHtml = fileLines.join('\n');
      return { html: newHtml, success: true, error: '' };
    } catch (e: any) {
      return { html: currentHtml, success: false, error: `Patch apply error: ${e.message}` };
    }
  };

  const addLinePrefixes = (html: string, prefix = 'ln'): string => {
    const lines = html.split('\n');
    return lines.map((ln, i) => `${prefix}${i + 1}, ${ln}`).join('\n');
  };

  // System prompt
  const buildSystemPrompt = (): string => {
    return `You are UniAgent, a single self-steering agent that produces, critiques, and iterates on a single-file HTML5 mini-game.

Protocol (use this exact special syntax; each on its own line):
- [[DO:LINT]]            -> Ask controller to run an HTML syntax linter on your latest full HTML and return results.
- [[DO:QG_CHECK]]        -> Ask controller to run general QA checks (bugs, disconnects, mobile readiness) and return results.
- [[TOSELF: <prompt>]]   -> Send yourself a new "user" instruction for the next turn (self-feedback). Keep it concise and actionable.
- [[ASK:FINAL_OK?]]      -> Ask controller if all checks are clear. Controller will reply. If not clear, continue improving.
- [[FINAL]]              -> Use only when you have a clean, mobile-friendly, playable single-file HTML and all checks are clear.

Optional patch mode:
- When the controller provides a numbered file view and patch instructions, and changes are small, respond with ONLY a patch using that format. Otherwise output full HTML.

Rules:
- Always output one complete, valid HTML5 document (<!DOCTYPE html> ... </html>) whenever you write or revise code, unless controller explicitly requests patch-only mode.
- After the HTML (or the patch), list any commands using the special syntax lines above. Zero or more per turn.
- Generate your TOSELF prompt by questioning general things:
  • Is any part of the code likely buggy or undefined?
  • Anything feels disconnected (buttons without handlers, loops not running, variables not declared)?
  • Is the UI mobile-ready (viewport meta, touch controls, 44px targets, 16px fonts)?
  • Are game loops and state transitions robust?
- If linter or QA feedback reports issues, fix them in the next HTML and request checks again.
- If controller responds that all checks are clear, emit [[FINAL]] with the final, full HTML.

Deliverable:
- A complete single-file <html> with inline <style> and <script>, playable and mobile-friendly.`;
  };

  // OpenAI API call
  const callOpenAI = async (systemMsg: string, messages: Array<{role: string, content: string}>): Promise<string> => {
    const appConfigService = AppConfigService.getInstance();
    const config = await appConfigService.getConfig();
    
    const apiKey = config.api_key_gpt || 
      (typeof process !== "undefined" &&
        (process as any).env &&
          (((process as any).env.EXPO_PUBLIC_OPENAI_API_KEY as string) || 
           (process as any).env.OPENAI_API_KEY)) ||
      "";

    if (!apiKey) {
      throw new Error("Missing OpenAI API key");
    }

    const formattedMessages = [
      {
        role: "developer",
        content: [{ type: "text", text: systemMsg }]
      },
      ...messages.map(m => ({
        role: m.role,
        content: [{ type: "text", text: m.content }]
      }))
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model_name || "gpt-5-mini",
        messages: formattedMessages,
        response_format: { type: "text" },
        verbosity: config.verbosity || "low",
        reasoning_effort: config.reasoning_effort || "low"
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Update token usage
    if (data.usage) {
      setCumulativeTokens(prev => ({
        prompt_tokens: prev.prompt_tokens + (data.usage.prompt_tokens || 0),
        completion_tokens: prev.completion_tokens + (data.usage.completion_tokens || 0),
        total_tokens: prev.total_tokens + (data.usage.total_tokens || 0),
      }));
    }
    
    return data.choices?.[0]?.message?.content || "";
  };

  // Should use patch mode
  const shouldUsePatch = (lastLint: LintError[], lastQG: GeneralIssue[], htmlLen: number): boolean => {
    const lintCount = lastLint.length;
    const qgErrors = lastQG.filter(i => i.severity === 'error').length;
    const totalSmall = lintCount + qgErrors;
    if (htmlLen === 0) return false;
    return totalSmall > 0 && totalSmall <= 5 && htmlLen >= 200;
  };

  // Controller loop (main generation pipeline)
  const controllerLoop = async (userTopic: string, maxRounds = 12): Promise<string> => {
    const systemPrompt = buildSystemPrompt();
    const messages: Array<{role: string, content: string}> = [];

    // Initial instruction
    const initUser = `User request: Build a tiny playable mini-game from this idea:
${userTopic}

Produce one complete HTML5 file now. Then request checks with [[DO:LINT]] and [[DO:QG_CHECK]], and add one [[TOSELF: ...]] instruction to improve next turn.`;
    
    messages.push({ role: 'user', content: initUser });

    let latestHtml: string | null = null;
    let lastLint: LintError[] = [];
    let lastQG: GeneralIssue[] = [];

    for (let roundIdx = 1; roundIdx <= maxRounds; roundIdx++) {
      setCurrentRound(roundIdx);
      setAgentMessage(`Round ${roundIdx}: Generating response...`);
      
      console.log(`\n=== ROUND ${roundIdx} ===`);
      const response = await callOpenAI(systemPrompt, messages);
      const responseText = stripCodeFences(response || '');
      console.log('\nAGENT OUTPUT (truncated):\n' + responseText.slice(0, 600) + (responseText.length > 600 ? '\n...' : ''));

      // Check for patch and apply if present
      const patchBlock = extractPatchBlock(responseText);
      const followups: Array<{role: string, content: string}> = [];

      if (patchBlock && latestHtml) {
        setAgentMessage(`Applying patch...`);
        console.log('Controller: Detected patch. Applying...');
        const { html: newHtml, success, error } = applyPatchToHtml(latestHtml, patchBlock);
        if (success) {
          latestHtml = newHtml;
          setGameHtml(newHtml);
          
          // Run checks automatically
          const lintErrors = lintHtml(newHtml);
          lastLint = lintErrors;
          const qg = analyzeGeneralIssues(newHtml);
          lastQG = qg;
          
          const lintFeedback = lintErrors.length ? 
            'LINTER: Found issues:\n' + formatErrorsForPrompt(lintErrors) : 
            'LINTER: OK. No syntax issues.';
          const qgFeedback = formatQGFeedback(qg);
          
          followups.push({ role: 'user', content: `[[RESULT:LINT]]\n${lintFeedback}` });
          followups.push({ role: 'user', content: `[[RESULT:QG_CHECK]]\n${qgFeedback}` });
        } else {
          followups.push({ 
            role: 'user', 
            content: `Controller: Patch apply failed: ${error}. Please output the FULL corrected HTML instead.` 
          });
        }
      }

      // Extract HTML if present
      const htmlDoc = extractHtmlDoc(responseText);
      if (htmlDoc) {
        latestHtml = htmlDoc;
        setGameHtml(htmlDoc);
      }

      // Parse and process commands
      const commands = parseCommands(responseText);
      console.log(`Detected commands: ${commands.map(c => c[0]).join(', ') || 'None'}`);

      for (const [cmd, arg] of commands) {
        if (cmd === 'DO' && arg.toUpperCase() === 'LINT') {
          setAgentMessage('Running linter...');
          if (!latestHtml) {
            followups.push({ role: 'user', content: '[[RESULT:LINT]]\nNo full HTML detected to lint.' });
            lastLint = [{ message: 'No HTML to lint', line: 1, snippet: '' }];
          } else {
            const lintErrors = lintHtml(latestHtml);
            lastLint = lintErrors;
            const lintFeedback = lintErrors.length ?
              'LINTER: Found issues:\n' + formatErrorsForPrompt(lintErrors) :
              'LINTER: OK. No syntax issues.';
            followups.push({ role: 'user', content: `[[RESULT:LINT]]\n${lintFeedback}` });
          }
        } else if (cmd === 'DO' && arg.toUpperCase() === 'QG_CHECK') {
          setAgentMessage('Checking quality...');
          if (!latestHtml) {
            const qg: GeneralIssue[] = [{ 
              name: 'no_html', 
              detail: 'No HTML to analyze.', 
              hint: 'Output full HTML first.', 
              severity: 'error' 
            }];
            lastQG = qg;
            followups.push({ role: 'user', content: `[[RESULT:QG_CHECK]]\n${formatQGFeedback(qg)}` });
          } else {
            const qg = analyzeGeneralIssues(latestHtml);
            lastQG = qg;
            followups.push({ role: 'user', content: `[[RESULT:QG_CHECK]]\n${formatQGFeedback(qg)}` });
          }
        } else if (cmd === 'TOSELF') {
          setAgentMessage('Self-instruction...');
          followups.push({ role: 'user', content: `[[SELF-INSTRUCTION]] ${arg}` });
        } else if (cmd === 'ASK' && arg.toUpperCase() === 'FINAL_OK?') {
          setAgentMessage('Checking if ready...');
          const lintErrors = latestHtml ? lintHtml(latestHtml) : [{ message: 'No HTML', line: 1, snippet: '' }];
          const qgIssues = latestHtml ? analyzeGeneralIssues(latestHtml) : [{ 
            name: 'no_html', 
            detail: 'No HTML present.', 
            hint: 'Provide HTML.', 
            severity: 'error' as const 
          }];

          const ready = lintErrors.length === 0 && qgIssues.filter(i => i.severity === 'error').length === 0;
          const status = {
            lintOk: lintErrors.length === 0,
            qgErrors: qgIssues.filter(i => i.severity === 'error').length,
            qgTotal: qgIssues.length,
            hasHtml: !!latestHtml,
            decision: ready ? 'READY' : 'NOT_READY'
          };

          const report = [
            '[[RESULT:FINAL_OK?]]',
            `Controller decision: ${status.decision}`,
            `Lint OK: ${status.lintOk}`,
            `QG errors: ${status.qgErrors} of ${status.qgTotal}`,
            `Has HTML: ${status.hasHtml}`,
          ];
          if (!ready) {
            report.push('Recommendation: Address remaining issues, then re-run [[DO:LINT]] and [[DO:QG_CHECK]].');
          }
          followups.push({ role: 'user', content: report.join('\n') });
        } else if (cmd === 'FINAL') {
          setAgentMessage('Finalizing...');
          if (latestHtml) {
            const lintErrors = lintHtml(latestHtml);
            const qgIssues = analyzeGeneralIssues(latestHtml);
            if (lintErrors.length === 0 && qgIssues.filter(i => i.severity === 'error').length === 0) {
              console.log('Controller: Final accepted.');
              setAgentMessage('Complete! ✨');
              return latestHtml;
            } else {
              const msg = ['Controller: FINAL rejected due to remaining issues.'];
              if (lintErrors.length) {
                msg.push('Linter issues:\n' + formatErrorsForPrompt(lintErrors));
              }
              if (qgIssues.length) {
                msg.push('QG issues:\n' + formatQGFeedback(qgIssues));
              }
              followups.push({ role: 'user', content: msg.join('\n') });
            }
          } else {
            followups.push({ role: 'user', content: 'Controller: FINAL rejected. No HTML detected.' });
          }
        } else {
          followups.push({ 
            role: 'user', 
            content: `Controller: Unknown or unhandled command [[${cmd}:${arg}]]; continue with improvements and checks.` 
          });
        }
      }

      // Check if patch mode should be enabled
      if (latestHtml) {
        const enablePatch = shouldUsePatch(lastLint, lastQG, latestHtml.length);
        if (enablePatch) {
          const numbered = addLinePrefixes(latestHtml, 'ln');
          const patchRequest = `PATCH MODE ENABLED: Changes appear small. In your NEXT reply, return ONLY the patch for index.html using the format below. Do not include other text or protocol commands.

Current file with line prefixes for reference:
${numbered}

Patch Specification:
*** Begin Patch
*** Update File: index.html
@@ <body>
-<line_number_to_delete>
+<new_code_line_to_add>
*** End Patch

Rules:
- For deletions: -<line_number> (single integer, refers to current file line number)
- For additions: +<new_code_line> (write full new line, no line number)
- Show 3 lines of context before and after each change if possible.
- If multiple sections need changes, repeat the *** Update File header.
- Only return the patch. Do not add commentary.`;
          followups.push({ role: 'user', content: patchRequest });
        }
      }

      // If no commands and no patch, nudge agent
      if (commands.length === 0 && !patchBlock) {
        if (latestHtml) {
          const lintErrors = lintHtml(latestHtml);
          const qgIssues = analyzeGeneralIssues(latestHtml);
          if (lintErrors.length === 0 && qgIssues.filter(i => i.severity === 'error').length === 0) {
            followups.push({ 
              role: 'user', 
              content: 'Controller: All checks pass. Reply with [[FINAL]] and include the final full HTML again.' 
            });
          } else {
            const nudge = ['Controller: No commands detected. Please fix issues and request checks.'];
            if (lintErrors.length) {
              nudge.push('Linter issues:\n' + formatErrorsForPrompt(lintErrors));
            }
            if (qgIssues.length) {
              nudge.push('QG issues:\n' + formatQGFeedback(qgIssues));
            }
            followups.push({ role: 'user', content: nudge.join('\n') });
          }
        } else {
          followups.push({ 
            role: 'user', 
            content: 'Controller: No HTML detected. Output a complete HTML5 document and then add [[DO:LINT]] and [[DO:QG_CHECK]].' 
          });
        }
      }

      // Update conversation
      messages.push({ role: 'assistant', content: responseText });
      messages.push(...followups);
    }

    console.log('Controller: Reached max rounds without finalization. Returning latest HTML if available.');
    setAgentMessage('Max rounds reached. Returning current version.');
    return latestHtml || '';
  };

  // Reset cumulative tokens
  const resetCumulativeTokens = () => {
    setCumulativeTokens({
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    });
  };

  // Main generation handler
  const handleSend = async () => {
    const userTopic = input.trim();
    if (!userTopic || isGenerating) return;

    setInput("");
    Keyboard.dismiss();
    setIsGenerating(true);
    resetCumulativeTokens();
    setGameHtml("");
    setCurrentRound(0);
    setAgentMessage('Initializing UniAgent...');

    try {
      const finalHtml = await controllerLoop(userTopic, 12);

      if (finalHtml) {
        setGameHtml(finalHtml);
        setAgentMessage('Game generation complete! ✨');
      }

      // Display token summary
      console.log("=".repeat(60));
      console.log("🎯 CUMULATIVE TOKEN USAGE SUMMARY");
      console.log("=".repeat(60));
      console.log(`📝 Total Prompt Tokens:     ${cumulativeTokens.prompt_tokens.toLocaleString()}`);
      console.log(`🤖 Total Completion Tokens: ${cumulativeTokens.completion_tokens.toLocaleString()}`);
      console.log(`💰 Total Tokens Used:       ${cumulativeTokens.total_tokens.toLocaleString()}`);
      console.log("=".repeat(60));

      // Hide agent card after a delay
      setTimeout(() => {
        Animated.timing(agentCardAnimation, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          setAgentMessage('');
        });
      }, 3000);

    } catch (error) {
      console.error("Generation failed:", error);
      Alert.alert("Error", "Failed to generate game. Please try again.");
      setAgentMessage('Generation failed.');
    } finally {
      setIsGenerating(false);
      setCurrentRound(0);
    }
  };

  const handleNewGame = () => {
    setGameHtml("");
    setInput("");
    setGameName("");
    setGameDescription("");
    setCurrentRound(0);
    setAgentMessage("");
    resetCumulativeTokens();
    GameStorage.clearCreateTabState().catch(console.warn);
  };

  const handlePublish = () => {
    if (!gameHtml) {
      Alert.alert("No Game", "Please create a game first before publishing.");
      return;
    }

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

      const savedGame = await GameStorage.saveGame({
        title: gameName.trim(),
        description: gameDescription.trim() || "A fun game created with AI",
        html: gameHtml,
        author: authorHandle,
        likes: 0,
        duration: 60,
        category: "AI Generated",
      });

      // Save to Firebase if available
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
        handleNewGame();

        if (onGamePublished) {
          onGamePublished({
            id: savedGame.id,
            title: savedGame.title,
            author: savedGame.author,
            likes: savedGame.likes,
            liked: savedGame.liked || false,
            html: savedGame.html,
            duration: savedGame.duration,
            category: savedGame.category,
          });
        }
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

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>AI Game Studio</Text>
        <View style={styles.headerButtons}>
          <Pressable style={styles.headerBtn} onPress={handleNewGame}>
            <CustomIcon name="refresh" size={SCREEN_W * 0.05} color="#FFFFFF" />
          </Pressable>
          <Pressable style={styles.headerBtn} onPress={handlePublish}>
            <CustomIcon name="arrow-up" size={SCREEN_W * 0.05} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {/* Game Content and Input Section */}
      <KeyboardAvoidingView
        style={styles.gameContent}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        {/* Game Preview */}
        <View style={styles.gameContainer}>
          <View style={styles.gameFrame}>
            {gameHtml ? (
              <WebView
                source={{ html: gameHtml }}
                style={styles.webview}
                scrollEnabled={false}
                bounces={false}
                {...getWebViewConfig()}
              />
            ) : (
              <View style={styles.placeholderContainer}>
                <CustomIcon name="game-controller" size={SCREEN_W * 0.15} color="#4B5563" />
                <Text style={styles.placeholderText}>Describe your game idea below</Text>
              </View>
            )}

            {/* Agent Progress Card */}
            {agentMessage && (
              <Animated.View
                style={[
                  styles.agentCard,
                  {
                    opacity: agentCardAnimation,
                    transform: [
                      {
                        translateY: agentCardAnimation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [20, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <BlurView intensity={80} tint="dark" style={styles.agentCardBlur}>
                  <View style={styles.agentCardContent}>
                    <View style={styles.agentCardHeader}>
                      <View style={styles.agentIndicator} />
                      <Text style={styles.agentCardText}>{agentMessage}</Text>
                    </View>
                    {currentRound > 0 && (
                      <Text style={styles.agentRoundText}>Round {currentRound}/12</Text>
                    )}
                    {cumulativeTokens.total_tokens > 0 && (
                      <Text style={styles.agentTokenText}>
                        {cumulativeTokens.total_tokens.toLocaleString()} tokens
                      </Text>
                    )}
                  </View>
                </BlurView>
              </Animated.View>
            )}
          </View>
        </View>

        {/* Input Section */}
        <View style={[styles.inputSection, { paddingBottom: insets.bottom + SCREEN_H * 0.02 }]}>
          <View style={styles.inputContainer}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Describe your game idea..."
              placeholderTextColor="#6B7280"
              style={styles.input}
              multiline
              maxLength={1000}
              editable={!isGenerating}
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
        </View>
      </KeyboardAvoidingView>

      {/* Publish Modal */}
      <Modal visible={showPublishModal} transparent animationType="fade" onRequestClose={closeModal}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={styles.modalBackdrop} onPress={closeModal} />
          <Animated.View style={[styles.modalContent, { transform: [{ scale: scaleAnimation }] }]}>
            {!publishSuccess ? (
              <>
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
              <Animated.View style={[styles.successContainer, { opacity: successAnimation }]}>
                <View style={styles.successIcon}>
                  <CustomIcon name="checkmark" size={SCREEN_W * 0.12} color="#FFFFFF" />
                </View>
                <Text style={styles.successTitle}>Published!</Text>
                <Text style={styles.successMessage}>Your game is now live</Text>
              </Animated.View>
            )}
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SCREEN_W * 0.05,
    paddingVertical: SCREEN_H * 0.02,
    borderBottomWidth: 1,
    borderBottomColor: "#1A1A1A",
  },
  title: {
    fontSize: SCREEN_W * 0.045,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  headerButtons: {
    flexDirection: "row",
    gap: SCREEN_W * 0.03,
  },
  headerBtn: {
    padding: SCREEN_W * 0.02,
  },
  gameContent: {
    flex: 1,
  },
  gameContainer: {
    flex: 1,
    paddingHorizontal: SCREEN_W * 0.04,
    paddingTop: SCREEN_H * 0.015,
  },
  gameFrame: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    borderRadius: SCREEN_W * 0.04,
    overflow: "hidden",
    position: "relative",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  placeholderContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SCREEN_H * 0.02,
  },
  placeholderText: {
    color: "#6B7280",
    fontSize: SCREEN_W * 0.04,
  },
  agentCard: {
    position: "absolute",
    bottom: SCREEN_W * 0.04,
    left: SCREEN_W * 0.04,
    right: SCREEN_W * 0.04,
    borderRadius: SCREEN_W * 0.03,
    overflow: "hidden",
  },
  agentCardBlur: {
    borderRadius: SCREEN_W * 0.03,
  },
  agentCardContent: {
    padding: SCREEN_W * 0.04,
  },
  agentCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SCREEN_W * 0.03,
  },
  agentIndicator: {
    width: SCREEN_W * 0.02,
    height: SCREEN_W * 0.02,
    borderRadius: SCREEN_W * 0.01,
    backgroundColor: "#7C3AED",
  },
  agentCardText: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.035,
    fontWeight: "600",
    flex: 1,
  },
  agentRoundText: {
    color: "#9CA3AF",
    fontSize: SCREEN_W * 0.03,
    marginTop: SCREEN_H * 0.01,
    marginLeft: SCREEN_W * 0.05,
  },
  agentTokenText: {
    color: "#6B7280",
    fontSize: SCREEN_W * 0.025,
    marginTop: SCREEN_H * 0.005,
    marginLeft: SCREEN_W * 0.05,
    fontVariant: ["tabular-nums"],
  },
  inputSection: {
    paddingHorizontal: SCREEN_W * 0.04,
    paddingTop: SCREEN_H * 0.015,
    paddingBottom: SCREEN_H * 0.02,
    backgroundColor: "#000000",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#1A1A1A",
    borderRadius: SCREEN_W * 0.06,
    paddingLeft: SCREEN_W * 0.04,
    paddingRight: SCREEN_W * 0.015,
    borderWidth: 1,
    borderColor: "#333333",
    minHeight: SCREEN_H * 0.065,
  },
  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.04,
    maxHeight: SCREEN_H * 0.1,
    minHeight: SCREEN_H * 0.045,
    paddingVertical: SCREEN_H * 0.015,
  },
  sendBtn: {
    width: SCREEN_W * 0.09,
    height: SCREEN_W * 0.09,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7C3AED",
    borderRadius: SCREEN_W * 0.045,
    margin: SCREEN_H * 0.005,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: SCREEN_W * 0.05,
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
    backgroundColor: "#1A1A1A",
    borderRadius: SCREEN_W * 0.04,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SCREEN_W * 0.05,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  modalTitle: {
    fontSize: SCREEN_W * 0.05,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  modalBody: {
    padding: SCREEN_W * 0.05,
  },
  inputGroup: {
    marginBottom: SCREEN_H * 0.025,
  },
  inputLabel: {
    fontSize: SCREEN_W * 0.035,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: SCREEN_H * 0.01,
  },
  modalInput: {
    backgroundColor: "#000000",
    borderRadius: SCREEN_W * 0.02,
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
    padding: SCREEN_W * 0.05,
    borderTopWidth: 1,
    borderTopColor: "#333333",
    gap: SCREEN_W * 0.03,
  },
  cancelBtn: {
    paddingHorizontal: SCREEN_W * 0.05,
    paddingVertical: SCREEN_H * 0.012,
  },
  cancelText: {
    color: "#6B7280",
    fontSize: SCREEN_W * 0.04,
    fontWeight: "600",
  },
  confirmBtn: {
    backgroundColor: "#7C3AED",
    paddingHorizontal: SCREEN_W * 0.06,
    paddingVertical: SCREEN_H * 0.015,
    borderRadius: SCREEN_W * 0.02,
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
  },
  successIcon: {
    width: SCREEN_W * 0.2,
    height: SCREEN_W * 0.2,
    backgroundColor: "#10B981",
    borderRadius: SCREEN_W * 0.1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SCREEN_H * 0.02,
  },
  successTitle: {
    fontSize: SCREEN_W * 0.06,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: SCREEN_H * 0.01,
  },
  successMessage: {
    fontSize: SCREEN_W * 0.04,
    color: "#6B7280",
  },
});
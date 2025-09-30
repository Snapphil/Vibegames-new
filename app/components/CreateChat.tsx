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
  PanResponder,
  TouchableWithoutFeedback,
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

// Round descriptions for UI display
const ROUND_DESCRIPTIONS = [
  "Planning structure",
  "Building core logic", 
  "Adding game mechanics",
  "Implementing controls",
  "Styling interface",
  "Testing functionality",
  "Fixing bugs",
  "Optimizing performance",
  "Polish details",
  "Final validation",
  "Quality checks",
  "Ready to play"
];

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

interface RoundStatus {
  round: number;
  message: string;
  description: string;
  timestamp: number;
  status?: string;
  tokens?: number;
  isUserQuery?: boolean;
  isProblemFinder?: boolean;
  problems?: ProblemFinderProblem[];
}

interface ProblemFinderProblem {
  id: number;
  description: string;
  old_code?: string;
  new_code?: string;
  priority: 'high' | 'medium' | 'low';
}

interface ProblemFinderOutput {
  should_terminate: boolean;
  problems: ProblemFinderProblem[];
  reasoning?: string;
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
  const [gamePlan, setGamePlan] = useState<string>("");
  const [showPlanOverlay, setShowPlanOverlay] = useState(false);
  const [typingText, setTypingText] = useState<string>("");
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [userQuery, setUserQuery] = useState<string>("");
  const [roundHistory, setRoundHistory] = useState<RoundStatus[]>([]);
  const [gamePlanExpanded, setGamePlanExpanded] = useState(false);
  const [gamePlanTypingText, setGamePlanTypingText] = useState<string>("");
  const [roundStatus, setRoundStatus] = useState<string>("");

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
  const [showStatusHint, setShowStatusHint] = useState(false);

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editQuery, setEditQuery] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editRoundHistory, setEditRoundHistory] = useState<RoundStatus[]>([]);
  const [completedRounds, setCompletedRounds] = useState(0);

  // Animations
  const successAnimation = useRef(new Animated.Value(0)).current;
  const scaleAnimation = useRef(new Animated.Value(0)).current;
  const agentCardAnimation = useRef(new Animated.Value(0)).current;
  const planOverlayAnimation = useRef(new Animated.Value(0)).current;
  const pulsingAnimation = useRef(new Animated.Value(0)).current;
  const ringGlowAnimation = useRef(new Animated.Value(1)).current;
  const statusHintAnimation = useRef(new Animated.Value(0)).current;
  const squareRotation = useRef(new Animated.Value(0)).current;

  // Refs
  const scrollViewRef = useRef<ScrollView>(null);

  // Single pan responder for the entire draggable header area
  const overlayPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Respond to any downward movement
        return Math.abs(gestureState.dy) > 2;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        // Capture downward drags
        return gestureState.dy > 2;
      },
      onPanResponderGrant: () => {
        // Lock the animation value when starting drag
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow downward dragging
        if (gestureState.dy > 0) {
          const progress = 1 - (gestureState.dy / (SCREEN_H * 0.3));
          planOverlayAnimation.setValue(Math.max(0, Math.min(1, progress)));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // Close if dragged down more than 60px
        if (gestureState.dy > 60) {
          hidePlanInfo();
        } else {
          // Snap back to open position
          Animated.spring(planOverlayAnimation, {
            toValue: 1,
            useNativeDriver: true,
            tension: 50,
            friction: 8,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        // If gesture is interrupted, snap back
        Animated.spring(planOverlayAnimation, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 8,
        }).start();
      },
    })
  ).current;

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

  // Typing animation for round descriptions (looping)
  useEffect(() => {
    if (currentRound > 0 && currentRound <= ROUND_DESCRIPTIONS.length) {
      const targetText = ROUND_DESCRIPTIONS[currentRound - 1];
      setTypingText("");

      let currentIndex = 0;
      let isDeleting = false;
      const typingInterval = setInterval(() => {
        if (!isDeleting) {
          if (currentIndex <= targetText.length) {
            setTypingText(targetText.slice(0, currentIndex));
            currentIndex++;
          } else {
            isDeleting = true;
            setTimeout(() => {
              isDeleting = false;
              currentIndex = 0;
            }, 1000); // Pause before restarting
          }
        }
      }, 50);

      return () => clearInterval(typingInterval);
    } else {
      setTypingText("");
    }
  }, [currentRound]);

  // Typing animation for game plan preparation (looping)
  useEffect(() => {
    if (isGenerating && !gamePlan) {
      const targetText = "Preparing game plan...";
      setGamePlanTypingText("");

      let currentIndex = 0;
      let isDeleting = false;
      const typingInterval = setInterval(() => {
        if (!isDeleting) {
          if (currentIndex <= targetText.length) {
            setGamePlanTypingText(targetText.slice(0, currentIndex));
            currentIndex++;
          } else {
            isDeleting = true;
            setTimeout(() => {
              isDeleting = false;
              currentIndex = 0;
            }, 1000); // Pause before restarting
          }
        }
      }, 50);

      return () => clearInterval(typingInterval);
    } else {
      setGamePlanTypingText("");
    }
  }, [isGenerating, gamePlan]);

  // Update round history whenever round or message changes
  useEffect(() => {
    if (currentRound > 0 && agentMessage) {
      setRoundHistory(prev => {
        const existing = prev.find(r => r.round === currentRound);
        if (existing) {
          return prev.map(r =>
            r.round === currentRound
              ? { ...r, message: agentMessage, description: typingText }
              : r
          );
        } else {
          return [...prev, {
            round: currentRound,
            message: agentMessage,
            description: typingText,
            timestamp: Date.now()
          }];
        }
      });
    }
  }, [currentRound, agentMessage, typingText]);


  // Pulsing animation for active round
  useEffect(() => {
    if (isGenerating && currentRound > 0) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulsingAnimation, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulsingAnimation, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulsingAnimation.setValue(0);
    }
  }, [isGenerating, currentRound, pulsingAnimation]);

  // Ring glow animation for plan button
  useEffect(() => {
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(ringGlowAnimation, {
          toValue: 1.2,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(ringGlowAnimation, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );
    glow.start();
    return () => glow.stop();
  }, [ringGlowAnimation]);

  // Status hint animation - show every 60 seconds for 6 seconds
  useEffect(() => {
    if (!gamePlan) return; // Only show when there's a game plan

    const showStatusHint = () => {
      setShowStatusHint(true);

      // Slide in from right
      Animated.sequence([
        Animated.timing(statusHintAnimation, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(6000), // Stay visible for 6 seconds
        Animated.timing(statusHintAnimation, {
          toValue: 0,
          duration: 300,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowStatusHint(false);
      });
    };

    // Show immediately when game plan becomes available
    showStatusHint();

    // Then show every 60 seconds
    const intervalId = setInterval(showStatusHint, 60000);

    return () => clearInterval(intervalId);
  }, [gamePlan, statusHintAnimation]);

  // Square rotation animation - 90 degrees at a time
  useEffect(() => {
    if (isGenerating) {
      const rotate = Animated.loop(
        Animated.sequence([
          Animated.timing(squareRotation, {
            toValue: 1,
            duration: 400,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.delay(200),
          Animated.timing(squareRotation, {
            toValue: 2,
            duration: 400,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.delay(200),
          Animated.timing(squareRotation, {
            toValue: 3,
            duration: 400,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.delay(200),
          Animated.timing(squareRotation, {
            toValue: 4,
            duration: 400,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.delay(200),
        ])
      );
      squareRotation.setValue(0);
      rotate.start();
      return () => rotate.stop();
    } else {
      squareRotation.setValue(0);
    }
  }, [isGenerating, squareRotation]);

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

  const extractStatusUpdate = (text: string): string | null => {
    const match = text.match(/What was updated in code\?\s*\([^)]*\)\s*\n([\s\S]*?)\s*\{STATUS:\s*([^}]+)\}/i);
    return match ? match[1].trim() : null;
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

      const delNumsSorted = [...new Set(delNums)].sort((a, b) => b - a);
      for (const dn of delNumsSorted) {
        if (dn >= 1 && dn <= fileLines.length) {
          fileLines.splice(dn - 1, 1);
        }
      }

      const insertionIndex = delNums.length > 0
        ? Math.max(Math.min(Math.min(...delNums) - 1, fileLines.length), 0)
        : fileLines.length;

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

  // Add line numbers to HTML for editing
  const addLineNumbers = (html: string): string => {
    const lines = html.split('\n');
    return lines.map((line, index) => `${index + 1}|${line}`).join('\n');
  };

  // Remove line numbers from HTML
  const removeLineNumbers = (numberedHtml: string): string => {
    const lines = numberedHtml.split('\n');
    return lines.map(line => {
      const pipeIndex = line.indexOf('|');
      return pipeIndex >= 0 ? line.substring(pipeIndex + 1) : line;
    }).join('\n');
  };

  // Edit system prompt for patch developer
  const buildEditSystemPrompt = (): string => {
    return `You are a patch developer. Your only task is to fix the code as per the user request by giving only correct code that needs to be replaced by old

-ln145
-ln146
+ln150 correct code line
+ln151 correct code line
...many

As many lines as you want to use to fix the code`;
  };

  // Parse edit patch response
  const parseEditPatch = (response: string): { success: boolean; patches: Array<{ type: 'remove' | 'add'; lineNumber?: number; content?: string }> } => {
    const lines = response.trim().split('\n');
    const patches: Array<{ type: 'remove' | 'add'; lineNumber?: number; content?: string }> = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('-ln')) {
        const lineNumMatch = trimmedLine.match(/^-ln(\d+)$/);
        if (lineNumMatch) {
          patches.push({
            type: 'remove',
            lineNumber: parseInt(lineNumMatch[1])
          });
        }
      } else if (trimmedLine.startsWith('+ln')) {
        const contentMatch = trimmedLine.match(/^\+ln(\d+)\s+(.*)$/);
        if (contentMatch) {
          patches.push({
            type: 'add',
            lineNumber: parseInt(contentMatch[1]),
            content: contentMatch[2]
          });
        }
      }
    }
    
    return { success: patches.length > 0, patches };
  };

  // Apply edit patches to HTML
  const applyEditPatches = (html: string, patches: Array<{ type: 'remove' | 'add'; lineNumber?: number; content?: string }>): string => {
    const lines = html.split('\n');
    
    // Sort patches by line number (descending for removals, ascending for additions)
    const removals = patches.filter(p => p.type === 'remove').sort((a, b) => (b.lineNumber || 0) - (a.lineNumber || 0));
    const additions = patches.filter(p => p.type === 'add').sort((a, b) => (a.lineNumber || 0) - (b.lineNumber || 0));
    
    // Apply removals first (from bottom to top to maintain line numbers)
    for (const removal of removals) {
      if (removal.lineNumber && removal.lineNumber > 0 && removal.lineNumber <= lines.length) {
        lines.splice(removal.lineNumber - 1, 1);
      }
    }
    
    // Apply additions
    for (const addition of additions) {
      if (addition.lineNumber && addition.content !== undefined) {
        const insertIndex = Math.max(0, Math.min(addition.lineNumber - 1, lines.length));
        lines.splice(insertIndex, 0, addition.content);
      }
    }
    
    return lines.join('\n');
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
- NEVER include any gameplay instructions, control instructions, or help text on the frontend UI (no "Controls: left stick = move", "How to play", or similar text in the HTML).
- IMPORTANT: After each HTML output, always include a status summary in this exact format:
  What was updated in code? (In max 3-4 lines can be less, concise bullet points only - each point 4-5 words max, simple language for naive users)
  • bullet point 1
  • bullet point 2
  • bullet point 3
  {STATUS: your brief description here}
- Generate your TOSELF prompt by questioning general things:
  • Is any part of the code likely buggy or undefined?
  • Anything feels disconnected (buttons without handlers, loops not running, variables not declared)?
  • Is the UI mobile-ready (viewport meta, touch controls, 44px targets, 16px fonts)?
  • Are game loops and state transitions robust?
- If linter or QA feedback reports issues, fix them in the next HTML and request checks again.
- If controller responds that all checks are clear, emit [[FINAL]] with the final, full HTML.

IMPORTANT: Your input includes detailed instructions with specific sections:
- **Idea description**: 2-3 lines describing the complete game concept, mechanics, and goal
- **Render**: 2D or 3D rendering specification and library choice
- **Controls**: Mobile-only controls (touch gestures, screen buttons, etc.) - implement these exactly as specified

When developing the game, ensure you:
- Follow the render specification and use the recommended library
- Implement ONLY the specified mobile controls - no keyboard or mouse controls
- Always mention control names when describing gameplay or UI
- Make sure touch targets are at least 44px for accessibility

Deliverable:
- A complete single-file <html> with inline <style> and <script>, playable and mobile-friendly.
- NO gameplay instructions, control instructions, or help text should appear on the frontend UI.`;
  };

  // Token usage update utility
  const updateTokenUsage = (usage: any) => {
    setCumulativeTokens((prev: TokenUsage) => ({
      prompt_tokens: prev.prompt_tokens + (usage.prompt_tokens || 0),
      completion_tokens: prev.completion_tokens + (usage.completion_tokens || 0),
      total_tokens: prev.total_tokens + (usage.total_tokens || 0),
    }));
  };

  // Edit API call
  const callEditAPI = async (userQuery: string, numberedHtml: string): Promise<string> => {
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

    const systemPrompt = buildEditSystemPrompt();
    const userPrompt = `${userQuery}\n\n${numberedHtml}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model_name || "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user", 
            content: userPrompt
          }
        ],
        response_format: { type: "text" },
        verbosity: config.verbosity || "low",
        reasoning_effort: config.reasoning_effort || "low"
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edit API error: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  };

  // OpenAI API call
  const callOpenAI = async (
    systemMsg: string,
    messages: Array<{role: string, content: string}>,
    options?: { model?: string; reasoning_effort?: string }
  ): Promise<{content: string, usage?: any}> => {
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
        model: options?.model || config.model_name || "gpt-5-mini",
        messages: formattedMessages,
        response_format: { type: "text" },
        verbosity: config.verbosity || "low",
        reasoning_effort: options?.reasoning_effort || config.reasoning_effort || "low"
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (data.usage) {
      updateTokenUsage(data.usage);
    }

    return {
      content: data.choices?.[0]?.message?.content || "",
      usage: data.usage
    };
  };

  // Should use patch mode
  const shouldUsePatch = (lastLint: LintError[], lastQG: GeneralIssue[], htmlLen: number): boolean => {
    const lintCount = lastLint.length;
    const qgErrors = lastQG.filter(i => i.severity === 'error').length;
    const totalSmall = lintCount + qgErrors;
    if (htmlLen === 0) return false;
    return totalSmall > 0 && totalSmall <= 5 && htmlLen >= 200;
  };

  // Problem Finder Agent
  const buildProblemFinderSystemPrompt = (): string => {
    return `You are a Problem Finder Agent - a senior developer code reviewer analyzing HTML5 game code between generation rounds.

Your role is to identify specific, actionable problems that will improve the game quality in the next round.

INPUT YOU RECEIVE:
- Complete HTML code from previous round
- Original Game Plan requirements
- Syntax/Linter errors (if any)
- QA check results

YOUR TASK:
1. Compare the code against the Game Plan to identify missing features or incorrect implementations
2. Review syntax/linter errors and determine root causes
3. Analyze QA issues and prioritize critical problems
4. Identify bugs, disconnected logic, or missing functionality
5. Check mobile-readiness (touch controls, viewport, font sizes)

OUTPUT REQUIREMENTS:
You must respond with ONLY valid JSON in this exact format:
{
  "should_terminate": false,
  "reasoning": "Brief explanation of your analysis",
  "problems": [
    {
      "id": 1,
      "description": "Specific problem description",
      "old_code": "Code snippet causing the issue (optional)",
      "new_code": "Suggested fix (optional)",
      "priority": "high"
    }
  ]
}

RULES:
- Maximum 5 problems per analysis
- If code is perfect and meets all requirements, set "should_terminate": true with empty problems array
- Prioritize: high = critical bugs/missing features, medium = improvements, low = polish
- Be specific and actionable in descriptions
- Focus on problems that impact functionality, not style preferences
- If there are syntax errors, they are ALWAYS high priority

TERMINATION CRITERIA:
Set "should_terminate": true ONLY when:
- All linter/syntax errors are fixed
- All critical QA errors are resolved
- Game Plan requirements are fully implemented
- Game is playable and mobile-ready

Return ONLY the JSON object, no additional text.`;
  };

  const callProblemFinder = async (
    htmlCode: string,
    gamePlan: string,
    lintErrors: LintError[],
    qgIssues: GeneralIssue[]
  ): Promise<{ output: ProblemFinderOutput; usage: any }> => {
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

    const systemPrompt = buildProblemFinderSystemPrompt();
    
    const lintSummary = lintErrors.length > 0 
      ? `SYNTAX ERRORS (${lintErrors.length}):\n${formatErrorsForPrompt(lintErrors)}`
      : 'No syntax errors detected.';
    
    const qaSummary = qgIssues.length > 0
      ? `QA ISSUES (${qgIssues.length}):\n${formatQGFeedback(qgIssues)}`
      : 'No QA issues detected.';

    const userPrompt = `Analyze this game code and identify problems for the next generation round.

GAME PLAN:
${gamePlan}

${lintSummary}

${qaSummary}

HTML CODE:
${htmlCode.substring(0, 15000)}${htmlCode.length > 15000 ? '\n... (code truncated for length)' : ''}

Respond with ONLY the JSON object as specified in the system prompt.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model_name || "gpt-5-mini",
        messages: [
          {
            role: "developer",
            content: [{ type: "text", text: systemPrompt }]
          },
          {
            role: "user",
            content: [{ type: "text", text: userPrompt }]
          }
        ],
        response_format: { type: "json_object" },
        verbosity: config.verbosity || "low",
        reasoning_effort: config.reasoning_effort || "low"
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Problem Finder API error: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    
    let parsedOutput: ProblemFinderOutput;
    try {
      parsedOutput = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse Problem Finder output:", content);
      parsedOutput = {
        should_terminate: false,
        problems: [],
        reasoning: "Failed to parse response"
      };
    }

    return {
      output: parsedOutput,
      usage: data.usage
    };
  };

  // Controller loop with Problem Finder integration
  const controllerLoop = async (userTopic: string, maxRounds = 5): Promise<string> => {
    const systemPrompt = buildSystemPrompt();
    const messages: Array<{role: string, content: string}> = [];

    setAgentMessage('Analyzing your game idea...');
    const preRoundPrompt = `Take this basic game idea and expand it into detailed instructions for building a mini-game:

Basic idea: ${userTopic}

Create detailed instructions that include:
1. **Idea description**: Write 2-3 lines describing the complete game concept, mechanics, and goal
2. **Render**: Analyze the game concept and specify 2D or 3D rendering with appropriate library choice:
   - For 3D games (space, depth, rotation, 3D objects): Use Three.js
   - For 2D games (platformers, puzzles, classic arcade): Use HTML5 Canvas API
   - If the query doesn't specify, make a reasonable assumption based on typical game mechanics
3. **Color Theme**: Choose ONE theme from the list and specify 4-6 main colors with hex codes:
   - **Arcade Bright**: \`#FF0000\`, \`#0000FF\`, \`#FFFF00\`, \`#00FF00\`, \`#FFFFFF\`, \`#000000\`
   - **Neon/Cyber**: \`#FF00FF\`, \`#00FFFF\`, \`#FF1493\`, \`#39FF14\`, \`#000000\`, \`#1a1a2e\`
   - **Pastel Casual**: \`#FFB6C1\`, \`#87CEEB\`, \`#98FB98\`, \`#DDA0DD\`, \`#FFF8DC\`, \`#FFE4E1\`
   - **Dark Mode**: \`#0d0d0d\`, \`#1a1a1a\`, \`#2d2d2d\`, \`#00d9ff\`, \`#ff6b6b\`, \`#ffffff\`
   - **Retro 8-bit**: \`#000000\`, \`#FFFFFF\`, \`#E0E0E0\`, \`#880000\`, \`#008888\`, \`#FFFF00\`
   - **Nature**: \`#228B22\`, \`#8B4513\`, \`#87CEEB\`, \`#FFD700\`, \`#90EE90\`, \`#2F4F4F\`
   - **Monochrome + Accent**: \`#000000\`, \`#202020\`, \`#404040\`, \`#808080\`, \`#FF6B35\`, \`#FFFFFF\`
4. **Controls**: Specify ONLY mobile-friendly controls - touch gestures, screen buttons, etc. (mention specific control names every time based on game requirements)
5. **Camera View**: Describe the camera perspective and behavior

Output ONLY the detailed instructions in a clear, structured format. This will be used as input for the actual game development.

Keep the plan concise (6-25 lines total). Use this format:

**Examples:**

**1) Treasure Diver**
Idea: A calm yet challenging underwater game where the player guides a diver to collect coins scattered in caves, while avoiding jellyfish, sharks, and oxygen depletion. Coins can unlock upgrades like faster swim fins or bigger oxygen tanks. The underwater physics should feel floaty, with momentum and drag for realism.
Render: 2D using HTML5 Canvas API (supports custom physics and mobile scaling).
Color Theme: Nature - \`#0077BE\` (deep ocean blue), \`#FFD700\` (gold coins), \`#FF6B6B\` (red jellyfish), \`#90EE90\` (light green seaweed), \`#2F4F4F\` (dark cave walls), \`#FFFFFF\` (bubbles/UI text)
Controls: Mobile virtual joystick that **mirrors movement** for smooth 360° directional control, tap button for quick dash upward to escape danger.
Camera View: Side-scrolling follow camera, smoothly panning to keep the diver centered while showing upcoming obstacles 2-3 seconds ahead. Slight zoom out when dashing.

**2) Sky Glider**
Idea: A side-scrolling endless sky adventure where the player controls a hang glider, soaring through clouds, collecting coins, and dodging flocks of birds or storm gusts. Physics should simulate gravity + lift for smooth gliding arcs. Coins can be spent on better gliders with speed or stability.
Render: 2D with HTML5 Canvas API for lightweight rendering with custom air drag/lift physics.
Color Theme: Pastel Casual - \`#87CEEB\` (sky blue background), \`#FFB6C1\` (pink glider), \`#FFD700\` (yellow coins), \`#DDA0DD\` (purple storm clouds), \`#FFFFFF\` (white fluffy clouds), \`#98FB98\` (light green birds)
Controls: Mobile device tilt/accelerometer for steering left/right, tap button on right side for temporary speed boost.
Camera View: Forward-scrolling side camera that slightly zooms out during boost (shows more ahead) and applies subtle screen shake during turbulence for immersion.`;

    const preRoundSystemMsg = 'You are an expert game designer. Your task is to take basic game ideas and expand them into detailed, actionable specifications for mobile mini-games.';

    const preRoundMessages = [
      { role: 'user', content: preRoundPrompt }
    ];

    try {
      const { content: detailedInstructions } = await callOpenAI(preRoundSystemMsg, preRoundMessages);
      console.log('Detailed instructions generated:', detailedInstructions.slice(0, 400) + '...');
      
      setGamePlan(detailedInstructions);

      const initUser = `User request: Build a tiny playable mini-game from these detailed instructions:

${detailedInstructions}
Produce one complete HTML5 file now. Then request checks with [[DO:LINT]] and [[DO:QG_CHECK]], and add one [[TOSELF: ...]] instruction to improve next turn.`;


      messages.push({ role: 'user', content: initUser });
    } catch (error) {
      console.warn('Pre-round failed, using basic input:', error);
      const initUser = `User request: Build a tiny playable mini-game from this idea:
${userTopic}

Produce one complete HTML5 file now. Then request checks with [[DO:LINT]] and [[DO:QG_CHECK]], and add one [[TOSELF: ...]] instruction to improve next turn.`;

      messages.push({ role: 'user', content: initUser });
    }

    let latestHtml: string | null = null;
    let lastLint: LintError[] = [];
    let lastQG: GeneralIssue[] = [];

    for (let roundIdx = 1; roundIdx <= maxRounds; roundIdx++) {
      setCurrentRound(roundIdx);
      
      // Run Problem Finder before rounds 2-5
      if (roundIdx > 1 && latestHtml) {
        setAgentMessage(`Problem Finder: Analyzing code...`);
        console.log(`\n=== PROBLEM FINDER ANALYSIS (Before Round ${roundIdx}) ===`);
        
        try {
          const { output: problemFinderOutput, usage: pfUsage } = await callProblemFinder(
            latestHtml,
            gamePlan || userTopic,
            lastLint,
            lastQG
          );

          // Update token tracking for Problem Finder
          if (pfUsage) {
            updateTokenUsage(pfUsage);
          }

          console.log('Problem Finder Output:', JSON.stringify(problemFinderOutput, null, 2));

          // Add Problem Finder status to round history
          setRoundHistory(prev => [...prev, {
            round: roundIdx,
            message: problemFinderOutput.should_terminate 
              ? "Problem Finder: No issues found - Ready to finalize!" 
              : `Problem Finder: Found ${problemFinderOutput.problems.length} issue(s) to address`,
            description: problemFinderOutput.reasoning || "Code analysis complete",
            timestamp: Date.now(),
            status: problemFinderOutput.reasoning,
            tokens: pfUsage?.total_tokens || 0,
            isProblemFinder: true,
            problems: problemFinderOutput.problems
          }]);

          // If Problem Finder says we're done, finalize
          if (problemFinderOutput.should_terminate) {
            console.log('Problem Finder: Code is ready. Terminating generation.');
            setAgentMessage('Problem Finder: Code quality verified! ✨');
            setCompletedRounds(roundIdx - 1);
            return latestHtml;
          }

          // If there are problems, add them to the messages for next round
          if (problemFinderOutput.problems.length > 0) {
            const problemsList = problemFinderOutput.problems.map((p, idx) => 
              `${idx + 1}. [${p.priority.toUpperCase()}] ${p.description}${p.old_code ? `\n   Current: ${p.old_code.substring(0, 100)}` : ''}${p.new_code ? `\n   Suggested: ${p.new_code.substring(0, 100)}` : ''}`
            ).join('\n\n');

            const problemFinderFeedback = `[[PROBLEM_FINDER_ANALYSIS]]
Reasoning: ${problemFinderOutput.reasoning}

Issues to fix in this round (prioritized):
${problemsList}

Please address these issues in your next iteration. Focus on high priority items first.`;

            messages.push({ role: 'user', content: problemFinderFeedback });
          }
        } catch (error) {
          console.error('Problem Finder failed:', error);
          setAgentMessage(`Problem Finder error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          // Continue with normal generation even if Problem Finder fails
        }
      }

      setAgentMessage(`Round ${roundIdx}: Generating response...`);

      console.log(`\n=== ROUND ${roundIdx} ===`);
      const { content: response, usage } = await callOpenAI(
        systemPrompt,
        messages,
        undefined
      );
      const responseText = stripCodeFences(response || '');
      console.log('\nAGENT OUTPUT (truncated):\n' + responseText.slice(0, 600) + (responseText.length > 600 ? '\n...' : ''));

      // Calculate tokens used in this round from API response
      const tokensUsedThisRound = usage?.total_tokens || 0;

      const patchBlock = extractPatchBlock(responseText);
      const followups: Array<{role: string, content: string}> = [];

      if (patchBlock && latestHtml) {
        setAgentMessage(`Applying patch...`);
        console.log('Controller: Detected patch. Applying...');
        const { html: newHtml, success, error } = applyPatchToHtml(latestHtml, patchBlock);
        if (success) {
          latestHtml = newHtml;
          setGameHtml(newHtml);
          
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

      const htmlDoc = extractHtmlDoc(responseText);
      if (htmlDoc) {
        latestHtml = htmlDoc;
        setGameHtml(htmlDoc);
      }

      const statusUpdate = extractStatusUpdate(responseText);
      if (statusUpdate) {
        setRoundStatus(statusUpdate);
      }

      // Update the round history with status and tokens
      setRoundHistory(prev => {
        const existing = prev.find(r => r.round === roundIdx);
        if (existing) {
          return prev.map(r =>
            r.round === roundIdx
              ? { ...r, status: statusUpdate || r.status, tokens: tokensUsedThisRound }
              : r
          );
        } else {
          return [...prev, {
            round: roundIdx,
            message: agentMessage || `Round ${roundIdx}: Generating response...`,
            description: ROUND_DESCRIPTIONS[roundIdx - 1] || `Round ${roundIdx}`,
            timestamp: Date.now(),
            status: statusUpdate || '',
            tokens: tokensUsedThisRound
          }];
        }
      });

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
              setCompletedRounds(roundIdx); // Mark as completed for edit mode
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

      messages.push({ role: 'assistant', content: responseText });
      messages.push(...followups);
    }

    console.log('Controller: Reached max rounds without finalization. Returning latest HTML if available.');
    setAgentMessage('Max rounds reached. Returning current version.');
    setCompletedRounds(maxRounds); // Mark as completed even if max rounds reached
    return latestHtml || '';
  };

  // Handle edit request with retry logic for linter errors
  const handleEditRequest = async (editQuery: string) => {
    if (!gameHtml || !editQuery.trim()) return;

    setIsEditing(true);
    // Don't clear edit round history, just add to it
    
    try {
      // Add user edit query to edit history (this will be shown as a chat bubble)
      setEditRoundHistory(prev => [...prev, {
        round: prev.length + 1,
        message: editQuery,
        description: "Edit request",
        timestamp: Date.now(),
        status: "User edit query received",
        isUserQuery: true // Flag to identify this as a user query for special rendering
      }]);

      let currentHtml = gameHtml;
      let attempt = 1;
      const maxAttempts = 2;
      
      while (attempt <= maxAttempts) {
        // Add "Editing the html" status - live update
        setEditRoundHistory(prev => [...prev, {
          round: prev.length + 1,
          message: attempt === 1 ? "Editing the HTML" : `Fixing errors (Attempt ${attempt})`,
          description: attempt === 1 ? "Processing edit" : "Fixing linter/syntax errors",
          timestamp: Date.now(),
          status: attempt === 1 ? "Applying changes to code" : "Correcting errors in code"
        }]);

        // Number the HTML
        const numberedHtml = addLineNumbers(currentHtml);
        
        // Prepare the prompt for this attempt
        let promptToSend = editQuery;
        
        if (attempt > 1) {
          // For retry attempts, include linter errors in the prompt
          const lintErrors = lintHtml(currentHtml);
          if (lintErrors.length > 0) {
            const errorReport = formatErrorsForPrompt(lintErrors);
            promptToSend = `${editQuery}\n\nFIX THESE LINTER/SYNTAX ERRORS:\n${errorReport}`;
          }
        }
        
        // Call edit API
        const editResponse = await callEditAPI(promptToSend, numberedHtml);
        
        // Parse the patch response
        const parseResult = parseEditPatch(editResponse);
        
        if (!parseResult.success) {
          throw new Error("Failed to parse edit response");
        }
        
        // Apply patches to current HTML
        const editedHtml = applyEditPatches(currentHtml, parseResult.patches);
        
        // Check for linter errors in the edited HTML
        const lintErrors = lintHtml(editedHtml);
        
        if (lintErrors.length === 0 || attempt === maxAttempts) {
          // No errors or final attempt - accept the result
          setGameHtml(editedHtml);
          
          if (lintErrors.length === 0) {
            // Success - no errors
            setEditRoundHistory(prev => [...prev, {
              round: prev.length + 1,
              message: "Edit completed",
              description: "Changes applied successfully",
              timestamp: Date.now(),
              status: `Applied ${parseResult.patches.length} changes${attempt > 1 ? ` (after ${attempt} attempts)` : ''}`
            }]);
          } else {
            // Final attempt with remaining errors
            setEditRoundHistory(prev => [...prev, {
              round: prev.length + 1,
              message: "Edit completed with warnings",
              description: "Changes applied but some errors remain",
              timestamp: Date.now(),
              status: `Applied ${parseResult.patches.length} changes, ${lintErrors.length} linter errors remain`
            }]);
          }
          break;
        } else {
          // Errors found, prepare for retry
          currentHtml = editedHtml;
          setEditRoundHistory(prev => [...prev, {
            round: prev.length + 1,
            message: `Found ${lintErrors.length} linter errors`,
            description: "Preparing to fix errors",
            timestamp: Date.now(),
            status: `${lintErrors.length} linter/syntax errors detected`
          }]);
          attempt++;
        }
      }
      
    } catch (error) {
      console.error("Edit failed:", error);
      setEditRoundHistory(prev => [...prev, {
        round: prev.length + 1,
        message: "Edit failed",
        description: "Error applying changes",
        timestamp: Date.now(),
        status: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]);
    } finally {
      setIsEditing(false);
      // Don't clear editQuery here so it remains visible in overlay
    }
  };

  const resetCumulativeTokens = () => {
    setCumulativeTokens({
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    });
  };

  const handleSend = async () => {
    const userTopic = input.trim();
    if (!userTopic || isGenerating || isEditing) return;

    // Check if we're in edit mode
    if (isEditMode && gameHtml) {
      setEditQuery(userTopic);
      setInput("");
      Keyboard.dismiss();
      
      // Show plan overlay for edit progress
      showPlanInfo();
      
      await handleEditRequest(userTopic);
      return;
    }

    // Normal generation mode
    setUserQuery(userTopic);
    setInput("");
    Keyboard.dismiss();
    setIsGenerating(true);
    setIsEditMode(false);
    setCompletedRounds(0);
    resetCumulativeTokens();
    setGameHtml("");
    setCurrentRound(0);
    setRoundHistory([]);
    setEditRoundHistory([]); // Clear edit history only when starting new generation
    setRoundStatus('');
    setAgentMessage('Initializing UniAgent...');

    // Show plan overlay immediately when generation starts
    showPlanInfo();

    try {
      const finalHtml = await controllerLoop(userTopic, 5);

      if (finalHtml) {
        setGameHtml(finalHtml);
        setAgentMessage('Game generation complete! ✨');
        // Enable edit mode after successful generation
        setIsEditMode(true);
      }

      console.log("=".repeat(60));
      console.log("🎯 CUMULATIVE TOKEN USAGE SUMMARY");
      console.log("=".repeat(60));
      console.log(`📝 Total Prompt Tokens:     ${cumulativeTokens.prompt_tokens.toLocaleString()}`);
      console.log(`🤖 Total Completion Tokens: ${cumulativeTokens.completion_tokens.toLocaleString()}`);
      console.log(`💰 Total Tokens Used:       ${cumulativeTokens.total_tokens.toLocaleString()}`);
      console.log("=".repeat(60));

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
    setGamePlan("");
    setShowPlanOverlay(false);
    setTypingText("");
    setUserQuery("");
    setRoundHistory([]);
    setRoundStatus('');
    setIsEditMode(false);
    setEditQuery("");
    setIsEditing(false);
    setEditRoundHistory([]);
    setCompletedRounds(0);
    resetCumulativeTokens();
    GameStorage.clearCreateTabState().catch(console.warn);
  };

  const handleNewProject = () => {
    Alert.alert(
      "New Project",
      "This will clear all chat history and game data. Are you sure you want to start fresh?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "New Project",
          style: "destructive",
          onPress: () => {
            setGameHtml("");
            setInput("");
            setGameName("");
            setGameDescription("");
            setCurrentRound(0);
            setAgentMessage("");
            setGamePlan("");
            setShowPlanOverlay(false);
            setTypingText("");
            setUserQuery("");
            setRoundHistory([]);
            setRoundStatus('');
            setIsEditMode(false);
            setEditQuery("");
            setIsEditing(false);
            setEditRoundHistory([]);
            setCompletedRounds(0);
            resetCumulativeTokens();
            GameStorage.clearCreateTabState().catch(console.warn);
            setPublishSuccess(false);
            setShowPublishModal(false);
            agentCardAnimation.setValue(0);
            planOverlayAnimation.setValue(0);
            successAnimation.setValue(0);
            scaleAnimation.setValue(0);
          }
        }
      ]
    );
  };

  const handleRefreshHtml = () => {
    if (gameHtml && !isGenerating) {
      const currentHtml = gameHtml;
      setGameHtml("");
      setTimeout(() => {
        setGameHtml(currentHtml);
      }, 100);
    }
    setShowActionMenu(false);
  };

  const handleMenuAction = (action: string) => {
    switch (action) {
      case 'new':
        handleNewProject();
        break;
      case 'refresh':
        handleRefreshHtml();
        break;
      case 'publish':
        handlePublish();
        setShowActionMenu(false);
        break;
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const showPlanInfo = () => {
    setShowPlanOverlay(true);
    Animated.timing(planOverlayAnimation, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      scrollToBottom();
    });
  };

  const hidePlanInfo = () => {
    Animated.timing(planOverlayAnimation, {
      toValue: 0,
      duration: 250,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setShowPlanOverlay(false);
    });
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
      <View style={styles.header}>
        <Text style={[styles.title, gameHtml && styles.titleCompact]}>
          {gameHtml ? "Studio" : "AI Game Studio"}
        </Text>
        <View style={styles.headerRight}>
          {gamePlan && (
            <View style={styles.headerPlanBtnContainer}>
              {showStatusHint && (
                <Animated.View
                  style={[
                    styles.statusHint,
                    {
                      opacity: statusHintAnimation,
                      transform: [
                        {
                          translateX: statusHintAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: [20, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <Text style={styles.statusHintText}>Check status</Text>
                </Animated.View>
              )}
              <Pressable style={styles.headerPlanBtn} onPress={showPlanInfo}>
                <Animated.View
                  style={[
                    styles.headerPlanBtnRing,
                    {
                      transform: [{ scale: ringGlowAnimation }],
                      opacity: ringGlowAnimation.interpolate({
                        inputRange: [1, 1.2],
                        outputRange: [0.7, 1],
                      }),
                    },
                  ]}
                />
                <View style={styles.headerPlanBtnInner} />
              </Pressable>
            </View>
          )}
          <Pressable
            style={styles.menuBtn}
            onPress={() => setShowActionMenu(!showActionMenu)}
          >
            <CustomIcon name="ellipsis-horizontal" size={SCREEN_W * 0.05} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.gameContent}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
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
                  {isGenerating ? (
                    <View style={styles.loadingContainer}>
                      <Animated.View
                        style={[
                          styles.rotatingSquare,
                          {
                            transform: [
                              {
                                rotate: squareRotation.interpolate({
                                  inputRange: [0, 1, 2, 3, 4],
                                  outputRange: ['0deg', '90deg', '180deg', '270deg', '360deg'],
                                }),
                              },
                            ],
                          },
                        ]}
                      />
                      <Text style={styles.loadingText}>Building your game idea</Text>
                      <View style={styles.loadingSubtextContainer}>
                        <Text style={styles.loadingSubtext}>Pro tip: Tap on </Text>
                        <View style={styles.inlineRing} />
                        <Text style={styles.loadingSubtext}> for status</Text>
                      </View>
                    </View>
                  ) : (
                    <>
                      <CustomIcon name="game-controller" size={SCREEN_W * 0.15} color="#4B5563" />
                      <Text style={styles.placeholderText}>Describe your game idea below</Text>
                    </>
                  )}
                </View>
              )}
            </View>
          </View>

        <View style={[styles.inputSection, { paddingBottom: insets.bottom + SCREEN_H * 0.02 }]}>
          <View style={styles.inputContainer}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={isEditMode ? "What do you want to edit?" : "Describe your game idea..."}
              placeholderTextColor="#6B7280"
              style={styles.input}
              multiline
              maxLength={1000}
              editable={!isGenerating && !isEditing}
            />
            <Pressable
              style={[styles.sendBtn, (!input.trim() || isGenerating || isEditing) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || isGenerating || isEditing}
            >
              <CustomIcon
                name={isGenerating || isEditing ? "hourglass" : "arrow-forward"}
                size={SCREEN_W * 0.04}
                color="#FFFFFF"
              />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {showPlanOverlay && (
        <Animated.View
          style={[
            styles.planOverlay,
            {
              transform: [
                {
                  translateY: planOverlayAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [SCREEN_H, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <BlurView intensity={90} tint="dark" style={styles.planOverlayBlur}>
            <View style={styles.planOverlayContent}>
              <View style={styles.draggableHeaderArea} {...overlayPanResponder.panHandlers}>
                <View style={styles.planOverlayHandle} />
                <View style={styles.planOverlayHeader}>
                  <Text style={styles.planOverlayTitle}>Generation History</Text>
                  <Pressable onPress={hidePlanInfo} hitSlop={10}>
                    <CustomIcon name="close" size={SCREEN_W * 0.06} color="#FFFFFF" />
                  </Pressable>
                </View>
              </View>
              <ScrollView
                ref={scrollViewRef}
                style={styles.planOverlayBody}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.overlayContainer}>
                  {/* User query row - initial query */}
                  {userQuery && (
                    <View style={styles.fullRow}>
                      <View style={styles.userQueryRow}>
                        <View style={styles.userQueryBubble}>
                          <Text style={styles.userQueryText}>{userQuery}</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Game plan row */}
                  {(gamePlan || (isGenerating && gamePlanTypingText)) && (
                    <View style={styles.fullRow}>
                      <View style={styles.gamePlanRow}>
                        <View style={styles.gamePlanContainer}>
                          <Text style={styles.gamePlanTitle}>Game Plan</Text>
                          {gamePlan ? (
                            <>
                              <Text style={styles.gamePlanText} numberOfLines={gamePlanExpanded ? undefined : 3}>
                                {gamePlan}
                              </Text>
                              {gamePlan.split('\n').length > 3 && (
                                <Pressable
                                  style={styles.gamePlanMoreBtn}
                                  onPress={() => setGamePlanExpanded(!gamePlanExpanded)}
                                >
                                  <Text style={styles.gamePlanMoreText}>
                                    {gamePlanExpanded ? 'Less' : 'More'}
                                  </Text>
                                </Pressable>
                              )}
                            </>
                          ) : (
                            <Text style={styles.gamePlanTypingText}>
                              {gamePlanTypingText}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Round status rows - show generation history first, then edit history */}
                  {[...roundHistory, ...editRoundHistory].map((status, index) => (
                    <View key={`${status.round}-${index}`} style={styles.fullRow}>
                      {status.isUserQuery ? (
                        // Render user edit query as a chat bubble (right-aligned)
                        <View style={styles.userQueryRow}>
                          <View style={[styles.userQueryBubble, styles.editQueryBubble]}>
                            <Text style={styles.userQueryText}>{status.message}</Text>
                          </View>
                        </View>
                      ) : status.isProblemFinder ? (
                        // Render Problem Finder analysis with special styling
                        <View style={styles.problemFinderRow}>
                          <View style={styles.problemFinderContainer}>
                            <View style={styles.problemFinderHeader}>
                              <View style={styles.problemFinderIconContainer}>
                                <CustomIcon name="search" size={SCREEN_W * 0.04} color="#F59E0B" />
                              </View>
                              <Text style={styles.problemFinderTitle}>Problem Finder Analysis</Text>
                              {status.tokens && typeof status.tokens === 'number' && status.tokens > 0 && (
                                <Text style={styles.problemFinderTokens}>
                                  {status.tokens.toLocaleString()} tokens
                                </Text>
                              )}
                            </View>
                            <Text style={styles.problemFinderMessage}>{status.message}</Text>
                            {status.status && (
                              <Text style={styles.problemFinderReasoning}>{status.status}</Text>
                            )}
                            {status.problems && status.problems.length > 0 && (
                              <View style={styles.problemsList}>
                                {status.problems.map((problem, idx) => (
                                  <View key={problem.id} style={styles.problemItem}>
                                    <View style={styles.problemHeader}>
                                      <View style={[
                                        styles.priorityBadge,
                                        problem.priority === 'high' && styles.priorityHigh,
                                        problem.priority === 'medium' && styles.priorityMedium,
                                        problem.priority === 'low' && styles.priorityLow
                                      ]}>
                                        <Text style={styles.priorityText}>{problem.priority.toUpperCase()}</Text>
                                      </View>
                                      <Text style={styles.problemNumber}>#{idx + 1}</Text>
                                    </View>
                                    <Text style={styles.problemDescription}>{problem.description}</Text>
                                    {problem.old_code && (
                                      <View style={styles.codeBlock}>
                                        <Text style={styles.codeLabel}>Current:</Text>
                                        <Text style={styles.codeText} numberOfLines={2}>{problem.old_code}</Text>
                                      </View>
                                    )}
                                    {problem.new_code && (
                                      <View style={styles.codeBlock}>
                                        <Text style={styles.codeLabel}>Suggested:</Text>
                                        <Text style={styles.codeText} numberOfLines={2}>{problem.new_code}</Text>
                                      </View>
                                    )}
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        </View>
                      ) : (
                        // Render normal status row
                        <View style={styles.statusRow}>
                          <View style={styles.statusItem}>
                          {status.tokens && typeof status.tokens === 'number' && status.tokens > 0 && (
                            <Text style={styles.statusTokenRight}>
                              {status.tokens.toLocaleString()}
                            </Text>
                          )}
                          <View style={styles.statusIconContainer}>
                            <View style={[
                              styles.statusIcon,
                              status.round === currentRound && isGenerating && styles.statusIconActive,
                              status.round < currentRound && styles.statusIconCompleted
                            ]}>
                              {status.round < currentRound && (
                                <CustomIcon
                                  name="checkmark"
                                  size={SCREEN_W * 0.02}
                                  color="#FFFFFF"
                                />
                              )}
                              {status.round === currentRound && isGenerating && (
                                <Animated.View
                                  style={[
                                    styles.pulsingDot,
                                    {
                                      opacity: pulsingAnimation.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [0.3, 1],
                                      }),
                                      transform: [{
                                        scale: pulsingAnimation.interpolate({
                                          inputRange: [0, 1],
                                          outputRange: [0.8, 1.2],
                                        }),
                                      }],
                                    }
                                  ]}
                                />
                              )}
                            </View>
                          </View>
                          <View style={styles.statusContent}>
                            <View style={styles.statusRoundRow}>
                              <Text style={[
                                styles.statusRound,
                                status.round === currentRound && isGenerating && styles.statusRoundActive,
                                status.round < currentRound && styles.statusRoundCompleted
                              ]}>
                                Round {status.round}
                              </Text>
                            </View>
                            <Text style={[
                              styles.statusMessage,
                              status.round === currentRound && isGenerating && styles.statusMessageActive
                            ]}>{status.message || ''}</Text>
                            {status.description && typeof status.description === 'string' && (
                              <Text style={styles.statusDescription}>{status.description}</Text>
                            )}
                            {status.status && typeof status.status === 'string' && (
                              <View style={styles.statusUpdateContainer}>
                                {status.status.split('\n').filter(line => line.trim()).map((line, index) => (
                                  <Text key={index} style={styles.statusUpdate}>
                                    • {line.trim().replace(/^[•\-\*]\s*/, '')}
                                  </Text>
                                ))}
                              </View>
                            )}
                            </View>
                          </View>
                        </View>
                      )}
                    </View>
                  ))}


                </View>
              </ScrollView>
            </View>
          </BlurView>
        </Animated.View>
      )}

      {showActionMenu && (
        <Pressable style={styles.actionMenuBackdrop} onPress={() => setShowActionMenu(false)}>
          <View style={styles.actionMenu}>
            <Pressable style={styles.actionMenuItem} onPress={() => handleMenuAction('new')}>
              <CustomIcon name="add" size={SCREEN_W * 0.05} color="#FFFFFF" />
              <Text style={[styles.actionMenuText, styles.newChatText]}>New Chat</Text>
            </Pressable>
            {gameHtml && (
              <Pressable 
                style={[styles.actionMenuItem, isGenerating && styles.actionMenuItemDisabled]} 
                onPress={() => handleMenuAction('refresh')}
                disabled={isGenerating}
              >
                <CustomIcon 
                  name="refresh" 
                  size={SCREEN_W * 0.05} 
                  color={isGenerating ? "#666666" : "#FFFFFF"} 
                />
                <Text style={[styles.actionMenuText, isGenerating && styles.actionMenuTextDisabled]}>
                  Refresh Game
                </Text>
              </Pressable>
            )}
            <Pressable style={styles.actionMenuItem} onPress={() => handleMenuAction('publish')}>
              <CustomIcon name="arrow-up" size={SCREEN_W * 0.05} color="#FFFFFF" />
              <Text style={styles.actionMenuText}>Publish Game</Text>
            </Pressable>
          </View>
        </Pressable>
      )}

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
  titleCompact: {
    fontSize: SCREEN_W * 0.04,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: SCREEN_W * 0.025,
  },
  headerPlanBtn: {
    width: SCREEN_W * 0.045,
    height: SCREEN_W * 0.045,
    borderRadius: SCREEN_W * 0.0225,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  headerPlanBtnRing: {
    position: "absolute",
    width: "100%",
    height: "100%",
    borderRadius: SCREEN_W * 0.0225,
    borderWidth: 4,
    borderColor: "#8B5CF6", // Bluish violet color
    shadowColor: "#8B5CF6",
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 12,
  },
  headerPlanBtnInner: {
    width: "70%",
    height: "70%",
    borderRadius: SCREEN_W * 0.0225,
    backgroundColor: "rgba(139, 92, 246, 0.2)", // Semi-transparent bluish violet
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#8B5CF6",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  headerPlanBtnContainer: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
  },
  statusHint: {
    position: "absolute",
    right: SCREEN_W * 0.055,
    paddingRight: SCREEN_W * 0.02,
    zIndex: -1,
  },
  statusHintText: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.032,
    fontWeight: "600",
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  menuBtn: {
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
  loadingContainer: {
    alignItems: "center",
    gap: SCREEN_H * 0.025,
  },
  rotatingSquare: {
    width: SCREEN_W * 0.12,
    height: SCREEN_W * 0.12,
    borderWidth: 4,
    borderColor: "#7C3AED",
    borderRadius: SCREEN_W * 0.015,
    backgroundColor: "transparent",
    shadowColor: "#7C3AED",
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.04,
    fontWeight: "600",
  },
  loadingSubtext: {
    color: "#6B7280",
    fontSize: SCREEN_W * 0.032,
    fontWeight: "400",
    textAlign: "center",
  },
  loadingSubtextContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  inlineRing: {
    width: SCREEN_W * 0.028,
    height: SCREEN_W * 0.028,
    borderRadius: SCREEN_W * 0.014,
    borderWidth: 2.5,
    borderColor: "#8B5CF6",
    backgroundColor: "rgba(139, 92, 246, 0.15)",
  },
  inputSection: {
    paddingHorizontal: SCREEN_W * 0.04,
    paddingTop: SCREEN_H * 0.015,
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
    minHeight: SCREEN_H * 0.025,
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
  planOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    top: SCREEN_H * 0.3,
    borderTopLeftRadius: SCREEN_W * 0.05,
    borderTopRightRadius: SCREEN_W * 0.05,
    overflow: "hidden",
  },
  planOverlayHandle: {
    alignSelf: "center",
    width: SCREEN_W * 0.12,
    height: SCREEN_H * 0.005,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: SCREEN_H * 0.0025,
    marginBottom: SCREEN_H * 0.015,
  },
  planOverlayBlur: {
    flex: 1,
    borderTopLeftRadius: SCREEN_W * 0.05,
    borderTopRightRadius: SCREEN_W * 0.05,
  },
  planOverlayContent: {
    flex: 1,
    paddingTop: SCREEN_H * 0.05,
  },
  draggableHeaderArea: {
    paddingTop: SCREEN_H * 0.015,
  },
  planOverlayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SCREEN_W * 0.05,
    paddingBottom: SCREEN_H * 0.02,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  planOverlayTitle: {
    fontSize: SCREEN_W * 0.05,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  planOverlayBody: {
    flex: 1,
    paddingHorizontal: SCREEN_W * 0.05,
    paddingTop: SCREEN_H * 0.025,
  },
  overlayContainer: {
    flexDirection: "column",
    paddingBottom: SCREEN_H * 0.05,
    gap: SCREEN_H * 0.025,
  },
  fullRow: {
    width: "100%",
  },
  userQueryRow: {
    alignItems: "flex-end",
    marginBottom: SCREEN_H * 0.01,
  },
  gamePlanRow: {
    alignItems: "flex-start",
    marginBottom: SCREEN_H * 0.01,
  },
  statusRow: {
    alignItems: "flex-start",
    marginBottom: SCREEN_H * 0.01,
  },
  tokenRow: {
    alignItems: "flex-start",
    marginBottom: SCREEN_H * 0.01,
  },
  statusItem: {
    flexDirection: "row",
    gap: SCREEN_W * 0.03,
    flex: 1,
    position: "relative",
  },
  statusIconContainer: {
    paddingTop: SCREEN_H * 0.005,
  },
  statusIcon: {
    width: SCREEN_W * 0.025,
    height: SCREEN_W * 0.025,
    borderRadius: SCREEN_W * 0.0125,
    backgroundColor: "#4B5563",
    alignItems: "center",
    justifyContent: "center",
  },
  statusIconActive: {
    backgroundColor: "#7C3AED",
  },
  statusIconCompleted: {
    backgroundColor: "#10B981",
  },
  pulsingDot: {
    width: SCREEN_W * 0.015,
    height: SCREEN_W * 0.015,
    borderRadius: SCREEN_W * 0.0075,
    backgroundColor: "#FFFFFF",
  },
  statusRoundActive: {
    color: "#7C3AED",
    fontWeight: "700",
  },
  statusRoundCompleted: {
    color: "#10B981",
  },
  statusMessageActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  statusContent: {
    flex: 1,
  },
  statusRoundRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SCREEN_W * 0.02,
    marginBottom: SCREEN_H * 0.005,
  },
  statusRound: {
    color: "#9CA3AF",
    fontSize: SCREEN_W * 0.03,
    fontWeight: "600",
    marginBottom: SCREEN_H * 0.005,
  },
  statusMessage: {
    color: "#E5E7EB",
    fontSize: SCREEN_W * 0.035,
    marginBottom: SCREEN_H * 0.005,
  },
  statusDescription: {
    color: "#9CA3AF",
    fontSize: SCREEN_W * 0.03,
    fontStyle: "italic",
  },
  statusUpdateContainer: {
    marginTop: SCREEN_H * 0.005,
  },
  statusUpdate: {
    color: "#6B7280",
    fontSize: SCREEN_W * 0.03,
    fontStyle: "italic",
    marginTop: SCREEN_H * 0.005,
    lineHeight: SCREEN_W * 0.045,
  },
  statusTokenText: {
    color: "#6B7280",
    fontSize: SCREEN_W * 0.028,
    fontWeight: "500",
  },
  statusTokenRight: {
    position: "absolute",
    right: 0,
    top: SCREEN_H * 0.005,
    color: "#6B7280",
    fontSize: SCREEN_W * 0.028,
    fontWeight: "500",
  },
  gamePlanContainer: {
    marginTop: SCREEN_H * 0.025,
    paddingTop: SCREEN_H * 0.02,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  gamePlanTitle: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.04,
    fontWeight: "600",
    marginBottom: SCREEN_H * 0.01,
  },
  gamePlanText: {
    color: "#E5E7EB",
    fontSize: SCREEN_W * 0.032,
    lineHeight: SCREEN_W * 0.05,
    textAlign: "justify",
  },
  gamePlanMoreBtn: {
    marginTop: SCREEN_H * 0.01,
    alignSelf: "flex-start",
  },
  gamePlanMoreText: {
    color: "#7C3AED",
    fontSize: SCREEN_W * 0.032,
    fontWeight: "600",
  },
  gamePlanTypingText: {
    color: "#9CA3AF",
    fontSize: SCREEN_W * 0.032,
    lineHeight: SCREEN_W * 0.05,
    fontStyle: "italic",
  },
  userQueryBubble: {
    backgroundColor: "#FFFFFF",
    borderRadius: SCREEN_W * 0.04,
    padding: SCREEN_W * 0.035,
    maxWidth: SCREEN_W * 0.65,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  userQueryText: {
    color: "#000000",
    fontSize: SCREEN_W * 0.032,
    lineHeight: SCREEN_W * 0.048,
  },
  editQueryBubble: {
    backgroundColor: "#E8F5E8", // Light green background for edit queries
    borderWidth: 1,
    borderColor: "#10B981",
  },
  problemFinderRow: {
    alignItems: "flex-start",
    marginBottom: SCREEN_H * 0.02,
  },
  problemFinderContainer: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderRadius: SCREEN_W * 0.03,
    padding: SCREEN_W * 0.04,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
    width: "100%",
  },
  problemFinderHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SCREEN_H * 0.01,
    gap: SCREEN_W * 0.02,
  },
  problemFinderIconContainer: {
    width: SCREEN_W * 0.07,
    height: SCREEN_W * 0.07,
    borderRadius: SCREEN_W * 0.035,
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  problemFinderTitle: {
    color: "#F59E0B",
    fontSize: SCREEN_W * 0.035,
    fontWeight: "700",
    flex: 1,
  },
  problemFinderTokens: {
    color: "#9CA3AF",
    fontSize: SCREEN_W * 0.028,
    fontWeight: "500",
  },
  problemFinderMessage: {
    color: "#FCD34D",
    fontSize: SCREEN_W * 0.033,
    fontWeight: "600",
    marginBottom: SCREEN_H * 0.005,
  },
  problemFinderReasoning: {
    color: "#E5E7EB",
    fontSize: SCREEN_W * 0.03,
    fontStyle: "italic",
    marginBottom: SCREEN_H * 0.015,
    lineHeight: SCREEN_W * 0.045,
  },
  problemsList: {
    gap: SCREEN_H * 0.015,
    marginTop: SCREEN_H * 0.01,
  },
  problemItem: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: SCREEN_W * 0.025,
    padding: SCREEN_W * 0.035,
    borderLeftWidth: 3,
    borderLeftColor: "#F59E0B",
  },
  problemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SCREEN_W * 0.02,
    marginBottom: SCREEN_H * 0.008,
  },
  priorityBadge: {
    paddingHorizontal: SCREEN_W * 0.02,
    paddingVertical: SCREEN_H * 0.003,
    borderRadius: SCREEN_W * 0.01,
  },
  priorityHigh: {
    backgroundColor: "#DC2626",
  },
  priorityMedium: {
    backgroundColor: "#F59E0B",
  },
  priorityLow: {
    backgroundColor: "#10B981",
  },
  priorityText: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.025,
    fontWeight: "700",
  },
  problemNumber: {
    color: "#9CA3AF",
    fontSize: SCREEN_W * 0.028,
    fontWeight: "600",
  },
  problemDescription: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.032,
    lineHeight: SCREEN_W * 0.048,
    marginBottom: SCREEN_H * 0.008,
  },
  codeBlock: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: SCREEN_W * 0.015,
    padding: SCREEN_W * 0.025,
    marginTop: SCREEN_H * 0.005,
  },
  codeLabel: {
    color: "#9CA3AF",
    fontSize: SCREEN_W * 0.028,
    fontWeight: "600",
    marginBottom: SCREEN_H * 0.003,
  },
  codeText: {
    color: "#E5E7EB",
    fontSize: SCREEN_W * 0.028,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: SCREEN_W * 0.04,
  },
  actionMenuBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: SCREEN_H * 0.08,
    paddingRight: SCREEN_W * 0.05,
  },
  actionMenu: {
    backgroundColor: "#1A1A1A",
    borderRadius: SCREEN_W * 0.03,
    minWidth: SCREEN_W * 0.5,
    paddingVertical: SCREEN_H * 0.01,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  actionMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SCREEN_H * 0.015,
    paddingHorizontal: SCREEN_W * 0.04,
    gap: SCREEN_W * 0.03,
  },
  actionMenuText: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.04,
    fontWeight: "500",
  },
  newChatText: {
    color: "#EF4444",
    fontWeight: "600",
  },
  actionMenuItemDisabled: {
    opacity: 0.5,
  },
  actionMenuTextDisabled: {
    color: "#666666",
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
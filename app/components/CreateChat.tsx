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

/*
interface EditModeProblemAnalyzerOutput {
  user_intent: string;
  issues_found: Array<{
    line_number: number;
    issue: string;
  }>;
  instructions_for_patch_developer: string;
}
*/

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
  const [extractedChecklist, setExtractedChecklist] = useState<string[]>([]);
  const [checkedItems, setCheckedItems] = useState<boolean[]>([]);
  const [progressWidth, setProgressWidth] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [roundStatus, setRoundStatus] = useState<string>("");

  // Toggle checklist item
  const toggleChecklistItem = (index: number) => {
    setCheckedItems(prev => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  // Progress animation effect
  useEffect(() => {
    const total = extractedChecklist.length;
    if (!total || progressWidth === 0) {
      progressAnim.setValue(0);
      return;
    }
    const completed = checkedItems.filter(Boolean).length;
    Animated.timing(progressAnim, {
      toValue: (completed / total) * progressWidth,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [checkedItems, extractedChecklist.length, progressWidth]);

  // Extract checklist items from game plan
  const extractChecklistItems = (gamePlanText: string): string[] => {
    const checklistItems: string[] = [];

    // Look for checklist items with various patterns
    const patterns = [
      /- -\s*"([^"]+)"/g,  // - - "description"
      /- -\s*([^\n]+)/g,   // - - description
      /\d+\.\s*"([^"]+)"/g, // 1. "description"
      /\d+\.\s*([^\n]+)/g,  // 1. description
      /\*\s*"([^"]+)"/g,    // * "description"
      /\*\s*([^\n]+)/g,     // * description
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(gamePlanText)) !== null) {
        const item = match[1] || match[0].replace(/^[-*\d\s."]+/, '').trim();
        if (item && item.length > 10) { // Filter out very short items
          checklistItems.push(item);
        }
      }
    });

    // Remove duplicates and return
    return [...new Set(checklistItems)].slice(0, 10); // Limit to 10 items
  };

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

  // Expandable sections state
  const [expandedSections, setExpandedSections] = useState<{[key: string]: boolean}>({});
  
  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Version control state
  const [gameVersions, setGameVersions] = useState<Array<{html: string, round: number}>>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(0);
  const [showVersionControl, setShowVersionControl] = useState(false);
  const [lastViewedRound, setLastViewedRound] = useState(0);
  const [webViewKey, setWebViewKey] = useState(0);

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
      const targetText = "...";
      setGamePlanTypingText("");

      let currentIndex = 0;
      const typingInterval = setInterval(() => {
        currentIndex++;
        if (currentIndex <= targetText.length) {
          setGamePlanTypingText(targetText.slice(0, currentIndex));
        } else {
          // Reset and loop
          currentIndex = 0;
          setGamePlanTypingText("");
        }
      }, 400); // Type one character every 400ms for slower animation

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

  // Track versions whenever gameHtml changes
  useEffect(() => {
    if (gameHtml && currentRound > 0) {
      setGameVersions(prev => {
        const newVersions = [...prev, { html: gameHtml, round: currentRound }];
        setCurrentVersionIndex(newVersions.length - 1);
        return newVersions;
      });
    }
  }, [gameHtml, currentRound]);

  // Force WebView re-render when gameHtml changes
  useEffect(() => {
    if (gameHtml) {
      setWebViewKey(prev => prev + 1);
    }
  }, [gameHtml]);

  // Status hint animation - show status text permanently
  useEffect(() => {
    if (!gamePlan) return; // Only show when there's a game plan
    
    setShowStatusHint(true);
    
    // Slide in animation
    Animated.timing(statusHintAnimation, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

  }, [gamePlan, statusHintAnimation]);

  // Get current status text
  const getStatusText = () => {
    if (!gamePlan) return '';
    if (isGenerating) {
      if (currentRound === 0) return 'Game Plan';
      return `Round ${currentRound}`;
    }
    if (completedRounds > 0 && !isGenerating) {
      return 'Completed';
    }
    return `Round ${currentRound}`;
  };

  // Get notification badge count (new rounds since last viewed)
  const getNotificationBadge = () => {
    const newRounds = currentRound - lastViewedRound;
    return newRounds > 0 ? `+${newRounds}` : '';
  };

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




  // System prompt
  const buildSystemPrompt = (): string => {
    return `You are UniAgent-Physics game engine developer, a single self-steering agent that produces, critiques, and iterates on a single-file HTML5 mini-game.

Protocol (use this exact special syntax; each on its own line):
- [[DO:LINT]]            -> Ask controller to run an HTML syntax linter on your latest full HTML and return results.
- [[DO:QG_CHECK]]        -> Ask controller to run general QA checks (bugs, disconnects, mobile readiness) and return results.
- [[TOSELF: <prompt>]]   -> Send yourself a new "user" instruction for the next turn (self-feedback). Keep it concise and actionable.
- [[ASK:FINAL_OK?]]      -> Ask controller if all checks are clear. Controller will reply. If not clear, continue improving.
- [[FINAL]]              -> Use only when you have a clean, mobile-friendly, playable single-file HTML and all checks are clear.

Round-limited build rules (CRITICAL):
- You will receive a ROUND CHECKLIST containing up to two checklist items per round.
- Implement ONLY the provided ROUND CHECKLIST items for that round. Do NOT implement other checklist items ahead of schedule.
- If CARRYOVER FIXES from the previous round are provided, fix ONLY those issues and still implement ONLY this round's two items.
- You may use the full GAME PLAN for context, but do not add features beyond the two items specified for the current round.

Rules:
- Always output one complete, valid HTML5 document (<!DOCTYPE html> ... </html>) whenever you write or revise code.
- After the HTML, list any commands using the special syntax lines above. Zero or more per turn.
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
- For joystick controls, make sure they are mirrored by the character or whatever it's controlling.
- For 3D games, make sure the camera is properly set up and the scene is rendered correctly.
- Use advanced Physics and math for the game.
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

  // Edit system prompt for full HTML generation
  const buildEditSystemPrompt = (): string => {
    return `You are UniAgent-Physics game engine developer, a single self-steering agent that edits existing HTML5 mini-games according to user requests.

Protocol (use this exact special syntax; each on its own line):
- [[DO:LINT]]            -> Ask controller to run an HTML syntax linter on your latest full HTML and return results.
- [[DO:QG_CHECK]]        -> Ask controller to run general QA checks (bugs, disconnects, mobile readiness) and return results.
- [[TOSELF: <prompt>]]   -> Send yourself a new "user" instruction for the next turn (self-feedback). Keep it concise and actionable.
- [[ASK:FINAL_OK?]]      -> Ask controller if all checks are clear. Controller will reply. If not clear, continue improving.
- [[FINAL]]              -> Use only when you have a clean, mobile-friendly, playable single-file HTML and all checks are clear.

Rules:
- Always output one complete, valid HTML5 document (<!DOCTYPE html> ... </html>) that incorporates the requested changes.
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

When editing the game, ensure you:
- Preserve the existing game structure and functionality unless specifically asked to change it
- Implement ONLY the requested changes
- Make sure touch targets are at least 44px for accessibility
- Keep the game mobile-friendly

Deliverable:
- A complete single-file <html> with inline <style> and <script>, playable and mobile-friendly, incorporating the requested edits.`;
  };

  // Edit API call
  const callEditAPI = async (userQuery: string, currentHtml: string): Promise<string> => {
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
    const userPrompt = `USER REQUEST: ${userQuery}

CURRENT HTML CODE:
${currentHtml}

Please edit the HTML code above according to the user request and output the complete, updated HTML document.`;

    console.log('\n=== EDIT API REQUEST ===');
    console.log('User Query:', userQuery);
    console.log('System Prompt:', systemPrompt.substring(0, 200) + '...');
    console.log('HTML Lines:', currentHtml.split('\n').length);

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
    const aiResponse = data.choices?.[0]?.message?.content || "";
    
    console.log('\n=== EDIT API RESPONSE ===');
    console.log('Full Response:');
    console.log(aiResponse);
    console.log('=== END RESPONSE ===\n');
    
    return aiResponse;
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


  // Problem Finder Agent
  const buildProblemFinderSystemPrompt = (): string => {
    return `You are a Problem Finder Agent. Be lenient and brief. Flag only true blockers for the focused items.

FOCUS: You get FOCUS_CHECKLIST_ITEMS (usually two) and ROUND context. Evaluate ONLY these items. Ignore everything else unless it directly blocks these items.

TASK: Check if focused items work correctly. Fix syntax/linter errors first if they block these items.

OUTPUT (JSON only):
{
  "should_terminate": false,
  "reasoning": "Max 1-2 short lines",
  "problems": [
    {
      "id": 1,
      "description": "Max ~100 chars, actionable",
      "priority": "high"
    }
  ]
}

RULES: Max 2 problems total. Keep descriptions short and actionable. If the focused items are okay and no blockers remain, set "should_terminate": true.`;
  };

  const callProblemFinder = async (
    htmlCode: string,
    gamePlan: string,
    lintErrors: LintError[],
    qgIssues: GeneralIssue[],
    roundIndex: number,
    focusChecklistItems: string[]
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

    const focusList = focusChecklistItems.length
      ? focusChecklistItems.map((it, i) => `${i + 1}) ${it}`).join('\n')
      : '(none)';

    const userPrompt = `Analyze ONLY the focused checklist items for the last implemented round.

ROUND CONTEXT:
- Current round index: ${roundIndex}
- FOCUS_CHECKLIST_ITEMS (to validate from previous round):
${focusList}

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

  // Edit Mode Problem Analyzer
  /*
  const buildEditModeProblemAnalyzerPrompt = (): string => {
    return `You are an Edit Mode Problem Analyzer. Analyze user requests and identify exact code issues with line numbers.

INPUTS:
- User's edit request
- Numbered HTML code (each line prefixed with line number)

TASK:
Find exact line numbers where the issue exists. Point to the problematic code.

OUTPUT (JSON only):
{
  "user_intent": "What user wants to achieve",
  "issues_found": [
    {
      "line_number": 42,
      "issue": "Missing floor collision detection in game loop"
    }
  ],
  "instructions_for_patch_developer": "Brief instructions on what needs to be fixed"
}

RULES:
- Use exact line numbers from the numbered code
- Be specific and concise
- Max 3 issues`;
  };
  */

  /*
  const callEditModeProblemAnalyzer = async (
    userRequest: string,
    numberedHtmlCode: string
  ): Promise<{ output: EditModeProblemAnalyzerOutput; usage: any }> => {
    const appConfigService = AppConfigService.getInstance();
    const config = await appConfigService.getConfig();

    // Get API key from config with fallback to env variables (same as Problem Finder)
    const apiKey = config.api_key_gpt ||
      (typeof process !== "undefined" &&
        (process as any).env &&
          (((process as any).env.EXPO_PUBLIC_OPENAI_API_KEY as string) ||
           (process as any).env.OPENAI_API_KEY)) ||
      "";

    if (!apiKey) {
      throw new Error("Missing OpenAI API key");
    }

    const systemPrompt = buildEditModeProblemAnalyzerPrompt();

    const userPrompt = `USER REQUEST:
${userRequest}

NUMBERED HTML CODE:
${numberedHtmlCode.substring(0, 15000)}${numberedHtmlCode.length > 15000 ? '\n... (code truncated for length)' : ''}

Identify the exact line numbers with issues and provide your analysis in JSON format.`;

    console.log('\n=== EDIT MODE PROBLEM ANALYZER API REQUEST ===');
    console.log('User Request:', userRequest.substring(0, 100));
    console.log('Numbered HTML Lines:', numberedHtmlCode.split('\n').length);

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
      throw new Error(`Edit Mode Problem Analyzer API error: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    let parsedOutput: EditModeProblemAnalyzerOutput;
    try {
      parsedOutput = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse Edit Mode Problem Analyzer output:", content);
      parsedOutput = {
        user_intent: userRequest,
        issues_found: [],
        instructions_for_patch_developer: userRequest
      };
    }

    return {
      output: parsedOutput,
      usage: data.usage
    };
  };
  */

  // Controller loop with Problem Finder integration
  const controllerLoop = async (userTopic: string, maxRounds = 5): Promise<string> => {
    const systemPrompt = buildSystemPrompt();
    const messages: Array<{role: string, content: string}> = [];

    setAgentMessage('Analyzing your game idea...');
    let checklistItems: string[] = []; // NEW: hold extracted checklist for round slicing
    let carryoverFixes: string[] = []; // NEW: problems from PF to fix next round
    let plannedRounds = maxRounds; // Initialize with default
    const preRoundPrompt = `Take this basic game idea and expand it into detailed instructions for building a mini-game:
<note>Keep the instructions concise and retain the length of the idea given in the developer message above. Too many instructions will cause the game to be too complex and not playable.</note>
Basic idea: ${userTopic}

Create detailed instructions that include:
1. **Idea description**: Write 2-3 lines describing the complete game concept, mechanics, and goal
2. **Render**: Analyze the game concept and specify 2D or 3D rendering with appropriate library choice:
   - For 3D games (space, depth, rotation, 3D objects): Use Three.js
   - For 2D games (platformers, puzzles, classic arcade): Use HTML5 Canvas API
   - If the query doesn't specify, make a reasonable assumption based on typical game mechanics
3. **Color Theme**: Choose ONE theme from the list and specify 4-6 main colors with hex codes. IMPORTANT: Do NOT use Neon/Cyber theme unless specifically requested by the user.
   - **Arcade Bright**: \`#FF0000\`, \`#0000FF\`, \`#FFFF00\`, \`#00FF00\`, \`#FFFFFF\`, \`#000000\`
   - **Pastel Casual**: \`#FFB6C1\`, \`#87CEEB\`, \`#98FB98\`, \`#DDA0DD\`, \`#FFF8DC\`, \`#FFE4E1\`
   - **Dark Mode**: \`#0d0d0d\`, \`#1a1a1a\`, \`#2d2d2d\`, \`#00d9ff\`, \`#ff6b6b\`, \`#ffffff\`
   - **Retro 8-bit**: \`#000000\`, \`#FFFFFF\`, \`#E0E0E0\`, \`#880000\`, \`#008888\`, \`#FFFF00\`
   - **Nature**: \`#228B22\`, \`#8B4513\`, \`#87CEEB\`, \`#FFD700\`, \`#90EE90\`, \`#2F4F4F\`
   - **Monochrome + Accent**: \`#000000\`, \`#202020\`, \`#404040\`, \`#808080\`, \`#FF6B35\`, \`#FFFFFF\`
4. **Controls**: Specify ONLY mobile-friendly controls - touch gestures, screen buttons, etc. (mention specific control names every time based on game requirements)
5. **Camera View**: Describe the camera perspective and behavior

Output ONLY the detailed instructions in a clear, structured format. This will be used as input for the actual game development.

Example methodology: Iterative Micro-Build Architecture (IMBA) - A structured prompt-driven development algorithm that constructs complex systems through small, self-contained iterative instructions. Each micro-step builds directly on the previous one, ensuring predictable progress, modular clarity, and LLM-friendly scalability.

IMPORTANT: Always mention camera view/viewport setup in the FIRST checklist item itself to ensure users see visual output immediately.
Do not use colors in the checklist items.
Keep the plan concise (6-15 lines total). Use this format:

**IMBA Enhanced Examples (Pro Game Dev Tier)**

**1) Treasure Diver**
A serene but skill-based underwater exploration game where the player controls a diver collecting coins from cave systems while avoiding jellyfish and oxygen depletion. The gameplay emphasizes realistic drag, buoyancy, and fluid motion in a visually layered aquatic world.
Render in 2D using HTML5 Canvas API with full mobile compatibility.
Color Theme - #0077BE (ocean blue), #FFD700 (coins), #FF6B6B (jellyfish), #90EE90 (seaweed), #2F4F4F (cave walls), #FFFFFF (bubbles/UI).
Controls - Touch joystick on left for directional swim, swipe up for upward dash, tap right side to use a short oxygen boost.
Camera View - Smooth follow using interpolation and dynamic zoom for spatial awareness.

Checklist
- - "Begin by building the ocean environment and visible diver controls together using HTML5 Canvas setup, render gradient background (#0077BE → #002F4F) across 800x600, add joystick area (radius 60px) on left-bottom and dash/tap zones on right side, ensure all UI controls are visibly responsive with alpha overlay to guide touch areas"
- - "Create diver avatar at (100, 350) using composite geometry (body rectangle 30x40, circular head radius 10) with velocity vector v=[0,0] and acceleration a=[0,0], render in layered order so diver appears over background and is interactable from first frame"
- - "Implement control mapping from joystick and swipe events to movement vectors; calculate joystick angle θ = atan2(dy,dx), movement force F = k*[cosθ, sinθ] with drag Fd = -c*v, integrate via v += (F+Fd)*Δt, update diver position p += v each frame for continuous movement"
- - "Distribute six collectible coins along curved underwater paths using sinusoidal placement (x_i = 250 + i*100, y_i = 340 + 30*sin(i*0.6)), apply glow gradient (#FFD700 → #FFF5B0) and attach collision radius 10px, detect coin collection when ||p_diver - p_coin|| < 15"
- - "Add environmental dynamics including oxygen bar depletion, camera follow behavior camera_x = lerp(camera_x, diver.x - 200, 0.08), apply zoom-out scale 0.9→1.0 during dashes, and layered parallax seabed moving at 0.4x speed for realistic underwater depth"


**2) Sky Glider**
An endless aerial glide game where the player controls a hang glider collecting coins while navigating clouds and avoiding birds. The design merges physics of lift, drag, and tilt-based input with layered motion parallax and responsive touch zones.
Render in 2D with HTML5 Canvas for lightweight physics rendering.
Color Theme - #87CEEB (sky), #FFB6C1 (glider), #FFD700 (coins), #DDA0DD (storm clouds), #FFFFFF (fluffy clouds), #98FB98 (birds).
Controls - Tilt or drag joystick to steer horizontally, swipe upward to climb using lift, tap right side for a short speed burst.
Camera View - Forward-tracking with predictive zoom-out and parallax motion for atmosphere.

Checklist
- - "Initialize environment and visible control layers simultaneously using Canvas gradient background (#87CEEB → #E0F6FF) and overlay transparent control guides, define left zone for tilt/joystick control and right zone for speed boost, ensure immediate input feedback through small on-screen indicators"
- - "Construct hang glider at (120, 300) using polygon vertices (nose, left wing, right wing), define state variables p=[x,y], v=[vx,vy], θ (angle), and ω (angular velocity), ensure glider rendering order keeps it centered and highlighted against sky"
- - "Apply touch and tilt input mapping to aerodynamic motion; compute lift = 0.5*ρ*v²*Cl(θ), drag = 0.5*ρ*v²*Cd(θ), use Cl=1.2*sin(2θ), Cd=0.05+0.1*sin²(θ), integrate motion via v += (Lift + Drag + Gravity)*Δt and adjust θ = tilt_x*0.1 or swipe_y*0.05"
- - "Add collectible coins along path (x_i = 300 + i*100, y_i = 260 + 40*sin(i*0.5)) with subtle float animation y_i += 3*sin(t*0.05+i), give each coin a radial gradient glow (#FFD700 → #FFFACD) and circular collision bounds of 10px radius"
- - "Introduce reactive camera and environmental parallax using camera_x = lerp(camera_x, glider.x - 200, 0.1), move layered cloud textures at 0.6x scroll speed, apply turbulence oscillation A = 4*sin(t*3) during gusts, and animate FOV widening slightly during boosts for cinematic feel"`;

    const preRoundSystemMsg = 'You are an expert game designer. Being an expert in Physics in Game development. Your task is to take basic game ideas and expand them into detailed, actionable specifications for mobile mini-games easily developable with UniAgent-Physics game engine.';

    const preRoundMessages = [
      { role: 'user', content: preRoundPrompt }
    ];

    try {
      const { content: detailedInstructions } = await callOpenAI(preRoundSystemMsg, preRoundMessages);
      console.log('Detailed instructions generated:', detailedInstructions.slice(0, 400) + '...');

      setGamePlan(detailedInstructions);
      // Extract checklist items for overlay display
      const extracted = extractChecklistItems(detailedInstructions);
      checklistItems = extracted;
      setExtractedChecklist(extracted);
      setCheckedItems(new Array(extracted.length).fill(false)); // Initialize all as unchecked
      progressAnim.setValue(0);

      // Prepare ROUND 1: only first two checklist items
      const round1Items = extracted.slice(0, 2);
      const round1List = round1Items.map((it, i) => `${i + 1}) ${it}`).join('\n');

      const initUser = `ROUND 1 — Implement ONLY these two checklist items:
${round1List}

GAME PLAN (for context only, do not implement beyond the two items above):
${detailedInstructions}

Output one complete HTML file. After the HTML, request checks with [[DO:LINT]] and [[DO:QG_CHECK]], and add one [[TOSELF: ...]] instruction for next turn.`;

      messages.push({ role: 'user', content: initUser });

      // Decide total planned rounds = pairs of checklist items (at least 1)
      const totalRoundPairs = Math.max(1, Math.ceil(extracted.length / 2));
      plannedRounds = Math.max(maxRounds, totalRoundPairs);

    } catch (error) {
      console.warn('Pre-round failed, using basic input:', error);
      // Fallback: still enforce round-limited approach with no extracted checklist
      const initUser = `User request: Build a tiny playable mini-game from this idea:
${userTopic}

ROUND 1 — Implement ONLY the minimal scene setup and one core interaction you infer from the idea (2 micro-items max). Do NOT implement additional features.

Output one complete HTML5 file. Then request checks with [[DO:LINT]] and [[DO:QG_CHECK]], and add one [[TOSELF: ...]] instruction to improve next turn.`;

      messages.push({ role: 'user', content: initUser });
    }

    let latestHtml: string | null = null;
    let lastLint: LintError[] = [];
    let lastQG: GeneralIssue[] = [];

    try {
      const { content: detailedInstructions } = await callOpenAI(preRoundSystemMsg, preRoundMessages);
      console.log('Detailed instructions generated:', detailedInstructions.slice(0, 400) + '...');

      setGamePlan(detailedInstructions);
      // Extract checklist items for overlay display
      const extracted = extractChecklistItems(detailedInstructions);
      checklistItems = extracted;
      setExtractedChecklist(extracted);
      setCheckedItems(new Array(extracted.length).fill(false)); // Initialize all as unchecked
      progressAnim.setValue(0);

      // Prepare ROUND 1: only first two checklist items
      const round1Items = extracted.slice(0, 2);
      const round1List = round1Items.map((it, i) => `${i + 1}) ${it}`).join('\n');

      const initUser = `ROUND 1 — Implement ONLY these two checklist items:
${round1List}

GAME PLAN (for context only, do not implement beyond the two items above):
${detailedInstructions}

Output one complete HTML file. After the HTML, request checks with [[DO:LINT]] and [[DO:QG_CHECK]], and add one [[TOSELF: ...]] instruction for next turn.`;

      messages.push({ role: 'user', content: initUser });

      // Decide total planned rounds = pairs of checklist items (at least 1)
      const totalRoundPairs = Math.max(1, Math.ceil(extracted.length / 2));
      plannedRounds = Math.max(maxRounds, totalRoundPairs);

    } catch (error) {
      console.warn('Pre-round failed, using basic input:', error);
      // Fallback: still enforce round-limited approach with no extracted checklist
      const initUser = `User request: Build a tiny playable mini-game from this idea:
${userTopic}

ROUND 1 — Implement ONLY the minimal scene setup and one core interaction you infer from the idea (2 micro-items max). Do NOT implement additional features.

Output one complete HTML5 file. Then request checks with [[DO:LINT]] and [[DO:QG_CHECK]], and add one [[TOSELF: ...]] instruction to improve next turn.`;

      messages.push({ role: 'user', content: initUser });
    }

    for (let roundIdx = 1; roundIdx <= plannedRounds; roundIdx++) {
      setCurrentRound(roundIdx);
      
      // Run Problem Finder before rounds 2+ on the PREVIOUS pair only
      if (roundIdx > 1 && latestHtml) {
        setAgentMessage(`Problem Finder: Analyzing round ${roundIdx - 1} items...`);
        console.log(`\n=== PROBLEM FINDER ANALYSIS (Before Round ${roundIdx}) ===`);

        const prevStart = (roundIdx - 2) * 2;
        const prevPair = checklistItems.slice(prevStart, prevStart + 2);

        try {
          const { output: problemFinderOutput, usage: pfUsage } = await callProblemFinder(
            latestHtml || '',
            gamePlan || userTopic,
            lastLint,
            lastQG,
            roundIdx,
            prevPair
          );

          // Update token tracking for Problem Finder
          if (pfUsage) {
            updateTokenUsage(pfUsage);
          }

          console.log('Problem Finder Output:', JSON.stringify(problemFinderOutput, null, 2));

          // Store carryover fixes (descriptions only) for next round
          carryoverFixes = (problemFinderOutput.problems || []).map(p => p.description);

          // Add PF status to round history
          setRoundHistory(prev => [...prev, {
            round: roundIdx,
            message: problemFinderOutput.should_terminate
              ? "Problem Finder: Focus items OK - Ready to finalize/check next set"
              : `Problem Finder: Found ${problemFinderOutput.problems.length} issue(s) on focused items`,
            description: problemFinderOutput.reasoning || "Code analysis complete",
            timestamp: Date.now(),
            status: problemFinderOutput.reasoning,
            tokens: pfUsage?.total_tokens || 0,
            isProblemFinder: true,
            problems: problemFinderOutput.problems
          }]);

          // If PF says terminate AND no more pairs remain, we can accept and return
          const nextStart = (roundIdx - 1) * 2;
          const hasNextPair = nextStart < checklistItems.length;
          if (problemFinderOutput.should_terminate && !hasNextPair) {
            console.log('Problem Finder: All focused items OK and no more pairs. Terminating generation.');
            setAgentMessage('Problem Finder: Code quality verified for focused items! ✨');
            setCompletedRounds(roundIdx - 1);
            return latestHtml || '';
          }
        } catch (error) {
          console.error('Problem Finder failed:', error);
          setAgentMessage(`Problem Finder error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          // Continue with normal generation even if Problem Finder fails
        }
      }

      // Push the current round's instruction (except round 1 which was already pushed)
      const pairStart = (roundIdx - 1) * 2;
      const currentPair = checklistItems.slice(pairStart, pairStart + 2);
      if (roundIdx > 1) {
        if (currentPair.length > 0) {
          const currentList = currentPair.map((it, i) => `${i + 1}) ${it}`).join('\n');
          const carryText = carryoverFixes.length
            ? `CARRYOVER FIXES (from previous round, fix only these):
- ${carryoverFixes.join('\n- ')}\n\n` : '';

          const roundUser = `ROUND ${roundIdx} — Implement ONLY these two checklist items:
${currentList}

${carryText}GAME PLAN (for context only, do not implement beyond the two items above):
${gamePlan || userTopic}

Output one complete HTML file. After the HTML, request checks with [[DO:LINT]] and [[DO:QG_CHECK]], and add one [[TOSELF: ...]] instruction for next turn.`;
          messages.push({ role: 'user', content: roundUser });
        } else {
          // No more pairs: ask agent to fix any carryover then finalize
          const carryText = carryoverFixes.length
            ? `CARRYOVER FIXES (apply now):
- ${carryoverFixes.join('\n- ')}\n\n` : '';
          messages.push({ role: 'user', content:
`No new checklist items remain. ${carryText}If all fixes are applied, run [[DO:LINT]] and [[DO:QG_CHECK]], then [[ASK:FINAL_OK?]]. If all clear, respond with [[FINAL]] and include the full final HTML.` });
        }
      }

      setAgentMessage(`Round ${roundIdx}: Generating response...`);

      console.log(`\n=== ROUND ${roundIdx} ===`);
      const { content: response, usage } = await callOpenAI(
        systemPrompt,
        messages
      );
      const responseText = stripCodeFences(response || '');
      console.log('\nAGENT OUTPUT (truncated):\n' + responseText.slice(0, 600) + (responseText.length > 600 ? '\n...' : ''));

      // Calculate tokens used in this round from API response
      const tokensUsedThisRound = usage?.total_tokens || 0;

      const followups: Array<{role: string, content: string}> = [];

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
            const lintErrors = lintHtml(latestHtml || '');
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
            const qg = analyzeGeneralIssues(latestHtml || '');
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
            const lintErrors = lintHtml(latestHtml || '');
            const qgIssues = analyzeGeneralIssues(latestHtml || '');
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


      if (commands.length === 0) {
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

  // Handle edit request with Edit Mode Problem Analyzer and retry logic
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
        isUserQuery: true
      }]);

      // Generate edited HTML directly with user's request
      let currentHtml = gameHtml;
      let attempt = 1;
      const maxAttempts = 2;

      while (attempt <= maxAttempts) {
        // Add "HTML Editor working" status
        setEditRoundHistory(prev => [...prev, {
          round: prev.length + 1,
          message: attempt === 1 ? "HTML Editor: Applying changes..." : `HTML Editor: Fixing errors (Attempt ${attempt})`,
          description: attempt === 1 ? "Generating updated HTML with requested changes" : "Correcting linter/syntax errors",
          timestamp: Date.now(),
          status: attempt === 1 ? "Generating full HTML" : "Fixing remaining errors"
        }]);

        // Prepare the prompt for HTML editor with user's direct request
        let promptToSend = editQuery;

        if (attempt > 1) {
          // For retry attempts, include linter errors
          const lintErrors = lintHtml(currentHtml);
          if (lintErrors.length > 0) {
            const errorReport = formatErrorsForPrompt(lintErrors);
            promptToSend = `${editQuery}

ALSO FIX THESE LINTER/SYNTAX ERRORS:
${errorReport}`;
          }
        }

        console.log('\n=== DIRECT EDIT API REQUEST ===');
        console.log('User Query:', editQuery);

        // Call edit API to generate full HTML
        const editedHtml = await callEditAPI(promptToSend, currentHtml);

        // Extract HTML from the response (remove any extra text before/after HTML tags)
        const htmlMatch = editedHtml.match(/<!DOCTYPE html[\s\S]*<\/html>/i);
        const cleanHtml = htmlMatch ? htmlMatch[0] : editedHtml;

        // Check for linter errors in the edited HTML
        const lintErrors = lintHtml(cleanHtml);

        if (lintErrors.length === 0 || attempt === maxAttempts) {
          // No errors or final attempt - accept the result
          setGameHtml(cleanHtml);

          if (lintErrors.length === 0) {
            // Success - no errors
            setEditRoundHistory(prev => [...prev, {
              round: prev.length + 1,
              message: "Edit completed successfully! ✨",
              description: "All changes applied without errors",
              timestamp: Date.now(),
              status: `Generated updated HTML${attempt > 1 ? ` (after ${attempt} attempts)` : ''}`
            }]);
          } else {
            // Final attempt with remaining errors
            setEditRoundHistory(prev => [...prev, {
              round: prev.length + 1,
              message: "Edit completed with warnings",
              description: "Changes applied but some errors remain",
              timestamp: Date.now(),
              status: `Generated HTML with ${lintErrors.length} remaining linter errors`
            }]);
          }
          break;
        } else {
          // Errors found, prepare for retry
          currentHtml = cleanHtml;
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
        description: "Error during edit process",
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
        setCompletedRounds(currentRound); // Mark completion
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
    setExtractedChecklist([]);
    setCheckedItems([]);
    progressAnim.setValue(0);
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
    setGameVersions([]);
    setCurrentVersionIndex(0);
    setLastViewedRound(0);
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
            setExtractedChecklist([]);
            setCheckedItems([]);
            progressAnim.setValue(0);
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
            setGameVersions([]);
            setCurrentVersionIndex(0);
            setLastViewedRound(0);
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
    setLastViewedRound(currentRound); // Mark current round as viewed
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

  const handleVersionPrevious = () => {
    if (currentVersionIndex > 0) {
      const newIndex = currentVersionIndex - 1;
      setCurrentVersionIndex(newIndex);
      setGameHtml(gameVersions[newIndex].html);
    }
  };

  const handleVersionNext = () => {
    if (currentVersionIndex < gameVersions.length - 1) {
      const newIndex = currentVersionIndex + 1;
      setCurrentVersionIndex(newIndex);
      setGameHtml(gameVersions[newIndex].html);
    }
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
                  <Text style={styles.statusHintText}>{getStatusText()}</Text>
                </Animated.View>
              )}
              <Pressable 
                style={styles.headerPlanBtn} 
                onPress={showPlanInfo}
                onLongPress={() => setShowVersionControl(true)}
                delayLongPress={500}
              >
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
                {getNotificationBadge() && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>{getNotificationBadge()}</Text>
                  </View>
                )}
              </Pressable>
              {showVersionControl && gameVersions.length > 1 && (
                <Pressable 
                  style={styles.versionControlBackdrop}
                  onPress={() => setShowVersionControl(false)}
                >
                  <Pressable style={styles.versionControlTray} onPress={(e) => e.stopPropagation()}>
                    <Pressable 
                      style={[styles.versionControlBtn, currentVersionIndex === 0 && styles.versionControlBtnDisabled]}
                      onPress={handleVersionPrevious}
                      disabled={currentVersionIndex === 0}
                    >
                      <CustomIcon name="chevron-back" size={SCREEN_W * 0.05} color={currentVersionIndex === 0 ? "#666666" : "#FFFFFF"} />
                    </Pressable>
                    <Text style={styles.versionControlText}>
                      v{currentVersionIndex + 1}/{gameVersions.length}
                    </Text>
                    <Pressable 
                      style={[styles.versionControlBtn, currentVersionIndex === gameVersions.length - 1 && styles.versionControlBtnDisabled]}
                      onPress={handleVersionNext}
                      disabled={currentVersionIndex === gameVersions.length - 1}
                    >
                      <CustomIcon name="chevron-forward" size={SCREEN_W * 0.05} color={currentVersionIndex === gameVersions.length - 1 ? "#666666" : "#FFFFFF"} />
                    </Pressable>
                  </Pressable>
                </Pressable>
              )}
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
                  key={`webview-${webViewKey}`}
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
                  <Text style={styles.planOverlayTitle}>History</Text>
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
                  {(gamePlan || (isGenerating && !gamePlan)) && (
                    <View style={styles.fullRow}>
                      <View style={styles.gamePlanRow}>
                        <View style={styles.gamePlanContainer}>
                          <Text style={styles.gamePlanLabel}>GAME PLAN</Text>
                          {gamePlan ? (
                            <>
                              <Text 
                                style={styles.gamePlanText} 
                                numberOfLines={gamePlanExpanded ? undefined : 3}
                              >
                                {gamePlan}
                              </Text>
                              {gamePlan.length > 150 && (
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
                            <View style={styles.typingIndicatorContainer}>
                              <Text style={styles.gamePlanTypingText}>
                                {gamePlanTypingText || ' '}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Checklist row */}
                  {extractedChecklist.length > 0 && (
                    <View style={styles.fullRow}>
                      <View style={styles.gamePlanRow}>
                        <View style={styles.gamePlanContainer}>
                          <Text style={styles.gamePlanLabel}>DEVELOPMENT CHECKLIST</Text>
                          {extractedChecklist.length > 0 && (
                            <View style={styles.progressContainer}>
                              <Text style={styles.progressText}>
                                {checkedItems.filter(Boolean).length}/{extractedChecklist.length} completed
                              </Text>
                              <View
                                style={styles.progressBar}
                                onLayout={e => setProgressWidth(e.nativeEvent.layout.width)}
                              >
                                <Animated.View style={[styles.progressFill, { width: progressAnim }]} />
                              </View>
                            </View>
                          )}
                          {extractedChecklist.map((item, index) => (
                              <Pressable
                                key={index}
                                onPress={() => toggleChecklistItem(index)}
                                style={({ pressed }) => [
                                  styles.checklistItem,
                                  pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
                                ]}
                                hitSlop={8}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: !!checkedItems[index] }}
                                accessibilityLabel={item}
                              >
                                <View style={styles.checkbox}>
                                  {checkedItems[index] ? (
                                    <View style={styles.checkboxChecked}>
                                      <CustomIcon name="checkmark" size={SCREEN_W * 0.025} color="#FFFFFF" />
                                    </View>
                                  ) : (
                                    <View style={styles.checkboxEmpty} />
                                  )}
                                </View>
                                <Text
                                  style={[
                                    styles.checklistText,
                                    checkedItems[index] && styles.checklistTextChecked,
                                  ]}
                                  numberOfLines={2}
                                >
                                  {item}
                                </Text>
                              </Pressable>
                            ))}
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
                        // Render Problem Finder analysis with new design
                        <View style={styles.issuesFoundContainer}>
                          <View style={styles.issuesFoundHeader}>
                            <Text style={styles.issuesFoundTitle}>Issues Found</Text>
                            {status.problems && status.problems.length > 0 && (
                              <View style={styles.issuesCountBadge}>
                                <Text style={styles.issuesCountText}>{status.problems.length} problem{status.problems.length !== 1 ? 's' : ''}</Text>
                              </View>
                            )}
                            {status.tokens && typeof status.tokens === 'number' && status.tokens > 0 && (
                              <Text style={styles.issuesTokens}>
                                {status.tokens.toLocaleString()}
                              </Text>
                            )}
                          </View>
                          {status.problems && status.problems.length > 0 && (
                            <>
                              <View style={styles.issuesList}>
                                {status.problems.slice(0, expandedSections[`problems-${status.round}-${index}`] ? undefined : 3).map((problem) => (
                                  <View key={problem.id} style={styles.issueItem}>
                                    <View style={styles.issueHeader}>
                                      <Text style={[
                                        styles.issuePriority,
                                        problem.priority === 'high' && styles.issuePriorityHigh,
                                        problem.priority === 'medium' && styles.issuePriorityMedium,
                                        problem.priority === 'low' && styles.issuePriorityLow
                                      ]}>
                                        {problem.priority.toUpperCase()}
                                      </Text>
                                    </View>
                                    <Text style={styles.issueDescription}>
                                      {expandedSections[`problem-${problem.id}`] || problem.description.length <= 100 
                                        ? problem.description 
                                        : `${problem.description.slice(0, 100)}...`}
                                    </Text>
                                    {problem.description.length > 100 && (
                                      <Pressable
                                        style={styles.issueMoreBtn}
                                        onPress={() => toggleSection(`problem-${problem.id}`)}
                                      >
                                        <Text style={styles.issueMoreText}>
                                          {expandedSections[`problem-${problem.id}`] ? 'Less' : 'More'}
                                        </Text>
                                      </Pressable>
                                    )}
                                  </View>
                                ))}
                              </View>
                              {status.problems.length > 3 && (
                                <Pressable
                                  style={styles.issuesMoreBtn}
                                  onPress={() => toggleSection(`problems-${status.round}-${index}`)}
                                >
                                  <Text style={styles.issuesMoreText}>
                                    {expandedSections[`problems-${status.round}-${index}`] ? 'Show Less' : 'Show More'}
                                  </Text>
                                </Pressable>
                              )}
                            </>
                          )}
                        </View>
                      ) : (
                        // Render normal status row with new design
                        <View style={styles.roundCard}>
                          <View style={styles.roundHeader}>
                            <View style={styles.roundHeaderLeft}>
                              <View style={[
                                styles.roundNumberCircle,
                                status.round === currentRound && isGenerating && styles.roundNumberCircleActive,
                                status.round < currentRound && styles.roundNumberCircleCompleted
                              ]}>
                                <Text style={styles.roundNumber}>{status.round}</Text>
                              </View>
                              <View style={styles.roundTitleContainer}>
                                <Text style={[
                                  styles.roundTitle,
                                  status.round === currentRound && isGenerating && styles.roundTitleActive
                                ]}>
                                  {status.message || `Round ${status.round}`}
                                </Text>
                                {status.description && typeof status.description === 'string' && (
                                  <Text style={styles.roundSubtitle}>{status.description}</Text>
                                )}
                              </View>
                            </View>
                            {status.tokens && typeof status.tokens === 'number' && status.tokens > 0 && (
                              <Text style={styles.roundTokens}>
                                {status.tokens.toLocaleString()}
                              </Text>
                            )}
                          </View>
                          {status.status && typeof status.status === 'string' && (
                            <>
                              <View style={styles.roundBulletList}>
                                {status.status.split('\n').filter(line => line.trim()).slice(0, expandedSections[`round-${status.round}-${index}`] ? undefined : 3).map((line, idx) => (
                                  <View key={idx} style={styles.roundBulletItem}>
                                    <Text style={styles.roundBullet}>•</Text>
                                    <Text style={styles.roundBulletText}>
                                      {line.trim().replace(/^[•\-\*]\s*/, '')}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                              {status.status.split('\n').filter(line => line.trim()).length > 3 && (
                                <Pressable
                                  style={styles.roundMoreBtn}
                                  onPress={() => toggleSection(`round-${status.round}-${index}`)}
                                >
                                  <Text style={styles.roundMoreText}>
                                    {expandedSections[`round-${status.round}-${index}`] ? 'Less' : 'More'}
                                  </Text>
                                </Pressable>
                              )}
                            </>
                          )}
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
  notificationBadge: {
    position: "absolute",
    top: -SCREEN_H * 0.005,
    right: -SCREEN_W * 0.008,
    backgroundColor: "#EF4444",
    borderRadius: SCREEN_W * 0.025,
    minWidth: SCREEN_W * 0.04,
    height: SCREEN_W * 0.04,
    paddingHorizontal: SCREEN_W * 0.01,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#000000",
  },
  notificationBadgeText: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.024,
    fontWeight: "700",
  },
  versionControlBackdrop: {
    position: "absolute",
    top: SCREEN_H * 0.05,
    right: 0,
    zIndex: 1000,
  },
  versionControlTray: {
    backgroundColor: "#1A1A1A",
    borderRadius: SCREEN_W * 0.03,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SCREEN_H * 0.008,
    paddingHorizontal: SCREEN_W * 0.02,
    gap: SCREEN_W * 0.02,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  versionControlBtn: {
    padding: SCREEN_W * 0.015,
    borderRadius: SCREEN_W * 0.015,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  versionControlBtnDisabled: {
    opacity: 0.3,
  },
  versionControlText: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.032,
    fontWeight: "600",
    minWidth: SCREEN_W * 0.15,
    textAlign: "center",
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
    top: SCREEN_H * 0.20,
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
    paddingTop: SCREEN_H * 0.015,
  },
  draggableHeaderArea: {
    paddingTop: SCREEN_H * 0.005,
  },
  planOverlayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SCREEN_W * 0.05,
    paddingBottom: SCREEN_H * 0.005,
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
    paddingVertical: SCREEN_H * 0.02,
    width: '100%',
  },
  gamePlanLabel: {
    color: "#9CA3AF",
    fontSize: SCREEN_W * 0.028,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: SCREEN_H * 0.01,
  },
  gamePlanText: {
    color: "#D1D5DB",
    fontSize: SCREEN_W * 0.034,
    lineHeight: SCREEN_W * 0.052,
  },
  gamePlanMoreBtn: {
    marginTop: SCREEN_H * 0.008,
    alignSelf: "flex-start",
  },
  gamePlanMoreText: {
    color: "#7C3AED",
    fontSize: SCREEN_W * 0.03,
    fontWeight: "600",
  },
  typingIndicatorContainer: {
    minHeight: SCREEN_W * 0.052,
    justifyContent: "center",
  },
  gamePlanTypingText: {
    color: "#9CA3AF",
    fontSize: SCREEN_W * 0.034,
    lineHeight: SCREEN_W * 0.052,
  },
  progressContainer: {
    marginBottom: SCREEN_H * 0.02,
    width: '100%',
  },
  progressText: {
    color: "#8E8E93",
    fontSize: SCREEN_W * 0.03,
    fontWeight: "700",
    marginBottom: SCREEN_H * 0.006,
  },
  progressBar: {
    height: 8,
    backgroundColor: "rgba(60, 60, 67, 0.12)", // iOS systemGray5-like track
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#0A84FF", // iOS systemBlue
    borderRadius: 999,
  },
  // Checklist row (premium iOS card style)
  checklistItem: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: SCREEN_H * 0.014,
    paddingHorizontal: SCREEN_W * 0.035,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(60, 60, 67, 0.10)",
    marginBottom: SCREEN_H * 0.012,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 2,
  },
  // Checkbox container
  checkbox: {
    width: SCREEN_W * 0.065,
    height: SCREEN_W * 0.065,
    marginRight: SCREEN_W * 0.03,
  },
  // Unchecked circle
  checkboxEmpty: {
    width: "100%",
    height: "100%",
    borderRadius: SCREEN_W * 0.0325,
    borderWidth: 2,
    borderColor: "rgba(60, 60, 67, 0.36)", // systemGray3-ish
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  // Checked circle
  checkboxChecked: {
    width: "100%",
    height: "100%",
    borderRadius: SCREEN_W * 0.0325,
    borderWidth: 2,
    borderColor: "#0A84FF",
    backgroundColor: "#0A84FF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0A84FF",
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
  },
  // Text styles
  checklistText: {
    flex: 1,
    color: "#1C1C1E", // iOS label
    fontSize: SCREEN_W * 0.036,
    fontWeight: "600",
  },
  checklistTextChecked: {
    color: "#8E8E93", // iOS secondary label
    opacity: 0.75,
    textDecorationLine: "none",
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
    backgroundColor: "#000000",
    borderRadius: SCREEN_W * 0.03,
    padding: SCREEN_W * 0.04,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    width: "100%",
  },
  problemFinderHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SCREEN_H * 0.01,
    gap: SCREEN_W * 0.02,
  },
  problemFinderTitle: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.035,
    fontWeight: "700",
    flex: 1,
  },
  problemFinderTokens: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.028,
    fontWeight: "500",
  },
  problemFinderDescription: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.03,
    fontStyle: "italic",
    marginBottom: SCREEN_H * 0.015,
    lineHeight: SCREEN_W * 0.04,
  },
  problemFinderMessage: {
    color: "#FCD34D",
    fontSize: SCREEN_W * 0.033,
    fontWeight: "600",
    marginBottom: SCREEN_H * 0.005,
  },
  problemFinderReasoning: {
    color: "#E5E7EB",
    fontSize: SCREEN_W * 0.026,
    fontStyle: "italic",
    marginBottom: SCREEN_H * 0.015,
    lineHeight: SCREEN_W * 0.04,
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
  problemPriority: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.032,
    fontWeight: "700",
    marginBottom: SCREEN_H * 0.005,
  },
  problemPriorityLabel: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.032,
    fontWeight: "700",
  },
  // New Round Card Design
  roundCard: {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderRadius: SCREEN_W * 0.03,
    padding: SCREEN_W * 0.04,
    marginBottom: SCREEN_H * 0.02,
  },
  roundHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: SCREEN_H * 0.015,
  },
  roundHeaderLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    gap: SCREEN_W * 0.03,
  },
  roundNumberCircle: {
    width: SCREEN_W * 0.08,
    height: SCREEN_W * 0.08,
    borderRadius: SCREEN_W * 0.04,
    backgroundColor: "#4B5563",
    alignItems: "center",
    justifyContent: "center",
  },
  roundNumberCircleActive: {
    backgroundColor: "#7C3AED",
  },
  roundNumberCircleCompleted: {
    backgroundColor: "#10B981",
  },
  roundNumber: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.038,
    fontWeight: "700",
  },
  roundTitleContainer: {
    flex: 1,
  },
  roundTitle: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.04,
    fontWeight: "600",
    marginBottom: SCREEN_H * 0.005,
  },
  roundTitleActive: {
    color: "#7C3AED",
  },
  roundSubtitle: {
    color: "#9CA3AF",
    fontSize: SCREEN_W * 0.03,
  },
  roundTokens: {
    color: "#6B7280",
    fontSize: SCREEN_W * 0.028,
    fontWeight: "500",
  },
  roundBulletList: {
    marginTop: SCREEN_H * 0.01,
    gap: SCREEN_H * 0.008,
  },
  roundBulletItem: {
    flexDirection: "row",
    gap: SCREEN_W * 0.02,
  },
  roundBullet: {
    color: "#9CA3AF",
    fontSize: SCREEN_W * 0.034,
    lineHeight: SCREEN_W * 0.05,
  },
  roundBulletText: {
    color: "#D1D5DB",
    fontSize: SCREEN_W * 0.032,
    lineHeight: SCREEN_W * 0.05,
    flex: 1,
  },
  roundMoreBtn: {
    marginTop: SCREEN_H * 0.01,
    alignSelf: "flex-start",
  },
  roundMoreText: {
    color: "#7C3AED",
    fontSize: SCREEN_W * 0.03,
    fontWeight: "600",
  },
  // New Issues Found Design (Smaller)
  issuesFoundContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderRadius: SCREEN_W * 0.025,
    padding: SCREEN_W * 0.03,
    marginBottom: SCREEN_H * 0.015,
  },
  issuesFoundHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SCREEN_H * 0.01,
    gap: SCREEN_W * 0.015,
  },
  issuesFoundTitle: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.032,
    fontWeight: "700",
  },
  issuesCountBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: SCREEN_W * 0.015,
    paddingHorizontal: SCREEN_W * 0.02,
    paddingVertical: SCREEN_H * 0.003,
    flex: 1,
  },
  issuesCountText: {
    color: "#E5E7EB",
    fontSize: SCREEN_W * 0.025,
    fontWeight: "600",
  },
  issuesTokens: {
    color: "#6B7280",
    fontSize: SCREEN_W * 0.025,
    fontWeight: "500",
  },
  issuesList: {
    gap: SCREEN_H * 0.01,
  },
  issueItem: {
    paddingBottom: SCREEN_H * 0.008,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  issueHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SCREEN_H * 0.005,
  },
  issuePriority: {
    fontSize: SCREEN_W * 0.024,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  issuePriorityHigh: {
    color: "#EF4444",
  },
  issuePriorityMedium: {
    color: "#F59E0B",
  },
  issuePriorityLow: {
    color: "#10B981",
  },
  issueDescription: {
    color: "#D1D5DB",
    fontSize: SCREEN_W * 0.028,
    lineHeight: SCREEN_W * 0.042,
  },
  issueMoreBtn: {
    marginTop: SCREEN_H * 0.004,
    alignSelf: "flex-start",
  },
  issueMoreText: {
    color: "#7C3AED",
    fontSize: SCREEN_W * 0.025,
    fontWeight: "600",
  },
  issuesMoreBtn: {
    marginTop: SCREEN_H * 0.01,
    alignSelf: "center",
    backgroundColor: "rgba(124, 58, 237, 0.1)",
    paddingHorizontal: SCREEN_W * 0.035,
    paddingVertical: SCREEN_H * 0.008,
    borderRadius: SCREEN_W * 0.015,
  },
  issuesMoreText: {
    color: "#7C3AED",
    fontSize: SCREEN_W * 0.028,
    fontWeight: "600",
  },
  // Edit Mode Problem Analyzer styles (Matching other cards)
  editAnalyzerRow: {
    alignItems: "flex-start",
    marginBottom: SCREEN_H * 0.02,
  },
  editAnalyzerContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderRadius: SCREEN_W * 0.03,
    padding: SCREEN_W * 0.04,
    width: "100%",
  },
  editAnalyzerHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SCREEN_H * 0.01,
    gap: SCREEN_W * 0.02,
  },
  editAnalyzerIconContainer: {
    width: SCREEN_W * 0.07,
    height: SCREEN_W * 0.07,
    borderRadius: SCREEN_W * 0.035,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  editAnalyzerTitle: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.035,
    fontWeight: "700",
    flex: 1,
  },
  editAnalyzerTokens: {
    color: "#6B7280",
    fontSize: SCREEN_W * 0.028,
    fontWeight: "500",
  },
  editAnalyzerMessage: {
    color: "#D1D5DB",
    fontSize: SCREEN_W * 0.033,
    fontWeight: "600",
    marginBottom: SCREEN_H * 0.015,
  },
  analysisSection: {
    marginBottom: SCREEN_H * 0.015,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: SCREEN_W * 0.02,
    padding: SCREEN_W * 0.03,
  },
  analysisSectionTitle: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.03,
    fontWeight: "700",
    marginBottom: SCREEN_H * 0.01,
  },
  lineIssueItem: {
    flexDirection: "row",
    marginBottom: SCREEN_H * 0.008,
    gap: SCREEN_W * 0.02,
  },
  lineNumber: {
    color: "#F59E0B",
    fontSize: SCREEN_W * 0.028,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  issueText: {
    color: "#E5E7EB",
    fontSize: SCREEN_W * 0.028,
    lineHeight: SCREEN_W * 0.042,
    flex: 1,
  },
  instructionsContent: {
    color: "#FCD34D",
    fontSize: SCREEN_W * 0.028,
    lineHeight: SCREEN_W * 0.042,
    fontStyle: "italic",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    padding: SCREEN_W * 0.025,
    borderRadius: SCREEN_W * 0.015,
    borderLeftWidth: 3,
    borderLeftColor: "#F59E0B",
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
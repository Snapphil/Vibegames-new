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
import BackgroundGameGenerationService from "../services/BackgroundGameGenerationService";
import * as Notifications from 'expo-notifications';
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


// Token tracking
interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// Game generation state
type GenerationStage = 
  | 'simple_code' 
  | 'checklist' 
  | 'mvp_code' 
  | 'linting_generic' 
  | 'mobile_optimize' 
  | 'linting_mobile'
  | 'final_inspection'
  | 'fixing_inspection'
  | 'complete';

interface GameCreatorProps {
  onGamePublished?: (game: any) => void;
}

export default function GameCreator({ onGamePublished }: GameCreatorProps = {}) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const backgroundGenerationService = BackgroundGameGenerationService.getInstance();

  // Core state
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [gameHtml, setGameHtml] = useState<string>("");
  const [checklist, setChecklist] = useState<string>("");
  const [currentStage, setCurrentStage] = useState<GenerationStage>('complete');
  const [stageMessage, setStageMessage] = useState<string>("");
  const [currentGenerationId, setCurrentGenerationId] = useState<string | null>(null);
  
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

  // Keyboard state
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Animations
  const successAnimation = useRef(new Animated.Value(0)).current;
  const scaleAnimation = useRef(new Animated.Value(0)).current;
  const stageProgressAnimation = useRef(new Animated.Value(0)).current;

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

  // Check for resumable generations on app start
  useEffect(() => {
    const checkResumableGenerations = async () => {
      try {
        const activeIds = await backgroundGenerationService.getActiveGenerations();
        if (activeIds.length > 0) {
          // Show resume option instead of auto-resuming
          Alert.alert(
            "Resume Generation?",
            "Found an unfinished game generation from your last session. Would you like to resume it?",
            [
              {
                text: "Start New",
                style: "destructive",
                onPress: async () => {
                  // Clear the old generation
                  for (const id of activeIds) {
                    await backgroundGenerationService.stopGeneration(id);
                  }
                }
              },
              {
                text: "Resume",
                style: "default",
                onPress: async () => {
                  // Resume the first active generation
                  const generationId = activeIds[0];
                  setCurrentGenerationId(generationId);
                  setIsGenerating(true);

                  await backgroundGenerationService.startGeneration(generationId, "", {
                    onProgress: (stage: string, progress: number) => {
                      const stageMessages = {
                        'simple_code': 'Generating simplest HTML...',
                        'checklist': 'Creating improvement checklist...',
                        'mvp_code': 'Implementing checklist improvements...',
                        'linting_generic': 'Checking HTML syntax...',
                        'mobile_optimize': 'Optimizing for mobile devices...',
                        'linting_mobile': 'Checking mobile HTML syntax...',
                        'final_inspection': 'Performing final quality check...',
                        'fixing_inspection': 'Fixing final issues...',
                        'complete': 'Game generation complete!',
                      };
                      setCurrentStage(stage as GenerationStage);
                      setStageMessage(stageMessages[stage as keyof typeof stageMessages] || stage);
                    },
                    onComplete: (html: string, tokens: any) => {
                      setGameHtml(html);
                      setCumulativeTokens(tokens);
                      setIsGenerating(false);
                      setCurrentStage('complete');
                      setStageMessage('Game generation complete!');
                      setCurrentGenerationId(null);
                    },
                    onError: (error: Error) => {
                      console.error("Background generation failed:", error);
                      Alert.alert("Error", "Failed to generate game. Please try again.");
                      setIsGenerating(false);
                      setCurrentStage('complete');
                      setStageMessage('');
                      setCurrentGenerationId(null);
                    }
                  });
                }
              }
            ]
          );
        }
      } catch (error) {
        console.warn("Failed to check resumable generations:", error);
      }
    };

    checkResumableGenerations();
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

  // Keyboard listeners
  useEffect(() => {
    const showListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const hideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  // Request notification permissions
  useEffect(() => {
    const requestPermissions = async () => {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        console.log('Notification permissions status:', status);
      } catch (error) {
        console.warn('Failed to request notification permissions:', error);
      }
    };

    requestPermissions();
  }, []);

  // Cleanup background service on unmount
  useEffect(() => {
    return () => {
      if (currentGenerationId) {
        backgroundGenerationService.stopGeneration(currentGenerationId);
      }
      // Note: We don't destroy the service here as it might be used by other components
    };
  }, [currentGenerationId, backgroundGenerationService]);

  // Stage progress animation
  useEffect(() => {
    const stageToProgress: Record<GenerationStage, number> = {
      'simple_code': 0.14,
      'checklist': 0.28,
      'mvp_code': 0.42,
      'linting_generic': 0.56,
      'mobile_optimize': 0.70,
      'linting_mobile': 0.84,
      'final_inspection': 0.92,
      'fixing_inspection': 0.96,
      'complete': 1.0,
    };

    Animated.timing(stageProgressAnimation, {
      toValue: stageToProgress[currentStage],
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [currentStage]);

  // Reset token tracking
  const resetCumulativeTokens = () => {
    setCumulativeTokens({
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    });
  };

  // Update token usage
  const updateTokenUsage = (usage: any) => {
    if (!usage) return;
    
    setCumulativeTokens(prev => ({
      prompt_tokens: prev.prompt_tokens + (usage.prompt_tokens || 0),
      completion_tokens: prev.completion_tokens + (usage.completion_tokens || 0),
      total_tokens: prev.total_tokens + (usage.total_tokens || 0),
    }));
  };


  // Main generation pipeline using background service
  const handleSend = async () => {
    const userTopic = input.trim();
    if (!userTopic || isGenerating) return;

    setInput("");
    Keyboard.dismiss();
    setIsGenerating(true);
    resetCumulativeTokens();
    setGameHtml("");
    setChecklist("");

    // Generate unique ID for this generation session
    const generationId = `generation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setCurrentGenerationId(generationId);

    try {
      await backgroundGenerationService.startGeneration(generationId, userTopic, {
        onProgress: (stage: string, progress: number) => {
          const stageMessages = {
            'simple_code': 'Generating simplest HTML...',
            'checklist': 'Creating improvement checklist...',
            'mvp_code': 'Implementing checklist improvements...',
            'linting_generic': 'Checking HTML syntax...',
            'mobile_optimize': 'Optimizing for mobile devices...',
            'linting_mobile': 'Checking mobile HTML syntax...',
            'final_inspection': 'Performing final quality check...',
            'fixing_inspection': 'Fixing final issues...',
            'complete': 'Game generation complete!',
          };
          setCurrentStage(stage as GenerationStage);
          setStageMessage(stageMessages[stage as keyof typeof stageMessages] || stage);
        },
        onComplete: (html: string, tokens: any) => {
          setGameHtml(html);
          setCumulativeTokens(tokens);
          setIsGenerating(false);
          setCurrentStage('complete');
          setStageMessage('Game generation complete!');
          setCurrentGenerationId(null);

          // Display token summary
          console.log("=".repeat(60));
          console.log("🎯 CUMULATIVE TOKEN USAGE SUMMARY");
          console.log("=".repeat(60));
          console.log(`📝 Total Prompt Tokens:     ${tokens.prompt_tokens.toLocaleString()}`);
          console.log(`🤖 Total Completion Tokens: ${tokens.completion_tokens.toLocaleString()}`);
          console.log(`💰 Total Tokens Used:       ${tokens.total_tokens.toLocaleString()}`);
          console.log("=".repeat(60));
        },
        onError: (error: Error) => {
          console.error("Background generation failed:", error);
          Alert.alert("Error", "Failed to generate game. Please try again.");
          setIsGenerating(false);
          setCurrentStage('complete');
          setStageMessage('');
          setCurrentGenerationId(null);
        }
      });

    } catch (error) {
      console.error("Failed to start background generation:", error);
      Alert.alert("Error", "Failed to start game generation. Please try again.");
      setIsGenerating(false);
      setCurrentStage('complete');
      setStageMessage('');
      setCurrentGenerationId(null);
    }
  };

  const handleNewGame = async () => {
    // Stop any active background generation
    if (currentGenerationId) {
      await backgroundGenerationService.stopGeneration(currentGenerationId);
      setCurrentGenerationId(null);
    }

    setGameHtml("");
    setChecklist("");
    setInput("");
    setGameName("");
    setGameDescription("");
    setCurrentStage('complete');
    setStageMessage("");
    resetCumulativeTokens();
    setIsGenerating(false);
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
          <Pressable style={styles.headerBtn} onPress={() => {
            Alert.alert(
              "Background Processing Info",
              "Currently using Expo Go - generation stops when app exits.\n\nFor true background processing:\n1. Create a development build\n2. Use 'eas build --platform android --profile development'\n\nSee README_BACKGROUND_PROCESSING.md for details.",
              [{ text: "OK" }]
            );
          }}>
            <CustomIcon name="help-circle" size={SCREEN_W * 0.05} color="#FFFFFF" />
          </Pressable>
          <Pressable style={styles.headerBtn} onPress={handleNewGame}>
            <CustomIcon name="refresh" size={SCREEN_W * 0.05} color="#FFFFFF" />
              </Pressable>
          <Pressable style={styles.headerBtn} onPress={handlePublish}>
                <CustomIcon name="arrow-up" size={SCREEN_W * 0.05} color="#FFFFFF" />
              </Pressable>
            </View>
      </View>

      {/* Main Content */}
      <KeyboardAvoidingView 
        style={styles.mainContent}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
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

            {/* Generation Progress Overlay */}
            {isGenerating && (
              <View style={styles.progressOverlay}>
                <BlurView intensity={30} tint="dark" style={styles.progressBlur}>
                  <View style={styles.progressContent}>
                    <Text style={styles.stageName}>{stageMessage}</Text>
                    
                    {/* Progress Bar */}
                    <View style={styles.progressTrack}>
                      <Animated.View 
                        style={[
                          styles.progressFill, 
                          { 
                            width: stageProgressAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%']
                            })
                          }
                        ]} 
                      />
                    </View>

                    {/* Token Counter */}
                    {cumulativeTokens.total_tokens > 0 && (
                      <View style={styles.tokenCounter}>
                        <CustomIcon name="analytics-outline" size={SCREEN_W * 0.035} color="#6B7280" />
                        <Text style={styles.tokenText}>
                          {cumulativeTokens.total_tokens.toLocaleString()} tokens
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
        <View style={[
          styles.inputSection,
          { paddingBottom: keyboardVisible ? insets.bottom + SCREEN_H * 0.05 : insets.bottom + SCREEN_H * 0.02 }
        ]}>
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

            {/* Generation Warning */}
            {isGenerating && (
              <View style={styles.generationWarning}>
                <CustomIcon name="warning" size={SCREEN_W * 0.035} color="#F59E0B" />
                <Text style={styles.warningText}>
                  ⚠️ Keep app open! Generation stops when you exit. For background processing, use a development build.
                </Text>
              </View>
            )}
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
  mainContent: {
    flex: 1,
  },
  gameContainer: {
    flex: 1,
    padding: SCREEN_W * 0.04,
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
  progressOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: SCREEN_W * 0.04,
  },
  progressBlur: {
    borderRadius: SCREEN_W * 0.03,
    overflow: "hidden",
  },
  progressContent: {
    padding: SCREEN_W * 0.04,
  },
  stageName: {
    color: "#FFFFFF",
    fontSize: SCREEN_W * 0.035,
    fontWeight: "600",
    marginBottom: SCREEN_H * 0.015,
  },
  progressTrack: {
    height: SCREEN_H * 0.006,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: SCREEN_H * 0.003,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#7C3AED",
    borderRadius: SCREEN_H * 0.003,
  },
  tokenCounter: {
    flexDirection: "row",
    alignItems: "center",
    gap: SCREEN_W * 0.02,
    marginTop: SCREEN_H * 0.015,
  },
  tokenText: {
    color: "#6B7280",
    fontSize: SCREEN_W * 0.03,
    fontVariant: ["tabular-nums"],
  },
  inputSection: {
    paddingHorizontal: SCREEN_W * 0.04,
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
  generationWarning: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderRadius: SCREEN_W * 0.02,
    paddingHorizontal: SCREEN_W * 0.03,
    paddingVertical: SCREEN_H * 0.01,
    marginTop: SCREEN_H * 0.01,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  warningText: {
    color: "#F59E0B",
    fontSize: SCREEN_W * 0.032,
    fontWeight: "500",
    marginLeft: SCREEN_W * 0.02,
    flex: 1,
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
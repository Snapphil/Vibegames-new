import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Alert } from 'react-native';
import AppConfigService from './AppConfigService';

/**
 * Background Game Generation Service
 *
 * NOTE: This service provides "pseudo-background" processing for Expo Go compatibility.
 * True background processing isn't available in Expo Go, but this service:
 * - Persists generation state to survive app restarts
 * - Provides progress notifications within the app session
 * - Allows resuming interrupted generations
 * - Shows completion notifications when done
 *
 * For true background processing, a custom development build is required.
 */

interface GenerationState {
  id: string;
  userTopic: string;
  currentStage: string;
  html: string;
  checklist: string;
  cumulativeTokens: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  startTime: number;
  isRunning: boolean;
}

interface GenerationCallbacks {
  onProgress?: (stage: string, progress: number) => void;
  onComplete?: (html: string, tokens: any) => void;
  onError?: (error: Error) => void;
}

class BackgroundGameGenerationService {
  private static instance: BackgroundGameGenerationService;
  private activeGenerations: Map<string, GenerationCallbacks> = new Map();
  private keepAliveTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.setupNotifications();
  }

  static getInstance(): BackgroundGameGenerationService {
    if (!BackgroundGameGenerationService.instance) {
      BackgroundGameGenerationService.instance = new BackgroundGameGenerationService();
    }
    return BackgroundGameGenerationService.instance;
  }

  private async setupNotifications() {
    // Request permissions for notifications
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Notification permissions not granted');
    }

    // Set up notification handler
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }

  private async persistGenerationState(state: GenerationState): Promise<void> {
    try {
      await AsyncStorage.setItem(`generation_${state.id}`, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to persist generation state:', error);
    }
  }

  private async loadGenerationState(id: string): Promise<GenerationState | null> {
    try {
      const data = await AsyncStorage.getItem(`generation_${id}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to load generation state:', error);
      return null;
    }
  }

  private async clearGenerationState(id: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`generation_${id}`);
    } catch (error) {
      console.error('Failed to clear generation state:', error);
    }
  }

  async startGeneration(
    id: string,
    userTopic: string,
    callbacks?: GenerationCallbacks
  ): Promise<void> {
    // Check if generation is already running
    const existingState = await this.loadGenerationState(id);
    if (existingState?.isRunning) {
      console.log('Resuming existing generation');
      this.activeGenerations.set(id, callbacks || {});
      this.resumeGeneration(existingState);
      return;
    }

    // Start new generation
    const initialState: GenerationState = {
      id,
      userTopic,
      currentStage: 'simple_code',
      html: '',
      checklist: '',
      cumulativeTokens: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
      startTime: Date.now(),
      isRunning: true,
    };

    this.activeGenerations.set(id, callbacks || {});
    await this.persistGenerationState(initialState);
    this.runGenerationPipeline(initialState);
  }

  private async resumeGeneration(state: GenerationState): Promise<void> {
    console.log(`Resuming generation at stage: ${state.currentStage}`);
    // Resume from the current stage
    this.runGenerationPipeline(state);
  }

  private async runGenerationPipeline(state: GenerationState): Promise<void> {
    const callbacks = this.activeGenerations.get(state.id);
    const stages = [
      'simple_code',
      'checklist',
      'mvp_code',
      'linting_generic',
      'mobile_optimize',
      'linting_mobile',
      'final_inspection',
      'fixing_inspection',
      'complete'
    ];

    try {
      // Continue from current stage
      let currentIndex = stages.indexOf(state.currentStage);

      while (currentIndex < stages.length) {
        const stage = stages[currentIndex];
        state.currentStage = stage;

        // Update progress
        const progress = (currentIndex + 1) / stages.length;
        callbacks?.onProgress?.(stage, progress);

        // Send progress notification
        this.sendProgressNotification(stage, Math.round(progress * 100));

        // Execute stage
        await this.executeStage(state, stage);

        // Persist state after each stage
        await this.persistGenerationState(state);

        currentIndex++;

        // Small delay between stages to prevent overwhelming the API
        await this.delay(1000);
      }

      // Generation complete
      state.isRunning = false;
      await this.persistGenerationState(state);
      await this.clearGenerationState(state.id);

      // Send completion notification
      this.sendCompletionNotification(state.userTopic);

      callbacks?.onComplete?.(state.html, state.cumulativeTokens);

    } catch (error) {
      console.error('Generation failed:', error);
      state.isRunning = false;
      await this.persistGenerationState(state);

      this.sendErrorNotification(error as Error);
      callbacks?.onError?.(error as Error);
    } finally {
      this.activeGenerations.delete(state.id);
    }
  }

  private async executeStage(state: GenerationState, stage: string): Promise<void> {
    const appConfigService = AppConfigService.getInstance();
    const config = await appConfigService.getConfig();

    switch (stage) {
      case 'simple_code':
        state.html = await this.callOpenAI(
          `You are SimpleCoderAgent. Write the simplest and shortest working HTML code for the given game idea.
Output ONLY a complete, valid HTML5 document with inline <style> and <script>. No markdown, no prose.
Make it playable and functional with minimal features.`,
          `write the simplest and shortest code for below prompt in html single code\n\n${state.userTopic}`,
          state.cumulativeTokens
        );
        break;

      case 'checklist':
        state.checklist = await this.callOpenAI(
          `You are ChecklistAgent. Analyze the provided HTML code for the given game idea.
Check for missing items that would make it a good working game.
Create a simple checklist of improvements needed.
Output ONLY the checklist in format:
- [ ] Item 1
- [ ] Item 2
etc.
Be concise and focus on essential game features.`,
          `Game idea: ${state.userTopic}\n\nHTML code:\n${state.html}\n\nCheck for missing items and create a simple checklist to achieve a good working game.`,
          state.cumulativeTokens
        );
        break;

      case 'mvp_code':
        state.html = await this.callOpenAI(
          `You are CodingAgent. Implement the checklist items in the provided HTML code.
Output:
- Exactly one full, valid HTML5 document with inline CSS/JS. Return ONLY the HTML. No markdown, no prose.
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
- Rounded corners for containers`,
          `Implement the checklist items in the existing HTML code.
Checklist:
${state.checklist}
Current HTML:
${state.html}`,
          state.cumulativeTokens
        );
        break;

      case 'linting_generic':
        // Implement linting logic here (similar to original)
        const lintErrors = this.lintHtml(state.html);
        if (lintErrors.length > 0) {
          const feedback = this.formatErrorsForPrompt(lintErrors);
          state.html = await this.callOpenAI(
            `You are CodingAgent. Fix the HTML SYNTAX issues listed without adding features. Return the FULL corrected HTML only.`,
            `Fix the HTML SYNTAX issues listed without adding features. Return the FULL corrected HTML only.
Issues:
${feedback}
Current HTML:
${state.html}`,
            state.cumulativeTokens
          );
        }
        break;

      case 'mobile_optimize':
        state.html = await this.callOpenAI(
          `You are MobileOptimizerAgent. Transform the provided HTML5 game into a mobile-first, touch-friendly, single-file document.
Rules:
- Preserve ALL existing core logic. Do not simplify or downgrade graphics.
- Only adjust layout, viewport, and controls to make the game mobile-ready.
- Add <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">.
- Ensure canvas or container uses 100vw/100vh and respects env(safe-area-inset-*).
- Controls: map touch events to existing input system. Keep buttons if present.
- UI: large tap targets (≥44px), high contrast colors, readable text (≥16px), smooth CSS transitions.
- Output must be a complete valid <!DOCTYPE html> file with inline CSS/JS. No markdown fences, no explanations.`,
          `Rewrite the given HTML to be mobile-only optimized and touch-friendly, preserving MVP functionality.
Output the full HTML only.
HTML:
${state.html}`,
          state.cumulativeTokens
        );
        break;

      case 'linting_mobile':
        const mobileLintErrors = this.lintHtml(state.html);
        if (mobileLintErrors.length > 0) {
          const mobileFeedback = this.formatErrorsForPrompt(mobileLintErrors);
          state.html = await this.callOpenAI(
            `You are MobileOptimizerAgent. Fix the HTML SYNTAX issues while keeping mobile optimization intact.
Return the FULL corrected HTML only.`,
            `Fix the HTML SYNTAX issues while keeping mobile optimization intact.
Return the FULL corrected HTML only.
Issues:
${mobileFeedback}
Current HTML:
${state.html}`,
            state.cumulativeTokens
          );
        }
        break;

      case 'final_inspection':
        const inspection = await this.callOpenAI(
          `You are FinalInspectorAgent. Thoroughly analyze the mobile HTML game for functionality and connectivity issues.
CRITICAL CHECKS TO PERFORM:
- Button connections: restart button functionality, start/pause buttons, menu buttons
- Movement controls: joystick/wasd/arrow key connections, touch controls, gesture handling
- Game loops: main game loop execution, animation loops, physics updates
- Event handlers: click/touch event listeners properly attached and functional
- Game state management: score tracking, level progression, win/lose conditions
Output: 5-line summary maximum. State issues ONLY if found. End with DONE.`,
          `Analyze this final mobile HTML game code for functionality issues:
${state.html}
Check all button connections, movement logic, game loops, and controls. Report any broken functionality in 5 lines maximum.`,
          state.cumulativeTokens
        );

        if (inspection.includes("DONE") && inspection.split('\n').length > 1) {
          // Need to fix issues
          state.html = await this.callOpenAI(
            `You are MobileOptimizerAgent. Fix the FUNCTIONALITY issues identified in the final inspection while maintaining mobile optimization.`,
            `Fix the FUNCTIONALITY issues identified in the final inspection while maintaining mobile optimization.
Address all button connections, movement logic, game loops, and control issues mentioned.
Return the FULL corrected HTML only.
Inspection Issues:
${inspection}
Current HTML:
${state.html}`,
            state.cumulativeTokens
          );
        }
        break;

      case 'complete':
        // Generation finished
        break;
    }
  }

  private async callOpenAI(systemMsg: string, userMsg: string, tokenTracker: any): Promise<string> {
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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model_name || "gpt-4o-mini",
        messages: [
          {
            role: "developer",
            content: [{ type: "text", text: systemMsg }]
          },
          {
            role: "user",
            content: [{ type: "text", text: userMsg }]
          },
        ],
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
      tokenTracker.prompt_tokens += data.usage.prompt_tokens || 0;
      tokenTracker.completion_tokens += data.usage.completion_tokens || 0;
      tokenTracker.total_tokens += data.usage.total_tokens || 0;
    }

    return data.choices?.[0]?.message?.content || "";
  }

  // Simplified linting functions (extracted from original)
  private lintHtml(html: string): any[] {
    const errors: any[] = [];

    // Basic checks
    if (!/^\s*<!doctype\s+html\s*>/i.test(html)) {
      errors.push({ message: 'Missing <!DOCTYPE html> at top', line: 1 });
    }

    return errors;
  }

  private formatErrorsForPrompt(errors: any[], maxItems = 8): string {
    return errors.slice(0, maxItems)
      .map((e, i) => `${i + 1}. Line ${e.line}: ${e.message}`)
      .join('\n');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async sendProgressNotification(stage: string, progress: number) {
    const stageMessages = {
      'simple_code': 'Generating simplest HTML...',
      'checklist': 'Creating improvement checklist...',
      'mvp_code': 'Implementing checklist improvements...',
      'linting_generic': 'Checking HTML syntax...',
      'mobile_optimize': 'Optimizing for mobile devices...',
      'linting_mobile': 'Checking mobile HTML syntax...',
      'final_inspection': 'Performing final quality check...',
      'fixing_inspection': 'Fixing final issues...',
    };

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'AI Game Studio',
          body: `${stageMessages[stage as keyof typeof stageMessages] || stage} (${progress}%)`,
          sound: false,
          priority: Notifications.AndroidNotificationPriority.LOW,
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      console.warn('Failed to send progress notification:', error);
    }
  }

  private async sendCompletionNotification(gameTopic: string) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Game Generation Complete! 🎮',
          body: `Your game "${gameTopic.substring(0, 30)}${gameTopic.length > 30 ? '...' : ''}" is ready`,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      console.warn('Failed to send completion notification:', error);
    }
  }

  private async sendErrorNotification(error: Error) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Game Generation Failed',
          body: 'Something went wrong. Please try again.',
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      console.warn('Failed to send error notification:', error);
    }
  }

  async stopGeneration(id: string): Promise<void> {
    const state = await this.loadGenerationState(id);
    if (state) {
      state.isRunning = false;
      await this.persistGenerationState(state);
    }
    this.activeGenerations.delete(id);
  }

  async getActiveGenerations(): Promise<string[]> {
    const keys = await AsyncStorage.getAllKeys();
    const generationKeys = keys.filter(key => key.startsWith('generation_'));
    const activeIds: string[] = [];

    for (const key of generationKeys) {
      const state = await this.loadGenerationState(key.replace('generation_', ''));
      if (state?.isRunning) {
        activeIds.push(state.id);
      }
    }

    return activeIds;
  }

  destroy() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }
}

export default BackgroundGameGenerationService;

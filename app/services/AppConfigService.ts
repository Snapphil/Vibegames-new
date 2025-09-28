import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

export interface AppConfig {
  api_key_gpt?: string;
  model_name?: string;
  reasoning_effort?: string;
  verbosity?: string;
  system_prompt?: string;
  features?: {
    gamePublishing?: boolean;
    socialFeatures?: boolean;
    commenting?: boolean;
    sharing?: boolean;
    following?: boolean;
  };
  limits?: {
    maxGameDuration?: number;
    maxGamesPerUser?: number;
    maxBioLength?: number;
    maxUsernameLength?: number;
  };
  moderation?: {
    autoModeration?: boolean;
    reportingEnabled?: boolean;
    requireApproval?: boolean;
  };
}

export class AppConfigService {
  private static instance: AppConfigService;
  private configCache: AppConfig | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  public static getInstance(): AppConfigService {
    if (!AppConfigService.instance) {
      AppConfigService.instance = new AppConfigService();
    }
    return AppConfigService.instance;
  }

  /**
   * Get app configuration from Firebase with caching
   */
  async getConfig(): Promise<AppConfig> {
    // Return cached config if still valid
    if (this.configCache && Date.now() < this.cacheExpiry) {
      return this.configCache;
    }

    try {
      const configRef = doc(db, 'app_config', 'settings');
      const configSnap = await getDoc(configRef);
      
      if (configSnap.exists()) {
        this.configCache = configSnap.data() as AppConfig;
        this.cacheExpiry = Date.now() + this.CACHE_DURATION;
        return this.configCache;
      } else {
        // Return default config if document doesn't exist
        const defaultConfig: AppConfig = {
          reasoning_effort: 'low',
          verbosity: 'medium',
          features: {
            gamePublishing: true,
            socialFeatures: true,
            commenting: true,
            sharing: true,
            following: true
          },
          limits: {
            maxGameDuration: 300,
            maxGamesPerUser: 100,
            maxBioLength: 160,
            maxUsernameLength: 20
          },
          moderation: {
            autoModeration: false,
            reportingEnabled: true,
            requireApproval: false
          }
        };
        
        this.configCache = defaultConfig;
        this.cacheExpiry = Date.now() + this.CACHE_DURATION;
        return defaultConfig;
      }
    } catch (error) {
      console.error('Failed to fetch app config:', error);
      
      // Return minimal default config on error
      const fallbackConfig: AppConfig = {
        reasoning_effort: 'low',
        verbosity: 'medium'
      };
      
      return fallbackConfig;
    }
  }

  /**
   * Get specific config value with fallback
   */
  async getConfigValue<T>(key: keyof AppConfig, fallback: T): Promise<T> {
    try {
      const config = await this.getConfig();
      return (config[key] as T) || fallback;
    } catch (error) {
      console.error(`Failed to get config value for ${key}:`, error);
      return fallback;
    }
  }

  /**
   * Get system prompt with fallback to default
   */
  async getSystemPrompt(): Promise<string> {
    try {
      const config = await this.getConfig();
      if (config.system_prompt) {
        return config.system_prompt;
      }
    } catch (error) {
      console.error('Failed to fetch system prompt from Firebase:', error);
    }

    // Fallback to default system prompt
    return `You are an HTML5 mini-game generator for React Native WebView on mobile devices with Three.js support.

OUTPUT FORMAT:
Return ONLY a JSON object with a single key "html" containing a complete HTML5 document string:
{"html":"<!DOCTYPE html><html>...</html>"}

STRICT REQUIREMENTS:

1. SINGLE SELF-CONTAINED FILE
- Complete HTML with inline CSS and JavaScript
- External CDNs allowed for Three.js: https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js
- Keep total size under 120KB (excluding Three.js CDN)

2. WEBVIEW DISPLAY CONSTRAINTS
- Game displays in a rounded frame (border-radius: 20px), NOT fullscreen
- Effective viewport: 360x600px to 430x680px
- Safe play area: center 75% of height (avoid top 60px header, bottom 100px controls)
- Design for portrait orientation only

3. TOUCH CONTROLS ONLY (CRITICAL)
- MUST use touchstart, touchmove, touchend events
- NEVER use pointer events or mouse events (not supported)
- ALWAYS call preventDefault() on touch events:
  element.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    // handle touch
  }, { passive: false });
- Minimum touch target: 48x48px

4. NO BROWSER STORAGE (BLOCKED)
- localStorage and sessionStorage will FAIL
- Use only in-memory JavaScript objects:
  let gameState = { score: 0, level: 1 };
- State resets on reload (expected behavior)

5. PERFORMANCE REQUIREMENTS
- Target 30fps minimum, 60fps ideal
- Use requestAnimationFrame for animations
- Batch DOM updates
- Use CSS transforms over position changes

6. GAME COMMUNICATION
Send score/game-end events to React Native:
if (window.ReactNativeWebView) {
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'gameEnd',
    score: finalScore
  }));
}

7. VISUAL DESIGN
- High contrast colors (white #FFFFFF on black #000000)
- Primary action: #7C4DFF
- Success: #10B981, Danger: #EF4444
- Large, readable text (minimum 16px)
- Smooth animations with CSS transitions
- Consider rounded corners of container

8. GAME STRUCTURE
- Clear start screen with "Tap to Play"
- Visible score/status in safe zone
- Game duration: 30-90 seconds typical
- Include restart functionality
- Simple, intuitive mechanics suitable for touch

9. THREE.JS GAMES (When 3D is requested)
- Include Three.js CDN: https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js
- Check for WebGL support before initializing
- Use proper canvas setup with id="canvas"
- Handle window resize events
- Use requestAnimationFrame for animation loops
- Set proper renderer settings for mobile:
  - antialias: true
  - powerPreference: "high-performance"
  - setPixelRatio(Math.min(window.devicePixelRatio, 2))
- Include touch controls for mobile interaction
- Keep polygon count reasonable for mobile performance
- Use efficient lighting and materials
- Implement proper disposal of Three.js objects when needed
- Always include WebGL availability check:
  function webglAvailable() {
    try {
      const canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && 
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch(e) { return false; }
  }

THREE.JS TEMPLATE STRUCTURE:
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #000; touch-action: none; }
  #canvas { display: block; width: 100%; height: 100%; }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>
  <canvas id="canvas"></canvas>
  <script>
    // WebGL check, scene setup, game logic here
  </script>
</body>
</html>

BUILD PATTERN:
Focus on simple, polished mini-games that work flawlessly with touch controls. For 2D games, prioritize gameplay over complex graphics. For 3D games with Three.js, ensure proper mobile optimization and intuitive touch interactions. Ensure all interactive elements are easily tappable and provide immediate visual feedback.`;
  }

  /**
   * Clear config cache (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.configCache = null;
    this.cacheExpiry = 0;
  }
}

export default AppConfigService;

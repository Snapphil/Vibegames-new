// Global type declarations for VibeGames

// Global constants
declare const __DEV__: boolean;

// Expo Blur
declare module 'expo-blur' {
  export interface BlurViewProps {
    intensity?: number;
    tint?: 'light' | 'dark' | 'default';
    style?: any;
    children?: React.ReactNode;
  }
  export class BlurView extends React.Component<BlurViewProps> {}
}

// Expo Linear Gradient
declare module 'expo-linear-gradient' {
  export interface LinearGradientProps {
    colors: string[];
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    style?: any;
    children?: React.ReactNode;
  }
  export class LinearGradient extends React.Component<LinearGradientProps> {}
}

// AsyncStorage types
declare module '@react-native-async-storage/async-storage' {
  const AsyncStorage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
    clear(): Promise<void>;
  };
  export default AsyncStorage;
}

// Firebase Firestore types - augment existing module
declare module 'firebase/firestore' {
  export interface DocumentReference<T = any> {
    id: string;
    path: string;
  }
  
  export interface DocumentSnapshot<T = any> {
    exists(): boolean;
    data(): T | undefined;
    id: string;
  }
  
  export interface Firestore {
    app: any;
  }
  
  export function doc(firestore: Firestore, path: string, ...pathSegments: string[]): DocumentReference;
  export function getDoc<T = any>(reference: DocumentReference<T>): Promise<DocumentSnapshot<T>>;
  export function setDoc<T = any>(reference: DocumentReference<T>, data: any, options?: { merge?: boolean }): Promise<void>;
  export function getFirestore(app?: any): Firestore;
}

// React Native additional types
declare module 'react-native' {
  export interface LayoutRectangle {
    x: number;
    y: number;
    width: number;
    height: number;
  }
  
  export interface LayoutChangeEvent {
    nativeEvent: {
      layout: LayoutRectangle;
    };
  }
  
  // Core components
  export const View: any;
  export const Text: any;
  export const Pressable: any;
  export const StyleSheet: any;
  export const Modal: any;
  export const Animated: any;
  export const Dimensions: any;
  export const Platform: any;
  export const ActivityIndicator: any;
  export const ScrollView: any;
  export const FlatList: any;
  export const TextInput: any;
  export const TouchableWithoutFeedback: any;
  export const Alert: any;
  
  // Hooks
  export function useWindowDimensions(): {
    width: number;
    height: number;
    scale: number;
    fontScale: number;
  };
}

// React Native Safe Area Context
declare module 'react-native-safe-area-context' {
  export interface NativeSafeAreaViewProps {
    style?: any;
    edges?: Array<'top' | 'bottom' | 'left' | 'right'>;
    children?: React.ReactNode;
  }
  export const SafeAreaView: any;
  export function useSafeAreaInsets(): {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

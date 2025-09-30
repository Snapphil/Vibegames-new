const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Fix for Firebase v11+ and Zustand import.meta issue
config.resolver = {
  ...config.resolver,
  sourceExts: [...(config.resolver?.sourceExts || []), 'cjs'],
  unstable_enablePackageExports: true,
};

// Add transformer to handle import.meta for Zustand
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

// Apply NativeWind wrapper (if CSS classes are used in the app)
// For now, export base config - add withNativeWind if using className prop
module.exports = config;


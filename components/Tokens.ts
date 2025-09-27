// Design tokens for the mobile-trim redesign

export const Colors = {
    // Core colors
    bg: "#0B0A0F",
    surface: "#121219",
    primary: "#7C4DFF",
    success: "#00D28E",
    danger: "#EF4444",
    warning: "#F59E0B",
    
    // Text colors
    textHi: "#FFFFFF",
    textDim: "#B7B9C0",
    
    // UI colors
    stroke: "#2A2B33",
    overlay: "rgba(0,0,0,0.5)",
    
    // Game colors
    blue: "#3B82F6",
    green: "#10B981",
    yellow: "#F59E0B",
    purple: "#8B5CF6",
    pink: "#EC4899",
  } as const;
  
  export const Spacing = {
    // Safe margins
    safe: 16,
    
    // Internal gaps
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  } as const;
  
  export const Typography = {
    // Font families
    fontFamily: "Inter, SF Pro Display, system-ui",
    
    // Title
    title: {
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "600" as const,
    },
    
    // Body
    body: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "400" as const,
    },
    
    // Meta
    meta: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "400" as const,
    },
    
    // Large title
    largeTitle: {
      fontSize: 20,
      lineHeight: 28,
      fontWeight: "700" as const,
    },
  } as const;
  
  export const Layout = {
    // Border radius
    radiusSmall: 8,
    radiusMedium: 10,
    radius: 14,
    radiusLarge: 20,
    radiusFull: 999,
    
    // Component sizes
    iconSize: 24,
    tapTarget: 48,
    progressBarHeight: 2,
    
    // Elevations (shadows)
    shadow: {
      small: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
      },
      medium: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 4,
      },
      large: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8,
      },
    },
  } as const;
  
  export const Animation = {
    // Durations
    fast: 150,
    medium: 250,
    slow: 350,
    
    // Spring config
    spring: {
      tension: 80,
      friction: 12,
    },
  } as const;
  
  // Helper function to create consistent button styles
  export const createButtonStyle = (variant: "primary" | "secondary" | "ghost") => {
    const base = {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      borderRadius: Layout.radius,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: Spacing.sm,
      minHeight: Layout.tapTarget,
    };
  
    switch (variant) {
      case "primary":
        return {
          ...base,
          backgroundColor: Colors.primary,
        };
      case "secondary":
        return {
          ...base,
          backgroundColor: Colors.surface,
          borderWidth: 1,
          borderColor: Colors.stroke,
        };
      case "ghost":
        return {
          ...base,
          backgroundColor: "transparent",
          paddingHorizontal: Spacing.sm,
        };
    }
  };
  
  // Helper function for consistent text styles
  export const createTextStyle = (type: "title" | "body" | "meta" | "largeTitle") => {
    return {
      color: Colors.textHi,
      ...Typography[type],
    };
  };



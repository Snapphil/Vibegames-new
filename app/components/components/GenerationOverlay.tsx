import { useEffect, useRef } from "react";
import { StyleSheet, ScrollView } from "react-native";
import { useGeneration } from "./GenerationState";



export default function GenerationOverlay() {
  const { state } = useGeneration();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!state.visible) return;
    // Auto-scroll to bottom whenever new lines appear while visible
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [state.lines.length, state.visible]);

  // Generation window should only appear within the create tab, not as a global overlay
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 20,
    left: 12,
    right: 12,
  },
  card: {
    backgroundColor: "rgba(18,18,25,0.92)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  countdown: {
    color: "#FFFFFF",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  track: {
    height: 8,
    backgroundColor: "#1F2937",
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: 8,
  },
  fill: {
    height: "100%",
    backgroundColor: "#7C4DFF",
  },
  log: {
    maxHeight: 120,
  },
  line: {
    color: "#10B981",
    fontSize: 12,
    lineHeight: 16,
  },
});



import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";

type GenerationStatus = "idle" | "running" | "done";

export type GenerationState = {
  status: GenerationStatus;
  visible: boolean;
  startedAt: number | null;
  durationMs: number; // default 2 minutes
  progress01: number; // 0..1
  countdownText: string; // mm:ss
  lines: string[];
  inlineActive: boolean;
};

type Action =
  | { type: "START"; durationMs?: number }
  | { type: "STOP" }
  | { type: "TICK"; now: number }
  | { type: "APPEND"; text: string }
  | { type: "SHOW" }
  | { type: "HIDE" }
  | { type: "SET_INLINE_ACTIVE"; value: boolean };

const TWO_MINUTES = 2 * 60 * 1000;

const initialState: GenerationState = {
  status: "idle",
  visible: false,
  startedAt: null,
  durationMs: TWO_MINUTES,
  progress01: 0,
  countdownText: "02:00",
  lines: [],
  inlineActive: false,
};

function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${mm}:${ss}`;
}

function reduce(state: GenerationState, action: Action): GenerationState {
  switch (action.type) {
    case "START": {
      const duration = action.durationMs ?? state.durationMs ?? TWO_MINUTES;
      return {
        ...state,
        status: "running",
        visible: true,
        startedAt: Date.now(),
        durationMs: duration,
        progress01: 0,
        countdownText: formatCountdown(duration),
        lines: [],
      };
    }
    case "STOP": {
      return {
        ...state,
        status: "done",
        visible: true,
      };
    }
    case "TICK": {
      if (!state.startedAt) return state;
      const elapsed = action.now - state.startedAt;
      const progress = Math.min(1, Math.max(0, elapsed / state.durationMs));
      const remaining = Math.max(0, state.durationMs - elapsed);
      return {
        ...state,
        progress01: progress,
        countdownText: formatCountdown(remaining),
      };
    }
    case "APPEND": {
      return {
        ...state,
        // Keep as a continuous stream rather than per-line to avoid broken wrapping
        lines: state.lines.length === 0 ? [action.text] : [...state.lines, action.text],
        visible: true,
      };
    }
    case "SHOW": {
      return { ...state, visible: true };
    }
    case "HIDE": {
      return { ...state, visible: false };
    }
    case "SET_INLINE_ACTIVE": {
      return { ...state, inlineActive: action.value };
    }
    default:
      return state;
  }
}

type Ctx = {
  state: GenerationState;
  dispatch: React.Dispatch<Action>;
};

const GenerationContext = createContext<Ctx | null>(null);

export function GenerationProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reduce, initialState);

  useEffect(() => {
    let raf: number | null = null;
    let timer: NodeJS.Timeout | null = null;
    if (state.status === "running") {
      const tick = () => dispatch({ type: "TICK", now: Date.now() });
      tick();
      timer = setInterval(tick, 250);
    }
    return () => {
      if (raf != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
      if (timer) clearInterval(timer);
    };
  }, [state.status]);

  useEffect(() => {
    // Wire global controller to this provider's dispatch
    GenerationActions._attach(dispatch);
    return () => GenerationActions._detach(dispatch);
  }, [dispatch]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <GenerationContext.Provider value={value}>{children}</GenerationContext.Provider>;
}

export function useGeneration() {
  const ctx = useContext(GenerationContext);
  if (!ctx) throw new Error("useGeneration must be used within GenerationProvider");
  return ctx;
}

// Global action controller to allow triggering from anywhere (including non-React modules)
type Listener = (action: Action) => void;
const listeners = new Set<Listener>();

export const GenerationActions = {
  _attach(fn: Listener) { listeners.add(fn); },
  _detach(fn: Listener) { listeners.delete(fn); },
  start(durationMs?: number) { listeners.forEach(l => l({ type: "START", durationMs })); },
  stop() { listeners.forEach(l => l({ type: "STOP" })); },
  append(text: string) { listeners.forEach(l => l({ type: "APPEND", text })); },
  show() { listeners.forEach(l => l({ type: "SHOW" })); },
  hide() { listeners.forEach(l => l({ type: "HIDE" })); },
  setInlineActive(value: boolean) { listeners.forEach(l => l({ type: "SET_INLINE_ACTIVE", value })); },
};

// Add default export for Expo Router
export default GenerationProvider;



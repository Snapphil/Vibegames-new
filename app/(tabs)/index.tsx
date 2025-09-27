// app/(tabs)/index.tsx
import React, { useState } from "react";
import { SafeAreaView, View, Text, Pressable, StyleSheet } from "react-native";

type Operator = "÷" | "×" | "−" | "+" | null;

export default function Calculator() {
  const [display, setDisplay] = useState("0");
  const [firstOperand, setFirstOperand] = useState<number | null>(null);
  const [op, setOp] = useState<Operator>(null);
  const [resetOnNextDigit, setResetOnNextDigit] = useState(false);

  const inputDigit = (d: string) => {
    setDisplay((prev) => {
      if (resetOnNextDigit) {
        setResetOnNextDigit(false);
        return d === "0" ? "0" : d;
      }
      if (prev === "0") return d;
      return prev + d;
    });
  };

  const inputDot = () => {
    setDisplay((prev) => {
      if (resetOnNextDigit) {
        setResetOnNextDigit(false);
        return "0.";
      }
      return prev.includes(".") ? prev : prev + ".";
    });
  };

  const clearAll = () => {
    setDisplay("0");
    setFirstOperand(null);
    setOp(null);
    setResetOnNextDigit(false);
  };

  const toggleSign = () => {
    setDisplay((prev) => (prev.startsWith("-") ? prev.slice(1) : prev === "0" ? "0" : `-${prev}`));
  };

  const percent = () => {
    const v = parseFloat(display) / 100;
    setDisplay(formatNumber(v));
    setFirstOperand(null);
    setOp(null);
    setResetOnNextDigit(true);
  };

  const setOperator = (next: Operator) => {
    const current = parseFloat(display);
    if (firstOperand === null) {
      setFirstOperand(current);
    } else if (!resetOnNextDigit && op) {
      const result = compute(firstOperand, current, op);
      setFirstOperand(result);
      setDisplay(formatNumber(result));
    }
    setOp(next);
    setResetOnNextDigit(true);
  };

  const evaluate = () => {
    if (op === null || firstOperand === null) return;
    const current = parseFloat(display);
    const result = compute(firstOperand, current, op);
    setDisplay(formatNumber(result));
    setFirstOperand(null);
    setOp(null);
    setResetOnNextDigit(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.display}>
        <Text numberOfLines={1} style={styles.displayText}>
          {display}
        </Text>
      </View>

      <View style={styles.pad}>
        {[
          [
            { label: "C", variant: "func", onPress: clearAll },
            { label: "±", variant: "func", onPress: toggleSign },
            { label: "%", variant: "func", onPress: percent },
            { label: "÷", variant: "op", onPress: () => setOperator("÷") },
          ],
          [
            { label: "7", variant: "digit", onPress: () => inputDigit("7") },
            { label: "8", variant: "digit", onPress: () => inputDigit("8") },
            { label: "9", variant: "digit", onPress: () => inputDigit("9") },
            { label: "×", variant: "op", onPress: () => setOperator("×") },
          ],
          [
            { label: "4", variant: "digit", onPress: () => inputDigit("4") },
            { label: "5", variant: "digit", onPress: () => inputDigit("5") },
            { label: "6", variant: "digit", onPress: () => inputDigit("6") },
            { label: "−", variant: "op", onPress: () => setOperator("−") },
          ],
          [
            { label: "1", variant: "digit", onPress: () => inputDigit("1") },
            { label: "2", variant: "digit", onPress: () => inputDigit("2") },
            { label: "3", variant: "digit", onPress: () => inputDigit("3") },
            { label: "+", variant: "op", onPress: () => setOperator("+") },
          ],
          [
            { label: "0", variant: "digit", onPress: () => inputDigit("0"), spanTwo: true },
            { label: ".", variant: "digit", onPress: inputDot },
            { label: "=", variant: "op", onPress: evaluate },
          ],
        ].map((row, i) => (
          <View key={i} style={styles.row}>
            {row.map((btn) => (
              <CalcButton key={btn.label} {...btn} />
            ))}
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

function compute(a: number, b: number, operator: Operator): number {
  switch (operator) {
    case "÷":
      return b === 0 ? NaN : a / b;
    case "×":
      return a * b;
    case "−":
      return a - b;
    case "+":
      return a + b;
    default:
      return b;
  }
}

function formatNumber(n: number): string {
  if (!isFinite(n)) return "Error";
  // keep it tidy for mobile/web
  const abs = Math.abs(n);
  if (abs >= 1e12 || (abs !== 0 && abs < 1e-9)) return n.toExponential(6);
  const s = Number(Math.round((n + Number.EPSILON) * 1e9) / 1e9).toString();
  return s;
}

type BtnProps = {
  label: string;
  onPress: () => void;
  variant: "digit" | "func" | "op";
  spanTwo?: boolean;
};

function CalcButton({ label, onPress, variant, spanTwo }: BtnProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        spanTwo && styles.spanTwo,
        variant === "digit" && styles.btnDigit,
        variant === "func" && styles.btnFunc,
        variant === "op" && styles.btnOp,
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === "func" && styles.buttonTextLight,
          variant === "op" && styles.buttonTextDark,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0F14",
  },
  display: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
    alignItems: "flex-end",
  },
  displayText: {
    color: "#FFFFFF",
    fontSize: 56,
    fontWeight: "700",
  },
  pad: {
    paddingHorizontal: 12,
    paddingBottom: 18,
  },
  row: {
    flexDirection: "row",
    marginVertical: 6,
  },
  button: {
    flex: 1,
    height: 64,
    borderRadius: 18,
    marginHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  spanTwo: {
    flex: 2,
  },
  btnDigit: {
    backgroundColor: "#1C2430",
  },
  btnFunc: {
    backgroundColor: "#2B3643",
  },
  btnOp: {
    backgroundColor: "#F59E0B",
  },
  buttonText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#E6EDF5",
  },
  buttonTextLight: {
    color: "#E6EDF5",
  },
  buttonTextDark: {
    color: "#0B0F14",
  },
});

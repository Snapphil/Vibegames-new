import React, { useRef, useEffect } from "react";
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
} from "react-native";

const { height: SCREEN_H } = Dimensions.get("window");

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  height?: number;
  snapPoints?: number[];
}

export default function BottomSheet({
  visible,
  onClose,
  children,
  height = SCREEN_H * 0.5,
  snapPoints = [0.5, 1],
}: BottomSheetProps) {
  const translateY = useRef(new Animated.Value(height)).current;
  const currentHeight = useRef(height);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const newValue = currentHeight.current + gestureState.dy;
        if (newValue >= 0) {
          translateY.setValue(newValue);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          // Swipe down to close
          close();
        } else {
          // Snap to nearest point
          const targetHeight = gestureState.dy < -50 ? SCREEN_H : height;
          currentHeight.current = targetHeight === SCREEN_H ? 0 : height;
          Animated.spring(translateY, {
            toValue: currentHeight.current,
            useNativeDriver: true,
            tension: 80,
            friction: 12,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      currentHeight.current = 0;
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
    }
  }, [visible]);

  const close = () => {
    Animated.timing(translateY, {
      toValue: height,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onClose();
      translateY.setValue(height);
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={close}>
        <Animated.View
          style={[
            styles.sheet,
            {
              height,
              transform: [{ translateY }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            {children}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#121219",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 8,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "#2A2B33",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
});

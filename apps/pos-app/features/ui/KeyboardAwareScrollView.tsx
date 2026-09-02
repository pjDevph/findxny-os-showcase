import { ScrollView, KeyboardAvoidingView, Platform, ViewStyle, StyleProp, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle> | { gap?: number; padding?: number; paddingBottom?: number };
  keyboardDismissMode?: "none" | "on-drag" | "interactive";
  showsVerticalScrollIndicator?: boolean;
}

export interface KeyboardAwareScrollViewHandle {
  /** Scroll so the given field (its own ref, or a ref to a wrapping View) is visible above the keyboard. */
  scrollToFocusedInput: (fieldRef: React.RefObject<any>) => void;
}

export const KeyboardAwareScrollView = forwardRef<KeyboardAwareScrollViewHandle, Props>(function KeyboardAwareScrollView({
  children,
  style,
  contentContainerStyle,
  keyboardDismissMode,
  showsVerticalScrollIndicator,
}, ref) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  // Tracked from the actual IME show/hide event rather than relying on
  // Android's windowSoftInputMode="resize" to shrink the window — some
  // custom/embedded Android builds (e.g. POS terminal ROMs) don't resize
  // reliably, which left fields stranded under the keyboard.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const onFieldMeasured = (_x: number, y: number) => {
    scrollRef.current?.scrollTo({ y: Math.max(y - 24, 0), animated: true });
  };

  const measureField = (fieldRef: React.RefObject<any>) => {
    if (fieldRef.current == null || scrollRef.current == null) return;
    // Fabric's ref.measureLayout expects the "relative to" arg to be an
    // actual component ref, not a legacy findNodeHandle() number.
    fieldRef.current.measureLayout(scrollRef.current, onFieldMeasured, () => {});
  };

  useImperativeHandle(ref, () => ({
    scrollToFocusedInput: (fieldRef) => {
      // Let the keyboard's open animation finish before measuring —
      // measuring mid-animation scrolls to the wrong position.
      requestAnimationFrame(() => measureField(fieldRef));
    },
  }), []);

  return (
    // On Android windowSoftInputMode="resize" already shrinks the window when
    // the keyboard appears; also applying KeyboardAvoidingView's "height"
    // behavior double-adjusts and flickers. Only iOS needs the padding.
    <KeyboardAvoidingView
      style={style}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={keyboardDismissMode}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        contentContainerStyle={[
          { flexGrow: 1, paddingBottom: insets.bottom + 16 + keyboardHeight },
          contentContainerStyle,
        ]}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
});

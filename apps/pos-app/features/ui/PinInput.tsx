/**
 * PinInput — OTP-style segmented PIN entry (one box per digit).
 *
 * Renders as N bordered boxes with a single invisible TextInput overlaid on
 * top capturing all keystrokes — simpler and more reliable across iOS/Android
 * than juggling focus across N real inputs (auto-advance/backspace-to-previous
 * edge cases), while still getting the native numeric keypad and paste support.
 */
import { useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

const MONO = "monospace";

export function PinInput({
  value,
  onChange,
  length = 6,
  secure = false,
  autoFocus = false,
  disabled = false,
  onSubmitEditing,
  onFocus,
}: Readonly<{
  value: string;
  onChange: (v: string) => void;
  length?: number;
  secure?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  onSubmitEditing?: () => void;
  onFocus?: () => void;
}>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  return (
    <Pressable style={s.row} onPress={() => inputRef.current?.focus()}>
      {Array.from({ length }).map((_, i) => {
        const filled = i < value.length;
        const isCursor = focused && !disabled && i === value.length;
        return (
          <View
            key={i}
            style={[s.box, isCursor && s.boxActive, disabled && s.boxDisabled]}
          >
            <Text style={s.digit}>{filled ? (secure ? "•" : value[i]) : ""}</Text>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus={autoFocus}
        editable={!disabled}
        onFocus={() => { setFocused(true); onFocus?.(); }}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmitEditing}
        style={s.hiddenInput}
        caretHidden
      />
    </Pressable>
  );
}

type C = ReturnType<typeof useTheme>["C"];

const makeStyles = (C: C) => StyleSheet.create({
  row: { flexDirection: "row", gap: 10, position: "relative" },
  box: {
    width: 44, height: 52, borderRadius: R.md,
    borderWidth: 1.5, borderColor: C.line,
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.bg,
  },
  boxActive:   { borderColor: C.amber },
  boxDisabled: { opacity: 0.5 },
  digit:       { fontSize: 20, fontWeight: "700", color: C.ink, fontFamily: MONO },
  hiddenInput: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0,
  },
});

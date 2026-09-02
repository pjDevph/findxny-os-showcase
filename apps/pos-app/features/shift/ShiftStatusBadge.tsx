import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";
import { MONO } from "../theme/mono";
import type { CurrentStatus } from "./types";

interface Props {
  readonly currentStatus: CurrentStatus;
  readonly breakElapsed: string;
}

export function ShiftStatusBadge({ currentStatus, breakElapsed }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  const bgColor = currentStatus === "clocked_in" ? C.goodBg : currentStatus === "on_break" ? C.amberBg : C.badBg;
  const dotColor = currentStatus === "clocked_in" ? C.good : currentStatus === "on_break" ? C.amber : C.bad;
  const textColor = currentStatus === "clocked_in" ? C.good : currentStatus === "on_break" ? C.amber : C.bad;
  const label = currentStatus === "clocked_in" ? "CLOCKED IN" : currentStatus === "on_break" ? "ON BREAK" : "CLOCKED OUT";

  return (
    <View style={[s.badge, { backgroundColor: bgColor }]}>
      <View style={[s.dot, { backgroundColor: dotColor }]} />
      <Text style={[s.text, { color: textColor }]}>{label}</Text>
      {currentStatus === "on_break" && !!breakElapsed && (
        <Text style={[s.text, { color: textColor, fontFamily: MONO, marginLeft: "auto", textTransform: "none" }]}>{breakElapsed}</Text>
      )}
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: R.md },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 13, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
});

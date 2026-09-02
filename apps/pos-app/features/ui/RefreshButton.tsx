/**
 * Shared manual-refresh affordance — drop into any screen's header (usually
 * PosScreenHeader's `right` slot) wherever data is fetched once on mount and
 * staff need a way to pull the latest without navigating away and back.
 * Consolidates what dashboard.tsx and reports.tsx each used to hand-roll.
 */
import { Pressable, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";

export function RefreshButton({
  onPress,
  refreshing = false,
  label = "Refresh",
  compact = false,
}: {
  onPress: () => void;
  refreshing?: boolean;
  /** Text shown next to the icon. Set compact to hide it entirely (icon-only, for narrow layouts). */
  label?: string;
  compact?: boolean;
}) {
  const { C } = useTheme();
  const s = makeStyles(C);
  return (
    <Pressable style={s.btn} onPress={onPress} disabled={refreshing} hitSlop={6}>
      {refreshing
        ? <ActivityIndicator size="small" color={C.ink3} />
        : <Feather name="refresh-cw" size={13} color={C.ink3} />}
      {!compact && <Text style={s.txt}>{refreshing ? "Refreshing…" : label}</Text>}
    </Pressable>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  btn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: R.md,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
  },
  txt: { color: C.ink3, fontSize: 12, fontWeight: "600" },
});

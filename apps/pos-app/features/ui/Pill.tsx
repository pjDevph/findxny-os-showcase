/**
 * Pill — generic colored status/role/source badge.
 *
 * Replaces the "tinted background + tinted border + colored text, rounded-full"
 * badge that every POS screen (staff roles, product status, transaction
 * status/source/payment, shift status, booking status) was independently
 * re-declaring with the same three style rules and a different color.
 */
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  readonly label: string;
  /** Hex color driving text/border/tinted-bg — e.g. C.good, C.bad, C.warn, C.info, or a role/status-specific hex. */
  readonly color: string;
  readonly icon?: keyof typeof Feather.glyphMap;
  readonly size?: "sm" | "md";
}

export function Pill({ label, color, icon, size = "md" }: Props) {
  const { C } = useTheme();
  const s = styles(C, color, size);
  return (
    <View style={s.pill}>
      {icon && <Feather name={icon} size={size === "sm" ? 10 : 12} color={color} />}
      <Text style={s.label} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"], color: string, size: "sm" | "md") => StyleSheet.create({
  pill: {
    flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start",
    borderRadius: R.full, borderWidth: 1, borderColor: `${color}44`, backgroundColor: `${color}18`,
    paddingHorizontal: size === "sm" ? 7 : 9, paddingVertical: size === "sm" ? 2 : 4,
  },
  label: {
    color, fontWeight: "700",
    fontSize: size === "sm" ? 10 : 11,
    letterSpacing: 0.3,
  },
});

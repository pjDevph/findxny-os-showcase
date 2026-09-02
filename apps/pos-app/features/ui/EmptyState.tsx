/**
 * EmptyState — icon + message + optional sub-hint, centered.
 *
 * Replaces the near-identical FlatList ListEmptyComponent blocks in
 * products.tsx, staff.tsx and transactions.tsx.
 */
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  readonly icon?: keyof typeof Feather.glyphMap;
  readonly title: string;
  readonly subtitle?: string;
}

export function EmptyState({ icon = "inbox", title, subtitle }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  return (
    <View style={s.wrap}>
      <Feather name={icon} size={32} color={C.ink4} />
      <Text style={s.title}>{title}</Text>
      {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingVertical: 48, paddingHorizontal: 24, gap: 8 },
  title: { color: C.ink3, fontSize: 14, fontWeight: "600", textAlign: "center" },
  subtitle: { color: C.ink4, fontSize: 12, textAlign: "center" },
});

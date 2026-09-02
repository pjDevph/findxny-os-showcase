import { useMemo, type ReactNode } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  readonly icon: React.ComponentProps<typeof Feather>["name"];
  readonly title: string;
  readonly children?: ReactNode;
}

export function CardHead({ icon, title, children }: Props) {
  const { C } = useTheme();
  const s = useMemo(() => StyleSheet.create({
    head: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
    title: { color: C.ink, fontSize: 14, fontWeight: "700", flex: 1 },
  }), [C]);
  return (
    <View style={s.head}>
      <Feather name={icon} size={14} color={C.amber} />
      <Text style={s.title}>{title}</Text>
      {children}
    </View>
  );
}

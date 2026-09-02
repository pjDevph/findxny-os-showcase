import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  readonly icon: keyof typeof Feather.glyphMap;
  readonly title: string;
  readonly children: ReactNode;
}

export function CardSection({ icon, title, children }: Props) {
  const { C } = useTheme();
  return (
    <View style={{
      backgroundColor: C.surface, borderRadius: R.lg,
      borderWidth: 1, borderColor: C.line, marginBottom: 12, overflow: "hidden",
    }}>
      <View style={{
        flexDirection: "row", alignItems: "center", gap: 10,
        paddingHorizontal: 14, paddingVertical: 11,
        borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.bg2,
      }}>
        <Feather name={icon} size={14} color={C.amber} />
        <Text style={{ color: C.ink, fontSize: 13, fontWeight: "700" }}>{title}</Text>
      </View>
      <View style={{ padding: 14, gap: 10 }}>{children}</View>
    </View>
  );
}

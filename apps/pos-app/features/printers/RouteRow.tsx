import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  readonly icon: keyof typeof Feather.glyphMap;
  readonly label: string;
  readonly children: ReactNode;
}

export function RouteRow({ icon, label, children }: Props) {
  const { C } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{
        width: 28, height: 28, borderRadius: R.md,
        backgroundColor: `${C.amber}14`, alignItems: "center", justifyContent: "center",
      }}>
        <Feather name={icon} size={13} color={C.amber} />
      </View>
      <Text style={{ color: C.ink3, fontSize: 12, width: 80 }}>{label}</Text>
      <View style={{ flex: 1, flexDirection: "row" }}>{children}</View>
    </View>
  );
}

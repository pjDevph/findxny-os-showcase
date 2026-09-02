import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { MONO } from "../theme/mono";

interface Props {
  readonly label: string;
  readonly required?: boolean;
  readonly children: ReactNode;
}

export function FFld({ label, required, children }: Props) {
  const { C } = useTheme();
  return (
    <View style={{ gap: 6, marginBottom: 12 }}>
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
        <Text style={{ color: C.ink3, fontSize: 11, fontWeight: "500" }}>{label}</Text>
        {required && <Text style={{ color: C.amber, fontSize: 9, fontFamily: MONO }}>required</Text>}
      </View>
      {children}
    </View>
  );
}

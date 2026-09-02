import { View, Text } from "react-native";
import type { ReactNode } from "react";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";
import { MONO } from "../theme/mono";

export function SectionLabel({ label }: Readonly<{ label: string }>) {
  const { C } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: -6 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: `${C.line}` }} />
      <Text style={{ color: C.ink4, fontSize: 9, fontFamily: MONO, letterSpacing: 1.4, textTransform: "uppercase" }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: `${C.line}` }} />
    </View>
  );
}

export function Card({ children }: Readonly<{ children: ReactNode }>) {
  const { C } = useTheme();
  return (
    <View style={{ backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 14, gap: 14 }}>
      {children}
    </View>
  );
}

export function Field({ label, required, children }: Readonly<{ label: string; required?: boolean; children: ReactNode }>) {
  const { C } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ color: C.ink3, fontSize: 11, fontWeight: "500" }}>{label}</Text>
        {required && <Text style={{ color: C.amber, fontSize: 9, fontFamily: MONO, letterSpacing: 0.4 }}>required</Text>}
      </View>
      {children}
    </View>
  );
}

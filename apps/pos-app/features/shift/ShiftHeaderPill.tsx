import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";
import { MONO } from "../theme/mono";

interface Props {
  readonly open: boolean;
}

export function ShiftHeaderPill({ open }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  return (
    <View style={[s.pill, { backgroundColor: open ? C.goodBg : C.surface, borderColor: open ? "rgba(72,168,110,0.3)" : C.line }]}>
      <View style={[s.dot, { backgroundColor: open ? C.good : C.ink4 }]} />
      <Text style={[s.pillText, { color: open ? C.good : C.ink3 }]}>{open ? "OPEN" : "NO SHIFT"}</Text>
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.full, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: MONO },
});

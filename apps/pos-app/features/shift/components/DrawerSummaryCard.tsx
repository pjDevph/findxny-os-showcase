import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { R } from "../../theme/tokens";
import { MONO } from "../../theme/mono";
import { peso } from "../../order/format";

interface Props {
  readonly openingFloat: number;
  readonly salesTotal: number;
  readonly cashIn: number;
  readonly cashOut: number;
  readonly expected: number;
  readonly eventCount: number;
  readonly isManager: boolean;
}

export function DrawerSummaryCard({ openingFloat, salesTotal, cashIn, cashOut, expected, eventCount, isManager }: Props) {
  const { C } = useTheme();
  const s = styles(C);

  const rows = [
    { label: "Opening Float", value: peso(openingFloat), color: C.ink },
    { label: "Cash Sales", value: peso(salesTotal), color: C.good },
    { label: "Cash In", value: peso(cashIn), color: C.info },
    { label: "Cash Out", value: peso(cashOut), color: C.bad },
    // Expected Drawer is deliberately manager+ only — a cashier seeing the
    // target figure before/after counting is exactly what a blind count
    // exists to prevent.
    ...(isManager ? [{ label: "Expected Drawer", value: peso(expected), color: C.amber }] : []),
    { label: "Events", value: String(eventCount), color: C.ink2 },
  ];

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Drawer Summary</Text>
      <View style={s.grid}>
        {rows.map(row => (
          <View key={row.label} style={s.cell}>
            <Text style={s.label}>{row.label}</Text>
            <Text style={[s.value, { color: row.color }]}>{row.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 16, gap: 12 },
  cardTitle: { color: C.ink, fontSize: 16, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 1, backgroundColor: C.line, borderRadius: R.md, overflow: "hidden" },
  cell: { backgroundColor: C.bg2, padding: 12, width: "50%" },
  label: { color: C.ink3, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 3 },
  value: { fontSize: 18, fontWeight: "700", marginTop: 2, fontFamily: MONO },
});

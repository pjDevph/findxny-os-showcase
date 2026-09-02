/**
 * StatTileRow — row of "big number + caps label" summary tiles.
 *
 * Replaces reports.tsx's KpiCard row, shift.tsx's drawer-summary grid,
 * staff.tsx's stats row, products.tsx's availability summary row, and
 * transactions.tsx's summary bar — five independent implementations of the
 * same tile shape, differing only in the numbers shown.
 */
import { View, Text, StyleSheet } from "react-native";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

export interface StatTile {
  readonly key: string;
  readonly label: string;
  readonly value: string | number;
  /** Optional accent for the value text (e.g. C.good for revenue, C.bad for cancelled). */
  readonly color?: string;
}

interface Props {
  readonly tiles: readonly StatTile[];
}

export function StatTileRow({ tiles }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  return (
    <View style={s.row}>
      {tiles.map((t, i) => (
        <View key={t.key} style={[s.tile, i > 0 && s.tileDivider]}>
          <Text style={[s.value, t.color ? { color: t.color } : null]} numberOfLines={1}>{t.value}</Text>
          <Text style={s.label} numberOfLines={1}>{t.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  row: {
    flexDirection: "row", width: "100%", backgroundColor: C.bg2, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line, overflow: "hidden",
  },
  tile: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, paddingHorizontal: 6, gap: 2 },
  tileDivider: { borderLeftWidth: 1, borderLeftColor: C.line },
  value: { color: C.ink, fontSize: 17, fontWeight: "700" },
  label: { color: C.ink3, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" },
});

import { View, Text, Pressable, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { R } from "../../theme/tokens";
import { fmtDateTime } from "../shiftHelpers";
import type { PendingReconShift } from "../types";

interface Props {
  readonly pendingRecon: readonly PendingReconShift[];
  readonly loading: boolean;
  readonly onRefresh: () => void;
  readonly onSelect: (row: PendingReconShift) => void;
}

export function ReconciliationCard({ pendingRecon, loading, onRefresh, onSelect }: Props) {
  const { C } = useTheme();
  const s = styles(C);

  return (
    <View style={s.card}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={s.cardTitle}>Pending Reconciliation</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Text style={{ fontSize: 11, color: C.amber }}>Refresh</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator color={C.amber} />
      ) : pendingRecon.length === 0 ? (
        <Text style={s.helpNote}>No ended shifts waiting for review.</Text>
      ) : (
        <View style={s.list}>
          {pendingRecon.map((row) => (
            <Pressable key={row.id} style={s.row} onPress={() => onSelect(row)}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{row.registerName ?? "Register"} · {row.cashierName}</Text>
                <Text style={s.rowSub}>
                  Closed {fmtDateTime(row.closedAt)} · {row.transactionCount} txn{row.transactionCount === 1 ? "" : "s"}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={C.ink4} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 16, gap: 12 },
  cardTitle: { color: C.ink, fontSize: 16, fontWeight: "600" },
  helpNote: { color: C.ink4, fontSize: 12, lineHeight: 17 },
  list: { gap: 1, backgroundColor: C.line, borderRadius: R.md, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.bg2, padding: 12 },
  rowTitle: { color: C.ink, fontSize: 13, fontWeight: "600" },
  rowSub: { color: C.ink4, fontSize: 11, marginTop: 2 },
});

/**
 * Review panel for offline orders that have exhausted their auto-retry
 * budget (see MAX_ATTEMPTS in offlineQueue.ts). These no longer sync on
 * their own — the cashier has to look at the reason and decide whether to
 * retry (e.g. after restocking an item) or discard (e.g. a mistaken order).
 */
import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { SheetModal } from "../ui/SheetModal";
import { getStuckOrders, retryStuckOrder, discardStuckOrder, type StuckOrder } from "./offlineQueue";

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
}

export function StuckOrdersModal({ visible, onClose }: Props) {
  const [orders, setOrders] = useState<StuckOrder[] | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => {
    getStuckOrders().then(setOrders).catch(() => setOrders([]));
  }, []);

  useEffect(() => {
    if (visible) { setConfirmingId(null); reload(); }
  }, [visible, reload]);

  async function handleRetry(id: string) {
    setBusyId(id);
    try { await retryStuckOrder(id); } finally { setBusyId(null); reload(); }
  }

  async function handleDiscard(id: string) {
    if (confirmingId !== id) { setConfirmingId(id); return; }
    setBusyId(id);
    try { await discardStuckOrder(id); } finally { setBusyId(null); setConfirmingId(null); reload(); }
  }

  return (
    <SheetModal visible={visible} onClose={onClose} backdropStyle={s.backdrop} sheetStyle={s.sheet}>
      <View style={s.header}>
        <Feather name="alert-triangle" size={16} color="#b45309" />
        <Text style={s.title}>Orders needing attention</Text>
        <Pressable onPress={onClose} hitSlop={10}><Feather name="x" size={18} color="#6b7280" /></Pressable>
      </View>
      <Text style={s.subtitle}>
        These offline orders repeatedly failed to sync and are no longer retried automatically.
      </Text>
      {orders === null ? (
        <ActivityIndicator style={s.loading} />
      ) : orders.length === 0 ? (
        <Text style={s.empty}>No orders need attention.</Text>
      ) : (
        <ScrollView style={s.list}>
          {orders.map(o => (
            <View key={o.id} style={s.row}>
              <View style={s.rowHead}>
                <Text style={s.orderNo}>{o.orderNo}</Text>
                <Text style={s.attempts}>{o.attempts} attempts</Text>
              </View>
              <Text style={s.reason} numberOfLines={2}>{o.lastError ?? "Unknown error"}</Text>
              <Text style={s.timestamp}>Queued {new Date(o.createdAt).toLocaleString()}</Text>
              <View style={s.actions}>
                <Pressable
                  style={[s.btn, s.retryBtn]}
                  disabled={busyId === o.id}
                  onPress={() => handleRetry(o.id)}
                >
                  <Text style={s.retryTxt}>{busyId === o.id ? "…" : "Retry now"}</Text>
                </Pressable>
                <Pressable
                  style={[s.btn, confirmingId === o.id ? s.discardBtnConfirm : s.discardBtn]}
                  disabled={busyId === o.id}
                  onPress={() => handleDiscard(o.id)}
                >
                  <Text style={confirmingId === o.id ? s.discardTxtConfirm : s.discardTxt}>
                    {busyId === o.id ? "…" : confirmingId === o.id ? "Tap again to discard" : "Discard"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SheetModal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  sheet:    { width: "90%", maxWidth: 480, maxHeight: "80%", backgroundColor: "#fff", borderRadius: 14, padding: 16 },
  header:   { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  title:    { flex: 1, fontSize: 15, fontWeight: "700", color: "#1f2937" },
  subtitle: { fontSize: 12, color: "#6b7280", marginBottom: 10 },
  loading:  { marginVertical: 20 },
  empty:    { fontSize: 13, color: "#6b7280", textAlign: "center", marginVertical: 20 },
  list:     { maxHeight: 420 },
  row:      { borderWidth: 1, borderColor: "#f3d9a4", backgroundColor: "#fffbeb", borderRadius: 10, padding: 10, marginBottom: 8 },
  rowHead:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderNo:  { fontSize: 13, fontWeight: "700", color: "#1f2937" },
  attempts: { fontSize: 11, color: "#b45309", fontWeight: "600" },
  reason:   { fontSize: 12, color: "#7c2d12", marginTop: 4 },
  timestamp:{ fontSize: 10, color: "#9ca3af", marginTop: 4 },
  actions:  { flexDirection: "row", gap: 8, marginTop: 8 },
  btn:      { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: "center" },
  retryBtn: { backgroundColor: "#1d4ed8" },
  retryTxt: { color: "#fff", fontSize: 12, fontWeight: "700" },
  discardBtn:        { backgroundColor: "#fee2e2" },
  discardTxt:        { color: "#b91c1c", fontSize: 12, fontWeight: "700" },
  discardBtnConfirm: { backgroundColor: "#b91c1c" },
  discardTxtConfirm: { color: "#fff", fontSize: 12, fontWeight: "700" },
});

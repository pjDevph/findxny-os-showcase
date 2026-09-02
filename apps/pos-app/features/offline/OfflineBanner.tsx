import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useIsConnected, useIsForcedOffline } from "./networkStatus";
import { usePendingCount, useStuckCount, flushQueue } from "./offlineQueue";
import { StuckOrdersModal } from "./StuckOrdersModal";

export function OfflineBanner() {
  const online  = useIsConnected();
  const forced  = useIsForcedOffline();
  const pending = usePendingCount();
  const stuck   = useStuckCount();
  const [showStuck, setShowStuck] = useState(false);
  const [manualSyncing, setManualSyncing] = useState(false);

  // Fallback for when the automatic paths (reconnect listener, 30s interval —
  // see offlineQueue.ts's startSyncService) don't fire promptly: a flaky
  // connectivity event, or a cashier who reconnected seconds ago and doesn't
  // want to wait out the interval, especially right before closeShift()'s own
  // pending-order block (useShiftState.ts). flushQueue() already no-ops
  // safely if actually still offline or a flush is already in flight, so
  // this is always safe to show and tap.
  async function handleManualSync() {
    if (manualSyncing) return;
    setManualSyncing(true);
    try { await flushQueue(); } finally { setManualSyncing(false); }
  }

  const syncNowBtn = pending > 0 ? (
    <Pressable style={s.syncBtn} onPress={handleManualSync} disabled={manualSyncing} hitSlop={6}>
      {manualSyncing
        ? <ActivityIndicator size={11} color="#fff" />
        : <Feather name="rotate-cw" size={11} color="#fff" />}
      <Text style={s.syncBtnTxt}>Sync now</Text>
    </Pressable>
  ) : null;

  const stuckSegment = stuck > 0 ? (
    <Pressable style={s.stuckPill} onPress={() => setShowStuck(true)}>
      <Feather name="alert-triangle" size={11} color="#7c2d12" />
      <Text style={s.stuckTxt}>{stuck} need{stuck === 1 ? "s" : ""} attention</Text>
    </Pressable>
  ) : null;

  const modal = <StuckOrdersModal visible={showStuck} onClose={() => setShowStuck(false)} />;

  if (online && pending === 0 && stuck === 0) return modal;

  if (online && pending > 0) {
    return (
      <>
        <View style={[s.bar, s.syncing]}>
          <Feather name="refresh-cw" size={12} color="#fff" />
          <Text style={s.txt}>Syncing {pending} offline order{pending !== 1 ? "s" : ""}…</Text>
          {syncNowBtn}
          {stuckSegment}
        </View>
        {modal}
      </>
    );
  }

  if (online && stuck > 0) {
    return (
      <>
        <View style={[s.bar, s.syncing]}>
          {stuckSegment}
        </View>
        {modal}
      </>
    );
  }

  return (
    <>
      <View style={[s.bar, s.offline]}>
        <Feather name="wifi-off" size={12} color="#fff" />
        <Text style={s.txt}>
          {forced ? "Offline (simulated)" : "Offline"} — product orders queued.{" "}
          {pending > 0 ? `${pending} pending.  ` : ""}
          Bookings disabled.
        </Text>
        {syncNowBtn}
        {stuckSegment}
      </View>
      {modal}
    </>
  );
}

const s = StyleSheet.create({
  bar:     { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 7 },
  offline: { backgroundColor: "#b91c1c" },
  syncing: { backgroundColor: "#1d4ed8" },
  txt:     { color: "#fff", fontSize: 12, fontWeight: "600", flex: 1 },
  syncBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  syncBtnTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },
  stuckPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fef3c7", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  stuckTxt:  { color: "#7c2d12", fontSize: 11, fontWeight: "700" },
});

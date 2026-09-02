/**
 * Persistent "you're looking at a cached snapshot" indicator for read-only
 * screens (Order History, Receipts, Settings) that fall back to an
 * AsyncStorage cache when a fetch fails offline — see useTransactionsList.ts,
 * useTransactionDetail.ts, useWorkspaceSettings.ts, and app/pos/receipts.tsx.
 *
 * Those screens only ever show a toast on a failed refresh, which fades —
 * unlike order.tsx/shift.tsx's OfflineBanner, there was nothing on-screen
 * reminding staff the numbers they're looking at are a snapshot, not live.
 * This is deliberately simpler than OfflineBanner (no sync/queue/stuck-order
 * plumbing — these screens are read-only, there's nothing here to flush).
 */
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useIsConnected } from "./networkStatus";

export function CachedDataBanner() {
  const online = useIsConnected();
  if (online) return null;

  return (
    <View style={s.bar}>
      <Feather name="wifi-off" size={12} color="#fff" />
      <Text style={s.txt}>Offline — showing cached data. Some info may be out of date.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: "#b91c1c" },
  txt: { color: "#fff", fontSize: 12, fontWeight: "600", flex: 1 },
});

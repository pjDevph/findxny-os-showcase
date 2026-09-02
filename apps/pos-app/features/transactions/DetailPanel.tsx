import { useMemo } from "react";
import { View, Text, Pressable, ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { MONO } from "../theme/mono";
import { peso } from "../order/format";
import { useScrollOverflowHint } from "../ui/useScrollOverflowHint";
import { fmtDateTime, guestName, hasMismatch, paymentMethodLabel, shortNo, sourceColor, statusColor } from "./transactionsHelpers";
import type { DetailPayment, Order, OrderItem } from "./types";

type C = ReturnType<typeof useTheme>["C"];

interface Props {
  C: C; order: Order; items: OrderItem[]; itemsLoading: boolean;
  payment: DetailPayment | null; cashierName: string | null;
  cancelling: boolean;
  showCancelBtn: boolean; showForceCancelBtn: boolean; showRefundBtn: boolean; showCollectBalanceBtn: boolean;
  onReprint(): void; onCancel(): void; onForceCancel(): void; onRefundApproval(): void;
  onCancelItem(item: OrderItem): void; cancellingItemId: string | null;
  onCollectBalance(): void; onClose(): void; asModal: boolean;
}

export function DetailPanel({
  C, order, items, itemsLoading, payment, cashierName, cancelling,
  showCancelBtn, showForceCancelBtn, showRefundBtn, showCollectBalanceBtn,
  onReprint, onCancel, onForceCancel, onRefundApproval, onCancelItem, cancellingItemId,
  onCollectBalance, onClose, asModal,
}: Props) {
  const s = useMemo(() => detailStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const sc = statusColor(order.status, C);
  const src = order.source ?? "pos";
  const srcColor = sourceColor(src);
  const itemsSubtotal = items.reduce((sum, i) => sum + Number(i.unit_price) * i.quantity, 0);
  const mismatch = hasMismatch(order, items);
  const guest = guestName(order);
  const taxPct = Number(order.subtotal) > 0 ? Math.round((Number(order.tax) / Number(order.subtotal)) * 100) : 12;

  // Show a "more below" hint while the body overflows and hasn't been
  // scrolled to the bottom yet — the panel has no visible scrollbar.
  const hint = useScrollOverflowHint();

  return (
    <View style={asModal ? s.modalSheet : s.sidePanel}>
      {/* Header */}
      <View style={s.dHead}>
        <View style={s.dHeadLeft}>
          <Text style={s.dOrderNo}>{shortNo(order.order_no)}</Text>
          <Text style={s.dOrderFull}>{order.order_no}</Text>
        </View>
        <View style={s.dHeadRight}>
          <View style={[s.dBadge, { backgroundColor: `${srcColor}20`, borderColor: `${srcColor}50` }]}>
            <Text style={[s.dBadgeTxt, { color: srcColor }]}>{src.toUpperCase()}</Text>
          </View>
          <View style={[s.dBadge, { backgroundColor: `${sc}20`, borderColor: `${sc}50` }]}>
            <View style={[s.dBadgeDot, { backgroundColor: sc }]} />
            <Text style={[s.dBadgeTxt, { color: sc }]}>
              {order.status === "cancelled" && order.cancel_reason?.toLowerCase().includes("void")
                ? "VOIDED" : order.status.toUpperCase()}
            </Text>
          </View>
          {asModal && (
            <Pressable style={s.closeBtn} onPress={onClose} hitSlop={8}>
              <Feather name="x" size={16} color={C.ink3} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }} contentContainerStyle={[s.dBody, { paddingBottom: 8 + insets.bottom }]} showsVerticalScrollIndicator={false}
          onLayout={hint.onLayout} onContentSizeChange={hint.onContentSizeChange} onScroll={hint.onScroll}
          scrollEventThrottle={32}
        >
          {mismatch && (
            <View style={s.warnBox}>
              <Feather name="alert-triangle" size={12} color={C.warn} />
              <Text style={[s.warnTxt, { color: C.warn }]}>
                Amount mismatch — items {peso(itemsSubtotal)} vs recorded {peso(order.subtotal ?? 0)}
              </Text>
            </View>
          )}

          <View style={s.metaCard}>
            {[
              { label: "Date", value: fmtDateTime(order.created_at) },
              { label: "Type", value: (order.order_type ?? "").replace(/_/g, " ") || "—" },
              { label: "Table", value: order.table_no ? `Table ${order.table_no}` : "—" },
              { label: "Guest", value: guest || "—" },
              { label: "Cashier", value: cashierName ?? "—" },
              { label: "Payment", value: order.payment_status?.replace(/_/g, " ") ?? "—" },
              { label: "Payment Method", value: payment?.methods?.length ? paymentMethodLabel(payment.methods) : (order.status === "cancelled" ? "—" : "Unpaid") },
              ...(order.payment_status === "partially_paid" && order.balance_due
                ? [{ label: "Balance Due", value: peso(order.balance_due) }] : []),
              ...(order.cancel_reason ? [{ label: "Reason", value: order.cancel_reason }] : []),
            ].map((r, i, arr) => (
              <View key={r.label} style={[s.metaRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={s.metaLbl}>{r.label}</Text>
                <Text style={s.metaVal}>{r.value}</Text>
              </View>
            ))}
          </View>

          <Text style={s.sectionLbl}>ITEMS</Text>
          <View style={s.itemsCard}>
            {itemsLoading ? (
              <ActivityIndicator color={C.amber} style={{ padding: 16 }} />
            ) : items.length === 0 ? (
              <Text style={s.noItems}>No items recorded</Text>
            ) : items.map((item, i) => {
              const isCancelled = item.status === "cancelled";
              const isServed = item.status === "served";
              const isCancellingThis = cancellingItemId === item.id;
              const canCancel = !isCancelled && !isServed && order.status !== "cancelled";
              return (
                <View key={item.id} style={[s.itemRow, i === items.length - 1 && { borderBottomWidth: 0 }, isCancelled && { opacity: 0.6 }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {item.products?.sku ? <Text style={s.itemSku}>{item.products.sku}</Text> : null}
                      <Text style={[s.itemName, isCancelled && { textDecorationLine: "line-through" }]}>{item.products?.name ?? "—"}</Text>
                      {isCancelled && (
                        <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: "rgba(255,80,80,0.15)" }}>
                          <Text style={{ fontSize: 9, fontWeight: "700", color: "#ff5050", fontFamily: "monospace" }}>VOID</Text>
                        </View>
                      )}
                      {isServed && (
                        <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: "rgba(56,211,159,0.15)" }}>
                          <Text style={{ fontSize: 9, fontWeight: "700", color: "#38d39f", fontFamily: "monospace" }}>SERVED</Text>
                        </View>
                      )}
                    </View>
                    {item.notes && <Text style={s.itemNote}>↳ {item.notes}</Text>}
                  </View>
                  <Text style={s.itemQty}>×{item.quantity}</Text>
                  <Text style={[s.itemAmt, isCancelled && { textDecorationLine: "line-through", color: "#666" }]}>{peso(Number(item.unit_price) * item.quantity)}</Text>
                  {canCancel && (
                    <Pressable
                      onPress={() => onCancelItem(item)}
                      disabled={!!isCancellingThis}
                      hitSlop={8}
                      style={{ marginLeft: 6, padding: 4 }}
                    >
                      {isCancellingThis
                        ? <ActivityIndicator size={12} color="#ff5050" />
                        : <Feather name="x-circle" size={14} color="#ff505070" />
                      }
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>

          <View style={s.totalsCard}>
            <View style={s.totalRow}>
              <Text style={s.totalLbl}>Subtotal</Text>
              <Text style={[s.totalVal, { color: mismatch ? C.bad : C.ink2 }]}>{peso(order.subtotal ?? 0)}</Text>
            </View>
            {Number(order.tax) > 0 && (
              <View style={s.totalRow}>
                <Text style={s.totalLbl}>Tax ({taxPct}%)</Text>
                <Text style={s.totalVal}>{peso(order.tax ?? 0)}</Text>
              </View>
            )}
            {Number(order.service_fee) > 0 && (
              <View style={s.totalRow}>
                <Text style={s.totalLbl}>Service Fee</Text>
                <Text style={s.totalVal}>{peso(order.service_fee ?? 0)}</Text>
              </View>
            )}
            <View style={[s.totalRow, s.grandRow]}>
              <Text style={s.grandLbl}>Total</Text>
              <Text style={s.grandAmt}>{peso(order.total ?? 0)}</Text>
            </View>
          </View>
        </ScrollView>

        {hint.showHint && (
          <View style={s.scrollHint} pointerEvents="none">
            <View style={s.scrollHintPill}>
              <Feather name="chevrons-down" size={14} color={C.ink3} />
            </View>
          </View>
        )}
      </View>

      <View style={[s.actionBar, { paddingBottom: insets.bottom + 16 }]}>
        {order.status !== "cancelled" && (
          <Pressable
            style={[s.actionReprintBtn, itemsLoading && { opacity: 0.5 }]}
            onPress={onReprint}
            disabled={itemsLoading}
          >
            <Feather name="printer" size={14} color={C.bg} />
            <Text style={s.actionReprintTxt}>{itemsLoading ? "Loading…" : "Reprint"}</Text>
          </Pressable>
        )}
        {showCancelBtn && (
          <Pressable style={[s.actionCancelBtn, cancelling && { opacity: 0.5 }]} onPress={onCancel} disabled={cancelling}>
            <Feather name="x-circle" size={14} color={C.bad} />
            <Text style={[s.actionCancelTxt, { color: C.bad }]}>{cancelling ? "Cancelling…" : "Cancel Order"}</Text>
          </Pressable>
        )}
        {showForceCancelBtn && (
          <Pressable style={[s.actionCancelBtn, cancelling && { opacity: 0.5 }]} onPress={onForceCancel} disabled={cancelling}>
            <Feather name="x-circle" size={14} color={C.bad} />
            <Text style={[s.actionCancelTxt, { color: C.bad }]}>{cancelling ? "Cancelling…" : "Force Cancel"}</Text>
          </Pressable>
        )}
        {showRefundBtn && (
          <Pressable style={[s.actionRefundBtn, cancelling && { opacity: 0.5 }]} onPress={onRefundApproval} disabled={cancelling}>
            <Feather name="rotate-ccw" size={14} color={C.warn} />
            <Text style={[s.actionCancelTxt, { color: C.warn }]}>Refund</Text>
          </Pressable>
        )}
        {showCollectBalanceBtn && (
          <Pressable style={s.actionCollectBtn} onPress={onCollectBalance}>
            <Feather name="dollar-sign" size={14} color="#000000" />
            <Text style={s.actionCollectTxt}>Collect Balance</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export const detailStyles = (C: C) => StyleSheet.create({
  modalSheet: { backgroundColor: C.bg2, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: "90%", flex: 0 },
  sidePanel: { flex: 1, backgroundColor: C.bg2 },
  dHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: C.line },
  dHeadLeft: { gap: 2 },
  dHeadRight: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", flex: 1, marginLeft: 10 },
  dOrderNo: { color: C.ink, fontSize: 22, fontWeight: "800", fontFamily: MONO },
  dOrderFull: { color: C.ink4, fontSize: 9, fontFamily: MONO },
  dBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.full, borderWidth: 1 },
  dBadgeDot: { width: 5, height: 5, borderRadius: 2.5 },
  dBadgeTxt: { fontSize: 9, fontWeight: "700", letterSpacing: 0.3 },
  closeBtn: { padding: 4, borderRadius: R.full, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  // paddingBottom clears the absolutely-positioned "more below" scroll-hint
  // pill (~24px tall, pinned 4px from the bottom) so it never overlaps the
  // last real content line while showHint is true.
  dBody: { padding: 14, gap: 12, paddingBottom: 32 },
  scrollHint: { position: "absolute", bottom: 4, left: 0, right: 0, alignItems: "center" },
  scrollHintPill: {
    backgroundColor: C.surface, borderRadius: R.full,
    borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 8, paddingVertical: 3,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 2,
  },
  warnBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: R.md, backgroundColor: C.badBg, borderWidth: 1, borderColor: `${C.warn}40` },
  warnTxt: { flex: 1, fontSize: 11, lineHeight: 16 },
  metaCard: { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, overflow: "hidden" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  metaLbl: { color: C.ink4, fontSize: 11 },
  metaVal: { color: C.ink2, fontSize: 11, fontWeight: "600", textTransform: "capitalize", textAlign: "right", flex: 1, marginLeft: 12 },
  sectionLbl: { color: C.ink4, fontSize: 9, fontFamily: MONO, letterSpacing: 0.8, textTransform: "uppercase" },
  itemsCard: { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, overflow: "hidden" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  itemName: { color: C.ink, fontSize: 13, fontWeight: "500" },
  itemSku: { color: C.ink4, fontSize: 10, fontWeight: "700", fontFamily: "monospace", letterSpacing: 0.5 },
  itemNote: { color: C.ink4, fontSize: 11, fontStyle: "italic", marginTop: 1 },
  itemQty: { color: C.ink3, fontSize: 12, fontFamily: MONO, minWidth: 26, textAlign: "right" },
  itemAmt: { color: C.amber, fontSize: 13, fontWeight: "600", minWidth: 72, textAlign: "right", fontFamily: MONO },
  noItems: { color: C.ink4, fontSize: 12, padding: 16, textAlign: "center" },
  totalsCard: { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 13, paddingVertical: 10, gap: 8 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLbl: { color: C.ink3, fontSize: 12 },
  totalVal: { color: C.ink2, fontSize: 12, fontFamily: MONO },
  grandRow: { paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line, marginTop: 2 },
  grandLbl: { color: C.ink, fontSize: 16, fontWeight: "700" },
  grandAmt: { color: C.amber, fontSize: 18, fontWeight: "800", fontFamily: MONO },
  actionBar: { flexDirection: "row", gap: 6, padding: 12, paddingBottom: 16, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg },
  actionReprintBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: R.md, backgroundColor: C.amber },
  actionReprintTxt: { color: C.bg, fontSize: 13, fontWeight: "700" },
  actionCancelBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: `${C.bad}50` },
  actionRefundBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: `${C.warn}50` },
  actionCollectBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: R.md, backgroundColor: C.good },
  actionCollectTxt: { color: "#000000", fontSize: 13, fontWeight: "700" },
  actionCancelTxt: { fontSize: 13, fontWeight: "700" },
});

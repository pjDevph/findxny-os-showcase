import {
  View, Text, Pressable, TextInput,
  StyleSheet, ActivityIndicator, Platform, Modal,
} from "react-native";
import { useState, useMemo } from "react";
import { Feather } from "@expo/vector-icons";
import { invokeFn } from "../../services/supabase";
import { useAuth } from "../../features/auth/AuthContext";
import { R } from "../../features/theme/tokens";
import { useTheme } from "../../features/theme/ThemeContext";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { useToast } from "../../features/ui/ToastProvider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ManagerApprovalModal } from "../../features/pos-order/components/ManagerApprovalModal";
import { KeyboardAwareScrollView } from "../../features/ui/KeyboardAwareScrollView";
import { NAV_BAR_CLEARANCE } from "../../features/ui/safeAreaPadding";
import { sanitizeMoney } from "../../features/utils/inputSanitizers";
import { useShiftGate } from "../../features/shift/useShiftGate";
import { ShiftGateBlock } from "../../features/shift/ShiftGateBlock";

type C = ReturnType<typeof useTheme>["C"];

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
const peso = (n: number) => `₱${Number(n).toFixed(2)}`;

const CANCEL_REASONS = [
  "Customer left",
  "Wrong item",
  "Duplicate order",
  "Out of stock",
  "Customer request",
  "Other",
];

type PayMethod = "cash" | "gcash" | "maya" | "card" | "qrph" | "bank_transfer";
const PAY_METHODS: { id: PayMethod; label: string }[] = [
  { id: "cash",  label: "Cash"  },
  { id: "gcash", label: "GCash" },
  { id: "maya",  label: "Maya"  },
  { id: "card",  label: "Card"  },
  { id: "qrph",  label: "QR PH" },
  { id: "bank_transfer", label: "Bank" },
];

interface LoadedOrder {
  order: {
    id: string;
    order_no: string;
    ticket_no: string;
    subtotal: number;
    tax: number;
    total: number;
    table_no: string | null;
    notes: string | null;
  };
  items: { id: string; name: string; quantity: number; unit_price: number; total: number; notes: string | null }[];
  customer: { name: string; phone: string } | null;
}

function SuccessOverlay({
  orderNo, ticketNo, change, onClose,
}: {
  orderNo: string; ticketNo: string; change: number; onClose: () => void;
}) {
  const { C } = useTheme();
  const su = useMemo(() => makeSuccessStyles(C), [C]);
  return (
    <View style={su.overlay}>
      <Text style={su.icon}>✓</Text>
      <Text style={su.ticket}>{ticketNo}</Text>
      <Text style={su.orderNo}>#{orderNo}</Text>
      <Text style={su.label}>PAYMENT CONFIRMED</Text>
      {change > 0 && (
        <View style={su.changeBadge}>
          <Text style={su.changeLabel}>Change due</Text>
          <Text style={su.changeAmt}>{peso(change)}</Text>
        </View>
      )}
      <Pressable style={su.btn} onPress={onClose}>
        <Text style={su.btnText}>Next Customer</Text>
      </Pressable>
    </View>
  );
}

export default function CounterScreen() {
  const { activeWorkspaceId, activeBranchId, role } = useAuth();
  // manager-approval-verify only allows admin/owner to self-approve (see
  // supabase/functions/manager-approval-verify — manager requires a second
  // sign-off by design); must mirror that here or a manager gets silently
  // routed to a self-approval path the server always rejects.
  const isSelfApprover = role === "owner" || role === "admin";
  // Cashiers can't take counter payments without an open, clocked-in shift
  // on this device — same gate as Orders.
  const shiftGate = useShiftGate();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [ticketInput, setTicketInput] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [loadedOrder, setLoadedOrder] = useState<LoadedOrder | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [cashInput, setCashInput] = useState("");
  const [refNumber, setRefNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<{ change: number; order_no: string; ticket_no: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cancelVisible, setCancelVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelApprovalId, setCancelApprovalId] = useState<string | null>(null);
  const [showCancelApprovalModal, setShowCancelApprovalModal] = useState(false);

  const total     = loadedOrder ? Number(loadedOrder.order.total) : 0;
  const isCash    = payMethod === "cash";
  const cashAmt   = isCash ? (parseFloat(cashInput) || 0) : total;
  const change    = isCash ? cashAmt - total : 0;
  const needsRef  = !isCash;
  const canConfirm = isCash ? cashAmt >= total : refNumber.trim().length > 0;

  async function loadOrder() {
    const ticket = ticketInput.trim().toUpperCase();
    if (!ticket) return;
    if (!activeWorkspaceId) {
      setErr("No active workspace");
      return;
    }
    setErr(null);
    setLoadedOrder(null);
    setCashInput("");
    setPayMethod("cash");
    setRefNumber("");
    setLookingUp(true);
    try {
      const { data, error } = await invokeFn<LoadedOrder & { error?: { message?: string } | string }>("pos-ticket-lookup", {
        workspace_id: activeWorkspaceId, ticket_no: ticket,
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : data.error.message ?? "Ticket not found");
      setLoadedOrder(data as LoadedOrder);
    } catch (e: any) {
      setErr(e?.message ?? "Ticket not found");
    } finally {
      setLookingUp(false);
    }
  }

  async function confirmPayment() {
    if (!loadedOrder || !activeWorkspaceId || !activeBranchId) return;
    if (isCash && cashAmt < total) {
      setErr("Cash received is less than the order total.");
      return;
    }
    if (needsRef && !refNumber.trim()) {
      setErr("Enter the transaction reference number.");
      return;
    }
    setErr(null);
    setSubmitting(true);
    try {
      // invokeFn, not the raw supabase.functions.invoke client — the raw
      // client only ever reports "Edge Function returned a non-2xx status
      // code" and discards the real {error:{message}} body, making every
      // failure here undiagnosable regardless of the real cause.
      const { data, error } = await invokeFn<{ change?: number; error?: { message?: string } | string }>("pos-counter-pay", {
        workspace_id:   activeWorkspaceId,
        branch_id:      activeBranchId,
        order_id:       loadedOrder.order.id,
        cash_received:  cashAmt,
        payment_method: payMethod,
        ...(needsRef ? { ref_number: refNumber.trim() } : {}),
      }, { "Idempotency-Key": `counterpay_${loadedOrder.order.id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}` });
      if (error) throw error;
      if (!data) throw new Error("No response from server");
      if (data.error) throw new Error(typeof data.error === "string" ? data.error : data.error.message ?? "Payment failed");
      setSuccessData({
        change:   data.change ?? 0,
        order_no: loadedOrder.order.order_no,
        ticket_no: loadedOrder.order.ticket_no,
      });
    } catch (e: any) {
      showToast({ title: "Payment failed", message: e?.message ?? "Unknown error", type: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelOrder(managerApprovalId?: string) {
    if (!loadedOrder || !activeWorkspaceId) return;
    setCancelling(true);
    try {
      const { error } = await invokeFn("orders-cancel", {
        workspace_id: activeWorkspaceId,
        order_id: loadedOrder.order.id,
        reason: cancelReason ?? undefined,
        ...(managerApprovalId ? { manager_approval_id: managerApprovalId } : {}),
      });
      if (error) {
        if (error.message?.includes("ORDER_IN_PREPARATION")) {
          setCancelling(false);
          await requestCancelApproval();
          return;
        }
        throw error;
      }
      setCancelVisible(false);
      reset();
    } catch (e: any) {
      showToast({ title: "Cancel failed", message: e?.message ?? "Unknown error", type: "error" });
    } finally {
      setCancelling(false);
    }
  }

  // Kitchen has already started this order — request (and, for owner/admin/
  // manager, self-approve) a manager override, then retry the cancel.
  async function requestCancelApproval() {
    if (!loadedOrder || !activeWorkspaceId || !activeBranchId) return;
    const { data, error } = await invokeFn<{ approval: { id: string } | null }>("manager-approval-create", {
      workspace_id: activeWorkspaceId, branch_id: activeBranchId,
      action_type: "void_order", target_type: "order", target_id: loadedOrder.order.id,
      reason: cancelReason ?? "Cashier requested cancel — kitchen already started",
    });
    if (error || !data?.approval?.id) {
      showToast({ title: "Error", message: error?.message ?? "Could not request approval.", type: "error" });
      return;
    }
    const approvalId = data.approval.id;
    if (isSelfApprover) {
      const { data: vData, error: vErr } = await invokeFn<{ approval: { id: string; status: string } | null; message?: string }>(
        "manager-approval-verify",
        { workspace_id: activeWorkspaceId, approval_id: approvalId, action: "approve" },
      );
      if (vErr || vData?.approval?.status !== "approved") {
        showToast({ title: "Approval Rejected", message: vData?.message ?? vErr?.message ?? "Manager approval was not granted.", type: "error" });
        return;
      }
      await cancelOrder(approvalId);
    } else {
      setCancelApprovalId(approvalId);
      setShowCancelApprovalModal(true);
    }
  }

  function reset() {
    setSuccessData(null);
    setLoadedOrder(null);
    setTicketInput("");
    setCashInput("");
    setPayMethod("cash");
    setRefNumber("");
    setErr(null);
  }

  if (role === "cashier" && shiftGate.loaded && (!shiftGate.shiftOpen || !shiftGate.clockedIn)) {
    return <ShiftGateBlock gate={shiftGate} />;
  }

  return (
    <View style={s.root}>
      {/* Header */}
      <PosScreenHeader title="Counter Pay"
        right={
          <View style={[s.modeBadge, { borderColor: `${C.amber}40`, backgroundColor: `${C.amber}18` }]}>
            <Text style={[s.modeLabel, { color: C.amber }]}>KIOSK</Text>
          </View>
        } />

      <KeyboardAwareScrollView
        style={s.body}
        contentContainerStyle={[s.bodyContent, { paddingBottom: insets.bottom + NAV_BAR_CLEARANCE }]}
        keyboardDismissMode="on-drag"
      >

        {/* Ticket lookup */}
        <View style={s.card}>
          <Text style={s.cardTitle}>
            <Feather name="search" size={13} color={C.ink3} /> Ticket lookup
          </Text>
          <View style={s.ticketRow}>
            <TextInput
              style={s.ticketInput}
              placeholder="K-1042"
              placeholderTextColor={C.ink4}
              value={ticketInput}
              onChangeText={(v) => { setTicketInput(v); setLoadedOrder(null); setErr(null); }}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={loadOrder}
            />
            <Pressable
              style={[s.loadBtn, (lookingUp || !ticketInput.trim()) && { opacity: 0.5 }]}
              onPress={loadOrder}
              disabled={lookingUp || !ticketInput.trim()}
            >
              {lookingUp
                ? <ActivityIndicator size="small" color="#000000" />
                : <Text style={s.loadBtnText}>Load Order</Text>}
            </Pressable>
          </View>
          {err && <Text style={s.errText}>{err}</Text>}
        </View>

        {/* Order summary */}
        {loadedOrder && (
          <>
            <View style={s.card}>
              <View style={s.orderHeader}>
                <View style={s.ticketPill}>
                  <Text style={s.ticketPillText}>{loadedOrder.order.ticket_no}</Text>
                </View>
                <Text style={s.orderNo}>#{loadedOrder.order.order_no}</Text>
              </View>

              {loadedOrder.customer && (
                <View style={s.customerRow}>
                  <Feather name="user" size={13} color={C.ink3} />
                  <Text style={s.customerName}>{loadedOrder.customer.name}</Text>
                  <Text style={s.customerPhone}>{loadedOrder.customer.phone}</Text>
                </View>
              )}

              {loadedOrder.order.table_no && (
                <View style={s.customerRow}>
                  <Feather name="map-pin" size={13} color={C.ink3} />
                  <Text style={s.customerName}>Table {loadedOrder.order.table_no}</Text>
                </View>
              )}

              <View style={s.divider} />

              {loadedOrder.items.map((it) => (
                <View key={it.id} style={s.itemRow}>
                  <Text style={s.itemQty}>×{it.quantity}</Text>
                  <Text style={s.itemName} numberOfLines={1}>{it.name}</Text>
                  <Text style={s.itemTotal}>{peso(it.total)}</Text>
                </View>
              ))}

              <View style={s.divider} />

              <View style={s.totalsBlock}>
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>Subtotal</Text>
                  <Text style={s.totalVal}>{peso(loadedOrder.order.subtotal)}</Text>
                </View>
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>Tax</Text>
                  <Text style={s.totalVal}>{peso(loadedOrder.order.tax)}</Text>
                </View>
                <View style={[s.totalRow, s.grandRow]}>
                  <Text style={s.grandLabel}>Total Due</Text>
                  <Text style={s.grandVal}>{peso(loadedOrder.order.total)}</Text>
                </View>
              </View>
            </View>

            {/* Cancel order */}
            <Pressable style={s.cancelBtn} onPress={() => { setCancelReason(null); setCancelVisible(true); }}>
              <Feather name="x-circle" size={14} color={C.bad} />
              <Text style={s.cancelBtnText}>Cancel Order</Text>
            </Pressable>

            {/* Payment */}
            <View style={s.card}>
              <Text style={s.cardTitle}>
                <Feather name="credit-card" size={13} color={C.ink3} /> Payment method
              </Text>
              <View style={s.methodRow}>
                {PAY_METHODS.map((m) => (
                  <Pressable
                    key={m.id}
                    style={[s.methodBtn, payMethod === m.id && s.methodBtnActive]}
                    onPress={() => { setPayMethod(m.id); setErr(null); }}
                  >
                    <Text style={[s.methodBtnText, payMethod === m.id && s.methodBtnTextActive]}>{m.label}</Text>
                  </Pressable>
                ))}
              </View>

              {isCash ? (
                <>
                  <TextInput
                    style={s.cashInput}
                    keyboardType="decimal-pad"
                    maxLength={12}
                    placeholder="0.00"
                    placeholderTextColor={C.ink4}
                    value={cashInput}
                    onChangeText={(v) => setCashInput(sanitizeMoney(v))}
                    blurOnSubmit={false} // NOSONAR
                    returnKeyType="done"
                  />

                  {/* Quick amounts */}
                  <View style={s.quickRow}>
                    {[total, Math.ceil(total / 100) * 100, 500, 1000].map((amt, i) => (
                      <Pressable key={i} style={s.quickBtn} onPress={() => setCashInput(amt.toFixed(2))}>
                        <Text style={s.quickBtnText}>{peso(amt)}</Text>
                      </Pressable>
                    ))}
                  </View>

                  {cashAmt > 0 && (
                    <View style={[s.changeRow, { backgroundColor: change >= 0 ? C.goodBg : C.badBg }]}>
                      <Text style={[s.changeLabel, { color: change >= 0 ? C.good : C.bad }]}>
                        {change >= 0
                          ? `Change: ${peso(change)}`
                          : `Short by ${peso(Math.abs(change))} ⚠`}
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <TextInput
                  style={s.refInput}
                  placeholder="Transaction reference no. — e.g. GC123456789"
                  placeholderTextColor={C.ink4}
                  value={refNumber}
                  onChangeText={(v) => { setRefNumber(v); setErr(null); }}
                  autoCapitalize="characters"
                  returnKeyType="done"
                />
              )}

              <Pressable
                style={[s.confirmBtn, (submitting || !canConfirm) && { opacity: 0.5 }]}
                onPress={confirmPayment}
                disabled={submitting || !canConfirm}
              >
                {submitting
                  ? <ActivityIndicator color="#000000" />
                  : <Text style={s.confirmBtnText}>Confirm Payment · {peso(total)}</Text>}
              </Pressable>
            </View>
          </>
        )}

        {/* Empty state */}
        {!loadedOrder && !err && (
          <View style={s.emptyState}>
            <Feather name="credit-card" size={40} color={C.ink4} />
            <Text style={s.emptyTitle}>Enter a kiosk ticket</Text>
            <Text style={s.emptySub}>Customers with counter-pay orders receive a ticket number like K-1042.</Text>
          </View>
        )}
      </KeyboardAwareScrollView>

      {/* Cancel reason modal */}
      <Modal visible={cancelVisible} transparent animationType="fade" onRequestClose={() => setCancelVisible(false)}>
        <Pressable style={s.modalBd} onPress={() => setCancelVisible(false)}>
          <Pressable style={s.cancelSheet} onPress={() => {}}>
            <Text style={s.cancelTitle}>Cancel Order</Text>
            <Text style={s.cancelSub}>Select a reason (optional)</Text>
            {CANCEL_REASONS.map((r) => (
              <Pressable
                key={r}
                style={[s.reasonRow, cancelReason === r && s.reasonRowActive]}
                onPress={() => setCancelReason(prev => prev === r ? null : r)}
              >
                <View style={[s.reasonDot, cancelReason === r && { backgroundColor: C.bad }]} />
                <Text style={[s.reasonText, cancelReason === r && { color: C.bad }]}>{r}</Text>
              </Pressable>
            ))}
            <View style={s.cancelActions}>
              <Pressable style={s.cancelDismiss} onPress={() => setCancelVisible(false)}>
                <Text style={s.cancelDismissText}>Keep Order</Text>
              </Pressable>
              <Pressable
                style={[s.cancelConfirm, cancelling && { opacity: 0.5 }]}
                onPress={() => cancelOrder()}
                disabled={cancelling}
              >
                {cancelling
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.cancelConfirmText}>Confirm Cancel</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ManagerApprovalModal
        visible={showCancelApprovalModal}
        approvalId={cancelApprovalId}
        actionLabel="Cancel Order In Preparation"
        onApproved={(id) => {
          setShowCancelApprovalModal(false);
          cancelOrder(id).catch(console.error);
        }}
        onRejected={(reason) => {
          showToast({ title: "Cancel Rejected", message: reason || "Manager approval was not granted.", type: "error" });
          setShowCancelApprovalModal(false);
        }}
        onClose={() => setShowCancelApprovalModal(false)}
      />

      {successData && (
        <SuccessOverlay
          orderNo={successData.order_no}
          ticketNo={successData.ticket_no}
          change={successData.change}
          onClose={reset}
        />
      )}
    </View>
  );
}

const makeSuccessStyles = (C: C) => StyleSheet.create({
  overlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(26,21,16,0.96)",
    alignItems: "center", justifyContent: "center", gap: 8, zIndex: 100,
  },
  icon:    { fontSize: 64, color: C.good },
  ticket:  { fontSize: 44, color: C.amber, fontFamily: MONO, fontWeight: "700", letterSpacing: 2 },
  orderNo: { fontSize: 18, color: C.ink3, fontFamily: MONO },
  label:   { fontSize: 11, color: C.good, letterSpacing: 2, fontFamily: MONO, textTransform: "uppercase" },
  changeBadge: {
    marginTop: 16, paddingHorizontal: 28, paddingVertical: 14,
    backgroundColor: C.goodBg, borderRadius: R.lg,
    borderWidth: 1, borderColor: `${C.good}60`, alignItems: "center",
  },
  changeLabel: { color: C.ink3, fontSize: 11, textTransform: "uppercase", fontFamily: MONO, letterSpacing: 1 },
  changeAmt: { color: C.good, fontSize: 36, fontWeight: "700", fontFamily: MONO, marginTop: 4 },
  btn: {
    marginTop: 28, paddingHorizontal: 36, paddingVertical: 15,
    backgroundColor: C.surface, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line,
  },
  btnText: { color: C.ink, fontSize: 15, fontWeight: "600" },
});

const makeStyles = (C: C) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.line, gap: 10,
  },
  menuBtn:     { paddingVertical: 4, paddingRight: 4 },
  backBtn:     { paddingVertical: 4, paddingRight: 8 },
  backText:    { color: C.amber, fontSize: 15, fontWeight: "600" },
  headerTitle: { color: C.ink, fontSize: 16, fontWeight: "700" },
  modeBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: R.full, borderWidth: 1,
  },
  modeLabel: { fontSize: 10, fontFamily: MONO, letterSpacing: 1.5, fontWeight: "700" },

  body:        { flex: 1 },
  bodyContent: { padding: 16, gap: 14 },

  card: {
    backgroundColor: C.surface, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line, padding: 16, gap: 12,
  },
  cardTitle: { color: C.ink3, fontSize: 11, fontFamily: MONO, letterSpacing: 1.2, textTransform: "uppercase" },

  ticketRow:   { flexDirection: "row", gap: 10 },
  ticketInput: {
    flex: 1, backgroundColor: C.bg, borderRadius: R.md,
    borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 14, paddingVertical: 13,
    color: C.ink, fontSize: 22, fontWeight: "700", fontFamily: MONO, letterSpacing: 2,
  },
  loadBtn: {
    paddingHorizontal: 18, paddingVertical: 13,
    backgroundColor: C.amber, borderRadius: R.md,
    alignItems: "center", justifyContent: "center", minWidth: 110,
  },
  loadBtnText: { color: "#000000", fontSize: 14, fontWeight: "700" },

  errText: { color: C.bad, fontSize: 13, marginTop: -4 },

  orderHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  ticketPill: {
    paddingHorizontal: 14, paddingVertical: 6,
    backgroundColor: C.amberBg, borderRadius: R.full,
    borderWidth: 1, borderColor: `${C.amber}50`,
  },
  ticketPillText: { color: C.amber, fontSize: 16, fontFamily: MONO, fontWeight: "700", letterSpacing: 1 },
  orderNo:        { color: C.ink3, fontSize: 13, fontFamily: MONO },

  customerRow:  { flexDirection: "row", alignItems: "center", gap: 8, marginTop: -4 },
  customerName: { color: C.ink, fontSize: 14, fontWeight: "500" },
  customerPhone:{ color: C.ink3, fontSize: 13 },

  divider: { height: 1, backgroundColor: C.lineSoft, marginVertical: 2 },

  itemRow:  { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  itemQty:  { color: C.ink4, fontSize: 13, fontFamily: MONO, minWidth: 28 },
  itemName: { flex: 1, color: C.ink, fontSize: 14 },
  itemTotal:{ color: C.ink2, fontSize: 13, fontFamily: MONO },

  totalsBlock: { gap: 5 },
  totalRow:    { flexDirection: "row", justifyContent: "space-between" },
  totalLabel:  { color: C.ink3, fontSize: 13 },
  totalVal:    { color: C.ink2, fontSize: 13, fontFamily: MONO },
  grandRow:    { paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line, marginTop: 4 },
  grandLabel:  { color: C.ink, fontSize: 16, fontWeight: "600" },
  grandVal:    { color: C.amber, fontSize: 20, fontWeight: "700", fontFamily: MONO },

  methodRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  methodBtn: {
    paddingHorizontal: 14, paddingVertical: 9,
    backgroundColor: C.bg, borderRadius: R.md, borderWidth: 1, borderColor: C.line,
  },
  methodBtnActive:     { backgroundColor: C.amberBg, borderColor: C.amber },
  methodBtnText:       { color: C.ink2, fontSize: 13, fontWeight: "600" },
  methodBtnTextActive: { color: C.amber },

  refInput: {
    backgroundColor: C.bg, borderRadius: R.md,
    borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: C.ink, fontFamily: MONO,
  },

  cashInput: {
    backgroundColor: C.bg, borderRadius: R.md,
    borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 28, fontWeight: "700", color: C.ink, fontFamily: MONO, textAlign: "right",
  },

  quickRow: { flexDirection: "row", gap: 8 },
  quickBtn: {
    flex: 1, paddingVertical: 10, alignItems: "center",
    backgroundColor: C.bg, borderRadius: R.md, borderWidth: 1, borderColor: C.line,
  },
  quickBtnText: { color: C.ink2, fontSize: 12, fontFamily: MONO },

  changeRow:   { padding: 12, borderRadius: R.md },
  changeLabel: { fontSize: 15, fontWeight: "600", fontFamily: MONO, textAlign: "center" },

  confirmBtn: {
    padding: 16, borderRadius: R.lg, alignItems: "center",
    backgroundColor: C.good, marginTop: 4,
  },
  confirmBtnText: { color: "#000000", fontSize: 16, fontWeight: "700" },

  emptyState: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingTop: 60, gap: 14,
  },
  emptyTitle: { color: C.ink2, fontSize: 17, fontWeight: "600", textAlign: "center" },
  emptySub:   { color: C.ink4, fontSize: 13, textAlign: "center", lineHeight: 20, maxWidth: 280 },

  cancelBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 12, borderRadius: R.lg,
    borderWidth: 1, borderColor: `${C.bad}40`, backgroundColor: `${C.bad}0a`,
  },
  cancelBtnText: { color: C.bad, fontSize: 14, fontWeight: "600" },

  modalBd: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 16 },
  cancelSheet: {
    backgroundColor: C.bg2, borderRadius: 20,
    padding: 20, gap: 10, paddingBottom: 36, width: "100%", maxWidth: 640,
  },
  cancelTitle: { color: C.ink, fontSize: 18, fontWeight: "700" },
  cancelSub:   { color: C.ink4, fontSize: 13, marginBottom: 4 },
  reasonRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: C.lineSoft,
  },
  reasonRowActive: { backgroundColor: `${C.bad}08` },
  reasonDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.line, borderWidth: 1, borderColor: C.ink4 },
  reasonText: { color: C.ink2, fontSize: 14 },
  cancelActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  cancelDismiss: {
    flex: 1, paddingVertical: 13, borderRadius: R.lg, alignItems: "center",
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
  },
  cancelDismissText: { color: C.ink2, fontSize: 14, fontWeight: "600" },
  cancelConfirm: {
    flex: 1, paddingVertical: 13, borderRadius: R.lg, alignItems: "center",
    backgroundColor: C.bad,
  },
  cancelConfirmText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});

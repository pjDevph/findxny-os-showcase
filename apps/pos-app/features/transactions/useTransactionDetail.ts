import { useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { invokeFn, isNetworkError } from "../../services/supabase";
import { useAppAlert } from "../ui/AppAlertProvider";
import { useToast } from "../ui/ToastProvider";
import type { ReceiptPayload } from "../receipt/receiptConfig";
import { readOfflineReceipts } from "../offline/offlineReceipts";
import { peso } from "../order/format";
import { buildReceiptPayload } from "./receiptPayload";
import type { CollectMethod, DetailPayment, Order, OrderItem } from "./types";

interface CachedDetail {
  items: OrderItem[];
  payment: DetailPayment | null;
  cashierName: string | null;
  cachedAt: number;
}

// Read-side cache for order detail (items/payment/cashier), keyed per order
// under a single per-workspace AsyncStorage entry — mirrors the product
// catalog cache in orderHelpers.ts. Without this, opening an order while
// offline left `detailLoading` stuck true forever (an honest spinner, per
// the comment below) with no way to view — or reprint — anything that
// wasn't already sitting in React state from the current session.
const MAX_CACHED_DETAILS = 100;
const detailCacheKey = (workspaceId: string) => `pos_tx_detail_cache_v1_${workspaceId}`;

async function readDetailCache(workspaceId: string): Promise<Record<string, CachedDetail>> {
  try {
    const raw = await AsyncStorage.getItem(detailCacheKey(workspaceId));
    return raw ? (JSON.parse(raw) as Record<string, CachedDetail>) : {};
  } catch { return {}; }
}

async function writeDetailCacheEntry(workspaceId: string, orderId: string, entry: CachedDetail): Promise<void> {
  const all = await readDetailCache(workspaceId);
  all[orderId] = entry;
  const ids = Object.keys(all);
  if (ids.length > MAX_CACHED_DETAILS) {
    ids.sort((a, b) => all[a].cachedAt - all[b].cachedAt);
    for (const id of ids.slice(0, ids.length - MAX_CACHED_DETAILS)) delete all[id];
  }
  await AsyncStorage.setItem(detailCacheKey(workspaceId), JSON.stringify(all));
}

interface UseTransactionDetailArgs {
  activeWorkspaceId: string | null | undefined;
  activeBranchId: string | null | undefined;
  isSelfApprover: boolean;
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  reloadList: () => void;
}

export function useTransactionDetail({ activeWorkspaceId, activeBranchId, isSelfApprover, setOrders, reloadList }: UseTransactionDetailArgs) {
  const { showAlert } = useAppAlert();
  const { showToast } = useToast();

  const [detail, setDetail] = useState<Order | null>(null);
  const [detailItems, setDetailItems] = useState<OrderItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPayment, setDetailPayment] = useState<DetailPayment | null>(null);
  const [detailCashier, setDetailCashier] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [receiptPayload, setReceiptPayload] = useState<ReceiptPayload | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [showApproval, setShowApproval] = useState(false);
  const [approvalAction, setApprovalAction] = useState<"void_order" | "cancel_item">("void_order");
  const [cancellingItemId, setCancellingItemId] = useState<string | null>(null);
  const [approvalItemId, setApprovalItemId] = useState<string | null>(null);
  const detailRequestRef = useRef(0);

  // Refund now runs entirely inside RefundModal (amount, reason, and manager
  // approval collected in one sheet) — this just toggles it open/closed.
  const [showRefundModal, setShowRefundModal] = useState(false);

  // Collect-balance state (settling the remainder of a partially-paid order)
  const [collectVisible, setCollectVisible] = useState(false);
  const [collectMethod, setCollectMethod] = useState<CollectMethod>("cash");
  const [collectRef, setCollectRef] = useState("");
  const [collecting, setCollecting] = useState(false);

  // A pending_sync row (see useTransactionsList.ts/offlineReceipts.ts) has no
  // server-side id yet — transactions-order-detail would just 404/error on
  // it. Its full ReceiptPayload already exists locally (cached at checkout
  // time), so skip the network entirely and go straight to the receipt.
  async function openPendingReceipt(order: Order) {
    if (!activeWorkspaceId) return;
    const receipts = await readOfflineReceipts(activeWorkspaceId);
    const payload = receipts[order.id];
    if (!payload) {
      // Synced in the background since the list was last loaded.
      showToast({ title: "Already synced", message: "This order has synced — refreshing the list.", type: "info" });
      reloadList();
      return;
    }
    setReceiptPayload(payload);
    setShowReceiptModal(true);
  }

  async function openDetail(order: Order) {
    if (order.pending_sync) { await openPendingReceipt(order); return; }
    const requestId = ++detailRequestRef.current;
    setDetail(order);
    setDetailLoading(true);
    setDetailPayment(null);
    setDetailCashier(null);
    const { data, error } = await invokeFn<{
      "transactions-order-detail": OrderItem[];
      "transactions-order-payment": DetailPayment | null;
      cashier_name?: string | null;
    }>("pos-data", {
      workspace_id: activeWorkspaceId,
      resource: "transactions-order-detail",
      params: { order_id: order.id },
    });
    if (requestId !== detailRequestRef.current) return; // a newer openDetail() superseded this one
    // invokeFn never throws on a network failure — it resolves {data: null,
    // error}. This used to fall straight through to `data?.[...] ?? []`,
    // rendering as "No items recorded" / "Unpaid" as if verified, instead of
    // "couldn't load." Fall back to a previously-cached copy of this exact
    // order (see writeDetailCacheEntry below) if one exists; otherwise leave
    // detailLoading true (an honest stuck spinner, not a false empty/unpaid
    // state) and let the cashier know why — re-tapping the order retries.
    if (isNetworkError(error)) {
      if (activeWorkspaceId) {
        const cached = (await readDetailCache(activeWorkspaceId))[order.id];
        if (requestId !== detailRequestRef.current) return;
        if (cached) {
          setDetailItems(cached.items);
          setDetailPayment(cached.payment);
          setDetailCashier(cached.cashierName);
          setDetailLoading(false);
          showToast({ title: "Showing cached copy", message: "No connection — this is the last-viewed version of this order.", type: "info" });
          return;
        }
      }
      showToast({ title: "Couldn't load order", message: "No connection — check your network and try again.", type: "error" });
      return;
    }
    const items = data?.["transactions-order-detail"] ?? [];
    const payment = data?.["transactions-order-payment"] ?? null;
    const cashierName = data?.cashier_name ?? null;
    setDetailItems(items);
    setDetailPayment(payment);
    setDetailCashier(cashierName);
    setDetailLoading(false);
    if (activeWorkspaceId) {
      writeDetailCacheEntry(activeWorkspaceId, order.id, { items, payment, cashierName, cachedAt: Date.now() }).catch(() => {});
    }
  }

  async function handleCancelOrder() {
    if (!detail || !activeWorkspaceId) return;
    showAlert("Cancel Order", `Cancel ${detail.order_no}? This cannot be undone.`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel Order", style: "destructive", onPress: async () => {
          setCancelling(true);
          try {
            const { data, error } = await invokeFn<{ order: unknown }>("orders-cancel", {
              workspace_id: activeWorkspaceId, order_id: detail.id, reason: "Cancelled by cashier",
            });
            if (error?.message?.includes("ORDER_IN_PREPARATION")) {
              setCancelling(false);
              if (isSelfApprover) {
                // Owner/admin/manager can override kitchen prep directly — no PIN modal needed.
                showAlert(
                  "Order Is Being Prepared",
                  "The kitchen has started this order. Cancel anyway? The restaurant absorbs the cost.",
                  [
                    { text: "Keep Order", style: "cancel" },
                    { text: "Cancel Order", style: "destructive", onPress: () => openVoidApproval() },
                  ],
                );
              } else {
                showAlert(
                  "Order In Progress",
                  "This order is already being prepared by the kitchen. A manager must approve the cancellation.",
                  [
                    { text: "Keep Order", style: "cancel" },
                    { text: "Request Manager Override", style: "destructive", onPress: () => openVoidApproval() },
                  ],
                );
              }
              return;
            }
            if (error?.message?.match(/payment|succeeded/i)) { await openVoidApproval(); return; }
            if (error) throw error;
            if (data?.order) {
              setOrders(prev => prev.map(o => o.id === detail.id ? { ...o, status: "cancelled", payment_status: "cancelled" } : o));
              setDetail(null);
            }
          } catch (e: any) { showToast({ title: "Cancel failed", message: e?.message ?? "Unknown error", type: "error" }); }
          finally { setCancelling(false); }
        },
      },
    ]);
  }

  async function collectBalance() {
    // Amount owed is balance_due for a partially-paid order, but a stuck
    // order that never settled at all (payment_status null — see
    // showCollectBalanceBtn below) has no balance_due tracked, so this falls
    // back to the full order total in that case.
    const amountOwed = Number(detail?.balance_due) > 0 ? Number(detail?.balance_due) : Number(detail?.total ?? 0);
    if (!detail || !activeWorkspaceId || !activeBranchId || !amountOwed) return;
    if (collectMethod !== "cash" && !collectRef.trim()) {
      showToast({ title: "Reference required", message: "Enter the transaction reference number.", type: "error" });
      return;
    }
    setCollecting(true);
    try {
      const refTrimmed = collectRef.trim();
      // invokeFn, not the raw supabase.functions.invoke client — the raw
      // client only ever reports "Edge Function returned a non-2xx status
      // code" and discards the real {error:{message}} body, making every
      // failure here undiagnosable regardless of the real cause.
      const { error } = await invokeFn("payments-cash-confirm", {
        workspace_id: activeWorkspaceId, branch_id: activeBranchId,
        order_id: detail.id,
        cash_received: amountOwed,
        payment_method: collectMethod,
        ...(refTrimmed ? { ref_number: refTrimmed } : {}),
      }, { "Idempotency-Key": `collectbal_${detail.id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}` });
      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === detail.id ? { ...o, status: "completed", payment_status: "paid", balance_due: 0 } : o));
      setDetail(prev => prev ? { ...prev, status: "completed", payment_status: "paid", balance_due: 0 } : prev);
      setCollectVisible(false);
      setCollectRef("");
      setCollectMethod("cash");
      showToast({ title: "Balance collected", message: "Order is now fully paid.", type: "success" });
    } catch (e: any) {
      showToast({ title: "Collection failed", message: e?.message ?? "Unknown error", type: "error" });
    } finally {
      setCollecting(false);
    }
  }

  async function openVoidApproval() {
    if (!detail || !activeWorkspaceId || !activeBranchId) return;
    const { data, error } = await invokeFn<{ approval: { id: string } }>("manager-approval-create", {
      workspace_id: activeWorkspaceId, branch_id: activeBranchId,
      action_type: "void_order", target_type: "order", target_id: detail.id,
      reason: "Cashier requested void",
    });
    if (error || !data?.approval?.id) { showToast({ title: "Error", message: error?.message ?? "Could not create approval.", type: "error" }); return; }
    const newApprovalId = data.approval.id;
    if (isSelfApprover) {
      // Manager/admin/owner can self-approve via their active session — skip the PIN modal.
      await selfVerifyAndVoid(newApprovalId);
    } else {
      setApprovalId(newApprovalId);
      setApprovalAction("void_order");
      setShowApproval(true);
    }
  }

  async function selfVerify(id: string): Promise<boolean> {
    if (!activeWorkspaceId) return false;
    // verify returns { approval: record } on success, { status:"rejected", message } on rejection
    const { data: vData, error: vErr } = await invokeFn<{
      approval: { id: string; status: string } | null;
      status?: string;
      message?: string;
    }>("manager-approval-verify",
      { workspace_id: activeWorkspaceId, approval_id: id, action: "approve" },
    );
    if (vErr) { showToast({ title: "Approval Error", message: vErr.message, type: "error" }); return false; }
    if (vData?.approval?.status === "approved") return true;
    showToast({ title: "Approval Rejected", message: vData?.message ?? "Manager approval was not granted.", type: "error" });
    return false;
  }

  async function selfVerifyAndVoid(id: string) {
    if (await selfVerify(id)) await onManagerApproved(id, "void_order");
  }

  async function selfVerifyAndCancelItem(id: string, itemId: string) {
    if (await selfVerify(id)) await onManagerApproved(id, "cancel_item", itemId);
  }

  async function executeCancelItem(itemId: string, managerApprovalId?: string) {
    if (!detail || !activeWorkspaceId) return;
    setCancellingItemId(itemId);
    try {
      const { data, error } = await invokeFn<{
        order: { total: number; subtotal: number; tax: number; status?: string; payment_status?: string | null } | null;
        order_item: unknown;
        all_cancelled: boolean;
        refund_due?: number;
      }>(
        "order-items-cancel",
        {
          workspace_id: activeWorkspaceId,
          order_id: detail.id,
          order_item_id: itemId,
          reason: "Item cancelled by staff",
          ...(managerApprovalId ? { manager_approval_id: managerApprovalId } : {}),
        },
      );
      if (error?.message?.includes("ITEM_ALREADY_SERVED")) {
        showToast({ title: "Item Already Served", message: "This item was already delivered to the customer. Use the Refund button to process a return.", type: "info" });
        return;
      }
      if (error?.message?.includes("ITEM_IN_PREPARATION")) {
        // Needs manager approval — open approval flow
        await openItemCancelApproval(itemId);
        return;
      }
      if (error) throw error;
      // Update local state
      setDetailItems(prev => prev.map(i => i.id === itemId ? { ...i, status: "cancelled" } : i));
      if (data?.order) {
        const updated = data.order;
        setDetail(prev => prev ? { ...prev, total: updated.total, subtotal: updated.subtotal, tax: updated.tax } : prev);
        setOrders(prev => prev.map(o => o.id === detail.id
          ? { ...o, total: updated.total, status: updated.status ?? o.status, payment_status: updated.payment_status ?? o.payment_status }
          : o));
        if ((data.refund_due ?? 0) > 0) {
          showToast({
            title: "Return Cash to Customer",
            message: `This item was already paid. Return ${peso(data.refund_due ?? 0)} to the customer. A refund record has been created automatically.`,
            type: "info",
          });
        }
        if (data.all_cancelled) setDetail(null);
      }
    } catch (e: any) {
      showToast({ title: "Cancel failed", message: e?.message ?? "Unknown error", type: "error" });
    } finally {
      setCancellingItemId(null);
    }
  }

  async function handleCancelItem(item: OrderItem) {
    if (!detail) return;
    showAlert(
      `Cancel ${item.products?.name ?? "item"}?`,
      "This item will be removed from the order and the total will be adjusted.",
      [
        { text: "Keep", style: "cancel" },
        { text: "Cancel Item", style: "destructive", onPress: () => executeCancelItem(item.id) },
      ],
    );
  }

  async function openItemCancelApproval(itemId: string) {
    if (!detail || !activeWorkspaceId || !activeBranchId) return;
    const { data, error } = await invokeFn<{ approval: { id: string } }>("manager-approval-create", {
      workspace_id: activeWorkspaceId, branch_id: activeBranchId,
      action_type: "void_order", target_type: "order", target_id: detail.id,
      reason: "Item cancel — kitchen is preparing",
    });
    if (error || !data?.approval?.id) { showToast({ title: "Error", message: error?.message ?? "Could not create approval.", type: "error" }); return; }
    const newApprovalId = data.approval.id;
    setApprovalItemId(itemId);
    if (isSelfApprover) {
      await selfVerifyAndCancelItem(newApprovalId, itemId);
    } else {
      setApprovalId(newApprovalId);
      setApprovalAction("cancel_item");
      setShowApproval(true);
    }
  }

  async function onManagerApproved(approvedId: string, action?: "void_order" | "cancel_item", itemId?: string) {
    setShowApproval(false);
    const effectiveAction = action ?? approvalAction;
    if (!detail || !activeWorkspaceId || !activeBranchId) return;
    if (effectiveAction === "void_order") {
      setCancelling(true);
      try {
        const { error } = await invokeFn("orders-cancel", {
          workspace_id: activeWorkspaceId, order_id: detail.id,
          reason: "Manager-approved void", manager_approval_id: approvedId,
        });
        if (error) throw error;
        setOrders(prev => prev.map(o => o.id === detail.id ? { ...o, status: "cancelled", payment_status: "cancelled" } : o));
        setDetail(null);
      } catch (e: any) { showToast({ title: "Void failed", message: e?.message ?? "Unknown error", type: "error" }); }
      finally { setCancelling(false); }
    } else if (effectiveAction === "cancel_item") {
      const targetItemId = itemId ?? approvalItemId;
      if (targetItemId) await executeCancelItem(targetItemId, approvedId);
      setApprovalItemId(null);
    }
  }

  // RefundModal runs manager-approval-create → verify → refunds-create
  // internally and only calls this once the refund has actually gone
  // through — this just reflects the result into the transactions list.
  function handleRefundSuccess(amountRefunded: number) {
    setShowRefundModal(false);
    if (detail && detailPayment && amountRefunded >= detailPayment.amount) {
      setOrders(prev => prev.map(o => o.id === detail.id ? { ...o, payment_status: "refunded" } : o));
    }
    setDetail(null);
    reloadList();
    // Toast renders inside its own <Modal> so it can stack above other
    // modals — showing it in the same tick as RefundModal's close (and, in
    // portrait, the detail Modal's close too) races Android's native Dialog
    // teardown and the toast can silently fail to appear. Deferring past
    // that transition is enough to let it show reliably.
    setTimeout(() => {
      showToast({
        title: "Refund recorded",
        message: `Return ${peso(amountRefunded)} to the customer.`,
        type: "success",
      });
    }, 300);
  }

  function onReprint() {
    // detailLoading true means detailItems/detailPayment/detailCashier are
    // either stale (leftover from a previously-opened order) or still
    // default-empty — printing from either would produce a wrong or blank
    // receipt. The button is also disabled while loading (see DetailPanel),
    // this is the defensive backstop.
    if (!detail || detailLoading) return;
    setReceiptPayload(buildReceiptPayload(detail, detailItems, detailPayment, detailCashier));
    setShowReceiptModal(true);
  }

  const showCancelBtn = !!(detail && detail.status === "pending" && detail.payment_status !== "paid");
  const showForceCancelBtn = !!(detail && detail.status === "preparing" && isSelfApprover);
  const showRefundBtn = !!(detail && detail.source === "pos" && detail.payment_status === "paid" && detailPayment);
  // Covers two distinct stuck states with the same fix: a partially-paid
  // order with real money still owed, AND an order whose payment_status is
  // still null — it was created but the settlement call that should have
  // followed never succeeded (offline non-cash orders before this was fixed,
  // or an online settlement call that failed and exhausted its retry queue).
  // Both need the exact same recovery action: collect payment now. Excludes
  // "pending_counter" (kiosk pay-at-counter) — that has its own dedicated
  // confirm flow (pos-counter-pay), not this one.
  const showCollectBalanceBtn = !!(detail && detail.status !== "cancelled" && (
    (detail.payment_status === "partially_paid" && Number(detail.balance_due) > 0)
    || detail.payment_status == null
  ));

  return {
    detail, setDetail, detailItems, detailLoading, detailPayment, detailCashier, cancelling,
    receiptPayload, showReceiptModal, setShowReceiptModal,
    approvalId, showApproval, setShowApproval, approvalAction,
    cancellingItemId,
    showRefundModal, setShowRefundModal,
    collectVisible, setCollectVisible, collectMethod, setCollectMethod, collectRef, setCollectRef, collecting,
    openDetail, handleCancelOrder, collectBalance, openVoidApproval,
    handleCancelItem, onManagerApproved, handleRefundSuccess, onReprint,
    showCancelBtn, showForceCancelBtn, showRefundBtn, showCollectBalanceBtn,
  };
}

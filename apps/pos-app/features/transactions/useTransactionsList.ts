import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { invokeFn, isNetworkError } from "../../services/supabase";
import { useToast } from "../ui/ToastProvider";
import { PAGE_SIZES } from "../constants";
import { readOfflineReceipts } from "../offline/offlineReceipts";
import type { ReceiptPayload } from "../receipt/receiptConfig";
import { guestName, rangeStart } from "./transactionsHelpers";
import type { DateFilter, Order, PaymentFilter, SourceFilter, StatusFilter } from "./types";

/** Synthetic Order row for an offline-queued order that hasn't synced to the
 *  server yet — see offlineReceipts.ts. Payment was already collected at
 *  checkout, just not confirmed server-side, so payment_status reads "paid"
 *  rather than null (which elsewhere means "settlement never succeeded"). */
function pendingOrderFromReceipt(tempId: string, p: ReceiptPayload): Order {
  return {
    id: tempId, order_no: p.orderNo, total: p.total, subtotal: p.subtotal,
    tax: p.tax, service_fee: p.serviceFee, discount: p.discount,
    status: "pending", payment_status: "paid", balance_due: 0, source: "pos",
    created_at: p.timestamp, order_type: p.orderType || null,
    table_no: p.tableNo || null, notes: null, cancel_reason: null,
    payment_methods: p.splitPayments
      ? p.splitPayments.map(sp => ({ method: sp.method, amount: sp.amount }))
      : [{ method: p.payMethod, amount: p.total }],
    pending_sync: true,
  };
}

const PAGE = PAGE_SIZES.transactionsList;

interface ListCache {
  orders: Order[];
  revenueTotal: number;
  pendingCount: number;
  cancelledCount: number;
}

export function useTransactionsList(activeWorkspaceId: string | null | undefined) {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  // Summary bar totals — computed server-side over the full filtered range,
  // not just whatever page(s) happen to be loaded client-side.
  const [revenueTotal, setRevenueTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [cancelledCount, setCancelledCount] = useState(0);
  const pageRef = useRef(0);
  const ordersLenRef = useRef(0); // mirrors orders.length without adding `orders` to load()'s deps

  const [dateFilter, setDateFilter] = useState<DateFilter>("month");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  function matchesSearch(o: Order) {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    if (o.order_no.toLowerCase().includes(q)) return true;
    if (o.notes?.toLowerCase().includes(q)) return true;
    if (guestName(o).toLowerCase().includes(q)) return true;
    const n = parseFloat(q);
    if (!isNaN(n) && Math.abs(Number(o.total) - n) < 0.01) return true;
    return false;
  }
  const filtered = useMemo(() => orders.filter(matchesSearch), [orders, searchQuery]);

  // Offline-queued orders that haven't synced yet — merged onto page 0 only,
  // and only while a status/source filter wouldn't hide a "pending POS"
  // order anyway, so they don't appear to violate whatever the cashier
  // filtered to. Re-read on every load(0) so a sync that completed in the
  // background (offlineQueue.ts) makes the entry disappear on next refresh.
  const loadPendingRows = useCallback(async (): Promise<Order[]> => {
    if (!activeWorkspaceId) return [];
    if (statusFilter !== "all" && statusFilter !== "pending") return [];
    if (sourceFilter !== "all" && sourceFilter !== "pos") return [];
    const receipts = await readOfflineReceipts(activeWorkspaceId);
    return Object.entries(receipts)
      .map(([id, p]) => pendingOrderFromReceipt(id, p))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [activeWorkspaceId, statusFilter, sourceFilter]);

  const load = useCallback(async (page = 0, replace = true) => {
    if (!activeWorkspaceId) return;
    const cacheKey = `pos_transactions_cache_v1_${activeWorkspaceId}`;
    if (page === 0) setLoading(true); else setLoadingMore(true);
    const from = page * PAGE, to = from + PAGE - 1, start = rangeStart(dateFilter);
    const params: Record<string, unknown> = { from, to };
    if (start) params.start = start;
    if (statusFilter !== "all") params.status = statusFilter;
    if (sourceFilter !== "all") params.source = sourceFilter;
    if (paymentFilter !== "all") params.payment_method = paymentFilter;
    const { data: fnData, error } = await invokeFn<{
      "transactions-list": Order[]; revenue_total?: number; pending_count?: number; cancelled_count?: number;
    }>("pos-data", {
      workspace_id: activeWorkspaceId, resource: "transactions-list", params,
    });
    // invokeFn never throws on a network failure — it resolves {data: null,
    // error}. This used to fall straight through to `fnData?.[...] ?? []`,
    // so a failed/offline fetch replaced the real, already-loaded order list
    // (and revenue/pending/cancelled totals) with EMPTY — rendering exactly
    // like "no orders match your filter," not "couldn't reach the server."
    // Bail out and keep whatever's already on screen instead.
    if (isNetworkError(error)) {
      if (page === 0) {
        const pending = await loadPendingRows();
        if (ordersLenRef.current === 0) {
          // Nothing on screen yet this session (fresh mount/navigation while
          // offline) — the "keep what's already there" guard above has
          // nothing to keep, so the screen would render "No transactions
          // found," indistinguishable from genuinely empty. Fall back to the
          // last successfully-synced snapshot instead.
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached) {
            try {
              const snap = JSON.parse(cached) as ListCache;
              setOrders([...pending, ...snap.orders]);
              ordersLenRef.current = snap.orders.length;
              setRevenueTotal(snap.revenueTotal);
              setPendingCount(snap.pendingCount);
              setCancelledCount(snap.cancelledCount);
            } catch { /* corrupt cache */ }
          } else if (pending.length > 0) {
            // No server snapshot at all yet, but there's at least something
            // real to show instead of "No transactions found."
            setOrders(pending);
          }
        } else if (pending.length > 0) {
          // Something's already on screen (kept as-is per the comment
          // above) — still refresh just the pending-sync rows at the top,
          // in case one finished syncing in the background since last load.
          setOrders(prev => [...pending, ...prev.filter(o => !o.pending_sync)]);
        }
        showToast({ title: "Couldn't refresh", message: "No connection — showing the last synced orders.", type: "error" });
      }
      if (page === 0) setLoading(false); else setLoadingMore(false);
      return;
    }
    const rows = fnData?.["transactions-list"] ?? [];
    if (page === 0) {
      const pending = await loadPendingRows();
      setOrders([...pending, ...rows]);
    } else {
      setOrders(prev => [...prev, ...rows]);
    }
    ordersLenRef.current = replace ? rows.length : ordersLenRef.current + rows.length;
    setHasMore(rows.length === PAGE);
    if (page === 0) {
      const revenueTotal = fnData?.revenue_total ?? 0;
      const pendingCount = fnData?.pending_count ?? 0;
      const cancelledCount = fnData?.cancelled_count ?? 0;
      setRevenueTotal(revenueTotal);
      setPendingCount(pendingCount);
      setCancelledCount(cancelledCount);
      const snap: ListCache = { orders: rows, revenueTotal, pendingCount, cancelledCount };
      AsyncStorage.setItem(cacheKey, JSON.stringify(snap)).catch(() => {});
    }
    pageRef.current = page;
    if (page === 0) setLoading(false); else setLoadingMore(false);
  }, [activeWorkspaceId, dateFilter, statusFilter, sourceFilter, paymentFilter, showToast, loadPendingRows]);

  useEffect(() => { load(0, true); }, [load]);

  function loadMore() { if (!hasMore || loadingMore) return; load(pageRef.current + 1, false); }

  return {
    orders, setOrders, loading, loadingMore, hasMore,
    revenueTotal, pendingCount, cancelledCount,
    dateFilter, setDateFilter, statusFilter, setStatusFilter,
    sourceFilter, setSourceFilter, paymentFilter, setPaymentFilter,
    searchQuery, setSearchQuery, filtered, load, loadMore,
  };
}

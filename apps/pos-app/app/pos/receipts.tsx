/**
 * Receipts Reprint Screen — Order History with Receipt Modal
 * Shows recent 100 orders with pagination; tap to reprint receipt via ESC/POS
 */
import {
  View, Text, Pressable, FlatList, StyleSheet, ActivityIndicator,
  Platform, ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { invokeFn, isNetworkError } from "../../services/supabase";
import { CachedDataBanner } from "../../features/offline/CachedDataBanner";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { useAuth } from "../../features/auth/AuthContext";
import { useTheme } from "../../features/theme/ThemeContext";
import { ReceiptPayload } from "../../features/receipt/receiptConfig";
import { ReceiptModal } from "../../features/receipt/ReceiptModal";
import { buildReceiptPayloadFromOrder } from "../../features/receipt/buildReceiptPayloadFromOrder";
import { useToast } from "../../features/ui/ToastProvider";
import { PAGE_SIZES } from "../../features/constants";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
const peso = (n: number) => `₱${Number(n).toFixed(2)}`;
const PAGE_SIZE = PAGE_SIZES.receiptsOrdersList;

/* ── Types ─────────────────────────────────────────────────────── */
interface Order {
  id: string;
  order_no: string;
  total: number;
  subtotal: number;
  tax: number;
  tax_rate_pct: number;
  service_fee: number;
  service_rate_pct: number;
  discount: number;
  is_senior_pwd?: boolean;
  discount_source?: "manual" | "senior_pwd" | "loyalty" | "voucher" | "mixed" | null;
  voucher_code?: string | null;
  cashier_name?: string | null;
  status: string;
  created_at: string;
  order_type: string | null;
  table_no: string | null;
  customer_name: string | null;
  internal_note: string | null;
  serve_location: string | null;
  payment_method: string | null;
  payment_methods?: { method: string; amount: number }[];
  ref_number: string | null;
  cash_amount: number | null;
  change_amount: number | null;
}

interface OrderItem {
  id: string;
  quantity: number;
  unit_price: number;
  notes: string | null;
  products: { name: string; sku?: string | null; prep_station?: string | null } | null;
  addons?: { name: string; price: number; qty: number }[];
}

interface OrderBooking {
  id: string;
  total: number;
  resource_name: string;
}

const MAX_CACHED_RECEIPT_DETAILS = 100;

/** Persists one order's items/bookings into the per-workspace detail cache
 *  used by openReceipt's offline fallback above — capped so a device that's
 *  been used for months doesn't grow this AsyncStorage entry unbounded. */
async function persistDetailCacheEntry(
  workspaceId: string,
  orderId: string,
  entry: { items: OrderItem[]; bookings: OrderBooking[] },
): Promise<void> {
  const key = `pos_receipts_detail_cache_v1_${workspaceId}`;
  let all: Record<string, { items: OrderItem[]; bookings: OrderBooking[]; cachedAt: number }> = {};
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) all = JSON.parse(raw);
  } catch { /* corrupt cache — start fresh */ }
  all[orderId] = { ...entry, cachedAt: Date.now() };
  const ids = Object.keys(all);
  if (ids.length > MAX_CACHED_RECEIPT_DETAILS) {
    ids.sort((a, b) => all[a].cachedAt - all[b].cachedAt);
    for (const id of ids.slice(0, ids.length - MAX_CACHED_RECEIPT_DETAILS)) delete all[id];
  }
  await AsyncStorage.setItem(key, JSON.stringify(all));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

type C = ReturnType<typeof useTheme>["C"];

/* ── Main ───────────────────────────────────────────────────────── */
export default function ReceiptsScreen() {
  const { activeWorkspaceId, memberships } = useAuth();
  const { C } = useTheme();
  const { showToast } = useToast();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);
  const ordersLenRef = useRef(0); // mirrors orders.length without adding `orders` to load()'s deps

  // Receipt modal state
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [receiptPayload, setReceiptPayload] = useState<ReceiptPayload | null>(null);
  // Cache for order details to avoid refetching
  const detailCache = useRef<Record<string, { items: OrderItem[]; bookings: OrderBooking[] }>>({});

  const storeName = memberships.find((m) => m.workspace_id === activeWorkspaceId)?.workspace_name ?? "POS";

  /* Load page of orders */
  const load = useCallback(async (page = 0, replace = true) => {
    if (!activeWorkspaceId) return;
    const cacheKey = `pos_receipts_cache_v1_${activeWorkspaceId}`;
    if (page === 0) setLoading(true); else setLoadingMore(true);

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data: fnData, error } = await invokeFn<{ "receipts-orders-list": Order[] }>("pos-data", {
      workspace_id: activeWorkspaceId,
      resource: "receipts-orders-list",
      params: { from, to },
    });

    // A failed/offline fetch used to fall through to `fnData?.[...] ?? []`,
    // replacing the real order list with EMPTY — "No orders found," not
    // "couldn't reach the server." On first load this session, fall back to
    // the last successfully-synced snapshot instead of an empty screen.
    if (isNetworkError(error)) {
      if (page === 0 && ordersLenRef.current === 0) {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          try {
            const rows = JSON.parse(cached) as Order[];
            setOrders(rows);
            ordersLenRef.current = rows.length;
          } catch { /* corrupt cache */ }
        }
      }
      if (page === 0) showToast({ title: "Couldn't refresh", message: "No connection — showing the last synced orders.", type: "error" });
      if (page === 0) setLoading(false); else setLoadingMore(false);
      return;
    }

    const rows = fnData?.["receipts-orders-list"] ?? [];
    setOrders(prev => replace ? rows : [...prev, ...rows]);
    ordersLenRef.current = replace ? rows.length : ordersLenRef.current + rows.length;
    setHasMore(rows.length === PAGE_SIZE);
    pageRef.current = page;
    if (page === 0) AsyncStorage.setItem(cacheKey, JSON.stringify(rows)).catch(() => {});

    if (page === 0) setLoading(false); else setLoadingMore(false);
  }, [activeWorkspaceId, showToast]);

  useEffect(() => {
    load(0, true);
  }, [load]);

  function loadMore() {
    if (!hasMore || loadingMore) return;
    load(pageRef.current + 1, false);
  }

  /* Open receipt modal for a given order */
  async function openReceipt(order: Order) {
    // Try the in-memory cache first (this session), then the persisted one
    // (survives app restart — without this, an order viewed online in a
    // previous session became unreprintable the moment the app relaunched
    // offline, even though it had been fetched successfully before).
    if (detailCache.current[order.id]) {
      const cached = detailCache.current[order.id];
      const payload = buildReceiptPayload(order, cached.items, cached.bookings);
      setReceiptPayload(payload);
      setReceiptVisible(true);
      return;
    }
    if (!activeWorkspaceId) return;
    const detailCacheKey = `pos_receipts_detail_cache_v1_${activeWorkspaceId}`;
    const persisted = await AsyncStorage.getItem(detailCacheKey);
    if (persisted) {
      try {
        const all = JSON.parse(persisted) as Record<string, { items: OrderItem[]; bookings: OrderBooking[] }>;
        if (all[order.id]) {
          detailCache.current[order.id] = all[order.id];
          const payload = buildReceiptPayload(order, all[order.id].items, all[order.id].bookings);
          setReceiptPayload(payload);
          setReceiptVisible(true);
          return;
        }
      } catch { /* corrupt cache — fall through to a live fetch */ }
    }

    // Fetch items and bookings
    const [itemsRes, bookingsRes] = await Promise.all([
      invokeFn<{ "receipts-order-items": OrderItem[] }>("pos-data", {
        workspace_id: activeWorkspaceId,
        resource: "receipts-order-items",
        params: { order_id: order.id },
      }),
      invokeFn<{ "receipts-order-bookings": OrderBooking[] }>("pos-data", {
        workspace_id: activeWorkspaceId,
        resource: "receipts-order-bookings",
        params: { order_id: order.id },
      }),
    ]);

    // Unlike the cache-hit path above, a failed fetch used to fall through
    // to `?? []` regardless of cause — silently building and printing a
    // receipt with NO items/bookings instead of failing loudly. This order
    // was never viewed while online, so (unlike Order History's detail
    // cache) there's nothing to fall back to — just refuse to print garbage.
    if (isNetworkError(itemsRes.error) || isNetworkError(bookingsRes.error)) {
      showToast({ title: "Couldn't load order", message: "No connection — this order was never viewed while online, so it can't be reprinted yet.", type: "error" });
      return;
    }

    const items = itemsRes.data?.["receipts-order-items"] ?? [];
    const bookings = bookingsRes.data?.["receipts-order-bookings"] ?? [];

    detailCache.current[order.id] = { items, bookings };
    persistDetailCacheEntry(activeWorkspaceId, order.id, { items, bookings }).catch(() => {});

    const payload = buildReceiptPayload(order, items, bookings);
    setReceiptPayload(payload);
    setReceiptVisible(true);
  }

  function buildReceiptPayload(
    order: Order,
    items: OrderItem[],
    bookings: OrderBooking[],
  ): ReceiptPayload {
    return buildReceiptPayloadFromOrder({
      orderId: order.id,
      orderNo: order.order_no,
      items: items.map(i => ({
        name: i.products?.name ?? "—",
        sku: i.products?.sku ?? null,
        qty: i.quantity,
        price: Number(i.unit_price),
        notes: i.notes,
        prep_station: i.products?.prep_station ?? null,
        addons: i.addons,
      })),
      bookings: bookings.map(b => ({
        name: b.resource_name,
        total: Number(b.total),
      })),
      subtotal: Number(order.subtotal),
      tax: Number(order.tax),
      // Backend returns these as whole percentages (5 meaning 5%), not
      // fractions — printReceiptImin.ts multiplies by 100 again for display
      // (0.05 -> "5%"), so passing the raw percentage through unconverted
      // printed "500%" instead of "5%".
      taxRatePct: Number(order.tax_rate_pct) / 100,
      serviceFee: Number(order.service_fee),
      svcRatePct: Number(order.service_rate_pct) / 100,
      discount: Number(order.discount),
      total: Number(order.total),
      isSeniorPwd: order.is_senior_pwd,
      discountSource: order.discount_source,
      voucherCode: order.voucher_code,
      cashAmt: Number(order.cash_amount ?? 0),
      change: Number(order.change_amount ?? 0),
      payMethod: order.payment_method ?? "other",
      paymentMethods: order.payment_methods,
      refNumber: order.ref_number ?? "",
      orderType: order.order_type ?? "dine_in",
      tableNo: order.table_no ?? "",
      customerName: order.customer_name ?? "",
      internalNote: order.internal_note ?? undefined,
      floor: order.serve_location ?? undefined,
      cashierName: order.cashier_name,
      timestamp: order.created_at,
    });
  }

  if (loading) {
    return (
      <View style={s.container}>
        <PosScreenHeader title="Receipt Reprint" />
        <CachedDataBanner />
        <View style={s.centered}>
          <ActivityIndicator size="large" color={C.amber} />
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <PosScreenHeader title="Receipt Reprint" />
      <CachedDataBanner />

      {orders.length === 0 ? (
        <View style={s.empty}>
          <Feather name="inbox" size={48} color={C.ink4} />
          <Text style={s.emptyText}>No orders found</Text>
        </View>
      ) : (
          <FlatList
            data={orders}
            keyExtractor={o => o.id}
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            renderItem={({ item: order }) => (
              <Pressable
                style={s.orderRow}
                onPress={() => openReceipt(order)}
              >
                <View style={s.rowContent}>
                  <View style={s.rowHeader}>
                    <Text style={s.orderNo}>{order.order_no}</Text>
                    <Text style={s.orderTime}>{fmtDate(order.created_at)}</Text>
                  </View>

                  <View style={s.rowMeta}>
                    {order.customer_name && (
                      <Text style={s.metaText}>
                        {order.customer_name}
                      </Text>
                    )}
                    {order.table_no && (
                      <Text style={s.metaText}>
                        Table {order.table_no}
                      </Text>
                    )}
                    <Text style={s.metaText}>
                      {order.order_type?.replaceAll("_", " ").toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={s.rowRight}>
                  <Text style={s.orderTotal}>{peso(order.total)}</Text>
                  <View style={[s.statusBadge, s[`status_${order.status}` as keyof typeof s] as ViewStyle | undefined]}>
                    <Text style={s.statusText}>{order.status.toUpperCase()}</Text>
                  </View>
                </View>
              </Pressable>
            )}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loadingMore ? (
                <View style={s.footer}>
                  <ActivityIndicator size="small" color={C.amber} />
                </View>
              ) : hasMore ? (
                <Pressable style={s.loadMoreBtn} onPress={loadMore}>
                  <Text style={s.loadMoreText}>Load More</Text>
                </Pressable>
              ) : (
                <Text style={s.endText}>No more orders</Text>
              )
            }
            scrollEnabled
          />
      )}

      {/* Receipt Modal with Reprint button — no custom onReprint here, so it
          falls back to ReceiptModal's own handlePrint, same as every other
          reprint entry point (Order History, Reports). That respects the
          actual configured printer (paper width/copies/mode), includes the
          expo-print fallback for non-ESC/POS devices, and bundles kitchen/
          drinks tickets + labels — none of which this screen's old bespoke
          reprint (hardcoded 80mm/1 copy/simple mode, raw printRaw only) did. */}
      <ReceiptModal
        visible={receiptVisible}
        payload={receiptPayload}
        storeName={storeName}
        onClose={() => setReceiptVisible(false)}
        isReprint={true}
      />
    </View>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: C.ink4,
  },
  orderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  rowContent: {
    flex: 1,
    gap: 8,
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  orderNo: {
    fontFamily: MONO,
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
  },
  orderTime: {
    fontFamily: MONO,
    fontSize: 12,
    color: C.ink3,
  },
  rowMeta: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  metaText: {
    fontSize: 12,
    color: C.ink3,
  },
  rowRight: {
    alignItems: "flex-end",
    gap: 6,
    marginLeft: 12,
  },
  orderTotal: {
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: "700",
    color: C.ink,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
  },
  status_completed: {
    backgroundColor: "#d4edda",
  },
  status_pending: {
    backgroundColor: "#fff3cd",
  },
  status_cancelled: {
    backgroundColor: "#f8d7da",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
    color: C.ink,
  },
  footer: {
    paddingVertical: 20,
    alignItems: "center",
  },
  loadMoreBtn: {
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: C.amber,
    alignItems: "center",
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: "600",
    color: C.amber,
  },
  endText: {
    textAlign: "center",
    fontSize: 12,
    color: C.ink3,
    paddingVertical: 20,
  },
});

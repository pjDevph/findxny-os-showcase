/**
 * Order-screen helper logic: product/config/resource loading, ticket lookup,
 * booking assembly, offline submission and payment-display resolution.
 *
 * Extracted from app/pos/order.tsx. These are plain functions that take their
 * dependencies (state setters, dispatch, config) as explicit parameters — no
 * React hooks — so the screen stays a thin composition layer.
 */
import React, { type Dispatch } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { invokeFn, isNetworkError, supabase } from "../../services/supabase";
import { PAGE_SIZES } from "../constants";
import { getIsConnected } from "../offline/networkStatus";
import { enqueueOrder, enqueuePaymentRetry, flushQueue, type OfflineOrderExtras } from "../offline/offlineQueue";
import { cacheOfflineReceipt } from "../offline/offlineReceipts";
import {
  loadPaymentConfig, type PaymentConfig, EMPTY_PAYMENT_CONFIG,
  paymentConfigFromWorkspace, savePaymentConfig,
} from "../payments/paymentConfig";
import { type ReceiptPayload, receiptConfigFromWorkspace, saveReceiptConfig } from "../receipt/receiptConfig";
import { nowHour } from "./dateHelpers";
import type { CartAction } from "./cartReducer";
import type {
  Product, Resource, Cart, CartItem, BookingCartItem, TicketResult,
  Tab, PayMethod, OrderType,
  ApiProductRow, ApiWorkspaceConfig, ApiResourceRow, ApiTicketOrder, ApiTicketItem,
} from "./types";

const FULL_SYNC_THROTTLE_MS = 5 * 60_000; // don't re-fetch the whole catalog more than once per 5 min

async function fetchProductPageRaw(activeWorkspaceId: string, page: number): Promise<Product[]> {
  const from = page * PAGE_SIZES.orderProductList, to = from + PAGE_SIZES.orderProductList - 1;
  const { data, error } = await invokeFn<{ "order-product-list"?: ApiProductRow[] | null }>("pos-data", {
    workspace_id: activeWorkspaceId,
    resource: "order-product-list",
    params: { from, to },
  });
  // Discarding `error` here used to make ANY failure (network drop, or a
  // real backend query error now that pos-data surfaces one instead of
  // silently returning []) look identical to "this workspace has no
  // products" — an empty grid with the category chips still showing real
  // counts (those come from a separate, simpler query). Throw so
  // loadAllProducts' try/catch below actually has something to catch.
  if (error) throw error;
  const prods: ApiProductRow[] = data?.["order-product-list"] ?? [];
  return prods.map(p => ({
    id: p.id, name: p.name, price: Number(p.price), sku: p.sku ?? null,
    category: p.product_categories?.name ?? "Other",
    image_url: p.image_url ?? null,
    stock_status: p.stock_status ?? "not_tracked",
    available_quantity: p.available_quantity ?? null,
    is_pinned: p.is_pinned ?? false,
    prep_station: p.prep_station ?? null,
    addon_groups: p.addon_groups ?? [],
    active: p.active ?? true,
    description: p.description ?? null,
  }));
}

/** Loads the entire product catalog into `products` state up front, instead
 *  of one 30-row page at a time. The product-list endpoint orders rows
 *  alphabetically by name, not by category, so a single page rarely covers a
 *  whole category — switching category tabs against a partially-loaded list
 *  showed a near-empty grid, which triggered another page fetch (and its
 *  loading spinner) on almost every tab switch. The full catalog here is
 *  small (a few dozen to a few hundred rows), so fetching it all — in
 *  concurrent batches to keep round trips low — and filtering by category
 *  client-side is cheap and makes category switching instant.
 *
 *  Also serves as the offline-cache writer: the full result is cached to
 *  AsyncStorage under `cacheKey`, so `getOfflineProducts` below always has
 *  the complete catalog available rather than just whatever page happened to
 *  be loaded when connectivity dropped. */
export async function loadAllProducts(
  activeWorkspaceId: string,
  setters: {
    setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
    /** Surfaces a genuine fetch failure (not a network blip — invokeFn's
     *  own isNetworkError already has a separate, silent stale-cache path
     *  elsewhere; this is for "reached the server and it failed") so it
     *  doesn't look identical to an empty catalog. Optional so existing
     *  call sites without a toast handler still compile. */
    onLoadError?: (message: string) => void;
  },
  opts: { force?: boolean } = {},
): Promise<void> {
  const cacheKey = `pos_products_v2_${activeWorkspaceId}`;
  const syncedAtKey = `${cacheKey}_syncedAt`;

  if (!getIsConnected()) {
    await getOfflineProducts(cacheKey, setters);
    return;
  }

  // Stale-while-revalidate: paint instantly from whatever's cached (even
  // while online) instead of a blank grid during the live fetch below — the
  // live fetch still runs and reconciles state once it lands.
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) setters.setProducts(JSON.parse(cached) as Product[]);
  } catch { /* corrupt cache — ignore, live fetch below still runs */ }

  // Re-mounting the Order screen (navigate away and back, switch tabs, etc.)
  // shouldn't re-fetch the whole catalog every time — the cache paint above
  // is current enough unless the cashier explicitly pulls to refresh.
  if (!opts.force) {
    const lastSynced = Number(await AsyncStorage.getItem(syncedAtKey));
    if (lastSynced && Date.now() - lastSynced < FULL_SYNC_THROTTLE_MS) return;
  }

  try {
    const MAX_PAGES = 50; // safety cap (~1500 products) against a runaway loop
    const BATCH_SIZE = 5;
    const all: Product[] = [];
    for (let batchStart = 0; batchStart < MAX_PAGES; batchStart += BATCH_SIZE) {
      const pages = Array.from({ length: BATCH_SIZE }, (_, i) => batchStart + i);
      const results = await Promise.all(pages.map(page => fetchProductPageRaw(activeWorkspaceId, page)));
      let hitShortPage = false;
      for (const rows of results) {
        all.push(...rows);
        if (rows.length < PAGE_SIZES.orderProductList) { hitShortPage = true; break; }
      }
      if (hitShortPage) break;
    }
    setters.setProducts(all);
    AsyncStorage.setItem(cacheKey, JSON.stringify(all)).catch(() => {});
    AsyncStorage.setItem(syncedAtKey, String(Date.now())).catch(() => {});
  } catch (e: any) {
    // A dropped connection falls through silently to the stale-cache paint
    // above by design (matches every other offline fallback this session).
    // A genuine backend error (bad query, RLS, etc.) reaching this catch is
    // NOT that — it's real and fixable, and was previously indistinguishable
    // from "this workspace has zero products."
    if (!isNetworkError(e)) setters.onLoadError?.(e?.message ?? "Could not load products.");
  }
}

async function getOfflineProducts(
  cacheKey: string,
  setters: { setProducts: React.Dispatch<React.SetStateAction<Product[]>> },
) {
  const cached = await AsyncStorage.getItem(cacheKey);
  if (cached) {
    try { setters.setProducts(JSON.parse(cached) as Product[]); } catch { /* corrupt */ }
  }
}

/* ── Workspace-config loading helper ── */
export async function loadWorkspaceConfig(
  activeWorkspaceId: string,
  setters: {
    setWorkspaceName: (v: string) => void;
    setTaxRatePct: (v: number) => void;
    setSvcRatePct: (v: number) => void;
    setApplyTax: (v: boolean) => void;
    setApplySvc: (v: boolean) => void;
  },
) {
  const { data: wsData } = await invokeFn<{ "order-workspace-config"?: ApiWorkspaceConfig | null }>("pos-data", { workspace_id: activeWorkspaceId, resource: "order-workspace-config", params: {} });
  const ws = wsData?.["order-workspace-config"] ?? null;
  if (ws) {
    setters.setWorkspaceName(ws.name ?? "");
    // `?? ` (not `||`) so a genuinely-configured 0% rate (service charge or
    // VAT intentionally disabled) stays 0 — `rate || fallback` was silently
    // substituting the hardcoded default whenever the real rate was 0.
    const taxRate = Number(ws.tax_rate ?? 0.12);
    const svcRate = Number(ws.service_rate ?? 0);
    setters.setTaxRatePct(taxRate);
    setters.setSvcRatePct(svcRate);
    setters.setApplyTax(taxRate > 0);
    setters.setApplySvc(svcRate > 0);
    saveReceiptConfig(receiptConfigFromWorkspace(ws)).catch(() => {});
    savePaymentConfig(paymentConfigFromWorkspace(ws)).catch(() => {});
  }
}

/* ── Bookable-resources loading helper — lazy-loaded on first Rooms/Amenities tab open ── */
export async function loadBookableResources(
  activeWorkspaceId: string,
  setters: { setResources: (v: Resource[]) => void },
) {
  const { data: resData } = await invokeFn<{ "order-bookable-resources"?: ApiResourceRow[] | null }>("pos-data", { workspace_id: activeWorkspaceId, resource: "order-bookable-resources", params: {} });
  const res: ApiResourceRow[] = resData?.["order-bookable-resources"] ?? [];
  setters.setResources(res.map((r) => ({
    id: r.id, name: r.name, type: r.type as "room" | "amenity",
    capacity: r.capacity ? Number(r.capacity) : null,
    hourly_rate: Number(r.hourly_rate),
    nightly_rate: r.nightly_rate != null ? Number(r.nightly_rate) : null,
    branch_id: r.branch_id ?? null,
  })));
}

/* ── Ticket-lookup helpers ── */
export async function runLookupTicket(
  ticketQuery: string,
  activeWorkspaceId: string | null,
  setters: {
    setTicketLoading: (v: boolean) => void;
    setTicketErr: (v: string | null) => void;
    setTicketResult: (v: TicketResult | null) => void;
  },
) {
  const q = ticketQuery.trim().toUpperCase();
  if (!q || !activeWorkspaceId) return;
  setters.setTicketLoading(true);
  setters.setTicketErr(null);
  setters.setTicketResult(null);
  try {
    const { data: lookupData, error: oErr } = await invokeFn<{ "order-ticket-lookup"?: ApiTicketOrder | null }>("pos-data", {
      workspace_id: activeWorkspaceId,
      resource: "order-ticket-lookup",
      params: { q },
    });
    if (oErr) throw oErr;
    const order = lookupData?.["order-ticket-lookup"] ?? null;
    if (!order) { setters.setTicketErr("Order not found — check the number and try again."); return; }

    const { data: itemsData, error: iErr } = await invokeFn<{ "order-ticket-items"?: ApiTicketItem[] | null }>("pos-data", {
      workspace_id: activeWorkspaceId,
      resource: "order-ticket-items",
      params: { order_id: order.id },
    });
    if (iErr) throw iErr;
    const items: ApiTicketItem[] = itemsData?.["order-ticket-items"] ?? [];

    const mapped = items
      .filter(it => it.products?.id)
      .map(it => ({
        productId: it.products!.id,
        name:      it.products!.name,
        price:     Number(it.unit_price),
        qty:       it.quantity,
        notes:     it.notes,
      }));

    if (mapped.length === 0) { setters.setTicketErr("No product items found on this order."); return; }
    setters.setTicketResult({ orderId: order.id, orderNo: order.order_no, tableNo: order.table_no, items: mapped });
  } catch (e: any) {
    setters.setTicketErr(e?.message ?? "Lookup failed");
  } finally {
    setters.setTicketLoading(false);
  }
}

export function runAddTicketToCart(
  ticketResult: TicketResult | null,
  currentTableNo: string,
  dispatch: Dispatch<CartAction>,
  setters: {
    setLoadTicketVisible: (v: boolean) => void;
    setTicketQuery: (v: string) => void;
    setTicketResult: (v: TicketResult | null) => void;
    setTicketErr: (v: string | null) => void;
    showToast: (msg: string) => void;
  },
) {
  if (!ticketResult) return;
  if (ticketResult.tableNo && !currentTableNo) {
    dispatch({ type: "SET_TABLE", tableNo: ticketResult.tableNo });
  }
  const cartItems: CartItem[] = ticketResult.items.map(it => ({
    product: { id: it.productId, name: it.name, price: it.price, category: "Other", image_url: null },
    qty: it.qty,
    notes: it.notes ?? "",
  }));
  dispatch({ type: "LOAD_ITEMS", items: cartItems });
  setters.setLoadTicketVisible(false);
  setters.setTicketQuery("");
  setters.setTicketResult(null);
  setters.setTicketErr(null);
  setters.showToast(`Loaded ${cartItems.length} item(s) from #${ticketResult.orderNo}`);
}

/* ── Booking form helpers ── */
export function applySelectResource(
  r: Resource,
  selRes: Resource | null,
  customerName: string,
  setters: {
    setSelRes: (v: Resource | null) => void;
    setBCheckIn: (v: string) => void;
    setBCheckOut: (v: string) => void;
    setBStartTime: (v: string) => void;
    setBEndTime: (v: string) => void;
    setBGuest: (v: string) => void;
    setCalendarOpen: (v: boolean) => void;
  },
) {
  if (selRes?.id === r.id) { setters.setCalendarOpen(true); return; }
  setters.setSelRes(r);
  setters.setBCheckIn("");
  setters.setBCheckOut("");
  const startH = r.type === "room" ? "14:00" : nowHour();
  setters.setBStartTime(startH);
  setters.setBEndTime(r.type === "room" ? "11:00" : `${String((parseInt(startH) + 1) % 24).padStart(2, "0")}:00`);
  setters.setBGuest(customerName);
  setters.setCalendarOpen(true);
}

export function applyCalendarConfirm(
  checkIn: string,
  checkOut: string,
  selRes: Resource | null,
  setters: {
    setBCheckIn: (v: string) => void;
    setBCheckOut: (v: string) => void;
    setCalendarOpen: (v: boolean) => void;
    setTimePickerOpen: (v: boolean) => void;
    setShowBookingModal: (v: boolean) => void;
  },
) {
  setters.setBCheckIn(checkIn);
  setters.setBCheckOut(checkOut);
  setters.setCalendarOpen(false);
  if (selRes?.type === "amenity") setters.setTimePickerOpen(true);
  else setters.setShowBookingModal(true);
}

export function applyAddBooking(params: {
  selRes: Resource | null;
  bCanAdd: boolean;
  bStartISO: string;
  bEndISO: string;
  bCheckIn: string;
  bCheckOut: string;
  bGuest: string;
  bPhone: string;
  bEmail: string;
  bNotes: string;
  bFormTotal: number;
  dispatch: Dispatch<CartAction>;
  setShowBookingModal: (v: boolean) => void;
  setSelRes: (v: Resource | null) => void;
  setBCheckIn: (v: string) => void;
  setBCheckOut: (v: string) => void;
  setBNotes: (v: string) => void;
  setBPhone: (v: string) => void;
  setBEmail: (v: string) => void;
  showToast: (msg: string) => void;
}) {
  const { selRes, bCanAdd, bStartISO, bEndISO, bCheckIn, bCheckOut, bGuest, bPhone, bEmail, bNotes, bFormTotal, dispatch, showToast } = params;
  if (!selRes || !bCanAdd) return;
  params.setShowBookingModal(false);
  dispatch({
    type: "ADD_BOOKING",
    booking: {
      tempId: `${selRes.id}-${Date.now()}`,
      type: selRes.type,
      resourceId: selRes.id,
      resourceName: selRes.name,
      startISO: bStartISO,
      endISO: bEndISO,
      guestName: bGuest,
      guestPhone: bPhone,
      guestEmail: bEmail,
      notes: bNotes,
      hourlyRate: selRes.hourly_rate,
      branchId: selRes.branch_id,
      total: bFormTotal,
    },
  });
  params.setSelRes(null);
  params.setBCheckIn("");
  params.setBCheckOut("");
  params.setBNotes("");
  params.setBPhone("");
  params.setBEmail("");
  showToast(`${selRes.name} added to cart`);
}

export function applyHandleSuccess(
  dispatch: Dispatch<CartAction>,
  setters: {
    setShowReceipt: (v: boolean) => void;
    setSuccessOrder: (v: ReceiptPayload | null) => void;
    setCashInput: (v: string) => void;
    setPayMethod: (v: PayMethod) => void;
    setRefNumber: (v: string) => void;
    setSelRes: (v: Resource | null) => void;
    setBCheckIn: (v: string) => void;
    setBCheckOut: (v: string) => void;
    setActiveTab: (v: Tab) => void;
    setPayPartial: (v: boolean) => void;
    setPartialAmtInput: (v: string) => void;
    setPayUnpaid: (v: boolean) => void;
  },
) {
  setters.setShowReceipt(false);
  setters.setSuccessOrder(null);
  dispatch({ type: "CLEAR" });
  setters.setCashInput("");
  setters.setPayMethod("cash");
  setters.setRefNumber("");
  setters.setSelRes(null);
  setters.setBCheckIn("");
  setters.setBCheckOut("");
  setters.setActiveTab("products");
  setters.setPayPartial(false);
  setters.setPartialAmtInput("");
  setters.setPayUnpaid(false);
}

/* ── submitOrder helpers ── */

/** Idempotency-Key for a payments-cash-confirm call — dedupes retries of the
 *  exact same request without blocking a legitimate follow-up charge against
 *  the same order (a second split leg, or collecting a remaining balance). */
export function makeIdemKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildOrderNotes(customerName: string, refNumber: string, internalNote?: string): string | undefined {
  const parts = [
    customerName ? `Guest: ${customerName}` : null,
    refNumber.trim() ? `Ref: ${refNumber.trim()}` : null,
    internalNote?.trim() ? `Note: ${internalNote.trim()}` : null,
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(" | ") : undefined;
}

export function parseNotes(raw: string | null): { guestName: string; guestPhone: string; guestEmail: string; noteText: string } {
  if (!raw) return { guestName: "", guestPhone: "", guestEmail: "", noteText: "" };
  const parts = raw.split(" · ");
  const guestName = parts[0] ?? "";
  let guestPhone = "";
  let guestEmail = "";
  let idx = 1;
  if (parts[idx] && (parts[idx].startsWith("+") || parts[idx].startsWith("09") || /^\d{7,}$/.test(parts[idx]))) {
    guestPhone = parts[idx++];
  }
  if (parts[idx] && parts[idx].includes("@")) {
    guestEmail = parts[idx++];
  }
  return { guestName, guestPhone, guestEmail, noteText: parts.slice(idx).join(" · ") };
}

export async function confirmBookings(
  bookings: BookingCartItem[],
  orderId: string,
  workspaceId: string | null,
  fallbackBranchId: string,
): Promise<{ conflictNames: string[]; failedNames: string[]; confirmed: Array<{ cartItem: BookingCartItem; bookingId: string }> }> {
  const conflictNames: string[] = [];
  // Anything that isn't a double-booking conflict but still didn't end up
  // confirmed — a hold error other than "already booked", or bookings-confirm
  // itself failing after a successful hold. Previously these were silently
  // dropped: the booking never made it into `confirmed`, but the cashier and
  // customer saw an ordinary "checkout succeeded" screen with no indication
  // that specific booking was never actually confirmed.
  const failedNames: string[] = [];
  const confirmed: Array<{ cartItem: BookingCartItem; bookingId: string }> = [];
  for (const b of bookings) {
    try {
      if (b.existingBookingId) {
        // Already confirmed — just link to the new order (no hold needed)
        const { error } = await invokeFn("bookings-confirm", {
          workspace_id: workspaceId,
          booking_id:   b.existingBookingId,
          order_id:     orderId,
        });
        if (error) { failedNames.push(b.resourceName); continue; }
        confirmed.push({ cartItem: b, bookingId: b.existingBookingId });
        continue;
      }
      const { data: holdData, error: holdErr } = await invokeFn<{ booking: { id: string } }>("bookings-hold", {
        workspace_id: workspaceId,
        branch_id:    b.branchId ?? fallbackBranchId,
        resource_id:  b.resourceId,
        start_time:   b.startISO,
        end_time:     b.endISO,
        notes:        [b.guestName, b.guestPhone, b.guestEmail, b.notes].filter(Boolean).join(" · "),
        // bookings-hold already supports body-level dedup via idempotency_key
        // (routed into the same Idempotency-Key mechanism as every other
        // money/state-mutating endpoint) — the client just never sent one, so
        // a double-tap or network retry could create two holds for the same
        // slot from the same checkout attempt.
        idempotency_key: makeIdemKey(`bkhold_${b.resourceId}`),
      });
      if (holdErr) {
        const msg = holdErr.message?.toLowerCase() ?? "";
        if (msg.includes("already booked") || msg.includes("conflict")) {
          conflictNames.push(b.resourceName);
        } else {
          failedNames.push(b.resourceName);
        }
        continue;
      }
      if (!holdData?.booking?.id) { failedNames.push(b.resourceName); continue; }
      const { error: confirmErr } = await invokeFn("bookings-confirm", {
        workspace_id: workspaceId,
        booking_id:   holdData.booking.id,
        order_id:     orderId,
      });
      if (confirmErr) { failedNames.push(b.resourceName); continue; }
      confirmed.push({ cartItem: b, bookingId: holdData.booking.id });
    } catch { failedNames.push(b.resourceName); }
  }
  return { conflictNames, failedNames, confirmed };
}

/** Custom charges + loyalty redemption to replay once an offline-queued
 *  order actually gets created — see OfflineOrderExtras' doc in
 *  offlineQueue.ts for why these can't just ride along in the order body
 *  itself. Returns undefined (not an empty object) when there's nothing to
 *  replay, so enqueueOrder stores a clean NULL instead of a no-op JSON blob. */
function buildOfflineExtras(cart: Cart, selectedCustomerId?: string): OfflineOrderExtras | undefined {
  const charges = cart.charges.length > 0
    ? cart.charges.map(c => ({ name: c.name, amount: c.amount, taxable: c.taxable }))
    : undefined;
  const loyalty = (cart.loyalty_points_to_redeem > 0 && selectedCustomerId)
    ? { customerId: selectedCustomerId, pointsToRedeem: cart.loyalty_points_to_redeem }
    : undefined;
  if (!charges && !loyalty) return undefined;
  return { charges, loyalty };
}

export async function submitOfflineOrder(params: {
  orderBody: object;
  payMethod: PayMethod;
  workspaceId: string | null;
  branchId: string;
  cashInput: string;
  total: number;
  cart: Cart;
  subtotal: number; tax: number; taxRatePct: number;
  serviceFee: number; svcRatePct: number;
  discount: number; cashAmt: number; change: number;
  refNumber: string;
  /** Needed to replay a loyalty-points redemption once this order syncs —
   *  see buildOfflineExtras. Omit when no customer is attached. */
  selectedCustomerId?: string;
  /** Set when this is a network-failure fallback from a failed online
   *  checkout attempt (not the pre-flight "no connection" case) — reuses
   *  that attempt's Idempotency-Key so if the request actually reached the
   *  server before the response was lost, this queued retry dedupes against
   *  it server-side instead of creating a second order. */
  orderIdemKey?: string;
}): Promise<ReceiptPayload> {
  const tempId = `offln-${Math.random().toString(36).slice(2, 8)}`; // NOSONAR - non-security randomness
  const tempNo = `TMP-${tempId.slice(6).toUpperCase()}`;
  // A payBody is built for EVERY payment method, not just cash — this used to
  // be `payMethod === "cash" ? {...} : null`, which meant an offline gcash/
  // maya/card/qrph order queued and synced the ORDER but never settled
  // payment at all (flushOrderRows skips the pay leg entirely when pay_body
  // is null). The order came back online-synced but permanently
  // payment_status=null (Pending/UNPAID in Order History), same symptom as
  // the online settlement-retry gap, but via a path that never even attempts
  // payment once, let alone retries it. Mirrors submitOrder()'s online-path
  // cash_received logic: the real amount tendered for cash, the order total
  // for any other method (there's no "change" concept for gcash/maya/card/qrph).
  const payBody: Record<string, unknown> = {
    workspace_id: params.workspaceId,
    branch_id: params.branchId,
    cash_received: params.payMethod === "cash" ? (parseFloat(params.cashInput) || params.total) : params.total,
  };
  if (params.payMethod !== "cash") payBody.payment_method = params.payMethod;
  const extras = buildOfflineExtras(params.cart, params.selectedCustomerId);
  await enqueueOrder({ id: tempId, orderNo: tempNo, orderBody: params.orderBody, payBody, extras, idemKey: params.orderIdemKey });
  flushQueue().catch(() => {});
  const payload: ReceiptPayload = {
    orderNo: tempNo, orderId: undefined,
    items: params.cart.items.map(i => ({ name: i.product.name, sku: i.product.sku ?? null, qty: i.qty, price: i.product.price, notes: i.notes || null, category: i.product.category, prep_station: i.product.prep_station ?? null, addons: i.addons?.map(a => ({ name: a.name, price: a.price, qty: a.qty })) ?? [], discount: itemDiscountPeso(i) || undefined })),
    bookings: [],
    charges: params.cart.charges.map(c => ({ name: c.name, amount: c.amount })),
    subtotal: params.subtotal, tax: params.tax, taxRatePct: params.taxRatePct,
    serviceFee: params.serviceFee, svcRatePct: params.svcRatePct,
    discount: params.discount, total: params.total,
    cashAmt: params.cashAmt, change: params.change,
    payMethod: params.payMethod, refNumber: params.refNumber,
    orderType: params.cart.orderType,
    tableNo: params.cart.tableNo,
    customerName: params.cart.customerName,
    internalNote: params.cart.internalNote || undefined,
    floor: params.cart.floor || undefined,
    timestamp: new Date().toISOString(),
  };
  // Lets this order be found and reprinted from Order History before it
  // syncs (see offlineReceipts.ts) — previously the only place this payload
  // existed was this function's return value, held in the checkout screen's
  // local state and gone the moment the cashier navigated away.
  if (params.workspaceId) cacheOfflineReceipt(params.workspaceId, tempId, payload).catch(() => {});
  return payload;
}

/** Offline equivalent of handleSplitConfirm() — queues the order AND both
 *  payment legs together, applied sequentially once the order is actually
 *  created during a later flush. Each leg's amount is its own fixed split
 *  portion (never "the remaining balance"), so — unlike a single balance-
 *  based settlement — there's no cross-leg ordering dependency that offline
 *  queuing could break; see enqueueOrder's payBody doc. This is what makes
 *  split payment safe to support offline at all, where before it was
 *  blocked outright ("Split payment isn't available offline"). */
export async function submitOfflineSplitOrder(params: {
  orderBody: object;
  method1: { method: string; amount: number; reference?: string };
  method2: { method: string; amount: number; reference?: string };
  workspaceId: string | null;
  branchId: string;
  cart: Cart;
  subtotal: number; tax: number; taxRatePct: number;
  serviceFee: number; svcRatePct: number;
  discount: number; total: number;
  /** Needed to replay a loyalty-points redemption once this order syncs. */
  selectedCustomerId?: string;
  orderIdemKey?: string;
}): Promise<ReceiptPayload> {
  const tempId = `offln-${Math.random().toString(36).slice(2, 8)}`; // NOSONAR - non-security randomness
  const tempNo = `TMP-${tempId.slice(6).toUpperCase()}`;
  const legBody = (leg: { method: string; amount: number }) => ({
    workspace_id: params.workspaceId, branch_id: params.branchId,
    cash_received: leg.amount, payment_method: leg.method, amount_tendered: leg.amount,
  });
  const payBody = [legBody(params.method1), legBody(params.method2)];
  const extras = buildOfflineExtras(params.cart, params.selectedCustomerId);
  await enqueueOrder({ id: tempId, orderNo: tempNo, orderBody: params.orderBody, payBody, extras, idemKey: params.orderIdemKey });
  flushQueue().catch(() => {});
  const payload: ReceiptPayload = {
    orderNo: tempNo, orderId: undefined,
    items: params.cart.items.map(i => ({ name: i.product.name, sku: i.product.sku ?? null, qty: i.qty, price: i.product.price, notes: i.notes || null, category: i.product.category, prep_station: i.product.prep_station ?? null, addons: i.addons?.map(a => ({ name: a.name, price: a.price, qty: a.qty })) ?? [], discount: itemDiscountPeso(i) || undefined })),
    bookings: [],
    charges: params.cart.charges.map(c => ({ name: c.name, amount: c.amount })),
    subtotal: params.subtotal, tax: params.tax, taxRatePct: params.taxRatePct,
    serviceFee: params.serviceFee, svcRatePct: params.svcRatePct,
    discount: params.discount, total: params.total,
    cashAmt: params.method1.amount + params.method2.amount, change: 0,
    payMethod: `split:${params.method1.method}+${params.method2.method}`, refNumber: "",
    splitPayments: [
      { method: params.method1.method, amount: params.method1.amount, refNumber: params.method1.reference || undefined },
      { method: params.method2.method, amount: params.method2.amount, refNumber: params.method2.reference || undefined },
    ],
    orderType: params.cart.orderType,
    tableNo: params.cart.tableNo,
    customerName: params.cart.customerName,
    internalNote: params.cart.internalNote || undefined,
    floor: params.cart.floor || undefined,
    timestamp: new Date().toISOString(),
  };
  if (params.workspaceId) cacheOfflineReceipt(params.workspaceId, tempId, payload).catch(() => {});
  return payload;
}

export const TYPE_MAP: Record<OrderType, "dine_in" | "takeaway" | "delivery" | "booking"> = {
  dine_in: "dine_in", takeout: "takeaway", room_service: "dine_in", walk_in: "dine_in",
};

/* ── Shared submitOrder / handleSplitConfirm steps ──
 * These two checkout paths (single-method vs. split-payment) used to each
 * hand-roll the same order-body shape, the same orders-create + loyalty-
 * redeem + charges-posting sequence, the same payments-cash-confirm call
 * shape, and the same receipt-payload item/charge/booking mappings —
 * ~70% identical code, kept in sync by hand. Pulling out the identical
 * pieces here means the two checkout flows can only drift where they
 * actually differ (offline/partial/deposit handling only applies to the
 * single-method path; two sequential settlement legs only apply to split). */

export function buildOrderItems(cart: Cart) {
  return cart.items.map(i => ({
    product_id: i.product.id, quantity: i.qty, notes: i.notes || undefined,
    addons: i.addons?.map(a => ({ addon_id: a.addon_id, name: a.name, price: a.price, qty: a.qty })) ?? [],
    discount_amount: itemDiscountPeso(i) || undefined,
  }));
}

export function buildOrderBody(params: {
  activeWorkspaceId: string | null;
  activeBranchId: string | null;
  cart: Cart;
  notes: string | undefined;
  taxRatePct: number;
  svcRatePct: number;
  applyTax: boolean;
  applySvc: boolean;
  discount: number;
  loyaltyDiscount: number;
  selectedCustomerId?: string;
  currentShiftId: string | null;
  orderItems: ReturnType<typeof buildOrderItems>;
  unpaid?: boolean;
}): Record<string, unknown> {
  const { cart } = params;
  const effectiveTaxRate = params.applyTax ? params.taxRatePct : 0;
  const effectiveSvcRate = params.applySvc ? params.svcRatePct : 0;
  return {
    workspace_id: params.activeWorkspaceId,
    branch_id: params.activeBranchId,
    type: cart.items.length === 0 ? "booking" : TYPE_MAP[cart.orderType],
    table_no: cart.tableNo || undefined,
    notes: params.notes,
    tax_rate: +(effectiveTaxRate + effectiveSvcRate).toFixed(4),
    // orders-create ignores the combined tax_rate above (kept only for any
    // other consumer that might still read it) and always re-derives its own
    // tax/service rates from the workspace's stored defaults — apply_tax/
    // apply_service are what actually let the cashier's per-order "Tax"/
    // "Service X%" toggle waive a charge server-side instead of just hiding
    // it on screen while the full amount still got billed underneath.
    apply_tax: params.applyTax,
    apply_service: params.applySvc,
    discount_amount: +(params.discount + params.loyaltyDiscount).toFixed(2),
    voucher_code: cart.applied_voucher?.code ?? undefined,
    is_senior_pwd: cart.is_senior_pwd,
    discount_manager_approval_id: cart.discount_manager_approval_id ?? undefined,
    items: params.orderItems,
    customer_id: params.selectedCustomerId ?? undefined,
    shift_id: params.currentShiftId ?? undefined,
    order_type: cart.orderType,
    serve_location: cart.floor || undefined,
    unpaid: params.unpaid || undefined,
  };
}

/** Thrown specifically when the orders-create call inside
 *  createOrderWithCharges() fails because the request never got an HTTP
 *  response (dropped/flaky connection or a client-side timeout) — as opposed
 *  to the server rejecting it. Callers can catch this to fall back to the
 *  offline queue: since no later step has run yet (payment/booking
 *  confirmation only happen after this returns), retrying via the queue with
 *  the same Idempotency-Key is safe even if the original request actually
 *  reached the server. See services/supabase.ts's isNetworkError(). */
export class OrderNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderNetworkError";
  }
}

/** orders-create, then (in parallel) redeem loyalty points and post any custom
 *  charges — identical sequence for both the single-method and split-payment
 *  checkout paths. Charge/loyalty failures are logged, not thrown: they
 *  shouldn't block a checkout that already has a committed order. */
export async function createOrderWithCharges(
  orderBody: Record<string, unknown>,
  cart: Cart,
  ctx: { activeWorkspaceId: string | null; activeBranchId: string | null; selectedCustomerId?: string },
  orderIdemKey: string,
): Promise<{ orderId: string; orderData: { order: { id: string; order_no?: string | null; total: number | string } } }> {
  // invokeFn, not supabase.functions.invoke — the raw client only reports
  // "Edge Function returned a non-2xx status code" and discards the response
  // body, so every checkout failure looked identical and undiagnosable.
  // invokeFn reads error.context and surfaces the real server message.
  const { data: orderData, error: orderErr } = await invokeFn<{
    order: { id: string; order_no?: string | null; total: number | string };
    error?: string;
  }>("orders-create", orderBody, { "Idempotency-Key": orderIdemKey });
  if (orderErr) throw isNetworkError(orderErr) ? new OrderNetworkError(orderErr.message) : orderErr;
  if (orderData?.error) throw new Error(orderData.error);
  if (!orderData?.order?.id) throw new Error("orders-create returned no order");
  const orderId = orderData.order.id;

  const loyaltyRedeemPromise = (cart.loyalty_points_to_redeem > 0 && ctx.selectedCustomerId && ctx.activeWorkspaceId)
    ? invokeFn("loyalty-redeem", {
        workspace_id: ctx.activeWorkspaceId,
        customer_id: ctx.selectedCustomerId,
        order_id: orderId,
        points_to_redeem: cart.loyalty_points_to_redeem,
      }).catch(e => { console.warn("loyalty-redeem failed:", e); })
    : Promise.resolve();

  await Promise.all([
    loyaltyRedeemPromise,
    ...cart.charges.map(charge =>
      supabase.functions.invoke("orders-add-charge", {
        body: {
          workspace_id: ctx.activeWorkspaceId,
          branch_id: ctx.activeBranchId,
          order_id: orderId,
          name: charge.name,
          amount: charge.amount,
          taxable: charge.taxable,
        },
      }).catch(e => console.warn("orders-add-charge failed for charge:", charge.name, e)),
    ),
  ]);

  return { orderId, orderData };
}

/** A single payments-cash-confirm leg — used once by the single-method path
 *  and twice (one per leg) by the split-payment path. */
export async function settleFoodPayment(
  orderId: string,
  ctx: { activeWorkspaceId: string | null; activeBranchId: string | null },
  opts: { cashReceived: number; paymentMethod: string; amountTendered?: number; idemSuffix: string; errorLabel?: string },
): Promise<void> {
  const body: Record<string, unknown> = {
    workspace_id: ctx.activeWorkspaceId,
    branch_id: ctx.activeBranchId,
    order_id: orderId,
    cash_received: opts.cashReceived,
    payment_method: opts.paymentMethod,
  };
  if (opts.amountTendered != null) body.amount_tendered = opts.amountTendered;
  // invokeFn, not the raw supabase.functions.invoke client — the raw client
  // only ever reports "Edge Function returned a non-2xx status code" and
  // discards the real {error:{message}} body the server actually returns,
  // making every payment failure here look identical and undiagnosable
  // regardless of the real cause (validation error, network blip, etc).
  const { error } = await invokeFn("payments-cash-confirm", body, { "Idempotency-Key": makeIdemKey(opts.idemSuffix) });
  if (error) throw new Error(`${opts.errorLabel ?? "Payment"} failed: ${error.message ?? "unknown error"}`);
}

/** settleFoodPayment, but self-healing: if the order is already committed
 *  server-side (the normal case — this only ever runs after orders-create
 *  succeeded) and the settlement call itself fails, the order must NOT be
 *  reported as failed to the cashier — it exists, the customer already paid
 *  or handed over cash, and re-running checkout would create a duplicate
 *  order. Instead the payment leg is hesitant-queued into the same
 *  SQLite-backed retry queue offline checkouts use (see offlineQueue.ts's
 *  flushPaymentRows), so it self-heals on the next reconnect/30s tick instead
 *  of leaving the order permanently Pending/UNPAID with no recorded revenue.
 *  Returns true if settled immediately, false if queued for retry. */
export async function settleFoodPaymentOrQueue(
  orderId: string,
  orderNo: string,
  ctx: { activeWorkspaceId: string | null; activeBranchId: string | null },
  opts: { cashReceived: number; paymentMethod: string; amountTendered?: number; idemSuffix: string; errorLabel?: string },
): Promise<boolean> {
  try {
    await settleFoodPayment(orderId, ctx, opts);
    return true;
  } catch {
    await enqueuePaymentRetry({
      id: `payretry-${orderId}-${Date.now()}`,
      orderId, orderNo,
      payBody: {
        workspace_id: ctx.activeWorkspaceId, branch_id: ctx.activeBranchId,
        cash_received: opts.cashReceived, payment_method: opts.paymentMethod,
        ...(opts.amountTendered != null ? { amount_tendered: opts.amountTendered } : {}),
      },
    });
    flushQueue().catch(() => {});
    return false;
  }
}

/** Split-payment counterpart to settleFoodPaymentOrQueue: settles both legs
 *  against an order that already exists server-side (handleSplitConfirm's
 *  online path, after createOrderWithCharges succeeded). Each leg is tried
 *  independently — a failure in one must not skip the other, and must not
 *  re-queue a leg that already succeeded (that would double-charge it, since
 *  a fresh retry gets a fresh Idempotency-Key with nothing to dedupe
 *  against). Only the leg(s) that didn't settle live get queued for retry —
 *  safe to apply in either order later, or independently of each other, per
 *  enqueueOrder's payBody doc. Returns true only if both legs settled live. */
export async function settleSplitPaymentsOrQueue(
  orderId: string,
  orderNo: string,
  ctx: { activeWorkspaceId: string | null; activeBranchId: string | null },
  legs: { cashReceived: number; paymentMethod: string; amountTendered?: number; idemSuffix: string; errorLabel?: string }[],
): Promise<boolean> {
  const failedLegBodies: Record<string, unknown>[] = [];
  for (const leg of legs) {
    try {
      await settleFoodPayment(orderId, ctx, leg);
    } catch {
      failedLegBodies.push({
        workspace_id: ctx.activeWorkspaceId, branch_id: ctx.activeBranchId,
        cash_received: leg.cashReceived, payment_method: leg.paymentMethod,
        ...(leg.amountTendered != null ? { amount_tendered: leg.amountTendered } : {}),
      });
    }
  }
  if (failedLegBodies.length === 0) return true;
  await enqueuePaymentRetry({
    id: `payretry-${orderId}-${Date.now()}`,
    orderId, orderNo,
    payBody: failedLegBodies.length === 1 ? failedLegBodies[0] : failedLegBodies,
  });
  flushQueue().catch(() => {});
  return false;
}

/** Settle confirmed bookings against a non-cash order (e-payment or split) —
 *  marks each booking's payment_status via booking-epayment-confirm. Cash
 *  bookings with per-booking deposit support are handled separately by the
 *  single-method checkout path, since split payment has no deposit concept. */
export async function settleBookingsViaEpayment(
  confirmedBookingsCount: number,
  orderId: string,
  activeWorkspaceId: string | null,
  params: { paymentStatus: "paid" | "partial"; refNumber?: string; depositAmount?: number; payMethod: string },
): Promise<void> {
  if (confirmedBookingsCount === 0) return;
  await invokeFn("pos-data", {
    workspace_id: activeWorkspaceId,
    resource: "booking-epayment-confirm",
    params: {
      order_id: orderId,
      payment_status: params.paymentStatus,
      ref_number: params.refNumber || undefined,
      deposit_amount: params.depositAmount,
      pay_method: params.payMethod,
    },
  });
}

/** Fire-and-forget loyalty award — never blocks checkout completion on failure. */
export function awardLoyaltyPoints(
  selectedCustomerId: string | undefined,
  orderId: string,
  activeWorkspaceId: string | null,
  total: number,
): void {
  if (!selectedCustomerId || !activeWorkspaceId) return;
  invokeFn("loyalty-earn", {
    workspace_id: activeWorkspaceId,
    customer_id: selectedCustomerId,
    order_id: orderId,
    order_total: total,
  }).catch(() => {});
}

/* ── Receipt-payload mapping (identical between both checkout paths) ── */

export function buildReceiptItems(cart: Cart) {
  return cart.items.map(i => ({
    name: i.product.name, sku: i.product.sku ?? null, qty: i.qty, price: i.product.price, notes: i.notes || null,
    category: i.product.category, prep_station: i.product.prep_station ?? null,
    addons: i.addons?.map(a => ({ name: a.name, price: a.price, qty: a.qty })) ?? [],
    discount: itemDiscountPeso(i) || undefined,
  }));
}

export function buildReceiptCharges(cart: Cart) {
  return cart.charges.map(c => ({ name: c.name, amount: c.amount }));
}

export function buildReceiptBookings(cart: Cart, opts?: { includeRef?: boolean }) {
  return cart.bookings.map(b => ({
    name: b.resourceName, total: b.total,
    ...(opts?.includeRef && b.existingBookingId ? { bookingRef: `BK-${b.existingBookingId.slice(0, 8).toUpperCase()}` } : {}),
    guestName: b.guestName || undefined,
    guestPhone: b.guestPhone || undefined,
    guestEmail: b.guestEmail || undefined,
    checkIn: b.startISO ? b.startISO.slice(0, 10) : undefined,
    checkOut: b.endISO ? b.endISO.slice(0, 10) : undefined,
  }));
}

/** Peso value of a single line's discount, clamped to that line's own gross total. */
export function itemDiscountPeso(item: CartItem): number {
  const lineGross = item.product.price * item.qty;
  const raw = item.discountType === "percent"
    ? lineGross * (Math.min(item.discount ?? 0, 100) / 100)
    : (item.discount ?? 0);
  return +Math.min(Math.max(raw, 0), lineGross).toFixed(2);
}

/* ── Cart totals (pure calc, memoized by the caller) ──
 * Item-level discounts are folded into `discount` (post-tax), not netted out
 * of foodSubtotal/tax — mirrors orders-create exactly, where order_items.total
 * stays gross (unit_price*quantity) and the per-item discount_amount column
 * is folded into the order's manual-discount bucket instead. Computing tax on
 * a pre-item-discount base here and a post-item-discount base server-side
 * would show the cashier a total that doesn't match what actually gets
 * charged at checkout. */
export function computeCartTotals(cart: Cart, applyTax: boolean, taxRatePct: number, applySvc: boolean, svcRatePct: number) {
  const itemDiscountTotal = cart.items.reduce((sum, i) => sum + itemDiscountPeso(i), 0);
  const foodSubtotal = cart.items.reduce((sum, i) => sum + i.product.price * i.qty, 0);
  const bookingTotal = cart.bookings.reduce((sum, b) => sum + b.total, 0);
  const chargesTotal = cart.charges.reduce((sum, c) => sum + c.amount, 0);
  const subtotal = foodSubtotal + bookingTotal + chargesTotal;
  const tax = applyTax ? +(foodSubtotal * taxRatePct).toFixed(2) : 0;
  const serviceFee = applySvc ? +(foodSubtotal * svcRatePct).toFixed(2) : 0;
  const beforeDiscount = subtotal + tax + serviceFee;
  const scPwdDiscount = cart.is_senior_pwd
    ? Math.round((subtotal / (1 + taxRatePct)) * 0.2 * 100) / 100
    : 0;
  const discountRaw = cart.is_senior_pwd
    ? scPwdDiscount
    : (cart.discountType === "percent"
        ? beforeDiscount * (Math.min(cart.discount, 100) / 100)
        : cart.discount) + itemDiscountTotal;
  const discount = +Math.min(discountRaw, beforeDiscount).toFixed(2);
  const computedTotal = +(beforeDiscount - discount).toFixed(2);
  const loyaltyDiscount = Math.min(cart.loyalty_peso_discount, computedTotal);
  const voucherDiscount = (() => {
    const v = cart.applied_voucher;
    if (!v) return 0;
    const raw = v.discount_type === "percentage"
      ? subtotal * (v.discount_value / 100)
      : v.discount_value;
    const capped = v.max_cap != null ? Math.min(raw, v.max_cap) : raw;
    return +Math.min(capped, computedTotal - loyaltyDiscount).toFixed(2);
  })();
  const total = +(computedTotal - loyaltyDiscount - voucherDiscount).toFixed(2);
  const itemCount = cart.items.reduce((sum, i) => sum + i.qty, 0) + cart.bookings.length + cart.charges.length;
  const canCheckout = cart.items.length > 0 || cart.bookings.length > 0 || cart.charges.length > 0;
  return {
    foodSubtotal, bookingTotal, subtotal, tax, serviceFee,
    discount, computedTotal, loyaltyDiscount, voucherDiscount, total,
    itemDiscountTotal, itemCount, canCheckout,
  };
}

/* ── Customer-display helpers ── */
export function resolvePayDisplayInfo(method: PayMethod, cfg: PaymentConfig): { payInfo: string | null; payQr: string | null } {
  if (method === "gcash") return resolveGcashDisplay(cfg);
  if (method === "maya")  return resolveMayaDisplay(cfg);
  if (method === "qrph")  return { payInfo: cfg.qrphInfo || null, payQr: cfg.qrphQr || null };
  if (method === "bank_transfer") return { payInfo: resolveBankDisplay(cfg), payQr: null };
  return { payInfo: null, payQr: null };
}

export function deriveCustomerDisplayMode(
  hasSuccess: boolean, isPaying: boolean, hasItems: boolean,
): "idle" | "order" | "payment" | "thankyou" {
  if (hasSuccess) return "thankyou";
  if (isPaying) return "payment";
  if (hasItems) return "order";
  return "idle";
}

/* ── Pay-display helpers (used by resolvePayDisplayInfo) ── */
export function resolveGcashDisplay(cfg: PaymentConfig): { payInfo: string | null; payQr: string | null } {
  const nameSuffix = cfg.gcashName ? " · " + cfg.gcashName : "";
  const payInfo = cfg.gcashNumber ? "GCash  " + cfg.gcashNumber + nameSuffix : null;
  return { payInfo, payQr: cfg.gcashQr || null };
}

export function resolveMayaDisplay(cfg: PaymentConfig): { payInfo: string | null; payQr: string | null } {
  const nameSuffix = cfg.mayaName ? " · " + cfg.mayaName : "";
  const payInfo = cfg.mayaNumber ? "Maya  " + cfg.mayaNumber + nameSuffix : null;
  return { payInfo, payQr: cfg.mayaQr || null };
}

export function resolveBankDisplay(cfg: PaymentConfig): string | null {
  if (!cfg.bankAccountNumber) return null;
  const bankLine = cfg.bankName ? cfg.bankName + "  " : "";
  const nameSuffix = cfg.bankAccountName ? " · " + cfg.bankAccountName : "";
  return bankLine + cfg.bankAccountNumber + nameSuffix;
}

/* ── Product tile (product grid) ──
 * Extracted + memoized so that typing in the search box, cash-tendered field, cart
 * notes, etc. — which re-renders the whole OrderScreen — doesn't force every tile in
 * the grid to re-render. As long as `product` and `qtyInCart` are referentially/value
 * stable for a given row, React.memo lets FlatList skip re-rendering it.
 */

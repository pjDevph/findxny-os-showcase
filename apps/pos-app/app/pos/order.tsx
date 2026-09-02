/**
 * POS Order Screen — Unified Cart
 * Products + Room bookings + Amenity bookings in one transaction
 */
import {
  View, Text, Pressable, ScrollView,
  useWindowDimensions, Animated, BackHandler,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useEffect, useReducer, useCallback, useMemo, useRef } from "react";
import { useRouter, Stack, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSidebar } from "../../features/admin/SidebarContext";
import { supabase, invokeFn, isNetworkError } from "../../services/supabase";
import { useAuth } from "../../features/auth/AuthContext";
import { useTheme } from "../../features/theme/ThemeContext";
import { RoomCalendar, RoomCalendarRoom } from "../../features/bookings/RoomCalendar";
import { AmenityTimePicker, AmenityTimePickerAmenity } from "../../features/bookings/AmenityTimePicker";
import { loadPaymentConfig, PaymentConfig, EMPTY_PAYMENT_CONFIG } from "../../features/payments/paymentConfig";
import { ReceiptPayload, loadReceiptConfig } from "../../features/receipt/receiptConfig";
import { usePrinterConfig } from "../../features/receipt/printerConfig";
import { printDrinkLabels } from "../../features/receipt/labelPrintUtils";
import { printStationTickets } from "../../features/receipt/stationTicketPrintUtils";
import { printReceipt } from "../../features/receipt/receiptPrintUtils";
import { getIsConnected } from "../../features/offline/networkStatus";
import { OfflineBanner } from "../../features/offline/OfflineBanner";
import { ReceiptModal } from "../../features/receipt/ReceiptModal";
import type { Customer } from "../../features/customers/CustomerSelector";
import type {
  Product, Resource, CartItem,
  OrderType, PayMethod, TicketResult,
} from "../../features/order/types";
import { EMPTY_CART, cartReducer } from "../../features/order/cartReducer";
import { CartPanel } from "../../features/order/CartPanel";
import { makeStyles } from "../../features/order/orderScreenStyles";
import { SuccessOverlay } from "../../features/order/SuccessOverlay";
import { ProductTile, BASE_CARD_WIDTH, MIN_CARD_WIDTH, MAX_CARD_WIDTH } from "../../features/order/ProductTile";
import { ProductAvailabilityModal } from "../../features/order/ProductAvailabilityModal";
import { HeldCartsModal } from "../../features/order/HeldCartsModal";
import { CancelOrderModal } from "../../features/order/CancelOrderModal";
import { LoadTicketModal } from "../../features/order/LoadTicketModal";
import { PayModal } from "../../features/order/PayModal";
import { RoomBookingModal } from "../../features/order/RoomBookingModal";
import { SheetModal } from "../../features/ui/SheetModal";
import { ResourcesTab } from "../../features/order/ResourcesTab";
import { ProductsTab } from "../../features/order/ProductsTab";
import {
  loadAllProducts, loadWorkspaceConfig, loadBookableResources,
  runLookupTicket, runAddTicketToCart,
  applyHandleSuccess,
  makeIdemKey, buildOrderNotes, parseNotes, confirmBookings, submitOfflineOrder, submitOfflineSplitOrder,
  buildOrderItems, buildOrderBody, createOrderWithCharges, OrderNetworkError, settleFoodPaymentOrQueue, settleSplitPaymentsOrQueue,
  settleBookingsViaEpayment, awardLoyaltyPoints,
  buildReceiptItems, buildReceiptCharges, buildReceiptBookings, computeCartTotals,
} from "../../features/order/orderHelpers";
import type {
  Tab, LoyaltyBalanceResponse,
} from "../../features/order/types";
import { peso } from "../../features/order/format";
import type { LoyaltyRules } from "../../features/order/types";
import { CustomChargeModal } from "../../features/pos-order/components/CustomChargeModal";
import { ManagerApprovalModal } from "../../features/pos-order/components/ManagerApprovalModal";
import { AddonsModal } from "../../features/pos-order/components/AddonsModal";
import { SplitPaymentModal, type SplitMethod } from "../../features/pos-order/components/SplitPaymentModal";
import { ordersUpdatePending } from "../../features/pos/functions";
import { useToast } from "../../features/ui/ToastProvider";
import { useShiftGate } from "../../features/shift/useShiftGate";
import { ShiftGateBlock } from "../../features/shift/ShiftGateBlock";
import { useHeldCarts } from "../../features/order/useHeldCarts";
import { useKioskFullscreen } from "../../features/order/useKioskFullscreen";
import { useCustomerDisplayMirror } from "../../features/order/useCustomerDisplayMirror";
import { useCancelOrder } from "../../features/order/useCancelOrder";
import { useBookingForm } from "../../features/order/useBookingForm";
import { OrderScreenHeader } from "../../features/order/OrderScreenHeader";

// "walk_in" is intentionally omitted from the picker — it mapped to the same
// kitchen-routing category as "dine_in" (see TYPE_MAP below) and didn't show
// a Table # field like "takeout" did, so it didn't cleanly behave like either.
// The OrderType union and downstream handling keep supporting it so historical
// orders with order_type='walk_in' still display correctly.
const TABS: { id: Tab; label: string }[] = [
  { id: "products", label: "Products" },
  { id: "amenity", label: "Amenities" },
  { id: "room", label: "Rooms" },
];

export default function OrderScreen() {
  const { activeWorkspaceId, activeBranchId, role, userName } = useAuth();
  // manager-approval-verify only allows admin/owner to self-approve (see
  // supabase/functions/manager-approval-verify — manager requires a second
  // sign-off by design); must mirror that here or a manager gets silently
  // routed to a self-approval path the server always rejects.
  const isSelfApprover = role === "owner" || role === "admin";
  // Cashiers can't ring orders without an open, clocked-in shift on this
  // device (managers/admins/owners are exempt — they often need to check
  // Orders without running their own personal shift clock).
  const shiftGate = useShiftGate();
  const { C } = useTheme();
  const { openSidebar, isPhoneMode, setSidebarHidden } = useSidebar();
  const s = useMemo(() => makeStyles(C), [C]);
  const router = useRouter();
  const {
    preload_id, preload_rname, preload_rid, preload_bid,
    preload_start, preload_end, preload_total, preload_notes,
    open_tab,
    edit_order_id, edit_items, edit_order_type, edit_table_no, edit_notes,
  } = useLocalSearchParams<{
    preload_id?: string; preload_rname?: string; preload_rid?: string; preload_bid?: string;
    preload_start?: string; preload_end?: string; preload_total?: string; preload_notes?: string;
    open_tab?: string;
    edit_order_id?: string; edit_items?: string; edit_order_type?: string;
    edit_table_no?: string; edit_notes?: string;
  }>();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const insets = useSafeAreaInsets();
  const printerConfig = usePrinterConfig();

  const [products, setProducts] = useState<Product[]>([]);
  const [categoryCountsFromServer, setCategoryCountsFromServer] = useState<{ total: number; by_category: Record<string, number> } | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourcesLoaded, setResourcesLoaded] = useState(false);
  const resourcesFetchStarted = useRef(false);
  const [loading, setLoading] = useState(true);
  const [productsRefreshing, setProductsRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("All");
  const [hideOos, setHideOos] = useState(false);
  const [cardWidth, setCardWidth] = useState<number | null>(null); // null = default (1:1)
  // "More categories" hint while the chip row overflows horizontally and
  // hasn't been scrolled all the way to the end yet.
  const [showCatScrollHint, setShowCatScrollHint] = useState(false);
  const catScrollViewportW = useRef(0);
  function evalCatScrollHint(contentW: number, viewportW: number, offsetX: number) {
    setShowCatScrollHint(contentW - viewportW - offsetX > 24);
  }
  // Hint sits to the left of "Hide OOS" — track its width so the hint can be
  // anchored just before it, without wrapping the ScrollView (a wrapping View
  // around this horizontal ScrollView was found to silently break Text
  // painting for its children on Android — width/layout measured fine, but
  // no glyphs ever composited. Keep the ScrollView a direct child of catBar.)
  const [oosToggleW, setOosToggleW] = useState(0);

  const { fullscreen, toggleFullscreen } = useKioskFullscreen(setSidebarHidden);
  const [activeTab, setActiveTab] = useState<Tab>("products");
  const [taxRatePct, setTaxRatePct] = useState(0.12);
  // No hardcoded guess here — until loadWorkspaceConfig() resolves with the
  // workspace's real configured rate, the Pay modal's service-charge row
  // stays hidden (it only renders when svcRatePct > 0). A previous 0.10
  // default meant a slow/failed config load could show and charge a 10%
  // service fee nobody configured.
  const [svcRatePct, setSvcRatePct] = useState(0);
  const [applyTax, setApplyTax] = useState(false);
  const [applySvc, setApplySvc] = useState(false);

  const [cart, dispatch] = useReducer(cartReducer, EMPTY_CART);
  const [showCart, setShowCart] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [cashInput, setCashInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successOrder, setSuccessOrder] = useState<ReceiptPayload | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [payConfig, setPayConfig] = useState<PaymentConfig>(EMPTY_PAYMENT_CONFIG);
  const [refNumber, setRefNumber] = useState("");
  // Booking-only payment mode
  const [bookPayMode, setBookPayMode] = useState<"unpaid" | "full" | "deposit">("full");
  const [depositAmt, setDepositAmt] = useState("");
  // Partial payment for non-booking cash orders
  const [payPartial, setPayPartial] = useState(false);
  const [partialAmtInput, setPartialAmtInput] = useState("");
  // Unpaid "open tab" for non-booking orders — created owing the full total,
  // settled later via Transactions → Collect Balance.
  const [payUnpaid, setPayUnpaid] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerLoyalty, setCustomerLoyalty] = useState<{ balance: number; peso_value: number; rules: LoyaltyRules | undefined } | null>(null);

  const [shiftCashier, setShiftCashier] = useState<string | null>(null);
  const [currentShiftId, setCurrentShiftId] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("pos_shift_native").then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.open && parsed?.cashier) setShiftCashier(parsed.cashier);
        if (parsed?.open && parsed?.shiftId) setCurrentShiftId(parsed.shiftId);
      } catch { /* ignore */ }
    });
  }, []);

  const [showChargeModal, setShowChargeModal] = useState(false);

  // Manager approval for large discounts
  const [pendingDiscount, setPendingDiscount] = useState<{ amount: number; discountType: "amount" | "percent" } | null>(null);
  const [discApprovalId, setDiscApprovalId] = useState<string | null>(null);
  const [showDiscApprovalModal, setShowDiscApprovalModal] = useState(false);

  // Addon selection modal
  const [pendingAddonProduct, setPendingAddonProduct] = useState<Product | null>(null);

  // Split payment modal
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitM1, setSplitM1] = useState<"cash" | "gcash" | "maya" | "card" | "qrph" | "bank_transfer">("cash");
  const [splitM2, setSplitM2] = useState<"cash" | "gcash" | "maya" | "card" | "qrph" | "bank_transfer">("gcash");
  const [splitA1, setSplitA1] = useState("");
  const [splitA2, setSplitA2] = useState("");
  const [splitR1, setSplitR1] = useState("");
  const [splitR2, setSplitR2] = useState("");

  const [loadTicketVisible, setLoadTicketVisible] = useState(false);
  const [ticketQuery, setTicketQuery] = useState("");
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketResult, setTicketResult] = useState<TicketResult | null>(null);
  const [ticketErr, setTicketErr] = useState<string | null>(null);

  // Edit / Cancel order state
  const [editOrderId, setEditOrderId] = useState<string | null>(null);

  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const payScrollRef = useRef<ScrollView>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Shared themed toast (used for former Alert.alert(...) informational messages) —
  // aliased to avoid colliding with the local mini-toast `showToast` above.
  const { showToast: showAppToast } = useToast();

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastAnim.setValue(0);
    setToast(msg);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(1700),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
    toastTimer.current = setTimeout(() => setToast(null), 2300);
  }, []);

  const cancelApi = useCancelOrder({
    activeWorkspaceId, activeBranchId, isSelfApprover,
    getOrderId: () => ticketResult?.orderId ?? editOrderId,
    onCancelled: () => {
      setLoadTicketVisible(false);
      setTicketResult(null);
      const wasEditOrder = !!editOrderId;
      setEditOrderId(null);
      if (wasEditOrder) router.back();
    },
    showToast, showAppToast,
  });

  const heldCartsApi = useHeldCarts(cart, cart.items.length > 0 || cart.bookings.length > 0 || cart.charges.length > 0, dispatch, showToast);

  async function lookupTicket() {
    await runLookupTicket(ticketQuery, activeWorkspaceId, {
      setTicketLoading, setTicketErr, setTicketResult,
    });
  }

  function addTicketToCart() {
    runAddTicketToCart(ticketResult, cart.tableNo, dispatch, {
      setLoadTicketVisible, setTicketQuery, setTicketResult, setTicketErr, showToast,
    });
  }

  useEffect(() => { loadPaymentConfig().then(setPayConfig); }, []);

  const fetchProducts = useCallback(async (opts: { force?: boolean } = {}) => {
    if (!activeWorkspaceId) return;
    await loadAllProducts(activeWorkspaceId, {
      setProducts,
      onLoadError: (message) => showAppToast({ title: "Couldn't load products", message, type: "error" }),
    }, opts);
  }, [activeWorkspaceId, showAppToast]);

  useEffect(() => {
    let alive = true;
    fetchProducts().finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fetchProducts]);

  useEffect(() => {
    if (!activeWorkspaceId || !getIsConnected()) return;
    invokeFn<{ "order-category-counts": { total: number; by_category: Record<string, number> } }>("pos-data", {
      workspace_id: activeWorkspaceId, resource: "order-category-counts", params: {},
    }).then(({ data }) => {
      const counts = data?.["order-category-counts"];
      if (counts) setCategoryCountsFromServer(counts);
    });
  }, [activeWorkspaceId]);

  async function manualRefreshProducts() {
    setProductsRefreshing(true);
    try { await fetchProducts({ force: true }); } finally { setProductsRefreshing(false); }
  }

  // Intercept Android hardware back + prevent iOS swipe-back crash when there
  // is no screen to return to (cashier lands here directly via Redirect).
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!router.canGoBack()) {
        router.replace("/pos/dashboard");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    loadWorkspaceConfig(activeWorkspaceId, {
      setWorkspaceName, setTaxRatePct, setSvcRatePct, setApplyTax, setApplySvc,
    }).catch(() => {});
  }, [activeWorkspaceId]);

  // Bookable resources (rooms/amenities) are only needed once the cashier opens the
  // Rooms or Amenities tab — fetch lazily on first open instead of on every mount,
  // and only once per screen instance (repeated tab switches don't refetch).
  useEffect(() => {
    if (activeTab !== "room" && activeTab !== "amenity") return;
    if (!activeWorkspaceId || resourcesFetchStarted.current) return;
    resourcesFetchStarted.current = true;
    loadBookableResources(activeWorkspaceId, { setResources })
      .catch(() => {})
      .finally(() => setResourcesLoaded(true));
  }, [activeTab, activeWorkspaceId]);

  // Switch to Rooms tab when navigated here from the "New Booking" button in Book Room tab
  useEffect(() => {
    if (open_tab === "room") setActiveTab("room");
  }, [open_tab]);

  const bookingForm = useBookingForm(cart.customerName, dispatch, showToast);
  const {
    selRes, setSelRes, calendarOpen, setCalendarOpen,
    bCheckIn, setBCheckIn, bCheckOut, setBCheckOut,
    bStartTime, setBStartTime, bEndTime, setBEndTime,
    timePickerOpen, setTimePickerOpen, showBookingModal, setShowBookingModal,
    bGuest, setBGuest, bPhone, setBPhone, bEmail, setBEmail, bNotes, setBNotes,
    bHrsActual, bNights, bIsNightly, bFormTotal, bCanAdd,
    selectResource, handleCalendarConfirm, addBooking,
  } = bookingForm;

  // Pre-load an existing confirmed booking into the cart (all data passed as URL params — no DB fetch)
  useEffect(() => {
    if (!preload_id || !preload_start || !preload_end || !preload_rid) return;
    const { guestName, guestPhone, guestEmail, noteText } = parseNotes(preload_notes ?? null);
    dispatch({
      type: "ADD_BOOKING",
      booking: {
        tempId: `preload-${preload_id}`,
        type: "room",
        resourceId: preload_rid,
        resourceName: preload_rname ?? "Room",
        startISO: preload_start,
        endISO: preload_end,
        guestName, guestPhone, guestEmail,
        notes: noteText,
        hourlyRate: 0,
        branchId: preload_bid || null,
        total: parseFloat(preload_total ?? "0"),
        existingBookingId: preload_id,
      },
    });
    if (guestName) dispatch({ type: "SET_CUSTOMER", name: guestName });
    setActiveTab("room");
    setShowCart(true);
    setShowPay(true);
  }, [preload_id]);

  // Pre-populate cart from edit params (passed when editing an existing pending order)
  useEffect(() => {
    if (!edit_order_id) return;
    setEditOrderId(edit_order_id);
    // Parse and load items into cart
    if (edit_items) {
      try {
        const parsed = JSON.parse(edit_items) as Array<{
          product_id: string; name: string; unit_price: number; quantity: number; notes?: string | null;
        }>;
        const cartItems: CartItem[] = parsed.map(it => ({
          product: { id: it.product_id, name: it.name, price: it.unit_price, category: "Other", image_url: null },
          qty: it.quantity,
          notes: it.notes ?? "",
        }));
        dispatch({ type: "LOAD_ITEMS", items: cartItems });
      } catch { /* ignore malformed JSON */ }
    }
    if (edit_order_type) {
      const validTypes: OrderType[] = ["dine_in", "takeout", "room_service", "walk_in"];
      if (validTypes.includes(edit_order_type as OrderType)) {
        dispatch({ type: "SET_TYPE", orderType: edit_order_type as OrderType });
      }
    }
    if (edit_table_no) dispatch({ type: "SET_TABLE", tableNo: edit_table_no });
    if (edit_notes) dispatch({ type: "SET_CUSTOMER", name: edit_notes });
  }, [edit_order_id]);

  // Product grid zoom (card size) — a fixed physical width in px, the same
  // on phone and tablet, so cards look identical everywhere and only the
  // zoom buttons (or the "1:1" reset) change it. Column count is derived
  // from this in ProductsTab (container width ÷ card width), not the other
  // way around — see ProductTile.tsx for the size constants.
  const cardWidthEff = Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, cardWidth ?? BASE_CARD_WIDTH));

  // Memoized so typing in unrelated fields (search, cash tendered, cart notes, etc.)
  // doesn't re-run the product filter / re-create a new array identity on every render.
  // Seeded from the server-side category-counts call (unpaginated) as well as
  // whatever's loaded so far, so a category whose products haven't scrolled
  // into view yet still shows up as a chip instead of silently missing.
  const categories = useMemo(() => {
    const fromProducts = products.map(p => p.category).filter(Boolean);
    const fromServer = Object.keys(categoryCountsFromServer?.by_category ?? {});
    return ["All", ...Array.from(new Set([...fromProducts, ...fromServer]))];
  }, [products, categoryCountsFromServer]);
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>([["All", categoryCountsFromServer?.total ?? products.length]]);
    for (const [name, count] of Object.entries(categoryCountsFromServer?.by_category ?? {})) {
      map.set(name, count);
    }
    if (!categoryCountsFromServer) {
      for (const p of products) {
        if (!p.category) continue;
        map.set(p.category, (map.get(p.category) ?? 0) + 1);
      }
    }
    return map;
  }, [products, categoryCountsFromServer]);
  const filtered = useMemo(() => products.filter(p => {
    const matchCat = activeCat === "All" || p.category === activeCat;
    const q = search.toLowerCase();
    const matchSearch = !search || p.name.toLowerCase().includes(q) || (p.sku?.toLowerCase().includes(q) ?? false);
    const matchStock = !hideOos || p.stock_status !== "out_of_stock";
    return matchCat && matchSearch && matchStock;
  }), [products, activeCat, search, hideOos]);

  // Stable handler + renderItem identity so FlatList's per-row shouldComponentUpdate
  // (and ProductTile's React.memo) can actually skip unchanged rows.
  const handleProductPress = useCallback((p: Product) => {
    if (p.active === false) {
      showToast("This item is unavailable");
      return;
    }
    if (p.stock_status === "out_of_stock") {
      showToast("Out of stock");
      return;
    }
    if (p.addon_groups && p.addon_groups.length > 0) {
      setPendingAddonProduct(p);
    } else {
      const inCart = cart.items.find(i => i.product.id === p.id);
      dispatch({ type: "ADD", product: p });
      showToast(inCart ? `Already in cart · ×${inCart.qty + 1}` : "Added to cart");
    }
  }, [cart.items, dispatch, showToast]);

  const handleProductDecrement = useCallback((p: Product) => {
    const inCart = cart.items.find(i => i.product.id === p.id);
    if (!inCart) return;
    dispatch({ type: "SET_QTY", id: p.id, qty: inCart.qty - 1 });
  }, [cart.items, dispatch]);

  // Long-press "mark unavailable" / "mark available" toggle — see
  // ProductAvailabilityModal.tsx. order-product-list now returns inactive
  // (but not archived) products too, greyed out via ProductTile's
  // isUnavailable check, so both directions can happen from the same tile —
  // no separate browse panel needed.
  const [pendingAvailabilityProduct, setPendingAvailabilityProduct] = useState<Product | null>(null);
  const [savingAvailability, setSavingAvailability] = useState(false);

  const handleProductLongPress = useCallback((p: Product) => {
    setPendingAvailabilityProduct(p);
  }, []);

  async function confirmToggleAvailability() {
    const p = pendingAvailabilityProduct;
    if (!p) return;
    const makeAvailable = p.active === false;
    setSavingAvailability(true);
    try {
      const { error } = await invokeFn("products-toggle", {
        workspace_id: activeWorkspaceId, product_id: p.id, active: makeAvailable,
      });
      if (error) throw error;
      setProducts(prev => prev.map(pr => pr.id === p.id ? { ...pr, active: makeAvailable } : pr));
      showToast(makeAvailable ? `"${p.name}" is available again` : `"${p.name}" marked unavailable`);
      setPendingAvailabilityProduct(null);
    } catch (e: any) {
      showAppToast({ title: "Couldn't update availability", message: e?.message ?? "Please try again.", type: "error" });
    } finally {
      setSavingAvailability(false);
    }
  }

  const renderProductItem = useCallback(({ item: p }: { item: Product }) => {
    const inCart = cart.items.find(i => i.product.id === p.id);
    return (
      <ProductTile product={p} qtyInCart={inCart?.qty ?? 0} s={s} cardWidth={cardWidthEff} onPress={handleProductPress} onDecrement={handleProductDecrement} onLongPress={handleProductLongPress} />
    );
  }, [cart.items, s, cardWidthEff, handleProductPress, handleProductDecrement, handleProductLongPress]);

  // Memoized so cart totals (and the customer-display sync effect below that depends on
  // them) aren't recomputed on every render — only when the cart or the tax/service inputs
  // that feed the calculation actually change.
  const totals = useMemo(
    () => computeCartTotals(cart, applyTax, taxRatePct, applySvc, svcRatePct),
    [cart, applyTax, taxRatePct, applySvc, svcRatePct],
  );
  const {
    foodSubtotal, bookingTotal, subtotal, tax, serviceFee,
    discount, computedTotal, loyaltyDiscount, voucherDiscount, total,
    itemCount, canCheckout,
  } = totals;
  const cashAmt = parseFloat(cashInput) || 0;
  const change = cashAmt - total;

  useCustomerDisplayMirror({
    cart, subtotal, tax, serviceFee, discount, total, itemCount,
    canCheckout, showPay, payMethod, successOrder, payConfig, cashAmt,
  });

  // ── Label printer helper ──
  // Every call site fires this with a bare `.catch(() => {})` (fire-and-forget
  // right after checkout) — failures used to vanish completely with nothing
  // shown to the cashier. Surfacing here means every call site gets the toast
  // for free instead of needing its own error handling.
  async function printOrderLabel(payload: ReceiptPayload) {
    try {
      await printDrinkLabels(payload, printerConfig);
    } catch (e: any) {
      const msg: string = e?.message ?? "";
      if (!msg.includes("No drink items")) {
        showAppToast({ title: "Drink label failed", message: msg || "Could not print label.", type: "error" });
      }
    }
  }

  // ── Kitchen/drinks ticket printer helper ──
  // Same reasoning as printOrderLabel above — this is the auto-print-on-
  // checkout path, separate from ReceiptModal's own auto-print/manual Print
  // button, so it needs its own failure surfacing rather than relying on theirs.
  async function printOrderTickets(payload: ReceiptPayload) {
    try {
      await printStationTickets(payload, printerConfig);
    } catch (e: any) {
      showAppToast({ title: "Kitchen/Drinks/Server ticket failed", message: e?.message ?? "Could not print ticket.", type: "error" });
    }
  }

  // ── Receipt printer helper ──
  // printerConfig.autoPrint already exists (Settings → Receipt → Auto-Print)
  // and ReceiptModal's own effect already respects it — but that effect only
  // ever runs once the modal is actually visible, and the modal only opened
  // via the cashier manually tapping "View / Print Receipt" on the success
  // screen. Net effect: the receipt never actually auto-printed, online or
  // offline, regardless of the toggle. Mirrors printOrderLabel/
  // printOrderTickets above — fire right after checkout succeeds, independent
  // of whether the receipt modal ever opens.
  async function printOrderReceipt(payload: ReceiptPayload) {
    try {
      const cfg = await loadReceiptConfig();
      await printReceipt(payload, cfg, workspaceName, printerConfig);
    } catch (e: any) {
      showAppToast({ title: "Receipt print failed", message: e?.message ?? "Could not print receipt.", type: "error" });
    }
  }

  // ── Edit order: navigate to a fresh cart screen pre-populated with this order's items ──
  function handleEditOrder() {
    const orderId = ticketResult?.orderId ?? editOrderId;
    if (!orderId) return;

    const rawItems = ticketResult
      ? ticketResult.items.map(it => ({
          product_id: it.productId,
          name: it.name,
          unit_price: it.price,
          quantity: it.qty,
          notes: it.notes ?? null,
        }))
      : cart.items.map(i => ({
          product_id: i.product.id,
          name: i.product.name,
          unit_price: i.product.price,
          quantity: i.qty,
          notes: i.notes || null,
        }));

    setLoadTicketVisible(false);
    router.push({
      pathname: "/pos/order" as any,
      params: {
        edit_order_id: orderId,
        edit_items: JSON.stringify(rawItems),
        edit_order_type: ticketResult ? "" : cart.orderType,
        edit_table_no: ticketResult?.tableNo ?? cart.tableNo ?? "",
        edit_notes: cart.customerName ?? "",
      },
    });
  }

  async function applyDiscountWithApprovalCheck(amount: number, type: "amount" | "percent") {
    const computed = type === "percent" ? subtotal * (Math.min(amount, 100) / 100) : amount;
    if (computed > 500 && !cart.is_senior_pwd) {
      const { data, error } = await invokeFn<{ approval?: { id: string } | null }>("manager-approval-create", {
        workspace_id: activeWorkspaceId,
        branch_id: activeBranchId,
        action_type: "large_discount",
        target_type: "order",
        target_id: null,
        reason: `Large discount ₱${computed.toFixed(2)}`,
        metadata: { amount: computed },
      });
      if (error || !data?.approval?.id) {
        showToast("Could not request approval");
        return;
      }
      setPendingDiscount({ amount, discountType: type });
      setDiscApprovalId(data.approval.id);
      setShowDiscApprovalModal(true);
    } else {
      dispatch({ type: "SET_DISCOUNT_TYPE", discountType: type });
      dispatch({ type: "SET_DISCOUNT", amount });
    }
  }

  async function submitOrder() {
    if (!canCheckout) return;
    if (!activeBranchId) {
      showAppToast({ title: "No branch selected", message: "Please select a branch in workspace settings.", type: "error" });
      return;
    }
    setSubmitting(true);

    // ── Edit mode: update the existing pending order, skip payment flow ──
    if (editOrderId && activeWorkspaceId) {
      try {
        const updateItems = cart.items.map(i => ({
          product_id: i.product.id,
          quantity: i.qty,
          unit_price: i.product.price,
          notes: i.notes || undefined,
        }));
        const { error } = await ordersUpdatePending({
          orderId: editOrderId,
          workspaceId: activeWorkspaceId,
          items: updateItems,
          orderType: cart.orderType,
          tableNo: cart.tableNo || null,
          notes: cart.customerName || null,
        });
        if (error) throw error;
        showAppToast({ title: "Changes saved", message: "The order has been updated.", type: "success" });
        setEditOrderId(null);
        router.back();
      } catch (e: any) {
        showAppToast({ title: "Update failed", message: e?.message ?? "Unknown error", type: "error" });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Tracked across the try block so the catch below can tell whether a
    // network failure happened before or after the order was committed
    // server-side — see the comment at orderCreated = true below.
    let orderCreated = false;
    let lastOrderNo: string | undefined;
    // False only when settleFoodPaymentOrQueue had to queue the payment leg
    // for retry (the order itself still succeeded) — used below to soften
    // the success toast instead of claiming the order is fully settled.
    let paymentSettled = true;
    try {
      const notes = buildOrderNotes(cart.customerName, refNumber, cart.internalNote);

      // Unpaid "open tab" — a food order (no bookings) created owing the full
      // total, with no payment collected now. Settled later via Transactions →
      // Collect Balance. Guarded on the same conditions as the Unpaid button.
      const isUnpaidOrder = payUnpaid && cart.items.length > 0 && cart.bookings.length === 0;

      if (!getIsConnected() && cart.bookings.length > 0) {
        throw new Error("Room and amenity bookings require internet. Remove bookings from cart to proceed offline.");
      }
      if (!getIsConnected() && isUnpaidOrder) {
        throw new Error("Unpaid tabs require internet. Take payment now to check out offline.");
      }

      const orderItems = buildOrderItems(cart);
      const orderBody = buildOrderBody({
        activeWorkspaceId, activeBranchId, cart, notes, taxRatePct, svcRatePct,
        applyTax, applySvc,
        discount, loyaltyDiscount, selectedCustomerId: selectedCustomer?.id,
        currentShiftId, orderItems, unpaid: isUnpaidOrder,
      });

      if (!getIsConnected()) {
        const offlinePayload = await submitOfflineOrder({
          orderBody, payMethod, workspaceId: activeWorkspaceId, branchId: activeBranchId,
          cashInput, total, cart, subtotal, tax, taxRatePct, serviceFee, svcRatePct,
          discount, cashAmt, change, refNumber, selectedCustomerId: selectedCustomer?.id,
        });
        setSuccessOrder(offlinePayload);
        if (printerConfig.autoPrint) printOrderReceipt(offlinePayload).catch(() => {});
        if (printerConfig.labelAutoPrint) printOrderLabel(offlinePayload).catch(() => {});
        if (printerConfig.ticketAutoPrint) printOrderTickets(offlinePayload).catch(() => {});
        setShowPay(false);
        return;
      }

      // getIsConnected() above only reflects the last known connectivity
      // state, not the health of the connection right now — a flaky-but-
      // associated WiFi still reads "connected" and commits to this online
      // path, then orders-create's request can fail against the bad link.
      // Since nothing else has been sent to the server yet at this point
      // (payment/booking confirmation only happen after this returns), a
      // network failure here is safe to silently retry via the offline
      // queue — same as if getIsConnected() had said false to begin with —
      // instead of surfacing a raw "Failed to send a request" toast and
      // making the cashier manually toggle WiFi off to force that path.
      const orderIdemKey = makeIdemKey("order");
      let orderId: string;
      let orderData: { order: { id: string; order_no?: string | null; total: number | string } };
      try {
        ({ orderId, orderData } = await createOrderWithCharges(orderBody, cart, {
          activeWorkspaceId, activeBranchId, selectedCustomerId: selectedCustomer?.id,
        }, orderIdemKey));
      } catch (e) {
        if (e instanceof OrderNetworkError) {
          // Bookings/unpaid tabs can't be queued offline (see the pre-flight
          // guards above) — falling back here would silently drop them.
          if (cart.bookings.length > 0 || isUnpaidOrder) {
            throw new Error(
              cart.bookings.length > 0
                ? "No internet connection. Room and amenity bookings require internet — try again once connected."
                : "No internet connection. Unpaid tabs require internet — take payment now to check out offline.",
            );
          }
          const offlinePayload = await submitOfflineOrder({
            orderBody, payMethod, workspaceId: activeWorkspaceId, branchId: activeBranchId,
            cashInput, total, cart, subtotal, tax, taxRatePct, serviceFee, svcRatePct,
            discount, cashAmt, change, refNumber, selectedCustomerId: selectedCustomer?.id, orderIdemKey,
          });
          setSuccessOrder(offlinePayload);
          if (printerConfig.autoPrint) printOrderReceipt(offlinePayload).catch(() => {});
          if (printerConfig.labelAutoPrint) printOrderLabel(offlinePayload).catch(() => {});
          if (printerConfig.ticketAutoPrint) printOrderTickets(offlinePayload).catch(() => {});
          setShowPay(false);
          showAppToast({ title: "Saved offline", message: "No internet connection — order saved and will sync automatically once you're back online.", type: "success" });
          return;
        }
        throw e;
      }
      // From here on the order is committed server-side — a network failure
      // in any step below must NOT trigger the same offline-queue fallback
      // (it would create a second, duplicate order under a fresh Idempotency-
      // Key). The catch block below instead tells the cashier the order may
      // already exist and to check Order History rather than retry blindly.
      orderCreated = true;
      lastOrderNo = orderData.order.order_no ?? undefined;

      const isBookingOnly = cart.items.length === 0 && cart.bookings.length > 0;

      // Food-order portion only — orders-create's total never includes booking
      // prices (bookings are billed separately below), so this must not run for
      // booking-only carts or it would settle against a bogus order.total of 0.
      // Runs for every single-method payment (cash or e-payment) — "split" is
      // settled separately below via two payments-cash-confirm calls, one per
      // leg. Without this, a non-cash food order was never marked paid/completed
      // and never got a payment_intents/transactions row — it just sat as an
      // orphaned Pending order with no revenue recorded anywhere.
      if (!isUnpaidOrder && payMethod !== "split" && cart.items.length > 0) {
        // When bookings are also in the cart, cashInput/total reflect the whole
        // combined amount handed over — but this call only settles the food
        // order, so it must report just the order's own (booking-exclusive) due
        // amount, not the full cash tendered, or the stored receipt's
        // cash_received/change would be inflated by the booking portion.
        // cashInput only ever means something for an actual cash payment — for
        // any other method it must not be consulted at all, or a stale value
        // left over from switching off "Cash" gets sent as cash_received and
        // the server's cash-vs-total guard rejects a perfectly good GCash/Maya/
        // card payment with "Cash received less than amount due".
        const orderCashReceived = cart.bookings.length > 0
          ? Number(orderData.order.total)
          : (payMethod === "cash" ? (parseFloat(cashInput) || total) : total);
        let amountTendered: number | undefined;
        if (payPartial && partialAmtInput) {
          const partialNum = parseFloat(partialAmtInput);
          if (partialNum > 0 && partialNum < total) amountTendered = partialNum;
        }
        paymentSettled = await settleFoodPaymentOrQueue(orderId, lastOrderNo ?? orderId, { activeWorkspaceId, activeBranchId }, {
          cashReceived: orderCashReceived, paymentMethod: payMethod, amountTendered, idemSuffix: `pay_${orderId}`,
        });
      }

      const { conflictNames, failedNames, confirmed: confirmedBookings } = await confirmBookings(cart.bookings, orderId, activeWorkspaceId, activeBranchId);

      // Settle each booking against its own booking_id — not the order's — so a
      // real payment_intent/transaction/receipt is created per booking (visible to
      // the Z-report, and satisfies bookings-cancel's "already paid" guard, which
      // only checks payment_intents.booking_id). This runs for both booking-only
      // and mixed (food + booking) carts; previously it only ran for booking-only
      // carts paid by non-cash methods, so cash bookings and any booking mixed
      // into a food order never got a real settlement record at all.
      if (bookPayMode !== "unpaid") {
        if (payMethod === "cash") {
          for (const { cartItem, bookingId } of confirmedBookings) {
            const useDeposit = isBookingOnly && bookPayMode === "deposit" && confirmedBookings.length === 1 && depositAmt;
            const cashBody: Record<string, unknown> = {
              workspace_id: activeWorkspaceId,
              branch_id: activeBranchId,
              booking_id: bookingId,
              cash_received: useDeposit ? parseFloat(depositAmt) : cartItem.total,
            };
            if (useDeposit) cashBody.custom_amount = parseFloat(depositAmt);
            await supabase.functions.invoke("payments-cash-confirm", {
              body: cashBody,
              headers: { "Idempotency-Key": makeIdemKey(`paybk_${bookingId}`) },
            }).catch(e => console.warn("payments-cash-confirm (booking) failed:", bookingId, e));
          }
        } else if (confirmedBookings.length > 0) {
          await settleBookingsViaEpayment(confirmedBookings.length, orderId, activeWorkspaceId, {
            paymentStatus: bookPayMode === "deposit" ? "partial" : "paid",
            refNumber, depositAmount: bookPayMode === "deposit" && depositAmt ? parseFloat(depositAmt) : undefined,
            payMethod,
          });
        }
      }
      if (conflictNames.length > 0) {
        showToast(`Double booking conflict: ${conflictNames.join(", ")} — slot already taken`);
      }
      if (failedNames.length > 0) {
        // Previously silent: a hold/confirm failure for one of these bookings
        // meant the order still completed "successfully" with that booking
        // simply missing, no error ever shown to the cashier.
        showAppToast({ title: "Booking not confirmed", message: `${failedNames.join(", ")} could not be booked and was NOT added to this order. Please book it separately.`, type: "error" });
      }

      const isBookingOnlyOrder = cart.items.length === 0 && cart.bookings.length > 0;
      const depositAmtNum = parseFloat(depositAmt) || 0;
      const bkCashAmt = parseFloat(cashInput) || 0;
      const bkChange = bkCashAmt - (isBookingOnlyOrder && bookPayMode === "deposit" ? depositAmtNum : total);
      const partialAmtNum = !isBookingOnlyOrder && payPartial ? (parseFloat(partialAmtInput) || 0) : 0;
      const isPartialOrder = partialAmtNum > 0 && partialAmtNum < total;
      const successPayload = {
        orderNo: orderData.order.order_no ?? "—",
        orderId,
        items: buildReceiptItems(cart),
        bookings: buildReceiptBookings(cart, { includeRef: true }),
        charges: buildReceiptCharges(cart),
        subtotal, tax, taxRatePct, serviceFee, svcRatePct,
        discount, total,
        cashAmt: isUnpaidOrder ? 0 : isBookingOnlyOrder ? bkCashAmt : cashAmt,
        change: isUnpaidOrder ? 0 : isBookingOnlyOrder ? bkChange : change,
        payMethod, refNumber,
        bookPayMode: isBookingOnlyOrder ? bookPayMode : undefined,
        depositPaid: isBookingOnlyOrder && bookPayMode === "deposit" ? depositAmtNum : undefined,
        amountPaid: isUnpaidOrder ? 0 : isPartialOrder ? partialAmtNum : undefined,
        balanceDue: isUnpaidOrder ? total : isPartialOrder ? +(total - partialAmtNum).toFixed(2) : undefined,
        orderType: cart.orderType,
        tableNo: cart.tableNo,
        customerName: cart.customerName,
        internalNote: cart.internalNote || undefined,
        floor: cart.floor || undefined,
        cashierName: userName ?? undefined,
        timestamp: new Date().toISOString(),
        is_senior_pwd: cart.is_senior_pwd,
        voucherDiscount: voucherDiscount > 0 ? voucherDiscount : undefined,
        appliedVoucherCode: cart.applied_voucher?.code ?? undefined,
      };
      setSuccessOrder(successPayload);
      if (printerConfig.autoPrint) printOrderReceipt(successPayload).catch(() => {});
      if (printerConfig.labelAutoPrint) printOrderLabel(successPayload).catch(() => {});
      if (printerConfig.ticketAutoPrint) printOrderTickets(successPayload).catch(() => {});
      setShowPay(false);
      if (!paymentSettled) {
        // Order itself succeeded — don't call this a failure. It's queued
        // and will self-heal (offlineQueue.ts's flushPaymentRows), same as an
        // offline order's payment leg. Surfaced separately from the normal
        // success path so the cashier knows to watch for it if it doesn't
        // clear on its own.
        showAppToast({
          title: "Order placed — payment pending sync",
          message: `Order ${lastOrderNo ? `#${lastOrderNo} ` : ""}was created, but confirming the payment failed. We'll keep retrying automatically — check "Orders needing attention" if it doesn't clear.`,
          type: "error",
        });
      }

      awardLoyaltyPoints(selectedCustomer?.id, orderId, activeWorkspaceId, total);
    } catch (e: any) {
      if (isNetworkError(e) && orderCreated) {
        showAppToast({
          title: "Connection lost",
          message: `Order ${lastOrderNo ? `#${lastOrderNo} ` : ""}may already be saved — check Order History before retrying, so you don't create a duplicate.`,
          type: "error",
        });
      } else if (isNetworkError(e)) {
        showAppToast({ title: "No internet connection", message: "Couldn't reach the server. Check your connection and try again.", type: "error" });
      } else {
        showAppToast({ title: "Order failed", message: e?.message ?? "Unknown error", type: "error" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleSuccess() {
    applyHandleSuccess(dispatch, {
      setShowReceipt, setSuccessOrder, setCashInput, setPayMethod, setRefNumber,
      setSelRes, setBCheckIn, setBCheckOut, setActiveTab,
      setPayPartial, setPartialAmtInput, setPayUnpaid,
    });
    setCustomerLoyalty(null);
    dispatch({ type: "CLEAR_LOYALTY" });
  }

  function handleCustomerChange(c: Customer | null) {
    setSelectedCustomer(c);
    dispatch({ type: "SET_CUSTOMER", name: c?.name ?? "" });
    dispatch({ type: "CLEAR_LOYALTY" });
    if (c?.id && activeWorkspaceId) {
      invokeFn<LoyaltyBalanceResponse>("loyalty-balance", { workspace_id: activeWorkspaceId, customer_id: c.id })
        .then(({ data }) => {
          if (data && typeof data.balance === "number") {
            setCustomerLoyalty({
              balance: data.balance,
              peso_value: data.balance * (data.rules?.peso_per_point ?? 0.01),
              rules: data.rules ?? undefined,
            });
          } else {
            setCustomerLoyalty(null);
          }
        })
        .catch(() => setCustomerLoyalty(null));
    } else {
      setCustomerLoyalty(null);
    }
  }

  const handleRedeemPoints = useCallback(() => {
    if (!selectedCustomer?.id || !customerLoyalty?.rules) return;
    const rules = customerLoyalty.rules;
    const balance = customerLoyalty.balance;
    if (balance < (rules.min_redeem_points ?? 100)) {
      showAppToast({ title: "Insufficient Points", message: `Minimum ${rules.min_redeem_points ?? 100} points required to redeem.`, type: "error" });
      return;
    }
    const maxPesoFromPoints = balance * (rules.peso_per_point ?? 0.01);
    const maxPesoAllowed = computedTotal * ((rules.max_redeem_pct ?? 50) / 100);
    const pesoToRedeem = Math.min(maxPesoFromPoints, maxPesoAllowed);
    const pointsToRedeem = Math.ceil(pesoToRedeem / (rules.peso_per_point ?? 0.01));
    const actualPeso = +(pointsToRedeem * (rules.peso_per_point ?? 0.01)).toFixed(2);
    dispatch({ type: "SET_LOYALTY_REDEEM", payload: { points: pointsToRedeem, peso_value: actualPeso } });
  }, [selectedCustomer, customerLoyalty, computedTotal, dispatch]);

  async function handleSplitConfirm(split: { method1: SplitMethod; method2: SplitMethod }) {
    if (!canCheckout || !activeBranchId || !activeWorkspaceId) return;
    // Keep the Pay modal open (showing its "Processing…" spinner) through all
    // the awaited calls below — closing it here left the cashier staring at a
    // bare order screen with zero feedback for the 2-5s it takes to create the
    // order, settle both payment legs sequentially, and confirm bookings,
    // which read as the app having silently ignored the tap.
    setSubmitting(true);
    // See submitOrder()'s orderCreated/lastOrderNo — same reasoning: once the
    // order is committed server-side, a network failure in a later step must
    // not be treated the same as one before it.
    let orderCreated = false;
    let lastOrderNo: string | undefined;
    // False only when one or both legs had to be queued for retry (the order
    // itself still succeeded) — see submitOrder()'s paymentSettled for the
    // same pattern.
    let paymentSettled = true;
    try {
      // Same guard as submitOrder()'s single-method path: bookings are
      // confirmed via a separate post-creation step (confirmBookings /
      // settleBookingsViaEpayment below) that the offline queue has no way
      // to replay — it only knows how to redo orders-create and the payment
      // legs. Queuing a booking order offline would silently create the food
      // order on sync while dropping every booking from it.
      if (!getIsConnected() && cart.bookings.length > 0) {
        throw new Error("No internet connection. Room and amenity bookings require internet — try again once connected.");
      }

      const notes = buildOrderNotes(cart.customerName, refNumber, cart.internalNote);
      const orderItems = buildOrderItems(cart);
      const orderBody = buildOrderBody({
        activeWorkspaceId, activeBranchId, cart, notes, taxRatePct, svcRatePct,
        applyTax, applySvc,
        discount, loyaltyDiscount, selectedCustomerId: selectedCustomer?.id,
        currentShiftId, orderItems,
      });

      if (!getIsConnected()) {
        const offlinePayload = await submitOfflineSplitOrder({
          orderBody, method1: split.method1, method2: split.method2,
          workspaceId: activeWorkspaceId, branchId: activeBranchId, cart,
          subtotal, tax, taxRatePct, serviceFee, svcRatePct, discount, total,
          selectedCustomerId: selectedCustomer?.id,
        });
        setSuccessOrder(offlinePayload);
        setShowSplitModal(false);
        setShowPay(false);
        if (printerConfig.autoPrint) printOrderReceipt(offlinePayload).catch(() => {});
        if (printerConfig.labelAutoPrint) printOrderLabel(offlinePayload).catch(() => {});
        if (printerConfig.ticketAutoPrint) printOrderTickets(offlinePayload).catch(() => {});
        showAppToast({ title: "Saved offline", message: "No internet connection — order saved and will sync automatically once you're back online.", type: "success" });
        return;
      }

      let orderId: string;
      let orderData: { order: { id: string; order_no?: string | null; total: number | string } };
      const orderIdemKey = makeIdemKey("order");
      try {
        ({ orderId, orderData } = await createOrderWithCharges(orderBody, cart, {
          activeWorkspaceId, activeBranchId, selectedCustomerId: selectedCustomer?.id,
        }, orderIdemKey));
      } catch (e) {
        if (e instanceof OrderNetworkError) {
          // Bookings can't be queued offline (see the pre-flight guard
          // above) — falling back here would silently drop them even though
          // getIsConnected() said "connected" a moment ago.
          if (cart.bookings.length > 0) {
            throw new Error("No internet connection. Room and amenity bookings require internet — try again once connected.");
          }
          const offlinePayload = await submitOfflineSplitOrder({
            orderBody, method1: split.method1, method2: split.method2,
            workspaceId: activeWorkspaceId, branchId: activeBranchId, cart,
            subtotal, tax, taxRatePct, serviceFee, svcRatePct, discount, total,
            selectedCustomerId: selectedCustomer?.id, orderIdemKey,
          });
          setSuccessOrder(offlinePayload);
          setShowSplitModal(false);
          setShowPay(false);
          if (printerConfig.autoPrint) printOrderReceipt(offlinePayload).catch(() => {});
          if (printerConfig.labelAutoPrint) printOrderLabel(offlinePayload).catch(() => {});
          if (printerConfig.ticketAutoPrint) printOrderTickets(offlinePayload).catch(() => {});
          showAppToast({ title: "Saved offline", message: "No internet connection — order saved and will sync automatically once you're back online.", type: "success" });
          return;
        }
        throw e;
      }
      orderCreated = true;
      lastOrderNo = orderData.order.order_no ?? undefined;

      // Both legs settle the SAME order — firing them with Promise.all races
      // two concurrent reads/writes of the same balance_due and can silently
      // lose one leg's money, so they stay sequential. A leg that fails is no
      // longer fatal to the whole checkout: settleSplitPaymentsOrQueue queues
      // just the leg(s) that didn't settle for retry (see its own doc for why
      // that's safe per-leg), the same way settleFoodPaymentOrQueue does for
      // the single-method path.
      paymentSettled = await settleSplitPaymentsOrQueue(orderId, lastOrderNo ?? orderId, { activeWorkspaceId, activeBranchId }, [
        { cashReceived: split.method1.amount, paymentMethod: split.method1.method, amountTendered: split.method1.amount,
          idemSuffix: `split1_${orderId}`, errorLabel: `Split payment (${split.method1.method})` },
        { cashReceived: split.method2.amount, paymentMethod: split.method2.method, amountTendered: split.method2.amount,
          idemSuffix: `split2_${orderId}`, errorLabel: `Split payment (${split.method2.method})` },
      ]);

      const { conflictNames, failedNames, confirmed: confirmedBookings } = await confirmBookings(cart.bookings, orderId, activeWorkspaceId, activeBranchId);
      // Split payment has no deposit/partial concept for bookings — a booking
      // reached via split payment is always settled in full, same as the
      // non-cash branch of the single-payment-method flow above.
      await settleBookingsViaEpayment(confirmedBookings.length, orderId, activeWorkspaceId, {
        paymentStatus: "paid", refNumber, payMethod: "split",
      });
      if (conflictNames.length > 0) {
        showToast(`Double booking conflict: ${conflictNames.join(", ")} — slot already taken`);
      }
      if (failedNames.length > 0) {
        // Previously silent: a hold/confirm failure for one of these bookings
        // meant the order still completed "successfully" with that booking
        // simply missing, no error ever shown to the cashier.
        showAppToast({ title: "Booking not confirmed", message: `${failedNames.join(", ")} could not be booked and was NOT added to this order. Please book it separately.`, type: "error" });
      }

      const successPayload: ReceiptPayload = {
        orderNo: orderData.order.order_no ?? "—",
        orderId,
        items: buildReceiptItems(cart),
        bookings: buildReceiptBookings(cart),
        charges: buildReceiptCharges(cart),
        subtotal, tax, taxRatePct, serviceFee, svcRatePct,
        discount, total,
        cashAmt: split.method1.amount + split.method2.amount,
        change: 0,
        payMethod: `split:${split.method1.method}+${split.method2.method}`,
        refNumber: "",
        splitPayments: [
          { method: split.method1.method, amount: split.method1.amount, refNumber: split.method1.reference || undefined },
          { method: split.method2.method, amount: split.method2.amount, refNumber: split.method2.reference || undefined },
        ],
        orderType: cart.orderType, tableNo: cart.tableNo, customerName: cart.customerName,
        internalNote: cart.internalNote || undefined,
        floor: cart.floor || undefined,
        cashierName: userName ?? undefined,
        timestamp: new Date().toISOString(),
        is_senior_pwd: cart.is_senior_pwd,
        voucherDiscount: voucherDiscount > 0 ? voucherDiscount : undefined,
        appliedVoucherCode: cart.applied_voucher?.code ?? undefined,
      };
      setSuccessOrder(successPayload);
      setShowSplitModal(false);
      setShowPay(false);
      if (printerConfig.autoPrint) printOrderReceipt(successPayload).catch(() => {});
      if (printerConfig.labelAutoPrint) printOrderLabel(successPayload).catch(() => {});
      if (printerConfig.ticketAutoPrint) printOrderTickets(successPayload).catch(() => {});
      if (!paymentSettled) {
        showAppToast({
          title: "Order placed — payment pending sync",
          message: `Order ${lastOrderNo ? `#${lastOrderNo} ` : ""}was created, but confirming one or both split payment legs failed. We'll keep retrying automatically — check "Orders needing attention" if it doesn't clear.`,
          type: "error",
        });
      }

      awardLoyaltyPoints(selectedCustomer?.id, orderId, activeWorkspaceId, total);
    } catch (e: any) {
      if (isNetworkError(e) && orderCreated) {
        showAppToast({
          title: "Connection lost",
          message: `Order ${lastOrderNo ? `#${lastOrderNo} ` : ""}may already be saved — check Order History before retrying, so you don't create a duplicate.`,
          type: "error",
        });
      } else {
        showAppToast({ title: "Split payment failed", message: e?.message ?? "Unknown error", type: "error" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const tabResources = resources.filter(r => r.type === activeTab);
  const gcashNameLine = payConfig.gcashName ? `\n${payConfig.gcashName}` : "";
  const mayaNameLine = payConfig.mayaName ? `\n${payConfig.mayaName}` : "";

  if (role === "cashier" && shiftGate.loaded && (!shiftGate.shiftOpen || !shiftGate.clockedIn)) {
    return <ShiftGateBlock gate={shiftGate} />;
  }

  /* ── Render ── */
  return (
    <View style={s.root}>
      <Stack.Screen options={{ gestureEnabled: router.canGoBack() }} />
      <OrderScreenHeader
        isPhoneMode={isPhoneMode}
        openSidebar={openSidebar}
        router={router}
        editOrderId={editOrderId}
        shiftCashier={shiftCashier}
        onLoadTicket={() => { setLoadTicketVisible(true); setTicketQuery(""); setTicketResult(null); setTicketErr(null); }}
        onRefreshProducts={manualRefreshProducts}
        productsRefreshing={productsRefreshing}
        fullscreen={fullscreen}
        onToggleFullscreen={toggleFullscreen}
        isTablet={isTablet}
        itemCount={itemCount}
        onOpenCart={() => setShowCart(true)}
        paddingTop={insets.top > 0 ? insets.top : 12}
        paddingLeft={Math.max(insets.left, 16)}
        paddingRight={Math.max(insets.right, 16)}
        C={C}
        s={s}
      />

      <OfflineBanner />

      <View style={[s.body, isTablet && s.bodyTablet]}>
        {/* ── Left: products / amenity / room ── */}
        <View style={[s.productArea, isTablet && s.productAreaTablet]}>
          {/* Tab bar */}
          <View style={s.tabBar}>
            {TABS.map(t => (
              <Pressable
                key={t.id}
                style={[s.tabBtn, activeTab === t.id && s.tabBtnActive]}
                onPress={() => { setActiveTab(t.id); setSelRes(null); }}
              >
                <Text style={[s.tabBtnText, activeTab === t.id && s.tabBtnTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {activeTab === "products" ? (
            <ProductsTab
              search={search} setSearch={setSearch}
              activeCat={activeCat} setActiveCat={setActiveCat}
              categories={categories}
              categoryCounts={categoryCounts}
              filtered={filtered}
              products={products}
              hideOos={hideOos} setHideOos={setHideOos}
              oosToggleW={oosToggleW} setOosToggleW={setOosToggleW}
              cardWidthEff={cardWidthEff}
              setCardWidth={setCardWidth}
              loading={loading && products.length === 0}
              showCatScrollHint={showCatScrollHint}
              catScrollViewportW={catScrollViewportW}
              evalCatScrollHint={evalCatScrollHint}
              renderProductItem={renderProductItem}
              s={s} C={C}
            />
          ) : (
            /* ── Amenity / Room tab ── */
            <ResourcesTab
              activeTab={activeTab}
              resourcesLoaded={resourcesLoaded}
              tabResources={tabResources}
              selRes={selRes} setSelRes={setSelRes}
              onSelectResource={selectResource}
              bCheckIn={bCheckIn} setBCheckIn={setBCheckIn}
              bCheckOut={bCheckOut} setBCheckOut={setBCheckOut}
              bStartTime={bStartTime} bEndTime={bEndTime}
              bGuest={bGuest} setBGuest={setBGuest}
              bNotes={bNotes} setBNotes={setBNotes}
              bHrsActual={bHrsActual}
              bNights={bNights} bIsNightly={bIsNightly}
              bFormTotal={bFormTotal} bCanAdd={bCanAdd}
              onAddBooking={addBooking}
              setCalendarOpen={setCalendarOpen}
              setTimePickerOpen={setTimePickerOpen}
              setShowBookingModal={setShowBookingModal}
              s={s} C={C}
            />
          )}

          {toast !== null && (
            <Animated.View style={[s.toast, { opacity: toastAnim }]}>
              <Text style={s.toastText}>{toast}</Text>
            </Animated.View>
          )}
        </View>

        {/* ── Cart (tablet inline) ── */}
        {isTablet && (
          <CartPanel
            cart={cart} dispatch={dispatch}
            total={total} subtotal={subtotal}
            foodSubtotal={foodSubtotal} bookingTotal={bookingTotal}
            tax={tax} serviceFee={serviceFee} discount={discount}
            taxRatePct={taxRatePct} svcRatePct={svcRatePct}
            canCheckout={canCheckout}
            onCheckout={editOrderId
              ? () => submitOrder()
              : () => { setBookPayMode("full"); setDepositAmt(""); setCashInput(""); setPayPartial(false); setPartialAmtInput(""); setPayUnpaid(false); setShowPay(true); }}
            onAddCharge={() => setShowChargeModal(true)}
            onDiscountApply={applyDiscountWithApprovalCheck}
            selectedCustomer={selectedCustomer}
            onCustomerChange={handleCustomerChange}
            workspaceId={activeWorkspaceId}
            customerLoyalty={customerLoyalty}
            onRedeemPoints={handleRedeemPoints}
            onClearLoyalty={() => dispatch({ type: "CLEAR_LOYALTY" })}
            onHold={() => heldCartsApi.holdCart().catch(console.error)}
            heldCartsCount={heldCartsApi.heldCarts.length}
            onOpenHeldCarts={() => heldCartsApi.setHeldCartsModalVisible(true)}
          />
        )}
      </View>

      {/* Mobile cart bar */}
      {!isTablet && itemCount > 0 && (
        <View style={[s.mobileCartBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable style={s.mobileCartBtn} onPress={() => setShowCart(true)}>
            <Text style={s.mobileCartBtnLeft}>{itemCount} item{itemCount !== 1 ? "s" : ""}</Text>
            <Text style={s.mobileCartBtnMid}>View Cart</Text>
            <Text style={s.mobileCartBtnRight}>{peso(total)}</Text>
          </Pressable>
        </View>
      )}

      {/* Mobile cart sheet */}
      <SheetModal
        visible={showCart && !isTablet}
        onClose={() => setShowCart(false)}
        backdropStyle={s.modalBd}
        sheetStyle={s.cartSheet}
      >
        <CartPanel
          cart={cart} dispatch={dispatch}
          total={total} subtotal={subtotal}
          foodSubtotal={foodSubtotal} bookingTotal={bookingTotal}
          tax={tax} serviceFee={serviceFee} discount={discount}
          taxRatePct={taxRatePct} svcRatePct={svcRatePct}
          canCheckout={canCheckout}
          onCheckout={editOrderId
            ? () => { setShowCart(false); submitOrder(); }
            : () => { setShowCart(false); setBookPayMode("full"); setDepositAmt(""); setCashInput(""); setPayPartial(false); setPartialAmtInput(""); setPayUnpaid(false); setShowPay(true); }}
          onAddCharge={() => { setShowCart(false); setShowChargeModal(true); }}
          onDiscountApply={applyDiscountWithApprovalCheck}
          sheetMode
          selectedCustomer={selectedCustomer}
          onCustomerChange={handleCustomerChange}
          workspaceId={activeWorkspaceId}
          customerLoyalty={customerLoyalty}
          onRedeemPoints={handleRedeemPoints}
          onClearLoyalty={() => dispatch({ type: "CLEAR_LOYALTY" })}
          onHold={() => { setShowCart(false); heldCartsApi.holdCart().catch(console.error); }}
          heldCartsCount={heldCartsApi.heldCarts.length}
          onOpenHeldCarts={() => { setShowCart(false); heldCartsApi.setHeldCartsModalVisible(true); }}
        />
      </SheetModal>

      {/* Pay modal — full-screen two-column */}
      <PayModal
        visible={showPay}
        onClose={() => setShowPay(false)}
        payMethod={payMethod} setPayMethod={setPayMethod}
        refNumber={refNumber} setRefNumber={setRefNumber}
        cashInput={cashInput} setCashInput={setCashInput}
        splitM1={splitM1} setSplitM1={setSplitM1}
        splitM2={splitM2} setSplitM2={setSplitM2}
        splitA1={splitA1} setSplitA1={setSplitA1}
        splitA2={splitA2} setSplitA2={setSplitA2}
        splitR1={splitR1} setSplitR1={setSplitR1}
        splitR2={splitR2} setSplitR2={setSplitR2}
        payPartial={payPartial} setPayPartial={setPayPartial}
        payUnpaid={payUnpaid} setPayUnpaid={setPayUnpaid}
        partialAmtInput={partialAmtInput} setPartialAmtInput={setPartialAmtInput}
        depositAmt={depositAmt} setDepositAmt={setDepositAmt}
        bookPayMode={bookPayMode} setBookPayMode={setBookPayMode}
        applyTax={applyTax} setApplyTax={setApplyTax}
        applySvc={applySvc} setApplySvc={setApplySvc}
        payScrollRef={payScrollRef}
        cart={cart}
        total={total}
        discount={discount}
        tax={tax}
        serviceFee={serviceFee}
        change={change}
        taxRatePct={taxRatePct}
        svcRatePct={svcRatePct}
        setSvcRatePct={setSvcRatePct}
        submitting={submitting}
        payConfig={payConfig}
        gcashNameLine={gcashNameLine}
        mayaNameLine={mayaNameLine}
        selectedCustomer={selectedCustomer}
        onCustomerChange={handleCustomerChange}
        workspaceId={activeWorkspaceId}
        onSplitConfirm={handleSplitConfirm}
        onSubmit={submitOrder}
        bottomInset={insets.bottom}
        s={s}
        C={C}
      />

      {/* Load Ticket modal — centered dialog */}
      <LoadTicketModal
        visible={loadTicketVisible}
        onClose={() => setLoadTicketVisible(false)}
        query={ticketQuery}
        onQueryChange={(v) => { setTicketQuery(v); setTicketResult(null); setTicketErr(null); }}
        loading={ticketLoading}
        error={ticketErr}
        result={ticketResult}
        onLookup={lookupTicket}
        onAddToCart={addTicketToCart}
        onCancelOrder={() => { cancelApi.setCancelReason(""); cancelApi.setCancelModalVisible(true); }}
        onEditOrder={handleEditOrder}
        bottomInset={insets.bottom}
        s={s}
        C={C}
      />

      {/* Held Carts modal — up to MAX_HELD_CARTS parked carts, tap to resume or discard */}
      <HeldCartsModal
        visible={heldCartsApi.heldCartsModalVisible}
        onClose={() => heldCartsApi.setHeldCartsModalVisible(false)}
        heldCarts={heldCartsApi.heldCarts}
        onResume={(id) => { heldCartsApi.resumeHeldCart(id).catch(console.error); }}
        onDiscard={(id) => { heldCartsApi.discardHeldCart(id).catch(console.error); }}
        s={s}
        C={C}
      />

      {/* Cancel Order Modal */}
      <CancelOrderModal
        visible={cancelApi.cancelModalVisible}
        onClose={() => cancelApi.setCancelModalVisible(false)}
        reason={cancelApi.cancelReason}
        onReasonChange={cancelApi.setCancelReason}
        cancelling={cancelApi.cancelling}
        onConfirm={() => cancelApi.confirmCancelOrder()}
        bottomInset={insets.bottom}
        s={s}
        C={C}
      />

      {/* Mark Unavailable / Mark Available confirm — long-press on a product tile */}
      <ProductAvailabilityModal
        product={pendingAvailabilityProduct}
        onClose={() => setPendingAvailabilityProduct(null)}
        saving={savingAvailability}
        onConfirm={() => confirmToggleAvailability()}
        s={s}
        C={C}
      />

      {/* Room Booking Modal */}
      <RoomBookingModal
        visible={showBookingModal}
        onClose={() => setShowBookingModal(false)}
        onPickDates={() => { setShowBookingModal(false); setCalendarOpen(true); }}
        selRes={selRes}
        bStartTime={bStartTime} setBStartTime={setBStartTime}
        bEndTime={bEndTime} setBEndTime={setBEndTime}
        bGuest={bGuest} setBGuest={setBGuest}
        bPhone={bPhone} setBPhone={setBPhone}
        bEmail={bEmail} setBEmail={setBEmail}
        bNotes={bNotes} setBNotes={setBNotes}
        bCheckIn={bCheckIn}
        bCheckOut={bCheckOut}
        bNights={bNights}
        bIsNightly={bIsNightly}
        bHrsActual={bHrsActual}
        bFormTotal={bFormTotal}
        bCanAdd={bCanAdd}
        onAddBooking={addBooking}
        isTablet={isTablet}
        bottomInset={insets.bottom}
        s={s}
        C={C}
      />
      {/* Booking calendar — shared for rooms (range) and amenities (single) */}
      {selRes && (
        <RoomCalendar
          visible={calendarOpen}
          room={selRes as RoomCalendarRoom}
          workspaceId={activeWorkspaceId ?? ""}
          mode={selRes.type === "room" ? "range" : "single"}
          badgeLabel={selRes.type === "room" ? "ROOM" : "AMENITY"}
          onConfirm={handleCalendarConfirm}
          onClose={() => setCalendarOpen(false)}
        />
      )}

      {/* Amenity time picker */}
      {selRes?.type === "amenity" && (
        <AmenityTimePicker
          visible={timePickerOpen}
          amenity={selRes as AmenityTimePickerAmenity}
          date={bCheckIn}
          onConfirm={(start, end) => { setBStartTime(start); setBEndTime(end); setTimePickerOpen(false); }}
          onClose={() => setTimePickerOpen(false)}
        />
      )}

      {successOrder && (
        <SuccessOverlay
          orderNo={successOrder.orderNo}
          onClose={handleSuccess}
          onViewReceipt={() => setShowReceipt(true)}
        />
      )}

      <ReceiptModal
        visible={showReceipt}
        payload={successOrder}
        storeName={workspaceName}
        onClose={() => setShowReceipt(false)}
      />

      <CustomChargeModal
        visible={showChargeModal}
        onClose={() => setShowChargeModal(false)}
        onAdd={(charge) => dispatch({ type: "ADD_CHARGE", charge })}
        subtotal={subtotal}
      />

      {/* Manager approval modal — for large discounts (>₱500) */}
      <ManagerApprovalModal
        visible={showDiscApprovalModal}
        approvalId={discApprovalId}
        actionLabel={pendingDiscount ? `Large Discount ₱${(pendingDiscount.discountType === "percent" ? subtotal * (Math.min(pendingDiscount.amount, 100) / 100) : pendingDiscount.amount).toFixed(2)}` : "Large Discount"}
        onApproved={(id) => {
          setShowDiscApprovalModal(false);
          if (pendingDiscount) {
            dispatch({ type: "SET_DISCOUNT_TYPE", discountType: pendingDiscount.discountType });
            dispatch({ type: "SET_DISCOUNT", amount: pendingDiscount.amount });
            dispatch({ type: "SET_DISCOUNT_APPROVAL", approvalId: id });
          }
          setPendingDiscount(null);
        }}
        onRejected={(reason) => {
          showToast(`Discount rejected${reason ? `: ${reason}` : ""}`);
          setPendingDiscount(null);
          setShowDiscApprovalModal(false);
        }}
        onClose={() => { setShowDiscApprovalModal(false); setPendingDiscount(null); }}
      />

      {/* Manager approval modal — cancelling an order the kitchen already started */}
      <ManagerApprovalModal
        visible={cancelApi.showCancelApprovalModal}
        approvalId={cancelApi.cancelApprovalId}
        actionLabel="Cancel Order In Preparation"
        onApproved={(id) => {
          cancelApi.setShowCancelApprovalModal(false);
          cancelApi.confirmCancelOrder(id).catch(console.error);
        }}
        onRejected={(reason) => {
          showToast(`Cancel rejected${reason ? `: ${reason}` : ""}`);
          cancelApi.setShowCancelApprovalModal(false);
        }}
        onClose={() => cancelApi.setShowCancelApprovalModal(false)}
      />

      {/* Add-ons modal — opens when product has addon_groups */}
      <AddonsModal
        visible={pendingAddonProduct !== null}
        product={pendingAddonProduct ? { ...pendingAddonProduct, addon_groups: pendingAddonProduct.addon_groups ?? [] } : null}
        onConfirm={(selections) => {
          if (!pendingAddonProduct) return;
          const addonTotal = selections.reduce((sum, a) => sum + a.price * a.qty, 0);
          const effectivePrice = pendingAddonProduct.price + addonTotal;
          dispatch({ type: "ADD_WITH_ADDONS", product: pendingAddonProduct, addons: selections, effectivePrice });
          showToast("Added to cart");
          setPendingAddonProduct(null);
        }}
        onClose={() => setPendingAddonProduct(null)}
      />

      {/* Split payment modal */}
      <SplitPaymentModal
        visible={showSplitModal}
        total={total}
        onConfirm={handleSplitConfirm}
        onClose={() => { setShowSplitModal(false); setShowPay(true); }}
      />
    </View>
  );
}

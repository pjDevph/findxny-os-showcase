import {
  View, Text, Pressable, ScrollView, StyleSheet,
  Platform, ToastAndroid, useWindowDimensions,
} from "react-native";
import { EscPrinterNative } from "../../modules/esc-printer";
import { useState, useCallback, useEffect, useMemo } from "react";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { invokeFn, isNetworkError } from "../../services/supabase";
import { cachedInvokeFn } from "../../features/cache/invokeFnCache";
import { useAuth } from "../../features/auth/AuthContext";
import { useTheme } from "../../features/theme/ThemeContext";
import { R } from "../../features/theme/tokens";
import { useSidebar } from "../../features/admin/SidebarContext";
import { useToast } from "../../features/ui/ToastProvider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RefreshButton } from "../../features/ui/RefreshButton";
import { phDateStr, phStartOfDayIso, phEndOfDayIso } from "../../features/utils/phDate";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
const peso = (n: number) => `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type OrderTab = "active" | "all" | "pending" | "preparing" | "ready" | "completed";

const todayStart = () => phStartOfDayIso(phDateStr(0));
const todayEnd   = () => phEndOfDayIso(phDateStr(0));
const fmtTime  = (iso: string) => new Date(iso).toLocaleTimeString("en-PH",{hour:"2-digit",minute:"2-digit"});
const fmtDate  = () => new Date().toLocaleDateString("en-PH",{weekday:"short",month:"short",day:"numeric"});
const syncStamp= () => new Date().toLocaleTimeString("en-PH",{hour:"2-digit",minute:"2-digit"});
const greeting = () => { const h=new Date().getHours(); return h<12?"Good morning":h<18?"Good afternoon":"Good evening"; };
const shortNo  = (no: string) => { const m=no.match(/(\d+)$/); return m?`#${m[1].slice(-4).padStart(4,"0")}`:no; }; // NOSONAR - applied to controlled internal data

/**
 * Kick the cash drawer via the ESC/POS printer — same command ReceiptModal
 * sends. The dashboard's "Open Drawer" button used to just router.push to
 * /pos/shift (identical to the "End Shift" button beside it), so it never
 * actually opened anything.
 */
function openCashDrawer() {
  if (EscPrinterNative) {
    EscPrinterNative.openCashDrawer().catch(() => {
      ToastAndroid.show("Cash drawer: check printer connection", ToastAndroid.SHORT);
    });
  } else {
    ToastAndroid.show("Cash drawer (ESC/POS not available in this build)", ToastAndroid.SHORT);
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface DashStats {
  grossSales:number; netSales:number; ordersCount:number; avgOrder:number;
  pendingPay:number; lowStock:number; activeOrders:number; kitchenQueue:number; cancelledToday:number;
  posTotal:number; webTotal:number;
}

const SRC_COLOR: Record<string,string> = { pos:"#F4A51C", web:"#2DA8F8", kiosk:"#a060c0" };
function srcInfo(source: string|null, orderType: string): {label:string;color:string} {
  const src = (source ?? "pos").toLowerCase();
  const type = orderType === "room_service" ? "Room"
    : orderType === "walk_in" ? "Walk-in"
    : orderType === "takeout"  ? "Takeout"
    : "Food";
  return { label: `${src.toUpperCase()} · ${type}`, color: SRC_COLOR[src] ?? "#F4A51C" };
}
interface LiveOrder {
  id:string; order_no:string; order_type:string; table_no:string|null;
  customer:string|null; total:number; status:string; created_at:string; source:string|null;
}
interface BranchInfo { name:string; accepting_orders:boolean; accepting_bookings:boolean; }
interface BookingSnapshot {
  total:number; confirmed:number; checked_in:number; checked_out:number;
  pending:number; cancelled:number; revenue:number;
}
interface UpcomingBooking {
  id:string; start_time:string; status:string; guest_name:string|null;
  customers:{name:string}|null; bookable_resources:{name:string}|null;
}

const STATUS_COLOR: Record<string,string> = {
  completed:"#48a86e", preparing:"#d0a828", pending:"#4890b0",
  ready:"#48a86e", cancelled:"#c03838", void:"#8a8a8a",
};

type C = ReturnType<typeof useTheme>["C"];

// ─── Raw response shapes (as returned by the pos-data edge function) ──────────
type FnRes<T> = { data: T | null; error: Error | null };
interface DashOrderRow { total: number | string; source: string | null; }
interface DashStockRow { quantity: number; low_stock_threshold: number; }
interface DashLiveOrderRow {
  id: string; order_no: string; order_type: string | null; table_no: string | null;
  customers: { name: string } | null; total: number | string; status: string;
  created_at: string; source: string | null;
}
interface DashPaymentRow { payment_method: string; amount: number | string; }
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash", gcash: "GCash", maya: "Maya", card: "Card", qrph: "QR Ph", bank_transfer: "Bank", other: "Other",
};
function buildPaymentSplit(rows: DashPaymentRow[]): { method: string; total: number }[] {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const method = row.payment_method ?? "other";
    totals[method] = (totals[method] ?? 0) + Number(row.amount ?? 0);
  }
  return Object.entries(totals)
    .map(([method, total]) => ({ method, total }))
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total);
}

// ─── Load helpers ─────────────────────────────────────────────────────────────
function computeDashStats(
  grossRes: FnRes<{ "dashboard-gross-sales": DashOrderRow[] | null }>,
  netRes: FnRes<{ "dashboard-net-sales": DashOrderRow[] | null }>,
  activeRes: FnRes<{ "dashboard-active-orders-count": number | null }>,
  kitchenRes: FnRes<{ "dashboard-kitchen-queue-count": number | null }>,
  stockRes: FnRes<{ "dashboard-low-stock": DashStockRow[] | null }>,
  cancelledRes: FnRes<{ "dashboard-cancelled-today-count": number | null }>,
  pendingPayRes: FnRes<{ "dashboard-pending-pay-count": number | null }>,
): DashStats {
  const grossRows = grossRes.data?.["dashboard-gross-sales"] ?? [];
  const gross     = grossRows.reduce((acc, o) => acc + Number(o.total), 0);
  const netOrders = netRes.data?.["dashboard-net-sales"] ?? [];
  const net       = netOrders.reduce((acc, o) => acc + Number(o.total), 0);
  const cnt       = grossRows.length;
  const stockRows = stockRes.data?.["dashboard-low-stock"] ?? [];
  const low       = stockRows.filter(i => i.quantity <= i.low_stock_threshold).length;
  const posTotal  = grossRows.filter(o => o.source !== "web").reduce((acc, o) => acc + Number(o.total), 0);
  const webTotal  = grossRows.filter(o => o.source === "web").reduce((acc, o) => acc + Number(o.total), 0);
  return {
    grossSales: gross, netSales: net, ordersCount: cnt, avgOrder: cnt > 0 ? gross / cnt : 0,
    pendingPay:     pendingPayRes.data?.["dashboard-pending-pay-count"]    ?? 0,
    lowStock: low,
    activeOrders:   activeRes.data?.["dashboard-active-orders-count"]     ?? 0,
    kitchenQueue:   kitchenRes.data?.["dashboard-kitchen-queue-count"]    ?? 0,
    cancelledToday: cancelledRes.data?.["dashboard-cancelled-today-count"] ?? 0,
    posTotal, webTotal,
  };
}

function mapLiveOrders(liveRes: FnRes<{ "dashboard-live-orders": DashLiveOrderRow[] | null }>): LiveOrder[] {
  const rows = liveRes.data?.["dashboard-live-orders"] ?? [];
  return rows.map(o => ({
    id: o.id, order_no: o.order_no, order_type: o.order_type ?? "dine_in",
    table_no: o.table_no, customer: o.customers?.name ?? null,
    total: Number(o.total), status: o.status, created_at: o.created_at,
    source: o.source ?? null,
  }));
}

function customerLabel(o: LiveOrder): string {
  if (o.customer) return o.customer;
  if (o.order_type === "room_service") return "Room Service";
  if (o.order_type === "takeout")      return "Takeout";
  if (o.order_type === "delivery")     return "Delivery";
  if (o.table_no)                      return `Table ${o.table_no}`;
  return "Walk-in";
}

// Short TTL just to dedupe rapid re-navigation onto this screen — long enough
// to skip a redundant re-fetch, short enough that POS numbers never go stale.
const DASH_CACHE_TTL_MS = 20_000;

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const { activeWorkspaceId, activeBranchId, memberships, user, role } = useAuth();
  const { C }  = useTheme();
  const s      = useMemo(() => makeStyles(C), [C]);
  const { openSidebar, isPhoneMode } = useSidebar();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: W } = useWindowDimensions();
  const isWide = W >= 768;

  const isCashier = role === "cashier" || role === "kitchen";

  const wsName = memberships.find(m=>m.workspace_id===activeWorkspaceId)?.workspace_name ?? "POS";
  // Staff emails are synthetic: {workspace_id}_{username}@staff.pos — strip the
  // 36-char UUID + "_" prefix so the greeting shows just the username.
  const uName  = (() => {
    const email = user?.email ?? "";
    if (email.endsWith("@staff.pos")) return email.slice(37).split("@")[0];
    return email.split("@")[0] ?? "";
  })();

  const [stats,            setStats]           = useState<DashStats|null>(null);
  const [paymentSplit,     setPaymentSplit]    = useState<{method:string;total:number}[]>([]);
  const [liveOrders,       setLiveOrders]      = useState<LiveOrder[]>([]);
  // Real per-status counts for today, independent of dashboard-live-orders'
  // 50-row cap — used for the tab badges and the "{N} records" header instead
  // of liveOrders.length, which used to silently undercount past the cap.
  const [orderCounts,      setOrderCounts]     = useState<Record<string, number>>({});
  const [bookingSnap,      setBookingSnap]     = useState<BookingSnapshot|null>(null);
  const [upcomingBookings, setUpcomingBookings]= useState<UpcomingBooking[]>([]);
  const [branch,           setBranch]          = useState<BranchInfo|null>(null);
  const [synced,           setSynced]          = useState(syncStamp());
  const [orderTab,         setOrderTab]        = useState<OrderTab>("active");
  const [refreshing,       setRefreshing]      = useState(false);

  const load = useCallback(async (force?: boolean) => {
    if (!activeWorkspaceId) return;
    try {
      const tStart = todayStart();
      const tEnd   = todayEnd();
      const key = (resource: string) => `${activeWorkspaceId}:${resource}`;
      // Sales/counts KPIs are scoped to the active branch when one is picked
      // (previously workspace-wide only) so "Today Revenue" etc. matches the
      // single branch the header/Operations Panel shows as OPEN/CLOSED,
      // instead of silently including every branch in the workspace.
      const branchParam = activeBranchId ? { branch_id: activeBranchId } : {};
      const [grossRes, netRes, paymentRes, activeRes, kitchenRes, stockRes, cancelledRes, liveRes, liveCountsRes, branchRes, pendingPayRes, bookSnapRes, upcomingRes] = await Promise.all([
        cachedInvokeFn<{ "dashboard-gross-sales": DashOrderRow[] | null }>(key("dashboard-gross-sales"), DASH_CACHE_TTL_MS,
          () => invokeFn("pos-data",{workspace_id:activeWorkspaceId,resource:"dashboard-gross-sales",params:{period_start:tStart,...branchParam}}), { force }),
        cachedInvokeFn<{ "dashboard-net-sales": DashOrderRow[] | null }>(key("dashboard-net-sales"), DASH_CACHE_TTL_MS,
          () => invokeFn("pos-data",{workspace_id:activeWorkspaceId,resource:"dashboard-net-sales",params:{period_start:tStart,...branchParam}}), { force }),
        cachedInvokeFn<{ "dashboard-payment-breakdown": DashPaymentRow[] | null }>(key("dashboard-payment-breakdown"), DASH_CACHE_TTL_MS,
          () => invokeFn("pos-data",{workspace_id:activeWorkspaceId,resource:"dashboard-payment-breakdown",params:{period_start:tStart,...branchParam}}), { force }),
        cachedInvokeFn<{ "dashboard-active-orders-count": number | null }>(key("dashboard-active-orders-count"), DASH_CACHE_TTL_MS,
          () => invokeFn("pos-data",{workspace_id:activeWorkspaceId,resource:"dashboard-active-orders-count",params:{...branchParam}}), { force }),
        cachedInvokeFn<{ "dashboard-kitchen-queue-count": number | null }>(key("dashboard-kitchen-queue-count"), DASH_CACHE_TTL_MS,
          () => invokeFn("pos-data",{workspace_id:activeWorkspaceId,resource:"dashboard-kitchen-queue-count",params:{...branchParam}}), { force }),
        cachedInvokeFn<{ "dashboard-low-stock": DashStockRow[] | null }>(key("dashboard-low-stock"), DASH_CACHE_TTL_MS,
          () => invokeFn("pos-data",{workspace_id:activeWorkspaceId,resource:"dashboard-low-stock",params:{}}), { force }),
        cachedInvokeFn<{ "dashboard-cancelled-today-count": number | null }>(key("dashboard-cancelled-today-count"), DASH_CACHE_TTL_MS,
          () => invokeFn("pos-data",{workspace_id:activeWorkspaceId,resource:"dashboard-cancelled-today-count",params:{today_start:tStart,...branchParam}}), { force }),
        cachedInvokeFn<{ "dashboard-live-orders": DashLiveOrderRow[] | null }>(key("dashboard-live-orders"), DASH_CACHE_TTL_MS,
          () => invokeFn("pos-data",{workspace_id:activeWorkspaceId,resource:"dashboard-live-orders",params:{today_start:tStart,...branchParam}}), { force }),
        cachedInvokeFn<{ "dashboard-live-orders-counts": Record<string, number> | null }>(key("dashboard-live-orders-counts"), DASH_CACHE_TTL_MS,
          () => invokeFn("pos-data",{workspace_id:activeWorkspaceId,resource:"dashboard-live-orders-counts",params:{today_start:tStart,...branchParam}}), { force }),
        activeBranchId
          ? cachedInvokeFn<{ "dashboard-branch-info": BranchInfo | null }>(key("dashboard-branch-info"), DASH_CACHE_TTL_MS,
              () => invokeFn("pos-data",{workspace_id:activeWorkspaceId,resource:"dashboard-branch-info",params:{branch_id:activeBranchId}}), { force })
          : Promise.resolve({data:null,error:null}),
        cachedInvokeFn<{ "dashboard-pending-pay-count": number | null }>(key("dashboard-pending-pay-count"), DASH_CACHE_TTL_MS,
          () => invokeFn("pos-data",{workspace_id:activeWorkspaceId,resource:"dashboard-pending-pay-count",params:{today_start:tStart,...branchParam}}), { force }),
        cachedInvokeFn<{ "dashboard-bookings-snapshot": BookingSnapshot | null }>(key("dashboard-bookings-snapshot"), DASH_CACHE_TTL_MS,
          () => invokeFn("pos-data",{workspace_id:activeWorkspaceId,resource:"dashboard-bookings-snapshot",params:{today_start:tStart,today_end:tEnd}}), { force }),
        cachedInvokeFn<{ "dashboard-upcoming-bookings": UpcomingBooking[] | null }>(key("dashboard-upcoming-bookings"), DASH_CACHE_TTL_MS,
          () => invokeFn("pos-data",{workspace_id:activeWorkspaceId,resource:"dashboard-upcoming-bookings",params:{today_start:tStart,today_end:tEnd}}), { force }),
      ]);
      // invokeFn never throws on a network failure — it resolves with
      // {data: null, error}, so the try/catch below never caught "offline".
      // Every computed value below defaults a null `data` to 0/[] (see
      // computeDashStats/mapLiveOrders), so a refresh attempted while offline
      // used to silently overwrite real, already-loaded numbers with zeros —
      // no error, no toast, no indication anything was wrong; a manager
      // glancing at the dashboard would just see a workspace with no sales
      // today. Bail out and keep whatever's already on screen instead.
      const offline = [grossRes, netRes, paymentRes, activeRes, liveRes].some(r => isNetworkError(r.error));
      if (offline) {
        showToast({ title: "Couldn't refresh", message: "No connection — showing the last synced numbers.", type: "error" });
        return;
      }
      setStats(computeDashStats(grossRes, netRes, activeRes, kitchenRes, stockRes, cancelledRes, pendingPayRes));
      setPaymentSplit(buildPaymentSplit(paymentRes.data?.["dashboard-payment-breakdown"] ?? []));
      setLiveOrders(mapLiveOrders(liveRes));
      setOrderCounts(liveCountsRes.data?.["dashboard-live-orders-counts"] ?? {});
      const snapData = bookSnapRes.data?.["dashboard-bookings-snapshot"];
      if (snapData) setBookingSnap(snapData);
      const upcoming = upcomingRes.data?.["dashboard-upcoming-bookings"];
      if (Array.isArray(upcoming)) setUpcomingBookings(upcoming);
      const branchData = branchRes.data?.["dashboard-branch-info"];
      if (branchData) setBranch(branchData);
      setSynced(syncStamp());
    } catch { /*silent*/ }
  }, [activeWorkspaceId, activeBranchId]);

  useEffect(()=>{load();},[load]);

  async function manualRefresh() {
    setRefreshing(true);
    try { await load(true); } finally { setRefreshing(false); }
  }

  const ACTIVE_STATUSES = ["pending","preparing","ready"];
  const visOrders = useMemo(()=>{
    if (orderTab==="all")    return liveOrders;
    if (orderTab==="active") return liveOrders.filter(o=>ACTIVE_STATUSES.includes(o.status));
    return liveOrders.filter(o=>o.status===orderTab);
  },[liveOrders,orderTab]);

  const isOpen    = branch?.accepting_orders ?? true;
  const branchSub = branch
    ? `${branch.name} · Synced ${synced}`
    : `Synced ${synced}`;

  // ── Header ─────────────────────────────────────────────────────────────────
  const headerNode = (
    <View style={s.header}>
      <View style={s.hLeft}>
        {isPhoneMode && (
          <Pressable style={s.menuBtn} onPress={openSidebar} hitSlop={8}>
            <Feather name="menu" size={18} color={C.amber}/>
          </Pressable>
        )}
        <View>
          <Text style={s.brandName}>{wsName} POS</Text>
          <Text style={s.branchSub}>{branchSub}</Text>
        </View>
      </View>
      {isWide && (
        <View style={s.hCenter}>
          <Text style={s.greetTxt}>{greeting()}, {uName}</Text>
          <Text style={s.dateTxt}>{fmtDate()}</Text>
        </View>
      )}
      <View style={s.hRight}>
        <Pressable style={s.newOrderBtn} onPress={()=>router.push("/pos/order" as any)}>
          <Feather name="plus" size={13} color="#000000"/>
          <Text style={s.newOrderTxt}>New Order</Text>
        </Pressable>
        {isWide && (
          <Pressable style={s.bookingBtn} onPress={()=>router.push("/pos/book-room" as any)}>
            <Feather name="calendar" size={13} color={C.info}/>
            <Text style={s.bookingBtnTxt}>Bookings</Text>
          </Pressable>
        )}
        {isWide && (stats?.pendingPay ?? 0) > 0 && (
          <Pressable style={s.verifyBtn} onPress={()=>router.push("/pos/transactions" as any)}>
            <Feather name="check-circle" size={13} color={C.warn}/>
            <Text style={s.verifyBtnTxt}>Verify Payments ({stats!.pendingPay})</Text>
          </Pressable>
        )}
        <RefreshButton onPress={manualRefresh} refreshing={refreshing} compact={!isWide} />
      </View>
    </View>
  );

  // ── KPI cards ──────────────────────────────────────────────────────────────
  // Each card resolves independently off whether its own data is in yet
  // (stats / bookingSnap), instead of gating the whole row on one shared
  // `loading` boolean — mirrors the per-card "…" placeholder pattern
  // StatsRow already uses on the home screen, so cards don't all sit blank
  // waiting for the slowest of the ~11 parallel calls (and a refresh no
  // longer blanks out cards that already have a value to show).
  const kpiWide = (
    <View style={s.kpiRowWide}>
      <KpiCards C={C} stats={stats} bookingSnap={bookingSnap} flex={1} router={router}/>
    </View>
  );
  const kpiScroll = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.kpiRow}>
      <KpiCards C={C} stats={stats} bookingSnap={bookingSnap} router={router}/>
    </ScrollView>
  );

  // ── Order table shared nodes ───────────────────────────────────────────────
  // Counts come from dashboard-live-orders-counts (unbounded, real per-status
  // counts for today) rather than liveOrders.length/filter — liveOrders
  // itself is capped at 50 rows for display, so deriving badge counts from it
  // silently undercounted on any day busier than the cap.
  const totalOrderCount = Object.values(orderCounts).reduce((a,b)=>a+b,0);
  const activeCount = ACTIVE_STATUSES.reduce((sum,st)=>sum+(orderCounts[st]??0),0);
  const tabsNode = (
    <View style={s.tabsRow}>
      {(["active","all","pending","preparing","ready","completed"] as OrderTab[]).map(t=>{
        const count = t==="all" ? totalOrderCount
          : t==="active" ? activeCount
          : orderCounts[t] ?? 0;
        const label = t==="all"?"All":t==="active"?"Active":t.charAt(0).toUpperCase()+t.slice(1);
        return (
          <Pressable key={t} style={[s.tab, orderTab===t && s.tabActive]} onPress={()=>setOrderTab(t)}>
            <Text style={[s.tabTxt, orderTab===t && s.tabTxtActive]}>{label}</Text>
            {count>0 && (
              <View style={[s.tabBadge, orderTab===t && s.tabBadgeActive]}>
                <Text style={[s.tabBadgeTxt, orderTab===t && s.tabBadgeTxtActive]}>{count}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );

  const colHdrNode = (
    <View style={[s.row, s.rowHdr]}>
      <Text style={[s.colH,{width:62}]}>ORDER</Text>
      <Text style={[s.colH,{width:84,textAlign:"center"}]}>SOURCE</Text>
      <Text style={[s.colH,{width:80}]}>CUSTOMER</Text>
      <Text style={[s.colH,{width:72,textAlign:"right"}]}>AMOUNT</Text>
      <Text style={[s.colH,{width:92,textAlign:"center"}]}>STATUS</Text>
      <Text style={[s.colH,{width:66,textAlign:"right"}]}>TIME</Text>
      {/* Affordance column — the row itself opens the order in Order History. */}
      <Text style={[s.colH,{width:64,textAlign:"center"}]}></Text>
    </View>
  );

  const emptyLabel = orderTab==="active"
    ? { title:"Queue is clear", sub:"No pending, preparing, or ready orders." }
    : orderTab==="completed"
    ? { title:"No completed orders yet", sub:"Completed orders will appear here." }
    : { title:"No orders", sub:"" };

  const orderRowsNode = visOrders.length===0 ? (
    <View style={s.emptyRow}>
      <Feather name="inbox" size={28} color={C.ink4}/>
      <Text style={s.emptyTxt}>{emptyLabel.title}</Text>
      {emptyLabel.sub ? <Text style={s.emptySubTxt}>{emptyLabel.sub}</Text> : null}
      {orderTab==="active" && (
        <Pressable
          style={{flexDirection:"row",alignItems:"center",gap:6,marginTop:8,backgroundColor:C.amber,paddingHorizontal:16,paddingVertical:9,borderRadius:R.md}}
          onPress={()=>router.push("/pos/order" as any)}
        >
          <Feather name="plus" size={13} color="#000000"/>
          <Text style={{color:"#000000",fontSize:12,fontWeight:"700" as const}}>Create New Order</Text>
        </Pressable>
      )}
    </View>
  ) : (
    <>
      {visOrders.map((o,i)=>{
        const si = srcInfo(o.source, o.order_type);
        return (
          <Pressable
            key={o.id}
            style={[s.row, i%2===1 && s.rowAlt]}
            onPress={()=>router.push({ pathname:"/pos/transactions", params:{ focus_order_id:o.id } } as any)}
          >
            <Text style={[s.cell,s.mono,{width:62}]}>{shortNo(o.order_no)}</Text>
            <View style={{width:84,alignItems:"center"}}>
              <View style={[s.srcBadge,{backgroundColor:`${si.color}18`,borderColor:`${si.color}45`}]}>
                <Text style={[s.srcBadgeTxt,{color:si.color}]}>{si.label}</Text>
              </View>
            </View>
            <Text style={[s.cell,{width:80}]} numberOfLines={1}>{customerLabel(o)}</Text>
            <Text style={[s.cell,s.mono,{width:72,textAlign:"right",fontWeight:"700" as const}]}>₱{o.total.toFixed(0)}</Text>
            <View style={{width:92,alignItems:"center"}}>
              <View style={[s.badge,{backgroundColor:`${STATUS_COLOR[o.status]??C.ink4}1a`}]}>
                <View style={[s.badgeDot,{backgroundColor:STATUS_COLOR[o.status]??C.ink4}]}/>
                <Text style={[s.badgeTxt,{color:STATUS_COLOR[o.status]??C.ink4}]}>{o.status}</Text>
              </View>
            </View>
            <Text style={[s.cell,s.mono,{width:66,textAlign:"right"}]}>{fmtTime(o.created_at)}</Text>
            <View style={{width:64,alignItems:"center"}}>
              <Feather name="chevron-right" size={14} color={C.ink4}/>
            </View>
          </Pressable>
        );
      })}
    </>
  );

  // ── Right panel: Operations Panel ─────────────────────────────────────────
  const isAcceptingOrders   = branch?.accepting_orders   ?? true;
  const isAcceptingBookings = branch?.accepting_bookings ?? true;

  const opsPanelNode = (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>Operations Panel</Text>
        <View style={s.liveTag}>
          <View style={s.liveDot}/>
          <Text style={s.liveTxt}>Live</Text>
        </View>
      </View>

      {/* Status rows */}
      {[
        { key:"Branch",   val:isOpen?"OPEN":"CLOSED",             color:isOpen?C.good:C.bad },
        { key:"Orders",   val:isAcceptingOrders?"ON":"OFF",        color:isAcceptingOrders?C.good:C.bad },
        { key:"Bookings", val:isAcceptingBookings?"ON":"OFF",      color:isAcceptingBookings?C.good:C.bad },
      ].map(row=>(
        <View key={row.key} style={s.opsRow}>
          <View style={{flexDirection:"row",alignItems:"center",gap:6,flex:1}}>
            <View style={[s.onlineDot,{backgroundColor:row.color}]}/>
            <Text style={s.opsKey}>{row.key}</Text>
          </View>
          <Text style={[s.opsVal,{color:row.color}]}>{row.val}</Text>
        </View>
      ))}
    </View>
  );

  // ── Booking Snapshot ──────────────────────────────────────────────────────
  const snapRows = bookingSnap ? [
    { icon:"log-in"   as const, label:"Check-ins",           n:bookingSnap.checked_in,  color:C.info },
    { icon:"log-out"  as const, label:"Check-outs",          n:bookingSnap.checked_out, color:C.ink3 },
    { icon:"clock"    as const, label:"Pending Verification", n:bookingSnap.pending,     color:C.warn },
    { icon:"x-circle" as const, label:"Cancelled",           n:bookingSnap.cancelled,   color:C.bad  },
  ] : [];

  const bookingSnapNode = (
    <View style={s.card}>
      <View style={{gap:2,marginBottom:8}}>
        <View style={{flexDirection:"row",alignItems:"center",gap:6}}>
          <Feather name="calendar" size={13} color={C.info}/>
          <Text style={s.cardTitle}>Booking Snapshot</Text>
        </View>
        <Text style={s.cardCount} numberOfLines={1}>{bookingSnap ? `Today · ${bookingSnap.total} total` : "—"}</Text>
      </View>
      {snapRows.length > 0 ? snapRows.map(row=>(
        <View key={row.label} style={s.snapRow}>
          <View style={[s.snapRowIcon,{backgroundColor:`${row.color}1a`}]}>
            <Feather name={row.icon} size={14} color={row.color}/>
          </View>
          <Text style={[s.snapRowLbl]}>{row.label}</Text>
          <Text style={[s.snapRowNum,{color:row.n>0?C.ink:C.ink4}]}>{row.n}</Text>
        </View>
      )) : (
        <Text style={{color:C.ink4,fontSize:11,fontFamily:MONO,paddingVertical:6}}>No bookings today</Text>
      )}
      <View style={{gap:4,marginTop:8}}>
        <Pressable style={s.snapBtn} onPress={()=>router.push("/pos/book-room" as any)}>
          <Feather name="calendar" size={12} color={C.info}/>
          <Text style={[s.snapBtnTxt,{color:C.info}]}>Open Booking Dashboard</Text>
        </Pressable>
        <Pressable style={[s.snapBtn,{borderColor:C.line}]} onPress={()=>router.push("/pos/book-room" as any)}>
          <Feather name="grid" size={12} color={C.ink3}/>
          <Text style={[s.snapBtnTxt,{color:C.ink3}]}>View Calendar</Text>
        </Pressable>
      </View>
    </View>
  );

  // ── Payment Split (today, by specific method — not a lumped "online" figure) ──
  const paymentTotal = paymentSplit.reduce((sum, r) => sum + r.total, 0);
  const paymentSplitNode = (
    <View style={s.card}>
      <View style={{gap:2,marginBottom:8}}>
        <View style={{flexDirection:"row",alignItems:"center",gap:6}}>
          <Feather name="credit-card" size={13} color={C.amber}/>
          <Text style={s.cardTitle}>Payment Split</Text>
        </View>
        <Text style={s.cardCount} numberOfLines={1}>{paymentTotal>0?`Today · ${peso(paymentTotal)}`:"—"}</Text>
      </View>
      {paymentSplit.length > 0 ? paymentSplit.map(row=>(
        <View key={row.method} style={s.snapRow}>
          <View style={[s.snapRowIcon,{backgroundColor:`${C.amber}1a`}]}>
            <Feather name="dollar-sign" size={14} color={C.amber}/>
          </View>
          <Text style={[s.snapRowLbl]}>{PAYMENT_METHOD_LABELS[row.method] ?? row.method}</Text>
          <Text style={[s.snapRowNum,{color:C.ink}]}>{peso(row.total)}</Text>
        </View>
      )) : (
        <Text style={{color:C.ink4,fontSize:11,fontFamily:MONO,paddingVertical:6}}>No payments yet today</Text>
      )}
    </View>
  );

  // ── Right panel: Quick Actions ─────────────────────────────────────────────
  const quickActionsNode = (
    <View style={s.card}>
      <Text style={s.cardTitle}>Quick Actions</Text>
      <View style={s.actGrid}>
        <ActionBtn C={C} icon="plus-circle"   label="New Order"     primary onPress={()=>router.push("/pos/order" as any)}/>
        <ActionBtn C={C} icon="calendar"      label="Bookings"      onPress={()=>router.push("/pos/book-room" as any)}/>
        <ActionBtn C={C} icon="check-circle"  label="Verify Pay"    onPress={()=>router.push("/pos/transactions" as any)}/>
        <ActionBtn C={C} icon="dollar-sign"   label="Cash In/Out"   onPress={()=>router.push("/pos/shift" as any)}/>
        <ActionBtn C={C} icon="package"       label="Inventory"     onPress={()=>router.push("/pos/inventory" as any)}/>
        <ActionBtn C={C} icon="bar-chart-2"   label="Reports"       onPress={()=>router.push("/pos/reports" as any)}/>
      </View>
    </View>
  );

  // ── Upcoming Bookings ─────────────────────────────────────────────────────
  const BOOKING_STATUS_COLOR: Record<string,string> = {
    confirmed:"#4890b0", checked_in:"#48a86e", hold:"#d0a828", pending:"#d0a828",
  };
  const upcomingBookingsNode = (
    <View style={s.card}>
      <View style={s.cardHead}>
        <View style={{flexDirection:"row",alignItems:"center",gap:6}}>
          <Feather name="clock" size={13} color={C.warn}/>
          <Text style={s.cardTitle}>Upcoming Bookings</Text>
        </View>
        <Text style={s.cardCount}>{upcomingBookings.length} today</Text>
      </View>
      {upcomingBookings.length === 0 ? (
        <Text style={{color:C.ink4,fontSize:11,fontFamily:MONO,paddingVertical:6}}>No upcoming bookings</Text>
      ) : upcomingBookings.map(b=>{
        const name = b.customers?.name ?? b.guest_name ?? "Walk-in";
        const room = b.bookable_resources?.name ?? "Room";
        const color = BOOKING_STATUS_COLOR[b.status] ?? C.ink3;
        const statusLabel = b.status === "checked_in" ? "Check-in"
          : b.status === "confirmed" ? "Confirmed"
          : b.status === "hold"      ? "Hold"
          : b.status === "pending"   ? "Pending"
          : b.status;
        return (
          <View key={b.id} style={{paddingVertical:10,borderTopWidth:1,borderTopColor:C.line,gap:3}}>
            <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
              <Text style={{color:C.ink3,fontSize:9.5,fontFamily:MONO,letterSpacing:0.3}}>{fmtTime(b.start_time)}</Text>
              <View style={{paddingHorizontal:6,paddingVertical:2,borderRadius:R.full,backgroundColor:`${color}18`,borderWidth:1,borderColor:`${color}45`}}>
                <Text style={{color,fontSize:8.5,fontWeight:"700" as const}}>{statusLabel}</Text>
              </View>
            </View>
            <Text style={{color:C.ink,fontSize:12.5,fontWeight:"700" as const,letterSpacing:0.1}} numberOfLines={1}>{room}</Text>
            <Text style={{color:C.ink3,fontSize:10.5}} numberOfLines={1}>{name}</Text>
          </View>
        );
      })}
    </View>
  );

  // ── Right panel: role strip ───────────────────────────────────────────────
  const cashierStripNode = isCashier
    ? <CashierStrip C={C} s={s} uName={uName} stats={stats} router={router}/>
    : <ManagerStrip C={C} s={s} role={role} uName={uName} stats={stats}/>;

  // ── WIDE LAYOUT ────────────────────────────────────────────────────────────
  if (isWide) {
    return (
      <View style={[s.rootFlex,{paddingTop:insets.top}]}>

        {/* Header */}
        <View style={[s.topStrip,{paddingHorizontal:Math.max(insets.left,14)}]}>
          {headerNode}
        </View>

        {/* Body: Main area (KPI + Live Orders + Booking Snap) + Right Panel */}
        <View style={[s.body,{paddingHorizontal:Math.max(insets.left,14),paddingBottom:Math.max(insets.bottom,8)}]}>

          {/* MAIN area — KPI row + bottom row (Live Orders | Booking Snap) */}
          <View style={s.mainArea}>
            {kpiWide}

            {/* Bottom row: Live Orders (flex) + Booking Snapshot (fixed) */}
            <View style={s.bottomRow}>

              {/* Live orders card — largest panel */}
              <View style={[s.card,{flex:1,minHeight:0,minWidth:0}]}>
                <View style={s.cardHead}>
                  <Text style={s.cardTitle}>Live Orders / Queue</Text>
                  <Text style={s.cardCount}>{totalOrderCount} records</Text>
                </View>
                {tabsNode}
                {/* Table has fixed-width columns (~560px min); scroll horizontally
                    instead of overflowing when the card shrinks below that near
                    the isWide breakpoint (e.g. narrow tablets, resized browser). */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  style={{flex:1,minHeight:0}} contentContainerStyle={{minWidth:560,flexGrow:1}}>
                  <View style={{flex:1,minWidth:560}}>
                    {colHdrNode}
                    <ScrollView style={{flex:1,minHeight:0}} showsVerticalScrollIndicator={false}>
                      {orderRowsNode}
                    </ScrollView>
                  </View>
                </ScrollView>
                {liveOrders.length>0 && (
                  <Pressable style={s.viewAllBtn} onPress={()=>router.push("/pos/transactions" as any)}>
                    <Text style={s.viewAllTxt}>View All Orders</Text>
                    <Feather name="arrow-right" size={11} color={C.amber}/>
                  </Pressable>
                )}
              </View>

              {/* Middle column: Booking Snapshot + Upcoming Bookings — bounded height from row, inner scroll */}
              <View style={{width:220,flexShrink:0}}>
                <ScrollView style={{flex:1}} showsVerticalScrollIndicator={false} contentContainerStyle={{gap:12}}>
                  {bookingSnapNode}
                  {upcomingBookingsNode}
                </ScrollView>
              </View>

            </View>
          </View>

          {/* RIGHT panel — Ops Panel + Quick Actions + Cashier */}
          <View style={s.rightPanel}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{gap:12,paddingBottom:8}}>
              {opsPanelNode}
              {paymentSplitNode}
              {quickActionsNode}
              {cashierStripNode}
            </ScrollView>
          </View>

        </View>
      </View>
    );
  }

  // ── PORTRAIT LAYOUT ────────────────────────────────────────────────────────
  return (
    <ScrollView style={s.root} contentContainerStyle={[s.content,{paddingTop:Math.max(insets.top,16)}]} showsVerticalScrollIndicator={false}>
      {headerNode}
      {kpiScroll}

      {/* Orders card */}
      <View style={s.card}>
        <View style={s.cardHead}>
          <Text style={s.cardTitle}>Live Orders / Queue</Text>
          <Text style={s.cardCount}>{totalOrderCount} records</Text>
        </View>
        {tabsNode}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{minWidth:560}}>
            <View style={[s.row,s.rowHdr]}>
              <Text style={[s.colH,{width:62}]}>ORDER</Text>
              <Text style={[s.colH,{width:90,textAlign:"center"}]}>SOURCE</Text>
              <Text style={[s.colH,{width:80}]}>CUSTOMER</Text>
              <Text style={[s.colH,{width:72,textAlign:"right"}]}>AMOUNT</Text>
              <Text style={[s.colH,{width:88,textAlign:"center"}]}>STATUS</Text>
              <Text style={[s.colH,{width:66,textAlign:"right"}]}>TIME</Text>
            </View>
            {visOrders.length===0 ? (
              <View style={s.emptyRow}>
                <Feather name="inbox" size={22} color={C.ink4}/>
                <Text style={s.emptyTxt}>No orders</Text>
              </View>
            ) : visOrders.slice(0,8).map((o,i)=>{
              const si = srcInfo(o.source, o.order_type);
              return (
                <View key={o.id} style={[s.row, i%2===1&&s.rowAlt]}>
                  <Text style={[s.cell,s.mono,{width:62}]}>{shortNo(o.order_no)}</Text>
                  <View style={{width:90,alignItems:"center"}}>
                    <View style={[s.srcBadge,{backgroundColor:`${si.color}18`,borderColor:`${si.color}45`}]}>
                      <Text style={[s.srcBadgeTxt,{color:si.color}]}>{si.label}</Text>
                    </View>
                  </View>
                  <Text style={[s.cell,{width:80}]} numberOfLines={1}>{customerLabel(o)}</Text>
                  <Text style={[s.cell,s.mono,{width:72,textAlign:"right",fontWeight:"700" as const}]}>₱{o.total.toFixed(0)}</Text>
                  <View style={{width:88,alignItems:"center"}}>
                    <View style={[s.badge,{backgroundColor:`${STATUS_COLOR[o.status]??C.ink4}1a`}]}>
                      <View style={[s.badgeDot,{backgroundColor:STATUS_COLOR[o.status]??C.ink4}]}/>
                      <Text style={[s.badgeTxt,{color:STATUS_COLOR[o.status]??C.ink4}]}>{o.status}</Text>
                    </View>
                  </View>
                  <Text style={[s.cell,s.mono,{width:66,textAlign:"right"}]}>{fmtTime(o.created_at)}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {bookingSnapNode}
      {paymentSplitNode}
      <View style={{flexDirection:"row",gap:10}}>
        {opsPanelNode}
        {quickActionsNode}
      </View>
      {cashierStripNode}
    </ScrollView>
  );
}

// ─── KPI cards ────────────────────────────────────────────────────────────────
// Each card's value/sub gates on whether *its own* source data has arrived
// (statsReady / bookingReady) rather than on one shared screen-wide loading
// flag, so a card with data already in hand (e.g. from a prior load) never
// gets blanked out just because a sibling card's fetch is still in flight.
function KpiCards({ C, stats, bookingSnap, flex, router }: Readonly<{
  C: C; stats: DashStats | null; bookingSnap: BookingSnapshot | null;
  flex?: number; router: ReturnType<typeof useRouter>;
}>) {
  const statsReady   = stats !== null;
  const bookingReady = bookingSnap !== null;

  const posTotal   = stats?.posTotal ?? 0;
  const webTotal   = stats?.webTotal ?? 0;
  const bookRev    = bookingSnap?.revenue ?? 0;
  const totalRev   = posTotal + webTotal + bookRev;
  const salesParts: string[] = [];
  if (posTotal > 0) salesParts.push(`POS ${peso(posTotal)}`);
  if (webTotal > 0) salesParts.push(`Web ${peso(webTotal)}`);
  if (bookRev  > 0) salesParts.push(`Booking ${peso(bookRev)}`);
  const salesSub = salesParts.length > 0 ? salesParts.join(" · ") : "No revenue yet";
  const kitchen  = stats?.kitchenQueue ?? 0;
  // Was mislabeled "N pending payment" — `active` is activeOrders (orders
  // still pending/preparing/ready by status), which has nothing to do with
  // payment; that's the separate "Pending Pay" tile below, driven by a
  // different query entirely.
  const active   = stats?.activeOrders ?? 0;
  const kitchenSub = active>0 ? `${active} order${active===1?"":"s"} in progress` : "no open orders";
  const bookSub  = bookingSnap ? [
    bookingSnap.checked_in>0  ? `${bookingSnap.checked_in} check-in`  : "",
    bookingSnap.pending>0     ? `${bookingSnap.pending} pending`       : "",
    bookingSnap.confirmed>0   ? `${bookingSnap.confirmed} confirmed`   : "",
  ].filter(Boolean).join(" · ") || "No check-ins today" : "loading…";
  const pendingPay = stats?.pendingPay ?? 0;
  return (
    <>
      <KpiCard C={C} flex={flex} icon="trending-up"  label="Today Revenue"  value={statsReady ? peso(totalRev) : "…"}                color={C.amber} sub={statsReady ? salesSub : undefined}    action={{label:"View reports",    onPress:()=>router.push("/pos/reports" as any)}}/>
      <KpiCard C={C} flex={flex} icon="layers"        label="Kitchen Queue"  value={statsReady ? String(kitchen) : "…"}               color={C.info}  sub={statsReady ? kitchenSub : undefined}  action={{label:"Prep display",     onPress:()=>router.push("/pos/kitchen" as any)}}/>
      <KpiCard C={C} flex={flex} icon="calendar"     label="Bookings Today" value={bookingReady ? String(bookingSnap?.total??0) : "…"} color={C.good}  sub={bookSub}     action={{label:"View bookings",    onPress:()=>router.push("/pos/book-room" as any)}}/>
      <KpiCard C={C} flex={flex} icon="alert-circle" label="Pending Pay"    value={statsReady ? String(pendingPay) : "…"}             color={C.warn}  sub={statsReady ? (pendingPay>0?"needs verification":"all clear") : undefined} alert={statsReady && pendingPay>0} action={statsReady && pendingPay>0?{label:"Verify now",onPress:()=>router.push("/pos/transactions" as any)}:undefined}/>
    </>
  );
}

// ─── CashierStrip ─────────────────────────────────────────────────────────────
function CashierStrip({ C, s, uName, stats, router }: Readonly<{
  C: C; s: ReturnType<typeof makeStyles>;
  uName: string; stats: DashStats | null; router: ReturnType<typeof useRouter>;
}>) {
  return (
    <View style={[s.card,{padding:10}]}>
      <View style={[s.shiftTop,{marginBottom:6}]}>
        <View>
          <Text style={s.shiftLbl}>Cashier</Text>
          <Text style={[s.shiftVal,{fontSize:11}]} numberOfLines={1}>{uName}</Text>
        </View>
        <View style={{alignItems:"flex-end"}}>
          {/* This is the branch/workspace's total since midnight, not this
              cashier's own shift — dashboard-net-sales has no shift_id
              filter, so with more than one shift/register running today
              this figure won't match what this cashier actually rang up.
              Renamed from "Shift Sales" to stop implying it was scoped to
              just them; the real per-shift total is on the shift-close
              report (/pos/shift). */}
          <Text style={s.shiftLbl}>Today's Sales</Text>
          <Text style={[s.shiftVal,{color:C.amber,fontSize:11}]}>{peso(stats?.netSales??0)}</Text>
        </View>
      </View>
      <View style={s.shiftBtns}>
        <Pressable style={[s.shiftBtn,{backgroundColor:C.bad}]} onPress={()=>router.push("/pos/shift" as any)}>
          <Text style={[s.shiftBtnTxt,{fontSize:10}]}>End Shift</Text>
        </Pressable>
        <Pressable style={[s.shiftBtn,s.shiftBtnSec]} onPress={openCashDrawer}>
          <Text style={[s.shiftBtnTxt,{color:C.ink2,fontSize:10}]}>Open Drawer</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── ManagerStrip ─────────────────────────────────────────────────────────────
function ManagerStrip({ C, s, role, uName, stats }: Readonly<{
  C: C; s: ReturnType<typeof makeStyles>;
  role: string | null | undefined; uName: string; stats: DashStats | null;
}>) {
  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : "User";
  return (
    <View style={[s.card,{flexDirection:"row",alignItems:"center",gap:0,padding:10}]}>
      <View style={{flex:2}}>
        <Text style={s.shiftLbl}>{roleLabel}</Text>
        <Text style={[s.shiftVal,{fontSize:11}]} numberOfLines={1}>{uName}</Text>
      </View>
      <View style={{flex:1,alignItems:"center",borderLeftWidth:1,borderLeftColor:C.line,paddingLeft:6}}>
        <Text style={s.shiftLbl}>Today</Text>
        <Text style={[s.shiftVal,{color:C.amber,fontSize:11}]}>{peso(stats?.grossSales??0)}</Text>
      </View>
      <View style={{flex:1,alignItems:"center",borderLeftWidth:1,borderLeftColor:C.line,paddingLeft:6}}>
        <Text style={s.shiftLbl}>Orders</Text>
        <Text style={[s.shiftVal,{color:C.info,fontSize:11}]}>{stats?.ordersCount??0}</Text>
      </View>
    </View>
  );
}

// ─── KpiCard ─────────────────────────────────────────────────────────────────
function KpiCard({C,icon,label,value,color,sub,alert,flex,action}:Readonly<{
  C:C; icon:React.ComponentProps<typeof Feather>["name"];
  label:string; value:string; color:string; sub?:string; alert?:boolean; flex?:number;
  action?:{label:string;onPress:()=>void};
}>) {
  return (
    <View style={{
      flex,
      backgroundColor: C.surface,
      borderRadius: R.lg,
      borderWidth: 1,
      borderColor: alert ? `${color}35` : C.line,
      borderTopWidth: 3,
      borderTopColor: alert ? color : `${color}70`,
      padding: 10,
      ...(flex ? {} : { minWidth: 180, marginRight: 8 }),
    }}>
      {/* Icon + label on same row */}
      <View style={{flexDirection:"row",alignItems:"center",gap:7,marginBottom:6}}>
        <View style={{width:26,height:26,borderRadius:R.md,backgroundColor:`${color}18`,alignItems:"center",justifyContent:"center"}}>
          <Feather name={icon} size={13} color={color}/>
        </View>
        <Text style={{color:C.ink3,fontSize:9,letterSpacing:0.6,fontFamily:MONO,textTransform:"uppercase" as const,flex:1}}>{label}</Text>
        {alert && <View style={{width:7,height:7,borderRadius:4,backgroundColor:color}}/>}
      </View>
      <Text style={{fontSize:30,fontWeight:"900" as const,letterSpacing:-1.5,color:C.ink,lineHeight:34}}>{value}</Text>
      {sub && <Text style={{color:color,fontSize:9.5,fontFamily:MONO,marginTop:3,lineHeight:13,fontWeight:"600" as const}}>{sub}</Text>}
      {action && (
        <Pressable style={{flexDirection:"row",alignItems:"center",gap:4,marginTop:7,paddingTop:7,borderTopWidth:1,borderTopColor:C.line}} onPress={action.onPress}>
          <Text style={{color:alert?color:C.amber,fontSize:10,fontWeight:"600" as const}}>{action.label}</Text>
          <Feather name="arrow-right" size={10} color={alert?color:C.amber}/>
        </Pressable>
      )}
    </View>
  );
}

// OrderAction (View/Update/Complete/Receipt pills) was removed: it rendered a
// plain <View> with no onPress inside a non-pressable row, so the pills looked
// like buttons but were inert. The row is now Pressable and opens the order in
// Order History, where the real actions (reprint/cancel/refund) already live.

// ─── ActionBtn ────────────────────────────────────────────────────────────────
function ActionBtn({C,icon,label,primary,onPress}:Readonly<{
  C:C; icon:React.ComponentProps<typeof Feather>["name"];
  label:string; primary?:boolean; onPress:()=>void;
}>) {
  return (
    <Pressable
      style={{
        flex:1, minWidth:72, maxWidth:100,
        paddingVertical:10, paddingHorizontal:4,
        borderRadius:R.md, alignItems:"center", gap:5,
        backgroundColor: primary ? C.amber : C.bg2,
        borderWidth: 1,
        borderColor: primary ? C.amber : C.line,
      }}
      onPress={onPress}
    >
      <Feather name={icon} size={16} color={primary?"#000000":C.ink2}/>
      <Text style={{fontSize:10,fontWeight:"600" as const,color:primary?"#000000":C.ink2,textAlign:"center" as const,letterSpacing:0.2}}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const makeStyles = (C: C) => StyleSheet.create({
  // Roots
  root:     {flex:1, backgroundColor:C.bg},
  rootFlex: {flex:1, backgroundColor:C.bg},
  content:  {padding:12, gap:10},

  // Wide layout zones
  topStrip:  {paddingTop:10, gap:8},
  body:      {flex:1, flexDirection:"row", gap:10, paddingTop:6},
  mainArea:  {flex:1, gap:8, minWidth:0},
  bottomRow: {flex:1, flexDirection:"row" as const, gap:8, minHeight:0, minWidth:0},
  rightPanel:{width:280, flexShrink:0, flexGrow:0},

  // Header
  header:    {flexDirection:"row", alignItems:"center", gap:8},
  hLeft:     {flexDirection:"row", alignItems:"center", gap:8, flex:1},
  hCenter:   {flex:1, alignItems:"center"},
  hRight:    {flexDirection:"row", alignItems:"center", gap:6},
  menuBtn:   {paddingRight:4},
  brandName: {color:C.ink, fontSize:16, fontWeight:"800" as const, letterSpacing:0.2},
  branchSub: {color:C.ink4, fontSize:9.5, fontFamily:MONO, marginTop:1},
  greetTxt:  {color:C.ink, fontSize:15, fontWeight:"700" as const},
  dateTxt:   {color:C.ink3, fontSize:10.5, fontFamily:MONO},

  // Date filter pill
  filterPill: {flexDirection:"row",gap:2,backgroundColor:C.surface,borderRadius:R.md,padding:3,borderWidth:1,borderColor:C.line},
  fBtn:       {paddingHorizontal:10,paddingVertical:5,borderRadius:R.sm},
  fBtnOn:     {backgroundColor:C.amber},
  fTxt:       {color:C.ink3,fontSize:11,fontWeight:"600" as const},
  fTxtOn:     {color:"#000000"},

  // New Order button
  newOrderBtn: {flexDirection:"row",alignItems:"center",gap:5,backgroundColor:C.amber,paddingHorizontal:12,paddingVertical:8,borderRadius:R.md},
  newOrderTxt: {color:"#000000",fontSize:12,fontWeight:"700" as const,letterSpacing:0.2},

  // Booking / Verify Payments header buttons
  bookingBtn: {flexDirection:"row",alignItems:"center",gap:5,paddingHorizontal:10,paddingVertical:8,borderRadius:R.md,backgroundColor:`${C.info}15`,borderWidth:1,borderColor:`${C.info}40`},
  bookingBtnTxt: {color:C.info,fontSize:11,fontWeight:"700" as const,letterSpacing:0.2},
  verifyBtn: {flexDirection:"row",alignItems:"center",gap:5,paddingHorizontal:10,paddingVertical:8,borderRadius:R.md,backgroundColor:`${C.warn}15`,borderWidth:1,borderColor:`${C.warn}40`},
  verifyBtnTxt: {color:C.warn,fontSize:11,fontWeight:"700" as const,letterSpacing:0.2},

  // Refresh button
  refreshBtn: {flexDirection:"row",alignItems:"center",gap:5,paddingHorizontal:9,paddingVertical:8,borderRadius:R.md,backgroundColor:C.surface,borderWidth:1,borderColor:C.line},
  refreshTxt: {color:C.ink3,fontSize:11},

  // Source badge (composite "POS · Food")
  srcBadge:    {paddingHorizontal:7,paddingVertical:3,borderRadius:R.full,borderWidth:1},
  srcBadgeTxt: {fontSize:8.5,fontWeight:"700" as const,letterSpacing:0.3,fontFamily:MONO},

  // Loading row
  loadRow: {flexDirection:"row",alignItems:"center",gap:10,padding:16},
  loadTxt: {color:C.ink3,fontFamily:MONO,fontSize:12},

  // KPI strip
  kpiRow:     {},
  kpiRowWide: {flexDirection:"row" as const,gap:8,alignSelf:"stretch" as const},

  // Cards
  // overflow:"hidden" so a card's horizontally-scrolling table (min-width
  // content wider than the card when the flex row shrinks it) clips at the
  // card edge instead of visually bleeding into the next card.
  card:      {backgroundColor:C.surface,borderRadius:R.lg,borderWidth:1,borderColor:C.line,padding:14,overflow:"hidden" as const},
  cardHead:  {flexDirection:"row",alignItems:"center",marginBottom:8},
  cardTitle: {color:C.ink,fontSize:13,fontWeight:"700" as const,flex:1,letterSpacing:0.1},
  cardCount: {color:C.ink4,fontSize:10,fontFamily:MONO},

  // Order filter tabs
  tabsRow:        {flexDirection:"row",gap:4,marginBottom:7,flexWrap:"nowrap" as const},
  tab:            {flexDirection:"row",alignItems:"center",gap:4,paddingHorizontal:10,paddingVertical:5,borderRadius:R.full,backgroundColor:C.bg2,borderWidth:1,borderColor:C.line},
  tabActive:      {backgroundColor:`${C.amber}18`,borderColor:`${C.amber}60`},
  tabTxt:         {color:C.ink3,fontSize:10.5,fontWeight:"600" as const},
  tabTxtActive:   {color:C.amber},
  tabBadge:       {backgroundColor:C.line,borderRadius:R.full,paddingHorizontal:5,paddingVertical:1},
  tabBadgeActive: {backgroundColor:`${C.amber}30`},
  tabBadgeTxt:    {color:C.ink4,fontSize:8.5,fontWeight:"700" as const,fontFamily:MONO},
  tabBadgeTxtActive:{color:C.amber},

  // Order table
  row:      {flexDirection:"row",alignItems:"center",paddingHorizontal:8,paddingVertical:8,borderBottomWidth:1,borderBottomColor:C.line},
  rowHdr:   {backgroundColor:C.bg2},
  rowAlt:   {backgroundColor:"rgba(255,200,100,0.018)"},
  colH:     {color:C.ink4,fontSize:8.5,letterSpacing:0.9,fontFamily:MONO},
  cell:     {color:C.ink2,fontSize:12},
  mono:     {fontFamily:MONO},

  // Status badge
  badge:    {flexDirection:"row",alignItems:"center",gap:5,paddingHorizontal:8,paddingVertical:3,borderRadius:R.full},
  badgeDot: {width:5,height:5,borderRadius:2.5},
  badgeTxt: {fontSize:9,fontWeight:"700" as const,textTransform:"capitalize" as const,letterSpacing:0.2},

  // Empty state
  emptyRow:    {alignItems:"center",gap:6,padding:28},
  emptyTxt:    {color:C.ink3,fontSize:13,fontWeight:"600" as const},
  emptySubTxt: {color:C.ink4,fontSize:11,fontFamily:MONO},

  // View all link
  viewAllBtn: {flexDirection:"row",alignItems:"center",justifyContent:"center",gap:5,paddingVertical:8,borderTopWidth:1,borderTopColor:C.line,marginTop:2},
  viewAllTxt: {color:C.amber,fontSize:11,fontWeight:"600" as const},

  // Ops panel rows
  opsRow:      {flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingVertical:5,borderTopWidth:1,borderTopColor:C.line},
  opsKey:      {color:C.ink3,fontSize:10.5},
  opsVal:      {fontSize:10.5,fontWeight:"700" as const},
  onlineDot:   {width:6,height:6,borderRadius:3,backgroundColor:C.good},

  // Branch live tag
  liveTag:    {flexDirection:"row",alignItems:"center",gap:4,backgroundColor:`${C.good}1a`,paddingHorizontal:8,paddingVertical:3,borderRadius:R.full},
  liveDot:    {width:5,height:5,borderRadius:2.5,backgroundColor:C.good},
  liveTxt:    {color:C.good,fontSize:9,fontWeight:"700" as const,letterSpacing:0.4},

  // Needs attention (kept for reference, no longer rendered)
  attnGrid: {flexDirection:"row",flexWrap:"wrap",gap:5,marginTop:8},
  attnCell: {width:"46%" as `${number}%`,borderWidth:1,borderLeftWidth:3,borderRadius:R.md,padding:10,gap:3,backgroundColor:C.bg2},
  attnNum:  {fontSize:26,fontWeight:"800" as const,lineHeight:30,letterSpacing:-0.5},
  attnLbl:  {color:C.ink3,fontSize:9,fontFamily:MONO,letterSpacing:0.5,textTransform:"uppercase" as const},

  // Booking Snapshot (vertical icon rows)
  snapRow:     {flexDirection:"row",alignItems:"center",gap:10,paddingVertical:7,borderTopWidth:1,borderTopColor:C.line},
  snapRowIcon: {width:30,height:30,borderRadius:R.md,alignItems:"center",justifyContent:"center"},
  snapRowLbl:  {color:C.ink3,fontSize:11.5,flex:1},
  snapRowNum:  {fontSize:24,fontWeight:"800" as const,letterSpacing:-0.5,minWidth:28,textAlign:"right" as const,color:C.ink},
  snapActions: {marginTop:6,gap:4},
  snapBtn:     {flexDirection:"row",alignItems:"center",justifyContent:"center",gap:5,paddingVertical:8,borderRadius:R.md,borderWidth:1,borderColor:`${C.info}40`,alignSelf:"stretch" as const},
  snapBtnTxt:  {fontSize:10.5,fontWeight:"600" as const},

  // Quick actions 3×2
  actGrid: {flexDirection:"row",flexWrap:"wrap",gap:5,marginTop:8},

  // Shift / owner strip
  shiftTop:    {flexDirection:"row",justifyContent:"space-between",marginBottom:8},
  shiftLbl:    {color:C.ink4,fontSize:9,fontFamily:MONO,marginBottom:2,textTransform:"uppercase" as const,letterSpacing:0.5},
  shiftVal:    {color:C.ink,fontSize:13,fontWeight:"700" as const},
  shiftBtns:   {flexDirection:"row",gap:6},
  shiftBtn:    {flex:1,paddingVertical:8,alignItems:"center",borderRadius:R.md},
  shiftBtnSec: {backgroundColor:C.bg2,borderWidth:1,borderColor:C.line},
  shiftBtnTxt: {fontSize:11,fontWeight:"700" as const,color:C.ink},
});

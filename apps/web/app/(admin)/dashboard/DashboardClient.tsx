"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { fetchExtendedReport } from "../actions";
import { peso, ONLINE_ORDERING_ENABLED, ONLINE_BOOKING_ENABLED } from "@/lib/config";
import { RefreshButton } from "@/components/ui/RefreshButton";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Tx {
  type: string;
  status: string;
  amount: string | number;
  created_at: string;
  payment_method?: string;
}
interface OItem {
  quantity: string | number;
  total: string | number;
  option?: string;
  product_options?: { name?: string };
  products?: {
    name?: string;
    cost?: number;
    product_categories?: { name?: string };
  };
  orders?: { created_at?: string };
}
interface TodayOrder {
  id: string;
  order_no?: string;
  total?: string | number;
  status?: string;
  created_at?: string;
  is_online?: boolean;
  cashier_name?: string;
  branches?: { name?: string };
  table_no?: string | null;
  order_type?: string;
  customer?: string | null;
}

interface Branch {
  id: string;
  name?: string;
  accepting_orders?: boolean;
  accepting_bookings?: boolean;
}

export interface DashboardClientProps {
  transactions: Tx[];
  orderItems: OItem[];
  todayOrders: TodayOrder[];
  branches: Branch[];
}

type DashView       = "ops" | "analytics";
type OrderStatusTab = "all" | "pending" | "preparing" | "ready" | "completed";
type Granularity    = "Hourly" | "Daily" | "Monthly";

/* ─── Constants ──────────────────────────────────────────────────────────── */
const PALETTE = [
  "var(--amber)","#22C55E","#6366F1","#EC4899",
  "#14B8A6","#EF4444","#A855F7","#84CC16",
  "#0EA5E9","#D946EF","#F97316","#8B5CF6",
];

const STATUS_BADGE: Record<string,{label:string;color:string;bg:string}> = {
  pending:   {label:"Pending",   color:"var(--info)", bg:"rgba(111,180,255,0.12)"},
  preparing: {label:"Preparing", color:"var(--warn)", bg:"rgba(255,184,77,0.12)"},
  ready:     {label:"Ready",     color:"var(--ok)",   bg:"rgba(139,209,124,0.12)"},
  completed: {label:"Completed", color:"var(--text-3)",bg:"rgba(107,96,83,0.15)"},
  cancelled: {label:"Cancelled", color:"var(--err)",  bg:"rgba(255,107,94,0.12)"},
};

/* ─── SVG Donut Chart ────────────────────────────────────────────────────── */
function polarXY(cx:number, cy:number, r:number, deg:number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function DonutChart({ segments, size = 130 }: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const cx = size / 2, cy = size / 2;
  const ro = size * 0.41, ri = size * 0.26;

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={(ro + ri) / 2} fill="none" stroke="rgba(var(--tint-rgb), 0.08)" strokeWidth={ro - ri} />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="rgba(var(--tint-rgb), 0.25)" fontSize={10}>—</text>
      </svg>
    );
  }

  let angle = 0;
  const arcs = segments.filter(s => s.value > 0).map((seg, i) => {
    const sweep = (seg.value / total) * 359.99;
    const start = angle, end = angle + sweep;
    angle = end;
    const large = sweep > 180 ? 1 : 0;
    const s = polarXY(cx, cy, ro, start), e = polarXY(cx, cy, ro, end);
    const si = polarXY(cx, cy, ri, end), ei = polarXY(cx, cy, ri, start);
    const d = [
      `M${s.x.toFixed(2)} ${s.y.toFixed(2)}`,
      `A${ro} ${ro} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`,
      `L${si.x.toFixed(2)} ${si.y.toFixed(2)}`,
      `A${ri} ${ri} 0 ${large} 0 ${ei.x.toFixed(2)} ${ei.y.toFixed(2)}Z`,
    ].join(" ");
    return <path key={i} d={d} fill={seg.color} />;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={(ro + ri) / 2} fill="none" stroke="rgba(var(--tint-rgb), 0.06)" strokeWidth={ro - ri} />
      {arcs}
    </svg>
  );
}

/* ─── SVG Area Chart ─────────────────────────────────────────────────────── */
function AreaChart({ points, labels }: { points: number[]; labels: string[] }) {
  if (points.length === 0 || points.every(v => v === 0)) {
    return <div className="dash-empty" style={{ height: 170 }}>No sales data for this period</div>;
  }

  const W = 700, H = 170, PL = 52, PR = 16, PT = 10, PB = 28;
  const cW = W - PL - PR, cH = H - PT - PB;
  const maxY = Math.max(...points, 1);
  const step = points.length > 1 ? cW / (points.length - 1) : cW;
  const coords = points.map((v, i) => ({ x: PL + i * step, y: PT + cH - (v / maxY) * cH }));

  const lineD = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const areaD = `${lineD} L${coords[coords.length - 1].x.toFixed(1)} ${(PT + cH).toFixed(1)} L${coords[0].x.toFixed(1)} ${(PT + cH).toFixed(1)}Z`;

  const gridLines = Array.from({ length: 6 }, (_, i) => {
    const frac = i / 5;
    return { y: PT + cH - frac * cH, label: Math.round(frac * maxY).toLocaleString() };
  });
  const labelStep = Math.max(1, Math.ceil(labels.length / 8));
  const xLabels = labels
    .map((lbl, i) => ({ lbl, x: coords[i]?.x ?? 0, show: i % labelStep === 0 || i === labels.length - 1 }))
    .filter(l => l.show);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }}>
      <defs>
        <linearGradient id="dag" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--amber)" stopOpacity={0.25} />
          <stop offset="100%" stopColor="var(--amber)" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {gridLines.map((g, i) => (
        <g key={i}>
          <line x1={PL} y1={g.y} x2={W - PR} y2={g.y} stroke="rgba(var(--tint-rgb), 0.08)" strokeWidth={0.8} />
          <text x={PL - 6} y={g.y} textAnchor="end" dominantBaseline="middle" fill="#6b6053" fontSize={9}>{g.label}</text>
        </g>
      ))}
      <path d={areaD} fill="url(#dag)" />
      <path d={lineD} fill="none" stroke="var(--amber)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((c, i) => points[i] > 0 ? <circle key={i} cx={c.x} cy={c.y} r={3} fill="var(--amber-bright)" /> : null)}
      {xLabels.map((l, i) => (
        <text key={i} x={l.x} y={H - 4} textAnchor="middle" fill="#6b6053" fontSize={8.5}>{l.lbl}</text>
      ))}
    </svg>
  );
}

/* ─── Donut chart card (analytics) ──────────────────────────────────────── */
function DonutChartCard({ title, dateLabel, segments }: {
  title: string;
  dateLabel: string;
  segments: { label: string; value: number; color: string }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? segments : segments.slice(0, 4);

  return (
    <div className="admin-card" style={{ padding: 0 }}>
      <div className="dash-card-header">
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>{title}</h2>
          <div className="dash-card-sub">{dateLabel}</div>
        </div>
        <button className="dash-overflow" title="Options">•••</button>
      </div>
      <div className="dash-donut-body"><DonutChart segments={segments} size={120} /></div>
      <div className="dash-legend">
        {visible.length === 0 && <div style={{ fontSize: 11, color: "var(--text-3)", padding: "4px 0" }}>No data</div>}
        {visible.map((s, i) => (
          <div key={i} className="dash-legend-row">
            <span className="dash-legend-dot" style={{ background: s.color }} />
            <span className="dash-legend-label">{s.label}</span>
            <span className="dash-legend-value">{peso(s.value)}</span>
          </div>
        ))}
      </div>
      {segments.length > 4 && (
        <button className="dash-see-more" onClick={() => setExpanded(!expanded)}>
          {expanded ? "← Less" : "More →"}
        </button>
      )}
    </div>
  );
}

/* ─── Ops KPI card ───────────────────────────────────────────────────────── */
function OpsKpi({ label, value, color, alert }: {
  label: string; value: string; color: string; alert?: boolean;
}) {
  return (
    <div className="ops-kpi-card" style={{ borderColor: alert ? `${color}55` : "var(--line-strong)" }}>
      <div className="ops-kpi-label">{label}</div>
      <div className="ops-kpi-value" style={{ color }}>{value}</div>
    </div>
  );
}

/* ─── Needs attention cell ───────────────────────────────────────────────── */
function AttnCell({ label, n, alert, good }: {
  label: string; n: number; alert?: boolean; good?: boolean;
}) {
  const color = good
    ? n > 0 ? "var(--ok)" : "var(--text-3)"
    : alert && n > 0
      ? n > 5 ? "var(--err)" : "var(--warn)"
      : "var(--text-3)";
  return (
    <div className="ops-attn-cell" style={{ borderColor: alert && n > 0 ? `${color}40` : "var(--line)" }}>
      <div className="ops-attn-n" style={{ color }}>{n}</div>
      <div className="ops-attn-lbl">{label}</div>
    </div>
  );
}

/* ─── Ops hourly sparkline ───────────────────────────────────────────────── */
function OpsHourlyChart({ data }: { data: number[] }) {
  const biz = data.slice(8, 23); // 8 AM – 10 PM
  if (biz.every(v => v === 0)) {
    return (
      <div style={{ padding: "14px 0", textAlign: "center", color: "var(--text-3)", fontFamily: "var(--f-mono)", fontSize: 11 }}>
        No sales yet today
      </div>
    );
  }

  const W = 260, H = 58, PL = 6, PR = 6, PT = 4, PB = 16;
  const cW = W - PL - PR, cH = H - PT - PB;
  const maxY = Math.max(...biz, 1);
  const step = biz.length > 1 ? cW / (biz.length - 1) : cW;
  const coords = biz.map((v, i) => ({ x: PL + i * step, y: PT + cH - (v / maxY) * cH, v }));
  const lineD = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const areaD = `${lineD} L${coords[coords.length - 1].x.toFixed(1)} ${(PT + cH).toFixed(1)} L${coords[0].x.toFixed(1)} ${(PT + cH).toFixed(1)}Z`;

  const labelPts = [{ idx: 0, l: "8a" }, { idx: 3, l: "11a" }, { idx: 6, l: "2p" }, { idx: 9, l: "5p" }, { idx: 12, l: "8p" }];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }}>
      <defs>
        <linearGradient id="opsSpk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--amber)" stopOpacity={0.3} />
          <stop offset="100%" stopColor="var(--amber)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#opsSpk)" />
      <path d={lineD} fill="none" stroke="var(--amber)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((c, i) => c.v > 0 ? <circle key={i} cx={c.x} cy={c.y} r={2.5} fill="var(--amber-bright)" /> : null)}
      {labelPts.map(({ idx, l }) => (
        <text key={l} x={(PL + idx * step).toFixed(1)} y={H - 1} textAnchor="middle"
          fill="var(--text-3)" fontSize={7} fontFamily="var(--f-mono)">{l}</text>
      ))}
    </svg>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export function DashboardClient({ transactions, orderItems, todayOrders, branches }: DashboardClientProps) {
  // This café is effectively single-branch in practice, and this panel has
  // no branch picker of its own — "open" means at least one branch is
  // accepting orders/bookings, "closed" means none are. Real data instead of
  // the static "OPEN"/"ON"/"ON"/"Online" this panel used to always show
  // regardless of actual branch state or whether online ordering/booking
  // is even turned on.
  const anyAcceptingOrders   = branches.some(b => b.accepting_orders !== false);
  const anyAcceptingBookings = branches.some(b => b.accepting_bookings !== false);
  const hasBranches = branches.length > 0;

  const [view,        setView]        = useState<DashView>("ops");
  const [granularity, setGranularity] = useState<Granularity>("Hourly");
  const [itemsPage,   setItemsPage]   = useState(0);
  const [itemsPerPage,setItemsPerPage]= useState(10);
  const [chartRange,  setChartRange]  = useState<[number, number]>([0, 100]);
  const [orderTab,    setOrderTab]    = useState<OrderStatusTab>("all");
  const [periodComp,  setPeriodComp]  = useState<Record<string, number> | null>(null);

  /* ── Date helpers ── */
  const now      = new Date();
  const hh       = now.getHours();
  const greeting = hh < 12 ? "Good morning" : hh < 17 ? "Good afternoon" : "Good evening";
  const syncTime = now.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", weekday: "long" })
    + ", " + now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }).toLowerCase();
  const today    = now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const dateLabel= `${now.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}, 12:00am – 11:59pm`;

  // Fetch MoM comparison when analytics view is activated
  useEffect(() => {
    if (view !== "analytics" || periodComp !== null) return;
    fetchExtendedReport("period-comparison", today, today)
      .then((d) => {
        if (d && d.current) {
          const cur = d.current, prev = d.previous ?? {};
          const pct = (key: string) => {
            const c = Number(cur[key] ?? 0), p = Number(prev[key] ?? 0);
            if (p === 0) return c > 0 ? 100 : 0;
            return ((c - p) / p) * 100;
          };
          setPeriodComp({
            gross:  pct("gross_sales"),
            net:    pct("net_sales"),
            orders: pct("orders"),
            aov:    pct("aov"),
          });
        }
      })
      .catch(() => { /* period comparison is best-effort */ });
  }, [view, periodComp, today]);

  /* ── Shared transaction filters ── */
  const todayTxs = useMemo(
    () => transactions.filter(t => (t.created_at ?? "").slice(0, 10) === today),
    [transactions, today],
  );
  const saleTxs = useMemo(
    () => todayTxs.filter(t => t.type === "sale" && t.status === "completed"),
    [todayTxs],
  );
  // orderItems comes from the same rolling-24h fetch as transactions (see
  // page.tsx's adminApi.reports(wsId,{days:1})) — todayTxs narrows that down
  // to exactly today's Manila calendar day, but itemCount/cogs/byCategory/
  // byItem/itemsList used to read orderItems raw, so they could include an
  // item from yesterday evening that's inside the rolling 24h window but
  // outside today, while the sales KPIs above were already today-only.
  const todayOrderItems = useMemo(
    () => orderItems.filter(i => (i.orders?.created_at ?? "").slice(0, 10) === today),
    [orderItems, today],
  );

  /* ── Analytics KPIs ── */
  const netSales      = useMemo(() => saleTxs.reduce((s, t) => s + Number(t.amount), 0), [saleTxs]);
  const txCount       = saleTxs.length;
  const totalDiscount = useMemo(() => todayTxs.filter(t => t.type === "discount").reduce((s, t) => s + Math.abs(Number(t.amount)), 0), [todayTxs]);
  const totalRefunds  = useMemo(() => todayTxs.filter(t => t.type === "refund").reduce((s, t) => s + Math.abs(Number(t.amount)), 0), [todayTxs]);
  const itemCount     = useMemo(() => todayOrderItems.reduce((s, i) => s + Number(i.quantity), 0), [todayOrderItems]);
  const cogs          = useMemo(() => todayOrderItems.reduce((s, i) => s + Number(i.products?.cost ?? 0) * Number(i.quantity), 0), [todayOrderItems]);
  // Gross profit (COGS only, no operating expenses) — Reports' "Net Profit"
  // additionally subtracts expenses, a genuinely different figure. Both used
  // to be labeled just "Profit", so they silently disagreed for the same day.
  const grossProfit   = netSales - cogs;
  const onlineOrders  = useMemo(() => todayOrders.filter(o => o.is_online && (o.status === "completed" || o.status === "ready")), [todayOrders]);
  const onlineRevenue = useMemo(() => onlineOrders.reduce((s, o) => s + Number(o.total ?? 0), 0), [onlineOrders]);

  /* ── Ops order counts ── */
  const pendingCnt   = todayOrders.filter(o => o.status === "pending").length;
  const preparingCnt = todayOrders.filter(o => o.status === "preparing").length;
  const readyCnt     = todayOrders.filter(o => o.status === "ready").length;
  const completedCnt = todayOrders.filter(o => o.status === "completed").length;
  const cancelledCnt = todayOrders.filter(o => o.status === "cancelled").length;
  const onlineCnt    = todayOrders.filter(o => o.is_online).length;
  const avgOrder     = txCount > 0 ? netSales / txCount : 0;

  const ORDER_TABS = [
    { key: "all"       as OrderStatusTab, label: "All",       count: todayOrders.length },
    { key: "pending"   as OrderStatusTab, label: "Pending",   count: pendingCnt },
    { key: "preparing" as OrderStatusTab, label: "Preparing", count: preparingCnt },
    { key: "ready"     as OrderStatusTab, label: "Ready",     count: readyCnt },
    { key: "completed" as OrderStatusTab, label: "Done",      count: completedCnt },
  ];

  const visibleOrders = useMemo(
    () => orderTab === "all" ? todayOrders : todayOrders.filter(o => o.status === orderTab),
    [todayOrders, orderTab],
  );

  /* ── Hourly data ── */
  const hourlyData = useMemo(() => {
    const hours = Array(24).fill(0) as number[];
    saleTxs.forEach(t => { hours[new Date(t.created_at).getHours()] += Number(t.amount); });
    return hours;
  }, [saleTxs]);

  /* ── Analytics chart ── */
  const resetRange = () => setChartRange([0, 100]);

  const chartData = useMemo<{ points: number[]; labels: string[] }>(() => {
    if (granularity === "Hourly") {
      const hours = Array(24).fill(0) as number[];
      saleTxs.forEach(t => { hours[new Date(t.created_at).getHours()] += Number(t.amount); });
      return {
        points: hours,
        labels: Array.from({ length: 24 }, (_, i) => {
          if (i === 0) return "12AM"; if (i < 12) return `${i}AM`;
          if (i === 12) return "12PM"; return `${i - 12}PM`;
        }),
      };
    }
    if (granularity === "Daily") {
      const map = new Map<string, number>();
      saleTxs.forEach(t => { const d = t.created_at.slice(0, 10); map.set(d, (map.get(d) ?? 0) + Number(t.amount)); });
      const sorted = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      return {
        points: sorted.map(([, v]) => v),
        labels: sorted.map(([d]) => new Date(d + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" })),
      };
    }
    const map = new Map<string, number>();
    saleTxs.forEach(t => { const m = t.created_at.slice(0, 7); map.set(m, (map.get(m) ?? 0) + Number(t.amount)); });
    const sorted = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return {
      points: sorted.map(([, v]) => v),
      labels: sorted.map(([m]) => {
        const [yr, mo] = m.split("-");
        return new Date(Number(yr), Number(mo) - 1).toLocaleDateString("en-PH", { month: "short", year: "2-digit" });
      }),
    };
  }, [granularity, saleTxs]);

  const chartDataSliced = useMemo(() => {
    const n = chartData.points.length;
    if (n === 0) return chartData;
    const start = Math.floor((chartRange[0] / 100) * n);
    const end   = Math.ceil((chartRange[1] / 100) * n);
    return { points: chartData.points.slice(start, end), labels: chartData.labels.slice(start, end) };
  }, [chartData, chartRange]);

  /* ── Payment breakdown ── */
  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    saleTxs.forEach(t => { const m = t.payment_method ?? "Cash"; map.set(m, (map.get(m) ?? 0) + Number(t.amount)); });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
  }, [saleTxs]);

  /* ── Donut data ── */
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    todayOrderItems.forEach(item => { const cat = item.products?.product_categories?.name ?? "Other"; map.set(cat, (map.get(cat) ?? 0) + Number(item.total)); });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
  }, [todayOrderItems]);

  const byItem = useMemo(() => {
    const map = new Map<string, number>();
    todayOrderItems.forEach(item => { const name = item.products?.name ?? "Unknown"; map.set(name, (map.get(name) ?? 0) + Number(item.total)); });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
  }, [todayOrderItems]);

  const byCashier = useMemo(() => {
    const map = new Map<string, number>();
    todayOrders.filter(o => o.status === "completed" || o.status === "ready").forEach(o => {
      const name = (o as any).cashier_name ?? (o as any).profiles?.full_name ?? o.branches?.name ?? "Unassigned";
      map.set(name, (map.get(name) ?? 0) + Number(o.total ?? 0));
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
  }, [todayOrders]);

  /* ── Items list ── */
  const itemsList = useMemo(() => {
    const map = new Map<string, { name: string; option: string; qty: number; amount: number; profit: number }>();
    todayOrderItems.forEach(item => {
      const name   = item.products?.name ?? "Unknown";
      const option = item.product_options?.name ?? item.option ?? "—";
      const key    = `${name}::${option}`;
      const prev   = map.get(key) ?? { name, option, qty: 0, amount: 0, profit: 0 };
      const qty    = Number(item.quantity), amt = Number(item.total);
      const cost   = Number(item.products?.cost ?? 0) * qty;
      map.set(key, { name, option, qty: prev.qty + qty, amount: prev.amount + amt, profit: prev.profit + (amt - cost) });
    });
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [todayOrderItems]);

  const totalItemPages = Math.ceil(itemsList.length / itemsPerPage) || 1;
  const itemsSlice     = itemsList.slice(itemsPage * itemsPerPage, (itemsPage + 1) * itemsPerPage);

  /* ── Payment icon ── */
  function paymentIcon(method: string) {
    const m = (method ?? "").toLowerCase();
    if (m.includes("gcash") || m.includes("g-cash"))  return "💙";
    if (m.includes("maya")  || m.includes("paymaya")) return "💚";
    if (m.includes("bank")  || m.includes("transfer"))return "🏦";
    if (m.includes("card")  || m.includes("credit") || m.includes("debit")) return "💳";
    if (m.includes("grab")) return "🟢";
    return "💵";
  }

  /* ── Helper: format order ref ── */
  function fmtRef(no?: string) {
    if (!no) return "—";
    const m = no.match(/(\d+)$/);
    return m ? `#${m[1].slice(-4).padStart(4, "0")}` : no;
  }

  /* ─── Render ─────────────────────────────────────────────────────────── */
  return (
    <>
      {/* ── Sticky header ── */}
      <div className="admin-header">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">{greeting} &middot; {syncTime}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="dash-view-switcher">
            <button className={`dash-view-btn ${view === "ops" ? "active" : ""}`} onClick={() => setView("ops")}>
              ⚡ Operations
            </button>
            <button className={`dash-view-btn ${view === "analytics" ? "active" : ""}`} onClick={() => setView("analytics")}>
              📊 Analytics
            </button>
          </div>
          <RefreshButton />
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          OPERATIONS VIEW
      ══════════════════════════════════════════════ */}
      {view === "ops" && (
        <>
          {/* KPI strip — 6 compact cards */}
          <div className="ops-kpi-strip">
            <OpsKpi label="Net Sales"   value={peso(netSales)}         color="var(--amber-bright)" />
            <OpsKpi label="Orders"      value={String(txCount)}        color="var(--ok)" />
            <OpsKpi label="Avg Order"   value={peso(avgOrder)}         color="var(--info)" />
            <OpsKpi label="Pending Pay" value={String(pendingCnt)}     color={pendingCnt   > 0 ? "var(--warn)" : "var(--text-3)"} alert={pendingCnt > 0} />
            <OpsKpi label="Preparing"   value={String(preparingCnt)}   color={preparingCnt > 0 ? "var(--amber-bright)" : "var(--text-3)"} />
            <OpsKpi label="Cancelled"   value={String(cancelledCnt)}   color={cancelledCnt > 0 ? "var(--err)" : "var(--text-3)"} alert={cancelledCnt > 0} />
          </div>

          {/* 2-column body */}
          <div className="ops-body">

            {/* ── LEFT: Live Orders queue ── */}
            <div className="admin-card ops-orders-card">
              <div className="ops-card-head">
                <div className="ops-card-title">Live Orders / Queue</div>
                <div className="ops-card-count">{todayOrders.length} records</div>
              </div>

              {/* Status filter tabs */}
              <div className="ops-tabs">
                {ORDER_TABS.map(t => (
                  <button
                    key={t.key}
                    className={`ops-tab ${orderTab === t.key ? "active" : ""}`}
                    onClick={() => setOrderTab(t.key)}
                  >
                    {t.label}
                    {t.count > 0 && <span className="ops-tab-count">{t.count}</span>}
                  </button>
                ))}
              </div>

              {/* Orders table */}
              <div className="ops-table-scroll">
                <table className="ops-order-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Type / Table</th>
                      <th>Customer</th>
                      <th style={{ textAlign: "right" }}>Amount</th>
                      <th style={{ textAlign: "center" }}>Status</th>
                      <th style={{ textAlign: "right" }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOrders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="ops-empty-cell">
                          No orders{orderTab !== "all" ? ` with status "${orderTab}"` : ""} today
                        </td>
                      </tr>
                    ) : (
                      visibleOrders.map(o => {
                        const badge = STATUS_BADGE[o.status ?? ""] ?? STATUS_BADGE.pending;
                        const time  = o.created_at
                          ? new Date(o.created_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })
                          : "—";
                        const type  = o.is_online
                          ? "Online"
                          : o.table_no ? `Table ${o.table_no}` : (o.order_type ?? "In-Store").replace(/_/g, " ");
                        return (
                          <tr key={o.id}>
                            <td><span className="mono bold">{fmtRef(o.order_no)}</span></td>
                            <td className="dim">{type}</td>
                            <td>{o.customer ?? o.cashier_name ?? "—"}</td>
                            <td style={{ textAlign: "right" }}><span className="mono bold">{peso(Number(o.total ?? 0))}</span></td>
                            <td style={{ textAlign: "center" }}>
                              <span className="ops-status-badge" style={{ color: badge.color, background: badge.bg }}>
                                {badge.label}
                              </span>
                            </td>
                            <td style={{ textAlign: "right" }}><span className="mono dim">{time}</span></td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── RIGHT: Operations panel column ── */}
            <div className="ops-right-col">

              {/* Branch / system status */}
              <div className="admin-card ops-panel-card">
                <div className="ops-card-head">
                  <div className="ops-card-title">Operations Panel</div>
                  <span className="ops-live-pill">Live</span>
                </div>
                <div className="ops-status-item">
                  <span className="ops-status-key">Branch Status</span>
                  <span className={`pill ${hasBranches && anyAcceptingOrders ? "ok" : "err"}`}>
                    {hasBranches && anyAcceptingOrders ? "OPEN" : "CLOSED"}
                  </span>
                </div>
                <div className="ops-status-item">
                  <span className="ops-status-key">Accepting Orders</span>
                  <span className={hasBranches && anyAcceptingOrders ? "ops-val-ok" : "ops-val-err"}>
                    {hasBranches && anyAcceptingOrders ? "ON" : "OFF"}
                  </span>
                </div>
                <div className="ops-status-item">
                  <span className="ops-status-key">Online Bookings</span>
                  <span className={ONLINE_BOOKING_ENABLED && anyAcceptingBookings ? "ops-val-ok" : "ops-val-err"}>
                    {ONLINE_BOOKING_ENABLED && anyAcceptingBookings ? "ON" : "OFF"}
                  </span>
                </div>
                <div className="ops-status-item">
                  <span className="ops-status-key">Payment Gateway</span>
                  <span className={ONLINE_ORDERING_ENABLED || ONLINE_BOOKING_ENABLED ? "ops-val-ok" : "ops-val-err"}>
                    {ONLINE_ORDERING_ENABLED || ONLINE_BOOKING_ENABLED ? "Online" : "Not Configured"}
                  </span>
                </div>
                <div className="ops-status-item">
                  <span className="ops-status-key">System</span>
                  <span className="ops-val-ok">Online</span>
                </div>
              </div>

              {/* Needs attention 2×2 grid */}
              <div className="admin-card ops-panel-card">
                <div className="ops-card-head">
                  <div className="ops-card-title">Needs Attention</div>
                </div>
                <div className="ops-attn-grid">
                  <AttnCell label="Pending Pay" n={pendingCnt}   alert={pendingCnt > 0} />
                  <AttnCell label="Kitchen"     n={preparingCnt} />
                  <AttnCell label="Cancelled"   n={cancelledCnt} alert={cancelledCnt > 0} />
                  <AttnCell label="Online"      n={onlineCnt}    good />
                </div>
              </div>

              {/* Quick access 3×2 grid */}
              <div className="admin-card ops-panel-card">
                <div className="ops-card-head">
                  <div className="ops-card-title">Quick Access</div>
                </div>
                <div className="ops-act-grid">
                  {[
                    { label: "Orders",       icon: "📋", href: "/orders" },
                    { label: "Reports",      icon: "📊", href: "/reports" },
                    { label: "Inventory",    icon: "📦", href: "/inventory" },
                    { label: "Customers",    icon: "👤", href: "/customers" },
                    { label: "Staff",        icon: "👥", href: "/staff" },
                    { label: "Transactions", icon: "💰", href: "/transactions" },
                  ].map(a => (
                    <Link key={a.href} href={a.href as any} className="ops-act-btn">
                      <span style={{ fontSize: 18 }}>{a.icon}</span>
                      <span className="ops-act-label">{a.label}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Hourly sparkline */}
              <div className="admin-card ops-panel-card">
                <div className="ops-card-head">
                  <div className="ops-card-title">Sales by Hour</div>
                  <div className="ops-card-count">Today</div>
                </div>
                <div style={{ padding: "2px 8px 8px" }}>
                  <OpsHourlyChart data={hourlyData} />
                </div>
              </div>

            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════
          ANALYTICS VIEW
      ══════════════════════════════════════════════ */}
      {view === "analytics" && (
        <>
          <div className="dash-sync">Last synced · {syncTime}</div>

          <div className="admin-body">

            {/* 9 KPI cards with MoM comparison */}
            {(() => {
              // Map each KPI index to a period-comparison key (null = no comparison shown)
              const compKeys: (string | null)[] = [
                "net", null, "orders", null, null, null, null, null, null,
              ];
              const kpis = [
                { label: "Total Net Sales",      value: peso(netSales),              color: "amber" },
                { label: "Total Discounts",      value: peso(totalDiscount),         color: "warn"  },
                { label: "No. of Transactions",  value: String(txCount),             color: "ok"    },
                { label: "Cost of Goods",        value: peso(cogs),                  color: "err"   },
                { label: "No. of Items",         value: String(itemCount),           color: ""      },
                { label: "Gross Profit",         value: peso(grossProfit),           color: grossProfit >= 0 ? "ok" : "err" },
                { label: "Total Refunds",        value: peso(totalRefunds),          color: "warn"  },
                { label: "Total Online Revenue", value: peso(onlineRevenue),         color: "amber" },
                { label: "Online Orders",        value: String(onlineOrders.length), color: ""      },
              ];
              return (
                <div className="kpi-grid dash-kpi-3" style={{ marginBottom: 24 }}>
                  {kpis.map((k, i) => {
                    const compKey = compKeys[i];
                    const pct = compKey && periodComp ? periodComp[compKey] : null;
                    return (
                      <div key={i} className="kpi">
                        <div className="lbl">{k.label}</div>
                        <div className={`val ${k.color}`}>{k.value}</div>
                        {pct !== null && pct !== undefined && (
                          <div style={{
                            fontFamily: "var(--f-mono)", fontSize: 10,
                            color: pct > 0 ? "var(--ok)" : pct < 0 ? "var(--err)" : "var(--text-3)",
                            marginTop: 3,
                          }}>
                            {pct === 0 ? "— vs prev period" : `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}% vs prev period`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Greeting + date label */}
            <div className="dash-greeting-row">
              <div className="dash-greeting">{greeting}, MUGTHEMUG!</div>
              <div className="dash-date-filter">📅 {dateLabel}</div>
            </div>

            {/* Sales chart + payment types */}
            <div className="dash-chart-row">
              <div className="admin-card" style={{ padding: 0 }}>
                <div className="dash-card-header">
                  <div>
                    <h2 style={{ margin: 0, fontSize: 16 }}>Sales by Date</h2>
                    <div className="dash-card-sub">{dateLabel}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="dash-chart-tabs">
                      {(["Hourly", "Daily", "Monthly"] as Granularity[]).map(g => (
                        <button key={g} className={`dash-tab-btn ${granularity === g ? "active" : ""}`}
                          onClick={() => { setGranularity(g); resetRange(); }}>
                          {g}
                        </button>
                      ))}
                    </div>
                    <button className="dash-overflow">•••</button>
                  </div>
                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--text-3)", paddingLeft: 4 }}>
                    {chartDataSliced.labels[0] && chartDataSliced.labels.length < chartData.labels.length
                      ? `${chartDataSliced.labels[0]} – ${chartDataSliced.labels[chartDataSliced.labels.length - 1]}`
                      : dateLabel}
                  </div>
                </div>
                {chartData.points.length > 2 && (
                  <div style={{ padding: "0 16px 4px", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--text-3)" }}>
                      {chartDataSliced.labels[0] ?? ""}
                    </span>
                    <div style={{ flex: 1, position: "relative", height: 20, display: "flex", alignItems: "center" }}>
                      <input type="range" min={0} max={100} step={1} value={chartRange[0]}
                        onChange={e => { const v = Number(e.target.value); if (v < chartRange[1] - 5) setChartRange([v, chartRange[1]]); }}
                        style={{ position: "absolute", width: "100%", accentColor: "var(--amber)", zIndex: 2, background: "transparent" }} />
                      <input type="range" min={0} max={100} step={1} value={chartRange[1]}
                        onChange={e => { const v = Number(e.target.value); if (v > chartRange[0] + 5) setChartRange([chartRange[0], v]); }}
                        style={{ position: "absolute", width: "100%", accentColor: "var(--amber)", zIndex: 2, background: "transparent" }} />
                      <div style={{ position: "absolute", left: 0, right: 0, height: 3, background: "rgba(var(--tint-rgb), 0.12)", borderRadius: 2 }}>
                        <div style={{ position: "absolute", left: `${chartRange[0]}%`, right: `${100 - chartRange[1]}%`, height: "100%", background: "rgba(var(--tint-rgb), 0.45)", borderRadius: 2 }} />
                      </div>
                    </div>
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--text-3)" }}>
                      {chartDataSliced.labels[chartDataSliced.labels.length - 1] ?? ""}
                    </span>
                  </div>
                )}
                <div style={{ padding: "0 12px 14px" }}>
                  <AreaChart points={chartDataSliced.points} labels={chartDataSliced.labels} />
                </div>
              </div>

              <div className="admin-card" style={{ padding: 0 }}>
                <div className="dash-card-header">
                  <div>
                    <h2 style={{ margin: 0, fontSize: 16 }}>Payment Types</h2>
                    <div className="dash-card-sub">{dateLabel}</div>
                  </div>
                  <button className="dash-overflow">•••</button>
                </div>
                <div className="dash-payment-list">
                  {paymentBreakdown.length === 0 && (
                    <div className="dash-empty" style={{ padding: 20 }}>No payment data</div>
                  )}
                  {paymentBreakdown.map((p, i) => (
                    <div key={i} className="dash-payment-row">
                      <span className="dash-payment-icon">{paymentIcon(p.label)}</span>
                      <span className="dash-payment-name">{p.label}</span>
                      <span className="dash-payment-amount">{peso(p.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 4 Donut charts */}
            <div className="dash-donut-row">
              <DonutChartCard title="By Category" dateLabel={dateLabel} segments={byCategory} />
              <DonutChartCard title="By Item"     dateLabel={dateLabel} segments={byItem} />
              <DonutChartCard title="By Cashier"  dateLabel={dateLabel} segments={byCashier} />
              <DonutChartCard title="By Payment"  dateLabel={dateLabel} segments={paymentBreakdown} />
            </div>

            {/* Items table */}
            <div className="admin-table-wrap dash-items-wrap">
              <div className="admin-table-head">
                <h2>List of Items</h2>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>{dateLabel}</span>
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: 44 }}></th>
                    <th>Item</th>
                    <th>Option</th>
                    <th style={{ textAlign: "right" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>↓ Amount</th>
                    <th style={{ textAlign: "right" }}>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsSlice.length === 0 && (
                    <tr><td colSpan={6} className="empty">No items sold today</td></tr>
                  )}
                  {itemsSlice.map((item, i) => (
                    <tr key={item.name}>
                      <td>
                        <span className="dash-row-num">
                          {String(itemsPage * itemsPerPage + i + 1).padStart(2, "0")}
                        </span>
                      </td>
                      <td className="bold">{item.name.toUpperCase()}</td>
                      <td className="dim">{item.option !== "—" ? item.option.toUpperCase() : "—"}</td>
                      <td style={{ textAlign: "right" }}><span className="mono">{item.qty}</span></td>
                      <td style={{ textAlign: "right" }} className="bold">{peso(item.amount)}</td>
                      <td style={{ textAlign: "right" }} className={item.profit >= 0 ? "dash-profit" : ""}>{peso(item.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="dash-table-footer">
                <div className="dash-rows-select">
                  Rows per page:
                  <select value={itemsPerPage}
                    onChange={e => { setItemsPerPage(Number(e.target.value)); setItemsPage(0); }}
                    className="dash-select">
                    {[5, 10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  {itemsList.length === 0
                    ? "0–0 of 0"
                    : `${itemsPage * itemsPerPage + 1}–${Math.min((itemsPage + 1) * itemsPerPage, itemsList.length)} of ${itemsList.length}`}
                </div>
                <div className="dash-page-btns">
                  <button className="btn-xs" onClick={() => setItemsPage(p => p - 1)} disabled={itemsPage === 0}>‹</button>
                  <button className="btn-xs" onClick={() => setItemsPage(p => p + 1)} disabled={itemsPage >= totalItemPages - 1}>›</button>
                </div>
              </div>
            </div>

          </div>
        </>
      )}
    </>
  );
}

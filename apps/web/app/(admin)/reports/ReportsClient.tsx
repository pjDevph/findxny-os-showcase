"use client";

import { useState, useMemo } from "react";
import { peso } from "@/lib/config";
import { fetchExtendedReport } from "../actions";

/* ─────────────────────────────────────────────────
   Types
───────────────────────────────────────────────── */
interface Tx {
  type: string;
  status: string;
  amount: string | number;
  created_at: string;
  payment_method?: string;
  orders?: { cashier_name?: string; order_no?: string };
}
interface OItem {
  quantity: string | number;
  total: string | number;
  products?: {
    name?: string;
    cost?: number;
    product_categories?: { name?: string };
  };
  orders?: { created_at?: string };
}

export interface ReportsClientProps {
  transactions: Tx[];
  orders: any[];
  orderItems: OItem[];
  expenses: { id: string; expense_date: string; amount: string | number; expense_categories?: { name?: string } | null }[];
  customers: any[];
  onlineOrders: any[];
  initialFrom: string;
  initialTo: string;
}

type Tab = "overview" | "product-mix" | "transactions" | "category" | "customers" | "online-customers" | "bookings" | "staff" | "discounts";
type Granularity = "Hourly" | "Daily" | "Monthly";

/* ─────────────────────────────────────────────────
   SVG Area Chart — amber theme
───────────────────────────────────────────────── */
function AreaChart({ points, labels }: { points: number[]; labels: string[] }) {
  if (points.length === 0 || points.every((v) => v === 0)) {
    return (
      <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-3)", fontFamily: "var(--f-mono)", fontSize: 12 }}>
        No sales data for this period
      </div>
    );
  }

  const W = 680, H = 170, PL = 52, PR = 16, PT = 10, PB = 28;
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
    .filter((l) => l.show);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }}>
      <defs>
        <linearGradient id="rag" x1="0" y1="0" x2="0" y2="1">
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
      <path d={areaD} fill="url(#rag)" />
      <path d={lineD} fill="none" stroke="var(--amber)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((c, i) => points[i] > 0 ? <circle key={i} cx={c.x} cy={c.y} r={3} fill="var(--amber-bright)" /> : null)}
      {xLabels.map((l, i) => (
        <text key={i} x={l.x} y={H - 4} textAnchor="middle" fill="#6b6053" fontSize={8.5}>{l.lbl}</text>
      ))}
    </svg>
  );
}

/* ─────────────────────────────────────────────────
   Donut Chart
───────────────────────────────────────────────── */
const DONUT_COLORS = ["var(--amber)", "#22c55e", "#3b82f6", "#a855f7", "#ef4444", "#06b6d4", "#f97316", "#ec4899"];
function DonutChart({ data, subtitle }: { data: { label: string; value: number }[]; subtitle: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-3)", fontFamily: "var(--f-mono)", fontSize: 12 }}>No data</div>;

  const R = 54, ri = 36, cx = 70, cy = 70, size = 150;
  const PUSH = 8; // px to push hovered segment outward
  let angle = -Math.PI / 2;
  const segs = data.filter((d) => d.value > 0).map((d, i) => {
    const frac = d.value / total;
    const sweep = frac * Math.PI * 2;
    const a1 = angle, a2 = angle + sweep;
    const mid = (a1 + a2) / 2; // bisector angle for push direction
    const large = sweep > Math.PI ? 1 : 0;
    const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
    const x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
    const xi1 = cx + ri * Math.cos(a1), yi1 = cy + ri * Math.sin(a1);
    const xi2 = cx + ri * Math.cos(a2), yi2 = cy + ri * Math.sin(a2);
    let path: string;
    if (frac > 0.9999) {
      const mx = cx + R * Math.cos(a1 + Math.PI), my = cy + R * Math.sin(a1 + Math.PI);
      const mxi = cx + ri * Math.cos(a1 + Math.PI), myi = cy + ri * Math.sin(a1 + Math.PI);
      path = `M${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R},0,1,1,${mx.toFixed(1)},${my.toFixed(1)} A${R},${R},0,1,1,${x1.toFixed(1)},${y1.toFixed(1)} L${xi1.toFixed(1)},${yi1.toFixed(1)} A${ri},${ri},0,1,0,${mxi.toFixed(1)},${myi.toFixed(1)} A${ri},${ri},0,1,0,${xi1.toFixed(1)},${yi1.toFixed(1)}Z`;
    } else {
      path = `M${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R},0,${large},1,${x2.toFixed(1)},${y2.toFixed(1)} L${xi2.toFixed(1)},${yi2.toFixed(1)} A${ri},${ri},0,${large},0,${xi1.toFixed(1)},${yi1.toFixed(1)}Z`;
    }
    angle = a2;
    return {
      path,
      color: DONUT_COLORS[i % DONUT_COLORS.length],
      label: d.label,
      value: d.value,
      pct: frac * 100,
      tx: Math.cos(mid) * PUSH,
      ty: Math.sin(mid) * PUSH,
    };
  });

  const active = hovered !== null ? segs[hovered] : null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ flexShrink: 0, overflow: "visible" }}>
        {segs.map((s, i) => {
          const isHov = hovered === i;
          const dimmed = hovered !== null && !isHov;
          return (
            <path
              key={i}
              d={s.path}
              fill={s.color}
              style={{
                transform: isHov ? `translate(${s.tx.toFixed(2)}px, ${s.ty.toFixed(2)}px)` : "translate(0,0)",
                transition: "transform 0.22s cubic-bezier(.34,1.56,.64,1), opacity 0.18s ease",
                opacity: dimmed ? 0.3 : 1,
                cursor: "pointer",
                filter: isHov ? `drop-shadow(0 2px 8px ${s.color}80)` : "none",
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
        {/* Center hole */}
        <circle cx={cx} cy={cy} r={ri - 3} fill="var(--bg-card)" style={{ pointerEvents: "none" }} />
        {/* Center label — changes on hover */}
        {active ? (
          <>
            <text x={cx} y={cy - 8} textAnchor="middle" fill={active.color} fontSize={8.5} fontFamily="var(--f-mono)" fontWeight="700" style={{ pointerEvents: "none" }}>
              {active.pct.toFixed(1)}%
            </text>
            <text x={cx} y={cy + 5} textAnchor="middle" fill={active.color} fontSize={9} fontFamily="var(--f-mono)" style={{ pointerEvents: "none" }}>
              {peso(active.value)}
            </text>
            <text x={cx} y={cy + 17} textAnchor="middle" fill="var(--text-3)" fontSize={7.5} fontFamily="var(--f-mono)" style={{ pointerEvents: "none" }}>
              {active.label.length > 12 ? active.label.slice(0, 12) + "…" : active.label}
            </text>
          </>
        ) : (
          <>
            <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--text-3)" fontSize={9} fontFamily="var(--f-mono)" style={{ pointerEvents: "none" }}>{subtitle}</text>
            <text x={cx} y={cy + 10} textAnchor="middle" fill="var(--amber)" fontSize={10} fontFamily="var(--f-mono)" fontWeight="700" style={{ pointerEvents: "none" }}>{peso(total)}</text>
          </>
        )}
      </svg>

      {/* Legend */}
      <div style={{ flex: 1 }}>
        {segs.map((s, i) => {
          const isHov = hovered === i;
          const dimmed = hovered !== null && !isHov;
          return (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "center", gap: 7, marginBottom: 6,
                opacity: dimmed ? 0.35 : 1,
                transition: "opacity 0.18s ease",
                cursor: "pointer",
                padding: "2px 4px", borderRadius: 5,
                background: isHov ? `${s.color}14` : "transparent",
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: s.color, flexShrink: 0,
                transform: isHov ? "scale(1.4)" : "scale(1)", transition: "transform 0.18s ease" }} />
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: isHov ? "var(--text-1)" : "var(--text-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", transition: "color 0.18s" }}>{s.label}</span>
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: isHov ? s.color : "var(--text-1)", fontWeight: 600, flexShrink: 0, transition: "color 0.18s" }}>{peso(s.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   Profit & COGS by Item horizontal bars
───────────────────────────────────────────────── */
function ProfitByItemChart({ items }: { items: { name: string; sales: number; cost: number; profit: number }[] }) {
  const top = items.slice(0, 10);
  if (top.length === 0) return <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-3)", fontFamily: "var(--f-mono)", fontSize: 12 }}>No item data</div>;
  const maxVal = Math.max(...top.map((i) => i.sales), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {top.map((item) => {
        const cogsW = (item.cost / maxVal) * 100;
        const profitW = (item.profit / maxVal) * 100;
        return (
          <div key={item.name} style={{ display: "grid", gridTemplateColumns: "140px 1fr 64px", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.name}>{item.name}</span>
            <div style={{ position: "relative", height: 14, background: "rgba(var(--tint-rgb),0.06)", borderRadius: 4 }}>
              <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.max(0, cogsW)}%`, background: "rgba(239,68,68,0.45)", borderRadius: "4px 0 0 4px" }} />
              <div style={{ position: "absolute", left: `${Math.max(0, cogsW)}%`, top: 0, height: "100%", width: `${Math.max(0, profitW)}%`, background: "rgba(34,197,94,0.55)", borderRadius: profitW > 0 ? "0 4px 4px 0" : 0 }} />
            </div>
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: item.profit >= 0 ? "var(--ok)" : "var(--err)", textAlign: "right", fontWeight: 600 }}>{peso(item.profit)}</span>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--text-3)" }}><div style={{ width: 10, height: 10, background: "rgba(239,68,68,0.45)", borderRadius: 2 }} />COGS</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--text-3)" }}><div style={{ width: 10, height: 10, background: "rgba(34,197,94,0.55)", borderRadius: 2 }} />Profit</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   Units Sold by Hour heatmap
───────────────────────────────────────────────── */
function HourHeatmap({ txs, from, to }: { txs: Tx[]; from: string; to: string }) {
  const map = (() => {
    const m = new Map<string, Map<number, number>>();
    txs.filter((t) => t.type === "sale" && t.status === "completed").forEach((t) => {
      const d = t.created_at.slice(0, 10);
      const h = new Date(t.created_at).getHours();
      if (!m.has(d)) m.set(d, new Map());
      m.get(d)!.set(h, (m.get(d)!.get(h) ?? 0) + 1);
    });
    return m;
  })();

  const days = (() => {
    const result: string[] = [];
    const cur = new Date(from + "T00:00:00");
    const end = new Date(to + "T00:00:00");
    while (cur <= end) {
      result.push(cur.toLocaleDateString("en-CA"));
      cur.setDate(cur.getDate() + 1);
    }
    return result.slice(-14);
  })();

  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const maxCount = Math.max(1, ...[...map.values()].flatMap((m) => [...m.values()]));

  const CW = 22, CH = 18, GAP = 2, LW = 48, LH = 22;
  const W = LW + HOURS.length * (CW + GAP);
  const H = LH + days.length * (CH + GAP);

  function intensity(count: number) {
    if (count === 0) return 0;
    return 0.1 + (count / maxCount) * 0.85;
  }

  const hourLabel = (h: number) => h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: "block" }}>
        {/* Hour labels */}
        {HOURS.filter((_, i) => i % 2 === 0).map((h) => (
          <text key={h} x={LW + h * (CW + GAP) + CW / 2} y={LH - 6} textAnchor="middle" fill="#5a5040" fontSize={7.5} fontFamily="var(--f-mono)">{hourLabel(h)}</text>
        ))}
        {/* Day rows */}
        {days.map((day, di) => {
          const y = LH + di * (CH + GAP);
          const dayMap = map.get(day);
          const label = new Date(day + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" });
          return (
            <g key={day}>
              <text x={LW - 4} y={y + CH / 2 + 3} textAnchor="end" fill="#6b6053" fontSize={8} fontFamily="var(--f-mono)">{label}</text>
              {HOURS.map((h) => {
                const count = dayMap?.get(h) ?? 0;
                const alpha = intensity(count);
                return (
                  <g key={h}>
                    <rect x={LW + h * (CW + GAP)} y={y} width={CW} height={CH} rx={3}
                      fill={count === 0 ? "rgba(var(--tint-rgb),0.04)" : `rgba(var(--tint-rgb),${alpha})`}
                    />
                    {count > 0 && (
                      <text x={LW + h * (CW + GAP) + CW / 2} y={y + CH / 2 + 3} textAnchor="middle"
                        fill={alpha > 0.5 ? "#1a1410" : "#a89070"} fontSize={7} fontFamily="var(--f-mono)">{count}</text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, justifyContent: "flex-end" }}>
        <span style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--text-3)" }}>Lowest</span>
        {[0.05, 0.2, 0.4, 0.6, 0.8, 0.95].map((a, i) => <div key={i} style={{ width: 14, height: 10, borderRadius: 2, background: `rgba(var(--tint-rgb),${a})` }} />)}
        <span style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--text-3)" }}>Highest</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   Payment helpers
───────────────────────────────────────────────── */
function paymentIcon(method: string) {
  const m = (method ?? "").toLowerCase();
  if (m.includes("gcash")) return "💙";
  if (m.includes("maya")) return "💚";
  if (m.includes("bank") || m.includes("transfer")) return "🏦";
  if (m.includes("card")) return "💳";
  if (m.includes("grab")) return "🟢";
  return "💵";
}

/* ─────────────────────────────────────────────────
   Pagination
───────────────────────────────────────────────── */
function Pagination({ page, pages, total, perPage, onPage, onPerPage }: {
  page: number; pages: number; total: number; perPage: number;
  onPage: (n: number) => void; onPerPage: (n: number) => void;
}) {
  const start = total === 0 ? 0 : page * perPage + 1;
  const end = Math.min((page + 1) * perPage, total);
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "flex-end",
      gap: 20, padding: "12px 18px", borderTop: "1px solid var(--line)",
      fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-2)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        Rows:
        <select
          className="input" style={{ padding: "3px 8px", fontSize: 11, fontFamily: "var(--f-mono)" }}
          value={perPage} onChange={(e) => onPerPage(Number(e.target.value))}
        >
          {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div>{total === 0 ? "0–0 of 0" : `${start}–${end} of ${total}`}</div>
      <div style={{ display: "flex", gap: 4 }}>
        <button className="btn-xs" onClick={() => onPage(page - 1)} disabled={page === 0}>‹</button>
        <button className="btn-xs" onClick={() => onPage(page + 1)} disabled={page >= pages - 1}>›</button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   CSV export
───────────────────────────────────────────────── */
function exportCSV(txs: Tx[], from: string, to: string) {
  const rows = [
    ["Date", "Type", "Status", "Payment Method", "Amount"],
    ...txs.map((t) => [
      t.created_at.slice(0, 10), t.type, t.status,
      t.payment_method ?? "Cash",
      String(Number(t.amount).toFixed(2)),
    ]),
  ];
  const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `reports_${from}_${to}.csv`; a.click();
  URL.revokeObjectURL(url);
}

/* ─────────────────────────────────────────────────
   Main Component
───────────────────────────────────────────────── */
export function ReportsClient({ transactions, orders, orderItems, expenses, customers, onlineOrders, initialFrom, initialTo }: ReportsClientProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [pmView, setPmView] = useState<"items" | "category">("items");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [pendingFrom, setPendingFrom] = useState(initialFrom);
  const [pendingTo, setPendingTo] = useState(initialTo);
  const [granularity, setGranularity] = useState<Granularity>("Daily");
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(10);
  const [pmCalOpen, setPmCalOpen] = useState(false);
  const [custSearch, setCustSearch] = useState({ name: "", phone: "", email: "", tx: "" });
  const [custPage, setCustPage] = useState(0);
  const custPerPage = 10;
  const [onlineSearch, setOnlineSearch] = useState({ name: "", phone: "", address: "", orders: "" });
  const [onlinePage, setOnlinePage] = useState(0);
  const onlinePerPage = 10;

  // Extended report data (fetched on demand when tab is activated)
  const [extData, setExtData] = useState<Record<string, any>>({});
  const [extLoading, setExtLoading] = useState<Record<string, boolean>>({});

  const dateLabel = `${from} – ${to}`;

  async function loadExtended(resource: "bookings-analytics" | "staff-performance" | "discounts-refunds" | "customer-ltv") {
    if (resource in extData || extLoading[resource]) return; // already loaded or in-flight
    setExtLoading((l) => ({ ...l, [resource]: true }));
    try {
      const result = await fetchExtendedReport(resource, from, to);
      setExtData((d) => ({ ...d, [resource]: result }));
    } catch {
      setExtData((d) => ({ ...d, [resource]: null }));
    } finally {
      setExtLoading((l) => ({ ...l, [resource]: false }));
    }
  }

  // Reload extended data when dates change
  function applyDatesAndReset() {
    setFrom(pendingFrom);
    setTo(pendingTo);
    setPage(0);
    setExtData({}); // clear cached extended data so it re-fetches with new dates
  }

  function applyDates() { applyDatesAndReset(); }

  /* ── Filtered transactions ── */
  const filteredTxs = useMemo(
    () => transactions.filter((t) => { const d = (t.created_at ?? "").slice(0, 10); return d >= from && d <= to; }),
    [transactions, from, to],
  );
  const saleTxs = useMemo(() => filteredTxs.filter((t) => t.type === "sale" && t.status === "completed"), [filteredTxs]);

  // orderItems is fetched once for a fixed 30-day window (server-side) and
  // used to be consumed as-is everywhere below — so COGS/Product Mix/
  // Category Summary stayed pinned to that full 30-day fetch no matter what
  // the From/To pickers were set to, while netSales/txCount (built off
  // filteredTxs) correctly respected them. Filtering here the same way
  // filteredTxs does brings every figure derived from order items onto the
  // same selected range.
  const filteredOrderItems = useMemo(
    () => orderItems.filter((i) => { const d = (i.orders?.created_at ?? "").slice(0, 10); return d >= from && d <= to; }),
    [orderItems, from, to],
  );

  /* ── KPIs ── */
  const netSales    = useMemo(() => saleTxs.reduce((s, t) => s + Number(t.amount), 0), [saleTxs]);
  const totalDiscounts = useMemo(() => filteredTxs.filter((t) => t.type === "discount").reduce((s, t) => s + Math.abs(Number(t.amount)), 0), [filteredTxs]);
  const totalRefunds   = useMemo(() => filteredTxs.filter((t) => t.type === "refund").reduce((s, t) => s + Math.abs(Number(t.amount)), 0), [filteredTxs]);
  const txCount = saleTxs.length;
  const grossSales = netSales + totalDiscounts;
  const cogs = useMemo(() => filteredOrderItems.reduce((s, i) => s + Number(i.products?.cost ?? 0) * Number(i.quantity), 0), [filteredOrderItems]);
  const totalExpenses = useMemo(
    () => (expenses ?? []).filter((e) => e.expense_date >= from && e.expense_date <= to).reduce((s, e) => s + Number(e.amount), 0),
    [expenses, from, to],
  );
  const profit = netSales - cogs - totalExpenses;

  /* ── Chart ── */
  const chartData = useMemo<{ points: number[]; labels: string[] }>(() => {
    if (granularity === "Hourly") {
      const hours = Array(24).fill(0) as number[];
      saleTxs.forEach((t) => { hours[new Date(t.created_at).getHours()] += Number(t.amount); });
      return {
        points: hours,
        labels: Array.from({ length: 24 }, (_, i) => i === 0 ? "12AM" : i < 12 ? `${i}AM` : i === 12 ? "12PM" : `${i - 12}PM`),
      };
    }
    if (granularity === "Daily") {
      const map = new Map<string, number>();
      saleTxs.forEach((t) => { const d = t.created_at.slice(0, 10); map.set(d, (map.get(d) ?? 0) + Number(t.amount)); });
      const sorted = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      return {
        points: sorted.map(([, v]) => v),
        labels: sorted.map(([d]) => new Date(d + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" })),
      };
    }
    const map = new Map<string, number>();
    saleTxs.forEach((t) => { const m = t.created_at.slice(0, 7); map.set(m, (map.get(m) ?? 0) + Number(t.amount)); });
    const sorted = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return {
      points: sorted.map(([, v]) => v),
      labels: sorted.map(([m]) => {
        const [yr, mo] = m.split("-");
        return new Date(Number(yr), Number(mo) - 1).toLocaleDateString("en-PH", { month: "short", year: "2-digit" });
      }),
    };
  }, [granularity, saleTxs]);

  /* ── Payment breakdown ── */
  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    saleTxs.forEach((t) => { const m = t.payment_method ?? "Cash"; map.set(m, (map.get(m) ?? 0) + Number(t.amount)); });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, pct: netSales > 0 ? (value / netSales) * 100 : 0 }));
  }, [saleTxs, netSales]);

  /* ── Sales by Cashier ── */
  const salesByCashier = useMemo(() => {
    const map = new Map<string, number>();
    saleTxs.forEach((t) => {
      const name = (t.orders as any)?.cashier_name ?? (t.orders as any)?.members?.full_name ?? null;
      if (!name) return;
      map.set(name, (map.get(name) ?? 0) + Number(t.amount));
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  }, [saleTxs]);

  /* ── Product Mix ── */
  const productMix = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; sales: number; cost: number; cat: string }>();
    filteredOrderItems.forEach((item) => {
      const name = item.products?.name ?? "Unknown";
      const cat  = item.products?.product_categories?.name ?? "—";
      const prev = map.get(name) ?? { name, qty: 0, sales: 0, cost: 0, cat };
      const qty  = Number(item.quantity);
      map.set(name, { name, cat, qty: prev.qty + qty, sales: prev.sales + Number(item.total), cost: prev.cost + Number(item.products?.cost ?? 0) * qty });
    });
    const totalSales = [...map.values()].reduce((s, r) => s + r.sales, 0) || 1;
    return [...map.values()].sort((a, b) => b.qty - a.qty).map((r) => ({ ...r, profit: r.sales - r.cost, pct: (r.sales / totalSales) * 100 }));
  }, [filteredOrderItems]);

  /* ── Transactions table ── */
  const txTable = useMemo(() => {
    const map = new Map<string, { period: string; total: number; count: number; discounts: number; refunds: number; payMap: Map<string, number> }>();
    filteredTxs.forEach((t) => {
      let key: string;
      const d = new Date(t.created_at);
      if (granularity === "Hourly") {
        const hr = d.getHours();
        key = hr === 0 ? "12AM" : hr < 12 ? `${hr}AM` : hr === 12 ? "12PM" : `${hr - 12}PM`;
      } else if (granularity === "Daily") {
        key = t.created_at.slice(0, 10);
      } else {
        key = t.created_at.slice(0, 7);
      }
      const prev = map.get(key) ?? { period: key, total: 0, count: 0, discounts: 0, refunds: 0, payMap: new Map() };
      if (t.type === "sale" && t.status === "completed") {
        prev.total += Number(t.amount); prev.count += 1;
        const pm = t.payment_method ?? "Cash";
        prev.payMap.set(pm, (prev.payMap.get(pm) ?? 0) + Number(t.amount));
      }
      if (t.type === "discount") prev.discounts += Math.abs(Number(t.amount));
      if (t.type === "refund")   prev.refunds   += Math.abs(Number(t.amount));
      map.set(key, prev);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => ({
      ...v, payments: [...v.payMap.entries()].map(([label, amount]) => ({ label, amount })),
    }));
  }, [filteredTxs, granularity]);

  /* ── Product Mix by Category ── */
  const byCategory = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; sales: number; items: { name: string; qty: number; sales: number }[] }>();
    productMix.forEach((item) => {
      const cat = item.cat || "Uncategorized";
      if (!map.has(cat)) map.set(cat, { name: cat, qty: 0, sales: 0, items: [] });
      const g = map.get(cat)!;
      g.qty   += item.qty;
      g.sales += item.sales;
      g.items.push({ name: item.name, qty: item.qty, sales: item.sales });
    });
    return [...map.values()].sort((a, b) => b.sales - a.sales);
  }, [productMix]);

  /* ── Category Summary ── */
  const categorySummary = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; sales: number; cost: number }>();
    filteredOrderItems.forEach((item) => {
      const cat  = item.products?.product_categories?.name ?? "Uncategorized";
      const prev = map.get(cat) ?? { name: cat, qty: 0, sales: 0, cost: 0 };
      const qty  = Number(item.quantity);
      map.set(cat, { name: cat, qty: prev.qty + qty, sales: prev.sales + Number(item.total), cost: prev.cost + Number(item.products?.cost ?? 0) * qty });
    });
    const total = [...map.values()].reduce((s, r) => s + r.sales, 0) || 1;
    return [...map.values()].sort((a, b) => b.sales - a.sales).map((r) => ({ ...r, profit: r.sales - r.cost, pct: (r.sales / total) * 100 }));
  }, [filteredOrderItems]);

  /* ── Pagination slices ── */
  const pmSlice  = productMix.slice(page * perPage, (page + 1) * perPage);
  const txSlice  = txTable.slice(page * perPage, (page + 1) * perPage);
  const catSlice = categorySummary.slice(page * perPage, (page + 1) * perPage);

  function rankClass(i: number) {
    if (i === 0) return "rep-rank gold";
    if (i === 1) return "rep-rank silver";
    if (i === 2) return "rep-rank bronze";
    return "rep-rank";
  }

  /* ─────────────────────────────────────────────
     Render
  ───────────────────────────────────────────── */
  return (
    <>
      {/* ── Page header ── */}
      <div className="admin-header">
        <div>
          <h1>Reports</h1>
          <div className="sub">Last 30 days available · {dateLabel}</div>
        </div>
        <button className="rep-export-btn" onClick={() => exportCSV(saleTxs, from, to)}>
          ⬇ Export CSV
        </button>
      </div>

      {/* ── Date range bar ── */}
      <div className="rep-date-bar">
        <span className="rep-date-label">From</span>
        <input type="date" className="rep-date-input" value={pendingFrom} onChange={(e) => setPendingFrom(e.target.value)} />
        <span className="rep-date-sep">→</span>
        <span className="rep-date-label">To</span>
        <input type="date" className="rep-date-input" value={pendingTo} onChange={(e) => setPendingTo(e.target.value)} />
        <button className="rep-date-apply" onClick={applyDates}>Apply</button>
        <span className="rep-date-hint">Data for last 30 days available</span>
      </div>

      {/* ── Tab bar ── */}
      <div className="rep-tabbar">
        {(["overview", "product-mix", "transactions", "category", "customers", "online-customers", "bookings", "staff", "discounts"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`rep-tab ${tab === t ? "active" : ""}`}
            onClick={() => {
              setTab(t);
              setPage(0);
              if (t === "bookings")  loadExtended("bookings-analytics");
              if (t === "staff")     loadExtended("staff-performance");
              if (t === "discounts") loadExtended("discounts-refunds");
            }}
          >
            {t === "overview" ? "Overview"
              : t === "product-mix" ? "Product Mix"
              : t === "transactions" ? "Transactions"
              : t === "customers" ? "Customer Database"
              : t === "online-customers" ? "Online Customers"
              : t === "bookings" ? "Bookings"
              : t === "staff" ? "Staff"
              : t === "discounts" ? "Discounts"
              : "Category Summary"}
          </button>
        ))}
      </div>

      <div className="admin-body">

        {/* ════════ OVERVIEW ════════ */}
        {tab === "overview" && (
          <>
            <div className="kpi-grid" style={{ marginBottom: 20 }}>
              {[
                { label: "Net Sales",           value: peso(netSales),    color: "amber" },
                { label: "Gross Sales",         value: peso(grossSales),  color: "" },
                { label: "Total Discounts",     value: peso(totalDiscounts), color: "warn" },
                { label: "Total Refunds",       value: peso(totalRefunds),   color: "warn" },
                { label: "No. of Transactions", value: String(txCount),   color: "ok" },
              ].map((k, i) => (
                <div key={i} className="kpi">
                  <div className="lbl">{k.label}</div>
                  <div className={`val ${k.color}`}>{k.value}</div>
                </div>
              ))}
            </div>

            <div className="rep-two-col">
              {/* Sales by Date */}
              <div className="admin-card" style={{ padding: 0 }}>
                <div className="rep-card-header">
                  <div>
                    <h2 style={{ margin: 0, fontSize: 16 }}>Sales by Date</h2>
                    <div className="rep-card-sub">{dateLabel}</div>
                  </div>
                  <div className="rep-toggle-group">
                    {(["Hourly", "Daily", "Monthly"] as Granularity[]).map((g) => (
                      <button key={g} className={`rep-toggle-btn ${granularity === g ? "active" : ""}`} onClick={() => setGranularity(g)}>{g}</button>
                    ))}
                  </div>
                </div>
                <div style={{ padding: "0 12px 14px" }}>
                  <AreaChart points={chartData.points} labels={chartData.labels} />
                </div>
              </div>

              {/* Payment Types */}
              <div className="admin-card" style={{ padding: 0 }}>
                <div className="rep-card-header">
                  <div>
                    <h2 style={{ margin: 0, fontSize: 16 }}>Payment Types</h2>
                    <div className="rep-card-sub">{dateLabel}</div>
                  </div>
                </div>
                <div className="rep-payment-list">
                  {paymentBreakdown.length === 0 && (
                    <div style={{ textAlign: "center", padding: 20, color: "var(--text-3)", fontFamily: "var(--f-mono)", fontSize: 12 }}>No payment data</div>
                  )}
                  {paymentBreakdown.map((p, i) => (
                    <div key={i} className="rep-payment-row">
                      <span className="rep-payment-icon">{paymentIcon(p.label)}</span>
                      <span className="rep-payment-name">{p.label}</span>
                      <span className="rep-payment-pct">{p.pct.toFixed(1)}%</span>
                      <span className="rep-payment-amount">{peso(p.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Profit and COGS by Item ── */}
            {productMix.length > 0 && (
              <div className="admin-card" style={{ padding: 0, marginTop: 0, marginBottom: 24 }}>
                <div className="rep-card-header">
                  <div>
                    <h2 style={{ margin: 0, fontSize: 16 }}>Profit and COGS by Item</h2>
                    <div className="rep-card-sub">
                      {productMix.length > 0
                        ? `Your most profitable item is ${productMix.slice().sort((a, b) => b.profit - a.profit)[0]?.name} with ${peso(productMix.slice().sort((a, b) => b.profit - a.profit)[0]?.profit)}`
                        : dateLabel}
                    </div>
                  </div>
                </div>
                <div style={{ padding: "14px 20px 18px" }}>
                  <ProfitByItemChart items={productMix.slice().sort((a, b) => b.profit - a.profit)} />
                </div>
              </div>
            )}

            {/* ── Donut charts row ── */}
            <div className="rep-two-col" style={{ marginBottom: 24 }}>
              {salesByCashier.length > 0 && (
                <div className="admin-card" style={{ padding: 0 }}>
                  <div className="rep-card-header">
                    <div>
                      <h2 style={{ margin: 0, fontSize: 16 }}>Sales by Cashier</h2>
                      <div className="rep-card-sub">{dateLabel}</div>
                    </div>
                  </div>
                  <div style={{ padding: "14px 20px 18px" }}>
                    <DonutChart data={salesByCashier} subtitle="Total Sales" />
                  </div>
                </div>
              )}
              <div className="admin-card" style={{ padding: 0 }}>
                <div className="rep-card-header">
                  <div>
                    <h2 style={{ margin: 0, fontSize: 16 }}>Sales by Payment</h2>
                    <div className="rep-card-sub">{dateLabel}</div>
                  </div>
                </div>
                <div style={{ padding: "14px 20px 18px" }}>
                  <DonutChart data={paymentBreakdown} subtitle="Total Sales" />
                </div>
              </div>
            </div>

            {/* ── Units Sold by Hour heatmap ── */}
            <div className="admin-card" style={{ padding: 0, marginBottom: 24 }}>
              <div className="rep-card-header">
                <div>
                  <h2 style={{ margin: 0, fontSize: 16 }}>Transactions by Hour</h2>
                  <div className="rep-card-sub">{dateLabel} · last 14 days shown</div>
                </div>
              </div>
              <div style={{ padding: "14px 20px 18px" }}>
                <HourHeatmap txs={filteredTxs} from={from} to={to} />
              </div>
            </div>

            {/* Profit Summary */}
            <div className="admin-table-wrap">
              <div className="admin-table-head"><h2>Profit Summary</h2></div>
              <table className="admin-table">
                <thead><tr><th>Metric</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
                <tbody>
                  <tr><td>Gross Sales</td><td style={{ textAlign: "right" }} className="bold">{peso(grossSales)}</td></tr>
                  <tr><td>Discounts</td><td style={{ textAlign: "right", color: "var(--warn)" }}>– {peso(totalDiscounts)}</td></tr>
                  <tr><td>Net Sales</td><td style={{ textAlign: "right" }} className="bold">{peso(netSales)}</td></tr>
                  <tr><td>Cost of Goods</td><td style={{ textAlign: "right", color: "var(--err)" }}>– {peso(cogs)}</td></tr>
                  <tr><td>Refunds</td><td style={{ textAlign: "right", color: "var(--warn)" }}>– {peso(totalRefunds)}</td></tr>
                  <tr><td>Operating Expenses</td><td style={{ textAlign: "right", color: "var(--warn)" }}>– {peso(totalExpenses)}</td></tr>
                  <tr>
                    <td><strong>Net Profit</strong></td>
                    <td style={{ textAlign: "right", color: profit >= 0 ? "var(--ok)" : "var(--err)", fontWeight: 700 }}>{peso(profit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ════════ PRODUCT MIX ════════ */}
        {tab === "product-mix" && (
          <>
            {/* ── Top toolbar: date pill + action buttons ── */}
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
              {/* Date filter pill */}
              <div>
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 5 }}>
                  Date Filter:
                </div>
                {/* Pill — click to toggle date picker */}
                <button
                  onClick={() => { setPmCalOpen((o) => !o); setPendingFrom(from); setPendingTo(to); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 14px 9px 16px",
                    border: `1px solid ${pmCalOpen ? "var(--amber)" : "var(--line-strong)"}`,
                    borderRadius: pmCalOpen ? "10px 10px 0 0" : 999,
                    background: "var(--bg-3)",
                    minWidth: 280, cursor: "pointer",
                    transition: "border-color 0.15s, border-radius 0.15s",
                  }}
                >
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--text-1)", flex: 1, textAlign: "left" }}>
                    {new Date(from + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}, 12:00am
                    {" – "}
                    {new Date(to + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}, 11:59pm
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ color: pmCalOpen ? "var(--amber)" : "var(--text-3)", flexShrink: 0, transition: "color 0.15s" }}>
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </button>
                {/* Dropdown date inputs */}
                {pmCalOpen && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 14px",
                    background: "var(--bg-3)",
                    border: "1px solid var(--amber)",
                    borderTop: "1px solid var(--line-strong)",
                    borderRadius: "0 0 10px 10px",
                  }}>
                    <input
                      type="date" value={pendingFrom}
                      onChange={(e) => setPendingFrom(e.target.value)}
                      style={{
                        background: "var(--bg-2)", border: "1px solid var(--line-strong)",
                        borderRadius: 6, padding: "5px 8px",
                        fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-1)",
                        colorScheme: "dark", flex: 1,
                      }}
                    />
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--text-3)" }}>to</span>
                    <input
                      type="date" value={pendingTo}
                      onChange={(e) => setPendingTo(e.target.value)}
                      style={{
                        background: "var(--bg-2)", border: "1px solid var(--line-strong)",
                        borderRadius: 6, padding: "5px 8px",
                        fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-1)",
                        colorScheme: "dark", flex: 1,
                      }}
                    />
                    <button
                      onClick={() => { applyDatesAndReset(); setPmCalOpen(false); }}
                      style={{
                        padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer",
                        background: "var(--amber)", color: "#000",
                        fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 700,
                      }}
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={() => { setPmView(pmView === "items" ? "category" : "items"); setPage(0); }}
                  style={{
                    padding: "9px 20px", borderRadius: 8, cursor: "pointer",
                    fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
                    background: pmView === "items" ? "rgba(6,182,212,0.18)" : "rgba(6,182,212,0.08)",
                    color: "#67e8f9",
                    border: "1px solid rgba(6,182,212,0.3)",
                    transition: "background 0.15s",
                  } as React.CSSProperties}
                >
                  Group by {pmView === "items" ? "Category" : "Items"}
                </button>
                <button
                  style={{
                    padding: "9px 18px", borderRadius: 8, cursor: "pointer",
                    fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
                    background: "rgba(var(--tint-rgb), 0.18)", color: "var(--amber-bright)",
                    border: "1px solid rgba(var(--tint-rgb), 0.35)",
                    display: "flex", alignItems: "center", gap: 6,
                  } as React.CSSProperties}
                  onClick={() => {
                    const rows = [["Item", "Category", "Qty", "Net Sales", "Cost", "Profit", "% of Sales"],
                      ...productMix.map((r) => [r.name, r.cat, String(r.qty), String(r.sales.toFixed(2)), String(r.cost.toFixed(2)), String(r.profit.toFixed(2)), `${r.pct.toFixed(1)}%`])];
                    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `product-mix-${from}-${to}.csv`; a.click();
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Product Mix
                </button>
                <button
                  style={{
                    padding: "9px 18px", borderRadius: 8, cursor: "not-allowed",
                    fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
                    background: "rgba(34,197,94,0.12)", color: "#4ade80",
                    border: "1px solid rgba(34,197,94,0.28)",
                    display: "flex", alignItems: "center", gap: 6,
                    opacity: 0.6,
                  } as React.CSSProperties}
                  disabled
                  title="Ingredients Mix requires cost data per recipe item"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Ingredients Mix
                </button>
              </div>
            </div>

            {/* ── By Items (table) ── */}
            {pmView === "items" && (
              <div className="admin-table-wrap">
                <div className="admin-table-head">
                  <h2>Product Mix</h2>
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>{dateLabel} · {productMix.length} products</span>
                </div>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}></th>
                      <th>Item</th>
                      <th>Category</th>
                      <th style={{ textAlign: "right" }}>Qty</th>
                      <th style={{ textAlign: "right" }}>Net Sales</th>
                      <th style={{ textAlign: "right" }}>Cost</th>
                      <th style={{ textAlign: "right" }}>Profit</th>
                      <th style={{ width: 150 }}>% of Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pmSlice.length === 0 && <tr><td colSpan={8} className="empty">No items sold in this period</td></tr>}
                    {pmSlice.map((item, i) => {
                      const gi = page * perPage + i;
                      return (
                        <tr key={item.name}>
                          <td><span className={rankClass(gi)}>{String(gi + 1).padStart(2, "0")}</span></td>
                          <td className="bold">{item.name}</td>
                          <td className="dim">{item.cat}</td>
                          <td style={{ textAlign: "right" }}><span className="mono">{item.qty}</span></td>
                          <td style={{ textAlign: "right" }} className="bold">{peso(item.sales)}</td>
                          <td style={{ textAlign: "right" }} className="dim">{peso(item.cost)}</td>
                          <td style={{ textAlign: "right", color: item.profit >= 0 ? "var(--ok)" : "var(--err)", fontWeight: 600 }}>{peso(item.profit)}</td>
                          <td>
                            <div className="rep-pct-bar">
                              <div className="rep-pct-track"><div className="rep-pct-fill" style={{ width: `${Math.min(100, item.pct)}%` }} /></div>
                              <span className="rep-pct-text">{item.pct.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pagination page={page} pages={Math.ceil(productMix.length / perPage) || 1} total={productMix.length} perPage={perPage} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(0); }} />
              </div>
            )}

            {/* ── By Category (masonry card grid) ── */}
            {pmView === "category" && (
              byCategory.length === 0
                ? <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-3)", fontFamily: "var(--f-mono)", fontSize: 12 }}>No items sold in this period</div>
                : (() => {
                    const ACCENTS = ["var(--amber)", "#22c55e", "#06b6d4", "#a855f7", "#ef4444", "#f97316", "#3b82f6", "#ec4899"];
                    return (
                      <div style={{ columns: "4 190px", columnGap: 14 }}>
                        {byCategory.map((cat, ci) => {
                          const accent = ACCENTS[ci % ACCENTS.length];
                          return (
                            <div key={cat.name} style={{
                              breakInside: "avoid",
                              marginBottom: 14,
                              background: "var(--bg-3)",
                              border: "1px solid var(--line-strong)",
                              borderRadius: 10,
                              overflow: "hidden",
                            }}>
                              {/* Header */}
                              <div style={{
                                padding: "11px 14px 10px",
                                borderBottom: `2px solid ${accent}`,
                                display: "grid",
                                gridTemplateColumns: "1fr auto auto",
                                alignItems: "baseline",
                                gap: "0 12px",
                              }}>
                                <span style={{
                                  fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 800,
                                  letterSpacing: "0.1em", textTransform: "uppercase",
                                  color: "var(--text-0)", overflow: "hidden",
                                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                  {cat.name}
                                </span>
                                <span style={{
                                  fontFamily: "var(--f-mono)", fontSize: 13, fontWeight: 700,
                                  color: "var(--text-1)", textAlign: "right",
                                }}>
                                  {cat.qty}
                                </span>
                                <span style={{
                                  fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 700,
                                  color: accent, textAlign: "right", minWidth: 56,
                                }}>
                                  {peso(cat.sales)}
                                </span>
                              </div>

                              {/* Item rows — every row has a top divider */}
                              {cat.items.map((item) => (
                                <div key={item.name} style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr auto auto",
                                  alignItems: "center",
                                  gap: "0 12px",
                                  padding: "7px 14px",
                                  borderTop: "1px solid var(--line-strong)",
                                }}>
                                  <span style={{
                                    fontFamily: "var(--f-mono)", fontSize: 10,
                                    color: "var(--text-2)", overflow: "hidden",
                                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                                  }} title={item.name}>
                                    {item.name}
                                  </span>
                                  <span style={{
                                    fontFamily: "var(--f-mono)", fontSize: 10,
                                    color: "var(--text-3)", textAlign: "right",
                                  }}>
                                    {item.qty}
                                  </span>
                                  <span style={{
                                    fontFamily: "var(--f-mono)", fontSize: 10,
                                    color: "var(--text-1)", fontWeight: 600,
                                    textAlign: "right", minWidth: 52,
                                  }}>
                                    {peso(item.sales)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
            )}
          </>
        )}

        {/* ════════ TRANSACTIONS ════════ */}
        {tab === "transactions" && (
          <div className="admin-table-wrap">
            <div className="admin-table-head">
              <h2>Transactions</h2>
              <div className="rep-toggle-group">
                {(["Hourly", "Daily", "Monthly"] as Granularity[]).map((g) => (
                  <button key={g} className={`rep-toggle-btn ${granularity === g ? "active" : ""}`} onClick={() => { setGranularity(g); setPage(0); }}>{g}</button>
                ))}
              </div>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{granularity === "Hourly" ? "Hour" : granularity === "Daily" ? "Day" : "Month"}</th>
                  <th style={{ textAlign: "right" }}>Total Sales</th>
                  <th style={{ textAlign: "right" }}>Transactions</th>
                  <th style={{ textAlign: "right" }}>Discounts</th>
                  <th style={{ textAlign: "right" }}>Refunds</th>
                  <th>Payment Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {txSlice.length === 0 && <tr><td colSpan={6} className="empty">No transactions in this period</td></tr>}
                {txSlice.map((row, i) => (
                  <tr key={i}>
                    <td className="bold">{row.period}</td>
                    <td style={{ textAlign: "right" }} className="bold">{peso(row.total)}</td>
                    <td style={{ textAlign: "right" }}><span className="mono">{row.count}</span></td>
                    <td style={{ textAlign: "right", color: "var(--warn)" }}>{row.discounts > 0 ? `– ${peso(row.discounts)}` : "—"}</td>
                    <td style={{ textAlign: "right", color: "var(--warn)" }}>{row.refunds > 0 ? `– ${peso(row.refunds)}` : "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {row.payments.map((p, j) => (
                          <span key={j} className="rep-pay-pill">{p.label}: {peso(p.amount)}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pages={Math.ceil(txTable.length / perPage) || 1} total={txTable.length} perPage={perPage} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(0); }} />
          </div>
        )}

        {/* ════════ CATEGORY SUMMARY ════════ */}
        {tab === "category" && (
          <div className="admin-table-wrap">
            <div className="admin-table-head">
              <h2>Category Summary</h2>
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>{dateLabel} · {categorySummary.length} categories</span>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}></th>
                  <th>Category</th>
                  <th style={{ textAlign: "right" }}>Qty</th>
                  <th style={{ textAlign: "right" }}>Net Sales</th>
                  <th style={{ textAlign: "right" }}>Cost</th>
                  <th style={{ textAlign: "right" }}>Profit</th>
                  <th style={{ width: 150 }}>% of Sales</th>
                </tr>
              </thead>
              <tbody>
                {catSlice.length === 0 && <tr><td colSpan={7} className="empty">No sales data in this period</td></tr>}
                {catSlice.map((cat, i) => {
                  const gi = page * perPage + i;
                  return (
                    <tr key={cat.name}>
                      <td><span className={rankClass(gi)}>{String(gi + 1).padStart(2, "0")}</span></td>
                      <td className="bold">{cat.name}</td>
                      <td style={{ textAlign: "right" }}><span className="mono">{cat.qty}</span></td>
                      <td style={{ textAlign: "right" }} className="bold">{peso(cat.sales)}</td>
                      <td style={{ textAlign: "right" }} className="dim">{peso(cat.cost)}</td>
                      <td style={{ textAlign: "right", color: cat.profit >= 0 ? "var(--ok)" : "var(--err)", fontWeight: 600 }}>{peso(cat.profit)}</td>
                      <td>
                        <div className="rep-pct-bar">
                          <div className="rep-pct-track"><div className="rep-pct-fill" style={{ width: `${Math.min(100, cat.pct)}%` }} /></div>
                          <span className="rep-pct-text">{cat.pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={page} pages={Math.ceil(categorySummary.length / perPage) || 1} total={categorySummary.length} perPage={perPage} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(0); }} />
          </div>
        )}

        {/* ════════ CUSTOMER DATABASE ════════ */}
        {tab === "customers" && (() => {
          // Enrich customers with order stats
          const enriched = customers.map((c) => {
            const orders = (c.orders ?? []) as { id: string; total: number; status: string }[];
            const completed = orders.filter((o) => o.status !== "cancelled");
            return {
              ...c,
              txCount: completed.length,
              totalPurchase: completed.reduce((s: number, o: { total: number }) => s + Number(o.total ?? 0), 0),
            };
          });

          const totalCustomerCount = enriched.length;
          const repeatCustomerCount = enriched.filter((c) => c.txCount > 1).length;
          const repeatRate = totalCustomerCount > 0 ? (repeatCustomerCount / totalCustomerCount) * 100 : 0;

          // Per-column search filter
          const filtered = enriched.filter((c) =>
            (c.name ?? "").toLowerCase().includes(custSearch.name.toLowerCase()) &&
            (c.phone ?? "").toLowerCase().includes(custSearch.phone.toLowerCase()) &&
            (c.email ?? "").toLowerCase().includes(custSearch.email.toLowerCase()) &&
            (custSearch.tx === "" || String(c.txCount).includes(custSearch.tx))
          );

          const totalPages = Math.max(1, Math.ceil(filtered.length / custPerPage));
          const slice = filtered.slice(custPage * custPerPage, (custPage + 1) * custPerPage);

          function csvDownload() {
            const rows = [["Customer", "Phone", "Email", "Transactions", "Total Amount"],
              ...enriched.map((c) => [c.name ?? "", c.phone ?? "", c.email ?? "", String(c.txCount), String(c.totalPurchase.toFixed(2))])];
            const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "customer-database.csv"; a.click();
          }

          const TH_STYLE: React.CSSProperties = { padding: "10px 14px", fontFamily: "var(--f-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", textAlign: "left", borderBottom: "1px solid var(--line-strong)", whiteSpace: "nowrap" };
          const TD_STYLE: React.CSSProperties = { padding: "10px 14px", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-1)", borderBottom: "1px solid var(--line)", verticalAlign: "middle" };
          const SEARCH_STYLE: React.CSSProperties = { width: "100%", background: "var(--bg-2)", border: "1px solid var(--line-strong)", borderRadius: 6, padding: "5px 8px 5px 26px", fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--text-1)", colorScheme: "dark" as any, outline: "none" };

          return (
            <>
              {/* Customer LTV KPI cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
                {[
                  { label: "Total Customers",  value: String(totalCustomerCount), color: "rgba(var(--tint-rgb), 0.18)", border: "rgba(var(--tint-rgb), 0.35)",  text: "var(--amber)" },
                  { label: "Repeat Customers", value: String(repeatCustomerCount), color: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.3)",    text: "#4ade80" },
                  { label: "Repeat Rate",      value: `${repeatRate.toFixed(1)}%`, color: "rgba(6,182,212,0.12)", border: "rgba(6,182,212,0.3)",    text: "#67e8f9" },
                ].map((k) => (
                  <div key={k.label} style={{ background: k.color, border: `1px solid ${k.border}`, borderRadius: 12, padding: "20px 24px", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 28, fontWeight: 800, color: k.text, marginBottom: 4 }}>{k.value}</div>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)" }}>{k.label}</div>
                  </div>
                ))}
              </div>

            <div className="admin-table-wrap">
              {/* Header bar */}
              <div className="admin-table-head" style={{ justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2>Customer Database</h2>
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>{filtered.length} customers</span>
                </div>
                <button
                  className="btn-xs"
                  onClick={csvDownload}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download CSV
                </button>
              </div>

              <table className="admin-table" style={{ tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "24%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "16%" }} />
                </colgroup>
                <thead>
                  {/* Column headers */}
                  <tr>
                    <th style={TH_STYLE}>Customer</th>
                    <th style={TH_STYLE}>Phone Number</th>
                    <th style={TH_STYLE}>Email Address</th>
                    <th style={{ ...TH_STYLE, textAlign: "right" }}>Transactions</th>
                    <th style={{ ...TH_STYLE, textAlign: "right" }}>Total Purchase</th>
                  </tr>
                  {/* Per-column search */}
                  <tr style={{ background: "var(--bg-2)" }}>
                    {(["name", "phone", "email", "tx"] as const).map((field, fi) => (
                      <td key={field} style={{ padding: "6px 10px", borderBottom: "1px solid var(--line-strong)" }} colSpan={fi === 3 ? 2 : 1}>
                        <div style={{ position: "relative" }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                            style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }}>
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                          </svg>
                          <input
                            type="text"
                            placeholder="Search..."
                            value={custSearch[field]}
                            onChange={(e) => { setCustSearch((s) => ({ ...s, [field]: e.target.value })); setCustPage(0); }}
                            style={SEARCH_STYLE}
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slice.length === 0 && (
                    <tr><td colSpan={5} className="empty">No customers found</td></tr>
                  )}
                  {slice.map((c) => (
                    <tr key={c.id}>
                      <td style={TD_STYLE}><span style={{ fontWeight: 600 }}>{c.name || "—"}</span></td>
                      <td style={{ ...TD_STYLE, color: "var(--text-2)" }}>{c.phone || "—"}</td>
                      <td style={{ ...TD_STYLE, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.email || "—"}</td>
                      <td style={{ ...TD_STYLE, textAlign: "right" }}><span className="mono">{c.txCount}</span></td>
                      <td style={{ ...TD_STYLE, textAlign: "right", fontWeight: 700, color: "var(--amber)" }}>{peso(c.totalPurchase)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: "1px solid var(--line)", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>
                <span>{filtered.length === 0 ? "0 results" : `${custPage * custPerPage + 1}–${Math.min((custPage + 1) * custPerPage, filtered.length)} of ${filtered.length}`}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn-xs" disabled={custPage === 0} onClick={() => setCustPage((p) => p - 1)}>Previous</button>
                  <span style={{ padding: "0 8px", lineHeight: "28px" }}>Page {custPage + 1} of {totalPages}</span>
                  <button className="btn-xs" disabled={custPage >= totalPages - 1} onClick={() => setCustPage((p) => p + 1)}>Next</button>
                </div>
              </div>
            </div>
            </>
          );
        })()}

        {/* ════════ ONLINE CUSTOMERS ════════ */}
        {tab === "online-customers" && (() => {
          // Group delivery orders by customer
          type OnlineCust = { id: string; name: string; phone: string; address: string; orderCount: number; total: number; avgTx: number };
          const map = new Map<string, OnlineCust>();
          onlineOrders.forEach((o: any) => {
            const cId   = o.customers?.id   ?? `anon-${o.id}`;
            const cName = o.customers?.name ?? "Guest";
            const cPhone= o.customers?.phone ?? "—";
            const addr  = o.notes ?? "—";
            const prev  = map.get(cId) ?? { id: cId, name: cName, phone: cPhone, address: addr, orderCount: 0, total: 0, avgTx: 0 };
            prev.orderCount += 1;
            prev.total      += Number(o.total ?? 0);
            prev.address    = addr !== "—" ? addr : prev.address;
            map.set(cId, prev);
          });
          const onlineCusts: OnlineCust[] = [...map.values()].map((c) => ({ ...c, avgTx: c.orderCount > 0 ? c.total / c.orderCount : 0 }))
            .sort((a, b) => b.total - a.total);

          const totalCustomers = onlineCusts.length;
          const totalAmount    = onlineCusts.reduce((s, c) => s + c.total, 0);
          const totalOrders    = onlineOrders.length;

          const filtered = onlineCusts.filter((c) =>
            c.name.toLowerCase().includes(onlineSearch.name.toLowerCase()) &&
            c.phone.toLowerCase().includes(onlineSearch.phone.toLowerCase()) &&
            c.address.toLowerCase().includes(onlineSearch.address.toLowerCase()) &&
            (onlineSearch.orders === "" || String(c.orderCount).includes(onlineSearch.orders))
          );
          const totalPages = Math.max(1, Math.ceil(filtered.length / onlinePerPage));
          const slice = filtered.slice(onlinePage * onlinePerPage, (onlinePage + 1) * onlinePerPage);

          function csvDownload() {
            const rows = [["Customer", "Phone", "Delivery Address", "Total Amount", "No. of Orders", "Avg. Transaction"],
              ...onlineCusts.map((c) => [c.name, c.phone, c.address, c.total.toFixed(2), String(c.orderCount), c.avgTx.toFixed(2)])];
            const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "online-customers.csv"; a.click();
          }

          const KPI_COLORS = [
            { bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.3)", label: "#fb923c" },
            { bg: "rgba(34,197,94,0.10)",  border: "rgba(34,197,94,0.28)",  label: "#4ade80" },
            { bg: "rgba(6,182,212,0.10)",  border: "rgba(6,182,212,0.28)",  label: "#67e8f9" },
          ];
          const kpis = [
            { label: "Total Online Customers", value: String(totalCustomers) },
            { label: "Total Online Amount",    value: peso(totalAmount) },
            { label: "Total Online Orders",    value: String(totalOrders) },
          ];

          const TH: React.CSSProperties = { padding: "10px 14px", fontFamily: "var(--f-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", textAlign: "left", borderBottom: "1px solid var(--line-strong)", whiteSpace: "nowrap" };
          const TD: React.CSSProperties = { padding: "10px 14px", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-1)", borderBottom: "1px solid var(--line)", verticalAlign: "middle" };
          const SEARCH: React.CSSProperties = { width: "100%", background: "var(--bg-2)", border: "1px solid var(--line-strong)", borderRadius: 6, padding: "5px 8px 5px 26px", fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--text-1)", colorScheme: "dark" as any, outline: "none" };

          return (
            <>
              {/* KPI cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20 }}>
                {kpis.map((k, i) => (
                  <div key={k.label} style={{
                    background: KPI_COLORS[i].bg, border: `1px solid ${KPI_COLORS[i].border}`,
                    borderRadius: 12, padding: "20px 24px", textAlign: "center",
                  }}>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 28, fontWeight: 800, color: KPI_COLORS[i].label, marginBottom: 4 }}>
                      {k.value}
                    </div>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)" }}>
                      {k.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Table */}
              <div className="admin-table-wrap">
                <div className="admin-table-head" style={{ justifyContent: "flex-end" }}>
                  <button className="btn-xs" onClick={csvDownload} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download CSV
                  </button>
                </div>

                <table className="admin-table" style={{ tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "26%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={TH}>Customer</th>
                      <th style={TH}>Phone Number</th>
                      <th style={TH}>Delivery Address</th>
                      <th style={{ ...TH, textAlign: "right" }}>Total Amount</th>
                      <th style={{ ...TH, textAlign: "right" }}>No. of Orders</th>
                      <th style={{ ...TH, textAlign: "right" }}>Avg. Transaction</th>
                    </tr>
                    <tr style={{ background: "var(--bg-2)" }}>
                      {(["name", "phone", "address", "orders"] as const).map((field, fi) => (
                        <td key={field} style={{ padding: "6px 10px", borderBottom: "1px solid var(--line-strong)" }} colSpan={fi === 3 ? 3 : 1}>
                          <div style={{ position: "relative" }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                              style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }}>
                              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            <input type="text" placeholder="Search..." value={onlineSearch[field]}
                              onChange={(e) => { setOnlineSearch((s) => ({ ...s, [field]: e.target.value })); setOnlinePage(0); }}
                              style={SEARCH}
                            />
                          </div>
                        </td>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slice.length === 0 && <tr><td colSpan={6} className="empty">No online delivery orders found</td></tr>}
                    {slice.map((c) => (
                      <tr key={c.id}>
                        <td style={{ ...TD, fontWeight: 600 }}>{c.name}</td>
                        <td style={{ ...TD, color: "var(--text-2)" }}>{c.phone}</td>
                        <td style={{ ...TD, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.address}>{c.address}</td>
                        <td style={{ ...TD, textAlign: "right", fontWeight: 700, color: "var(--amber)" }}>{peso(c.total)}</td>
                        <td style={{ ...TD, textAlign: "right" }}><span className="mono">{c.orderCount}</span></td>
                        <td style={{ ...TD, textAlign: "right", color: "var(--text-2)" }}>{peso(c.avgTx)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: "1px solid var(--line)", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>
                  <span>{filtered.length === 0 ? "0 results" : `${onlinePage * onlinePerPage + 1}–${Math.min((onlinePage + 1) * onlinePerPage, filtered.length)} of ${filtered.length}`}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn-xs" disabled={onlinePage === 0} onClick={() => setOnlinePage((p) => p - 1)}>Previous</button>
                    <span style={{ padding: "0 8px", lineHeight: "28px" }}>Page {onlinePage + 1} of {totalPages}</span>
                    <button className="btn-xs" disabled={onlinePage >= totalPages - 1} onClick={() => setOnlinePage((p) => p + 1)}>Next</button>
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        {/* ════════ BOOKINGS ════════ */}
        {tab === "bookings" && (() => {
          const d = extData["bookings-analytics"];
          const loading = extLoading["bookings-analytics"];
          if (loading) return <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontFamily: "var(--f-mono)", fontSize: 12 }}>Loading bookings analytics…</div>;
          if (d === null) return <div style={{ textAlign: "center", padding: 40, color: "var(--err)", fontFamily: "var(--f-mono)", fontSize: 12 }}>Failed to load bookings analytics. The reports-extended function may not be deployed yet.</div>;
          if (!d) return <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontFamily: "var(--f-mono)", fontSize: 12 }}>Click the Bookings tab to load data.</div>;

          const summary = d.summary ?? {};
          const byResource: any[] = d.by_resource ?? [];
          const byDay: { date: string; bookings: number }[] = d.by_day ?? [];

          const kpis = [
            { label: "Total Bookings",    value: String(summary.total_bookings ?? 0),                          color: "rgba(var(--tint-rgb), 0.18)", border: "rgba(var(--tint-rgb), 0.35)", text: "var(--amber)" },
            { label: "Revenue",           value: peso(Number(summary.total_revenue ?? 0)),                     color: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.3)",   text: "#4ade80" },
            { label: "Cancellation Rate", value: `${Number(summary.cancellation_rate ?? 0).toFixed(1)}%`,      color: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.3)",   text: "#f87171" },
            { label: "No-show Rate",      value: `${Number(summary.no_show_rate ?? 0).toFixed(1)}%`,           color: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.3)",  text: "#c084fc" },
          ];

          return (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
                {kpis.map((k) => (
                  <div key={k.label} style={{ background: k.color, border: `1px solid ${k.border}`, borderRadius: 12, padding: "20px 24px", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 26, fontWeight: 800, color: k.text, marginBottom: 4 }}>{k.value}</div>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)" }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {byDay.length > 0 && (
                <div className="admin-card" style={{ padding: 0, marginBottom: 20 }}>
                  <div className="rep-card-header">
                    <div>
                      <h2 style={{ margin: 0, fontSize: 16 }}>Bookings by Day</h2>
                      <div className="rep-card-sub">{dateLabel}</div>
                    </div>
                  </div>
                  <div style={{ padding: "14px 20px 18px" }}>
                    <AreaChart
                      points={byDay.map((r) => r.bookings)}
                      labels={byDay.map((r) => new Date(r.date + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" }))}
                    />
                  </div>
                </div>
              )}

              <div className="admin-table-wrap">
                <div className="admin-table-head">
                  <h2>By Resource</h2>
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>{dateLabel} · sorted by revenue</span>
                </div>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Resource</th>
                      <th>Type</th>
                      <th style={{ textAlign: "right" }}>Bookings</th>
                      <th style={{ textAlign: "right" }}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byResource.length === 0 && <tr><td colSpan={4} className="empty">No booking data for this period</td></tr>}
                    {[...byResource].sort((a, b) => Number(b.revenue ?? 0) - Number(a.revenue ?? 0)).map((r, i) => (
                      <tr key={i}>
                        <td className="bold">{r.name ?? "—"}</td>
                        <td className="dim">{r.type ?? "—"}</td>
                        <td style={{ textAlign: "right" }}><span className="mono">{r.bookings ?? 0}</span></td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: "var(--amber)" }}>{peso(Number(r.revenue ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}

        {/* ════════ STAFF ════════ */}
        {tab === "staff" && (() => {
          const d = extData["staff-performance"];
          const loading = extLoading["staff-performance"];
          if (loading) return <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontFamily: "var(--f-mono)", fontSize: 12 }}>Loading staff performance…</div>;
          if (d === null) return <div style={{ textAlign: "center", padding: 40, color: "var(--err)", fontFamily: "var(--f-mono)", fontSize: 12 }}>Failed to load staff performance. The reports-extended function may not be deployed yet.</div>;
          if (!d) return <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontFamily: "var(--f-mono)", fontSize: 12 }}>Click the Staff tab to load data.</div>;

          const staff: any[] = d.staff ?? [];
          const sorted = [...staff].sort((a, b) => Number(b.gross_sales ?? 0) - Number(a.gross_sales ?? 0));

          return (
            <div className="admin-table-wrap">
              <div className="admin-table-head">
                <h2>Staff Performance</h2>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>{dateLabel} · sorted by gross sales</span>
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: 44 }}></th>
                    <th>Staff Name</th>
                    <th style={{ textAlign: "right" }}>Orders</th>
                    <th style={{ textAlign: "right" }}>Gross Sales</th>
                    <th style={{ textAlign: "right" }}>Net Sales</th>
                    <th style={{ textAlign: "right" }}>Cancellations</th>
                    <th style={{ textAlign: "right" }}>Discounts Given</th>
                    <th style={{ textAlign: "right" }}>AOV</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 && <tr><td colSpan={8} className="empty">No staff data for this period</td></tr>}
                  {sorted.map((s, i) => (
                    <tr key={i}>
                      <td><span className={i === 0 ? "rep-rank gold" : i === 1 ? "rep-rank silver" : i === 2 ? "rep-rank bronze" : "rep-rank"}>{String(i + 1).padStart(2, "0")}</span></td>
                      <td className="bold">{s.cashier_name ?? "Walk-in"}</td>
                      <td style={{ textAlign: "right" }}><span className="mono">{s.orders ?? 0}</span></td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "var(--amber)" }}>{peso(Number(s.gross_sales ?? 0))}</td>
                      <td style={{ textAlign: "right" }}>{peso(Number(s.net_sales ?? 0))}</td>
                      <td style={{ textAlign: "right", color: Number(s.cancellations ?? 0) > 0 ? "var(--err)" : "var(--text-3)" }}>{s.cancellations ?? 0}</td>
                      <td style={{ textAlign: "right", color: Number(s.discounts_given ?? 0) > 0 ? "var(--warn)" : "var(--text-3)" }}>{peso(Number(s.discounts_given ?? 0))}</td>
                      <td style={{ textAlign: "right" }}>{peso(Number(s.aov ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}

        {/* ════════ DISCOUNTS ════════ */}
        {tab === "discounts" && (() => {
          const d = extData["discounts-refunds"];
          const loading = extLoading["discounts-refunds"];
          if (loading) return <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontFamily: "var(--f-mono)", fontSize: 12 }}>Loading discounts & refunds…</div>;
          if (d === null) return <div style={{ textAlign: "center", padding: 40, color: "var(--err)", fontFamily: "var(--f-mono)", fontSize: 12 }}>Failed to load discounts & refunds. The reports-extended function may not be deployed yet.</div>;
          if (!d) return <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontFamily: "var(--f-mono)", fontSize: 12 }}>Click the Discounts tab to load data.</div>;

          const summary = d.summary ?? {};
          const topVouchers: any[] = d.top_vouchers ?? [];
          const breakdownRaw = d.breakdown ?? {};
          const totalDiscountAmt = Number(summary.total_discount ?? 0);

          const breakdownData = [
            { label: "Manual",     value: Number(breakdownRaw.manual ?? 0) },
            { label: "Senior/PWD", value: Number(breakdownRaw.senior_pwd ?? 0) },
            { label: "Voucher",    value: Number(breakdownRaw.voucher ?? 0) },
          ].filter((x) => x.value > 0);

          return (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
                {[
                  { label: "Total Discount",  value: peso(totalDiscountAmt),                                               color: "rgba(var(--tint-rgb), 0.18)", border: "rgba(var(--tint-rgb), 0.35)", text: "var(--amber)" },
                  { label: "Discount Rate",   value: `${Number(summary.discount_rate ?? 0).toFixed(1)}%`,                   color: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.3)",   text: "#f87171" },
                  { label: "Total Refunds",   value: peso(Number(summary.total_refunds ?? 0)),                              color: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.3)",  text: "#c084fc" },
                  { label: "Refund Count",    value: String(summary.refund_count ?? 0),                                    color: "rgba(6,182,212,0.12)",  border: "rgba(6,182,212,0.3)",   text: "#67e8f9" },
                ].map((k) => (
                  <div key={k.label} style={{ background: k.color, border: `1px solid ${k.border}`, borderRadius: 12, padding: "20px 24px", textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 26, fontWeight: 800, color: k.text, marginBottom: 4 }}>{k.value}</div>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)" }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {breakdownData.length > 0 && (
                <div className="admin-card" style={{ padding: 0, marginBottom: 20 }}>
                  <div className="rep-card-header">
                    <div>
                      <h2 style={{ margin: 0, fontSize: 16 }}>Discount Breakdown</h2>
                      <div className="rep-card-sub">{dateLabel}</div>
                    </div>
                  </div>
                  <div style={{ padding: "14px 20px 18px" }}>
                    <DonutChart data={breakdownData} subtitle="Discounts" />
                  </div>
                </div>
              )}

              <div className="admin-table-wrap">
                <div className="admin-table-head">
                  <h2>Top Vouchers</h2>
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>{dateLabel}</span>
                </div>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th style={{ textAlign: "right" }}>Uses</th>
                      <th style={{ textAlign: "right" }}>Total Discounted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topVouchers.length === 0 && <tr><td colSpan={3} className="empty">No voucher usage in this period</td></tr>}
                    {topVouchers.map((v, i) => (
                      <tr key={i}>
                        <td className="bold mono">{v.code ?? "—"}</td>
                        <td style={{ textAlign: "right" }}><span className="mono">{v.uses ?? 0}</span></td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: "var(--warn)" }}>{peso(Number(v.total_discounted ?? 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}

      </div>
    </>
  );
}

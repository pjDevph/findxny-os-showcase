"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { peso } from "@/lib/config";
import { adminClient } from "@/lib/admin-client";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  points_balance?: number;
}

interface Order {
  id: string;
  order_no: string;
  status: string;
  type: string;
  total: number;
  created_at: string;
  customers: { name: string; phone: string | null } | null;
  order_items?: { quantity: number; unit_price: number; total: number; products: { name: string } | null }[];
}

interface Booking {
  id: string;
  status: string;
  payment_status?: string;
  total: number;
  start_time: string;
  end_time: string;
  customers: { name: string; phone: string | null; email: string | null } | null;
  bookable_resources: { name: string; type: string } | null;
}

interface LoyaltyTransaction {
  id: string;
  type: string;
  points: number;
  balance_after: number;
  created_at: string;
  notes?: string | null;
}

interface LoyaltyData {
  balance: number;
  peso_value: number;
  rules: { peso_per_point?: number } | null;
  transactions: LoyaltyTransaction[];
}

type DetailTab = "orders" | "bookings" | "loyalty";

const MONO: React.CSSProperties = {
  fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.14em",
  textTransform: "uppercase", color: "var(--text-3)",
};

const INDIGO        = "#6366f1";
const INDIGO_DIM    = "rgba(99,102,241,0.10)";
const INDIGO_BORDER = "rgba(99,102,241,0.22)";

const STATUS_COLOR: Record<string, string> = {
  completed: "ok", confirmed: "ok",
  pending: "warn", hold: "warn",
  cancelled: "err",
};

function DetailRow({ k, v }: Readonly<{ k: string; v: React.ReactNode }>) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", gap: 12,
      padding: "6px 0", borderBottom: "1px solid rgba(var(--tint-rgb), 0.06)",
    }}>
      <span style={{ fontSize: 12, color: "var(--text-3)" }}>{k}</span>
      <span style={{ fontSize: 13, color: "var(--text-1)", textAlign: "right" }}>{v}</span>
    </div>
  );
}

function txTypeBadge(type: string) {
  const earn    = type === "earn"    || type === "credit";
  const redeem  = type === "redeem"  || type === "debit";
  const adjust  = type === "adjust"  || type === "adjustment";
  const bg      = earn ? "rgba(34,197,94,0.10)" : redeem ? "rgba(239,68,68,0.10)" : INDIGO_DIM;
  const color   = earn ? "#22c55e"               : redeem ? "#ef4444"               : INDIGO;
  const border  = earn ? "rgba(34,197,94,0.22)"  : redeem ? "rgba(239,68,68,0.22)"  : INDIGO_BORDER;
  const label   = earn ? "Earn" : redeem ? "Redeem" : adjust ? "Adjust" : type;
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 4,
      fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
      background: bg, color, border: `1px solid ${border}`,
    }}>
      {label}
    </span>
  );
}

export default function CustomerDetailClient({
  customer,
  allOrders,
  allBookings,
}: Readonly<{
  customer: Customer;
  allOrders: Order[];
  allBookings: Booking[];
}>) {
  const [detailTab, setDetailTab] = useState<DetailTab>("orders");

  // ── Loyalty state ──────────────────────────────────────────────────────
  const [loyalty, setLoyalty]       = useState<LoyaltyData | null>(null);
  const [loyaltyLoading, setLL]     = useState(false);
  const [loyaltyErr, setLoyaltyErr] = useState<string | null>(null);

  const fetchLoyalty = useCallback(async () => {
    setLL(true);
    setLoyaltyErr(null);
    try {
      const res = await adminClient.loyaltyBalance({
        workspace_id: customer.id.split(":")[0] ?? "",  // workspaceId not available here; use customer-level
        customer_id:  customer.id,
        limit:        50,
      });
      setLoyalty(res as LoyaltyData);
    } catch (ex: unknown) {
      setLoyaltyErr(ex instanceof Error ? ex.message : "Failed to load loyalty data.");
    } finally {
      setLL(false);
    }
  }, [customer.id]);

  useEffect(() => {
    if (detailTab === "loyalty") void fetchLoyalty();
  }, [detailTab, fetchLoyalty]);

  // ── Orders / bookings ──────────────────────────────────────────────────
  const matchKey = `${customer.name.toLowerCase()}|${customer.phone ?? ""}`;

  const orders = useMemo(
    () =>
      allOrders
        .filter((o) => {
          if (!o.customers) return false;
          const k = `${o.customers.name.toLowerCase()}|${o.customers.phone ?? ""}`;
          return k === matchKey;
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [allOrders, matchKey],
  );

  const bookings = useMemo(
    () =>
      allBookings
        .filter((b) => {
          if (!b.customers) return false;
          const k = `${b.customers.name.toLowerCase()}|${b.customers.phone ?? ""}`;
          return k === matchKey;
        })
        .sort((a, b) => b.start_time.localeCompare(a.start_time)),
    [allBookings, matchKey],
  );

  const totalOrderSpend = useMemo(
    () => orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + (o.total ?? 0), 0),
    [orders],
  );
  const totalBookingSpend = useMemo(
    () => bookings.filter((b) => b.status !== "cancelled").reduce((s, b) => s + (b.total ?? 0), 0),
    [bookings],
  );

  const dt = (s: string) =>
    new Date(s).toLocaleString("en-PH", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  const pointsBalance = customer.points_balance ?? loyalty?.balance ?? 0;
  const pesoPerPoint  = loyalty?.rules?.peso_per_point ?? 1;

  // ── Tab bar ────────────────────────────────────────────────────────────

  const TABS: { id: DetailTab; label: string }[] = [
    { id: "orders",   label: `Orders (${orders.length})` },
    { id: "bookings", label: `Bookings (${bookings.length})` },
    { id: "loyalty",  label: "Loyalty" },
  ];

  return (
    <>
      <div className="admin-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href={"/customers" as any}
            style={{ color: "var(--text-3)", fontSize: 13, textDecoration: "none" }}
          >
            ← Customers
          </Link>
          <span style={{ color: "var(--text-3)" }}>/</span>
          <h1 style={{ margin: 0 }}>{customer.name}</h1>
        </div>
        <div className="sub">
          Customer since {new Date(customer.created_at).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}
        </div>
      </div>

      <div className="admin-body">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, alignItems: "start" }}>

          {/* Left column: profile + stats */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Profile card */}
            <div style={{ padding: "16px 18px", borderRadius: 10, background: "rgba(var(--tint-rgb), 0.04)", border: "1px solid rgba(var(--tint-rgb), 0.1)" }}>
              <div style={{ ...MONO, marginBottom: 10 }}>Contact</div>
              <DetailRow k="Name"    v={customer.name} />
              <DetailRow k="Phone"   v={customer.phone ?? "—"} />
              <DetailRow k="Email"   v={customer.email ?? "—"} />
              <DetailRow k="Joined"  v={dt(customer.created_at)} />
            </div>

            {/* Spend stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Order spend",    value: peso(totalOrderSpend),              sub: `${orders.filter(o => o.status !== "cancelled").length} orders` },
                { label: "Booking spend",  value: peso(totalBookingSpend),            sub: `${bookings.filter(b => b.status !== "cancelled").length} bookings` },
                { label: "Total spend",    value: peso(totalOrderSpend + totalBookingSpend), sub: "all time" },
                { label: "Visits",         value: orders.length + bookings.length,    sub: "orders + bookings" },
              ].map((s) => (
                <div key={s.label} style={{
                  padding: "12px 14px", borderRadius: 10,
                  background: "rgba(var(--tint-rgb), 0.04)", border: "1px solid rgba(var(--tint-rgb), 0.1)",
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", lineHeight: 1 }}>{s.value}</div>
                  <div style={{ ...MONO, marginTop: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{s.sub}</div>
                </div>
              ))}

              {/* Points balance card */}
              <div style={{
                padding: "12px 14px", borderRadius: 10,
                background: INDIGO_DIM, border: `1px solid ${INDIGO_BORDER}`,
                gridColumn: "1 / -1",
              }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: INDIGO, lineHeight: 1 }}>
                  {pointsBalance.toLocaleString("en-PH")} pts
                </div>
                <div style={{ ...MONO, marginTop: 4 }}>Points Balance</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                  ≈ {peso(pointsBalance * pesoPerPoint)} value
                </div>
              </div>
            </div>
          </div>

          {/* Right column: tabbed orders / bookings / loyalty */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

            {/* Tab bar */}
            <div style={{
              display: "flex", gap: 4, marginBottom: 16,
              borderBottom: "1px solid rgba(var(--tint-rgb), 0.1)", paddingBottom: 10,
            }}>
              {TABS.map(t => (
                <button
                  key={t.id}
                  className="btn-xs"
                  onClick={() => setDetailTab(t.id)}
                  style={detailTab === t.id
                    ? { background: t.id === "loyalty" ? INDIGO_DIM : "rgba(var(--tint-rgb), 0.12)", borderColor: t.id === "loyalty" ? INDIGO_BORDER : "rgba(var(--tint-rgb), 0.4)", color: t.id === "loyalty" ? INDIGO : "var(--amber-bright)" }
                    : {}}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Orders ── */}
            {detailTab === "orders" && (
              <div>
                {orders.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>No orders found.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {orders.map((o) => (
                      <div key={o.id} style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                        borderRadius: 8, background: "rgba(var(--tint-rgb), 0.03)", border: "1px solid rgba(var(--tint-rgb), 0.08)",
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)" }}>
                            #{o.order_no}
                            <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-3)", fontWeight: 400 }}>{o.type}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{dt(o.created_at)}</div>
                        </div>
                        <span className={`pill ${STATUS_COLOR[o.status] ?? "neutral"}`} style={{ fontSize: 10 }}>{o.status}</span>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", whiteSpace: "nowrap" }}>{peso(o.total)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Bookings ── */}
            {detailTab === "bookings" && (
              <div>
                {bookings.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>No bookings found.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {bookings.map((b) => (
                      <div key={b.id} style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                        borderRadius: 8, background: "rgba(var(--tint-rgb), 0.03)", border: "1px solid rgba(var(--tint-rgb), 0.08)",
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)" }}>
                            {b.bookable_resources?.name ?? "—"}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
                            {dt(b.start_time)} → {dt(b.end_time)}
                          </div>
                        </div>
                        <span className={`pill ${STATUS_COLOR[b.status] ?? "neutral"}`} style={{ fontSize: 10 }}>{b.status}</span>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", whiteSpace: "nowrap" }}>{peso(b.total)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Loyalty ── */}
            {detailTab === "loyalty" && (
              <div>
                {loyaltyLoading ? (
                  <div style={{ padding: "30px 0", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                    Loading loyalty data…
                  </div>
                ) : loyaltyErr ? (
                  <div style={{
                    padding: "10px 14px", borderRadius: 8,
                    background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                    color: "var(--err, #ff5050)", fontSize: 13,
                  }}>
                    {loyaltyErr}
                    <button className="btn-xs" style={{ marginLeft: 12 }} onClick={() => void fetchLoyalty()}>Retry</button>
                  </div>
                ) : (
                  <>
                    {/* Balance hero */}
                    <div style={{
                      padding: "20px 22px", borderRadius: 10,
                      background: INDIGO_DIM, border: `1px solid ${INDIGO_BORDER}`,
                      marginBottom: 20, textAlign: "center",
                    }}>
                      <div style={{ fontSize: 48, fontWeight: 800, color: INDIGO, lineHeight: 1 }}>
                        {(loyalty?.balance ?? pointsBalance).toLocaleString("en-PH")}
                      </div>
                      <div style={{ ...MONO, marginTop: 6 }}>Points Balance</div>
                      <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 6 }}>
                        ≈ {peso((loyalty?.balance ?? pointsBalance) * pesoPerPoint)} equivalent value
                      </div>
                    </div>

                    {/* Transactions table */}
                    {(!loyalty?.transactions || loyalty.transactions.length === 0) ? (
                      <div style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic", textAlign: "center", padding: "20px 0" }}>
                        No loyalty transactions yet.
                      </div>
                    ) : (
                      <div className="admin-table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Type</th>
                              <th style={{ textAlign: "right" }}>Points</th>
                              <th style={{ textAlign: "right" }}>Balance After</th>
                              <th>Date</th>
                              <th>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {loyalty.transactions.map((tx) => {
                              const isEarn = tx.points > 0;
                              return (
                                <tr key={tx.id}>
                                  <td>{txTypeBadge(tx.type)}</td>
                                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                    <span style={{
                                      fontWeight: 700, fontSize: 13,
                                      fontFamily: "var(--f-mono)",
                                      color: isEarn ? "#22c55e" : "#ef4444",
                                    }}>
                                      {isEarn ? "+" : ""}{tx.points.toLocaleString("en-PH")}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: INDIGO, fontWeight: 600 }}>
                                      {tx.balance_after.toLocaleString("en-PH")}
                                    </span>
                                  </td>
                                  <td>
                                    <span className="dim" style={{ fontFamily: "var(--f-mono)", fontSize: 11, whiteSpace: "nowrap" }}>
                                      {dt(tx.created_at)}
                                    </span>
                                  </td>
                                  <td style={{ maxWidth: 180 }}>
                                    {tx.notes ? (
                                      <span className="dim" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }} title={tx.notes}>
                                        {tx.notes}
                                      </span>
                                    ) : (
                                      <span className="dim" style={{ fontSize: 12, fontStyle: "italic" }}>—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

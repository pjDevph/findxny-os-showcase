"use client";

import React, { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { peso } from "@/lib/config";
import { voidTransaction } from "../actions";

interface Tx {
  id: string;
  reference_table?: string;
  reference_id?: string;
  amount: string | number;
  type: string;
  status: string;
  created_at: string;
  voided_reason?: string | null;
  payment_method?: string | null;
}

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash", gcash: "GCash", maya: "Maya", card: "Card",
  qrph: "QR PH", bank_transfer: "Bank", other: "Other",
};
function paymentLabel(m?: string | null): string {
  if (!m) return "—";
  return PAYMENT_LABEL[m] ?? m;
}

type Tab = "details" | "hourly" | "daily" | "monthly";

const TYPE_COLOR:   Record<string, string> = { sale: "ok", refund: "warn", void: "err" };
const STATUS_COLOR: Record<string, string> = { completed: "ok", voided: "err" };

function csvDownload(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function TransactionsPageClient({
  transactions,
  total,
  initialFrom,
  initialTo,
  initialType,
}: {
  transactions: Tx[];
  total: number;
  initialFrom: string;
  initialTo: string;
  initialType: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [tab,        setTab]       = useState<Tab>("details");
  const [pendingFrom, setPFrom]    = useState(initialFrom);
  const [pendingTo,   setPTo]      = useState(initialTo);
  const [typeFilter, setTypeFilter] = useState(initialType);
  const [payFilter,  setPayFilter]  = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page,       setPage]       = useState(0);
  const [perPage,    setPerPage]    = useState(25);

  // Void modal state
  const [voidModal,  setVoidModal]  = useState<{ txId: string; ref: string; amount: number } | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding,    setVoiding]    = useState(false);
  const [voidError,  setVoidError]  = useState<string | null>(null);

  function applyDates() {
    const params = new URLSearchParams();
    params.set("from", pendingFrom);
    params.set("to",   pendingTo);
    if (typeFilter !== "all") params.set("type", typeFilter);
    startTransition(() => { router.push(`/transactions?${params.toString()}`); });
    setPage(0);
  }

  function applyType(t: string) {
    setTypeFilter(t);
    const params = new URLSearchParams();
    params.set("from", initialFrom);
    params.set("to",   initialTo);
    if (t !== "all") params.set("type", t);
    startTransition(() => { router.push(`/transactions?${params.toString()}`); });
    setPage(0);
  }

  async function doVoid() {
    if (!voidModal) return;
    const reason = voidReason.trim();
    if (reason.length < 5) { setVoidError("Reason must be at least 5 characters."); return; }
    setVoiding(true);
    setVoidError(null);
    try {
      await voidTransaction(voidModal.txId, reason);
      setVoidModal(null);
      setVoidReason("");
      startTransition(() => { router.refresh(); });
    } catch (e: any) {
      setVoidError(e?.message ?? "Failed to void transaction.");
    } finally {
      setVoiding(false);
    }
  }

  /* ── KPIs (client-side, over loaded data) ── */
  const saleTxs   = transactions.filter((t) => t.type === "sale"   && t.status === "completed");
  const refundTxs = transactions.filter((t) => t.type === "refund");
  const voidTxs   = transactions.filter((t) => t.status === "voided");

  const netSales     = saleTxs.reduce(  (s, t) => s + Number(t.amount), 0);
  const totalRefunds = refundTxs.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const totalVoided  = voidTxs.reduce(  (s, t) => s + Number(t.amount), 0);

  /* ── Aggregate helpers ── */
  function aggregate(keyFn: (t: Tx) => string, labelFn: (k: string) => string) {
    const map = new Map<string, { label: string; total: number; count: number; refunds: number }>();
    transactions.forEach((t) => {
      const k    = keyFn(t);
      const prev = map.get(k) ?? { label: labelFn(k), total: 0, count: 0, refunds: 0 };
      if (t.type === "sale"   && t.status === "completed") { prev.total   += Number(t.amount); prev.count++; }
      if (t.type === "refund")                               prev.refunds += Math.abs(Number(t.amount));
      map.set(k, prev);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
  }

  const hourlyRows = useMemo(() => aggregate(
    (t) => String(new Date(t.created_at).getHours()).padStart(2, "0"),
    (k) => {
      const h = Number(k);
      if (h === 0)  return "12am";
      if (h < 12)   return `${h}am`;
      if (h === 12) return "12pm";
      return `${h - 12}pm`;
    },
  ), [transactions]);

  const dailyRows = useMemo(() => aggregate(
    (t) => t.created_at.slice(0, 10),
    (k) => new Date(k + "T00:00:00").toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" }),
  ), [transactions]);

  const monthlyRows = useMemo(() => aggregate(
    (t) => t.created_at.slice(0, 7),
    (k) => {
      const [yr, mo] = k.split("-");
      return new Date(Number(yr), Number(mo) - 1).toLocaleDateString("en-PH", { month: "short", year: "numeric" });
    },
  ), [transactions]);

  /* ── Payment methods present in the loaded range, for the filter bar ── */
  const paymentMethods = useMemo(() => {
    const seen = new Set<string>();
    transactions.forEach((t) => { if (t.payment_method) seen.add(t.payment_method); });
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [transactions]);

  /* ── Type filter hits the server via router.push; payment filter is client-side over the loaded range ── */
  const filtered   = payFilter ? transactions.filter((t) => t.payment_method === payFilter) : transactions;
  const totalPages = Math.ceil(filtered.length / perPage) || 1;
  const slice      = filtered.slice(page * perPage, (page + 1) * perPage);

  const tabBarStyle = (t: Tab) => ({
    padding: "10px 20px",
    fontFamily: "var(--f-mono)", fontSize: 11, fontWeight: 700,
    letterSpacing: "0.14em", textTransform: "uppercase" as const,
    cursor: "pointer", border: "none",
    borderBottom: tab === t ? "2px solid var(--amber)" : "2px solid transparent",
    background: "none",
    color: tab === t ? "var(--amber-bright)" : "var(--text-3)",
    transition: "color 0.15s",
  });

  function AggTable({ rows, periodLabel }: { rows: typeof hourlyRows; periodLabel: string }) {
    return (
      <div className="admin-table-wrap">
        <div className="admin-table-head">
          <h2>{periodLabel}</h2>
          <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>
            {initialFrom} – {initialTo}
          </span>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>{periodLabel}</th>
              <th style={{ textAlign: "right" }}>Net Sales</th>
              <th style={{ textAlign: "right" }}>Transactions</th>
              <th style={{ textAlign: "right" }}>Refunds</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="empty">No data for this period</td></tr>}
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="bold">{r.label}</td>
                <td style={{ textAlign: "right" }} className="bold">{peso(r.total)}</td>
                <td style={{ textAlign: "right" }}><span className="mono">{r.count}</span></td>
                <td style={{ textAlign: "right", color: r.refunds > 0 ? "var(--warn)" : "var(--text-3)" }}>
                  {r.refunds > 0 ? `– ${peso(r.refunds)}` : "—"}
                </td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr style={{ borderTop: "1px solid var(--line-strong)" }}>
                <td><strong>Total</strong></td>
                <td style={{ textAlign: "right", fontWeight: 700, color: "var(--amber)" }}>
                  {peso(rows.reduce((s, r) => s + r.total, 0))}
                </td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>
                  {rows.reduce((s, r) => s + r.count, 0)}
                </td>
                <td style={{ textAlign: "right", color: "var(--warn)" }}>
                  – {peso(rows.reduce((s, r) => s + r.refunds, 0))}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Transactions</h1>
          <div className="sub">Financial ledger · {total.toLocaleString()} records in range</div>
        </div>
        <button
          className="btn-xs primary"
          onClick={() => csvDownload(
            [["Date", "Time", "Reference", "Type", "Payment Method", "Status", "Amount", "Void Reason"],
             ...filtered.map((t) => [
               t.created_at.slice(0, 10),
               new Date(t.created_at).toLocaleTimeString("en-PH"),
               t.reference_id?.slice(0, 8) ?? "—",
               t.type, paymentLabel(t.payment_method), t.status,
               String(Number(t.amount).toFixed(2)),
               t.voided_reason ?? "",
             ])],
            `transactions-${initialFrom}-${initialTo}.csv`,
          )}
        >
          ⬇ Export CSV
        </button>
      </div>

      {/* ── Date range bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "14px 32px", borderBottom: "1px solid var(--line)",
        background: "rgba(var(--tint-rgb), 0.02)",
      }}>
        <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.12em" }}>From</span>
        <input type="date" value={pendingFrom} onChange={(e) => setPFrom(e.target.value)} className="input" style={{ padding: "5px 10px", fontSize: 12, fontFamily: "var(--f-mono)" }} />
        <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.12em" }}>To</span>
        <input type="date" value={pendingTo}   onChange={(e) => setPTo(e.target.value)}   className="input" style={{ padding: "5px 10px", fontSize: 12, fontFamily: "var(--f-mono)" }} />
        <button className="btn-xs primary" onClick={applyDates}>Apply</button>
        <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--text-3)" }}>Fetches from server on Apply.</span>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ borderBottom: "1px solid var(--line)", display: "flex", paddingLeft: 20 }}>
        {(["details", "hourly", "daily", "monthly"] as Tab[]).map((t) => (
          <button key={t} style={tabBarStyle(t)} onClick={() => { setTab(t); setPage(0); }}>
            {t === "details" ? "Ledger" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="admin-body">

        {/* ── KPI cards ── */}
        <div className="kpi-grid" style={{ marginBottom: 24 }}>
          <div className="kpi"><div className="lbl">Net Sales</div><div className="val amber">{peso(netSales)}</div></div>
          <div className="kpi"><div className="lbl">Total Refunds</div><div className="val warn">{peso(totalRefunds)}</div></div>
          <div className="kpi"><div className="lbl">Voided Amount</div><div className="val err">{peso(totalVoided)}</div></div>
          <div className="kpi"><div className="lbl">Sale Transactions</div><div className="val ok">{saleTxs.length.toLocaleString()}</div></div>
          <div className="kpi"><div className="lbl">Total Records</div><div className="val">{total.toLocaleString()}</div></div>
        </div>

        {/* ── LEDGER (details) TAB ── */}
        {tab === "details" && (
          <div className="admin-table-wrap">
            <div className="filter-bar" style={{ borderBottom: "1px solid var(--line)", padding: "10px 18px" }}>
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.12em" }}>Type:</span>
              {["all", "sale", "refund", "void"].map((t) => (
                <button key={t} className="btn-xs"
                  style={typeFilter === t ? { background: "rgba(var(--tint-rgb), 0.12)", borderColor: "rgba(var(--tint-rgb), 0.4)", color: "var(--amber-bright)" } : {}}
                  onClick={() => applyType(t)}
                >
                  {t === "all" ? "All" : t}
                </button>
              ))}
              {paymentMethods.length > 0 && (
                <>
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.12em", marginLeft: 16 }}>Payment:</span>
                  <button className="btn-xs"
                    style={!payFilter ? { background: "rgba(var(--tint-rgb), 0.12)", borderColor: "rgba(var(--tint-rgb), 0.4)", color: "var(--amber-bright)" } : {}}
                    onClick={() => { setPayFilter(""); setPage(0); }}
                  >
                    All
                  </button>
                  {paymentMethods.map((m) => (
                    <button key={m} className="btn-xs"
                      style={payFilter === m ? { background: "rgba(var(--tint-rgb), 0.12)", borderColor: "rgba(var(--tint-rgb), 0.4)", color: "var(--amber-bright)" } : {}}
                      onClick={() => { setPayFilter(m); setPage(0); }}
                    >
                      {paymentLabel(m)}
                    </button>
                  ))}
                </>
              )}
              <span style={{ marginLeft: "auto", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>
                {filtered.length.toLocaleString()} records loaded · {total.toLocaleString()} total
              </span>
            </div>

            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}></th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Reference</th>
                  <th>Type</th>
                  <th>Payment</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {slice.length === 0 && <tr><td colSpan={10} className="empty">No transactions in this range</td></tr>}
                {slice.map((t) => {
                  const expanded = expandedId === t.id;
                  const dt       = new Date(t.created_at);
                  const refShort = t.reference_id?.slice(0, 8) ?? "—";
                  return (
                    <React.Fragment key={t.id}>
                      <tr style={{ cursor: "pointer" }} onClick={() => setExpandedId(expanded ? null : t.id)}>
                        <td style={{ color: "var(--text-3)", fontSize: 11, userSelect: "none" }}>{expanded ? "▾" : "▸"}</td>
                        <td className="dim">{dt.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" })}</td>
                        <td className="dim">{dt.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</td>
                        <td><span className="mono">{refShort}</span></td>
                        <td><span className={`pill ${TYPE_COLOR[t.type] ?? "neutral"}`}>{t.type}</span></td>
                        <td className="dim">{paymentLabel(t.payment_method)}</td>
                        <td style={{ textAlign: "right" }} className="bold">{peso(Number(t.amount))}</td>
                        <td><span className={`pill ${STATUS_COLOR[t.status] ?? "neutral"}`}>{t.status}</span></td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {t.status === "completed" && t.type === "sale" && (
                            <button
                              className="btn-xs danger"
                              onClick={() => setVoidModal({ txId: t.id, ref: refShort, amount: Number(t.amount) })}
                            >
                              Void
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr style={{ background: "rgba(var(--tint-rgb), 0.03)" }}>
                          <td colSpan={10} style={{ padding: "12px 20px 14px 44px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px 24px" }}>
                              {[
                                { label: "Transaction ID",  value: t.id },
                                { label: "Ref",             value: t.reference_id ?? "—" },
                                { label: "Ref Table",       value: t.reference_table ?? "—" },
                                { label: "Amount",          value: peso(Number(t.amount)) },
                                { label: "Type",            value: t.type },
                                { label: "Payment Method",  value: paymentLabel(t.payment_method) },
                                { label: "Status",          value: t.status },
                                { label: "Date & Time",     value: dt.toLocaleString("en-PH") },
                                ...(t.voided_reason ? [{ label: "Void Reason", value: t.voided_reason }] : []),
                              ].map(({ label, value }) => (
                                <div key={label}>
                                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-3)", marginBottom: 3 }}>{label}</div>
                                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--text-1)", wordBreak: "break-all" }}>{value}</div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderTop: "1px solid var(--line)", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-2)" }}>
              <button className="btn-xs" onClick={() => setPage((p) => p - 1)} disabled={page === 0} style={{ padding: "5px 16px" }}>Previous</button>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span>Page <strong>{page + 1}</strong> of {totalPages}</span>
                <select className="input" value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(0); }} style={{ padding: "3px 8px", fontSize: 11 }}>
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} rows</option>)}
                </select>
              </div>
              <button className="btn-xs" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1} style={{ padding: "5px 16px" }}>Next</button>
            </div>
          </div>
        )}

        {tab === "hourly"  && <AggTable rows={hourlyRows}  periodLabel="Hour"  />}
        {tab === "daily"   && <AggTable rows={dailyRows}   periodLabel="Day"   />}
        {tab === "monthly" && <AggTable rows={monthlyRows} periodLabel="Month" />}

      </div>

      {/* ── Void modal ── */}
      {voidModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget && !voiding) { setVoidModal(null); setVoidReason(""); setVoidError(null); } }}
          role="button"
          tabIndex={0}
          aria-label="Close dialog"
          onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ") && !voiding) { e.preventDefault(); setVoidModal(null); setVoidReason(""); setVoidError(null); } }}
        >
          <div
            style={{ background: "var(--bg-0)", border: "1px solid var(--line-strong)", borderRadius: 16, padding: "28px 32px", minWidth: 380, maxWidth: 480 }}
          >
            <h2 style={{ margin: "0 0 6px" }}>Void Transaction</h2>
            <p style={{ margin: "0 0 20px", color: "var(--text-2)", fontSize: 13 }}>
              Voiding <strong>{voidModal.ref}</strong> · {peso(voidModal.amount)}<br />
              This creates an audit entry and reverses any linked inventory deductions.
            </p>
            <label style={{ display: "block", fontFamily: "var(--f-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-3)", marginBottom: 6 }}>
              Reason <span style={{ color: "var(--err)" }}>*</span>
            </label>
            <textarea
              className="input"
              rows={3}
              placeholder="Minimum 5 characters — e.g. Duplicate charge, customer dispute…"
              value={voidReason}
              onChange={(e) => { setVoidReason(e.target.value); setVoidError(null); }}
              style={{ width: "100%", resize: "vertical", fontFamily: "var(--f-body)", fontSize: 13 }}
              autoFocus
            />
            {voidError && <p style={{ color: "var(--err)", fontSize: 12, margin: "8px 0 0" }}>{voidError}</p>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button
                className="btn-xs"
                onClick={() => { setVoidModal(null); setVoidReason(""); setVoidError(null); }}
                disabled={voiding}
              >
                Cancel
              </button>
              <button
                className="btn-xs danger"
                onClick={doVoid}
                disabled={voiding || voidReason.trim().length < 5}
              >
                {voiding ? "Voiding…" : "Confirm Void"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

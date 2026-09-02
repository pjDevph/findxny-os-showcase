"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { peso } from "@/lib/config";
import {
  fetchCashDrawerDay, setCashDrawerStartingCash, addCashDrawerEntry,
  removeCashDrawerEntry, setCashDrawerManualOverride,
} from "./actions";

interface Tx {
  type: string;
  status: string;
  amount: string | number;
  payment_method?: string;
  created_at: string;
}

interface DrawerDay {
  id: string;
  starting_cash: number | string;
  net_cash_manual: number | string | null;
}

interface DrawerEntry {
  id: string;
  kind: "cash_in" | "expense";
  label: string;
  amount: number | string;
  remarks: string | null;
  expense_type: "Cash" | "Non-Cash" | null;
}

function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

/* ── Reusable inline-edit KPI card ── */
function EditableKpi({
  label,
  value,
  colorClass,
  editing,
  inputVal,
  inputRef,
  onStartEdit,
  onChange,
  onApply,
  onEscape,
}: {
  label: string;
  value: string;
  colorClass?: string;
  editing: boolean;
  inputVal: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onStartEdit: () => void;
  onChange: (v: string) => void;
  onApply: () => void;
  onEscape: () => void;
}) {
  return (
    <div className="kpi" style={{ position: "relative" }}>
      <div className="lbl">{label}</div>
      {editing ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
          <input
            ref={inputRef}
            type="number"
            min={0}
            value={inputVal}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onApply}
            onKeyDown={(e) => { if (e.key === "Enter") onApply(); if (e.key === "Escape") onEscape(); }}
            className="input"
            style={{ width: "100%", fontFamily: "var(--f-mono)", fontSize: 14, fontWeight: 700, padding: "4px 8px" }}
          />
          <button className="btn-xs primary" onMouseDown={onApply}>✓</button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className={`val ${colorClass ?? ""}`}>{value}</div>
          <button
            onClick={onStartEdit}
            style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}
            title={`Edit ${label.toLowerCase()}`}
          >
            <EditIcon />
          </button>
        </div>
      )}
    </div>
  );
}

export function CashDrawerClient({
  workspaceId,
  transactions,
  date,
}: {
  workspaceId: string;
  transactions: Tx[];
  date: string;
}) {
  /* ── Server-backed day + entries (replaces localStorage) ── */
  const [day,      setDay]      = useState<DrawerDay | null>(null);
  const [entries,  setEntries]  = useState<DrawerEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  /* ── Quick-add field state ── */
  const [addAmt,     setAddAmt]     = useState("");
  const [addRemarks, setAddRemarks] = useState("");
  const [expLabel,   setExpLabel]   = useState("");
  const [expAmt,     setExpAmt]     = useState("");
  const [expType,    setExpType]    = useState<"Cash" | "Non-Cash">("Cash");
  const [expFilter,  setExpFilter]  = useState<"All" | "Cash" | "Non-Cash">("All");

  /* ── Inline-edit state for each KPI ── */
  const [editingStarting,  setEditingStarting]  = useState(false);
  const [editingNetCash,   setEditingNetCash]   = useState(false);

  const [startingInput,    setStartingInput]    = useState("0");
  const [netCashInput,     setNetCashInput]     = useState("0");

  const startingRef    = useRef<HTMLInputElement>(null);
  const netCashRef     = useRef<HTMLInputElement>(null);

  const startingCash   = Number(day?.starting_cash ?? 0);
  const netCashManual  = day?.net_cash_manual === null || day?.net_cash_manual === undefined
    ? null : Number(day.net_cash_manual);

  const cashAdded = useMemo(() => entries.filter((e) => e.kind === "cash_in"), [entries]);
  const expenses  = useMemo(() => entries.filter((e) => e.kind === "expense"), [entries]);

  /* ── Load the real day + entries whenever the workspace or date changes —
     refetch instead of relying on local init, since this is now shared across
     devices/sessions instead of per-browser localStorage. ── */
  const loadDay = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { day: d, entries: e } = await fetchCashDrawerDay(workspaceId, date);
      setDay(d);
      setEntries(e);
      setStartingInput(String(Number(d?.starting_cash ?? 0)));
      setNetCashInput(String(Number(d?.net_cash_manual ?? 0)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to load cash drawer.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, date]);

  useEffect(() => { void loadDay(); }, [loadDay]);

  /* ── Focus inputs when edit mode opens ── */
  useEffect(() => { if (editingStarting)  startingRef.current?.select();  }, [editingStarting]);
  useEffect(() => { if (editingNetCash)   netCashRef.current?.select();   }, [editingNetCash]);

  /* ── Sales by payment method (today) ── */
  const salesByMethod = useMemo(() => {
    const map = new Map<string, number>();
    // Always seed known non-cash methods from all transactions so they show even at ₱0
    transactions.forEach((t) => {
      const pm = t.payment_method?.trim() || "Cash";
      if (pm.toLowerCase() !== "cash") map.set(pm, 0);
    });
    // Now sum today's completed sales
    transactions
      .filter((t) => {
        const d = (t.created_at ?? "").slice(0, 10);
        return d === date && t.type === "sale" && t.status === "completed";
      })
      .forEach((t) => {
        const pm = t.payment_method?.trim() || "Cash";
        map.set(pm, (map.get(pm) ?? 0) + Number(t.amount));
      });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [transactions, date]);

  const totalSales = salesByMethod.reduce((s, [, v]) => s + v, 0);

  /* ── Cash drawer math ── */
  const cashSales        = salesByMethod.filter(([m]) => m.toLowerCase() === "cash").reduce((s, [, v]) => s + v, 0);
  const totalAdded       = cashAdded.reduce((s, r) => s + Number(r.amount), 0);
  const totalExpenses    = expenses.reduce((s, r)  => s + Number(r.amount), 0);
  const cashInDrawerCalc = startingCash + cashSales + totalAdded - totalExpenses;
  const cashInDrawer     = netCashManual !== null ? netCashManual : cashInDrawerCalc;

  /* ── Apply helpers — each now round-trips to the real edge function ── */
  async function applyStartingCash() {
    const v = parseFloat(startingInput.replace(/[^0-9.]/g, ""));
    setEditingStarting(false);
    if (isNaN(v) || v < 0) { setStartingInput(String(startingCash)); return; }
    try {
      const { day: updated } = await setCashDrawerStartingCash(workspaceId, date, v);
      setDay(updated);
      setStartingInput(String(Number(updated.starting_cash)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update starting cash.");
    }
  }

  async function applyNetCashManual() {
    const v = parseFloat(netCashInput.replace(/[^0-9.]/g, ""));
    setEditingNetCash(false);
    if (isNaN(v) || v < 0) { setNetCashInput(String(cashInDrawer)); return; }
    try {
      const { day: updated } = await setCashDrawerManualOverride(workspaceId, date, v);
      setDay(updated);
      setNetCashInput(String(Number(updated.net_cash_manual)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update net cash override.");
    }
  }

  async function resetNetCashManual() {
    try {
      const { day: updated } = await setCashDrawerManualOverride(workspaceId, date, null);
      setDay(updated);
      setNetCashInput("0");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to reset net cash override.");
    }
  }

  async function addCashIn() {
    const amt = parseFloat(addAmt.replace(/[^0-9.]/g, ""));
    if (isNaN(amt) || amt <= 0) return;
    try {
      const { entry } = await addCashDrawerEntry(workspaceId, date, {
        kind: "cash_in", label: "Cash Added", amount: amt, remarks: addRemarks.trim() || null,
      });
      setEntries((p) => [...p, entry]);
      setAddAmt(""); setAddRemarks("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to add cash.");
    }
  }

  async function addExpense() {
    const amt = parseFloat(expAmt.replace(/[^0-9.]/g, ""));
    if (!expLabel.trim() || isNaN(amt) || amt <= 0) return;
    try {
      const { entry } = await addCashDrawerEntry(workspaceId, date, {
        kind: "expense", label: expLabel.trim(), amount: amt, expense_type: expType,
      });
      setEntries((p) => [...p, entry]);
      setExpLabel(""); setExpAmt("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to add expense.");
    }
  }

  async function removeEntry(entryId: string) {
    const prev = entries;
    setEntries((p) => p.filter((e) => e.id !== entryId));
    try {
      await removeCashDrawerEntry(workspaceId, entryId);
    } catch (err) {
      setEntries(prev);
      setActionError(err instanceof Error ? err.message : "Failed to remove entry.");
    }
  }

  function downloadCSV(rows: string[][], filename: string) {
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return null;

  return (
    <>
      {actionError && (
        <div style={{
          marginBottom: 16, padding: "10px 14px", borderRadius: 8,
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          color: "var(--err, #ff5050)", fontSize: 13,
        }}>
          {actionError}
          <button className="btn-xs" style={{ marginLeft: 12 }} onClick={() => setActionError(null)}>Dismiss</button>
        </div>
      )}

      {/* ── Hero: Cash In Drawer = Total Sales breakdown ── */}
      <div style={{
        background: "linear-gradient(135deg, rgba(var(--tint-rgb), 0.12) 0%, rgba(var(--tint-rgb), 0.04) 100%)",
        border: "1px solid rgba(var(--tint-rgb), 0.25)", borderRadius: 16,
        padding: "28px 32px", marginBottom: 24,
      }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--text-3)", marginBottom: 6 }}>Cash in Drawer</div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 42, fontWeight: 700, color: "var(--amber-bright)", letterSpacing: "-0.02em", lineHeight: 1 }}>
            {peso(totalSales)}
          </div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>Total sales · {date}</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {salesByMethod.map(([method, amount]) => (
            <div key={method} style={{
              background: "rgba(var(--tint-rgb), 0.07)", border: "1px solid rgba(var(--tint-rgb), 0.18)",
              borderRadius: 10, padding: "10px 16px", minWidth: 140,
            }}>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-3)", marginBottom: 4 }}>{method} Sales</div>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 18, fontWeight: 700, color: amount > 0 ? "var(--amber)" : "var(--text-3)" }}>{peso(amount)}</div>
            </div>
          ))}
          {salesByMethod.length === 0 && (
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--text-3)" }}>No sales recorded today</div>
          )}
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>

        <EditableKpi
          label="Starting Cash"
          value={peso(startingCash)}
          editing={editingStarting}
          inputVal={startingInput}
          inputRef={startingRef}
          onStartEdit={() => { setStartingInput(String(startingCash)); setEditingStarting(true); }}
          onChange={setStartingInput}
          onApply={applyStartingCash}
          onEscape={() => { setStartingInput(String(startingCash)); setEditingStarting(false); }}
        />

        <div className="kpi">
          <div className="lbl">Cash Sales (Today)</div>
          <div className="val amber">{peso(cashSales)}</div>
        </div>

        <div className="kpi">
          <div className="lbl">Cash Added</div>
          <div className="val ok">{peso(totalAdded)}</div>
        </div>

        <div className="kpi">
          <div className="lbl">Expenses</div>
          <div className="val warn">{peso(totalExpenses)}</div>
        </div>

        <EditableKpi
          label={netCashManual !== null ? "Net Cash in Drawer ✎" : "Net Cash in Drawer"}
          value={peso(cashInDrawer)}
          colorClass={cashInDrawer >= 0 ? "amber" : "err"}
          editing={editingNetCash}
          inputVal={netCashInput}
          inputRef={netCashRef}
          onStartEdit={() => { setNetCashInput(String(cashInDrawer)); setEditingNetCash(true); }}
          onChange={setNetCashInput}
          onApply={applyNetCashManual}
          onEscape={() => { setNetCashInput(String(cashInDrawer)); setEditingNetCash(false); }}
        />

      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* ── Cash Added ── */}
        <div className="admin-card" style={{ padding: 0 }}>
          <div style={{ padding: "16px 18px 14px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>Cash Added</h2>
            <span className="dim" style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}>{peso(totalAdded)}</span>
          </div>
          <div style={{ padding: "14px 18px" }}>
            {/* Amount row */}
            <input
              type="number" min={0} placeholder="Cash Amount *"
              value={addAmt} onChange={(e) => setAddAmt(e.target.value)}
              className="input" style={{ width: "100%", fontSize: 13, padding: "7px 10px", marginBottom: 8 }}
            />
            {/* Remarks row */}
            <input
              type="text" placeholder="Remarks"
              value={addRemarks} onChange={(e) => setAddRemarks(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCashIn()}
              className="input" style={{ width: "100%", fontSize: 13, padding: "7px 10px", marginBottom: 12 }}
            />
            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn-xs"
                style={{ flex: 1 }}
                onClick={() => downloadCSV(
                  [["Label", "Remarks", "Amount"], ...cashAdded.map((r) => [r.label || "Cash Added", r.remarks ?? "", String(r.amount)])],
                  `cash-added-${date}.csv`,
                )}
              >
                ⬇ Download Cash Added
              </button>
              <button className="btn-xs primary" style={{ flex: 1 }} onClick={() => void addCashIn()}>
                + Add Cash
              </button>
            </div>

            {/* List */}
            {cashAdded.length === 0
              ? <div className="empty" style={{ marginTop: 12 }}>No additions yet</div>
              : (
                <div style={{ marginTop: 12 }}>
                  {cashAdded.map((r) => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "7px 0", borderTop: "1px solid var(--line)" }}>
                      <div>
                        <div style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 600 }}>{r.label || "Cash Added"}</div>
                        {r.remarks && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{r.remarks}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--f-mono)", fontSize: 13, color: "var(--ok)" }}>+{peso(Number(r.amount))}</span>
                        <button className="btn-xs danger" style={{ padding: "1px 7px" }} onClick={() => void removeEntry(r.id)}>×</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 0 0", fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 700, color: "var(--ok)" }}>
                    Total: {peso(totalAdded)}
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* ── Expense Added ── */}
        <div className="admin-card" style={{ padding: 0 }}>
          <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>Expense Added</h2>
            {/* All / Cash / Non-Cash filter */}
            <div style={{ display: "flex", gap: 4 }}>
              {(["All", "Cash", "Non-Cash"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setExpFilter(f)}
                  className="btn-xs"
                  style={expFilter === f ? { background: "rgba(var(--tint-rgb), 0.18)", borderColor: "rgba(var(--tint-rgb), 0.4)", color: "var(--amber-bright)" } : {}}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: "14px 18px" }}>
            {/* Name + Amount row */}
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                type="text" placeholder="Expense Name *"
                value={expLabel} onChange={(e) => setExpLabel(e.target.value)}
                className="input" style={{ flex: 1, fontSize: 13, padding: "7px 10px" }}
              />
              <input
                type="number" min={0} placeholder="Expense Amount *"
                value={expAmt} onChange={(e) => setExpAmt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addExpense()}
                className="input" style={{ width: 130, fontSize: 13, padding: "7px 10px" }}
              />
            </div>
            {/* Cash / Non-Cash radio */}
            <div style={{ display: "flex", gap: 20, marginBottom: 12, alignItems: "center" }}>
              {(["Cash", "Non-Cash"] as const).map((t) => (
                <label key={t} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "var(--text-2)" }}>
                  <input
                    type="radio" name="expType" value={t}
                    checked={expType === t} onChange={() => setExpType(t)}
                    style={{ accentColor: "var(--amber)" }}
                  />
                  {t}
                </label>
              ))}
            </div>
            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn-xs"
                style={{ flex: 1 }}
                onClick={() => {
                  const rows = expenses.filter((r) => expFilter === "All" || r.expense_type === expFilter);
                  downloadCSV(
                    [["Name", "Type", "Amount"], ...rows.map((r) => [r.label, r.expense_type ?? "", String(r.amount)])],
                    `expenses-${expFilter.toLowerCase()}-${date}.csv`,
                  );
                }}
              >
                ⬇ Download All Expense
              </button>
              <button className="btn-xs danger" style={{ flex: 1 }} onClick={() => void addExpense()}>
                + Add Expense
              </button>
            </div>

            {/* List */}
            {(() => {
              const filtered = expenses.filter((r) => expFilter === "All" || r.expense_type === expFilter);
              if (filtered.length === 0)
                return <div className="empty" style={{ marginTop: 12 }}>No expenses yet</div>;
              return (
                <div style={{ marginTop: 12 }}>
                  {filtered.map((r) => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderTop: "1px solid var(--line)" }}>
                      <div>
                        <div style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 600 }}>{r.label}</div>
                        <span style={{
                          fontFamily: "var(--f-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em",
                          color: r.expense_type === "Cash" ? "var(--ok)" : "var(--text-3)",
                          background: r.expense_type === "Cash" ? "rgba(80,200,120,0.1)" : "rgba(255,255,255,0.05)",
                          padding: "1px 6px", borderRadius: 4,
                        }}>{r.expense_type}</span>
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--f-mono)", fontSize: 13, color: "var(--warn)" }}>–{peso(Number(r.amount))}</span>
                        <button className="btn-xs danger" style={{ padding: "1px 7px" }} onClick={() => void removeEntry(r.id)}>×</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 0 0", fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 700, color: "var(--warn)" }}>
                    Total: {peso(filtered.reduce((s, r) => s + Number(r.amount), 0))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

      </div>

      {/* ── Cash flow summary ── */}
      <div className="admin-table-wrap" style={{ marginTop: 20 }}>
        <div className="admin-table-head"><h2>Cash Flow Summary</h2></div>
        <table className="admin-table">
          <tbody>
            <tr><td>Starting Cash</td><td style={{ textAlign: "right" }}>{peso(startingCash)}</td></tr>
            <tr><td>Cash Sales (today)</td><td style={{ textAlign: "right", color: "var(--amber)" }}>{peso(cashSales)}</td></tr>
            {salesByMethod.filter(([m]) => m.toLowerCase() !== "cash").map(([m, v]) => (
              <tr key={m}><td className="dim" style={{ paddingLeft: 20 }}>{m} Sales</td><td style={{ textAlign: "right", color: "var(--text-2)" }}>{peso(v)}</td></tr>
            ))}
            <tr><td>Cash Added</td><td style={{ textAlign: "right", color: "var(--ok)" }}>+ {peso(totalAdded)}</td></tr>
            <tr><td>Expenses</td><td style={{ textAlign: "right", color: "var(--warn)" }}>– {peso(totalExpenses)}</td></tr>
            {netCashManual !== null && (
              <tr>
                <td className="dim">Expected (auto)</td>
                <td style={{ textAlign: "right", color: "var(--text-3)" }}>{peso(cashInDrawerCalc)}</td>
              </tr>
            )}
            <tr>
              <td>
                <strong>Net Cash in Drawer</strong>
                {netCashManual !== null && (
                  <button
                    onClick={() => void resetNetCashManual()}
                    style={{ marginLeft: 10, fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--text-3)", background: "none", border: "1px solid var(--line)", borderRadius: 4, padding: "1px 6px", cursor: "pointer" }}
                  >
                    reset
                  </button>
                )}
              </td>
              <td style={{ textAlign: "right", color: cashInDrawer >= 0 ? "var(--amber-bright)" : "var(--err)", fontWeight: 700, fontSize: 15 }}>{peso(cashInDrawer)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

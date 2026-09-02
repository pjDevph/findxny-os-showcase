"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { adminClient } from "@/lib/admin-client";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { extractErrMsg } from "@/lib/errors";

type Category = "startup" | "fixed" | "variable" | "marketing" | "buffer" | "growth";
type Frequency = "one_time" | "monthly" | "per_sale";

interface CostItem {
  id: string;
  category: Category;
  name: string;
  amount: number;
  frequency: Frequency;
  notes: string;
}

const CATEGORIES: { id: Category; label: string; color: string }[] = [
  { id: "startup",   label: "Startup",          color: "#F59E0B" },
  { id: "fixed",     label: "Fixed Monthly",    color: "#3B82F6" },
  { id: "variable",  label: "Variable",         color: "#10B981" },
  { id: "marketing", label: "Marketing",        color: "#8B5CF6" },
  { id: "buffer",    label: "Ops Buffer",       color: "#EF4444" },
  { id: "growth",    label: "Growth",           color: "#06B6D4" },
];

const FREQ_LABELS: Record<Frequency, string> = {
  one_time: "One-time",
  monthly:  "Monthly",
  per_sale: "Per Sale",
};

const EMPTY_FORM = { id: "", category: "fixed" as Category, name: "", amount: "", frequency: "monthly" as Frequency, notes: "" };

const peso = (n: number) => `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

export default function CostingPage() {
  const [items, setItems]         = useState<CostItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<Category | "summary">("summary");
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState<string | null>(null);
  const [profitPerSale, setProfitPerSale] = useState("200");
  const wsIdRef = useRef<string | null>(null);

  async function getWorkspaceId(): Promise<string | null> {
    if (wsIdRef.current) return wsIdRef.current;
    try {
      const { memberships } = await adminClient.me();
      wsIdRef.current = memberships[0]?.workspace_id ?? null;
    } catch { wsIdRef.current = null; }
    return wsIdRef.current;
  }

  async function load() {
    setLoading(true);
    try {
      const wsId = await getWorkspaceId();
      if (!wsId) { setLoading(false); return; }
      const { costs } = await adminClient.costs(wsId);
      setItems((costs ?? []).map((i: any) => ({ ...i, amount: Number(i.amount), notes: i.notes ?? "" })));
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load cost items");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const monthlyAll   = useMemo(() => items.filter(i => i.frequency === "monthly").reduce((s, i) => s + i.amount, 0), [items]);
  const startupTotal = useMemo(() => items.filter(i => i.frequency === "one_time").reduce((s, i) => s + i.amount, 0), [items]);
  const perSaleTotal = useMemo(() => items.filter(i => i.frequency === "per_sale").reduce((s, i) => s + i.amount, 0), [items]);
  const profit       = Math.max(0, (parseFloat(profitPerSale) || 0) - perSaleTotal);
  const breakEven    = profit > 0 ? Math.ceil(monthlyAll / profit) : null;

  const byCategory = (cat: Category) => items.filter(i => i.category === cat);
  const catTotal   = (cat: Category) => byCategory(cat).reduce((s, i) => s + i.amount, 0);

  function openAdd(defaultCat?: Category) {
    setForm({ ...EMPTY_FORM, category: defaultCat ?? "fixed" });
    setShowForm(true);
    setErr(null);
  }

  function openEdit(item: CostItem) {
    setForm({ id: item.id, category: item.category, name: item.name, amount: String(item.amount), frequency: item.frequency, notes: item.notes });
    setShowForm(true);
    setErr(null);
  }

  async function saveItem() {
    if (!form.name.trim()) { setErr("Name is required"); return; }
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt < 0) { setErr("Enter a valid amount"); return; }
    setSaving(true); setErr(null);
    const wsId = await getWorkspaceId();
    if (!wsId) { setSaving(false); setErr("No workspace"); return; }
    try {
      await adminClient.costsUpsert({
        workspace_id: wsId,
        ...(form.id ? { id: form.id } : {}),
        category: form.category, name: form.name.trim(),
        amount: amt, frequency: form.frequency, notes: form.notes,
      });
      setShowForm(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (e: any) {
      setErr(extractErrMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(id: string) {
    const wsId = await getWorkspaceId();
    if (!wsId) throw new Error("No workspace");
    await adminClient.costsDelete({ workspace_id: wsId, cost_item_id: id });
    await load();
  }

  const TABS = [
    { id: "summary" as const, label: "Summary" },
    ...CATEGORIES.map(c => ({ id: c.id as Category | "summary", label: c.label })),
  ];

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Costing</h1>
          <div className="sub">Business costs &amp; break-even planner</div>
        </div>
        <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => openAdd(activeTab !== "summary" ? activeTab : undefined)}>
          + Add Cost
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 24px 16px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id as any)}
            className={`chip${activeTab === t.id ? " active" : ""}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="admin-body">
        {loading && <div style={{ textAlign: "center", padding: 48, color: "var(--text-3)", fontFamily: "var(--f-mono)" }}>Loading…</div>}
        {!loading && err && !showForm && <div style={{ padding: "12px 16px", marginBottom: 16, borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--err)", fontSize: 13 }}>{err}</div>}

        {!loading && activeTab === "summary" && (
          <>
            {/* KPI cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
              {[
                { label: "Total Monthly Costs", value: peso(monthlyAll), color: "#3B82F6" },
                { label: "Startup Investment",  value: peso(startupTotal), color: "#F59E0B" },
                { label: "Per-Sale Costs",      value: peso(perSaleTotal), color: "#10B981" },
              ].map(k => (
                <div key={k.label} className="admin-card" style={{ borderTop: `3px solid ${k.color}`, padding: "16px 20px" }}>
                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 }}>{k.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: k.color, fontFamily: "var(--f-mono)" }}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Break-even calculator */}
            <div className="admin-card" style={{ marginBottom: 24, borderColor: "rgba(var(--tint-rgb), 0.3)" }}>
              <h2 style={{ marginBottom: 4 }}>Break-even Calculator</h2>
              <div style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic", marginBottom: 16 }}>Monthly Fixed Costs ÷ Profit per Sale = Break-even Orders</div>
              <div style={{ display: "grid", gap: 10 }}>
                {[
                  { label: "Monthly Costs",    value: peso(monthlyAll) },
                  { label: "Cost per Sale",    value: peso(perSaleTotal) },
                  { label: "Net Profit / Sale", value: peso(profit), color: profit > 0 ? "var(--ok)" : "var(--err)" },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ color: "var(--text-2)", fontSize: 13 }}>{row.label}</span>
                    <span style={{ fontFamily: "var(--f-mono)", fontWeight: 700, color: row.color ?? "var(--text-0)" }}>{row.value}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ color: "var(--text-2)", fontSize: 13 }}>Selling Price / Profit per Sale</span>
                  <input type="number" value={profitPerSale} onChange={e => setProfitPerSale(e.target.value)}
                    className="input" style={{ width: 120, textAlign: "right", fontFamily: "var(--f-mono)", padding: "6px 10px" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>Break-even</span>
                  <span style={{ fontFamily: "var(--f-mono)", fontWeight: 800, fontSize: 18, color: "var(--amber)" }}>
                    {breakEven !== null ? `${breakEven} orders/month` : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Category overview */}
            <div style={{ display: "grid", gap: 10 }}>
              {CATEGORIES.map(cat => {
                const total = catTotal(cat.id);
                const count = byCategory(cat.id).length;
                return (
                  <button key={cat.id} type="button" className="admin-card" style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", width: "100%", textAlign: "left", font: "inherit", color: "inherit" }}
                    onClick={() => setActiveTab(cat.id)}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: cat.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontWeight: 600 }}>{cat.label}</span>
                    <span style={{ color: "var(--text-3)", fontSize: 12, fontFamily: "var(--f-mono)" }}>{count} item{count !== 1 ? "s" : ""}</span>
                    <span style={{ fontFamily: "var(--f-mono)", fontWeight: 700, color: cat.color }}>{peso(total)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {!loading && activeTab !== "summary" && (() => {
          const cat = CATEGORIES.find(c => c.id === activeTab)!;
          const catItems = byCategory(activeTab);
          return (
            <>
              <div className="admin-card" style={{ borderTop: `3px solid ${cat.color}`, marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px" }}>
                <div>
                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: cat.color }}>{cat.label}</div>
                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 22, fontWeight: 800 }}>{peso(catTotal(activeTab))}</div>
                </div>
                <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => openAdd(activeTab)}>+ Add</button>
              </div>

              {catItems.length === 0 && (
                <div className="admin-card" style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-3)" }}>
                  No {cat.label} costs yet. Click &quot;+ Add&quot; to add one.
                </div>
              )}

              <div style={{ display: "grid", gap: 10 }}>
                {catItems.map(item => (
                  <div key={item.id} className="admin-card" style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "14px 20px" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.name}</div>
                      {item.notes && <div style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic", marginBottom: 6 }}>{item.notes}</div>}
                      <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--bg-3)", color: "var(--text-2)", border: "1px solid var(--line)" }}>
                        {FREQ_LABELS[item.frequency]}
                      </span>
                    </div>
                    <div style={{ fontFamily: "var(--f-mono)", fontWeight: 700, fontSize: 16, color: cat.color, flexShrink: 0 }}>{peso(item.amount)}</div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => openEdit(item)}>Edit</button>
                      <ConfirmActionButton
                        className="btn"
                        style={{ fontSize: 12, padding: "6px 12px", borderColor: "var(--err)", color: "var(--err)" }}
                        title={`Delete "${item.name}"?`}
                        body={`This removes the ${FREQ_LABELS[item.frequency].toLowerCase()} cost of ${peso(item.amount)} from your books. The numbers in Summary will update right away.`}
                        confirmLabel="Delete cost"
                        cancelLabel="Keep"
                        action={() => deleteItem(item.id)}
                      >
                        Del
                      </ConfirmActionButton>
                    </div>
                  </div>
                ))}
              </div>
            </>
          );
        })()}
      </div>

      {/* Add / Edit modal */}
      {showForm && (
        <div role="button" tabIndex={0} aria-label="Close dialog" // NOSONAR
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}
          onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) setShowForm(false); }}>
          <div style={{ background: "var(--bg-2)", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", padding: "24px 24px 40px" }}>
            <h2 style={{ marginBottom: 20 }}>{form.id ? "Edit Cost" : "Add Cost Item"}</h2>

            <fieldset className="admin-field" style={{ marginBottom: 16, border: "none", padding: 0, margin: 0 }} aria-label="Category">
              <legend className="field-label">Category</legend>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                {CATEGORIES.map(c => (
                  <button key={c.id} type="button"
                    className={`chip${form.category === c.id ? " active" : ""}`}
                    onClick={() => setForm(f => ({ ...f, category: c.id }))}>
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="admin-field" style={{ marginBottom: 16 }}>
              <label htmlFor="cost-name">Name <span style={{ color: "var(--err)" }}>*</span></label>
              <input id="cost-name" className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Monthly Rent" />
            </div>

            <div className="admin-field" style={{ marginBottom: 16 }}>
              <label htmlFor="cost-amount">Amount (₱) <span style={{ color: "var(--err)" }}>*</span></label>
              <input id="cost-amount" className="input" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>

            <fieldset className="admin-field" style={{ marginBottom: 16, border: "none", padding: 0, margin: 0 }} aria-label="Frequency">
              <legend className="field-label">Frequency</legend>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                {(["one_time", "monthly", "per_sale"] as Frequency[]).map(f => (
                  <button key={f} type="button"
                    className={`chip${form.frequency === f ? " active" : ""}`}
                    onClick={() => setForm(ff => ({ ...ff, frequency: f }))}>
                    {FREQ_LABELS[f]}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="admin-field" style={{ marginBottom: 20 }}>
              <label htmlFor="cost-notes">Notes (optional)</label>
              <textarea id="cost-notes" className="textarea" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional details…" />
            </div>

            {err && <div style={{ color: "var(--err)", fontSize: 13, marginBottom: 12 }}>{err}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving} onClick={saveItem}>
                {saving ? "Saving…" : form.id ? "Save Changes" : "Add Cost Item"}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

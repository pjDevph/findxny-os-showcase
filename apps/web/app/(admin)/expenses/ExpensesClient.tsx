"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { peso } from "@/lib/config";
import { SlideOver } from "@/components/ui/SlideOver";

// ── Types ──────────────────────────────────────────────────────────────────

interface Branch {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

interface Expense {
  id: string;
  expense_date: string;
  amount: number;
  payment_method: string;
  vendor_name: string | null;
  notes: string | null;
  category_id: string | null;
  branch_id: string | null;
  expense_categories: { id: string; name: string } | null;
  branches: { id: string; name: string } | null;
}

type View = "expenses" | "categories";

const PAYMENT_METHODS = [
  { value: "cash",          label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card",          label: "Card" },
  { value: "gcash",         label: "GCash" },
  { value: "maya",          label: "Maya" },
  { value: "other",         label: "Other" },
];

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  gcash: "GCash",
  maya: "Maya",
  other: "Other",
};

// ── Helpers ────────────────────────────────────────────────────────────────

// Edge function errors carry the real message in the response body, not
// error.message (which Supabase-js sets to a generic "non-2xx status" string).
async function fnErrorMessage(error: unknown, fallback: string): Promise<string> {
  try {
    const ctx = (error as { context?: { json?: () => Promise<unknown> } })?.context;
    if (ctx?.json) {
      const body = (await ctx.json()) as { error?: { message?: string } };
      if (body?.error?.message) return body.error.message;
    }
  } catch { /* fall through to generic message */ }
  return error instanceof Error ? error.message : fallback;
}

const MONO: React.CSSProperties = {
  fontFamily: "var(--f-mono)",
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(): string {
  const n = new Date();
  return ymd(new Date(n.getFullYear(), n.getMonth(), 1));
}

function today(): string {
  return ymd(new Date());
}

function fmtDate(s: string): string {
  return new Date(s + "T00:00:00").toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "60px 24px", gap: 12, textAlign: "center",
    }}>
      <div style={{ fontSize: 36, opacity: 0.4 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--text-3)", maxWidth: 340, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

// ── Field row ──────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ ...MONO, display: "block", marginBottom: 6 }}>
        {label}{required && <span style={{ color: "var(--err, #ff5050)", marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

// ── Add Expense form (inside SlideOver) ────────────────────────────────────

function AddExpenseForm({
  workspaceId,
  categories,
  branches,
  onSaved,
  onCancel,
}: {
  workspaceId: string;
  categories: Category[];
  branches: Branch[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState<string | null>(null);

  const [date,          setDate]          = useState(today());
  const [categoryId,    setCategoryId]    = useState("");
  const [amount,        setAmount]        = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [vendorName,    setVendorName]    = useState("");
  const [notes,         setNotes]         = useState("");
  const [branchId,      setBranchId]      = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) {
      setErr("Amount must be greater than zero.");
      return;
    }

    setSaving(true);
    try {
      const sb = supabaseBrowser();
      const { error } = await sb.functions.invoke("expenses-upsert", {
        body: {
          workspace_id:   workspaceId,
          expense_date:   date,
          category_id:    categoryId || null,
          amount:         num,
          payment_method: paymentMethod,
          vendor_name:    vendorName.trim() || null,
          notes:          notes.trim()      || null,
          branch_id:      branchId          || null,
        },
      });
      if (error) throw new Error(await fnErrorMessage(error, "Failed to save expense."));
      onSaved();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Failed to save expense.");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
  };

  return (
    <form onSubmit={handleSubmit}>
      {err && (
        <div style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8,
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          color: "var(--err, #ff5050)", fontSize: 13,
        }}>
          {err}
        </div>
      )}

      <Field label="Date" required>
        <input
          type="date"
          className="input"
          style={inputStyle}
          value={date}
          max={today()}
          onChange={e => setDate(e.target.value)}
          required
        />
      </Field>

      <Field label="Category">
        <select
          className="input"
          style={inputStyle}
          value={categoryId}
          onChange={e => setCategoryId(e.target.value)}
        >
          <option value="">— Select category —</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {categories.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4, fontStyle: "italic" }}>
            No categories yet. Add one in the Categories tab.
          </div>
        )}
      </Field>

      <Field label="Amount (₱)" required>
        <input
          type="number"
          className="input"
          style={inputStyle}
          placeholder="0.00"
          value={amount}
          min="0.01"
          step="0.01"
          onChange={e => setAmount(e.target.value)}
          required
        />
      </Field>

      <Field label="Payment Method" required>
        <select
          className="input"
          style={inputStyle}
          value={paymentMethod}
          onChange={e => setPaymentMethod(e.target.value)}
        >
          {PAYMENT_METHODS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Vendor / Description">
        <input
          type="text"
          className="input"
          style={inputStyle}
          placeholder="e.g. Meralco, SM Supermarket…"
          value={vendorName}
          onChange={e => setVendorName(e.target.value)}
          maxLength={200}
        />
      </Field>

      {branches.length > 1 && (
        <Field label="Branch">
          <select
            className="input"
            style={inputStyle}
            value={branchId}
            onChange={e => setBranchId(e.target.value)}
          >
            <option value="">— All / unassigned —</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Notes">
        <textarea
          className="input"
          style={{ ...inputStyle, resize: "vertical", minHeight: 72 }}
          placeholder="Optional notes…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          maxLength={1000}
        />
      </Field>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <button type="button" className="btn-xs" onClick={onCancel}>Cancel</button>
        <button
          type="submit"
          className="btn-xs primary"
          disabled={saving || !date || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
        >
          {saving ? "Saving…" : "Save Expense"}
        </button>
      </div>
    </form>
  );
}

// ── Category management panel ──────────────────────────────────────────────

function CategoriesPanel({
  workspaceId,
  categories,
  onCategoriesChanged,
}: {
  workspaceId: string;
  categories: Category[];
  onCategoriesChanged: () => void;
}) {
  const [newName, setNewName]   = useState("");
  const [adding, setAdding]     = useState(false);
  const [addErr, setAddErr]     = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [delErr, setDelErr]     = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAddErr(null);
    setAdding(true);
    try {
      const sb = supabaseBrowser();
      const { error } = await sb.functions.invoke("expense-categories-upsert", {
        body: { workspace_id: workspaceId, name, sort_order: categories.length },
      });
      if (error) throw new Error(await fnErrorMessage(error, "Failed to add category."));
      setNewName("");
      onCategoriesChanged();
    } catch (ex: unknown) {
      setAddErr(ex instanceof Error ? ex.message : "Failed to add category.");
    } finally {
      setAdding(false);
    }
  }

  async function handleDeactivate(cat: Category) {
    setDelErr(null);
    setDeleting(cat.id);
    try {
      const sb = supabaseBrowser();
      const { error } = await sb.functions.invoke("expense-categories-upsert", {
        body: { workspace_id: workspaceId, category_id: cat.id, is_active: false },
      });
      if (error) throw new Error(await fnErrorMessage(error, "Failed to remove category."));
      onCategoriesChanged();
    } catch (ex: unknown) {
      setDelErr(ex instanceof Error ? ex.message : "Failed to remove category.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      {/* Add new category */}
      <div style={{ ...MONO, marginBottom: 10 }}>Add Category</div>
      <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input
          type="text"
          className="input"
          placeholder="Category name (e.g. Rent, Utilities…)"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          maxLength={100}
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn-xs primary" disabled={adding || !newName.trim()}>
          {adding ? "Adding…" : "Add"}
        </button>
      </form>
      {addErr && (
        <div style={{
          marginBottom: 14, padding: "8px 12px", borderRadius: 8,
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          color: "var(--err, #ff5050)", fontSize: 13,
        }}>
          {addErr}
        </div>
      )}

      {/* Category list */}
      <div style={{ ...MONO, marginBottom: 10 }}>Active Categories</div>
      {delErr && (
        <div style={{
          marginBottom: 12, padding: "8px 12px", borderRadius: 8,
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          color: "var(--err, #ff5050)", fontSize: 12,
        }}>
          {delErr}
        </div>
      )}

      {categories.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title="No categories yet"
          body='Add your first category above to start tracking expenses by type (e.g. Rent, Utilities, Supplies).'
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {categories.map(cat => (
            <div
              key={cat.id}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", borderRadius: 8,
                background: "rgba(var(--tint-rgb), 0.04)",
                border: "1px solid rgba(var(--tint-rgb), 0.1)",
                gap: 12,
              }}
            >
              <span style={{ fontSize: 14, color: "var(--text-1)", fontWeight: 500 }}>
                {cat.name}
              </span>
              <button
                type="button"
                className="btn-xs"
                onClick={() => handleDeactivate(cat)}
                disabled={deleting === cat.id}
                style={{ color: "var(--err, #ff5050)", borderColor: "rgba(239,68,68,0.3)", flexShrink: 0 }}
              >
                {deleting === cat.id ? "Removing…" : "Remove"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ExpensesClient({
  workspaceId,
  initialBranches,
  initialCategories,
}: {
  workspaceId: string;
  initialBranches: Branch[];
  initialCategories: Category[];
}) {
  const [view, setView] = useState<View>("expenses");

  // Filter state
  const [dateFrom,     setDateFrom]     = useState(startOfMonth);
  const [dateTo,       setDateTo]       = useState(today);
  const [filterCat,    setFilterCat]    = useState("all");
  const [filterBranch, setFilterBranch] = useState("all");

  // Data state
  const [expenses,   setExpenses]   = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [branches]                  = useState<Branch[]>(initialBranches);
  const [loading,    setLoading]    = useState(false);
  const [loadErr,    setLoadErr]    = useState<string | null>(null);

  // Add expense modal
  const [addOpen, setAddOpen] = useState(false);

  // ── Fetch expenses ──────────────────────────────────────────────────────

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const sb = supabaseBrowser();
      const { data, error } = await sb.functions.invoke("expenses-list", {
        body: {
          workspace_id: workspaceId,
          date_from: dateFrom,
          date_to: dateTo,
          ...(filterCat !== "all"    ? { category_id: filterCat } : {}),
          ...(filterBranch !== "all" ? { branch_id: filterBranch } : {}),
        },
      });
      if (error) throw new Error(await fnErrorMessage(error, "Failed to load expenses."));
      setExpenses(((data as { expenses?: Expense[] })?.expenses ?? []));
    } catch (ex: unknown) {
      setLoadErr(ex instanceof Error ? ex.message : "Failed to load expenses.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, dateFrom, dateTo, filterCat, filterBranch]);

  useEffect(() => {
    void fetchExpenses();
  }, [fetchExpenses]);

  // ── Fetch categories (refreshable) ─────────────────────────────────────

  const fetchCategories = useCallback(async () => {
    const sb = supabaseBrowser();
    const { data } = await sb.functions.invoke("expense-categories-list", {
      body: { workspace_id: workspaceId },
    });
    const categoriesData = (data as { categories?: Category[] })?.categories;
    if (categoriesData) setCategories(categoriesData);
  }, [workspaceId]);

  // ── Total ───────────────────────────────────────────────────────────────

  const total = useMemo(
    () => expenses.reduce((sum, e) => sum + Number(e.amount), 0),
    [expenses],
  );

  // ── Quick date presets ──────────────────────────────────────────────────

  function setPreset(preset: "this_month" | "last_month" | "this_year") {
    const n = new Date();
    if (preset === "this_month") {
      setDateFrom(ymd(new Date(n.getFullYear(), n.getMonth(), 1)));
      setDateTo(today());
    } else if (preset === "last_month") {
      const first = new Date(n.getFullYear(), n.getMonth() - 1, 1);
      const last  = new Date(n.getFullYear(), n.getMonth(), 0);
      setDateFrom(ymd(first));
      setDateTo(ymd(last));
    } else if (preset === "this_year") {
      setDateFrom(ymd(new Date(n.getFullYear(), 0, 1)));
      setDateTo(today());
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const VIEWS: { id: View; label: string }[] = [
    { id: "expenses",   label: "Expenses" },
    { id: "categories", label: "Categories" },
  ];

  return (
    <>
      {/* ── Header ── */}
      <div className="admin-header">
        <div>
          <h1>Expenses</h1>
          <div className="sub">Track overhead costs by category and branch.</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button
            className="btn-xs primary"
            onClick={() => setAddOpen(true)}
            style={{ fontSize: 13, padding: "8px 16px" }}
          >
            + Add Expense
          </button>
        </div>
      </div>

      <div className="admin-body">
        {/* ── Tab bar ── */}
        <div style={{
          display: "flex", gap: 4, marginBottom: 20,
          borderBottom: "1px solid rgba(var(--tint-rgb), 0.1)", paddingBottom: 12,
        }}>
          {VIEWS.map(v => (
            <button
              key={v.id}
              className="btn-xs"
              onClick={() => setView(v.id)}
              style={view === v.id ? {
                background: "rgba(var(--tint-rgb), 0.12)",
                borderColor: "rgba(var(--tint-rgb), 0.4)",
                color: "var(--amber-bright)",
              } : {}}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* ══ EXPENSES TAB ══ */}
        {view === "expenses" && (
          <>
            {/* Filters */}
            <div style={{
              display: "flex", flexWrap: "wrap", alignItems: "flex-end",
              gap: 10, marginBottom: 20,
              padding: "14px 16px",
              background: "rgba(var(--tint-rgb), 0.03)",
              border: "1px solid rgba(var(--tint-rgb), 0.08)",
              borderRadius: 10,
            }}>
              {/* Date range */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ ...MONO }}>From</label>
                <input
                  type="date"
                  className="input"
                  style={{ height: 32, padding: "0 8px", fontSize: 13, width: 150 }}
                  value={dateFrom}
                  max={dateTo}
                  onChange={e => setDateFrom(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ ...MONO }}>To</label>
                <input
                  type="date"
                  className="input"
                  style={{ height: 32, padding: "0 8px", fontSize: 13, width: 150 }}
                  value={dateTo}
                  min={dateFrom}
                  max={today()}
                  onChange={e => setDateTo(e.target.value)}
                />
              </div>

              {/* Quick presets */}
              <div style={{ display: "flex", gap: 4, alignSelf: "flex-end" }}>
                {(["this_month", "last_month", "this_year"] as const).map(p => (
                  <button
                    key={p}
                    className="btn-xs"
                    onClick={() => setPreset(p)}
                    style={{ fontSize: 11 }}
                  >
                    {p === "this_month" ? "This month" : p === "last_month" ? "Last month" : "This year"}
                  </button>
                ))}
              </div>

              {/* Category filter */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ ...MONO }}>Category</label>
                <select
                  className="input"
                  style={{ height: 32, padding: "0 8px", fontSize: 13, width: 160 }}
                  value={filterCat}
                  onChange={e => setFilterCat(e.target.value)}
                >
                  <option value="all">All Categories</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Branch filter — only shown if multi-branch */}
              {branches.length > 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ ...MONO }}>Branch</label>
                  <select
                    className="input"
                    style={{ height: 32, padding: "0 8px", fontSize: 13, width: 160 }}
                    value={filterBranch}
                    onChange={e => setFilterBranch(e.target.value)}
                  >
                    <option value="all">All Branches</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Error */}
            {loadErr && (
              <div style={{
                marginBottom: 14, padding: "10px 14px", borderRadius: 8,
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                color: "var(--err, #ff5050)", fontSize: 13,
              }}>
                {loadErr}
                <button
                  className="btn-xs"
                  style={{ marginLeft: 12 }}
                  onClick={() => void fetchExpenses()}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Table */}
            {loading ? (
              <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                Loading expenses…
              </div>
            ) : expenses.length === 0 ? (
              <EmptyState
                icon="💸"
                title="No expenses found"
                body={
                  filterCat !== "all" || filterBranch !== "all"
                    ? "No expenses match the current filters. Try clearing the category or branch filter."
                    : "No expenses recorded for this date range. Click \"+ Add Expense\" to log your first one."
                }
              />
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Vendor / Description</th>
                      <th>Payment Method</th>
                      <th>Branch</th>
                      <th style={{ textAlign: "right" }}>Amount</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map(e => (
                      <tr key={e.id}>
                        <td className="dim" style={{ whiteSpace: "nowrap", fontFamily: "var(--f-mono)", fontSize: 12 }}>
                          {fmtDate(e.expense_date)}
                        </td>
                        <td>
                          {e.expense_categories ? (
                            <span className="pill neutral" style={{ fontSize: 11 }}>
                              {e.expense_categories.name}
                            </span>
                          ) : (
                            <span className="dim" style={{ fontSize: 12, fontStyle: "italic" }}>—</span>
                          )}
                        </td>
                        <td style={{ maxWidth: 220 }}>
                          <div
                            className="bold"
                            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          >
                            {e.vendor_name || <span className="dim" style={{ fontStyle: "italic", fontWeight: 400 }}>—</span>}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                            {PAYMENT_LABEL[e.payment_method] ?? e.payment_method}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                            {e.branches?.name ?? "—"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <span className="bold">{peso(Number(e.amount))}</span>
                        </td>
                        <td style={{ maxWidth: 200 }}>
                          {e.notes ? (
                            <span
                              className="dim"
                              style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
                              title={e.notes}
                            >
                              {e.notes}
                            </span>
                          ) : (
                            <span className="dim" style={{ fontSize: 12, fontStyle: "italic" }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer total */}
            {!loading && expenses.length > 0 && (
              <div style={{
                display: "flex", justifyContent: "flex-end", alignItems: "center",
                marginTop: 16, padding: "14px 20px",
                background: "rgba(var(--tint-rgb), 0.04)",
                border: "1px solid rgba(var(--tint-rgb), 0.1)",
                borderRadius: 10, gap: 16,
              }}>
                <span style={{ ...MONO }}>
                  {expenses.length} expense{expenses.length !== 1 ? "s" : ""}
                </span>
                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--amber-bright)" }}>
                  Total: {peso(total)}
                </span>
              </div>
            )}
          </>
        )}

        {/* ══ CATEGORIES TAB ══ */}
        {view === "categories" && (
          <CategoriesPanel
            workspaceId={workspaceId}
            categories={categories}
            onCategoriesChanged={() => void fetchCategories()}
          />
        )}
      </div>

      {/* ── Add Expense SlideOver ── */}
      <SlideOver
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Expense"
        subtitle="Record an overhead cost"
        centered
        width={480}
      >
        <AddExpenseForm
          workspaceId={workspaceId}
          categories={categories}
          branches={branches}
          onSaved={() => {
            setAddOpen(false);
            void fetchExpenses();
          }}
          onCancel={() => setAddOpen(false)}
        />
      </SlideOver>
    </>
  );
}

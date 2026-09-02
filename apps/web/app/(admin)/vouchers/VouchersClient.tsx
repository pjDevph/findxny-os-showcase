"use client";

import { useState, useTransition, useMemo, useCallback } from "react";
import { SlideOver } from "@/components/ui/SlideOver";
import { peso } from "@/lib/config";
import { createVoucher, upsertVoucher, deleteVoucher } from "../actions";
import { supabaseBrowser } from "@/lib/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Voucher {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  max_cap: number | null;
  min_spend: number;
  usage_limit: number | null;
  usage_count: number;
  one_per_customer: boolean;
  applies_to: string;
  valid_from: string | null;
  valid_until: string | null;
  status: "active" | "scheduled" | "disabled";
  created_at: string;
}

interface Stats { redemptions: number; totalDiscount: number }

interface Props {
  workspaceId: string;
  initialVouchers: Voucher[];
  statsMap: Record<string, Stats>;
}

type DiscountType = "percentage" | "fixed";
type AppliesTo   = "order" | "food" | "drinks" | "rooms" | "amenities";
type Status      = "active" | "scheduled" | "disabled";

type Tab = "vouchers" | "checker" | "usage";

// ── Constants ──────────────────────────────────────────────────────────────────

const APPLIES_OPTIONS: { value: AppliesTo; label: string }[] = [
  { value: "order",     label: "Entire Order" },
  { value: "food",      label: "Food only" },
  { value: "drinks",    label: "Drinks only" },
  { value: "rooms",     label: "Rooms only" },
  { value: "amenities", label: "Amenities only" },
];

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "active",    label: "Active" },
  { value: "scheduled", label: "Scheduled" },
  { value: "disabled",  label: "Disabled" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function effectiveStatus(v: Voucher): "active" | "scheduled" | "expired" | "used_up" | "disabled" {
  if (v.status === "disabled") return "disabled";
  const now = new Date();
  if (v.valid_from  && new Date(v.valid_from)  > now) return "scheduled";
  if (v.valid_until && new Date(v.valid_until) < now) return "expired";
  if (v.usage_limit !== null && v.usage_count >= v.usage_limit) return "used_up";
  return "active";
}

const EFF_STYLE: Record<string, { bg: string; color: string }> = {
  active:    { bg: "rgba(34,197,94,0.12)",  color: "#4ade80" },
  scheduled: { bg: "rgba(var(--tint-rgb), 0.12)", color: "var(--amber)" },
  expired:   { bg: "rgba(99,102,241,0.12)", color: "#a5b4fc" },
  used_up:   { bg: "rgba(239,68,68,0.12)",  color: "#f87171" },
  disabled:  { bg: "rgba(120,120,120,0.12)",color: "#888"    },
};

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function discountLabel(v: Voucher) {
  if (v.discount_type === "percentage") {
    const capStr = v.max_cap ? ` (max ${peso(v.max_cap)})` : "";
    return `${v.discount_value}%${capStr}`;
  }
  return peso(v.discount_value);
}

// ── Form state ─────────────────────────────────────────────────────────────────

interface FormState {
  code: string;
  name: string;
  description: string;
  discount_type: DiscountType;
  discount_value: string;
  max_cap: string;
  min_spend: string;
  usage_limit: string;
  one_per_customer: boolean;
  applies_to: AppliesTo;
  valid_from: string;
  valid_until: string;
  status: Status;
}

const EMPTY_FORM: FormState = {
  code: "", name: "", description: "",
  discount_type: "fixed", discount_value: "", max_cap: "",
  min_spend: "0", usage_limit: "",
  one_per_customer: false,
  applies_to: "order",
  valid_from: "", valid_until: "",
  status: "active",
};

function voucherToForm(v: Voucher): FormState {
  return {
    code:             v.code,
    name:             v.name,
    description:      v.description ?? "",
    discount_type:    v.discount_type,
    discount_value:   String(v.discount_value),
    max_cap:          v.max_cap != null ? String(v.max_cap) : "",
    min_spend:        String(v.min_spend),
    usage_limit:      v.usage_limit != null ? String(v.usage_limit) : "",
    one_per_customer: v.one_per_customer,
    applies_to:       v.applies_to as AppliesTo,
    valid_from:       v.valid_from  ? v.valid_from.slice(0, 10)  : "",
    valid_until:      v.valid_until ? v.valid_until.slice(0, 10) : "",
    status:           v.status,
  };
}

// ── Shared input style ─────────────────────────────────────────────────────────

const IS: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: "var(--bg-1)", border: "1px solid var(--line)",
  borderRadius: 8, padding: "9px 12px",
  color: "var(--text-1)", fontSize: 14,
  outline: "none",
};
const LABEL: React.CSSProperties = {
  display: "block", fontSize: 11, letterSpacing: "0.1em",
  textTransform: "uppercase", fontFamily: "var(--f-mono)",
  color: "var(--text-3)", marginBottom: 6,
};
const FIELD: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 0 };

// ── Component ──────────────────────────────────────────────────────────────────

export default function VouchersClient({ workspaceId, initialVouchers, statsMap }: Props) {
  const [vouchers, setVouchers] = useState<Voucher[]>(initialVouchers);
  const [tab, setTab] = useState<Tab>("vouchers");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [slideOpen, setSlideOpen] = useState(false);
  const [editing, setEditing] = useState<Voucher | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [isPending, startTransition] = useTransition();

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Checker state ─────────────────────────────────────────────────────────────
  interface CheckResult {
    valid: boolean;
    reason: string | null;
    discount_amount: number;
    final_total: number;
    voucher?: {
      id: string; code: string; name: string; applies_to: string;
      discount_type: string; discount_value: number; max_cap: number | null;
      min_spend: number; usage_limit: number | null; usage_count: number;
      valid_from: string | null; valid_until: string | null;
    } | null;
  }

  const [checkerCode, setCheckerCode]         = useState("");
  const [checkerSubtotal, setCheckerSubtotal] = useState("");
  const [checkerFood, setCheckerFood]         = useState("");
  const [checkerDrinks, setCheckerDrinks]     = useState("");
  const [checkerAdvanced, setCheckerAdvanced] = useState(false);
  const [checkResult, setCheckResult]         = useState<CheckResult | null>(null);
  const [checking, setChecking]               = useState(false);

  async function runCheck(e: React.FormEvent) {
    e.preventDefault();
    const code = checkerCode.trim().toUpperCase();
    if (!code) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const supabase = supabaseBrowser();
      const params: Record<string, unknown> = {
        code,
        subtotal: parseFloat(checkerSubtotal) || 0,
      };
      if (checkerAdvanced && checkerFood)   params.food_subtotal   = parseFloat(checkerFood)   || 0;
      if (checkerAdvanced && checkerDrinks) params.drinks_subtotal = parseFloat(checkerDrinks) || 0;

      const { data, error } = await supabase.functions.invoke("pos-data", {
        body: { workspace_id: workspaceId, resource: "vouchers-validate", params },
      });
      if (error) throw error;
      setCheckResult((data as Record<string, CheckResult>)["vouchers-validate"] ?? null);
    } catch {
      setCheckResult({ valid: false, reason: "Request failed — check console.", discount_amount: 0, final_total: parseFloat(checkerSubtotal) || 0 });
    } finally {
      setChecking(false);
    }
  }

  function resetChecker() {
    setCheckerCode("");
    setCheckerSubtotal("");
    setCheckerFood("");
    setCheckerDrinks("");
    setCheckResult(null);
    setCheckerAdvanced(false);
  }

  // ── Filtered list ────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = vouchers;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(v =>
        v.code.toLowerCase().includes(q) || v.name.toLowerCase().includes(q)
      );
    }
    if (filterStatus !== "all") {
      list = list.filter(v => effectiveStatus(v) === filterStatus);
    }
    return list;
  }, [vouchers, search, filterStatus]);

  // ── Usage tab data ───────────────────────────────────────────────────────────

  const usageRows = useMemo(() =>
    [...vouchers]
      .map(v => ({ v, stats: statsMap[v.id] ?? { redemptions: 0, totalDiscount: 0 } }))
      .filter(({ stats }) => stats.redemptions > 0)
      .sort((a, b) => b.stats.redemptions - a.stats.redemptions),
  [vouchers, statsMap]);

  // ── Slide-over open helpers ──────────────────────────────────────────────────

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setSlideOpen(true);
  }, []);

  const openEdit = useCallback((v: Voucher) => {
    setEditing(v);
    setForm(voucherToForm(v));
    setFormError("");
    setSlideOpen(true);
  }, []);

  const closeSlide = useCallback(() => {
    setSlideOpen(false);
    setEditing(null);
    setFormError("");
  }, []);

  // ── Submit ───────────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    const payload: Record<string, unknown> = {
      workspace_id:     workspaceId,
      code:             form.code.trim().toUpperCase(),
      name:             form.name.trim(),
      description:      form.description.trim() || null,
      discount_type:    form.discount_type,
      discount_value:   parseFloat(form.discount_value) || 0,
      max_cap:          form.discount_type === "percentage" && form.max_cap ? parseFloat(form.max_cap) : null,
      min_spend:        parseFloat(form.min_spend) || 0,
      usage_limit:      form.usage_limit ? parseInt(form.usage_limit) : null,
      one_per_customer: form.one_per_customer,
      applies_to:       form.applies_to,
      valid_from:       form.valid_from  || null,
      valid_until:      form.valid_until || null,
      status:           form.status,
    };
    if (editing) payload.id = editing.id;

    startTransition(async () => {
      try {
        const result = editing
          ? await upsertVoucher(payload)
          : await createVoucher(payload);
        const saved = result.voucher as unknown as Voucher;
        setVouchers(prev =>
          editing
            ? prev.map(v => v.id === saved.id ? saved : v)
            : [saved, ...prev]
        );
        closeSlide();
      } catch (err: unknown) {
        setFormError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  function confirmDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteVoucher(id, workspaceId);
        setVouchers(prev => prev.filter(v => v.id !== id));
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Delete failed");
      } finally {
        setDeletingId(null);
      }
    });
  }

  // ── Quick toggle status ───────────────────────────────────────────────────────

  function toggleStatus(v: Voucher) {
    const newStatus = v.status === "disabled" ? "active" : "disabled";
    startTransition(async () => {
      try {
        const result = await upsertVoucher({ workspace_id: workspaceId, id: v.id, status: newStatus });
        const saved = result.voucher as unknown as Voucher;
        setVouchers(prev => prev.map(x => x.id === saved.id ? saved : x));
      } catch { /* silent */ }
    });
  }

  // ── Totals ───────────────────────────────────────────────────────────────────

  const totalDiscount = useMemo(() =>
    Object.values(statsMap).reduce((s, r) => s + r.totalDiscount, 0),
  [statsMap]);

  const totalRedemptions = useMemo(() =>
    Object.values(statsMap).reduce((s, r) => s + r.redemptions, 0),
  [statsMap]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 0 40px" }}>
      {/* Header */}
      <div className="admin-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Vouchers &amp; Discounts</h1>
          <div className="sub">{vouchers.length} voucher{vouchers.length !== 1 ? "s" : ""} · {totalRedemptions} redemption{totalRedemptions !== 1 ? "s" : ""} · {peso(totalDiscount)} total discount given</div>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ Create Voucher</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 24px 0", borderBottom: "1px solid var(--line)", marginBottom: 20 }}>
        {([
          { id: "vouchers", label: "Vouchers" },
          { id: "checker",  label: "Checker"  },
          { id: "usage",    label: "Usage"    },
        ] as { id: Tab; label: string }[]).map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 18px", fontSize: 12, letterSpacing: "0.08em",
              textTransform: "uppercase", fontFamily: "var(--f-mono)",
              background: "none", border: "none", borderBottom: tab === t.id ? "2px solid var(--amber-bright)" : "2px solid transparent",
              color: tab === t.id ? "var(--amber-bright)" : "var(--text-3)",
              cursor: "pointer", marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "vouchers" && (
        <div style={{ padding: "0 24px" }}>
          {/* Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <input
              type="search"
              placeholder="Search by code or name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...IS, width: 260, flex: "0 0 auto" }}
            />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{ ...IS, width: 160, flex: "0 0 auto" }}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="scheduled">Scheduled</option>
              <option value="expired">Expired</option>
              <option value="used_up">Used Up</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-3)", fontFamily: "var(--f-mono)", fontSize: 13 }}>
              {vouchers.length === 0 ? "No vouchers yet — create one to get started." : "No vouchers match the current filter."}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    {["Code", "Name", "Discount", "Min Spend", "Applies To", "Usage", "Valid Until", "Status", ""].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(v => {
                    const eff = effectiveStatus(v);
                    const es  = EFF_STYLE[eff];
                    const stats = statsMap[v.id] ?? { redemptions: 0, totalDiscount: 0 };
                    return (
                      <tr key={v.id} style={{ borderBottom: "1px solid var(--line-subtle, rgba(255,255,255,0.05))" }}>
                        <td style={{ padding: "12px 12px", fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 700, color: "var(--amber-bright)", letterSpacing: "0.06em" }}>
                          {v.code}
                        </td>
                        <td style={{ padding: "12px 12px" }}>
                          <div style={{ fontWeight: 600, color: "var(--text-1)" }}>{v.name}</div>
                          {v.description && <div style={{ color: "var(--text-3)", fontSize: 11, marginTop: 2 }}>{v.description}</div>}
                        </td>
                        <td style={{ padding: "12px 12px", fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--text-1)", whiteSpace: "nowrap" }}>
                          {discountLabel(v)}
                        </td>
                        <td style={{ padding: "12px 12px", fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                          {v.min_spend > 0 ? peso(v.min_spend) : "—"}
                        </td>
                        <td style={{ padding: "12px 12px", fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap", textTransform: "capitalize" }}>
                          {v.applies_to === "order" ? "Entire Order" : v.applies_to}
                        </td>
                        <td style={{ padding: "12px 12px", fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                          {v.usage_count}
                          {v.usage_limit != null ? ` / ${v.usage_limit}` : ""}
                          {stats.totalDiscount > 0 && (
                            <div style={{ color: "var(--text-3)", fontSize: 10 }}>{peso(stats.totalDiscount)} given</div>
                          )}
                        </td>
                        <td style={{ padding: "12px 12px", fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                          {fmtDate(v.valid_until)}
                        </td>
                        <td style={{ padding: "12px 12px" }}>
                          <span style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, fontFamily: "var(--f-mono)", letterSpacing: "0.08em", textTransform: "uppercase", background: es.bg, color: es.color }}>
                            {eff}
                          </span>
                        </td>
                        <td style={{ padding: "12px 12px" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              className="btn-xs"
                              onClick={() => toggleStatus(v)}
                              disabled={isPending}
                              title={v.status === "disabled" ? "Enable" : "Disable"}
                            >
                              {v.status === "disabled" ? "Enable" : "Disable"}
                            </button>
                            <button type="button" className="btn-xs" onClick={() => openEdit(v)}>Edit</button>
                            <button
                              type="button"
                              className="btn-xs btn-danger"
                              onClick={() => setDeletingId(v.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "checker" && (
        <div style={{ padding: "0 24px", maxWidth: 560 }}>
          <p style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 20 }}>
            Test any voucher code against an order subtotal. Uses the same validation rules as POS checkout — read-only, no usage is recorded.
          </p>

          <form onSubmit={runCheck} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={FIELD}>
              <label style={LABEL}>Voucher Code</label>
              <input
                style={{ ...IS, fontFamily: "var(--f-mono)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}
                value={checkerCode}
                onChange={e => { setCheckerCode(e.target.value.toUpperCase()); setCheckResult(null); }}
                placeholder="e.g. SAVE20"
                required
                autoFocus
              />
            </div>

            <div style={FIELD}>
              <label style={LABEL}>Order Subtotal (₱)</label>
              <input
                style={IS}
                type="number"
                min={0}
                step="0.01"
                value={checkerSubtotal}
                onChange={e => { setCheckerSubtotal(e.target.value); setCheckResult(null); }}
                placeholder="e.g. 500.00"
              />
            </div>

            <button
              type="button"
              onClick={() => setCheckerAdvanced(v => !v)}
              style={{ background: "none", border: "none", padding: 0, color: "var(--text-3)", fontSize: 12, fontFamily: "var(--f-mono)", cursor: "pointer", textAlign: "left", letterSpacing: "0.08em" }}
            >
              {checkerAdvanced ? "▾" : "▸"} CATEGORY SUBTOTALS (for Food-only / Drinks-only vouchers)
            </button>

            {checkerAdvanced && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "12px 16px", background: "var(--bg-1)", borderRadius: 8, border: "1px solid var(--line)" }}>
                <div style={FIELD}>
                  <label style={LABEL}>Food Subtotal (₱)</label>
                  <input style={IS} type="number" min={0} step="0.01" value={checkerFood} onChange={e => { setCheckerFood(e.target.value); setCheckResult(null); }} placeholder="0.00" />
                </div>
                <div style={FIELD}>
                  <label style={LABEL}>Drinks Subtotal (₱)</label>
                  <input style={IS} type="number" min={0} step="0.01" value={checkerDrinks} onChange={e => { setCheckerDrinks(e.target.value); setCheckResult(null); }} placeholder="0.00" />
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" className="btn-primary" disabled={checking || !checkerCode.trim()} style={{ flex: 1 }}>
                {checking ? "Checking…" : "Check Voucher"}
              </button>
              {(checkerCode || checkResult) && (
                <button type="button" className="btn-secondary" onClick={resetChecker}>Clear</button>
              )}
            </div>
          </form>

          {checkResult && (
            <div style={{
              marginTop: 24,
              padding: 20,
              borderRadius: 10,
              border: `1px solid ${checkResult.valid ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
              background: checkResult.valid ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)",
            }}>
              {/* Status badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={{
                  padding: "4px 12px", borderRadius: 6, fontSize: 11,
                  fontFamily: "var(--f-mono)", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                  background: checkResult.valid ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
                  color: checkResult.valid ? "#4ade80" : "#f87171",
                }}>
                  {checkResult.valid ? "✓ Valid" : "✗ Invalid"}
                </span>
                {checkResult.voucher && (
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--amber-bright)", fontWeight: 700, letterSpacing: "0.06em" }}>
                    {checkResult.voucher.code}
                  </span>
                )}
              </div>

              {checkResult.valid && checkResult.voucher ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 13, color: "var(--text-2)" }}>{checkResult.voucher.name}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 4 }}>
                    {[
                      { label: "Subtotal",  value: peso(parseFloat(checkerSubtotal) || 0) },
                      { label: "Discount",  value: `-${peso(checkResult.discount_amount)}`, color: "#4ade80" },
                      { label: "Final Total", value: peso(checkResult.final_total), large: true },
                    ].map(({ label, value, color, large }) => (
                      <div key={label} style={{ background: "var(--bg-1)", borderRadius: 8, padding: "12px 14px" }}>
                        <div style={{ fontSize: 10, fontFamily: "var(--f-mono)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: large ? 20 : 15, fontWeight: 700, fontFamily: "var(--f-mono)", color: color ?? "var(--text-1)" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                    {checkResult.voucher.min_spend > 0 && (
                      <span style={{ padding: "3px 8px", borderRadius: 4, fontSize: 11, fontFamily: "var(--f-mono)", background: "var(--bg-1)", color: "var(--text-3)" }}>Min spend {peso(checkResult.voucher.min_spend)}</span>
                    )}
                    {checkResult.voucher.applies_to !== "order" && (
                      <span style={{ padding: "3px 8px", borderRadius: 4, fontSize: 11, fontFamily: "var(--f-mono)", background: "var(--bg-1)", color: "var(--text-3)", textTransform: "capitalize" }}>{checkResult.voucher.applies_to} only</span>
                    )}
                    {checkResult.voucher.usage_limit != null && (
                      <span style={{ padding: "3px 8px", borderRadius: 4, fontSize: 11, fontFamily: "var(--f-mono)", background: "var(--bg-1)", color: "var(--text-3)" }}>{checkResult.voucher.usage_count}/{checkResult.voucher.usage_limit} used</span>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 14, color: "#f87171" }}>
                  {checkResult.reason}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "usage" && (
        <div style={{ padding: "0 24px" }}>
          {usageRows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-3)", fontFamily: "var(--f-mono)", fontSize: 13 }}>
              No redemptions recorded yet.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    {["Code", "Name", "Redemptions", "Total Discount Given", "Avg Discount", "Status"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usageRows.map(({ v, stats }) => {
                    const eff = effectiveStatus(v);
                    const es  = EFF_STYLE[eff];
                    const avg = stats.redemptions > 0 ? stats.totalDiscount / stats.redemptions : 0;
                    return (
                      <tr key={v.id} style={{ borderBottom: "1px solid var(--line-subtle, rgba(255,255,255,0.05))" }}>
                        <td style={{ padding: "12px 12px", fontFamily: "var(--f-mono)", fontSize: 12, fontWeight: 700, color: "var(--amber-bright)", letterSpacing: "0.06em" }}>{v.code}</td>
                        <td style={{ padding: "12px 12px", color: "var(--text-1)" }}>{v.name}</td>
                        <td style={{ padding: "12px 12px", fontFamily: "var(--f-mono)", fontSize: 13, color: "var(--text-1)", fontWeight: 600 }}>{stats.redemptions.toLocaleString()}</td>
                        <td style={{ padding: "12px 12px", fontFamily: "var(--f-mono)", fontSize: 13, color: "var(--text-1)" }}>{peso(stats.totalDiscount)}</td>
                        <td style={{ padding: "12px 12px", fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--text-2)" }}>{peso(avg)}</td>
                        <td style={{ padding: "12px 12px" }}>
                          <span style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, fontFamily: "var(--f-mono)", letterSpacing: "0.08em", textTransform: "uppercase", background: es.bg, color: es.color }}>{eff}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Delete confirm dialog */}
      {deletingId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--bg-0)", border: "1px solid var(--line)", borderRadius: 12, padding: 28, width: 360, maxWidth: "90vw" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Delete Voucher?</h3>
            <p style={{ margin: "0 0 20px", color: "var(--text-2)", fontSize: 13 }}>
              The voucher will be permanently deleted. Redemption history is preserved.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-xs" onClick={() => setDeletingId(null)} disabled={isPending}>Cancel</button>
              <button className="btn-xs btn-danger" onClick={() => confirmDelete(deletingId)} disabled={isPending}>
                {isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit SlideOver */}
      <SlideOver
        open={slideOpen}
        onClose={closeSlide}
        title={editing ? "Edit Voucher" : "Create Voucher"}
        subtitle={editing ? `Code: ${editing.code}` : undefined}
        width={480}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={closeSlide} disabled={isPending}>Cancel</button>
            <button
              type="submit" form="voucher-form" className="btn-primary"
              disabled={isPending || !form.code.trim() || !form.name.trim() || !form.discount_value}
            >
              {isPending ? "Saving…" : editing ? "Save Changes" : "Create Voucher"}
            </button>
          </>
        }
      >
        <form id="voucher-form" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {formError && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", color: "#f87171", fontSize: 13 }}>
              {formError}
            </div>
          )}

          <div style={FIELD}>
            <label style={LABEL}>Voucher Code *</label>
            <input style={IS} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. SAVE20" required maxLength={50} />
          </div>

          <div style={FIELD}>
            <label style={LABEL}>Name *</label>
            <input style={IS} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. 20% Off Opening Promo" required maxLength={200} />
          </div>

          <div style={FIELD}>
            <label style={LABEL}>Description</label>
            <textarea style={{ ...IS, resize: "vertical", minHeight: 60 }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional note for internal reference" maxLength={500} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={FIELD}>
              <label style={LABEL}>Discount Type *</label>
              <select style={IS} value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value as DiscountType, max_cap: "" }))}>
                <option value="fixed">Fixed (₱)</option>
                <option value="percentage">Percentage (%)</option>
              </select>
            </div>
            <div style={FIELD}>
              <label style={LABEL}>{form.discount_type === "percentage" ? "Discount %" : "Discount Amount"} *</label>
              <input style={IS} type="number" min={0} step="0.01" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))} placeholder={form.discount_type === "percentage" ? "e.g. 20" : "e.g. 100"} required />
            </div>
          </div>

          {form.discount_type === "percentage" && (
            <div style={FIELD}>
              <label style={LABEL}>Max Cap (₱) <span style={{ color: "var(--text-4)", fontWeight: 400 }}>optional</span></label>
              <input style={IS} type="number" min={0} step="0.01" value={form.max_cap} onChange={e => setForm(f => ({ ...f, max_cap: e.target.value }))} placeholder="Leave blank for no cap" />
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={FIELD}>
              <label style={LABEL}>Minimum Spend (₱)</label>
              <input style={IS} type="number" min={0} step="0.01" value={form.min_spend} onChange={e => setForm(f => ({ ...f, min_spend: e.target.value }))} placeholder="0" />
            </div>
            <div style={FIELD}>
              <label style={LABEL}>Usage Limit <span style={{ color: "var(--text-4)", fontWeight: 400 }}>optional</span></label>
              <input style={IS} type="number" min={1} step="1" value={form.usage_limit} onChange={e => setForm(f => ({ ...f, usage_limit: e.target.value }))} placeholder="Unlimited" />
            </div>
          </div>

          <div style={FIELD}>
            <label style={LABEL}>Applies To</label>
            <select style={IS} value={form.applies_to} onChange={e => setForm(f => ({ ...f, applies_to: e.target.value as AppliesTo }))}>
              {APPLIES_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={FIELD}>
              <label style={LABEL}>Valid From <span style={{ color: "var(--text-4)", fontWeight: 400 }}>optional</span></label>
              <input style={IS} type="date" value={form.valid_from} onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))} />
            </div>
            <div style={FIELD}>
              <label style={LABEL}>Valid Until <span style={{ color: "var(--text-4)", fontWeight: 400 }}>optional</span></label>
              <input style={IS} type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} />
            </div>
          </div>

          <div style={FIELD}>
            <label style={LABEL}>Status</label>
            <select style={IS} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Status }))}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer", fontSize: 13, color: "var(--text-2)" }}>
            <input type="checkbox" checked={form.one_per_customer} onChange={e => setForm(f => ({ ...f, one_per_customer: e.target.checked }))} />
            One use per customer
          </label>
        </form>
      </SlideOver>
    </div>
  );
}

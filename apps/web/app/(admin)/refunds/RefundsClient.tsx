"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchRefunds } from "./actions";
import { peso } from "@/lib/config";
import { supabaseBrowser } from "@/lib/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────────

interface Refund {
  id: string;
  created_at: string;
  amount: number;
  currency: string;
  reason: string | null;
  status: string | null;
  provider: string;
  order_id: string | null;
  order_no: string | null;
  manager_approval_id: string | null;
  approved_by_name: string | null;
}

interface RefundData {
  refunds: Refund[];
  total_count: number;
  total_amount: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = {
  fontFamily: "var(--f-mono)",
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

const VIOLET = "#8b5cf6";
const VIOLET_DIM = "rgba(139,92,246,0.12)";
const VIOLET_BORDER = "rgba(139,92,246,0.25)";

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

function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ── Stat card ──────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  red,
}: {
  label: string;
  value: string;
  sub?: string;
  red?: boolean;
}) {
  return (
    <div
      style={{
        flex: "1 1 160px",
        padding: "16px 20px",
        borderRadius: 10,
        background: VIOLET_DIM,
        border: `1px solid ${VIOLET_BORDER}`,
        minWidth: 140,
      }}
    >
      <div style={{ ...MONO, marginBottom: 6 }}>{label}</div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: red ? "#ef4444" : VIOLET,
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 24px",
        gap: 12,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 36, opacity: 0.4 }}>↩</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>
        No refunds found
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--text-3)",
          maxWidth: 340,
          lineHeight: 1.6,
        }}
      >
        No refunds match the current filters. Try adjusting the date range or
        refund type.
      </div>
    </div>
  );
}

// ── Provider badge ─────────────────────────────────────────────────────────

function ProviderBadge({ provider }: { provider: string }) {
  const isXendit = provider === "xendit";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: isXendit
          ? "rgba(59,130,246,0.12)"
          : "rgba(120,120,120,0.12)",
        color: isXendit ? "#3b82f6" : "var(--text-3)",
        border: isXendit
          ? "1px solid rgba(59,130,246,0.25)"
          : "1px solid rgba(120,120,120,0.2)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {isXendit ? "Xendit" : "Cash"}
    </span>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "unknown";
  const color =
    s === "succeeded" || s === "completed"
      ? "#22c55e"
      : s === "pending"
      ? "#f59e0b"
      : s === "failed"
      ? "#ef4444"
      : "var(--text-3)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: `${color}18`,
        color,
        border: `1px solid ${color}40`,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {capitalize(s)}
    </span>
  );
}

// ── CSV export ─────────────────────────────────────────────────────────────

function exportCsv(refunds: Refund[]) {
  const headers = [
    "Date",
    "Order No",
    "Type",
    "Amount",
    "Currency",
    "Reason",
    "Status",
    "Approved By",
  ];
  const rows = refunds.map((r) => [
    fmtDateTime(r.created_at),
    r.order_no ?? "",
    r.provider === "xendit" ? "Xendit" : "Cash",
    Number(r.amount).toFixed(2),
    r.currency ?? "PHP",
    r.reason ?? "",
    r.status ?? "",
    r.approved_by_name ?? "",
  ]);
  const csv =
    [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `refunds-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Issue Refund modal ───────────────────────────────────────────────────────
// Only offered to owner/admin: manager-approval-verify does not allow a manager
// to self-approve their own request, and web has no PIN-entry modal (unlike POS)
// for a second manager/admin to approve on their behalf. Owner/admin already
// qualify for self-approval, so this stays a simple lookup → approve → refund flow.

interface OrderInfo {
  order_id: string;
  order_no: string;
  status: string;
  payment_status: string | null;
  total: number;
  branch_id: string | null;
}

function IssueRefundModal({
  workspaceId,
  onClose,
  onIssued,
}: {
  workspaceId: string;
  onClose: () => void;
  onIssued: () => void;
}) {
  const [orderNo, setOrderNo] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [payment, setPayment] = useState<{ payment_id: string; amount: number } | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function lookupOrder(e: React.FormEvent) {
    e.preventDefault();
    const no = orderNo.trim();
    if (!no) return;
    setLookingUp(true);
    setLookupError(null);
    setOrder(null);
    setPayment(null);
    try {
      const supabase = supabaseBrowser();
      const { data, error } = await supabase.functions.invoke("pos-data", {
        body: { workspace_id: workspaceId, resource: "transactions-order-detail", params: { order_no: no } },
      });
      if (error) throw error;
      const info = (data as Record<string, OrderInfo>)?.["transactions-order-info"];
      const pay = (data as Record<string, { payment_id: string; amount: number } | null>)?.["transactions-order-payment"];
      if (!info) { setLookupError(`Order "${no}" not found.`); return; }
      if (!pay) { setLookupError(`No payment found on order ${info.order_no} — nothing to refund.`); return; }
      setOrder(info);
      setPayment(pay);
      setAmount(String(pay.amount));
    } catch (ex) {
      setLookupError(ex instanceof Error ? ex.message : "Lookup failed.");
    } finally {
      setLookingUp(false);
    }
  }

  async function issueRefund() {
    if (!order || !payment) return;
    const amt = parseFloat(amount);
    if (!(amt > 0) || amt > payment.amount) {
      setSubmitError(`Amount must be between ₱0.01 and ${peso(payment.amount)}.`);
      return;
    }
    if (reason.trim().length < 3) {
      setSubmitError("Reason must be at least 3 characters.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const supabase = supabaseBrowser();
      const { data: approvalData, error: approvalErr } = await supabase.functions.invoke("manager-approval-create", {
        body: {
          workspace_id: workspaceId, branch_id: order.branch_id,
          action_type: "refund", target_type: "order", target_id: order.order_id,
          reason: reason.trim(),
        },
      });
      if (approvalErr) throw approvalErr;
      const approvalId = (approvalData as { approval?: { id: string } })?.approval?.id;
      if (!approvalId) throw new Error("Could not create approval request.");

      const { data: verifyData, error: verifyErr } = await supabase.functions.invoke("manager-approval-verify", {
        body: { workspace_id: workspaceId, approval_id: approvalId, action: "approve" },
      });
      if (verifyErr) throw verifyErr;
      const verify = verifyData as { approval?: { status?: string } | null; message?: string };
      if (verify?.approval?.status !== "approved") {
        throw new Error(verify?.message ?? "Approval was not granted.");
      }

      const { error: refundErr } = await supabase.functions.invoke("refunds-create", {
        body: {
          workspace_id: workspaceId, branch_id: order.branch_id,
          payment_id: payment.payment_id, amount: amt,
          reason: reason.trim(), manager_approval_id: approvalId,
        },
      });
      if (refundErr) throw refundErr;
      onIssued();
    } catch (ex) {
      setSubmitError(ex instanceof Error ? ex.message : "Refund failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }}>
      <div style={{
        background: "var(--bg-1, #16181c)", border: `1px solid ${VIOLET_BORDER}`,
        borderRadius: 12, padding: 24, width: 420, maxWidth: "90vw",
      }}>
        <h2 style={{ color: VIOLET, margin: "0 0 4px" }}>Issue Refund</h2>
        <p style={{ color: "var(--text-3)", fontSize: 13, margin: "0 0 16px" }}>
          Look up the order, then confirm the amount and reason.
        </p>

        <form onSubmit={lookupOrder} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            className="input" placeholder="Order number" value={orderNo}
            onChange={(e) => setOrderNo(e.target.value)} style={{ flex: 1, height: 34 }}
            disabled={!!order}
          />
          {!order && (
            <button className="btn-xs" type="submit" disabled={lookingUp || !orderNo.trim()}>
              {lookingUp ? "Looking up…" : "Find"}
            </button>
          )}
        </form>

        {lookupError && (
          <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{lookupError}</div>
        )}

        {order && payment && (
          <>
            <div style={{ display: "grid", gap: 6, fontSize: 13, marginBottom: 14, padding: 12, background: VIOLET_DIM, borderRadius: 8 }}>
              <div><span style={{ color: "var(--text-3)" }}>Order</span> — <b>{order.order_no}</b> ({order.status})</div>
              <div><span style={{ color: "var(--text-3)" }}>Amount paid</span> — <b>{peso(payment.amount)}</b></div>
            </div>

            <label style={{ ...MONO, display: "block", marginBottom: 4 }}>Refund Amount</label>
            <input
              className="input" type="number" min={0.01} max={payment.amount} step="0.01"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              style={{ width: "100%", height: 34, marginBottom: 12 }}
            />

            <label style={{ ...MONO, display: "block", marginBottom: 4 }}>Reason</label>
            <textarea
              className="input" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this being refunded?" rows={2}
              style={{ width: "100%", marginBottom: 12, resize: "vertical" }}
            />

            {submitError && (
              <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{submitError}</div>
            )}

            <button
              className="btn btn-primary" onClick={issueRefund}
              disabled={
                submitting ||
                !(parseFloat(amount) > 0) ||
                parseFloat(amount) > payment.amount ||
                reason.trim().length < 3
              }
              style={{ width: "100%" }}
            >
              {submitting ? "Processing…" : "Issue Refund"}
            </button>
          </>
        )}

        <button className="btn-xs" onClick={onClose} style={{ marginTop: 12, width: "100%" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

const PER_PAGE = 50;

export default function RefundsClient({
  workspaceId,
  initialData,
  role,
}: {
  workspaceId: string;
  initialData: RefundData;
  role: string;
}) {
  // Filter state
  const [dateFrom, setDateFrom] = useState(startOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [refundType, setRefundType] = useState<"all" | "cash" | "xendit">(
    "all"
  );
  const [searchOrder, setSearchOrder] = useState("");
  const [page, setPage] = useState(1);

  // Data state
  const [data, setData] = useState<RefundData>(initialData);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const canIssue = role === "owner" || role === "admin";

  // ── Fetch ──────────────────────────────────────────────────────────────

  const loadRefunds = useCallback(
    async (pg: number) => {
      setLoading(true);
      setLoadErr(null);
      try {
        const result = await fetchRefunds(workspaceId, {
          date_from: dateFrom,
          date_to: dateTo,
          refund_type: refundType,
          page: pg,
          per_page: PER_PAGE,
        });
        setData(result);
      } catch (ex: unknown) {
        setLoadErr(
          ex instanceof Error ? ex.message : "Failed to load refunds."
        );
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, dateFrom, dateTo, refundType]
  );

  useEffect(() => {
    setPage(1);
    void loadRefunds(1);
  }, [loadRefunds]);

  // ── Client-side search (by order no) ──────────────────────────────────

  const filtered = useMemo(() => {
    const q = searchOrder.trim().toLowerCase();
    if (!q) return data.refunds;
    return data.refunds.filter((r) =>
      (r.order_no ?? "").toLowerCase().includes(q)
    );
  }, [data.refunds, searchOrder]);

  // ── Stat card computations ─────────────────────────────────────────────

  const cashCount = useMemo(
    () => data.refunds.filter((r) => r.provider !== "xendit").length,
    [data.refunds]
  );
  const xenditCount = useMemo(
    () => data.refunds.filter((r) => r.provider === "xendit").length,
    [data.refunds]
  );

  // ── Pagination ─────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(data.total_count / PER_PAGE));

  function handlePageChange(newPage: number) {
    setPage(newPage);
    void loadRefunds(newPage);
  }

  // ── Quick date presets ─────────────────────────────────────────────────

  function setPreset(preset: "this_month" | "last_month" | "this_year") {
    const n = new Date();
    if (preset === "this_month") {
      setDateFrom(ymd(new Date(n.getFullYear(), n.getMonth(), 1)));
      setDateTo(today());
    } else if (preset === "last_month") {
      const first = new Date(n.getFullYear(), n.getMonth() - 1, 1);
      const last = new Date(n.getFullYear(), n.getMonth(), 0);
      setDateFrom(ymd(first));
      setDateTo(ymd(last));
    } else if (preset === "this_year") {
      setDateFrom(ymd(new Date(n.getFullYear(), 0, 1)));
      setDateTo(today());
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Header ── */}
      <div className="admin-header">
        <div>
          <h1 style={{ color: VIOLET }}>Refunds</h1>
          <div className="sub">
            View and audit all cash and online refunds processed.
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {canIssue && (
            <button
              className="btn btn-primary"
              onClick={() => setShowIssueModal(true)}
              style={{ fontSize: 13, padding: "8px 16px" }}
            >
              Issue Refund
            </button>
          )}
          <button
            className="btn-xs"
            onClick={() => exportCsv(filtered)}
            disabled={filtered.length === 0}
            style={{
              fontSize: 13,
              padding: "8px 16px",
              borderColor: VIOLET_BORDER,
              color: VIOLET,
            }}
          >
            Export CSV
          </button>
        </div>
      </div>

      {showIssueModal && (
        <IssueRefundModal
          workspaceId={workspaceId}
          onClose={() => setShowIssueModal(false)}
          onIssued={() => {
            setShowIssueModal(false);
            setPage(1);
            void loadRefunds(1);
          }}
        />
      )}

      <div className="admin-body">
        {/* ── Stat cards ── */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <StatCard
            label="Total Refunds"
            value={String(data.total_count)}
            sub="in selected range"
          />
          <StatCard
            label="Total Amount Refunded"
            value={peso(data.total_amount)}
            sub="sum of all refunds"
            red
          />
          <StatCard
            label="Cash Refunds"
            value={String(cashCount)}
            sub="on this page"
          />
          <StatCard
            label="Online (Xendit)"
            value={String(xenditCount)}
            sub="on this page"
          />
        </div>

        {/* ── Filters ── */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: 10,
            marginBottom: 20,
            padding: "14px 16px",
            background: VIOLET_DIM,
            border: `1px solid ${VIOLET_BORDER}`,
            borderRadius: 10,
          }}
        >
          {/* Date range */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ ...MONO }}>From</label>
            <input
              type="date"
              className="input"
              style={{ height: 32, padding: "0 8px", fontSize: 13, width: 150 }}
              value={dateFrom}
              max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
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
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          {/* Quick presets */}
          <div style={{ display: "flex", gap: 4, alignSelf: "flex-end" }}>
            {(["this_month", "last_month", "this_year"] as const).map((p) => (
              <button
                key={p}
                className="btn-xs"
                onClick={() => setPreset(p)}
                style={{ fontSize: 11 }}
              >
                {p === "this_month"
                  ? "This month"
                  : p === "last_month"
                  ? "Last month"
                  : "This year"}
              </button>
            ))}
          </div>

          {/* Refund type filter */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ ...MONO }}>Type</label>
            <select
              className="input"
              style={{ height: 32, padding: "0 8px", fontSize: 13, width: 140 }}
              value={refundType}
              onChange={(e) =>
                setRefundType(e.target.value as "all" | "cash" | "xendit")
              }
            >
              <option value="all">All Types</option>
              <option value="cash">Cash</option>
              <option value="xendit">Xendit</option>
            </select>
          </div>

          {/* Search by order no */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ ...MONO }}>Order No</label>
            <input
              type="text"
              className="input"
              style={{ height: 32, padding: "0 8px", fontSize: 13, width: 160 }}
              placeholder="Search order no…"
              value={searchOrder}
              onChange={(e) => setSearchOrder(e.target.value)}
            />
          </div>
        </div>

        {/* ── Error ── */}
        {loadErr && (
          <div
            style={{
              marginBottom: 14,
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "var(--err, #ff5050)",
              fontSize: 13,
            }}
          >
            {loadErr}
            <button
              className="btn-xs"
              style={{ marginLeft: 12 }}
              onClick={() => void loadRefunds(page)}
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Table ── */}
        {loading ? (
          <div
            style={{
              padding: "40px 0",
              textAlign: "center",
              color: "var(--text-3)",
              fontSize: 13,
            }}
          >
            Loading refunds…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Order No</th>
                  <th>Type</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Approved By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td
                      className="dim"
                      style={{
                        whiteSpace: "nowrap",
                        fontFamily: "var(--f-mono)",
                        fontSize: 11,
                      }}
                    >
                      {fmtDateTime(r.created_at)}
                    </td>
                    <td>
                      {r.order_no ? (
                        <span
                          style={{
                            fontFamily: "var(--f-mono)",
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--text-1)",
                          }}
                        >
                          {r.order_no}
                        </span>
                      ) : (
                        <span className="dim" style={{ fontSize: 12, fontStyle: "italic" }}>
                          —
                        </span>
                      )}
                    </td>
                    <td>
                      <ProviderBadge provider={r.provider} />
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <span
                        className="bold"
                        style={{ color: "#ef4444" }}
                      >
                        {peso(Number(r.amount))}
                      </span>
                    </td>
                    <td style={{ maxWidth: 200 }}>
                      {r.reason ? (
                        <span
                          className="dim"
                          style={{
                            fontSize: 12,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "block",
                          }}
                          title={r.reason}
                        >
                          {r.reason}
                        </span>
                      ) : (
                        <span
                          className="dim"
                          style={{ fontSize: 12, fontStyle: "italic" }}
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td>
                      <span
                        style={{ fontSize: 13, color: "var(--text-2)" }}
                      >
                        {r.approved_by_name ?? (
                          <span
                            className="dim"
                            style={{ fontSize: 12, fontStyle: "italic" }}
                          >
                            —
                          </span>
                        )}
                      </span>
                    </td>
                    <td>
                      {r.order_no && (
                        <a
                          href={`/transactions?order=${encodeURIComponent(r.order_no)}`}
                          style={{
                            fontSize: 12,
                            color: VIOLET,
                            textDecoration: "none",
                            fontWeight: 500,
                          }}
                        >
                          View txn →
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Footer: total + pagination ── */}
        {!loading && filtered.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 16,
              padding: "14px 20px",
              background: VIOLET_DIM,
              border: `1px solid ${VIOLET_BORDER}`,
              borderRadius: 10,
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <span style={{ ...MONO }}>
              {data.total_count} refund{data.total_count !== 1 ? "s" : ""} total
            </span>

            {/* Pagination controls */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                className="btn-xs"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1 || loading}
              >
                ← Prev
              </button>
              <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                Page {page} of {totalPages}
              </span>
              <button
                className="btn-xs"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages || loading}
              >
                Next →
              </button>
            </div>

            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#ef4444",
              }}
            >
              Total: {peso(data.total_amount)}
            </span>
          </div>
        )}
      </div>
    </>
  );
}

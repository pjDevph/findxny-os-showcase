"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { peso } from "@/lib/config";

type TrackData = NonNullable<Awaited<ReturnType<typeof api.trackOrder>>>;
type TrackStash = { name: string; phone: string; email?: string; method: string; method_id?: string; ticket_no?: string | null };

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending Payment",
  new: "Preparing",
  accepted: "Preparing",
  preparing: "Preparing",
  ready: "Ready for Pickup",
  served: "Completed",
  completed: "Completed",
  cancelled: "Cancelled",
};

// Kitchen progression rank — drives which tracking step is done/active.
// new + accepted are both "queued, not cooking yet"; served + completed are
// both "finished". Anything unknown falls back to queued (0).
const KITCHEN_RANK: Record<string, number> = {
  new: 0, accepted: 0, preparing: 1, ready: 2, served: 3, completed: 3,
};

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

// Order status carries the same progression and is always maintained even when
// an order has no kitchen ticket (e.g. no kitchen-required items). We take the
// furthest-along of the two so the tracker never lags behind reality.
const ORDER_RANK: Record<string, number> = {
  pending: 0, preparing: 1, ready: 2, completed: 3,
};

function buildSteps(
  order: TrackData["order"],
  isPaid: boolean,
  ticketStatus: string | null,
  method: string | undefined,
) {
  // Once paid, the order is at least "queued" (0) even before the kitchen
  // formally advances the ticket; before payment there is no kitchen stage.
  const stage = isPaid
    ? Math.max(KITCHEN_RANK[ticketStatus ?? ""] ?? 0, ORDER_RANK[order.status] ?? 0)
    : -1;
  return [
    { key: "placed", label: "Order placed", ts: order.created_at, done: true },
    {
      key: "paid",
      label: `Payment ${isPaid ? "received" : "pending"}${method ? " · " + method : ""}`,
      ts: order.created_at,
      done: isPaid,
      active: !isPaid,
    },
    {
      key: "preparing",
      label: "Kitchen is preparing your order",
      ts: order.kitchen_ticket?.started_at,
      done: stage >= 2,
      active: stage === 0 || stage === 1,
    },
    {
      key: "ready",
      label: "Ready for pickup at counter",
      ts: order.kitchen_ticket?.ready_at,
      done: stage >= 2,
      active: stage === 2,
    },
    {
      key: "served",
      label: "Served at table",
      ts: order.kitchen_ticket?.completed_at,
      done: stage >= 3,
      active: stage === 3,
    },
  ];
}

function loadStashedOrder(orderNo: string): { stash: TrackStash; promise: Promise<Awaited<ReturnType<typeof api.trackOrder>>> } | null {
  const raw = sessionStorage.getItem("mtm.lastOrder");
  if (!raw) return null;
  const stash = JSON.parse(raw) as TrackStash;
  return { stash, promise: api.trackOrder({ order_no: orderNo, phone: stash.phone }) };
}

function isTerminalStatus(status: string | undefined): boolean {
  return !status || status === "completed" || status === "cancelled";
}

function startPollingInterval(
  orderNo: string,
  phone: string | undefined,
  onData: (res: Awaited<ReturnType<typeof api.trackOrder>>) => void,
): () => void {
  let cancelled = false;
  const id = setInterval(async () => {
    try {
      const res = await api.trackOrder({ order_no: orderNo, phone });
      if (!cancelled) onData(res);
    } catch { /* transient error — keep last known state, retry next tick */ }
  }, 12000);
  return () => { cancelled = true; clearInterval(id); };
}

async function performCancelOrder(
  data: Awaited<ReturnType<typeof api.trackOrder>>,
  orderNo: string,
  phone: string | undefined,
): Promise<{ cancelResult: { ok: boolean; text: string }; updated: Awaited<ReturnType<typeof api.trackOrder>> }> {
  const res = await api.cancelOrder({
    order_no: data.order.order_no,
    phone,
    reason:   "Customer requested cancellation",
  });
  const updated = await api.trackOrder({ order_no: orderNo, phone });
  return { cancelResult: { ok: true, text: res.message }, updated };
}

export default function TrackPage() {
  const { orderNo } = useParams<{ orderNo: string }>();
  const [stash, setStash] = useState<TrackStash | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.trackOrder>> | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [emailInput, setEmailInput] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [cancelling, setCancelling]   = useState(false);
  const [cancelMsg, setCancelMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const loaded = loadStashedOrder(orderNo);
    if (loaded) {
      setStash(loaded.stash);
      setPhoneInput(loaded.stash.phone);
      loaded.promise
        .then(setData)
        .catch((e) => setErr(e.message))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [orderNo]);

  // Auto-refresh while the order is still in progress, so status changes made
  // on the kitchen display (KDS) appear without a manual reload. Guests have no
  // Supabase session for Realtime, so we poll the same authenticated lookup.
  // Stops once the order reaches a terminal state.
  useEffect(() => {
    if (isTerminalStatus(data?.order.status)) return;
    const phone = stash?.phone || phoneInput || undefined;
    return startPollingInterval(orderNo, phone, setData);
  }, [data?.order.status, orderNo, stash, phoneInput]);

  async function lookupWithPhone(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true);
    try {
      const res = await api.trackOrder({ order_no: orderNo, phone: phoneInput || undefined });
      setData(res);
    } catch (e: any) {
      setErr(e.message);
    } finally { setLoading(false); }
  }

  async function downloadReceipt() {
    if (!printRef.current || downloading) return;
    setDownloading(true);
    try {
      const h2c = (await import("html2canvas")).default;
      const canvas = await h2c(printRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = `receipt-${orderNo}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally { setDownloading(false); }
  }

  async function emailReceipt(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    const to = stash?.email || emailInput;
    if (!to) return;
    setEmailSending(true); setEmailMsg(null);
    try {
      await api.sendReceipt({
        to,
        order_no: data.order.order_no,
        phone:    stash?.phone || phoneInput || undefined,
        method:   stash?.method,
      });
      setEmailMsg({ ok: true, text: `Receipt sent to ${to}` });
    } catch (err: any) {
      setEmailMsg({ ok: false, text: err.message || "Failed to send" });
    } finally { setEmailSending(false); }
  }

  async function cancelOrder() {
    if (!data || cancelling) return;
    setCancelling(true); setCancelMsg(null);
    const phone = stash?.phone || phoneInput || undefined;
    try {
      const { cancelResult, updated } = await performCancelOrder(data, orderNo, phone);
      setCancelMsg(cancelResult);
      setData(updated);
    } catch (e: any) {
      setCancelMsg({ ok: false, text: e.message || "Failed to cancel order" });
    } finally {
      setCancelling(false);
    }
  }

  if (!data && !loading) {
    return (
      <div className="ck-wrap">
        <div className="container">
          <div className="ck-form-wrap">
            <h1 className="h-display h2" style={{ textAlign: "center", margin: "0 0 24px" }}>Track order {orderNo}</h1>
            <form className="ck-form" onSubmit={lookupWithPhone}>
              <h2>Track order {orderNo}</h2>
              <p className="sub">Enter your mobile to verify ownership, or leave blank to view by order number alone.</p>
              <div className="stack">
                <div className="field">
                  <label htmlFor="track-order-phone">Mobile number <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(optional)</span></label>
                  <input id="track-order-phone" className="input" type="tel" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder="+63 9XX XXX XXXX" />
                </div>
                {err && <p style={{ color: "var(--err)", margin: 0 }}>{err}</p>}
                <button className="btn btn-primary btn-lg btn-block">Track order</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !data) return <div className="container" style={{ padding: 80, textAlign: "center" }}>Loading…</div>;

  const { order, workspace, items } = data;
  const isPaid = order.status !== "pending";

  const subtotal   = order.subtotal;
  const svc        = order.service_fee;
  const vat        = order.tax;
  const discount   = order.discount;
  const taxPct     = Math.round(workspace.tax_rate * 100);
  const svcPct     = Math.round(workspace.service_rate * 100);
  // Kitchen status only exists once payment is confirmed (cash settle, webhook,
  // etc. spawn the ticket). Until then we leave it null so downstream steps
  // stay unlit — important for the cash flow where the customer pays at the
  // counter before kitchen prep starts.
  const ticketStatus: string | null = order.kitchen_ticket?.status ?? null;

  const steps = buildSteps(order, isPaid, ticketStatus, stash?.method);

  return (
    <div className="succ-wrap">
      <div className="succ">
        <div className="receipt">
          <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo1.png"
            alt="Mugthemug"
            style={{ height: 48, width: "auto", display: "block", margin: "0 auto 20px", opacity: 0.85 }}
          />
          <div className="check">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12l5 5L20 7" />
            </svg>
          </div>
          <h1>You&apos;re all set.</h1>
          <p className="sub">
            {stash?.method_id === "cash" && !isPaid
              ? "Show this ticket at the counter to pay and start prep."
              : "Order confirmed. Kitchen is on it."}
          </p>

          {stash?.method_id === "cash" && !isPaid && stash.ticket_no ? (
            <div className="ref-card">
              <div className="lbl">Counter Ticket</div>
              <div className="ref" style={{ fontSize: "clamp(2rem, 8vw, 3.5rem)", letterSpacing: "0.08em" }}>{stash.ticket_no}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>Order #{order.order_no}</div>
            </div>
          ) : (
            <div className="ref-card">
              <div className="lbl">Reference Number</div>
              <div className="ref">{order.order_no}</div>
            </div>
          )}

          {stash?.method_id === "cash" && !isPaid && (
            <div
              style={{
                margin: "16px 0", padding: "14px 18px",
                background: "rgba(var(--tint-rgb), 0.1)",
                border: "1px solid rgba(var(--tint-rgb), 0.4)",
                borderRadius: 10, color: "var(--amber-bright)",
                fontFamily: "var(--f-mono)", fontSize: 13, lineHeight: 1.5,
                textAlign: "center",
              }}
            >
              💵 Pay <strong>{peso(order.total)}</strong> at the counter, then we&apos;ll start preparing your order.
            </div>
          )}

          <div className="det">
            <div className="row-d"><span className="k">Customer</span><span className="v">{stash?.name ?? "—"}</span></div>
            <div className="row-d"><span className="k">Mobile</span><span className="v">{stash?.phone ?? phoneInput}</span></div>
            <div className="row-d"><span className="k">Branch</span><span className="v">{workspace.name || "Cafe"}{order.table_no ? ` · Table ${order.table_no}` : ""}</span></div>
            <div className="row-d"><span className="k">Date</span><span className="v">{new Date(order.created_at).toLocaleString()}</span></div>
            <div className="row-d"><span className="k">Status</span>
              <span className="v"><span className="status-pill"><span className="dot" />{STATUS_LABEL[ticketStatus ?? order.status] || (ticketStatus ?? order.status)}</span></span>
            </div>
          </div>

          <div className="stepper-v">
            {steps.map((s) => (
              <div className={`row-s ${s.done ? "done" : ""} ${s.active ? "active" : ""}`} key={s.key}>
                <div className="ring">{s.done ? "✓" : "·"}</div>
                <div className="body">
                  <div className="lbl">{s.label}</div>
                  <div className="ts">{s.ts ? new Date(s.ts).toLocaleString() : "Pending"}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="items-list">
            {items.map((it, idx) => (
              <div className="it" key={idx}>
                <span><span className="qt">×{it.quantity}</span>{it.name}</span>
                <span>{peso(it.total)}</span>
              </div>
            ))}
          </div>

          <div className="receipt-breakdown">
            <div className="rb-row"><span>Subtotal</span><span>{peso(subtotal)}</span></div>
            <div className="rb-row"><span>Service charge ({svcPct}%)</span><span>{peso(svc)}</span></div>
            <div className="rb-row"><span>VAT ({taxPct}%)</span><span>{peso(vat)}</span></div>
            {discount > 0 && (
              <div className="rb-row" style={{ color: "var(--ok, #22c55e)" }}>
                <span>Discount{order.voucher_code ? ` (${order.voucher_code})` : ""}</span>
                <span>−{peso(discount)}</span>
              </div>
            )}
          </div>

          <div className="total-line">
            <span className="l">Total {isPaid ? "Paid" : "Due"}{stash?.method ? " · " + stash.method : ""}</span>
            <span className="a">{peso(order.total)}</span>
          </div>

          </div>{/* end receiptRef */}

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button
              className="btn btn-ghost"
              style={{ flex: 1, fontSize: 13 }}
              onClick={downloadReceipt}
              disabled={downloading}
            >
              {downloading ? "Saving…" : "⬇ Download"}
            </button>
            <button
              className="btn btn-ghost"
              style={{ flex: 1, fontSize: 13 }}
              onClick={() => setEmailMsg((m) => m === null ? { ok: true, text: "" } : null)}
            >
              ✉ Email copy
            </button>
          </div>

          {emailMsg !== null && (
            <form onSubmit={emailReceipt} style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {!stash?.email && (
                <input
                  className="input"
                  type="email"
                  placeholder="your@email.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  required
                  style={{ fontSize: 13 }}
                />
              )}
              {emailMsg.text && (
                <p style={{ margin: 0, fontSize: 13, color: emailMsg.ok ? "var(--amber-bright)" : "var(--err)" }}>
                  {emailMsg.text}
                </p>
              )}
              {!emailMsg.ok || !emailMsg.text ? (
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ fontSize: 13 }}
                  disabled={emailSending || (!stash?.email && !isValidEmail(emailInput))}
                >
                  {emailSending ? "Sending…" : `Send to ${stash?.email || "my email"}`}
                </button>
              ) : null}
            </form>
          )}

          {/* "Save your info" upsell — hidden for now */}

          {/* Cancel — only for orders the kitchen hasn't taken yet.
              Covers both unpaid (pending) and just-placed paid orders (new).
              Mirrors the server guard (accepted/preparing/ready block self-cancel). */}
          {["pending", "new"].includes(order.status) && !["accepted", "preparing", "ready"].includes(ticketStatus ?? "") && (
            <div style={{ marginTop: 16 }}>
              {!cancelMsg?.ok && (
                <button
                  className="btn btn-ghost"
                  style={{ width: "100%", fontSize: 13, borderColor: "rgba(239,68,68,0.4)", color: "var(--err)" }}
                  onClick={cancelOrder}
                  disabled={cancelling}
                >
                  {cancelling ? "Cancelling…" : "Cancel this order"}
                </button>
              )}
              {cancelMsg && (
                <p style={{ margin: "8px 0 0", fontSize: 13, color: cancelMsg.ok ? "var(--amber-bright)" : "var(--err)", textAlign: "center" }}>
                  {cancelMsg.text}
                </p>
              )}
            </div>
          )}
          {["pending", "new"].includes(order.status) && (ticketStatus === "accepted" || ticketStatus === "preparing" || ticketStatus === "ready") && (
            <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>
              Your order is already being prepared — contact the cafe to cancel.
            </p>
          )}

          <div className="actions">
            <Link className="btn btn-ghost" href="/menu">Order more</Link>
            <Link className="btn btn-primary" href="/booking-checker">Track another</Link>
          </div>
        </div>

        <p className="tag-mono" style={{ textAlign: "center", color: "var(--text-3)", marginTop: 24 }}>
          Show this screen at the counter to redeem.
        </p>
      </div>

      {/* Hidden static receipt — rendered off-screen and used as the source for downloadReceipt(). */}
      <PrintReceipt
        printRef={printRef}
        data={data}
        stash={stash}
        subtotal={subtotal}
        svc={svc}
        vat={vat}
        discount={discount}
        taxPct={taxPct}
        svcPct={svcPct}
        isPaid={isPaid}
      />
    </div>
  );
}

function PrintReceipt({
  printRef, data, stash, subtotal, svc, vat, discount, taxPct, svcPct, isPaid,
}: {
  printRef: React.RefObject<HTMLDivElement>;
  data: TrackData;
  stash: TrackStash | null;
  subtotal: number;
  svc: number;
  vat: number;
  discount: number;
  taxPct: number;
  svcPct: number;
  isPaid: boolean;
}) {
  const { order, workspace, items } = data;
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: -10000,
        top: 0,
        pointerEvents: "none",
      }}
    >
      <div
        ref={printRef}
        style={{
          width: 380,
          padding: "28px 28px 32px",
          background: "#ffffff",
          color: "#1a1a1a",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo1.png"
          alt={workspace.name || "Mugthemug"}
          style={{ height: 44, width: "auto", display: "block", margin: "0 auto 10px" }}
          crossOrigin="anonymous"
        />
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: "0.04em" }}>
            {workspace.name || "Mugthemug"}
          </div>
          <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>ORDER RECEIPT</div>
        </div>

        <div style={{ borderTop: "1px dashed #999", borderBottom: "1px dashed #999", padding: "10px 0", marginBottom: 12 }}>
          <ReceiptRow k="Order #" v={order.order_no} />
          <ReceiptRow k="Date" v={new Date(order.created_at).toLocaleString()} />
          {order.table_no ? <ReceiptRow k="Table" v={String(order.table_no)} /> : null}
          <ReceiptRow k="Customer" v={stash?.name ?? "—"} />
          {stash?.phone ? <ReceiptRow k="Mobile" v={stash.phone} /> : null}
        </div>

        <div style={{ marginBottom: 12 }}>
          {items.map((it, idx) => (
            <div
              key={idx}
              style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}
            >
              <span style={{ flex: 1 }}>
                <span style={{ display: "inline-block", width: 28, color: "#666" }}>×{it.quantity}</span>
                {it.name}
              </span>
              <span style={{ whiteSpace: "nowrap" }}>{peso(it.total)}</span>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px dashed #999", paddingTop: 10, marginBottom: 10 }}>
          <ReceiptRow k="Subtotal" v={peso(subtotal)} />
          <ReceiptRow k={`Service charge (${svcPct}%)`} v={peso(svc)} />
          <ReceiptRow k={`VAT (${taxPct}%)`} v={peso(vat)} />
          {discount > 0 && (
            <ReceiptRow
              k={order.voucher_code ? `Discount (${order.voucher_code})` : "Discount"}
              v={`-${peso(discount)}`}
              valueStyle={{ color: "#0a7d2c" }}
            />
          )}
        </div>

        <div
          style={{
            borderTop: "2px solid #1a1a1a",
            borderBottom: "2px solid #1a1a1a",
            padding: "10px 0",
            display: "flex",
            justifyContent: "space-between",
            fontWeight: 700,
            fontSize: 14,
            marginBottom: 14,
          }}
        >
          <span>TOTAL</span>
          <span>{peso(order.total)}</span>
        </div>

        <div style={{ marginBottom: 14 }}>
          <ReceiptRow k="Payment" v={stash?.method ?? "—"} />
          <ReceiptRow
            k="Status"
            v={isPaid ? "PAID" : "UNPAID"}
            valueStyle={{ fontWeight: 700, color: isPaid ? "#0a7d2c" : "#b54708" }}
          />
        </div>

        <div style={{ textAlign: "center", fontSize: 10, color: "#666", lineHeight: 1.6 }}>
          <div>Thank you for visiting {workspace.name || "Mugthemug"}.</div>
          <div>This is a system-generated receipt.</div>
        </div>
      </div>
    </div>
  );
}

function ReceiptRow({ k, v, valueStyle }: { k: string; v: string; valueStyle?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 3 }}>
      <span style={{ color: "#666" }}>{k}</span>
      <span style={{ textAlign: "right", ...valueStyle }}>{v}</span>
    </div>
  );
}

"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, type MenuResponse } from "@/lib/api";
import { WORKSPACE_SLUG, peso } from "@/lib/config";
import { cart, useCart } from "@/lib/cart";
import { useContentIdempotencyKey } from "@/lib/useButtonCooldown";

const METHODS = [
  { id: "gcash",           label: "GCash",  icon: "/payments/gcash.png",  hint: "You'll be redirected to GCash to complete payment." },
  { id: "maya",            label: "Maya",   icon: "/payments/maya.png",   hint: "You'll be redirected to Maya to complete payment." },
  { id: "qrph",            label: "QRPh",   icon: "/payments/qrph.png",   hint: "Scan the QR code from any bank or e-wallet app." },
  { id: "card",            label: "Card",   icon: "/payments/card.png",   hint: "Visa · Mastercard · JCB accepted via secure gateway." },
  { id: "pay_at_counter",  label: "Cash",   icon: "/payments/cash.png",   hint: "Pay at the counter. Your order goes to the kitchen immediately." },
] as const;
type MethodId = typeof METHODS[number]["id"];

const CTA: Record<MethodId, (t: string) => string> = {
  gcash:          (t) => `Proceed to GCash · ${t}`,
  maya:           (t) => `Proceed to Maya · ${t}`,
  qrph:           (t) => `Scan & Pay · ${t}`,
  card:           (t) => `Continue to payment · ${t}`,
  pay_at_counter: (t) => `Get my ticket · ${t} at counter`,
};

export default function CheckoutPage() {
  const router = useRouter();
  const [menuData, setMenuData] = useState<MenuResponse | null>(null);
  const [rates, setRates] = useState<{ taxRate?: number; serviceRate?: number }>({});

  useEffect(() => {
    api.menu(WORKSPACE_SLUG).then((m) => {
      setMenuData(m);
      setRates({ taxRate: m.workspace.tax_rate, serviceRate: m.workspace.service_rate });
    }).catch(() => {});
  }, []);

  const { lines, subtotal, svc, vat, total } = useCart(rates);
  const [name, setName]           = useState("");
  const [phone, setPhone]         = useState("");
  const [email, setEmail]         = useState("");
  const [tableNo, setTableNo]     = useState("");
  const [dineType, setDineType]   = useState<"dine-in" | "takeaway">("dine-in");
  const [showEmail, setShowEmail] = useState(false);
  const [showBreak, setShowBreak] = useState(false);
  const [voucherInput, setVoucherInput]       = useState("");
  const [appliedVoucher, setAppliedVoucher]   = useState<{ code: string; name: string; discount: number } | null>(null);
  const [voucherError, setVoucherError]       = useState("");
  const [voucherLoading, setVoucherLoading]   = useState(false);

  const [method, setMethod]       = useState<MethodId>("gcash");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr]             = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  // Guards against confirmAndPlace firing twice from a fast double-click/tap —
  // synchronous, so it closes the gap before setSubmitting(true) re-renders.
  const submittingRef = useRef(false);

  const voucherDiscount = appliedVoucher?.discount ?? 0;
  const discountedTotal = +(total - voucherDiscount).toFixed(2);

  // Mirrors submit()'s own validation — keeps the CTA disabled until the same
  // conditions that would otherwise be caught post-click are already satisfied.
  const isFormReady = lines.length > 0 && !!name.trim() && !!phone.trim();

  // Derived from the actual order content: a refresh-and-retry of the same
  // order reuses this key (server treats it as the same order, not a new
  // one), while editing the cart/form after a failed attempt gets a fresh
  // key automatically (the server rejects a reused key with a changed body).
  const idemKey = useContentIdempotencyKey({
    lines: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, notes: l.notes })),
    name: name.trim(), phone: phone.trim(), email: email.trim(),
    table_no: dineType === "dine-in" ? tableNo : undefined,
    method, voucher_code: appliedVoucher?.code,
  });

  async function applyVoucher() {
    const code = voucherInput.trim().toUpperCase();
    if (!code) return;
    setVoucherLoading(true);
    setVoucherError("");
    try {
      const result = await api.validateVoucher({ workspace_slug: WORKSPACE_SLUG, voucher_code: code, subtotal });
      if (result.valid) {
        setAppliedVoucher({ code: result.voucher_code!, name: result.voucher_name!, discount: result.discount_amount });
        setVoucherInput("");
      } else {
        setVoucherError(result.reason ?? "Invalid voucher code");
      }
    } catch {
      setVoucherError("Could not validate voucher. Please try again.");
    } finally {
      setVoucherLoading(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!lines.length)                    { setErr("Your cart is empty");          return; }
    if (!name.trim() || !phone.trim())    { setErr("Name and mobile are required"); return; }
    setShowConfirm(true);
  }

  async function confirmAndPlace() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setShowConfirm(false);
    setSubmitting(true);
    try {
      const res = await api.guestOrder({
        workspace_slug: WORKSPACE_SLUG,
        customer: { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined },
        table_no: dineType === "dine-in" && tableNo ? tableNo : undefined,
        items: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, notes: l.notes })),
        payment_method: method,
        voucher_code: appliedVoucher?.code,
      }, { idempotencyKey: idemKey });
      sessionStorage.setItem("mtm.lastOrder", JSON.stringify({
        order_no:  res.order.order_no,
        ticket_no: res.order.ticket_no ?? null,
        name, phone,
        email:     email || undefined,
        method_id: method,
        method:    METHODS.find((m) => m.id === method)!.label,
      }));
      if (res.checkout_url) {
        window.location.href = res.checkout_url;
      } else {
        cart.clear();
        router.push(`/order-tracking/${encodeURIComponent(res.order.order_no)}`);
      }
    } catch (e: any) {
      setErr(e.message || "Something went wrong. Please try again.");
      setSubmitting(false);
      submittingRef.current = false;
    }
  }

  const selectedMethod = METHODS.find((m) => m.id === method)!;

  const confirmModal = showConfirm && (
    <div
      role="button"
      tabIndex={0}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        padding: "0 0 env(safe-area-inset-bottom)",
      }}
      onClick={() => setShowConfirm(false)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowConfirm(false); }
      }}
    >
      <div
        style={{
          background: "var(--bg-2, #1a1510)", borderRadius: "16px 16px 0 0",
          padding: "24px 20px 28px", width: "100%", maxWidth: 520,
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Confirm your order?</div>
        <div style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 16 }}>
          {lines.length} {lines.length === 1 ? "item" : "items"} · {selectedMethod.label} · {peso(discountedTotal)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16, maxHeight: 160, overflowY: "auto" }}>
          {lines.map((l) => (
            <div key={l.product_id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span>×{l.quantity} {l.name}</span>
              <span style={{ color: "var(--text-3)" }}>{peso(l.price * l.quantity)}</span>
            </div>
          ))}
        </div>
        {voucherDiscount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#4ade80", marginBottom: 8 }}>
            <span>Voucher ({appliedVoucher!.code})</span>
            <span>-{peso(voucherDiscount)}</span>
          </div>
        )}
        <div style={{ borderTop: "1px solid var(--line, rgba(255,255,255,0.08))", paddingTop: 12, marginBottom: 16, display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15 }}>
          <span>Total</span><span style={{ color: "var(--amber-bright, var(--amber))" }}>{peso(discountedTotal)}</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ flex: 1 }}
            onClick={() => setShowConfirm(false)}
            disabled={submitting}
          >
            Go back
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 2, opacity: submitting ? 0.6 : 1 }}
            onClick={confirmAndPlace}
            disabled={submitting}
          >
            {submitting ? "Processing…" : CTA[method](peso(discountedTotal))}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
    {confirmModal}
    <form className="co-page" onSubmit={submit}>
      {/* ── Top bar ── */}
      <div className="co-topbar">
        <Link href="/food-cart" className="co-back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          Cart
        </Link>
        <div className="co-topbar-mid">
          <span className="co-topbar-title">Checkout</span>
          <span className="co-topbar-sub">{lines.length} {lines.length === 1 ? "item" : "items"}</span>
        </div>
        <span className="co-topbar-amt">{peso(discountedTotal)}</span>
      </div>

      <div className="co-body">
        {/* ── 1. Order summary ── */}
        <div className="co-section">
          <div className="co-label">Your order</div>
          {lines.map((l) => {
            const img = menuData?.products.find((p) => p.id === l.product_id)?.image_url;
            return (
              <div key={l.product_id} className="co-item">
                <div className="co-item-thumb">
                  {img
                    ? <img src={img} alt={l.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <div className="art-meal" style={{ width: "100%", height: "100%" }} />}
                </div>
                <div className="co-item-name">{l.name}</div>
                <div className="co-item-qty">×{l.quantity}</div>
                <div className="co-item-price">{peso(l.price * l.quantity)}</div>
              </div>
            );
          })}
          <div className="co-total-row">
            <button type="button" className="co-breakdown-btn" onClick={() => setShowBreak(v => !v)}>
              {showBreak ? "Hide breakdown ▲" : "See breakdown ▼"}
            </button>
            <span className="co-total-amt">{peso(discountedTotal)}</span>
          </div>
          {showBreak && (
            <div className="co-breakdown">
              <div className="co-bd-row"><span>Subtotal</span><span>{peso(subtotal)}</span></div>
              <div className="co-bd-row"><span>Service charge</span><span>{peso(svc)}</span></div>
              <div className="co-bd-row"><span>VAT</span><span>{peso(vat)}</span></div>
              {voucherDiscount > 0 && (
                <div className="co-bd-row" style={{ color: "#4ade80" }}>
                  <span>Voucher ({appliedVoucher!.code})</span>
                  <span>-{peso(voucherDiscount)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 2. Voucher ── */}
        <div className="co-section">
          <div className="co-label">Promo / Voucher <span className="co-opt">optional</span></div>
          {appliedVoucher ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 13, fontWeight: 700, color: "var(--amber-bright)", letterSpacing: "0.06em" }}>
                  {appliedVoucher.code}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  {appliedVoucher.name} · <span style={{ color: "#4ade80" }}>-{peso(appliedVoucher.discount)}</span>
                </div>
              </div>
              <button type="button" className="co-breakdown-btn" onClick={() => setAppliedVoucher(null)}>
                Remove
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="input"
                  value={voucherInput}
                  onChange={(e) => { setVoucherInput(e.target.value.toUpperCase()); setVoucherError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyVoucher(); } }}
                  placeholder="Enter voucher code"
                  style={{ flex: 1, fontFamily: "var(--f-mono)", letterSpacing: "0.06em", textTransform: "uppercase" }}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!voucherInput.trim() || voucherLoading}
                  onClick={applyVoucher}
                  style={{ flexShrink: 0, padding: "0 18px" }}
                >
                  {voucherLoading ? "…" : "Apply"}
                </button>
              </div>
              {voucherError && (
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--err, #f87171)", fontFamily: "var(--f-mono)" }}>
                  {voucherError}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── 3. Dine in / Takeaway ── */}
        <div className="co-section">
          <div className="co-label">Where are you?</div>
          <div className="co-type-toggle">
            <button type="button" className={`co-type-btn ${dineType === "dine-in" ? "active" : ""}`} onClick={() => setDineType("dine-in")}>
              Dine in
            </button>
            <button type="button" className={`co-type-btn ${dineType === "takeaway" ? "active" : ""}`} onClick={() => setDineType("takeaway")}>
              Takeaway
            </button>
          </div>
          {dineType === "dine-in" && (
            <div className="co-field" style={{ marginTop: 14 }}>
              <label htmlFor="co-table">Table number <span className="co-opt">optional — ask your server</span></label>
              <input id="co-table" className="input" value={tableNo} onChange={(e) => setTableNo(e.target.value)} placeholder="e.g. 12" />
            </div>
          )}
        </div>

        {/* ── 4. Customer info ── */}
        <div className="co-section">
          <div className="co-label">Your info</div>
          <div className="co-field">
            <label htmlFor="co-name">Full name</label>
            <input id="co-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan dela Cruz" required />
          </div>
          <div className="co-field">
            <label htmlFor="co-mobile">Mobile</label>
            <input id="co-mobile" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+63 9XX XXX XXXX" required />
          </div>
          <button type="button" className="co-email-toggle" onClick={() => setShowEmail(v => !v)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <polyline points={showEmail ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
            </svg>
            {showEmail ? "Remove email receipt" : "Send receipt via email (optional)"}
          </button>
          {showEmail && (
            <div className="co-field">
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
          )}
        </div>

        {/* ── 5. Payment ── */}
        <div className="co-section">
          <div className="co-label">Pay with</div>
          <div className="pay-cards">
            {METHODS.map((m) => (
              <button type="button" key={m.id}
                className={`pay-card ${method === m.id ? "active" : ""}`}
                onClick={() => setMethod(m.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.icon} alt={m.label} />
                <span>{m.label}</span>
              </button>
            ))}
          </div>
          <p className="co-pay-hint">{selectedMethod.hint}</p>
        </div>

        {err && <div className="co-err">{err}</div>}

        {/* Mobile spacer — keeps content above the sticky bar */}
        <div className="co-mobile-spacer" />
      </div>

      {/* ── CTA — sticky on mobile, inline on desktop ── */}
      <div className="co-cta-bar">
        <span className="co-cta-total">{peso(discountedTotal)}</span>
        <button type="submit" className="btn btn-primary co-cta-btn" disabled={submitting || !isFormReady}>
          {submitting ? "Placing order…" : !isFormReady ? "Complete required details" : CTA[method](peso(discountedTotal))}
        </button>
      </div>
    </form>
    </>
  );
}

"use client";
export const dynamic = "force-dynamic";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { peso } from "@/lib/config";

interface BookingStash {
  bookingRef:       string;
  roomName:         string;
  checkIn:          string;
  checkOut:         string;
  nights:           number;
  total:            number;            // discounted total (amount actually charged)
  method:           string;
  workspaceName?:   string;
  name?:            string;
  phone?:           string;
  email?:           string;
  guests?:          number;
  checkInTime?:     string;
  roomRate?:        number;
  cleaningFee?:     number | null;
  securityDeposit?: number | null;
  workspacePhone?:  string;
  // Voucher fields
  voucherCode?:     string;
  voucherName?:     string;
  discountAmount?:  number;
  originalTotal?:   number;            // total before discount (nights × rate)
}

const METHOD_LABELS: Record<string, string> = {
  gcash: "GCash", maya: "Maya", card: "Card", qrph: "QR Ph", counter: "Pay at counter",
};

function fmtDateShort(s: string) {
  return new Date(s).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric",
  });
}
function fmtDateLong(s: string) {
  return new Date(s).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric",
  });
}
function fmtTime(t?: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Shared receipt row — matches the order-tracking receipt layout.
function ReceiptRow({ k, v, valueStyle }: { k: string; v: string; valueStyle?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 3 }}>
      <span style={{ color: "#666" }}>{k}</span>
      <span style={{ textAlign: "right", ...valueStyle }}>{v}</span>
    </div>
  );
}

// Printable receipt — captured by html2canvas for Download; also shown in the View Receipt modal.
// All payment values come directly from the stash (no recalculation).
function PrintReceipt({
  printRef, stash, bookingRef, receiptNo, datePaid,
}: {
  printRef?: React.RefObject<HTMLDivElement>;
  stash: BookingStash;
  bookingRef: string;
  receiptNo: string;
  datePaid: Date;
}) {
  const hasVoucher    = !!(stash.voucherCode && stash.discountAmount);
  const originalTotal = stash.originalTotal ?? stash.total;

  return (
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
        alt={stash.workspaceName || "Mugthemug"}
        style={{ height: 44, width: "auto", display: "block", margin: "0 auto 10px" }}
        crossOrigin="anonymous"
      />
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: "0.04em" }}>
          {stash.workspaceName || "Mugthemug"}
        </div>
        <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>BOOKING CONFIRMATION</div>
      </div>

      {/* Customer / booking meta */}
      <div style={{ borderTop: "1px dashed #999", borderBottom: "1px dashed #999", padding: "10px 0", marginBottom: 12 }}>
        <ReceiptRow k="Booking Ref"      v={stash.bookingRef || bookingRef} valueStyle={{ fontWeight: 700 }} />
        <ReceiptRow k="Confirmation No." v={receiptNo} />
        <ReceiptRow k="Date Paid"        v={fmtDateShort(datePaid.toISOString())} />
        <ReceiptRow k="Customer"         v={stash.name ?? "—"} />
        {stash.phone ? <ReceiptRow k="Mobile" v={stash.phone} /> : null}
        {stash.email ? <ReceiptRow k="Email"  v={stash.email} /> : null}
      </div>

      {/* Stay details */}
      <div style={{ marginBottom: 12 }}>
        <ReceiptRow k="Room"     v={stash.roomName}  valueStyle={{ fontWeight: 700 }} />
        <ReceiptRow k="Check-in" v={`${fmtDateShort(stash.checkIn)}${stash.checkInTime ? ", " + fmtTime(stash.checkInTime) : ""}`} />
        <ReceiptRow k="Check-out" v={fmtDateShort(stash.checkOut)} />
        {stash.guests != null ? <ReceiptRow k="Guests" v={String(stash.guests)} /> : null}
        <ReceiptRow k="Nights"   v={String(stash.nights)} />
      </div>

      {/* Online payment breakdown */}
      <div style={{ borderTop: "1px dashed #999", paddingTop: 10, marginBottom: 4 }}>
        {(stash.cleaningFee || stash.securityDeposit) && (
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "#444", marginBottom: 6 }}>
            ONLINE PAYMENT
          </div>
        )}
        <ReceiptRow
          k={`Room rate × ${stash.nights} night${stash.nights !== 1 ? "s" : ""}`}
          v={peso(originalTotal)}
        />
        {hasVoucher && (
          <ReceiptRow
            k={`Voucher (${stash.voucherCode})`}
            v={`−${peso(stash.discountAmount!)}`}
            valueStyle={{ color: "#0a7d2c" }}
          />
        )}
      </div>

      {/* Total paid online */}
      <div
        style={{
          borderTop:    "2px solid #1a1a1a",
          borderBottom: (stash.cleaningFee || stash.securityDeposit) ? "none" : "2px solid #1a1a1a",
          padding:      "10px 0",
          display:      "flex",
          justifyContent: "space-between",
          fontWeight:   700,
          fontSize:     14,
          marginBottom: (stash.cleaningFee || stash.securityDeposit) ? 0 : 14,
        }}
      >
        <span>{(stash.cleaningFee || stash.securityDeposit) ? "TOTAL PAID ONLINE" : "TOTAL PAID"}</span>
        <span>{peso(stash.total)}</span>
      </div>

      {/* Front-desk charges */}
      {(stash.cleaningFee || stash.securityDeposit) && (() => {
        const deskTotal = (stash.cleaningFee ?? 0) + (stash.securityDeposit ?? 0);
        return (
          <div style={{ marginTop: 14, marginBottom: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "#444", marginBottom: 6 }}>
              DUE AT FRONT DESK
            </div>
            {stash.cleaningFee     ? <ReceiptRow k="Cleaning fee"      v={peso(stash.cleaningFee)} /> : null}
            {stash.securityDeposit ? <ReceiptRow k="Refundable deposit" v={peso(stash.securityDeposit)} /> : null}
            <div style={{
              borderTop: "2px solid #1a1a1a", borderBottom: "2px solid #1a1a1a",
              padding: "10px 0", display: "flex", justifyContent: "space-between",
              fontWeight: 700, fontSize: 14, marginTop: 6, marginBottom: 14,
            }}>
              <span>DUE UPON ARRIVAL</span>
              <span>{peso(deskTotal)}</span>
            </div>
          </div>
        );
      })()}

      {/* Payment method & status */}
      <div style={{ marginBottom: hasVoucher ? 8 : 14 }}>
        <ReceiptRow k="Payment" v={METHOD_LABELS[stash.method] ?? stash.method} />
        <ReceiptRow k="Status"  v="PAID" valueStyle={{ fontWeight: 700, color: "#0a7d2c" }} />
      </div>

      {/* Savings summary (only when voucher was applied) */}
      {hasVoucher && (
        <div style={{ borderTop: "1px dashed #999", paddingTop: 8, marginBottom: 14 }}>
          <ReceiptRow
            k="You Saved"
            v={peso(stash.discountAmount!)}
            valueStyle={{ fontWeight: 700, color: "#0a7d2c" }}
          />
        </div>
      )}

      <div style={{ textAlign: "center", fontSize: 10, color: "#666", lineHeight: 1.6 }}>
        <div>Present this confirmation upon arrival.</div>
        <div>Cancellation requires 48 hours notice.</div>
        <div style={{ marginTop: 6 }}>Thank you for booking with {stash.workspaceName || "Mugthemug"}.</div>
        <div>This document is not an official receipt.</div>
      </div>
    </div>
  );
}

export default function BookingCallbackPage() {
  return (
    <Suspense fallback={null}>
      <BookingCallbackInner />
    </Suspense>
  );
}

function BookingCallbackInner() {
  const params     = useSearchParams();
  const status     = params.get("status");
  const bookingRef = params.get("booking_ref") ?? "";

  const [stash, setStash]               = useState<BookingStash | null>(null);
  const [stashLoading, setStashLoading] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState<boolean | null>(null);
  const printRef                         = useRef<HTMLDivElement>(null);
  const [datePaid]                       = useState(() => new Date());
  const [downloading, setDownloading]   = useState(false);
  const [showReceipt, setShowReceipt]   = useState(false);
  const [copied, setCopied]             = useState(false);

  // Hydrate from sessionStorage (set by the booking form on redirect).
  useEffect(() => {
    if (status !== "success") return;
    try {
      const raw = sessionStorage.getItem("mtm.lastBooking");
      if (raw) {
        const s = JSON.parse(raw);
        if (!bookingRef || !s.bookingRef || s.bookingRef === bookingRef) {
          setStash(s);
        }
      }
    } catch {}
  }, [status]);

  // Verify booking status from the API (to gate the "confirmation sent" notice).
  // Also hydrates stash on direct visits / page refreshes where sessionStorage is empty.
  useEffect(() => {
    if (status !== "success" || !bookingRef) return;
    let cancelled = false;
    setStashLoading(true);
    api.trackBooking({ booking_ref: bookingRef })
      .then(({ booking, resource }) => {
        if (cancelled) return;
        setBookingConfirmed(booking.status === "confirmed");
        setStash(prev => {
          if (prev) return prev; // keep sessionStorage stash if already loaded
          const ms     = new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime();
          const nights = Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
          return {
            bookingRef: booking.ref,
            roomName:   resource?.name ?? "Room",
            checkIn:    booking.start_time,
            checkOut:   booking.end_time,
            nights,
            total:      booking.total,
            method:     "online",
          };
        });
      })
      .catch(() => { if (!cancelled) setBookingConfirmed(false); })
      .finally(() => { if (!cancelled) setStashLoading(false); });
    return () => { cancelled = true; };
  }, [status, bookingRef]);

  async function downloadReceipt() {
    const target = printRef.current;
    if (!target || downloading) return;
    setDownloading(true);
    try {
      const h2c    = (await import("html2canvas")).default;
      const canvas = await h2c(target, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const link   = document.createElement("a");
      link.download = `booking-confirmation-${stash?.bookingRef || bookingRef}.png`;
      link.href     = canvas.toDataURL("image/png");
      link.click();
    } finally { setDownloading(false); }
  }

  function copyRef() {
    const ref = stash?.bookingRef || bookingRef;
    if (!ref) return;
    navigator.clipboard.writeText(ref).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const receiptNo  = `RCPT-${datePaid.getFullYear()}${String(datePaid.getMonth() + 1).padStart(2, "0")}${String(datePaid.getDate()).padStart(2, "0")}-${stash?.bookingRef || bookingRef}`;
  const displayRef = stash?.bookingRef || bookingRef;
  const hasVoucher = !!(stash?.voucherCode && stash?.discountAmount);

  if (status === "success") {
    return (
      <>
        {/* Off-screen receipt — kept in the DOM so html2canvas can paint it */}
        {stash && (
          <div style={{ position: "absolute", left: -9999, top: 0, pointerEvents: "none", zIndex: -1 }}>
            <PrintReceipt
              printRef={printRef}
              stash={stash}
              bookingRef={bookingRef}
              receiptNo={receiptNo}
              datePaid={datePaid}
            />
          </div>
        )}

        {/* Receipt modal */}
        {showReceipt && stash && (
          <div
            role="button"
            tabIndex={0}
            style={{
              position: "fixed", inset: 0, zIndex: 9999,
              background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 16,
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowReceipt(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (e.target === e.currentTarget) setShowReceipt(false);
              }
            }}
          >
            <div style={{ position: "relative", maxHeight: "90vh", overflowY: "auto", borderRadius: 12, boxShadow: "0 8px 48px rgba(0,0,0,0.7)" }}>
              <button
                onClick={() => setShowReceipt(false)}
                aria-label="Close receipt"
                style={{
                  position: "sticky", top: 8, float: "right", marginRight: 8,
                  background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "50%",
                  width: 28, height: 28, cursor: "pointer", color: "#fff",
                  fontSize: 13, lineHeight: "28px", textAlign: "center", zIndex: 1,
                }}
              >
                ✕
              </button>
              <PrintReceipt
                stash={stash}
                bookingRef={bookingRef}
                receiptNo={receiptNo}
                datePaid={datePaid}
              />
            </div>
          </div>
        )}

        {/* Main confirmation page */}
        <div className="succ-wrap">
          <div className="succ" style={{ maxWidth: 460, width: "100%" }}>

            {/* ── Header ── */}
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div className="check">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h1 style={{ marginTop: 12, fontSize: 22, fontWeight: 700 }}>Booking Confirmed!</h1>
              {stash?.name && (
                <p style={{ marginTop: 4, fontSize: 15 }}>
                  Thank you, <strong>{stash.name.split(" ")[0]}</strong>!
                </p>
              )}
              <p style={{ marginTop: 6, fontSize: 13, color: "var(--text-3)", maxWidth: 340, margin: "8px auto 0" }}>
                {stash?.method === "counter"
                  ? "Your room is reserved. Payment is due at the front desk."
                  : "Your stay has been successfully reserved and payment has been received."}
              </p>
            </div>

            {/* ── Booking Summary Card ── */}
            <div style={{
              background: "var(--card, rgba(255,255,255,0.04))",
              borderRadius: 14,
              border: "1px solid var(--border, rgba(255,255,255,0.1))",
              padding: "20px",
              marginBottom: 12,
            }}>
              {stashLoading && !stash && (
                <p style={{ fontSize: 13, color: "var(--text-3)", textAlign: "center", padding: "8px 0" }}>
                  Loading booking details…
                </p>
              )}

              {stash && (
                <>
                  {/* Booking reference — highlighted and copyable */}
                  <div style={{ marginBottom: 18 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
                      color: "var(--text-3)", textTransform: "uppercase", marginBottom: 6,
                    }}>
                      Booking Reference
                    </div>
                    <button
                      onClick={copyRef}
                      title="Click to copy"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        width: "100%",
                        background: "var(--card-alt, rgba(255,255,255,0.06))",
                        border: "1px solid var(--border, rgba(255,255,255,0.15))",
                        borderRadius: 8, padding: "10px 14px",
                        cursor: "pointer", color: "inherit", textAlign: "left",
                      }}
                    >
                      <span style={{
                        fontFamily: "ui-monospace, Menlo, Consolas, monospace",
                        fontSize: 17, fontWeight: 700, letterSpacing: "0.07em",
                      }}>
                        {displayRef}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 10, flexShrink: 0, transition: "color 0.15s" }}>
                        {copied ? "✓ Copied" : "Copy"}
                      </span>
                    </button>
                  </div>

                  {/* Summary rows */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { k: "Room",           v: stash.roomName },
                      { k: "Check-in",       v: `${fmtDateLong(stash.checkIn)}${stash.checkInTime ? " · " + fmtTime(stash.checkInTime) : ""}` },
                      { k: "Check-out",      v: fmtDateLong(stash.checkOut) },
                      ...(stash.guests != null ? [{ k: "Guests", v: `${stash.guests} guest${stash.guests !== 1 ? "s" : ""}` }] : []),
                      { k: "Amount Paid",    v: peso(stash.total) },
                      { k: "Payment Method", v: METHOD_LABELS[stash.method] ?? stash.method },
                    ].map(({ k, v }) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, fontSize: 13 }}>
                        <span style={{ color: "var(--text-3)", flexShrink: 0 }}>{k}</span>
                        <span style={{ textAlign: "right", fontWeight: k === "Amount Paid" ? 700 : 400 }}>{v}</span>
                      </div>
                    ))}

                    {/* Payment status badge */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, marginTop: 2 }}>
                      <span style={{ color: "var(--text-3)" }}>Payment Status</span>
                      <span style={{
                        background:   stash.method === "counter" ? "rgba(245, 158, 11, 0.15)" : "rgba(34, 197, 94, 0.15)",
                        color:        stash.method === "counter" ? "var(--amber)" : "#4ade80",
                        border:       stash.method === "counter" ? "1px solid rgba(245,158,11,0.35)" : "1px solid rgba(34,197,94,0.3)",
                        borderRadius: 6, padding: "2px 10px",
                        fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                      }}>
                        {stash.method === "counter" ? "PENDING" : "PAID"}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ── Voucher section (only when a voucher was applied) ── */}
            {hasVoucher && (
              <div style={{
                background: "rgba(34, 197, 94, 0.06)",
                border: "1px solid rgba(34, 197, 94, 0.22)",
                borderRadius: 10, padding: "14px 16px", marginBottom: 12,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--green, #4ade80)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    Voucher Applied
                  </span>
                  <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13, fontWeight: 700, color: "var(--green, #4ade80)" }}>
                    {stash!.voucherCode}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-3)" }}>You Saved</span>
                  <span style={{ fontWeight: 700, color: "var(--green, #4ade80)" }}>{peso(stash!.discountAmount!)}</span>
                </div>
              </div>
            )}

            {/* ── Confirmation email notice ── */}
            {stash?.email && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 13, color: "var(--text-3)",
                padding: "12px 0",
                borderTop: "1px solid var(--border, rgba(255,255,255,0.08))",
                borderBottom: "1px solid var(--border, rgba(255,255,255,0.08))",
                marginBottom: 16,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, color: "var(--green, #4ade80)" }}>
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span>
                  {bookingConfirmed === true ? "Confirmation sent to" : "A confirmation email will be sent to"}{" "}
                  <strong style={{ color: "inherit", fontWeight: 600 }}>{stash.email}</strong>
                </span>
              </div>
            )}

            {/* ── What's Next ── */}
            <div style={{ marginBottom: 24 }}>
              <div style={{
                fontSize: 11, fontWeight: 600, letterSpacing: "0.09em",
                textTransform: "uppercase", color: "var(--text-3)", marginBottom: 10,
              }}>
                What&apos;s Next?
              </div>
              {[
                "Present your booking reference during check-in",
                "Bring a valid Government ID",
                ...(stash?.cleaningFee || stash?.securityDeposit
                  ? ["Cleaning Fee and Refundable Deposit are payable upon arrival"]
                  : []),
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, fontSize: 13 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    style={{ flexShrink: 0, marginTop: 2, color: "var(--green, #4ade80)" }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span style={{ color: "var(--text-2, rgba(255,255,255,0.8))", lineHeight: 1.45 }}>{item}</span>
                </div>
              ))}
            </div>

            {/* ── Primary button ── */}
            <Link
              href={displayRef ? `/booking-tracking/${displayRef}` : "/booking-checker"}
              className="btn btn-primary"
              style={{ display: "block", textAlign: "center", marginBottom: 10 }}
            >
              View Booking
            </Link>

            {/* ── Secondary buttons ── */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1, fontSize: 13 }}
                onClick={() => setShowReceipt(true)}
                disabled={!stash}
              >
                View Receipt
              </button>
              <button
                className="btn btn-ghost"
                style={{ flex: 1, fontSize: 13 }}
                onClick={downloadReceipt}
                disabled={downloading || !stash}
              >
                {downloading ? "Saving…" : "Download Receipt"}
              </button>
            </div>

            {/* ── Text link ── */}
            <div style={{ textAlign: "center" }}>
              <Link
                href="/booking-cart"
                style={{ fontSize: 13, color: "var(--text-3)", textDecoration: "none" }}
              >
                ← Back to Rooms
              </Link>
            </div>

          </div>
        </div>
      </>
    );
  }

  // ── Payment failed / cancelled ──
  return (
    <div className="succ-wrap">
      <div className="succ">
        <div className="receipt" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✕</div>
          <h1 className="h2" style={{ marginBottom: 8 }}>Payment not completed</h1>
          <p style={{ color: "var(--text-3)", marginBottom: 32 }}>
            Your booking was not charged. You can try again or contact us directly.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <Link href="/booking-cart" className="btn btn-primary">Try again</Link>
            <Link href="/"             className="btn btn-ghost">Back to home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

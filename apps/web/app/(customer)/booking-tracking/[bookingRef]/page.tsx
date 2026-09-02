"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { peso } from "@/lib/config";

const STATUS_LABEL: Record<string, string> = {
  hold:        "On Hold",
  confirmed:   "Confirmed",
  cancelled:   "Cancelled",
  completed:   "Completed",
  checked_in:  "Checked In",
  checked_out: "Checked Out",
  rescheduled: "Rescheduled",
};

const HOURS_48 = 48 * 60 * 60 * 1000;

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
}
function ymd(s: string) { return s.slice(0, 10); }

function CancelSection({
  showCancel, setShowCancel, cancelMsg, within48hrs, isPaid, phone,
  phoneInput, setPhoneInput, cancelBooking, cancelling,
}: {
  showCancel: boolean;
  setShowCancel: (v: boolean) => void;
  cancelMsg: { ok: boolean; text: string } | null;
  within48hrs: boolean;
  isPaid: boolean;
  phone: string;
  phoneInput: string;
  setPhoneInput: (v: string) => void;
  cancelBooking: () => void;
  cancelling: boolean;
}) {
  // Mirrors cancelBooking()'s own validation — it silently refuses (just
  // shows an error) when neither the tracked phone nor the typed phoneInput
  // is present.
  const canCancel = !!(phone || phoneInput).trim();
  return (
    <div style={{ marginTop: 20 }}>
      {!showCancel && (
        <button
          className="btn btn-ghost"
          style={{ width: "100%", fontSize: 13, borderColor: "rgba(239,68,68,0.4)", color: "var(--err)" }}
          onClick={() => setShowCancel(true)}
        >
          Cancel this booking
        </button>
      )}

      {showCancel && !cancelMsg?.ok && (
        <div style={{ padding: "16px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10 }}>
          {within48hrs ? (
            <p style={{ fontSize: 13, color: "var(--err)", margin: "0 0 12px", lineHeight: 1.6 }}>
              Your check-in is in <strong>less than 48 hours</strong>. Online cancellation is not available. Please contact the cafe directly.
            </p>
          ) : isPaid ? (
            <p style={{ fontSize: 13, color: "var(--err)", margin: "0 0 12px", lineHeight: 1.6 }}>
              This booking has already been paid. Please contact the cafe to arrange a refund.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "var(--text-1)", margin: "0 0 12px", lineHeight: 1.6 }}>
                Are you sure you want to cancel? This cannot be undone.
              </p>
              {!phone && (
                <input
                  className="input"
                  type="tel"
                  placeholder="Mobile number on the booking"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  style={{ marginBottom: 10 }}
                />
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1, fontSize: 13 }} onClick={() => setShowCancel(false)}>Keep booking</button>
                <button
                  className="btn"
                  style={{ flex: 1, fontSize: 13, background: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.4)", color: "var(--err)" }}
                  onClick={cancelBooking}
                  disabled={cancelling || !canCancel}
                >
                  {cancelling ? "Cancelling…" : "Yes, cancel"}
                </button>
              </div>
            </>
          )}
          {cancelMsg && (
            <p style={{ marginTop: 8, fontSize: 13, color: cancelMsg.ok ? "var(--amber-bright)" : "var(--err)" }}>
              {cancelMsg.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function BookingTrackPage() {
  const { bookingRef } = useParams<{ bookingRef: string }>();

  const [data,       setData]       = useState<Awaited<ReturnType<typeof api.trackBooking>> | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelMsg,  setCancelMsg]  = useState<{ ok: boolean; text: string } | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [phone,      setPhone]      = useState("");

  useEffect(() => {
    // Try stash from session storage
    try {
      const raw = sessionStorage.getItem("mtm.lastBooking");
      if (raw) {
        const s = JSON.parse(raw);
        setPhone(s.phone ?? "");
        setPhoneInput(s.phone ?? "");
        api.trackBooking({ booking_ref: bookingRef, phone: s.phone || undefined })
          .then(setData)
          .catch((e) => setErr(e.message))
          .finally(() => setLoading(false));
        return;
      }
    } catch {}
    setLoading(false);
  }, [bookingRef]);

  async function lookupWithPhone(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true);
    try {
      const res = await api.trackBooking({ booking_ref: bookingRef, phone: phoneInput || undefined });
      setData(res);
      setPhone(phoneInput);
    } catch (e: any) {
      setErr(e.message);
    } finally { setLoading(false); }
  }

  async function cancelBooking() {
    if (!data || cancelling) return;
    // Cancellation is verified by phone. We may not have it (e.g. the booking
    // was looked up without one), so fall back to the entered value and ask
    // for it explicitly instead of silently doing nothing.
    const ph = (phone || phoneInput).trim();
    if (!ph) {
      setCancelMsg({ ok: false, text: "Enter the mobile number used for this booking to confirm cancellation." });
      return;
    }
    setCancelling(true); setCancelMsg(null);
    try {
      const res = await api.cancelBooking({
        booking_ref: bookingRef,
        phone: ph,
        reason: "Customer requested cancellation",
      });
      setCancelMsg({ ok: true, text: res.message });
      const updated = await api.trackBooking({ booking_ref: bookingRef, phone: ph });
      setData(updated);
      setPhone(ph);
    } catch (e: any) {
      setCancelMsg({ ok: false, text: e.message || "Failed to cancel booking" });
    } finally { setCancelling(false); }
  }

  if (!data && !loading) {
    return (
      <div className="ck-wrap">
        <div className="container">
          <div className="ck-form-wrap">
            <h1 className="h-display h2" style={{ textAlign: "center", margin: "0 0 24px" }}>
              Track booking {bookingRef}
            </h1>
            <form className="ck-form" onSubmit={lookupWithPhone}>
              <h2>Verify your booking</h2>
              <p className="sub">Enter your mobile number to view this booking.</p>
              <div className="stack">
                <div className="field">
                  <label htmlFor="track-phone">Mobile number</label>
                  <input id="track-phone" className="input" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder="+63 9XX XXX XXXX" required />
                </div>
                {err && <p style={{ color: "var(--err)", margin: 0 }}>{err}</p>}
                <button className="btn btn-primary btn-lg btn-block" disabled={!phoneInput.trim()}>View booking</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !data) return <div className="container" style={{ padding: 80, textAlign: "center" }}>Loading…</div>;

  const { booking, resource, customer } = data;
  const isPaid        = booking.status === "confirmed";
  const isCancelled   = booking.status === "cancelled";
  const isCompleted   = booking.status === "completed";
  const isRescheduled = booking.status === "rescheduled";
  const checkIn       = new Date(booking.start_time).getTime();
  const within48hrs   = checkIn - Date.now() < HOURS_48;

  return (
    <div className="succ-wrap">
      <div className="succ">
        <div className="receipt">

          <div className="check" style={{ background: isCancelled ? "rgba(239,68,68,0.12)" : undefined }}>
            {isCancelled
              ? <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              : <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12l5 5L20 7"/></svg>}
          </div>

          <h1>{isCancelled ? "Booking cancelled" : "Your booking"}</h1>

          <div className="ref-card">
            <div className="lbl">Booking Reference</div>
            <div className="ref">{booking.ref}</div>
          </div>

          <div className="det">
            <div className="row-d"><span className="k">Status</span>
              <span className="v">
                <span className={`status-pill ${isCancelled ? "err" : isPaid ? "ok" : "warn"}`}>
                  <span className="dot" />{STATUS_LABEL[booking.status] ?? booking.status}
                </span>
              </span>
            </div>
            {resource && <div className="row-d"><span className="k">Room</span><span className="v">{resource.name}</span></div>}
            {customer && <div className="row-d"><span className="k">Guest</span><span className="v">{customer.name}</span></div>}
            {customer?.phone && <div className="row-d"><span className="k">Phone</span><span className="v">{customer.phone}</span></div>}
            <div className="row-d">
              <span className="k">Check-in</span>
              <span className="v">{fmtDate(booking.start_time)}</span>
            </div>
            <div className="row-d">
              <span className="k">Check-out</span>
              <span className="v">{fmtDate(booking.end_time)}</span>
            </div>
            <div className="row-d"><span className="k">Total</span><span className="v">{peso(booking.total)}</span></div>
          </div>

          {/* Rescheduled notice */}
          {isRescheduled && (
            <div style={{
              marginTop: 16, padding: "12px 14px", borderRadius: 8, fontSize: 13, lineHeight: 1.6,
              background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.25)",
              color: "#a78bfa",
            }}>
              <strong>This booking has been rescheduled.</strong>
              {(booking as any).rescheduled_to_ref ? (
                <span> Your replacement booking reference is{" "}
                  <strong style={{ fontFamily: "monospace", letterSpacing: "0.06em" }}>
                    {(booking as any).rescheduled_to_ref}
                  </strong>.
                </span>
              ) : " Please contact the cafe for your updated booking details."}
            </div>
          )}

          {/* Cancellation policy note — always visible for active bookings */}
          {!isCancelled && !isCompleted && !isRescheduled && (
            <div style={{
              marginTop: 16, padding: "10px 14px", borderRadius: 8, fontSize: 12, lineHeight: 1.6,
              background: within48hrs ? "rgba(239,68,68,0.08)" : "rgba(var(--tint-rgb), 0.07)",
              border: `1px solid ${within48hrs ? "rgba(239,68,68,0.25)" : "rgba(var(--tint-rgb), 0.2)"}`,
              color: within48hrs ? "var(--err)" : "var(--text-3)",
            }}>
              {within48hrs
                ? "⚠ Online cancellation is unavailable — check-in is in less than 48 hours. Contact the cafe directly to cancel."
                : "ℹ Cancellations are not available within 48 hours of your check-in time."}
            </div>
          )}

          {/* Cancellation section */}
          {!isCancelled && !isCompleted && !isRescheduled && (
            <CancelSection
              showCancel={showCancel}
              setShowCancel={setShowCancel}
              cancelMsg={cancelMsg}
              within48hrs={within48hrs}
              isPaid={isPaid}
              phone={phone}
              phoneInput={phoneInput}
              setPhoneInput={setPhoneInput}
              cancelBooking={cancelBooking}
              cancelling={cancelling}
            />
          )}

          {/* When cancelled, offer a one-tap rebook of the same room + dates. */}
          {isCancelled && booking.resource_id && (
            <Link
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 20 }}
              href={`/book/${booking.resource_id}?in=${ymd(booking.start_time)}&out=${ymd(booking.end_time)}`}
            >
              Rebook this room →
            </Link>
          )}

          <div className="actions" style={{ marginTop: isCancelled && booking.resource_id ? 12 : 24 }}>
            <Link className="btn btn-ghost" href="/booking-cart">Book another</Link>
            <Link className="btn btn-ghost" href="/booking-checker">Track another</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

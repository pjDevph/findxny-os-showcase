"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { WORKSPACE_SLUG } from "@/lib/config";
import { useContentIdempotencyKey } from "@/lib/useButtonCooldown";
import BookingCalendar, { DayAvailability } from "./BookingCalendar";

const TIME_SLOTS = [
  "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM",
  "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM",
  "8:00 PM", "9:00 PM", "10:00 PM", "11:00 PM",
];

// Placeholder availability — replace with API data when wired up.
// Keys are YYYY-MM-DD; deterministic so SSR/CSR agree.
function buildMockAvailability(): Record<string, DayAvailability> {
  const out: Record<string, DayAvailability> = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 90; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dow = d.getDay();
    // Saturdays (6): fully booked. Fridays: heavy partial. Sundays: light partial.
    if (dow === 6 && i % 14 !== 0) { out[key] = { fullyBooked: true }; continue; }
    const booked = new Set<string>();
    if (dow === 5) ["6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM"].forEach((t) => booked.add(t));
    else if (dow === 0) ["12:00 PM", "1:00 PM"].forEach((t) => booked.add(t));
    else if (i % 5 === 0) ["7:00 PM"].forEach((t) => booked.add(t));
    if (booked.size) out[key] = { bookedSlots: booked };
  }
  return out;
}

const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 7, 8];

export default function BookingPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ ref: string } | null>(null);
  const [workspacePhone, setWorkspacePhone] = useState<string | null>(null);
  // Guards against handleSubmit firing twice from a fast double-click/tap —
  // synchronous, so it closes the gap before setSubmitting(true) re-renders.
  const submittingRef = useRef(false);

  // 3-minute slot hold — released automatically if the booking isn't confirmed in time.
  const HOLD_MS = 3 * 60 * 1000;
  const [holdUntil, setHoldUntil] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [holdExpired, setHoldExpired] = useState(false);

  useEffect(() => {
    api.menu(WORKSPACE_SLUG).then((m) => setWorkspacePhone(m.workspace.phone)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!holdUntil) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setNowTs(now);
      if (now >= holdUntil) {
        window.clearInterval(id);
        setHoldUntil(null);
        setTime("");
        setHoldExpired(true);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [holdUntil]);

  const holdRemaining = holdUntil ? Math.max(0, holdUntil - nowTs) : 0;
  const holdMmSs = `${Math.floor(holdRemaining / 60000)}:${String(Math.floor((holdRemaining % 60000) / 1000)).padStart(2, "0")}`;

  // Mirrors handleSubmit()'s own validation — name/mobile/date/time required.
  // (holdUntil expiry already clears `time` via the interval effect above, so
  // this naturally goes false again once a hold lapses.)
  const isFormReady = !!name.trim() && !!phone.trim() && !!date && !!time;

  // Derived from the actual booking content: a refresh-and-retry of the same
  // reservation reuses this key, while changing details after a failed
  // attempt gets a fresh key automatically (server rejects a reused key with
  // a changed body).
  const idemKey = useContentIdempotencyKey({
    name: name.trim(), phone: phone.trim(), email: email.trim(),
    date, time, partySize, notes: notes.trim(),
  });

  function handleTimeChange(t: string) {
    setTime(t);
    setHoldExpired(false);
    setHoldUntil(t ? Date.now() + HOLD_MS : null);
  }

  function handleDateChange(iso: string) {
    setDate(iso);
    setTime("");
    setHoldUntil(null);
    setHoldExpired(false);
  }

  const availability = useMemo(buildMockAvailability, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !phone.trim()) { setError("Name and mobile are required"); return; }
    if (!date || !time) { setError("Please select a date and time"); return; }
    if (holdUntil && Date.now() >= holdUntil) {
      setHoldUntil(null); setTime(""); setHoldExpired(true);
      setError("Your hold expired. Please pick a time again.");
      return;
    }

    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      // Parse 12-hour clock string into a Date (server computes end time from workspace slot length).
      const [hourRaw] = time.replace(" AM", "").replace(" PM", "").split(":").map(Number);
      const isPM = time.includes("PM");
      const hour = isPM && hourRaw !== 12 ? hourRaw + 12 : !isPM && hourRaw === 12 ? 0 : hourRaw;
      const startDate = new Date(date);
      startDate.setHours(hour, 0, 0, 0);

      const res = await api.guestBooking({
        workspace_slug: WORKSPACE_SLUG,
        customer: { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined },
        start_time: startDate.toISOString(),
        party_size: partySize,
        notes: notes.trim() || undefined,
      }, { idempotencyKey: idemKey });

      setHoldUntil(null);
      setSuccess({ ref: res.booking.id.slice(0, 8).toUpperCase() });
    } catch (e: any) {
      setError(e.message || "Failed to submit. Please call us directly.");
      submittingRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="succ-wrap">
        <div className="succ">
          <div className="receipt">
            <div className="check">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h1>Request Sent!</h1>
            <p className="sub">We&apos;ll confirm your reservation via SMS within 30 minutes.</p>
            <div className="ref-card">
              <div className="lbl">Reference</div>
              <div className="ref">{success.ref}</div>
            </div>
            <div className="det">
              <div className="row-d"><span className="k">Name</span><span className="v">{name}</span></div>
              <div className="row-d"><span className="k">Date</span><span className="v">{new Date(date).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" })}</span></div>
              <div className="row-d"><span className="k">Time</span><span className="v">{time}</span></div>
              <div className="row-d"><span className="k">Party</span><span className="v">{partySize} guests</span></div>
              <div className="row-d"><span className="k">Mobile</span><span className="v">{phone}</span></div>
            </div>
            <div style={{ marginTop: 16, padding: 14, background: "rgba(139,209,124,0.08)", borderRadius: 10, border: "1px solid rgba(139,209,124,0.25)", fontSize: 13, color: "var(--ok)", lineHeight: 1.5 }}>
              Need to change your reservation?{workspacePhone ? <> Call <strong>{workspacePhone}</strong> anytime — we&apos;re open 24/7.</> : <> We&apos;re open 24/7.</>}
            </div>
            <div className="actions" style={{ marginTop: 24 }}>
              <Link href="/menu" className="btn btn-primary btn-lg">Browse menu →</Link>
              <Link href="/" className="btn btn-ghost btn-lg">Back to home</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="container" style={{ paddingBlock: "56px 32px" }}>
        <div className="eyebrow">Restaurant · Reservations</div>
        <h1 className="h-display h1" style={{ margin: "0 0 16px" }}>Save your seat.</h1>
        <p className="lead" style={{ margin: 0 }}>
          Tables fill up fast on game nights and weekends. Reserve in 60 seconds, no card required.
        </p>
      </section>

      <div className="container" style={{ paddingBottom: 80 }}>
        <div className="co-grid">
          <form onSubmit={handleSubmit}>
            <div className="co-card">
              <h3><span className="n">1</span> Your details</h3>
              <div className="stack">
                <div className="row-2">
                  <div className="field">
                    <label htmlFor="booking-name">Full name</label>
                    <input id="booking-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan dela Cruz" required />
                  </div>
                  <div className="field">
                    <label htmlFor="booking-phone">Mobile</label>
                    <input id="booking-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+63 9XX XXX XXXX" required />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="booking-email">Email (optional)</label>
                  <input id="booking-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="for confirmation" />
                </div>
              </div>
            </div>

            <div className="co-card">
              <h3><span className="n">2</span> Date &amp; time</h3>
              <div className="stack">
                <div className="field">
                  <label htmlFor="booking-party">Party size</label>
                  <select id="booking-party" className="input" value={partySize} onChange={(e) => setPartySize(Number(e.target.value))}>
                    {PARTY_SIZES.map((n) => <option key={n} value={n}>{n} {n === 1 ? "guest" : "guests"}</option>)}
                    <option value={9}>9+ guests (please call)</option>
                  </select>
                </div>
                <BookingCalendar
                  selectedDate={date}
                  selectedTime={time}
                  onDateChange={handleDateChange}
                  onTimeChange={handleTimeChange}
                  timeSlots={TIME_SLOTS}
                  availability={availability}
                />

                {holdUntil && (
                  <output className="hold-banner" aria-live="polite">
                    <span className="hold-pulse" aria-hidden />
                    <div className="hold-text">
                      <strong>Slot held for you</strong>
                      <span>Confirm within <span className="hold-time">{holdMmSs}</span> or it&apos;ll release back.</span>
                    </div>
                  </output>
                )}
                {holdExpired && !holdUntil && (
                  <output className="hold-banner hold-expired" aria-live="polite">
                    <span className="hold-pulse" aria-hidden />
                    <div className="hold-text">
                      <strong>Hold released</strong>
                      <span>Your 3-minute window ended. Pick a time again to continue.</span>
                    </div>
                  </output>
                )}
                <div className="field">
                  <label htmlFor="booking-notes">Special requests (optional)</label>
                  <textarea id="booking-notes" className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Birthday, dietary needs, preferred area…" style={{ resize: "vertical" }} />
                </div>
              </div>
            </div>

            {error && (
              <div style={{ padding: "14px 16px", marginBottom: 16, background: "rgba(255,107,94,0.1)", border: "1px solid rgba(255,107,94,0.3)", borderRadius: 10, color: "var(--err)", fontSize: 14 }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={submitting || !isFormReady}>
              {submitting ? "Sending request…" : !isFormReady ? "Complete required details" : "Reserve my table →"}
            </button>
          </form>

          <div className="sum">
            <h3 style={{ fontFamily: "var(--f-display)", fontSize: 26, color: "var(--text-0)", letterSpacing: "0.02em", margin: "0 0 18px" }}>Booking details</h3>
            {date || time ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { k: "Date", v: date ? new Date(date).toLocaleDateString("en-PH", { weekday: "short", month: "long", day: "numeric" }) : "—" },
                  { k: "Time", v: time || "—" },
                  { k: "Duration", v: "2 hours (extendable)" },
                  { k: "Party", v: `${partySize} guests` },
                ].map((row) => (
                  <div key={row.k} className="sum-line">
                    <div className="nm">{row.k}</div>
                    <div className="pr">{row.v}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "var(--text-3)", fontSize: 13 }}>Fill in the form to see your reservation details.</div>
            )}
            <div style={{ marginTop: 24, padding: 16, background: "rgba(139,209,124,0.06)", borderRadius: 10, border: "1px solid rgba(139,209,124,0.2)", fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
              <strong style={{ color: "var(--ok)" }}>No deposit required.</strong> We&apos;ll SMS you a confirmation within 30 minutes. Walk-ins always welcome too.
            </div>
            <div style={{ marginTop: 16, padding: 14, borderTop: "1px solid var(--line)", fontSize: 12, color: "var(--text-3)", lineHeight: 1.6 }}>
              Open 24/7{workspacePhone ? <> · <a href={`tel:${workspacePhone.replace(/\s+/g, "")}`} style={{ color: "var(--amber-bright)" }}>{workspacePhone}</a></> : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

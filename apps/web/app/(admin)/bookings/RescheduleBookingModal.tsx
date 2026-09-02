"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlideOver } from "@/components/ui/SlideOver";
import { rescheduleBooking } from "../actions";
import { peso } from "@/lib/config";

type ModalState = "form" | "loading" | "result";

interface RescheduleResult {
  booking: { id: string; status: string; total: number; payment_status: string };
  original_booking_id: string;
  price_difference: number;
  balance_due: number;
  refund_due: number;
}

interface Props {
  bookingId: string;
  currentCheckIn: string;
  currentCheckOut: string;
  roomName: string;
  onClose: () => void;
  onSuccess: () => void;
}

/** Format an ISO datetime string to the local datetime-local input value (YYYY-MM-DDTHH:mm) */
function toLocalDatetimeValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert a datetime-local value back to an ISO string (treating it as local time) */
function localDatetimeToISO(value: string): string {
  return new Date(value).toISOString();
}

export function RescheduleBookingModal({ bookingId, currentCheckIn, currentCheckOut, roomName, onClose, onSuccess }: Props) {
  const router = useRouter();

  const nowMin = toLocalDatetimeValue(new Date().toISOString());

  const [modalState, setModalState] = useState<ModalState>("form");
  const [newCheckIn, setNewCheckIn] = useState(toLocalDatetimeValue(currentCheckIn));
  const [newCheckOut, setNewCheckOut] = useState(toLocalDatetimeValue(currentCheckOut));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RescheduleResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const now   = new Date();
    const start = new Date(newCheckIn);
    const end   = new Date(newCheckOut);

    if (start < now) {
      setError("New check-in date cannot be in the past.");
      return;
    }
    if (end <= start) {
      setError("Check-out must be after check-in.");
      return;
    }

    setModalState("loading");
    try {
      const res = await rescheduleBooking(
        bookingId,
        localDatetimeToISO(newCheckIn),
        localDatetimeToISO(newCheckOut),
        reason.trim() || undefined,
      );
      setResult(res);
      setModalState("result");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reschedule failed.");
      setModalState("form");
    }
  }

  function handleDone() {
    onSuccess();
    onClose();
  }

  const LABEL: React.CSSProperties = {
    fontSize: 11,
    fontFamily: "var(--f-mono)",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--text-3)",
    marginBottom: 4,
    display: "block",
  };

  const INPUT: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    fontSize: 13,
    borderRadius: 6,
    border: "1px solid rgba(var(--tint-rgb), 0.18)",
    background: "rgba(var(--tint-rgb), 0.04)",
    color: "var(--text-1)",
    outline: "none",
    boxSizing: "border-box",
    colorScheme: "dark",
  };

  return (
    <SlideOver
      open
      onClose={onClose}
      title="Reschedule Booking"
      subtitle={roomName}
      centered
      width={420}
      footer={
        modalState === "form" ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn-xs" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              form="reschedule-form"
              className="btn-xs primary"
              disabled={
                modalState !== "form" ||
                !newCheckIn ||
                !newCheckOut ||
                new Date(newCheckIn) < new Date() ||
                new Date(newCheckOut) <= new Date(newCheckIn)
              }
            >
              Reschedule
            </button>
          </div>
        ) : modalState === "result" ? (
          <button type="button" className="btn-xs primary" onClick={handleDone}>Done</button>
        ) : null
      }
    >
      {/* ── FORM STATE ── */}
      {modalState === "form" && (
        <form id="reschedule-form" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label style={LABEL}>Current check-in</label>
            <div style={{ fontSize: 13, color: "var(--text-3)", padding: "6px 0" }}>
              {new Date(currentCheckIn).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          <div>
            <label style={LABEL}>Current check-out</label>
            <div style={{ fontSize: 13, color: "var(--text-3)", padding: "6px 0" }}>
              {new Date(currentCheckOut).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>

          <hr style={{ border: "none", borderTop: "1px solid rgba(var(--tint-rgb), 0.1)", margin: "2px 0" }} />

          <div>
            <label htmlFor="new-check-in" style={LABEL}>New check-in</label>
            <input
              id="new-check-in"
              type="datetime-local"
              style={INPUT}
              value={newCheckIn}
              min={nowMin}
              onChange={e => setNewCheckIn(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="new-check-out" style={LABEL}>New check-out</label>
            <input
              id="new-check-out"
              type="datetime-local"
              style={INPUT}
              value={newCheckOut}
              onChange={e => setNewCheckOut(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="reschedule-reason" style={LABEL}>Reason (optional)</label>
            <textarea
              id="reschedule-reason"
              rows={3}
              placeholder="e.g. Guest requested later date"
              style={{ ...INPUT, resize: "vertical", fontFamily: "inherit" }}
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>

          {error && (
            <div style={{
              padding: "10px 12px", borderRadius: 6, fontSize: 12,
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
              color: "var(--err)",
            }}>
              {error}
            </div>
          )}
        </form>
      )}

      {/* ── LOADING STATE ── */}
      {modalState === "loading" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, minHeight: 160, color: "var(--text-3)" }}>
          <div style={{ fontSize: 28 }}>⟳</div>
          <div style={{ fontSize: 13 }}>Rescheduling booking…</div>
        </div>
      )}

      {/* ── RESULT STATE ── */}
      {modalState === "result" && result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{
            padding: "12px 14px", borderRadius: 8, fontSize: 13,
            background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)",
            color: "#4ade80", fontWeight: 600,
          }}>
            Booking rescheduled successfully.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-3)" }}>New booking ref</span>
              <span style={{ fontFamily: "var(--f-mono)", fontWeight: 700, color: "var(--text-1)", letterSpacing: "0.08em" }}>
                {result.booking.id.slice(0, 8).toUpperCase()}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-3)" }}>Original booking</span>
              <span style={{ fontFamily: "var(--f-mono)", color: "var(--text-3)", letterSpacing: "0.08em" }}>
                {result.original_booking_id.slice(0, 8).toUpperCase()} → Rescheduled
              </span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontFamily: "var(--f-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 12 }}>
              New Schedule
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "var(--text-3)" }}>Check-in</span>
                <span style={{ color: "var(--text-1)", fontWeight: 600 }}>
                  {new Date(localDatetimeToISO(newCheckIn)).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "var(--text-3)" }}>Check-out</span>
                <span style={{ color: "var(--text-1)", fontWeight: 600 }}>
                  {new Date(localDatetimeToISO(newCheckOut)).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontFamily: "var(--f-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 12 }}>
              Price Adjustment
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "var(--text-3)" }}>Price difference</span>
                <span style={{
                  fontWeight: 700,
                  color: result.price_difference > 0 ? "var(--amber-bright)" : result.price_difference < 0 ? "#4ade80" : "var(--text-1)",
                }}>
                  {result.price_difference > 0 ? "+" : ""}{peso(result.price_difference)}
                </span>
              </div>
              {result.balance_due > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-3)" }}>Balance due</span>
                  <span style={{ fontWeight: 700, color: "var(--amber-bright)" }}>{peso(result.balance_due)}</span>
                </div>
              )}
              {result.refund_due > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--text-3)" }}>Refund due</span>
                  <span style={{ fontWeight: 700, color: "#4ade80" }}>{peso(result.refund_due)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </SlideOver>
  );
}

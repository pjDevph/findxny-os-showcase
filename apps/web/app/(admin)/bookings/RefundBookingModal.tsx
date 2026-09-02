"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlideOver } from "@/components/ui/SlideOver";
import { refundBooking } from "../actions";
import { peso } from "@/lib/config";

type ModalState = "form" | "loading" | "done";

type RefundMethod = "cash" | "gcash" | "maya" | "xendit" | "bank_transfer" | "other";

const METHODS: { value: RefundMethod; label: string }[] = [
  { value: "cash",          label: "Cash" },
  { value: "gcash",         label: "GCash" },
  { value: "maya",          label: "Maya" },
  { value: "xendit",        label: "Xendit" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "other",         label: "Other" },
];

interface Props {
  bookingId: string;
  bookingRef: string;
  roomName: string;
  amountPaid: number;
  onClose: () => void;
  onSuccess: () => void;
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

export function RefundBookingModal({ bookingId, bookingRef, roomName, amountPaid, onClose, onSuccess }: Props) {
  const router = useRouter();

  const [modalState, setModalState] = useState<ModalState>("form");
  const [amount, setAmount] = useState(amountPaid.toFixed(2));
  const [method, setMethod] = useState<RefundMethod>("cash");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setError("Enter a valid refund amount.");
      return;
    }
    if (amt > amountPaid) {
      setError(`Refund amount cannot exceed amount paid (${peso(amountPaid)}).`);
      return;
    }
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }

    setModalState("loading");
    try {
      await refundBooking(bookingId, amt, method, reason.trim());
      setModalState("done");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Refund failed.");
      setModalState("form");
    }
  }

  return (
    <SlideOver
      open
      onClose={onClose}
      title="Process Refund"
      subtitle={`Ref ${bookingRef} · ${roomName}`}
      centered
      width={420}
      footer={
        modalState === "form" ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn-xs" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              form="refund-form"
              className="btn-xs danger"
              disabled={
                modalState !== "form" ||
                parseFloat(amount) <= 0 ||
                isNaN(parseFloat(amount)) ||
                parseFloat(amount) > amountPaid ||
                !reason.trim()
              }
            >
              Process Refund
            </button>
          </div>
        ) : modalState === "done" ? (
          <button
            type="button"
            className="btn-xs primary"
            onClick={() => { onSuccess(); onClose(); }}
          >
            Done
          </button>
        ) : null
      }
    >
      {modalState === "form" && (
        <form id="refund-form" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label style={LABEL}>Amount paid</label>
            <div style={{ fontSize: 13, color: "var(--text-3)", padding: "6px 0" }}>{peso(amountPaid)}</div>
          </div>

          <hr style={{ border: "none", borderTop: "1px solid rgba(var(--tint-rgb), 0.1)", margin: "2px 0" }} />

          <div>
            <label htmlFor="refund-amount" style={LABEL}>Refund amount</label>
            <input
              id="refund-amount"
              type="number"
              min="0.01"
              step="0.01"
              max={amountPaid}
              style={INPUT}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="refund-method" style={LABEL}>Method</label>
            <select
              id="refund-method"
              style={{ ...INPUT, appearance: "none" }}
              value={method}
              onChange={e => setMethod(e.target.value as RefundMethod)}
            >
              {METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="refund-reason" style={LABEL}>Reason</label>
            <textarea
              id="refund-reason"
              rows={3}
              placeholder="e.g. Guest cancelled early"
              style={{ ...INPUT, resize: "vertical", fontFamily: "inherit" }}
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
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

      {modalState === "loading" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, minHeight: 160, color: "var(--text-3)" }}>
          <div style={{ fontSize: 28 }}>⟳</div>
          <div style={{ fontSize: 13 }}>Processing refund…</div>
        </div>
      )}

      {modalState === "done" && (
        <div style={{
          padding: "12px 14px", borderRadius: 8, fontSize: 13,
          background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)",
          color: "#4ade80", fontWeight: 600,
        }}>
          Refund of {peso(parseFloat(amount))} processed successfully.
        </div>
      )}
    </SlideOver>
  );
}

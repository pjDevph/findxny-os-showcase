"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { extractErrMsg } from "@/lib/errors";

export { extractErrMsg };

/**
 * One-shot confirmation modal for destructive actions (cancel order, void
 * transaction, remove employee, etc.). Wraps the underlying async action
 * and surfaces its error inline — caller doesn't have to wire its own state.
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   <button onClick={() => setOpen(true)}>Cancel</button>
 *   <ConfirmDialog
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     title="Cancel order #1234?"
 *     body="The customer will be notified and the kitchen ticket will be voided."
 *     confirmLabel="Cancel order"
 *     tone="danger"
 *     onConfirm={async () => { await cancelOrder(id); }}
 *   />
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Keep",
  tone = "danger",
  onConfirm,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning" | "neutral";
  onConfirm: () => Promise<void> | void;
  onSuccess?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function handleClose() {
    if (busy) return;
    setErr(null);
    onClose();
  }

  async function handleConfirm() {
    setBusy(true);
    setErr(null);
    try {
      await onConfirm();
      setBusy(false);
      onSuccess?.();
      onClose();
    } catch (e: any) {
      setBusy(false);
      setErr(extractErrMsg(e));
    }
  }

  const confirmStyle: React.CSSProperties =
    tone === "danger"
      ? { background: "#ef4444", color: "#fff", borderColor: "#ef4444" }
      : tone === "warning"
      ? { background: "#f59e0b", color: "var(--on-amber)", borderColor: "#f59e0b" }
      : {};

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={handleClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn-primary" style={confirmStyle} onClick={handleConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      {body && <div style={{ color: "var(--text-2)", lineHeight: 1.55, fontSize: 14 }}>{body}</div>}
      {err && (
        <div style={{
          marginTop: 14,
          padding: "10px 12px",
          borderRadius: 8,
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.3)",
          color: "#fca5a5",
          fontSize: 13,
        }}>
          {err}
        </div>
      )}
    </Modal>
  );
}


"use client";

import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Button that opens a ConfirmDialog before running its action. Use to wrap
 * destructive server actions (cancel order, void transaction, remove
 * employee, etc.) so a stray click can't lose data.
 *
 * The `action` is awaited inside the dialog; errors surface inline via
 * extractErrMsg in the dialog itself, so the caller doesn't have to wire
 * any state.
 */
export function ConfirmActionButton({
  action,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Keep",
  tone = "danger",
  className = "btn-xs",
  style,
  onSuccess,
  children,
}: {
  action: () => Promise<void> | void;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning" | "neutral";
  className?: string;
  style?: React.CSSProperties;
  onSuccess?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} style={style} onClick={() => setOpen(true)}>
        {children}
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        body={body}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        tone={tone}
        onConfirm={action}
        onSuccess={onSuccess}
      />
    </>
  );
}

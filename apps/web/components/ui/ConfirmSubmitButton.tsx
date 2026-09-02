"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Submit button that asks for confirmation before actually submitting its form.
 * Use on dashboard create/edit/delete forms so a stray click can't mutate data.
 *
 * Targets a form either by `formId` (for buttons placed outside the <form>, e.g.
 * a Modal footer using `<button form={formId}>`) or, when `formId` is omitted,
 * the nearest ancestor <form> (for inline per-row action forms).
 */
export function ConfirmSubmitButton({
  formId,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "neutral",
  className = "btn btn-primary",
  style,
  disabled,
  children,
}: {
  formId?: string;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning" | "neutral";
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  function targetForm(): HTMLFormElement | null {
    if (formId) return document.getElementById(formId) as HTMLFormElement | null;
    return btnRef.current?.closest("form") ?? null;
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={className}
        style={style}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
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
        onConfirm={() => {
          // requestSubmit triggers the form's (server) action and native validation.
          targetForm()?.requestSubmit();
        }}
      />
    </>
  );
}

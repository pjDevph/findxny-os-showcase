"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Center-anchored modal for short forms, confirmations, and quick actions.
 * Same portal/escape/scroll-lock contract as SlideOver — different layout.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  width = 460,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      role="presentation"
      tabIndex={-1}
      aria-label="Close modal"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(8,6,4,0.65)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "flex", justifyContent: "center", alignItems: "center",
        padding: "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
      }}
    >
      <div
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        style={{
          width, maxWidth: "100%",
          maxHeight: "calc(100dvh - 32px)",
          background: "var(--bg-0, #0b0b0b)",
          border: "1px solid var(--line)",
          borderRadius: 12,
          boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
          display: "flex", flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "18px 22px 14px",
            borderBottom: "1px solid var(--line)",
            display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
            flexShrink: 0,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18, letterSpacing: "0.02em" }}>{title}</h2>
            {subtitle && (
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                {subtitle}
              </div>
            )}
          </div>
          <button type="button" className="btn-xs" onClick={onClose}>Close</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 22 }}>
          {children}
        </div>

        {footer && (
          <div
            style={{
              borderTop: "1px solid var(--line)",
              padding: "12px 22px",
              background: "rgba(0,0,0,0.4)",
              display: "flex", justifyContent: "flex-end", gap: 10,
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

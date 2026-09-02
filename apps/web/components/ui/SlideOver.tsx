"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type Tab = { id: string; label: string };

/**
 * Right-side slide-over for create/edit forms.
 * - Portaled to document.body so it escapes admin layout's containing-block traps
 *   (the .admin-header has backdrop-filter, which scopes position:fixed otherwise).
 * - Optional tabs render a header strip; the parent decides what content shows per tab.
 * - Footer is sticky at the bottom of the panel; pass the CTA(s) here.
 * - Body scroll is locked while open.
 */
export function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  width = 520,
  centered = false,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  tabs?: Tab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  width?: number;
  /** Render as a centered modal card instead of a right-side drawer. */
  centered?: boolean;
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
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(8,6,4,0.62)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "flex",
        justifyContent: centered ? "center" : "flex-end",
        alignItems: centered ? "center" : "stretch",
        padding: centered
          ? "max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left))"
          : 0,
      }}
    >
      <div
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        style={{
          width, maxWidth: "100%",
          height: centered ? "auto" : "100%",
          maxHeight: centered ? "92vh" : "100%",
          background: "var(--bg-0, #0b0b0b)",
          border: centered ? "1px solid var(--line)" : undefined,
          borderLeft: centered ? undefined : "1px solid var(--line)",
          borderRadius: centered ? 14 : 0,
          boxShadow: centered ? "0 24px 80px rgba(0,0,0,0.6)" : "-32px 0 80px rgba(0,0,0,0.6)",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "20px 24px 14px",
            borderBottom: "1px solid var(--line)",
            display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
            flexShrink: 0,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 20, letterSpacing: "0.02em" }}>{title}</h2>
            {subtitle && (
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                {subtitle}
              </div>
            )}
          </div>
          <button type="button" className="btn-xs" onClick={onClose}>Close</button>
        </div>

        {tabs && tabs.length > 0 && (
          <div
            style={{
              display: "flex", gap: 4, padding: "8px 16px",
              borderBottom: "1px solid var(--line)",
              flexShrink: 0,
            }}
          >
            {tabs.map((t) => {
              const active = t.id === activeTab;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTabChange?.(t.id)}
                  style={{
                    padding: "8px 14px", fontSize: 12, letterSpacing: "0.08em",
                    textTransform: "uppercase", fontFamily: "var(--f-mono)",
                    background: active ? "rgba(var(--tint-rgb), 0.12)" : "transparent",
                    color: active ? "var(--amber-bright)" : "var(--text-3)",
                    border: "1px solid",
                    borderColor: active ? "rgba(var(--tint-rgb), 0.35)" : "transparent",
                    borderRadius: 6, cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {children}
        </div>

        {footer && (
          <div
            style={{
              borderTop: "1px solid var(--line)",
              padding: "14px 24px",
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

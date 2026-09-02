"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Typed-confirmation phrase — keeps the destructive guard without baking a
// shared secret into client code. The edge function still enforces role.
const CONFIRM_PHRASE = "DELETE";

export function DeleteProductButton({
  productName,
  deleteAction,
}: {
  productName: string;
  deleteAction: () => Promise<void>;
}) {
  const [mounted,  setMounted]  = useState(false);
  const [open,     setOpen]     = useState(false);
  const [step,     setStep]     = useState<"confirm" | "password" | "running">("confirm");
  const [pw,       setPw]       = useState("");
  const [pwErr,    setPwErr]    = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  function openModal() {
    setStep("confirm"); setPw(""); setPwErr(false); setError(null); setOpen(true);
  }

  function close() {
    if (step === "running") return;
    setOpen(false);
    setTimeout(() => { setStep("confirm"); setPw(""); setPwErr(false); setError(null); }, 250);
  }

  function handleConfirm() {
    setStep("password");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function handleDelete() {
    if (pw.trim() !== CONFIRM_PHRASE) { setPwErr(true); inputRef.current?.focus(); return; }
    setStep("running");
    try {
      await deleteAction();
      // Page revalidates server-side — modal will close as the row disappears
      setOpen(false);
    } catch (err: any) {
      setError(err?.message ?? "Delete failed");
      setStep("password");
    }
  }

  return (
    <>
      <button className="btn-xs danger" onClick={openModal}>
        Delete
      </button>

      {open && mounted && createPortal(
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,.72)", backdropFilter: "blur(3px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "24px 16px",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          role="button"
          tabIndex={0}
          aria-label="Close dialog"
          onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); close(); } }}
        >
          <div
            style={{
              width: "100%", maxWidth: 380,
              background: "var(--surface-2,#1a1a1a)",
              border: "1px solid rgba(239,68,68,.4)", borderRadius: 16,
              padding: 26, boxShadow: "0 32px 96px rgba(0,0,0,.9)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#fca5a5" }}>Delete Product</div>
                <div style={{ fontSize: 12, color: "var(--text-3,#666)", marginTop: 3, lineHeight: 1.5 }}>
                  <span style={{ color: "var(--text-2,#ccc)", fontWeight: 600 }}>&quot;{productName}&quot;</span>
                </div>
              </div>
              {step !== "running" && (
                <button
                  onClick={close}
                  style={{ background: "none", border: "none", color: "var(--text-3,#666)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 6px", flexShrink: 0 }}
                >×</button>
              )}
            </div>

            {/* ── Step: confirm ── */}
            {step === "confirm" && (
              <>
                <div style={{
                  background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.22)",
                  borderRadius: 10, padding: "11px 13px", marginBottom: 18, fontSize: 12,
                  color: "var(--text-2,#ccc)", lineHeight: 1.65,
                }}>
                  ⚠ This removes the product from your catalog. If it has order history it will
                  be archived instead of permanently deleted.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-xs" onClick={close} style={{ flex: 1, justifyContent: "center" }}>Cancel</button>
                  <button className="btn-xs danger" onClick={handleConfirm} style={{ flex: 2, justifyContent: "center", fontWeight: 800 }}>
                    Yes, delete it
                  </button>
                </div>
              </>
            )}

            {/* ── Step: password ── */}
            {(step === "password" || step === "running") && (
              <>
                <div style={{ fontSize: 12, color: "var(--text-2,#ccc)", marginBottom: 10, lineHeight: 1.6 }}>
                  Type <strong style={{ color: "#fca5a5" }}>{CONFIRM_PHRASE}</strong> to confirm.
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={CONFIRM_PHRASE}
                  value={pw}
                  onChange={(e) => { setPw(e.target.value); setPwErr(false); setError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && handleDelete()}
                  disabled={step === "running"}
                  autoCapitalize="characters"
                  spellCheck={false}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "9px 12px", borderRadius: 8, marginBottom: 6,
                    background: "var(--surface-3,#111)",
                    border: `1px solid ${pwErr ? "#ef4444" : "var(--border-2,#333)"}`,
                    color: "var(--text-1,#fff)", fontSize: 13, outline: "none",
                    opacity: step === "running" ? 0.5 : 1,
                  }}
                />
                {pwErr && (
                  <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 8 }}>Type {CONFIRM_PHRASE} exactly.</div>
                )}
                {error && (
                  <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 8 }}>⚠ {error}</div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: (pwErr || error) ? 0 : 10 }}>
                  <button className="btn-xs" onClick={() => setStep("confirm")} disabled={step === "running"} style={{ flex: 1, justifyContent: "center" }}>Back</button>
                  <button
                    className="btn-xs danger"
                    onClick={handleDelete}
                    disabled={step === "running"}
                    style={{ flex: 2, justifyContent: "center", fontWeight: 800 }}
                  >
                    {step === "running" ? "Deleting…" : "Confirm Delete"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

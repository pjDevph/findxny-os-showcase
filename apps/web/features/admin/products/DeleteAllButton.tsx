"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Typed-confirmation phrase — destructive guard without a baked-in secret.
// The edge function (products-delete) still enforces the admin/owner role.
// (Menu-book hotspots are now server-side; on product delete the DB cascade
// nulls `menu_book_hotspots.product_id` automatically.)
const CONFIRM_PHRASE = "DELETE ALL";

export function DeleteAllButton({
  deleteAllAction,
  count,
}: {
  deleteAllAction: () => Promise<{ deleted: number; softDeleted: number; errors: string[] }>;
  count: number;
}) {
  const [mounted, setMounted] = useState(false);
  const [open,    setOpen]    = useState(false);
  const [step,    setStep]    = useState<"confirm" | "password" | "running" | "done">("confirm");
  const [pw,      setPw]      = useState("");
  const [pwErr,   setPwErr]   = useState(false);
  const [result,  setResult]  = useState<{ deleted: number; softDeleted: number; errors: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Track mount so we can safely use createPortal (document.body not available during SSR)
  useEffect(() => { setMounted(true); }, []);

  function openModal() {
    setStep("confirm"); setPw(""); setPwErr(false); setResult(null); setOpen(true);
  }
  function close() {
    setOpen(false);
    setTimeout(() => { setStep("confirm"); setPw(""); setPwErr(false); setResult(null); }, 300);
  }

  function handleConfirm() {
    setStep("password");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function handleDelete() {
    if (pw.trim() !== CONFIRM_PHRASE) { setPwErr(true); inputRef.current?.focus(); return; }
    setStep("running");
    try {
      const res = await deleteAllAction();
      setResult(res);
      setStep("done");
    } catch (err: any) {
      setResult({ deleted: 0, softDeleted: 0, errors: [err?.message ?? "Failed"] });
      setStep("done");
    }
  }

  return (
    <>
      <button
        className="btn-xs danger"
        onClick={openModal}
        disabled={count === 0}
        style={{ opacity: count === 0 ? 0.4 : 1 }}
      >
        🗑 Delete All
      </button>

      {open && mounted && createPortal(
        /* Rendered into document.body — escapes any parent transform/stacking context */
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,.72)", backdropFilter: "blur(3px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "max(24px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
          }}
          onClick={step === "running" ? undefined : (e) => { if (e.target === e.currentTarget) close(); }}
          role="button"
          tabIndex={0}
          aria-label="Close dialog"
          onKeyDown={step === "running" ? undefined : (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); close(); } }}
        >
          {/* Modal — scrollable if content is taller than viewport */}
          <div
            style={{
              width: "100%", maxWidth: 420,
              maxHeight: "calc(100dvh - 48px)", overflowY: "auto",
              background: "var(--surface-2,#1a1a1a)",
              border: "1px solid rgba(239,68,68,.4)", borderRadius: 18,
              padding: 30, boxShadow: "0 32px 96px rgba(0,0,0,.9)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: "#fca5a5" }}>🗑 Delete All Products</div>
                <div style={{ fontSize: 12, color: "var(--text-3,#666)", marginTop: 4 }}>
                  Permanently remove all {count} products from the catalog.
                </div>
              </div>
              {step !== "running" && (
                <button
                  onClick={close}
                  style={{ background: "none", border: "none", color: "var(--text-3,#666)", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: "2px 6px", flexShrink: 0 }}
                >×</button>
              )}
            </div>

            {/* ── Step: confirm ── */}
            {step === "confirm" && (
              <>
                <div style={{
                  background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.25)",
                  borderRadius: 10, padding: "12px 14px", marginBottom: 20, fontSize: 13,
                  color: "var(--text-2,#ccc)", lineHeight: 1.65,
                }}>
                  ⚠ This cannot be undone. All product data, prices, and settings will be
                  permanently erased. Categories will remain. Tap areas linked to products
                  will be automatically unlinked.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-xs" onClick={close} style={{ flex: 1, justifyContent: "center" }}>Cancel</button>
                  <button className="btn-xs danger" onClick={handleConfirm} style={{ flex: 2, justifyContent: "center", fontWeight: 800 }}>
                    Yes, delete all {count} products
                  </button>
                </div>
              </>
            )}

            {/* ── Step: password ── */}
            {step === "password" && (
              <>
                <div style={{ fontSize: 13, color: "var(--text-2,#ccc)", marginBottom: 12, lineHeight: 1.6 }}>
                  Type <strong style={{ color: "#fca5a5" }}>{CONFIRM_PHRASE}</strong> to confirm this action.
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={CONFIRM_PHRASE}
                  value={pw}
                  onChange={(e) => { setPw(e.target.value); setPwErr(false); }}
                  onKeyDown={(e) => e.key === "Enter" && handleDelete()}
                  autoCapitalize="characters"
                  spellCheck={false}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "10px 12px", borderRadius: 8, marginBottom: 6,
                    background: "var(--surface-3,#111)",
                    border: `1px solid ${pwErr ? "#ef4444" : "var(--border-2,#333)"}`,
                    color: "var(--text-1,#fff)", fontSize: 14, outline: "none",
                  }}
                />
                {pwErr && (
                  <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 8 }}>
                    Type {CONFIRM_PHRASE} exactly to proceed.
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: pwErr ? 0 : 12 }}>
                  <button className="btn-xs" onClick={() => setStep("confirm")} style={{ flex: 1, justifyContent: "center" }}>Back</button>
                  <button className="btn-xs danger" onClick={handleDelete} style={{ flex: 2, justifyContent: "center", fontWeight: 800 }}>
                    Confirm Delete
                  </button>
                </div>
              </>
            )}

            {/* ── Step: running ── */}
            {step === "running" && (
              <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-2,#aaa)", fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 14 }}>⏳</div>
                Deleting {count} products…
                <div style={{ fontSize: 11, color: "var(--text-3,#555)", marginTop: 6 }}>
                  Please wait, this may take a moment.
                </div>
              </div>
            )}

            {/* ── Step: done ── */}
            {step === "done" && result && (
              <>
                {(result.deleted > 0 || result.softDeleted > 0) && (
                  <div style={{
                    padding: "12px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13,
                    background: "rgba(56,211,159,.08)", border: "1px solid rgba(56,211,159,.3)",
                    color: "#38d39f", fontWeight: 700, lineHeight: 1.6,
                  }}>
                    {result.deleted > 0 && (
                      <div>✓ {result.deleted} product{result.deleted !== 1 ? "s" : ""} permanently deleted</div>
                    )}
                    {result.softDeleted > 0 && (
                      <div style={{ color: "#f59e0b", fontWeight: 600, fontSize: 12, marginTop: 2 }}>
                        ⚠ {result.softDeleted} product{result.softDeleted !== 1 ? "s" : ""} archived (had order history — hidden from menu)
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "rgba(56,211,159,.7)", marginTop: 4, fontWeight: 400 }}>
                      Menu-book tap areas have been unlinked.
                    </div>
                  </div>
                )}
                {result.errors.length > 0 && (
                  <div style={{
                    padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 12,
                    background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.3)",
                    color: "#fca5a5",
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                      {result.errors.length} item{result.errors.length !== 1 ? "s" : ""} could not be removed:
                    </div>
                    {result.errors.map((e, i) => (
                      <div key={i} style={{ marginBottom: 4, lineHeight: 1.4 }}>⚠ {e}</div>
                    ))}
                  </div>
                )}
                <button className="btn-xs primary" onClick={close} style={{ width: "100%", justifyContent: "center" }}>
                  Close
                </button>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

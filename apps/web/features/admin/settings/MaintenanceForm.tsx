"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "@/lib/toast";

export function MaintenanceForm({
  currentlyOn,
  currentMessage,
  saveAction,
}: Readonly<{
  currentlyOn: boolean;
  currentMessage?: string | null;
  saveAction: (fd: FormData) => Promise<void>;
}>) {
  const formRef  = useRef<HTMLFormElement>(null);
  const [checked, setChecked] = useState(currentlyOn);
  const [message, setMessage] = useState(currentMessage ?? "");
  const [confirmMode, setConfirmMode] = useState<"enable" | "disable" | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Turning ON: confirm before applying
    if (checked && !currentlyOn) { setConfirmMode("enable"); return; }
    // Turning OFF: confirm before removing
    if (!checked && currentlyOn) { setConfirmMode("disable"); return; }
    // No state change — just save message update
    await submit();
  }

  async function submit() {
    if (!formRef.current) return;
    setSaving(true);
    const fd = new FormData(formRef.current);
    try {
      await saveAction(fd);
      if (checked && !currentlyOn)  toast("Maintenance mode enabled — customers are now redirected.", "info");
      else if (!checked && currentlyOn) toast("Maintenance mode disabled — site is live again.", "add");
      else toast("Maintenance settings saved.", "info");
    } catch (e: any) {
      toast(`Failed to save: ${e?.message ?? "Please try again."}`, "remove");
    } finally {
      setSaving(false);
      setConfirmMode(null);
    }
  }

  return (
    <>
      <form ref={formRef} onSubmit={handleSubmit}>
        <div style={{ display: "grid", gap: 16 }}>

          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              name="maintenance_mode"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: "var(--amber-bright)" }}
            />
            <span style={{ fontSize: 14, color: "var(--text-0)" }}>
              Enable maintenance mode{" "}
              <span style={{
                fontSize: 12,
                color: checked ? "var(--err)" : "var(--ok)",
                fontFamily: "var(--f-mono)",
              }}>
                ({checked ? "ON" : "off"})
              </span>
            </span>
          </label>

          {checked && (
            <div style={{
              padding: "10px 14px",
              background: "rgba(239,68,68,0.07)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: 8,
              fontSize: 13,
              color: "var(--err)",
              lineHeight: 1.5,
            }}>
              ⚠ Customers will be redirected to the maintenance page. Staff with accounts can still browse normally.
            </div>
          )}

          <div className="admin-field">
            <label htmlFor="maint-msg">Notice shown to customers (optional)</label>
            <textarea
              id="maint-msg"
              className="input"
              name="maintenance_message"
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="We're closed for a private event today and will reopen tomorrow at 7am."
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={saving}
              style={{ fontSize: 13, padding: "10px 24px" }}
            >
              {saving ? "Saving…" : "Save maintenance setting"}
            </button>

            <Link
              href="/maintenance"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: "var(--amber-bright)", textDecoration: "underline" }}
            >
              Preview maintenance page →
            </Link>
          </div>

          <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0, lineHeight: 1.6 }}>
            💡 Staff who are signed in always see the normal site.
            To see the maintenance page as a customer, open an{" "}
            <strong>incognito / private window</strong>.
          </p>
        </div>
      </form>

      {/* Enable confirmation */}
      <ConfirmDialog
        open={confirmMode === "enable"}
        onClose={() => setConfirmMode(null)}
        title="Enable maintenance mode?"
        body={
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0 }}>
              Customers will be immediately redirected to the maintenance page.
              They will <strong>not</strong> be able to place orders or make bookings
              until you turn maintenance mode off.
            </p>
            {message.trim() && (
              <div style={{
                padding: "10px 14px",
                background: "rgba(var(--tint-rgb), 0.06)",
                border: "1px solid rgba(var(--tint-rgb), 0.2)",
                borderRadius: 8,
                fontSize: 13,
                color: "var(--text-2)",
                fontStyle: "italic",
              }}>
                &ldquo;{message.trim()}&rdquo;
              </div>
            )}
          </div>
        }
        confirmLabel="Yes, enable maintenance"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={submit}
      />

      {/* Disable confirmation */}
      <ConfirmDialog
        open={confirmMode === "disable"}
        onClose={() => setConfirmMode(null)}
        title="Disable maintenance mode?"
        body={
          <p style={{ margin: 0 }}>
            The site will go live immediately. Customers will be able to browse,
            order, and make bookings again.
          </p>
        }
        confirmLabel="Yes, bring site back online"
        cancelLabel="Keep in maintenance"
        tone="neutral"
        onConfirm={submit}
      />
    </>
  );
}

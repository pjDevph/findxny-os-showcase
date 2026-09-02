"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";

type Branch = { id: string; name: string };
const ROLES = ["owner", "admin", "manager", "cashier", "kitchen"] as const;

export function InviteEmployee({
  branches,
  inviteAction,
  canGrantOwner,
}: {
  branches: Branch[];
  inviteAction: (formData: FormData) => Promise<void>;
  canGrantOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [posAccess, setPosAccess] = useState(false);
  const [email, setEmail] = useState("");
  const [posUsername, setPosUsername] = useState("");
  const [posPin, setPosPin] = useState("");
  const formId = "invite-employee-form";
  const canSubmit = !!email.trim() && (!posAccess || (!!posUsername.trim() && posPin.length >= 4));

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        + Invite member
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Invite team member"
        subtitle="A magic-link email will be sent."
        footer={
          <>
            <span style={{ fontSize: 12, color: "var(--text-3)", marginRight: "auto" }}>* Required</span>
            <button type="button" className="btn-xs" onClick={() => setOpen(false)}>Cancel</button>
            <ConfirmSubmitButton
              formId={formId}
              disabled={!canSubmit}
              title="Send invite?"
              body="A magic-link invitation email will be sent to this address."
              confirmLabel="Send invite"
            >
              Send invite
            </ConfirmSubmitButton>
          </>
        }
      >
        <form
          id={formId}
          action={async (fd) => { await inviteAction(fd); setOpen(false); }}
          style={{ display: "grid", gap: 14 }}
        >
          <div className="admin-field">
            <label htmlFor="inv-email">Email *</label>
            <input id="inv-email" className="input" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="name@company.com" />
          </div>
          <div className="admin-field">
            <label htmlFor="inv-full-name">Full name (optional)</label>
            <input id="inv-full-name" className="input" name="full_name" />
          </div>
          <div className="admin-field">
            <label htmlFor="inv-role">Role</label>
            <select id="inv-role" className="input" name="role" defaultValue="cashier" required>
              {ROLES.filter((r) => r !== "owner" || canGrantOwner).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label htmlFor="inv-branch">Branch (optional — blank = all branches)</label>
            <select id="inv-branch" className="input" name="branch_id" defaultValue="">
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0 }}>
            If the address already has an account they&apos;ll be added directly without a fresh email.
          </p>

          {/* POS access */}
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, display: "grid", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={posAccess}
                onChange={e => setPosAccess(e.target.checked)}
              />
              <span style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 500 }}>
                Also grant POS app access
              </span>
            </label>
            {posAccess && (
              <div style={{ display: "grid", gap: 10, paddingLeft: 26 }}>
                <div className="admin-field">
                  <label htmlFor="inv-pos-username">POS username *</label>
                  <input
                    id="inv-pos-username" className="input" name="pos_username"
                    value={posUsername} onChange={e => setPosUsername(e.target.value)}
                    placeholder="e.g. maria_s" autoComplete="off"
                    pattern="[a-z0-9_]+" title="Lowercase letters, numbers, underscores only"
                    required={posAccess}
                  />
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                    Lowercase letters, numbers and underscores only
                  </span>
                </div>
                <div className="admin-field">
                  <label htmlFor="inv-pos-pin">POS PIN (4–6 digits) *</label>
                  <input
                    id="inv-pos-pin" className="input" name="pos_pin"
                    value={posPin} onChange={e => setPosPin(e.target.value)}
                    type="password" inputMode="numeric"
                    placeholder="••••" autoComplete="new-password"
                    minLength={4} maxLength={6}
                    pattern="\d{4,6}" title="4 to 6 digit PIN"
                    required={posAccess}
                  />
                </div>
              </div>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}

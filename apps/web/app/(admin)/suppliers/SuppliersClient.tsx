"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminClient } from "@/lib/admin-client";
import { SlideOver } from "@/components/ui/SlideOver";

// ── Types ──────────────────────────────────────────────────────────────────

interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  ingredient_count?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = {
  fontFamily: "var(--f-mono)",
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

const GREEN = "#22c55e";
const GREEN_DIM = "rgba(34,197,94,0.10)";
const GREEN_BORDER = "rgba(34,197,94,0.22)";

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "60px 24px", gap: 12, textAlign: "center",
    }}>
      <div style={{ fontSize: 36, opacity: 0.4 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--text-3)", maxWidth: 340, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      flex: "1 1 160px",
      padding: "16px 20px",
      borderRadius: 10,
      background: GREEN_DIM,
      border: `1px solid ${GREEN_BORDER}`,
      minWidth: 140,
    }}>
      <div style={{ ...MONO, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: GREEN, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Field row ──────────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ ...MONO, display: "block", marginBottom: 6 }}>
        {label}{required && <span style={{ color: "var(--err, #ff5050)", marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

// ── Supplier Form ──────────────────────────────────────────────────────────

function SupplierForm({
  workspaceId,
  initial,
  onSaved,
  onCancel,
}: {
  workspaceId: string;
  initial?: Supplier | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName]               = useState(initial?.name ?? "");
  const [contactName, setContactName] = useState(initial?.contact_name ?? "");
  const [phone, setPhone]             = useState(initial?.phone ?? "");
  const [email, setEmail]             = useState(initial?.email ?? "");
  const [address, setAddress]         = useState(initial?.address ?? "");
  const [notes, setNotes]             = useState(initial?.notes ?? "");
  const [isActive, setIsActive]       = useState(initial?.is_active ?? true);

  const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box" };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr("Name is required."); return; }
    setErr(null);
    setSaving(true);
    try {
      await adminClient.suppliersUpsert({
        workspace_id: workspaceId,
        supplier_id:  initial?.id,
        name:         name.trim(),
        contact_name: contactName.trim() || undefined,
        phone:        phone.trim()       || undefined,
        email:        email.trim()       || undefined,
        address:      address.trim()     || undefined,
        notes:        notes.trim()       || undefined,
        is_active:    isActive,
      });
      onSaved();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Failed to save supplier.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {err && (
        <div style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8,
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          color: "var(--err, #ff5050)", fontSize: 13,
        }}>
          {err}
        </div>
      )}

      <Field label="Name" required>
        <input type="text" className="input" style={inputStyle}
          placeholder="Supplier company name" value={name}
          onChange={e => setName(e.target.value)} maxLength={200} required />
      </Field>

      <Field label="Contact Name">
        <input type="text" className="input" style={inputStyle}
          placeholder="Primary contact person" value={contactName}
          onChange={e => setContactName(e.target.value)} maxLength={200} />
      </Field>

      <Field label="Phone">
        <input type="text" className="input" style={inputStyle}
          placeholder="+63 9XX XXX XXXX" value={phone}
          onChange={e => setPhone(e.target.value)} maxLength={50} />
      </Field>

      <Field label="Email">
        <input type="email" className="input" style={inputStyle}
          placeholder="supplier@example.com" value={email}
          onChange={e => setEmail(e.target.value)} maxLength={300} />
      </Field>

      <Field label="Address">
        <textarea className="input" style={{ ...inputStyle, resize: "vertical", minHeight: 72 }}
          placeholder="Street address…" value={address}
          onChange={e => setAddress(e.target.value)} maxLength={500} />
      </Field>

      <Field label="Notes">
        <textarea className="input" style={{ ...inputStyle, resize: "vertical", minHeight: 72 }}
          placeholder="Optional notes…" value={notes}
          onChange={e => setNotes(e.target.value)} maxLength={1000} />
      </Field>

      <Field label="Status">
        <label style={{
          display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
          fontSize: 13, color: "var(--text-2)",
        }}>
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: GREEN }} />
          Active supplier
        </label>
      </Field>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
        <button type="button" className="btn-xs" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-xs primary" disabled={saving || !name.trim()}
          style={{ background: GREEN_DIM, borderColor: GREEN_BORDER, color: GREEN }}>
          {saving ? "Saving…" : initial ? "Save Changes" : "Add Supplier"}
        </button>
      </div>
    </form>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function SuppliersClient({ workspaceId }: { workspaceId: string }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading]     = useState(false);
  const [loadErr, setLoadErr]     = useState<string | null>(null);

  const [showInactive, setShowInactive] = useState(false);

  // SlideOver state
  const [formOpen, setFormOpen]     = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting]           = useState(false);
  const [deleteErr, setDeleteErr]         = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await adminClient.suppliersList({ workspace_id: workspaceId, include_inactive: true });
      setSuppliers((res.suppliers ?? []) as Supplier[]);
    } catch (ex: unknown) {
      setLoadErr(ex instanceof Error ? ex.message : "Failed to load suppliers.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void fetchSuppliers(); }, [fetchSuppliers]);

  // ── Derived stats ──────────────────────────────────────────────────────

  const active   = useMemo(() => suppliers.filter(s => s.is_active), [suppliers]);
  const inactive = useMemo(() => suppliers.filter(s => !s.is_active), [suppliers]);
  const linkedCount = useMemo(
    () => suppliers.reduce((sum, s) => sum + (s.ingredient_count ?? 0), 0),
    [suppliers],
  );
  const displayed = useMemo(
    () => showInactive ? suppliers : active,
    [suppliers, active, showInactive],
  );

  // ── Delete ─────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    setDeleting(true);
    setDeleteErr(null);
    try {
      await adminClient.suppliersDelete({ workspace_id: workspaceId, supplier_id: id });
      setDeleteConfirm(null);
      void fetchSuppliers();
    } catch (ex: unknown) {
      setDeleteErr(ex instanceof Error ? ex.message : "Failed to delete supplier.");
    } finally {
      setDeleting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Header ── */}
      <div className="admin-header">
        <div>
          <h1 style={{ color: GREEN }}>Suppliers</h1>
          <div className="sub">Manage ingredient suppliers and vendor contacts.</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button
            className="btn-xs primary"
            style={{ fontSize: 13, padding: "8px 16px", background: GREEN_DIM, borderColor: GREEN_BORDER, color: GREEN }}
            onClick={() => { setEditTarget(null); setFormOpen(true); }}
          >
            + Add Supplier
          </button>
        </div>
      </div>

      <div className="admin-body">
        {/* ── Stat cards ── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <StatCard label="Total Suppliers" value={suppliers.length} sub="including inactive" />
          <StatCard label="Active"          value={active.length}    sub="currently active" />
          <StatCard label="Inactive"        value={inactive.length}  sub="deactivated" />
          <StatCard label="Linked Ingredients" value={linkedCount}   sub="across all suppliers" />
        </div>

        {/* ── Filter bar ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
          padding: "10px 14px", borderRadius: 8,
          background: GREEN_DIM, border: `1px solid ${GREEN_BORDER}`,
        }}>
          <label style={{
            display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
            fontSize: 13, color: "var(--text-2)",
          }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: GREEN }} />
            Show inactive
          </label>
          <span style={{ ...MONO, marginLeft: "auto" }}>
            {displayed.length} supplier{displayed.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ── Error ── */}
        {loadErr && (
          <div style={{
            marginBottom: 14, padding: "10px 14px", borderRadius: 8,
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
            color: "var(--err, #ff5050)", fontSize: 13,
          }}>
            {loadErr}
            <button className="btn-xs" style={{ marginLeft: 12 }} onClick={() => void fetchSuppliers()}>
              Retry
            </button>
          </div>
        )}

        {/* ── Table ── */}
        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
            Loading suppliers…
          </div>
        ) : displayed.length === 0 ? (
          <EmptyState
            icon="🏭"
            title="No suppliers yet"
            body='Add your first supplier to start tracking vendors and link them to ingredients.'
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Linked Ingredients</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(s => (
                  <>
                    <tr key={s.id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)" }}>{s.name}</div>
                        {s.address && (
                          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.address}
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: 13, color: "var(--text-2)" }}>
                          {s.contact_name ?? <span className="dim" style={{ fontStyle: "italic" }}>—</span>}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 12, color: "var(--text-2)", fontFamily: "var(--f-mono)" }}>
                          {s.phone ?? <span className="dim" style={{ fontStyle: "italic", fontFamily: "inherit" }}>—</span>}
                        </span>
                      </td>
                      <td style={{ maxWidth: 200 }}>
                        {s.email ? (
                          <a href={`mailto:${s.email}`} style={{ fontSize: 12, color: GREEN, textDecoration: "none" }}>
                            {s.email}
                          </a>
                        ) : (
                          <span className="dim" style={{ fontSize: 12, fontStyle: "italic" }}>—</span>
                        )}
                      </td>
                      <td>
                        <span style={{
                          display: "inline-block", padding: "2px 10px", borderRadius: 4,
                          fontSize: 12, fontWeight: 600,
                          background: GREEN_DIM, color: GREEN, border: `1px solid ${GREEN_BORDER}`,
                        }}>
                          {s.ingredient_count ?? 0}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 4,
                          fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
                          background: s.is_active ? GREEN_DIM : "rgba(120,120,120,0.1)",
                          color: s.is_active ? GREEN : "var(--text-3)",
                          border: `1px solid ${s.is_active ? GREEN_BORDER : "rgba(120,120,120,0.2)"}`,
                        }}>
                          {s.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <button
                            className="btn-xs"
                            title="Edit supplier"
                            onClick={() => { setEditTarget(s); setFormOpen(true); setDeleteConfirm(null); }}
                          >
                            ✏️
                          </button>
                          {deleteConfirm !== s.id ? (
                            <button
                              className="btn-xs"
                              title="Delete supplier"
                              style={{ color: "var(--err, #ff5050)", borderColor: "rgba(239,68,68,0.3)" }}
                              onClick={() => { setDeleteConfirm(s.id); setDeleteErr(null); }}
                            >
                              🗑️
                            </button>
                          ) : (
                            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{ fontSize: 12, color: "var(--err, #ff5050)" }}>Delete?</span>
                              <button
                                className="btn-xs"
                                style={{ color: "var(--err, #ff5050)", borderColor: "rgba(239,68,68,0.3)" }}
                                disabled={deleting}
                                onClick={() => void handleDelete(s.id)}
                              >
                                {deleting ? "…" : "Yes"}
                              </button>
                              <button className="btn-xs" onClick={() => setDeleteConfirm(null)}>No</button>
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {deleteErr && deleteConfirm === s.id && (
                      <tr key={`${s.id}-err`}>
                        <td colSpan={7}>
                          <div style={{ padding: "6px 12px", fontSize: 12, color: "var(--err, #ff5050)" }}>
                            {deleteErr}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit SlideOver ── */}
      <SlideOver
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editTarget ? "Edit Supplier" : "Add Supplier"}
        subtitle={editTarget ? `Editing: ${editTarget.name}` : "Register a new vendor"}
        width={480}
      >
        <SupplierForm
          workspaceId={workspaceId}
          initial={editTarget}
          onSaved={() => { setFormOpen(false); void fetchSuppliers(); }}
          onCancel={() => setFormOpen(false)}
        />
      </SlideOver>
    </>
  );
}

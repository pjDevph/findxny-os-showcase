"use client";

import { useCallback, useEffect, useState } from "react";
import { adminClient } from "@/lib/admin-client";
import { SlideOver } from "@/components/ui/SlideOver";

// ── Types ──────────────────────────────────────────────────────────────────

interface ChecklistItem {
  id?: string;
  name: string;
  description?: string;
  sort_order: number;
}

interface Checklist {
  id: string;
  name: string;
  schedule: string;
  assigned_role: string | null;
  is_active: boolean;
  sort_order: number;
  items: ChecklistItem[];
}

interface CompletionItem {
  id: string;
  name: string;
  description?: string | null;
  sort_order: number;
  completed_at?: string | null;
  completed_by_name?: string | null;
  notes?: string | null;
}

interface TodayChecklist {
  id: string;
  name: string;
  schedule: string;
  assigned_role: string | null;
  items: CompletionItem[];
}

type Tab = "checklists" | "today";

// ── Helpers ────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = {
  fontFamily: "var(--f-mono)",
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

const INDIGO       = "#6366f1";
const INDIGO_DIM   = "rgba(99,102,241,0.10)";
const INDIGO_BORDER= "rgba(99,102,241,0.22)";

const SCHEDULES = [
  { value: "daily",        label: "Daily" },
  { value: "weekly",       label: "Weekly" },
  { value: "shift_open",   label: "Shift Open" },
  { value: "shift_close",  label: "Shift Close" },
  { value: "monthly",      label: "Monthly" },
  { value: "once",         label: "Once" },
];

const ROLES = [
  { value: "",          label: "Any" },
  { value: "cashier",   label: "Cashier" },
  { value: "manager",   label: "Manager" },
  { value: "kitchen",   label: "Kitchen" },
];

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString("en-PH", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function scheduleBadge(schedule: string) {
  const colors: Record<string, { bg: string; color: string; border: string }> = {
    daily:       { bg: INDIGO_DIM, color: INDIGO, border: INDIGO_BORDER },
    weekly:      { bg: "rgba(245,158,11,0.10)", color: "#f59e0b", border: "rgba(245,158,11,0.22)" },
    shift_open:  { bg: "rgba(34,197,94,0.10)",  color: "#22c55e", border: "rgba(34,197,94,0.22)" },
    shift_close: { bg: "rgba(239,68,68,0.10)",  color: "#ef4444", border: "rgba(239,68,68,0.22)" },
    monthly:     { bg: "rgba(168,85,247,0.10)", color: "#a855f7", border: "rgba(168,85,247,0.22)" },
    once:        { bg: "rgba(120,120,120,0.10)",color: "var(--text-3)", border: "rgba(120,120,120,0.2)" },
  };
  const c = colors[schedule] ?? colors.once;
  const label = SCHEDULES.find(s => s.value === schedule)?.label ?? schedule;
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 4,
      fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>
      {label}
    </span>
  );
}

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

// ── Checklist Form ─────────────────────────────────────────────────────────

function ChecklistForm({
  workspaceId,
  initial,
  onSaved,
  onCancel,
}: {
  workspaceId: string;
  initial?: Checklist | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState<string | null>(null);

  const [name,         setName]         = useState(initial?.name ?? "");
  const [schedule,     setSchedule]     = useState(initial?.schedule ?? "daily");
  const [assignedRole, setAssignedRole] = useState(initial?.assigned_role ?? "");
  const [isActive,     setIsActive]     = useState(initial?.is_active ?? true);
  const [items,        setItems]        = useState<{ name: string; description: string }[]>(
    initial?.items.map(i => ({ name: i.name, description: i.description ?? "" })) ?? [{ name: "", description: "" }],
  );

  const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box" };

  function addItem() {
    setItems(prev => [...prev, { name: "", description: "" }]);
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: "name" | "description", val: string) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  }

  function moveItem(idx: number, dir: -1 | 1) {
    const next = [...items];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setItems(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr("Name is required."); return; }
    const validItems = items.filter(i => i.name.trim());
    if (validItems.length === 0) { setErr("Add at least one checklist item."); return; }
    setErr(null);
    setSaving(true);
    try {
      await adminClient.tasksUpsertChecklist({
        workspace_id:  workspaceId,
        checklist_id:  initial?.id,
        name:          name.trim(),
        schedule,
        assigned_role: assignedRole || null,
        is_active:     isActive,
        items:         validItems.map((item, i) => ({
          name:        item.name.trim(),
          description: item.description.trim() || undefined,
          sort_order:  i,
        })),
      });
      onSaved();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Failed to save checklist.");
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
          placeholder="e.g. Opening Checklist" value={name}
          onChange={e => setName(e.target.value)} maxLength={200} required />
      </Field>

      <Field label="Schedule" required>
        <select className="input" style={inputStyle} value={schedule}
          onChange={e => setSchedule(e.target.value)}>
          {SCHEDULES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </Field>

      <Field label="Assigned Role">
        <select className="input" style={inputStyle} value={assignedRole}
          onChange={e => setAssignedRole(e.target.value)}>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </Field>

      <Field label="Status">
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: "var(--text-2)" }}>
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: INDIGO }} />
          Active checklist
        </label>
      </Field>

      {/* Items */}
      <div style={{ ...MONO, marginBottom: 10 }}>Checklist Items</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {items.map((item, idx) => (
          <div key={idx} style={{
            display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px",
            background: INDIGO_DIM, border: `1px solid ${INDIGO_BORDER}`, borderRadius: 8,
          }}>
            {/* drag-handle / reorder */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 2, flexShrink: 0 }}>
              <button type="button" className="btn-xs" style={{ fontSize: 10, padding: "2px 6px" }}
                onClick={() => moveItem(idx, -1)} disabled={idx === 0} title="Move up">
                ↑
              </button>
              <button type="button" className="btn-xs" style={{ fontSize: 10, padding: "2px 6px" }}
                onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} title="Move down">
                ↓
              </button>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <input type="text" className="input" placeholder={`Item ${idx + 1} name`}
                value={item.name} onChange={e => updateItem(idx, "name", e.target.value)}
                style={{ width: "100%", boxSizing: "border-box" }} maxLength={300} />
              <input type="text" className="input" placeholder="Description (optional)"
                value={item.description} onChange={e => updateItem(idx, "description", e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", fontSize: 12 }} maxLength={500} />
            </div>
            <button type="button" className="btn-xs"
              style={{ color: "var(--err, #ff5050)", borderColor: "rgba(239,68,68,0.3)", flexShrink: 0, marginTop: 2 }}
              onClick={() => removeItem(idx)} title="Remove item">
              ✕
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn-xs" onClick={addItem}
        style={{ borderColor: INDIGO_BORDER, color: INDIGO, marginBottom: 20 }}>
        + Add Item
      </button>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" className="btn-xs" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-xs primary"
          disabled={saving || !name.trim() || !items.some(i => i.name.trim())}
          style={{ background: INDIGO_DIM, borderColor: INDIGO_BORDER, color: INDIGO }}>
          {saving ? "Saving…" : initial ? "Save Changes" : "Create Checklist"}
        </button>
      </div>
    </form>
  );
}

// ── Today's completions ────────────────────────────────────────────────────

function TodayTab({ workspaceId }: { workspaceId: string }) {
  const [checklists, setChecklists] = useState<TodayChecklist[]>([]);
  const [loading, setLoading]       = useState(false);
  const [loadErr, setLoadErr]       = useState<string | null>(null);

  const today = ymd(new Date());

  const fetchToday = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await adminClient.tasksList({ workspace_id: workspaceId, date: today });
      setChecklists((res.checklists ?? []) as TodayChecklist[]);
    } catch (ex: unknown) {
      setLoadErr(ex instanceof Error ? ex.message : "Failed to load today's tasks.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, today]);

  useEffect(() => { void fetchToday(); }, [fetchToday]);

  function statusOf(cl: TodayChecklist): "complete" | "in_progress" | "not_started" {
    if (!cl.items.length) return "not_started";
    const done = cl.items.filter(i => i.completed_at).length;
    if (done === 0) return "not_started";
    if (done === cl.items.length) return "complete";
    return "in_progress";
  }

  const statusBadge = (st: ReturnType<typeof statusOf>) => {
    const map = {
      complete:    { label: "Complete",    bg: "rgba(34,197,94,0.12)",  color: "#22c55e", border: "rgba(34,197,94,0.25)" },
      in_progress: { label: "In Progress", bg: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "rgba(245,158,11,0.25)" },
      not_started: { label: "Not Started", bg: "rgba(239,68,68,0.10)",  color: "#ef4444", border: "rgba(239,68,68,0.25)" },
    };
    const c = map[st];
    return (
      <span style={{
        display: "inline-block", padding: "3px 10px", borderRadius: 5,
        fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
        background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      }}>
        {c.label}
      </span>
    );
  };

  if (loading) return (
    <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
      Loading today&apos;s tasks…
    </div>
  );

  if (loadErr) return (
    <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--err, #ff5050)", fontSize: 13 }}>
      {loadErr}
      <button className="btn-xs" style={{ marginLeft: 12 }} onClick={() => void fetchToday()}>Retry</button>
    </div>
  );

  if (!checklists.length) return (
    <EmptyState icon="✅" title="No checklists for today" body="Create checklists in the Checklists tab and assign them a schedule." />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {checklists.map(cl => {
        const st = statusOf(cl);
        const done = cl.items.filter(i => i.completed_at).length;
        return (
          <div key={cl.id} style={{
            borderRadius: 10, border: `1px solid ${INDIGO_BORDER}`,
            background: INDIGO_DIM, overflow: "hidden",
          }}>
            {/* Checklist header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              padding: "12px 16px", borderBottom: `1px solid ${INDIGO_BORDER}`,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>{cl.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                  {cl.assigned_role ? `Role: ${cl.assigned_role}` : "Any role"} · {done}/{cl.items.length} done
                </div>
              </div>
              {scheduleBadge(cl.schedule)}
              {statusBadge(st)}
            </div>
            {/* Items */}
            <div style={{ padding: "8px 0" }}>
              {cl.items.map(item => {
                const checked = !!item.completed_at;
                return (
                  <div key={item.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    padding: "8px 16px",
                    opacity: checked ? 0.6 : 1,
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
                      background: checked ? "#22c55e" : "transparent",
                      border: `2px solid ${checked ? "#22c55e" : "rgba(255,255,255,0.2)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {checked && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, color: "var(--text-1)", fontWeight: checked ? 400 : 500,
                        textDecoration: checked ? "line-through" : "none",
                      }}>
                        {item.name}
                      </div>
                      {item.description && (
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{item.description}</div>
                      )}
                    </div>
                    {checked && item.completed_at && (
                      <div style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {item.completed_by_name ? `${item.completed_by_name} · ` : ""}
                        {fmtDateTime(item.completed_at)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function TasksClient({ workspaceId }: { workspaceId: string }) {
  const [tab, setTab] = useState<Tab>("checklists");

  // Checklists state
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading]       = useState(false);
  const [loadErr, setLoadErr]       = useState<string | null>(null);

  // Form state
  const [formOpen, setFormOpen]     = useState(false);
  const [editTarget, setEditTarget] = useState<Checklist | null>(null);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting]           = useState(false);
  const [deleteErr, setDeleteErr]         = useState<string | null>(null);

  // ── Fetch checklists ───────────────────────────────────────────────────

  const fetchChecklists = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await adminClient.tasksList({ workspace_id: workspaceId });
      setChecklists((res.checklists ?? []) as Checklist[]);
    } catch (ex: unknown) {
      setLoadErr(ex instanceof Error ? ex.message : "Failed to load checklists.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { if (tab === "checklists") void fetchChecklists(); }, [tab, fetchChecklists]);

  // ── Delete ─────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    setDeleting(true);
    setDeleteErr(null);
    try {
      await adminClient.tasksDeleteChecklist({ workspace_id: workspaceId, checklist_id: id });
      setDeleteConfirm(null);
      void fetchChecklists();
    } catch (ex: unknown) {
      setDeleteErr(ex instanceof Error ? ex.message : "Failed to delete checklist.");
    } finally {
      setDeleting(false);
    }
  }

  // ── Tab bar ────────────────────────────────────────────────────────────

  const TABS: { id: Tab; label: string }[] = [
    { id: "checklists", label: "Checklists" },
    { id: "today",      label: "Today" },
  ];

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Header ── */}
      <div className="admin-header">
        <div>
          <h1 style={{ color: INDIGO }}>Tasks &amp; Checklists</h1>
          <div className="sub">Manage recurring task templates and track daily completion.</div>
        </div>
        {tab === "checklists" && (
          <div style={{ marginLeft: "auto" }}>
            <button
              className="btn-xs primary"
              style={{ fontSize: 13, padding: "8px 16px", background: INDIGO_DIM, borderColor: INDIGO_BORDER, color: INDIGO }}
              onClick={() => { setEditTarget(null); setFormOpen(true); }}
            >
              + New Checklist
            </button>
          </div>
        )}
      </div>

      <div className="admin-body">
        {/* ── Tab bar ── */}
        <div style={{
          display: "flex", gap: 4, marginBottom: 20,
          borderBottom: `1px solid ${INDIGO_BORDER}`, paddingBottom: 12,
        }}>
          {TABS.map(t => (
            <button
              key={t.id}
              className="btn-xs"
              onClick={() => setTab(t.id)}
              style={tab === t.id ? {
                background: INDIGO_DIM, borderColor: INDIGO_BORDER, color: INDIGO,
              } : {}}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ CHECKLISTS TAB ══ */}
        {tab === "checklists" && (
          <>
            {loadErr && (
              <div style={{
                marginBottom: 14, padding: "10px 14px", borderRadius: 8,
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                color: "var(--err, #ff5050)", fontSize: 13,
              }}>
                {loadErr}
                <button className="btn-xs" style={{ marginLeft: 12 }} onClick={() => void fetchChecklists()}>
                  Retry
                </button>
              </div>
            )}

            {loading ? (
              <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                Loading checklists…
              </div>
            ) : checklists.length === 0 ? (
              <EmptyState
                icon="📋"
                title="No checklists yet"
                body='Create your first checklist template with recurring tasks for your team.'
              />
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Schedule</th>
                      <th>Assigned Role</th>
                      <th>Items</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checklists.map(cl => (
                      <>
                        <tr key={cl.id}>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)" }}>{cl.name}</div>
                          </td>
                          <td>{scheduleBadge(cl.schedule)}</td>
                          <td>
                            <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                              {cl.assigned_role
                                ? ROLES.find(r => r.value === cl.assigned_role)?.label ?? cl.assigned_role
                                : "Any"}
                            </span>
                          </td>
                          <td>
                            <span style={{
                              display: "inline-block", padding: "2px 10px", borderRadius: 4,
                              fontSize: 12, fontWeight: 600,
                              background: INDIGO_DIM, color: INDIGO, border: `1px solid ${INDIGO_BORDER}`,
                            }}>
                              {cl.items?.length ?? 0}
                            </span>
                          </td>
                          <td>
                            <span style={{
                              display: "inline-block", padding: "2px 8px", borderRadius: 4,
                              fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
                              background: cl.is_active ? INDIGO_DIM : "rgba(120,120,120,0.1)",
                              color: cl.is_active ? INDIGO : "var(--text-3)",
                              border: `1px solid ${cl.is_active ? INDIGO_BORDER : "rgba(120,120,120,0.2)"}`,
                            }}>
                              {cl.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <button
                                className="btn-xs"
                                title="Edit checklist"
                                onClick={() => { setEditTarget(cl); setFormOpen(true); setDeleteConfirm(null); }}
                              >
                                ✏️
                              </button>
                              {deleteConfirm !== cl.id ? (
                                <button
                                  className="btn-xs"
                                  title="Delete checklist"
                                  style={{ color: "var(--err, #ff5050)", borderColor: "rgba(239,68,68,0.3)" }}
                                  onClick={() => { setDeleteConfirm(cl.id); setDeleteErr(null); }}
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
                                    onClick={() => void handleDelete(cl.id)}
                                  >
                                    {deleting ? "…" : "Yes"}
                                  </button>
                                  <button className="btn-xs" onClick={() => setDeleteConfirm(null)}>No</button>
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {deleteErr && deleteConfirm === cl.id && (
                          <tr key={`${cl.id}-err`}>
                            <td colSpan={6}>
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
          </>
        )}

        {/* ══ TODAY TAB ══ */}
        {tab === "today" && <TodayTab workspaceId={workspaceId} />}
      </div>

      {/* ── Checklist SlideOver ── */}
      <SlideOver
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editTarget ? "Edit Checklist" : "New Checklist"}
        subtitle={editTarget ? `Editing: ${editTarget.name}` : "Create a recurring task template"}
        width={520}
      >
        <ChecklistForm
          workspaceId={workspaceId}
          initial={editTarget}
          onSaved={() => { setFormOpen(false); void fetchChecklists(); }}
          onCancel={() => setFormOpen(false)}
        />
      </SlideOver>
    </>
  );
}

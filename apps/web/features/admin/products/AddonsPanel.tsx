"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminClient, type AddonGroup, type AddonOption } from "@/lib/admin-client";

// ─── types ────────────────────────────────────────────────────────────────────

type EditOption = { id?: string; name: string; price: string };

type EditGroup = {
  id?: string;
  name: string;
  required: boolean;
  max_selections: string;
  options: EditOption[];
};

const blankOption = (): EditOption => ({ name: "", price: "" });
const blankGroup = (): EditGroup => ({
  name: "",
  required: false,
  max_selections: "1",
  options: [blankOption()],
});

function toEditGroup(g: AddonGroup): EditGroup {
  return {
    id: g.id,
    name: g.name,
    required: g.required,
    max_selections: String(g.max_selections),
    options: g.options.length > 0 ? g.options.map((o) => ({ id: o.id, name: o.name, price: String(o.price) })) : [blankOption()],
  };
}

// ─── sub-components ────────────────────────────────────────────────────────────

function OptionRow({
  opt,
  onChange,
  onDelete,
  canDelete,
}: {
  opt: EditOption;
  onChange: (patch: Partial<EditOption>) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 32px", gap: 8, alignItems: "center" }}>
      <input
        className="input"
        placeholder="Option name"
        value={opt.name}
        onChange={(e) => onChange({ name: e.target.value })}
        style={{ fontSize: 13 }}
      />
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
          fontSize: 13, color: "var(--text-3)", pointerEvents: "none",
        }}>₱</span>
        <input
          className="input"
          type="number"
          step="0.01"
          min="0"
          placeholder="0"
          value={opt.price}
          onChange={(e) => onChange({ price: e.target.value })}
          style={{ fontSize: 13, paddingLeft: 22 }}
        />
      </div>
      <button
        type="button"
        aria-label="Remove option"
        disabled={!canDelete}
        onClick={onDelete}
        style={{
          width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
          border: "1px solid var(--line)", borderRadius: 6,
          background: "rgba(255,255,255,0.03)",
          color: canDelete ? "var(--text-2)" : "var(--text-3)",
          cursor: canDelete ? "pointer" : "not-allowed",
          fontSize: 16, lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

function GroupForm({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: EditGroup;
  onSave: (g: EditGroup) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState<EditGroup>(initial);

  function patch(p: Partial<EditGroup>) { setForm((f) => ({ ...f, ...p })); }

  function patchOption(idx: number, p: Partial<EditOption>) {
    setForm((f) => ({ ...f, options: f.options.map((o, i) => i === idx ? { ...o, ...p } : o) }));
  }
  function addOption() { setForm((f) => ({ ...f, options: [...f.options, blankOption()] })); }
  function deleteOption(idx: number) {
    setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== idx) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(form);
  }

  const maxSel = Number(form.max_selections);
  const maxSelLabel = !Number.isFinite(maxSel) || maxSel < 1
    ? ""
    : maxSel === 1
      ? "Single choice (radio)"
      : `Up to ${maxSel} choices`;

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
      {/* Group name */}
      <div className="admin-field">
        <label style={{ fontSize: 12, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Group name *
        </label>
        <input
          className="input"
          placeholder='e.g. "Size", "Extras", "Add-ons"'
          value={form.name}
          onChange={(e) => patch({ name: e.target.value })}
          required
          autoFocus
        />
      </div>

      {/* Required + max selections row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={form.required}
            onChange={(e) => patch({ required: e.target.checked })}
          />
          <span style={{ fontSize: 13 }}>Required</span>
        </label>
        <div className="admin-field">
          <label style={{ fontSize: 12, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Max selections
          </label>
          <input
            className="input"
            type="number"
            min="1"
            step="1"
            value={form.max_selections}
            onChange={(e) => patch({ max_selections: e.target.value })}
            style={{ fontSize: 13 }}
          />
          {maxSelLabel && (
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{maxSelLabel}</div>
          )}
        </div>
      </div>

      {/* Options */}
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 100px 32px", gap: 8,
          fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)",
        }}>
          <div>Option name</div>
          <div>Price</div>
          <div />
        </div>
        {form.options.map((opt, idx) => (
          <OptionRow
            key={idx}
            opt={opt}
            onChange={(p) => patchOption(idx, p)}
            onDelete={() => deleteOption(idx)}
            canDelete={form.options.length > 1}
          />
        ))}
        <button
          type="button"
          onClick={addOption}
          style={{
            width: "fit-content", padding: "6px 12px", borderRadius: 6,
            border: "1px dashed var(--amber-bright, var(--amber))", background: "transparent",
            color: "var(--amber-bright, var(--amber))", fontSize: 12, cursor: "pointer",
          }}
        >
          + Add option
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: "var(--err)", padding: "8px 10px", borderRadius: 6, background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.25)" }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", marginTop: 4 }}>
        <span style={{ fontSize: 12, color: "var(--text-3)", marginRight: "auto" }}>* Required</span>
        <button type="button" className="btn-xs" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn-xs"
          disabled={saving || !form.name.trim()}
          style={{
            background: "rgba(var(--tint-rgb), 0.15)", color: "var(--amber-bright, var(--amber))",
            border: "1px solid rgba(var(--tint-rgb), 0.4)",
          }}
        >
          {saving ? "Saving…" : "Save group"}
        </button>
      </div>
    </form>
  );
}

function GroupReadView({ group, onEdit, onDelete }: {
  group: AddonGroup;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: 8,
      border: "1px solid var(--line)",
      background: "rgba(0,0,0,0.2)",
      display: "grid",
      gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{group.name}</span>
          {group.required && (
            <span className="pill warn" style={{ fontSize: 10 }}>Required</span>
          )}
          <span className="pill neutral" style={{ fontSize: 10 }}>
            {group.max_selections === 1 ? "Single" : `Max ${group.max_selections}`}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button type="button" className="btn-xs" onClick={onEdit}>Edit</button>
          <button
            type="button"
            className="btn-xs"
            onClick={onDelete}
            style={{ color: "var(--err)", borderColor: "rgba(255,80,80,0.3)" }}
          >
            Delete
          </button>
        </div>
      </div>
      {group.options.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {group.options.map((o) => (
            <span
              key={o.id}
              style={{
                display: "inline-flex", gap: 6, alignItems: "center",
                padding: "3px 10px", borderRadius: 20,
                background: "rgba(255,255,255,0.05)", border: "1px solid var(--line)",
                fontSize: 12, color: "var(--text-2)",
              }}
            >
              {o.name}
              {o.price > 0 && (
                <span style={{ color: "var(--amber-bright, var(--amber))", fontWeight: 600 }}>
                  +₱{o.price.toFixed(2)}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── delete confirmation ───────────────────────────────────────────────────────

function DeleteGroupDialog({
  groupName,
  onConfirm,
  onCancel,
  deleting,
}: {
  groupName: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div style={{
      padding: "14px 16px", borderRadius: 8,
      border: "1px solid rgba(255,80,80,0.3)",
      background: "rgba(255,80,80,0.06)",
      display: "grid", gap: 10,
    }}>
      <div style={{ fontSize: 13, color: "var(--text-1)" }}>
        Delete group <strong>&quot;{groupName}&quot;</strong> and all its options?
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn-xs" onClick={onCancel} disabled={deleting}>Cancel</button>
        <button
          type="button"
          className="btn-xs"
          onClick={onConfirm}
          disabled={deleting}
          style={{ color: "var(--err)", borderColor: "rgba(255,80,80,0.4)", background: "rgba(255,80,80,0.12)" }}
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}

// ─── main panel ───────────────────────────────────────────────────────────────

export function AddonsPanel({
  workspaceId,
  productId,
}: {
  workspaceId: string;
  /** undefined when the product hasn't been saved yet (new product form). */
  productId: string | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const [groups, setGroups] = useState<AddonGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // editing: null=none, "new"=add form, group.id=edit form
  const [editing, setEditing] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // delete confirm: null=none, group.id=confirming
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadedFor = useRef<string | null>(null);

  const loadAddons = useCallback(async () => {
    if (!productId || !workspaceId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const { groups: g } = await adminClient.productAddonsList({ workspace_id: workspaceId, product_id: productId });
      setGroups(g ?? []);
      loadedFor.current = productId;
    } catch (err: any) {
      setLoadError(err?.message ?? "Failed to load add-ons");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, productId]);

  // Load when panel is first expanded or product changes.
  useEffect(() => {
    if (!expanded || !productId) return;
    if (loadedFor.current === productId) return; // already loaded
    loadAddons();
  }, [expanded, productId, loadAddons]);

  async function handleSave(form: EditGroup) {
    if (!productId || !workspaceId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const options = form.options
        .filter((o) => o.name.trim())
        .map((o) => ({ id: o.id, name: o.name.trim(), price: Number(o.price) || 0 }));
      if (options.length === 0) { setSaveError("Add at least one option."); setSaving(false); return; }
      if (!form.name.trim()) { setSaveError("Group name is required."); setSaving(false); return; }

      const { group } = await adminClient.productAddonsUpsert({
        workspace_id: workspaceId,
        product_id: productId,
        ...(form.id ? { id: form.id } : {}),
        name: form.name.trim(),
        required: form.required,
        max_selections: Math.max(1, Number(form.max_selections) || 1),
        options,
      });
      setGroups((prev) =>
        form.id
          ? prev.map((g) => (g.id === form.id ? group : g))
          : [...prev, group],
      );
      setEditing(null);
    } catch (err: any) {
      setSaveError(err?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(groupId: string) {
    if (!workspaceId) return;
    setDeleting(true);
    try {
      await adminClient.productAddonsDelete({ workspace_id: workspaceId, group_id: groupId });
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      setConfirmDelete(null);
    } catch (err: any) {
      // Show delete error inline in the delete dialog area; reuse saveError slot.
      setSaveError(err?.message ?? "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const editingGroup = editing && editing !== "new"
    ? groups.find((g) => g.id === editing)
    : null;

  const confirmingGroup = confirmDelete
    ? groups.find((g) => g.id === confirmDelete)
    : null;

  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "transparent", border: "none", cursor: "pointer",
          padding: "2px 0", gap: 8,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", letterSpacing: "0.04em" }}>
          Add-ons
          {groups.length > 0 && !expanded && (
            <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-3)", fontWeight: 400 }}>
              {groups.length} group{groups.length !== 1 ? "s" : ""}
            </span>
          )}
        </span>
        <span style={{
          fontSize: 16, color: "var(--text-3)", lineHeight: 1,
          transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.18s ease",
          display: "inline-block",
        }}>
          &#8964;
        </span>
      </button>

      {expanded && (
        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          {/* Unsaved product notice */}
          {!productId && (
            <div style={{
              padding: "10px 12px", borderRadius: 8, fontSize: 12,
              color: "var(--text-2)", background: "rgba(var(--tint-rgb), 0.06)",
              border: "1px solid rgba(var(--tint-rgb), 0.25)",
            }}>
              Save the product first to add add-on groups.
            </div>
          )}

          {productId && (
            <>
              {loading && <div className="dim" style={{ fontSize: 12 }}>Loading add-ons…</div>}
              {loadError && (
                <div style={{ fontSize: 12, color: "var(--err)" }}>
                  {loadError}{" "}
                  <button type="button" onClick={loadAddons} style={{ color: "var(--amber-bright)", background: "none", border: "none", cursor: "pointer", fontSize: 12, padding: 0 }}>
                    Retry
                  </button>
                </div>
              )}

              {/* Existing groups */}
              {groups.map((group) => (
                <div key={group.id}>
                  {confirmDelete === group.id ? (
                    <DeleteGroupDialog
                      groupName={group.name}
                      onConfirm={() => handleDelete(group.id)}
                      onCancel={() => { setConfirmDelete(null); setSaveError(null); }}
                      deleting={deleting}
                    />
                  ) : editing === group.id ? (
                    <div style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "rgba(0,0,0,0.25)" }}>
                      <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                        Editing: {group.name}
                      </div>
                      <GroupForm
                        initial={toEditGroup(group)}
                        onSave={handleSave}
                        onCancel={() => { setEditing(null); setSaveError(null); }}
                        saving={saving}
                        error={saveError}
                      />
                    </div>
                  ) : (
                    <GroupReadView
                      group={group}
                      onEdit={() => { setEditing(group.id); setSaveError(null); }}
                      onDelete={() => { setConfirmDelete(group.id); setSaveError(null); }}
                    />
                  )}
                </div>
              ))}

              {/* Add new group form */}
              {editing === "new" ? (
                <div style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "rgba(0,0,0,0.25)" }}>
                  <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                    New group
                  </div>
                  <GroupForm
                    initial={blankGroup()}
                    onSave={handleSave}
                    onCancel={() => { setEditing(null); setSaveError(null); }}
                    saving={saving}
                    error={saveError}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setEditing("new"); setSaveError(null); }}
                  disabled={!!editing || !!confirmDelete}
                  style={{
                    width: "fit-content", padding: "8px 14px", borderRadius: 6,
                    border: "1px dashed var(--amber-bright, var(--amber))", background: "transparent",
                    color: editing || confirmDelete ? "var(--text-3)" : "var(--amber-bright, var(--amber))",
                    borderColor: editing || confirmDelete ? "var(--line)" : undefined,
                    fontSize: 13, cursor: editing || confirmDelete ? "not-allowed" : "pointer",
                  }}
                >
                  + Add group
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Tasks — checklist template management (create/edit/delete templates and their
 * items). Day-to-day completion already happens on the Shift screen
 * (features: tasks-list/tasks-complete-item, scoped to today's checklists);
 * this screen is where owner/admin/manager define what those checklists are.
 */
import {
  View, Text, Pressable, TextInput, FlatList,
  StyleSheet, ActivityIndicator, Platform, Switch,
} from "react-native";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { invokeFn } from "../../services/supabase";
import { useAuth } from "../../features/auth/AuthContext";
import { R } from "../../features/theme/tokens";
import { useTheme } from "../../features/theme/ThemeContext";
import { WRITE_ROLES } from "../../features/constants";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { useToast } from "../../features/ui/ToastProvider";
import { useAppAlert } from "../../features/ui/AppAlertProvider";
import { FormSheetModal } from "../../features/ui/FormSheetModal";
import { makeFormFieldStyles } from "../../features/ui/formFieldStyles";
import { makeListToolbarStyles } from "../../features/ui/listToolbarStyles";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });

type Schedule = "daily" | "weekly" | "monthly" | "once" | "shift_open" | "shift_close";
type AssignedRole = "cashier" | "manager" | "kitchen" | "any";

interface ChecklistItem {
  id?: string;
  name: string;
  description: string | null;
}

interface Checklist {
  id: string;
  name: string;
  schedule: Schedule;
  assigned_role: AssignedRole | null;
  is_active: boolean;
  items: ChecklistItem[];
}

const SCHEDULE_LABELS: Record<Schedule, string> = {
  daily: "Daily", weekly: "Weekly", monthly: "Monthly", once: "One-time",
  shift_open: "Shift Open", shift_close: "Shift Close",
};
const ROLE_LABELS: Record<AssignedRole, string> = {
  cashier: "Cashier", manager: "Manager", kitchen: "Kitchen", any: "Anyone",
};

const EMPTY_FORM = {
  name: "", schedule: "daily" as Schedule, assigned_role: "any" as AssignedRole,
  is_active: true, items: [] as ChecklistItem[],
};

export default function TasksScreen() {
  const { activeWorkspaceId, role } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const fieldStyles = useMemo(() => makeFormFieldStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const listStyles = useMemo(() => makeListToolbarStyles(C, insets.bottom), [C, insets.bottom]);
  const canWrite = role != null && (WRITE_ROLES as readonly string[]).includes(role);
  const { showToast } = useToast();
  const { showAlert } = useAppAlert();

  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading]       = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Checklist | null>(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [newItemName, setNewItemName] = useState("");
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    const { data, error } = await invokeFn<{ checklists: Checklist[] }>("tasks-list", {
      workspace_id: activeWorkspaceId,
    });
    if (error) { showToast({ title: "Error", message: error.message, type: "error" }); setLoading(false); return; }
    setChecklists(data?.checklists ?? []);
    setLoading(false);
  }, [activeWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setNewItemName("");
    setShowForm(true);
  }

  function openEdit(cl: Checklist) {
    setEditItem(cl);
    setForm({
      name: cl.name, schedule: cl.schedule, assigned_role: cl.assigned_role ?? "any",
      is_active: cl.is_active,
      items: cl.items.map((i) => ({ id: i.id, name: i.name, description: i.description })),
    });
    setNewItemName("");
    setShowForm(true);
  }

  function addItem() {
    if (!newItemName.trim()) return;
    setForm((f) => ({ ...f, items: [...f.items, { name: newItemName.trim(), description: null }] }));
    setNewItemName("");
  }

  function removeItem(idx: number) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  async function saveChecklist() {
    if (!form.name.trim()) { showToast({ title: "Error", message: "Name is required", type: "error" }); return; }
    if (form.items.length === 0) { showToast({ title: "Error", message: "Add at least one checklist item", type: "error" }); return; }
    setSaving(true);
    const { error } = await invokeFn("tasks-upsert-checklist", {
      workspace_id: activeWorkspaceId,
      ...(editItem ? { checklist_id: editItem.id } : {}),
      name: form.name.trim(),
      schedule: form.schedule,
      assigned_role: form.assigned_role,
      is_active: form.is_active,
      items: form.items.map((it, idx) => ({
        ...(it.id ? { id: it.id } : {}),
        name: it.name,
        description: it.description ?? undefined,
        sort_order: idx,
      })),
    });
    setSaving(false);
    if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
    setShowForm(false);
    load();
  }

  function confirmDelete(cl: Checklist) {
    showAlert("Delete Checklist", `Remove "${cl.name}"? This deletes all its items and completion history.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { deleteChecklist(cl).catch(console.error); } },
    ]);
  }

  async function deleteChecklist(cl: Checklist) {
    const { error } = await invokeFn("tasks-delete-checklist", {
      workspace_id: activeWorkspaceId, checklist_id: cl.id,
    });
    if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
    setShowForm(false);
    load();
  }

  let btnLabel = "Add Checklist";
  if (saving) btnLabel = "Saving…";
  else if (editItem) btnLabel = "Save Changes";

  return (
    <View style={listStyles.root}>
      <PosScreenHeader title="Tasks"
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={listStyles.count}>{checklists.length} checklist{checklists.length === 1 ? "" : "s"}</Text>
            {canWrite && (
              <Pressable style={listStyles.addBtn} onPress={openAdd}>
                <Text style={listStyles.addBtnTxt}>+ Add</Text>
              </Pressable>
            )}
          </View>
        } />

      {loading ? (
        <View style={listStyles.center}><ActivityIndicator color={C.amber} /></View>
      ) : (
        <FlatList
          data={checklists}
          keyExtractor={(cl) => cl.id}
          contentContainerStyle={listStyles.list}
          renderItem={({ item: cl }) => (
            <Pressable style={s.row} onPress={() => canWrite && openEdit(cl)}>
              <View style={{ flex: 1 }}>
                <View style={s.nameRow}>
                  <Text style={s.name}>{cl.name}</Text>
                  <View style={s.schedPill}>
                    <Text style={s.schedPillTxt}>{SCHEDULE_LABELS[cl.schedule]}</Text>
                  </View>
                </View>
                <Text style={s.meta}>
                  {ROLE_LABELS[cl.assigned_role ?? "any"]} · {cl.items.length} item{cl.items.length === 1 ? "" : "s"}
                </Text>
              </View>
              {canWrite && <Feather name="chevron-right" size={16} color={C.ink4} />}
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={listStyles.center}>
              <Text style={listStyles.empty}>No checklists configured</Text>
              {canWrite && <Text style={listStyles.emptySub}>Tap + Add to create one — staff complete these from the Shift screen</Text>}
            </View>
          }
        />
      )}

      <FormSheetModal
        visible={showForm}
        onClose={() => setShowForm(false)}
        title={editItem ? "Edit Checklist" : "New Checklist"}
        footer={
          <Pressable
            style={[fieldStyles.footerPrimaryBtn, (saving || !form.name.trim() || form.items.length === 0) && { opacity: 0.5 }]}
            onPress={saveChecklist}
            disabled={saving || !form.name.trim() || form.items.length === 0}
          >
            <Text style={fieldStyles.footerPrimaryBtnTxt}>{btnLabel}</Text>
          </Pressable>
        }
      >
        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Name *</Text>
          <TextInput style={fieldStyles.input} value={form.name}
            maxLength={80}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
            placeholder="e.g. Opening Checklist" placeholderTextColor={C.ink4} />
        </View>

        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Schedule</Text>
          <View style={s.chipGrid}>
            {(Object.keys(SCHEDULE_LABELS) as Schedule[]).map((sc) => (
              <Pressable key={sc} style={[s.chip, form.schedule === sc && s.chipSel]}
                onPress={() => setForm((f) => ({ ...f, schedule: sc }))}>
                <Text style={[s.chipTxt, form.schedule === sc && s.chipTxtSel]}>{SCHEDULE_LABELS[sc]}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Assigned Role</Text>
          <View style={s.chipGrid}>
            {(Object.keys(ROLE_LABELS) as AssignedRole[]).map((r) => (
              <Pressable key={r} style={[s.chip, form.assigned_role === r && s.chipSel]}
                onPress={() => setForm((f) => ({ ...f, assigned_role: r }))}>
                <Text style={[s.chipTxt, form.assigned_role === r && s.chipTxtSel]}>{ROLE_LABELS[r]}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={fieldStyles.toggleRow}>
          <Text style={fieldStyles.fieldLabel}>Active</Text>
          <Switch value={form.is_active}
            onValueChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
            trackColor={{ true: C.good }} thumbColor={C.ink} />
        </View>

        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Items *</Text>
          {form.items.map((it, idx) => (
            <View key={it.id ?? `new-${idx}`} style={s.itemRow}>
              <Text style={s.itemTxt}>{idx + 1}. {it.name}</Text>
              <Pressable onPress={() => removeItem(idx)} hitSlop={8}>
                <Feather name="x" size={16} color={C.bad} />
              </Pressable>
            </View>
          ))}
          <View style={s.addItemRow}>
            <TextInput style={[fieldStyles.input, { flex: 1 }]} value={newItemName}
              maxLength={80}
              onChangeText={setNewItemName}
              placeholder="Add a checklist item…" placeholderTextColor={C.ink4}
              onSubmitEditing={addItem} returnKeyType="done" />
            <Pressable style={s.addItemBtn} onPress={addItem}>
              <Feather name="plus" size={16} color={C.amber} />
            </Pressable>
          </View>
        </View>

        {editItem && canWrite && (
          <Pressable style={fieldStyles.deleteBtn} onPress={() => confirmDelete(editItem)}>
            <Text style={fieldStyles.deleteBtnTxt}>Delete Checklist</Text>
          </Pressable>
        )}
      </FormSheetModal>
    </View>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  row:        { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, marginBottom: 8, padding: 14, gap: 12 },
  nameRow:    { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  name:       { color: C.ink, fontSize: 15, fontWeight: "600" },
  schedPill:  { paddingHorizontal: 8, paddingVertical: 2, borderRadius: R.full, backgroundColor: `${C.info}18`, borderWidth: 1, borderColor: `${C.info}44` },
  schedPillTxt: { color: C.info, fontSize: 10, fontWeight: "700", fontFamily: MONO, textTransform: "uppercase" },
  meta:       { color: C.ink3, fontSize: 12 },

  chipGrid:     { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:         { paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.full, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  chipSel:      { backgroundColor: `${C.amber}22`, borderColor: `${C.amber}66` },
  chipTxt:      { color: C.ink3, fontSize: 12, fontWeight: "500" },
  chipTxtSel:   { color: C.amber, fontWeight: "700" },

  itemRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  itemTxt:      { color: C.ink, fontSize: 13, flex: 1 },
  addItemRow:   { flexDirection: "row", gap: 8, marginTop: 8 },
  addItemBtn:   { width: 40, alignItems: "center", justifyContent: "center", borderRadius: R.md, borderWidth: 1, borderColor: `${C.amber}44`, backgroundColor: `${C.amber}12` },
});

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
import { sanitizePhone } from "../../features/utils/inputSanitizers";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });

interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  ingredient_count: number;
}

const EMPTY_FORM = {
  name: "", contact_name: "", phone: "", email: "", address: "", notes: "", is_active: true,
};

export default function SuppliersScreen() {
  const { activeWorkspaceId, role } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const listStyles = useMemo(() => makeListToolbarStyles(C, insets.bottom), [C, insets.bottom]);
  const fieldStyles = useMemo(() => makeFormFieldStyles(C), [C]);
  const canWrite = role != null && (WRITE_ROLES as readonly string[]).includes(role);
  const { showToast } = useToast();
  const { showAlert } = useAppAlert();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<"active" | "all">("active");
  const [search, setSearch]       = useState("");

  const [showForm, setShowForm]   = useState(false);
  const [editItem, setEditItem]   = useState<Supplier | null>(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    const { data, error } = await invokeFn<{ suppliers: Supplier[] }>("suppliers-list", {
      workspace_id: activeWorkspaceId, include_inactive: true,
    });
    if (error) { showToast({ title: "Error", message: error.message, type: "error" }); setLoading(false); return; }
    setSuppliers(data?.suppliers ?? []);
    setLoading(false);
  }, [activeWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const filtered = suppliers.filter((sup) => {
    if (filter === "active" && !sup.is_active) return false;
    if (search && !sup.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function openAdd() {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(sup: Supplier) {
    setEditItem(sup);
    setForm({
      name: sup.name,
      contact_name: sup.contact_name ?? "",
      phone: sup.phone ?? "",
      email: sup.email ?? "",
      address: sup.address ?? "",
      notes: sup.notes ?? "",
      is_active: sup.is_active,
    });
    setShowForm(true);
  }

  async function saveSupplier() {
    if (!form.name.trim()) { showToast({ title: "Error", message: "Name is required", type: "error" }); return; }
    setSaving(true);
    const { error } = await invokeFn("suppliers-upsert", {
      workspace_id: activeWorkspaceId,
      ...(editItem ? { supplier_id: editItem.id } : {}),
      name:         form.name.trim(),
      contact_name: form.contact_name.trim() || undefined,
      phone:        form.phone.trim() || undefined,
      email:        form.email.trim() || undefined,
      address:      form.address.trim() || undefined,
      notes:        form.notes.trim() || undefined,
      is_active:    form.is_active,
    });
    setSaving(false);
    if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
    setShowForm(false);
    load();
  }

  function confirmDelete(sup: Supplier) {
    showAlert("Delete Supplier", `Remove "${sup.name}"? Linked ingredients will keep their data but lose this supplier reference.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { deleteSupplier(sup).catch(console.error); } },
    ]);
  }

  async function deleteSupplier(sup: Supplier) {
    const { error } = await invokeFn("suppliers-delete", {
      workspace_id: activeWorkspaceId, supplier_id: sup.id,
    });
    if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
    setShowForm(false);
    load();
  }

  let btnLabel = "Add Supplier";
  if (saving) btnLabel = "Saving…";
  else if (editItem) btnLabel = "Save Changes";

  return (
    <View style={listStyles.root}>
      <PosScreenHeader title="Suppliers"
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={listStyles.count}>{filtered.length} item{filtered.length === 1 ? "" : "s"}</Text>
            {canWrite && (
              <Pressable style={listStyles.addBtn} onPress={openAdd}>
                <Text style={listStyles.addBtnTxt}>+ Add</Text>
              </Pressable>
            )}
          </View>
        } />

      <View style={listStyles.toolbar}>
        <View style={listStyles.searchWrap}>
          <Text style={listStyles.searchIcon}>⌕</Text>
          <TextInput
            style={listStyles.searchInput}
            placeholder="Search suppliers…"
            placeholderTextColor={C.ink4}
            value={search}
            onChangeText={setSearch}
          />
          {search ? <Pressable onPress={() => setSearch("")}><Text style={listStyles.clearX}>✕</Text></Pressable> : null}
        </View>
        <View style={listStyles.filterRow}>
          {(["active", "all"] as const).map((f) => (
            <Pressable
              key={f}
              style={[listStyles.filterChip, filter === f && listStyles.filterChipActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[listStyles.filterChipTxt, filter === f && listStyles.filterChipTxtActive]}>
                {f === "active" ? "Active" : "All"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={listStyles.center}><ActivityIndicator color={C.amber} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(sup) => sup.id}
          contentContainerStyle={listStyles.list}
          renderItem={({ item: sup }) => (
            <Pressable style={[s.row, !sup.is_active && s.rowInactive]} onPress={() => canWrite && openEdit(sup)}>
              <View style={s.rowMain}>
                <View style={{ flex: 1 }}>
                  <View style={s.nameRow}>
                    <Text style={s.name}>{sup.name}</Text>
                    {!sup.is_active && (
                      <View style={s.inactiveBadge}>
                        <Text style={s.inactiveTxt}>Inactive</Text>
                      </View>
                    )}
                  </View>
                  {!!sup.contact_name && <Text style={s.meta}>{sup.contact_name}</Text>}
                  <View style={s.metaRow}>
                    {!!sup.phone && (
                      <View style={s.metaItem}>
                        <Feather name="phone" size={11} color={C.ink3} />
                        <Text style={s.meta}>{sup.phone}</Text>
                      </View>
                    )}
                    {!!sup.email && (
                      <View style={s.metaItem}>
                        <Feather name="mail" size={11} color={C.ink3} />
                        <Text style={s.meta}>{sup.email}</Text>
                      </View>
                    )}
                  </View>
                  {sup.ingredient_count > 0 && (
                    <Text style={s.linkedTxt}>{sup.ingredient_count} linked ingredient{sup.ingredient_count === 1 ? "" : "s"}</Text>
                  )}
                </View>
                {canWrite && <Feather name="chevron-right" size={16} color={C.ink4} />}
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={listStyles.center}>
              <Text style={listStyles.empty}>No suppliers found</Text>
              {canWrite && <Text style={listStyles.emptySub}>Tap + Add to create one</Text>}
            </View>
          }
        />
      )}

      <FormSheetModal
        visible={showForm}
        onClose={() => setShowForm(false)}
        title={editItem ? "Edit Supplier" : "New Supplier"}
        footer={
          <Pressable
            style={[fieldStyles.footerPrimaryBtn, (saving || !form.name.trim()) && { opacity: 0.5 }]}
            onPress={saveSupplier}
            disabled={saving || !form.name.trim()}
          >
            <Text style={fieldStyles.footerPrimaryBtnTxt}>{btnLabel}</Text>
          </Pressable>
        }
      >
        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Name *</Text>
          <TextInput style={fieldStyles.input} value={form.name} maxLength={80}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
            placeholder="e.g. Fresh Farm Produce" placeholderTextColor={C.ink4} />
        </View>

        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Contact Name</Text>
          <TextInput style={fieldStyles.input} value={form.contact_name} maxLength={60}
            onChangeText={(v) => setForm((f) => ({ ...f, contact_name: v }))}
            placeholder="Contact person" placeholderTextColor={C.ink4} />
        </View>

        <View style={fieldStyles.row2}>
          <View style={fieldStyles.fieldGroupHalf}>
            <Text style={fieldStyles.fieldLabel}>Phone</Text>
            <TextInput style={fieldStyles.input} value={form.phone} maxLength={15}
              onChangeText={(v) => setForm((f) => ({ ...f, phone: sanitizePhone(v) }))}
              placeholder="+63 9XX XXX XXXX" placeholderTextColor={C.ink4} keyboardType="phone-pad" />
          </View>
          <View style={fieldStyles.fieldGroupHalf}>
            <Text style={fieldStyles.fieldLabel}>Email</Text>
            <TextInput style={fieldStyles.input} value={form.email} maxLength={254}
              onChangeText={(v) => setForm((f) => ({ ...f, email: v.trim() }))}
              placeholder="supplier@example.com" placeholderTextColor={C.ink4}
              keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          </View>
        </View>

        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Address</Text>
          <TextInput style={fieldStyles.input} value={form.address} maxLength={200}
            onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
            placeholder="Street address…" placeholderTextColor={C.ink4} />
        </View>

        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Notes</Text>
          <TextInput style={[fieldStyles.input, { minHeight: 56, textAlignVertical: "top" }]}
            value={form.notes} multiline maxLength={500}
            onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
            placeholder="Optional notes…" placeholderTextColor={C.ink4} />
        </View>

        <View style={fieldStyles.toggleRow}>
          <Text style={fieldStyles.fieldLabel}>Active</Text>
          <Switch value={form.is_active}
            onValueChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
            trackColor={{ true: C.good }} thumbColor={C.ink} />
        </View>

        {editItem && canWrite && (
          <Pressable style={fieldStyles.deleteBtn} onPress={() => confirmDelete(editItem)}>
            <Text style={fieldStyles.deleteBtnTxt}>Delete Supplier</Text>
          </Pressable>
        )}
      </FormSheetModal>
    </View>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  row:        { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, marginBottom: 8, overflow: "hidden" },
  rowInactive: { opacity: 0.6 },
  rowMain:    { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  nameRow:    { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  name:       { color: C.ink, fontSize: 15, fontWeight: "600" },
  inactiveBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: R.sm, backgroundColor: `${C.bad}22`, borderWidth: 1, borderColor: `${C.bad}44` },
  inactiveTxt:   { color: C.bad, fontSize: 9, fontWeight: "700", fontFamily: MONO, textTransform: "uppercase" },
  metaRow:    { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  metaItem:   { flexDirection: "row", alignItems: "center", gap: 4 },
  meta:       { color: C.ink3, fontSize: 12 },
  linkedTxt:  { color: C.ink4, fontSize: 10, fontFamily: MONO, marginTop: 4 },
});

import {
  View, Text, Pressable, TextInput, FlatList,
  StyleSheet, ActivityIndicator, Platform, Switch,
} from "react-native";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { supabase, invokeFn } from "../../services/supabase";
import { useAuth } from "../../features/auth/AuthContext";
import { R } from "../../features/theme/tokens";
import { useTheme } from "../../features/theme/ThemeContext";
import { WRITE_ROLES } from "../../features/constants";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { useToast } from "../../features/ui/ToastProvider";
import { FormSheetModal } from "../../features/ui/FormSheetModal";
import { makeFormFieldStyles } from "../../features/ui/formFieldStyles";
import { makeListToolbarStyles } from "../../features/ui/listToolbarStyles";
import { sanitizeMoney, sanitizeInteger } from "../../features/utils/inputSanitizers";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
const peso = (n: number) => `₱${n.toFixed(2)}`;

type ResourceType = "room" | "amenity";

interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  capacity: number | null;
  hourly_rate: number;
  nightly_rate: number | null;
  active: boolean;
  branch_id: string | null;
  branch_name: string | null;
}

interface Branch { id: string; name: string; }

interface RawResource {
  id: string;
  name: string;
  type: string;
  capacity: number | null;
  hourly_rate: number;
  nightly_rate: number | null;
  active: boolean;
  branch_id: string | null;
  branches: { name: string } | null;
}

const TYPE_LABELS: Record<ResourceType, string> = { room: "Room", amenity: "Amenity" };
const TYPE_ICONS:  Record<ResourceType, keyof typeof Feather.glyphMap>  = { room: "moon", amenity: "droplet" };

// Rooms bill by the night; the hourly rate only matters if the owner opts
// into charging for hours beyond the night rate (early check-in, etc).
// Amenities always bill hourly, so they skip this choice entirely.
type RoomPriceMode = "night" | "night_plus_hourly";

const EMPTY_FORM = {
  name: "", type: "room" as ResourceType, capacity: "",
  hourly_rate: "", nightly_rate: "", branch_id: "",
  roomPriceMode: "night" as RoomPriceMode,
};

export default function ResourcesScreen() {
  const { activeWorkspaceId, role } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const fieldStyles = useMemo(() => makeFormFieldStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const listStyles = useMemo(() => makeListToolbarStyles(C, insets.bottom), [C, insets.bottom]);
  const canWrite = role != null && (WRITE_ROLES as readonly string[]).includes(role);
  const { showToast } = useToast();
  const [resources, setResources] = useState<Resource[]>([]);
  const [branches, setBranches]   = useState<Branch[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<"all" | ResourceType>("all");
  const [search, setSearch]       = useState("");

  const [showForm, setShowForm]   = useState(false);
  const [editItem, setEditItem]   = useState<Resource | null>(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    const [{ data: resData }, { data: brsData }] = await Promise.all([
      invokeFn<{ "resources-list": RawResource[] }>("pos-data", { workspace_id: activeWorkspaceId, resource: "resources-list", params: {} }),
      invokeFn<{ "resources-branches-picker": Branch[] }>("pos-data", { workspace_id: activeWorkspaceId, resource: "resources-branches-picker", params: {} }),
    ]);
    const res = resData?.["resources-list"] ?? null;
    const brs = brsData?.["resources-branches-picker"] ?? null;
    setResources(
      (res ?? []).map((r) => ({
        id: r.id, name: r.name, type: r.type as ResourceType,
        capacity: r.capacity ?? null, hourly_rate: Number(r.hourly_rate),
        nightly_rate: r.nightly_rate != null ? Number(r.nightly_rate) : null,
        active: r.active, branch_id: r.branch_id ?? null,
        branch_name: r.branches?.name ?? null,
      })),
    );
    setBranches(brs ?? []);
    setLoading(false);
  }, [activeWorkspaceId]);

  useEffect(() => { load(); }, [load]);

  const filtered = resources.filter((r) => {
    if (filter !== "all" && r.type !== filter) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function openAdd() {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(r: Resource) {
    setEditItem(r);
    setForm({
      name: r.name, type: r.type,
      capacity: r.capacity == null ? "" : String(r.capacity),
      hourly_rate: String(r.hourly_rate),
      nightly_rate: r.nightly_rate == null ? "" : String(r.nightly_rate),
      branch_id: r.branch_id ?? "",
      // Existing rooms saved before this toggle existed just have a plain
      // hourly_rate — treat any nonzero value as "they wanted an overage".
      roomPriceMode: r.hourly_rate > 0 ? "night_plus_hourly" : "night",
    });
    setShowForm(true);
  }

  const roomPriceValid = form.type === "room" && !!form.nightly_rate
    && (form.roomPriceMode === "night" || !!form.hourly_rate);
  const canSaveResource = !!form.name.trim()
    && (form.type === "amenity" ? !!form.hourly_rate : roomPriceValid);

  async function saveResource() {
    if (!canSaveResource) return;
    setSaving(true);
    const roomHourly = form.type === "room" && form.roomPriceMode === "night" ? "0" : form.hourly_rate;
    const { data, error } = await supabase.functions.invoke("resources-upsert", {
      body: {
        workspace_id: activeWorkspaceId,
        ...(editItem ? { id: editItem.id } : {}),
        name:         form.name.trim(),
        type:         form.type,
        capacity:     form.capacity ? Number.parseInt(form.capacity, 10) : null,
        hourly_rate:  Number.parseFloat(form.type === "room" ? roomHourly : form.hourly_rate) || 0,
        nightly_rate: form.type === "room" && form.nightly_rate ? Number.parseFloat(form.nightly_rate) : null,
        branch_id:    form.branch_id || null,
      },
    });
    setSaving(false);
    if (error || data?.error) { showToast({ title: "Error", message: data?.error ?? error?.message ?? "Failed", type: "error" }); return; }
    setShowForm(false);
    load();
  }

  async function toggleActive(r: Resource) {
    const { data, error } = await supabase.functions.invoke("resources-toggle", {
      body: { workspace_id: activeWorkspaceId, resource_id: r.id, active: !r.active },
    });
    if (error || data?.error) { showToast({ title: "Error", message: data?.error ?? error?.message ?? "Failed", type: "error" }); return; }
    setResources((prev) => prev.map((x) => x.id === r.id ? { ...x, active: !r.active } : x));
  }

  const accentFor = (type: ResourceType) => type === "room" ? C.rust : C.amber;
  let btnLabel = "Create Resource";
  if (saving) btnLabel = "Saving…";
  else if (editItem) btnLabel = "Save Changes";

  return (
    <View style={listStyles.root}>
      <PosScreenHeader title="Rooms & Amenities"
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
            placeholder="Search…"
            placeholderTextColor={C.ink4}
            value={search}
            onChangeText={setSearch}
          />
          {search ? <Pressable onPress={() => setSearch("")}><Text style={listStyles.clearX}>✕</Text></Pressable> : null}
        </View>
        <View style={listStyles.filterRow}>
          {(["all", "room", "amenity"] as const).map((f) => (
            <Pressable
              key={f}
              style={[listStyles.filterChip, filter === f && listStyles.filterChipActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[listStyles.filterChipTxt, filter === f && listStyles.filterChipTxtActive]}>
                {f === "all" ? "All" : TYPE_LABELS[f]}
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
          keyExtractor={(r) => r.id}
          contentContainerStyle={listStyles.list}
          renderItem={({ item: r }) => {
            const accent = accentFor(r.type);
            return (
              <View style={[s.row, !r.active && s.rowInactive]}>
                <Pressable style={s.rowMain} onPress={() => canWrite && openEdit(r)}>
                  <View style={[s.typeIcon, { backgroundColor: `${accent}18` }]}>
                    <Feather name={TYPE_ICONS[r.type]} size={20} color={accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.nameRow}>
                      <Text style={s.name}>{r.name}</Text>
                      {!r.active && (
                        <View style={s.maintenanceBadge}>
                          <Text style={s.maintenanceTxt}>Inactive</Text>
                        </View>
                      )}
                    </View>
                    <View style={s.metaRow}>
                      <View style={[s.typePill, { backgroundColor: `${accent}18`, borderColor: `${accent}44` }]}>
                        <Text style={[s.typePillTxt, { color: accent }]}>{TYPE_LABELS[r.type]}</Text>
                      </View>
                      {r.capacity != null && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                          <Feather name="users" size={11} color={C.ink3} />
                          <Text style={s.meta}>{r.capacity}</Text>
                        </View>
                      )}
                      <Text style={[s.rate, { color: accent }]}>
                        {r.type === "room" && r.nightly_rate != null
                          ? `${peso(r.nightly_rate)}/night`
                          : `${peso(r.hourly_rate)}/hr`}
                      </Text>
                    </View>
                    {r.branch_name ? <Text style={s.branch}>{r.branch_name}</Text> : null}
                  </View>
                  {canWrite && (
                    <Switch
                      value={r.active}
                      onValueChange={() => toggleActive(r)}
                      trackColor={{ true: C.good }}
                      thumbColor={C.ink}
                    />
                  )}
                </Pressable>
                {canWrite && (
                  <View style={s.actionRow}>
                    <Pressable style={s.editBtn} onPress={() => openEdit(r)}>
                      <Text style={s.editBtnTxt}>Edit</Text>
                    </Pressable>
                    {!r.active && (
                      <View style={s.maintenanceRow}>
                        <Text style={s.maintenanceLabel}>⚠️ Unavailable for bookings</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={listStyles.center}>
              <Text style={listStyles.empty}>No resources found</Text>
              {canWrite && <Text style={listStyles.emptySub}>Tap + Add to create a room or amenity</Text>}
            </View>
          }
        />
      )}

      <FormSheetModal
        visible={showForm}
        onClose={() => setShowForm(false)}
        title={editItem ? "Edit Resource" : "New Resource"}
        footer={
          <Pressable
            style={[fieldStyles.footerPrimaryBtn, (saving || !canSaveResource) && { opacity: 0.5 }]}
            onPress={saveResource}
            disabled={saving || !canSaveResource}
          >
            <Text style={fieldStyles.footerPrimaryBtnTxt}>{btnLabel}</Text>
          </Pressable>
        }
      >
        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Type</Text>
          <View style={s.typeRow}>
            {(["room", "amenity"] as ResourceType[]).map((t) => (
              <Pressable
                key={t}
                style={[s.typeChip, form.type === t && { backgroundColor: `${accentFor(t)}22`, borderColor: `${accentFor(t)}66` }]}
                onPress={() => setForm((f) => ({ ...f, type: t }))}
              >
                <Feather name={TYPE_ICONS[t]} size={18} color={form.type === t ? accentFor(t) : C.ink3} />
                <Text style={[s.typeChipTxt, form.type === t && { color: accentFor(t), fontWeight: "700" }]}>
                  {TYPE_LABELS[t]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Name</Text>
          <TextInput
            style={fieldStyles.input}
            placeholder={form.type === "room" ? "e.g. Deluxe Room 101" : "e.g. Swimming Pool"}
            placeholderTextColor={C.ink4}
            maxLength={80}
            value={form.name}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
          />
        </View>

        {form.type === "amenity" ? (
          <View style={fieldStyles.row2}>
            <View style={fieldStyles.fieldGroupHalf}>
              <Text style={fieldStyles.fieldLabel}>Rate (₱/hr)</Text>
              <TextInput
                style={fieldStyles.input} placeholder="0.00" placeholderTextColor={C.ink4}
                keyboardType="decimal-pad"
                maxLength={12}
                value={form.hourly_rate}
                onChangeText={(v) => setForm((f) => ({ ...f, hourly_rate: sanitizeMoney(v) }))}
              />
            </View>
            <View style={fieldStyles.fieldGroupHalf}>
              <Text style={fieldStyles.fieldLabel}>Capacity (optional)</Text>
              <TextInput
                style={fieldStyles.input} placeholder="e.g. 2" placeholderTextColor={C.ink4}
                keyboardType="number-pad"
                maxLength={4}
                value={form.capacity}
                onChangeText={(v) => setForm((f) => ({ ...f, capacity: sanitizeInteger(v, { maxLen: 4 }) }))}
              />
            </View>
          </View>
        ) : (
          <>
            <View style={fieldStyles.fieldGroup}>
              <Text style={fieldStyles.fieldLabel}>Capacity (optional)</Text>
              <TextInput
                style={fieldStyles.input} placeholder="e.g. 2" placeholderTextColor={C.ink4}
                keyboardType="number-pad"
                maxLength={4}
                value={form.capacity}
                onChangeText={(v) => setForm((f) => ({ ...f, capacity: sanitizeInteger(v, { maxLen: 4 }) }))}
              />
            </View>

            {/* Rooms bill by the night — the hourly rate only applies if
                the owner explicitly wants to charge for hours beyond that
                (early check-in, late checkout), so it's opt-in. */}
            <View style={fieldStyles.fieldGroup}>
              <Text style={fieldStyles.fieldLabel}>Pricing</Text>
              <View style={s.typeRow}>
                <Pressable
                  style={[s.typeChip, form.roomPriceMode === "night" && { backgroundColor: `${C.rust}22`, borderColor: `${C.rust}66` }]}
                  onPress={() => setForm((f) => ({ ...f, roomPriceMode: "night" }))}
                >
                  <Text style={[s.typeChipTxt, form.roomPriceMode === "night" && { color: C.rust, fontWeight: "700" }]}>
                    Night Rate Only
                  </Text>
                </Pressable>
                <Pressable
                  style={[s.typeChip, form.roomPriceMode === "night_plus_hourly" && { backgroundColor: `${C.rust}22`, borderColor: `${C.rust}66` }]}
                  onPress={() => setForm((f) => ({ ...f, roomPriceMode: "night_plus_hourly" }))}
                >
                  <Text style={[s.typeChipTxt, form.roomPriceMode === "night_plus_hourly" && { color: C.rust, fontWeight: "700" }]}>
                    + Hourly Overage
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={fieldStyles.fieldGroup}>
              <Text style={fieldStyles.fieldLabel}>Nightly Rate (₱)</Text>
              <TextInput
                style={fieldStyles.input} placeholder="0.00" placeholderTextColor={C.ink4}
                keyboardType="decimal-pad"
                maxLength={12}
                value={form.nightly_rate}
                onChangeText={(v) => setForm((f) => ({ ...f, nightly_rate: sanitizeMoney(v) }))}
              />
            </View>

            {form.roomPriceMode === "night_plus_hourly" && (
              <View style={fieldStyles.fieldGroup}>
                <Text style={fieldStyles.fieldLabel}>Hourly Overage Rate (₱/hr)</Text>
                <TextInput
                  style={fieldStyles.input} placeholder="0.00" placeholderTextColor={C.ink4}
                  keyboardType="decimal-pad"
                  maxLength={12}
                  value={form.hourly_rate}
                  onChangeText={(v) => setForm((f) => ({ ...f, hourly_rate: sanitizeMoney(v) }))}
                />
              </View>
            )}
          </>
        )}

        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Branch (optional)</Text>
          <View style={s.chipGrid}>
            <Pressable
              style={[s.chip, !form.branch_id && s.chipSel]}
              onPress={() => setForm((f) => ({ ...f, branch_id: "" }))}>
              <Text style={[s.chipTxt, !form.branch_id && s.chipTxtSel]}>None</Text>
            </Pressable>
            {branches.map((b) => (
              <Pressable
                key={b.id}
                style={[s.chip, form.branch_id === b.id && s.chipSel]}
                onPress={() => setForm((f) => ({ ...f, branch_id: b.id }))}>
                <Text style={[s.chipTxt, form.branch_id === b.id && s.chipTxtSel]}>{b.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </FormSheetModal>
    </View>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  row:        { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, marginBottom: 8, overflow: "hidden" },
  rowInactive: { opacity: 0.6 },
  rowMain:    { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  typeIcon:   { width: 40, height: 40, borderRadius: R.lg, alignItems: "center", justifyContent: "center" },
  nameRow:    { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  name:       { color: C.ink, fontSize: 15, fontWeight: "600" },
  maintenanceBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: R.sm, backgroundColor: `${C.bad}22`, borderWidth: 1, borderColor: `${C.bad}44` },
  maintenanceTxt:   { color: C.bad, fontSize: 9, fontWeight: "700", fontFamily: MONO, textTransform: "uppercase" },
  metaRow:    { flexDirection: "row", alignItems: "center", gap: 8 },
  typePill:   { paddingHorizontal: 7, paddingVertical: 2, borderRadius: R.full, borderWidth: 1 },
  typePillTxt:{ fontSize: 10, fontWeight: "600", fontFamily: MONO, textTransform: "uppercase" },
  meta:       { color: C.ink3, fontSize: 11 },
  rate:       { fontSize: 12, fontWeight: "700", fontFamily: MONO },
  branch:     { color: C.ink4, fontSize: 10, fontFamily: MONO, marginTop: 2 },
  actionRow:  { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: C.lineSoft, paddingHorizontal: 14, paddingVertical: 8, gap: 10 },
  editBtn:    { marginLeft: "auto", paddingHorizontal: 12, paddingVertical: 5, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  editBtnTxt: { color: C.ink3, fontSize: 12 },
  maintenanceRow:   { flexDirection: "row", alignItems: "center" },
  maintenanceLabel: { color: C.warn, fontSize: 11, fontFamily: MONO },

  typeRow:      { flexDirection: "row", gap: 10 },
  typeChip:     { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  typeChipTxt:  { color: C.ink3, fontSize: 14, fontWeight: "500" },
  chipGrid:     { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.full, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  chipSel:      { backgroundColor: `${C.amber}22`, borderColor: `${C.amber}88` },
  chipTxt:      { color: C.ink3, fontSize: 12, fontWeight: "500" },
  chipTxtSel:   { color: C.amber, fontWeight: "700" },
});

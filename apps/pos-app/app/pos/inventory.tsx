/**
 * Inventory — unified catalog: raw materials (ingredients) and products that
 * track their own stock both live in one list. A self-stocked product is
 * just the simple case of a catalog entry with product_id set; a raw
 * material is the same shape with product_id null. One Stock In/Out/Adjust
 * action set works for both since they both resolve to a real per-branch
 * inventory_items row.
 */
import {
  View, Text, Pressable, TextInput, FlatList,
  StyleSheet, ActivityIndicator, Platform, ScrollView,
} from "react-native";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { invokeFn } from "../../services/supabase";
import { useAuth } from "../../features/auth/AuthContext";
import { R } from "../../features/theme/tokens";
import { useTheme } from "../../features/theme/ThemeContext";
import { PAGE_SIZES, WRITE_ROLES } from "../../features/constants";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { RefreshButton } from "../../features/ui/RefreshButton";
import { useToast } from "../../features/ui/ToastProvider";
import { FormSheetModal } from "../../features/ui/FormSheetModal";
import { makeFormFieldStyles } from "../../features/ui/formFieldStyles";
import { makeListToolbarStyles } from "../../features/ui/listToolbarStyles";
import { NAV_BAR_CLEARANCE } from "../../features/ui/safeAreaPadding";
import { UnitPicker } from "../../features/ui/UnitPicker";
import { sanitizeMoney, sanitizeDecimal, sanitizeDateStr } from "../../features/utils/inputSanitizers";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
const fmt  = (n: number, d = 2) => Number(n).toFixed(d);
const peso = (n: number) => `₱${Number(n).toFixed(2)}`;

type CatalogCategory = "food" | "drink" | "consumable" | "operational";
type AdjType = "in" | "out" | "adjustment";

interface CatalogItem {
  catalogId: string;
  name: string;
  category: CatalogCategory;
  unit: string;
  costPerUnit: number;
  archived: boolean;
  expiryDate: string | null;
  batchNumber: string | null;
  productId: string | null;
  forSale: boolean;
  categoryName: string | null; // product's own category, when product-linked
  quantity: number;
  inventoryItemId: string | null; // null = not yet stocked at this branch
  lowStockThreshold: number;
}

interface CatalogListRow {
  id: string;
  name: string;
  category: string;
  unit: string;
  cost_per_unit: number | string;
  low_stock_threshold: number | string;
  archived: boolean;
  expiry_date: string | null;
  batch_number: string | null;
  product_id: string | null;
  products?: { name?: string | null; for_sale?: boolean; product_categories?: { name?: string | null } | null } | null;
  quantity: number | string;
  inventory_item_id: string | null;
  branch_low_stock_threshold: number | string | null;
}

const FILTERS: { id: CatalogCategory | "all" | "products"; label: string; color: string }[] = [
  { id: "all",         label: "All",         color: "#9CA3AF" },
  { id: "products",    label: "Products",    color: "#F59E0B" },
  { id: "food",        label: "Food",        color: "#F59E0B" },
  { id: "drink",       label: "Drink",       color: "#3B82F6" },
  { id: "consumable",  label: "Consumable",  color: "#10B981" },
  { id: "operational", label: "Operational", color: "#8B5CF6" },
];

const ADJ_TYPES: { id: AdjType; label: string; desc: string }[] = [
  { id: "in",         label: "Stock In",  desc: "Add received stock" },
  { id: "out",        label: "Stock Out", desc: "Remove used/wasted" },
  { id: "adjustment", label: "Set Count", desc: "Override physical count" },
];

const EMPTY_ADJ = { type: "in" as AdjType, quantity: "", reason: "" };
const EMPTY_FORM = {
  name: "", category: "food" as CatalogCategory,
  unit: "", cost_per_unit: "", initial_stock: "0", low_stock_threshold: "0",
  expiry_date: "", batch_number: "",
};

function stockColor(item: CatalogItem, C: ReturnType<typeof useTheme>["C"]) {
  if (item.inventoryItemId === null) return C.ink4;
  if (item.quantity <= 0) return C.bad;
  if (item.lowStockThreshold > 0 && item.quantity <= item.lowStockThreshold) return C.warn;
  return C.good;
}
function stockLabel(item: CatalogItem) {
  if (item.inventoryItemId === null) return "Not stocked here";
  if (item.quantity <= 0) return "Out of stock";
  if (item.lowStockThreshold > 0 && item.quantity <= item.lowStockThreshold) return "Low stock";
  return "In stock";
}

export default function InventoryScreen() {
  const { activeWorkspaceId, activeBranchId, branchResolved, role } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const listStyles = useMemo(() => makeListToolbarStyles(C, insets.bottom), [C, insets.bottom]);
  const fieldStyles = useMemo(() => makeFormFieldStyles(C), [C]);
  const canWrite = role != null && (WRITE_ROLES as readonly string[]).includes(role);
  const { showToast } = useToast();

  const [items, setItems]       = useState<CatalogItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]     = useState<typeof FILTERS[number]["id"]>("all");
  const [search, setSearch]     = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage]               = useState(0);
  const [hasMore, setHasMore]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Raw material add/edit
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);

  // Stock adjust (works for both raw materials and products)
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [adj, setAdj]           = useState(EMPTY_ADJ);
  const [adjSaving, setAdjSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(async (pageNum: number) => {
    // Wait for branch resolution to finish, not just workspace — owner/
    // manager accounts resolve their branch via an extra awaited call after
    // activeWorkspaceId is already set (see AuthContext), so firing before
    // branchResolved sends this request with no branch_id and every row's
    // stock status comes back unresolved.
    if (!activeWorkspaceId || !branchResolved) return;
    const isFirst = pageNum === 0;
    if (isFirst) setLoading(true); else setLoadingMore(true);
    const from = pageNum * PAGE_SIZES.inventoryList, to = from + PAGE_SIZES.inventoryList - 1;
    const params: Record<string, unknown> = { from, to };
    if (activeBranchId) params.branch_id = activeBranchId;
    if (filter !== "all" && filter !== "products") params.category = filter;
    if (debouncedSearch) params.search = debouncedSearch;
    const { data: res } = await invokeFn<Record<string, CatalogListRow[]>>("pos-data", {
      workspace_id: activeWorkspaceId, resource: "inventory-list", params,
    });
    const data = res?.["inventory-list"] ?? null;
    const rows: CatalogItem[] = (data ?? []).map(r => ({
      catalogId: r.id, name: r.name, category: r.category as CatalogCategory,
      unit: r.unit, costPerUnit: Number(r.cost_per_unit),
      archived: !!r.archived, expiryDate: r.expiry_date ?? null, batchNumber: r.batch_number ?? null,
      productId: r.product_id ?? null, forSale: r.products?.for_sale !== false,
      categoryName: r.products?.product_categories?.name ?? null,
      quantity: Number(r.quantity), inventoryItemId: r.inventory_item_id ?? null,
      lowStockThreshold: Number(r.branch_low_stock_threshold ?? r.low_stock_threshold ?? 0),
    }));
    const filtered = filter === "products" ? rows.filter(x => x.productId) : rows;
    setItems(prev => isFirst ? filtered : [...prev, ...filtered]);
    setHasMore(rows.length === PAGE_SIZES.inventoryList);
    setPage(pageNum);
    if (isFirst) setLoading(false); else setLoadingMore(false);
  }, [activeWorkspaceId, activeBranchId, branchResolved, filter, debouncedSearch]);

  useEffect(() => { fetchPage(0); }, [fetchPage]);

  async function manualRefresh() {
    setRefreshing(true);
    try { await fetchPage(0); } finally { setRefreshing(false); }
  }

  const displayed = items.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()));
  const outOfStockCount = items.filter(i => i.inventoryItemId && i.quantity <= 0).length;
  const lowStockOnly    = items.filter(i => i.inventoryItemId && i.quantity > 0 && i.lowStockThreshold > 0 && i.quantity <= i.lowStockThreshold).length;
  const inStockCount    = items.filter(i => i.inventoryItemId).length - outOfStockCount - lowStockOnly;
  const lowCount = outOfStockCount + lowStockOnly;

  function openAddRawMaterial() {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }
  function openEditRawMaterial(item: CatalogItem) {
    setEditItem(item);
    setForm({
      name: item.name, category: item.category, unit: item.unit,
      cost_per_unit: fmt(item.costPerUnit, 4), initial_stock: "0",
      low_stock_threshold: fmt(item.lowStockThreshold, 4),
      expiry_date: item.expiryDate ?? "", batch_number: item.batchNumber ?? "",
    });
    setFormOpen(true);
  }

  const canSaveForm = form.name.trim().length > 0 && form.unit.trim().length > 0
    && !isNaN(parseFloat(form.cost_per_unit)) && parseFloat(form.cost_per_unit) >= 0;

  async function saveRawMaterial() {
    if (!canSaveForm) return;
    setSaving(true);
    const { error } = await invokeFn("catalog-upsert", {
      workspace_id: activeWorkspaceId,
      ...(editItem ? { id: editItem.catalogId } : {}),
      name: form.name.trim(), category: form.category, unit: form.unit.trim(),
      cost_per_unit: parseFloat(form.cost_per_unit),
      low_stock_threshold: parseFloat(form.low_stock_threshold) || 0,
      expiry_date: form.expiry_date.trim() || null,
      batch_number: form.batch_number.trim() || null,
      ...(!editItem ? { branch_id: activeBranchId, initial_stock: parseFloat(form.initial_stock) || 0 } : {}),
    });
    setSaving(false);
    if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
    setFormOpen(false);
    fetchPage(0);
  }

  async function deleteRawMaterial() {
    if (!editItem) return;
    const { error } = await invokeFn("catalog-delete", { workspace_id: activeWorkspaceId, catalog_id: editItem.catalogId });
    if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
    setFormOpen(false);
    fetchPage(0);
  }

  async function submitAdj() {
    if (!selected || !adj.quantity || !activeWorkspaceId || !activeBranchId) return;
    setAdjSaving(true);
    if (selected.inventoryItemId) {
      const { error } = await invokeFn<{ error?: string }>("inventory-adjust", {
        workspace_id: activeWorkspaceId, branch_id: activeBranchId,
        inventory_item_id: selected.inventoryItemId,
        type: adj.type, quantity: parseFloat(adj.quantity), reason: adj.reason || undefined,
      });
      setAdjSaving(false);
      if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
    } else if (selected.productId) {
      // Not yet stocked at this branch — stock-in creates the row.
      const { error } = await invokeFn("stock-in", {
        workspace_id: activeWorkspaceId, branch_id: activeBranchId, product_id: selected.productId,
        quantity: parseFloat(adj.quantity), reason: adj.reason || undefined,
      });
      setAdjSaving(false);
      if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
    } else {
      setAdjSaving(false);
      showToast({ title: "Error", message: "Add opening stock for this ingredient at a branch first.", type: "error" });
      return;
    }
    setSelected(null);
    setAdj(EMPTY_ADJ);
    fetchPage(0);
  }

  function renderRow(item: CatalogItem) {
    const color = stockColor(item, C);
    return (
      <Pressable
        style={({ pressed }) => [s.row, pressed && canWrite && s.rowPressed]}
        onPress={() => { if (canWrite) { setSelected(item); setAdj(EMPTY_ADJ); } }}
        onLongPress={() => { if (canWrite && !item.productId) openEditRawMaterial(item); }}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 1 }}>
            <Text style={s.catTag}>{item.productId ? (item.categoryName ?? "product") : item.category}</Text>
            {item.productId && !item.forSale && (
              <View style={s.supplyBadge}><Text style={s.supplyBadgeTxt}>SUPPLY</Text></View>
            )}
          </View>
          <Text style={s.name}>{item.name}</Text>
          <Text style={s.priceLine}>{peso(item.costPerUnit)} / {item.unit}</Text>
        </View>
        <View style={s.stockWrap}>
          <Text style={[s.stockQty, { color }]}>{fmt(item.quantity, 1)} {item.unit}</Text>
          <View style={[s.stockBadge, { backgroundColor: `${color}22` }]}>
            <Text style={[s.stockBadgeTxt, { color }]}>{stockLabel(item)}</Text>
          </View>
        </View>
        {canWrite && !item.productId && (
          <Pressable style={s.editIcon} onPress={() => openEditRawMaterial(item)} hitSlop={8}>
            <Feather name="edit-2" size={13} color={C.ink4} />
          </Pressable>
        )}
      </Pressable>
    );
  }

  return (
    <View style={listStyles.root}>
      <PosScreenHeader title="Inventory"
        right={<>
          {lowCount > 0 && <View style={s.alertBadge}><Text style={s.alertBadgeTxt}>⚠ {lowCount} low</Text></View>}
          <RefreshButton onPress={manualRefresh} refreshing={refreshing} compact />
          {canWrite && (
            <Pressable style={s.addBtn} onPress={openAddRawMaterial}>
              <Feather name="plus" size={13} color="#000000" /><Text style={s.addBtnTxt}>Add inventory</Text>
            </Pressable>
          )}
        </>} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll} contentContainerStyle={s.catRow}>
        {FILTERS.map(f => (
          <Pressable key={f.id}
            style={[s.catChip, filter === f.id && { borderColor: f.color, backgroundColor: `${f.color}18` }]}
            onPress={() => setFilter(f.id)}>
            <Text style={[s.catChipTxt, filter === f.id && { color: f.color }]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={listStyles.toolbar}>
        <View style={listStyles.searchWrap}>
          <Feather name="search" size={14} color={C.ink4} style={{ marginRight: 6 }} />
          <TextInput style={listStyles.searchInput} placeholder="Search inventory…" placeholderTextColor={C.ink4}
            value={search} onChangeText={setSearch} />
          {search ? <Pressable onPress={() => setSearch("")}><Text style={listStyles.clearX}>✕</Text></Pressable> : null}
        </View>
      </View>

      {!loading && items.length > 0 && (
        <View style={s.summaryRow}>
          <View style={[s.summaryCard, { borderColor: `${C.bad}44` }]}>
            <Text style={[s.summaryNum, { color: C.bad }]}>{outOfStockCount}</Text>
            <Text style={s.summaryLbl}>Out of Stock</Text>
          </View>
          <View style={[s.summaryCard, { borderColor: `${C.warn}44` }]}>
            <Text style={[s.summaryNum, { color: C.warn }]}>{lowStockOnly}</Text>
            <Text style={s.summaryLbl}>Low Stock</Text>
          </View>
          <View style={[s.summaryCard, { borderColor: `${C.good}44` }]}>
            <Text style={[s.summaryNum, { color: C.good }]}>{inStockCount}</Text>
            <Text style={s.summaryLbl}>In Stock</Text>
          </View>
        </View>
      )}

      {loading ? (
        <View style={listStyles.center}><ActivityIndicator color={C.amber} /></View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={displayed}
          keyExtractor={i => i.catalogId}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + NAV_BAR_CLEARANCE }]}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          renderItem={({ item }) => renderRow(item)}
          ListEmptyComponent={
            <View style={listStyles.center}>
              <Feather name="package" size={36} color={C.ink4} />
              <Text style={listStyles.empty}>Nothing tracked yet</Text>
              {canWrite && <Text style={listStyles.emptySub}>Turn on "Track inventory" when adding a product, or add an ingredient here</Text>}
            </View>
          }
          onEndReached={() => { if (hasMore && !loadingMore) fetchPage(page + 1); }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={C.amber} style={{ padding: 16 }} /> : null}
        />
      )}

      {/* ── Ingredient add/edit ── */}
      <FormSheetModal
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        title={editItem ? "Edit Ingredient" : "Add Inventory"}
        footer={
          <Pressable style={[fieldStyles.footerPrimaryBtn, (saving || !canSaveForm) && { opacity: 0.5 }]}
            onPress={saveRawMaterial} disabled={saving || !canSaveForm}>
            <Text style={fieldStyles.footerPrimaryBtnTxt}>{saving ? "Saving…" : editItem ? "Save Changes" : "Add Inventory"}</Text>
          </Pressable>
        }
      >
        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Category</Text>
          <View style={s.catGrid}>
            {FILTERS.filter(f => f.id !== "all" && f.id !== "products").map(c => (
              <Pressable key={c.id}
                style={[s.catBtn, form.category === c.id && { borderColor: c.color, backgroundColor: `${c.color}18` }]}
                onPress={() => setForm(f => ({ ...f, category: c.id as CatalogCategory }))}>
                <Text style={[s.catBtnTxt, form.category === c.id && { color: c.color }]}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Name *</Text>
          <TextInput style={fieldStyles.input} value={form.name}
            onChangeText={v => setForm(f => ({ ...f, name: v }))}
            placeholder="e.g. Chicken breast, Arabica beans" placeholderTextColor={C.ink4} />
        </View>
        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Unit *</Text>
          <UnitPicker value={form.unit} onChange={v => setForm(f => ({ ...f, unit: v }))} />
        </View>
        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Cost per unit (₱) *</Text>
          <TextInput style={fieldStyles.input} value={form.cost_per_unit}
            onChangeText={v => setForm(f => ({ ...f, cost_per_unit: sanitizeMoney(v) }))}
            placeholder="0.00" placeholderTextColor={C.ink4} keyboardType="decimal-pad" maxLength={12} />
        </View>
        {!editItem && (
          <View style={fieldStyles.fieldGroup}>
            <Text style={fieldStyles.fieldLabel}>Starting Quantity (this branch)</Text>
            <TextInput style={fieldStyles.input} value={form.initial_stock}
              onChangeText={v => setForm(f => ({ ...f, initial_stock: sanitizeDecimal(v, { maxDecimals: 3 }) }))}
              placeholder="0" placeholderTextColor={C.ink4} keyboardType="decimal-pad" maxLength={10} />
          </View>
        )}
        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Low Stock Alert At (0 = off)</Text>
          <TextInput style={fieldStyles.input} value={form.low_stock_threshold}
            onChangeText={v => setForm(f => ({ ...f, low_stock_threshold: sanitizeDecimal(v, { maxDecimals: 3 }) }))}
            placeholder="0" placeholderTextColor={C.ink4} keyboardType="decimal-pad" maxLength={10} />
        </View>
        <View style={fieldStyles.row2}>
          <View style={fieldStyles.fieldGroupHalf}>
            <Text style={fieldStyles.fieldLabel}>Expiry Date</Text>
            <TextInput style={fieldStyles.input} value={form.expiry_date}
              onChangeText={v => setForm(f => ({ ...f, expiry_date: sanitizeDateStr(v) }))}
              placeholder="YYYY-MM-DD" placeholderTextColor={C.ink4} autoCapitalize="none" maxLength={10} />
          </View>
          <View style={fieldStyles.fieldGroupHalf}>
            <Text style={fieldStyles.fieldLabel}>Batch Number</Text>
            <TextInput style={fieldStyles.input} value={form.batch_number}
              onChangeText={v => setForm(f => ({ ...f, batch_number: v }))}
              placeholder="e.g. B-2026-014" placeholderTextColor={C.ink4} autoCapitalize="characters" />
          </View>
        </View>
        {editItem && canWrite && (
          <Pressable style={fieldStyles.deleteBtn} onPress={deleteRawMaterial}>
            <Text style={fieldStyles.deleteBtnTxt}>Archive Ingredient</Text>
          </Pressable>
        )}
      </FormSheetModal>

      {/* ── Adjust modal (works for both product-linked and raw-material rows) ── */}
      <FormSheetModal
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        maxHeightPct="80%"
        footer={
          <Pressable style={[fieldStyles.footerPrimaryBtn, (adjSaving || !adj.quantity) && { opacity: 0.5 }]}
            onPress={submitAdj} disabled={adjSaving || !adj.quantity}>
            <Text style={fieldStyles.footerPrimaryBtnTxt}>{adjSaving ? "Saving…" : "Apply Adjustment"}</Text>
          </Pressable>
        }
      >
        <Text style={s.currentQty}>
          Current: <Text style={{ color: selected ? stockColor(selected, C) : C.ink }}>
            {fmt(selected?.quantity ?? 0, 1)} {selected?.unit}
          </Text>
          {"  ·  "}
          <Text style={{ color: C.amber }}>{peso(selected?.costPerUnit ?? 0)}/{selected?.unit}</Text>
        </Text>
        {selected?.inventoryItemId === null && (
          <Text style={s.notStockedNote}>
            Not yet stocked at this branch — the first entry here starts tracking it.
          </Text>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.typeScroll} contentContainerStyle={s.typeRow}>
          {ADJ_TYPES.filter(t => selected?.inventoryItemId !== null || t.id === "in").map(t => (
            <Pressable key={t.id} style={[s.typeBtn, adj.type === t.id && s.typeBtnActive]}
              onPress={() => setAdj(a => ({ ...a, type: t.id }))}>
              <Text style={[s.typeBtnTxt, adj.type === t.id && s.typeBtnTxtActive]}>{t.label}</Text>
              <Text style={[s.typeBtnDesc, adj.type === t.id && { color: C.amber }]}>{t.desc}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Quantity ({selected?.unit ?? "units"})</Text>
          <TextInput style={fieldStyles.input} placeholder="0" placeholderTextColor={C.ink4}
            keyboardType="decimal-pad" maxLength={10} value={adj.quantity} onChangeText={v => setAdj(a => ({ ...a, quantity: sanitizeDecimal(v, { maxDecimals: 3 }) }))} />
        </View>
        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Reason (optional)</Text>
          <TextInput style={fieldStyles.input} placeholder="e.g. Delivery received, Spillage…" placeholderTextColor={C.ink4}
            value={adj.reason} onChangeText={v => setAdj(a => ({ ...a, reason: v }))} />
        </View>
      </FormSheetModal>
    </View>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  alertBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.full, backgroundColor: `${C.warn}22`, borderWidth: 1, borderColor: `${C.warn}55` },
  alertBadgeTxt: { color: C.warn, fontSize: 11, fontWeight: "600", fontFamily: MONO },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: R.md, backgroundColor: C.amber },
  addBtnTxt: { color: "#000000", fontSize: 11, fontWeight: "700" },

  catScroll: { flexGrow: 0, backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.line },
  catRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: "row" },
  catChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.full, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  catChipTxt: { color: C.ink3, fontSize: 12, fontWeight: "600" },

  list: { paddingVertical: 6 },
  sep: { height: 1, backgroundColor: C.lineSoft, marginHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 16 },
  rowPressed: { opacity: 0.7 },
  catTag: { color: C.ink4, fontSize: 9, fontFamily: MONO, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 2 },
  name: { color: C.ink, fontSize: 14, fontWeight: "600" },
  priceLine: { color: C.ink3, fontSize: 11, fontFamily: MONO, marginTop: 2 },
  supplyBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: `${C.info}18`, borderWidth: 1, borderColor: `${C.info}40` },
  supplyBadgeTxt: { color: C.info, fontSize: 9, fontFamily: MONO, fontWeight: "700", letterSpacing: 0.5 },

  stockWrap: { alignItems: "flex-end", gap: 3, marginRight: 4 },
  stockQty: { fontSize: 13, fontWeight: "700", fontFamily: MONO },
  stockBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: R.full },
  stockBadgeTxt: { fontSize: 9, fontWeight: "600" },
  editIcon: { padding: 6 },

  summaryRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  summaryCard: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: R.lg, borderWidth: 1, backgroundColor: C.surface },
  summaryNum: { fontSize: 22, fontWeight: "800", fontFamily: MONO },
  summaryLbl: { color: C.ink4, fontSize: 10, fontWeight: "600", marginTop: 2, letterSpacing: 0.3 },

  sheetDesc: { color: C.ink4, fontSize: 12, lineHeight: 17, marginTop: -4 },
  currentQty: { color: C.ink3, fontSize: 13, fontFamily: MONO },
  notStockedNote: { color: C.warn, fontSize: 12, lineHeight: 16 },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: R.full, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  catBtnTxt: { color: C.ink3, fontSize: 12, fontWeight: "500" },

  typeScroll: { flexGrow: 0, marginHorizontal: -4 },
  typeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 4 },
  typeBtn: { flex: 1, minWidth: 100, paddingVertical: 10, paddingHorizontal: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, gap: 3 },
  typeBtnActive: { borderColor: C.amber, backgroundColor: C.amberBg },
  typeBtnTxt: { color: C.ink3, fontSize: 12, fontWeight: "600" },
  typeBtnTxtActive: { color: C.amber },
  typeBtnDesc: { color: C.ink4, fontSize: 10 },

  productRow: { paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  productRowName: { color: C.ink, fontSize: 14, fontWeight: "600" },
  noProducts: { color: C.ink4, fontSize: 13, textAlign: "center", paddingVertical: 24 },
  selectedProduct: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.amber,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  selectedProductName: { color: C.amber, fontSize: 14, fontWeight: "700", flex: 1 },
  changeLink: { color: C.ink3, fontSize: 12 },
});

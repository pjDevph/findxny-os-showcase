/**
 * Business Costing & Break-even Planner
 */
import {
  View, Text, Pressable, TextInput, StyleSheet, ScrollView,
  ActivityIndicator, Platform, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useEffect, useMemo, useCallback, type ComponentProps } from "react";
import { Feather } from "@expo/vector-icons";
import { invokeFn } from "../../services/supabase";
import { useAuth } from "../../features/auth/AuthContext";
import { useTheme } from "../../features/theme/ThemeContext";
import { R } from "../../features/theme/tokens";
import { WRITE_ROLES } from "../../features/constants";
import { sanitizeMoney } from "../../features/utils/inputSanitizers";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { KeyboardSheet } from "../../features/ui/KeyboardSheet";
import { KeyboardAwareScrollView } from "../../features/ui/KeyboardAwareScrollView";
import { useAppAlert } from "../../features/ui/AppAlertProvider";
import { useToast } from "../../features/ui/ToastProvider";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
const peso = (n: number) => `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

type Category = "startup" | "fixed" | "variable" | "marketing" | "buffer" | "growth";
type Frequency = "one_time" | "monthly" | "per_sale";
type C = ReturnType<typeof useTheme>["C"];

interface CostItem {
  id: string;
  category: Category;
  name: string;
  amount: number;
  frequency: Frequency;
  notes: string;
}

interface CostItemRow {
  id: string;
  category: Category;
  name: string;
  amount: number | string;
  frequency: Frequency;
  notes?: string | null;
}

type FeatherIconName = ComponentProps<typeof Feather>["name"];

const CATEGORIES: { id: Category; label: string; icon: FeatherIconName; color: string }[] = [
  { id: "startup",   label: "Startup",        icon: "zap",        color: "#F59E0B" },
  { id: "fixed",     label: "Fixed Monthly",  icon: "anchor",     color: "#3B82F6" },
  { id: "variable",  label: "Variable",       icon: "trending-up",color: "#10B981" },
  { id: "marketing", label: "Marketing",      icon: "radio",      color: "#8B5CF6" },
  { id: "buffer",    label: "Operations Buffer", icon: "shield",  color: "#EF4444" },
  { id: "growth",    label: "Growth",         icon: "bar-chart-2",color: "#06B6D4" },
];

const FREQ_LABELS: Record<Frequency, string> = {
  one_time: "One-time",
  monthly:  "Monthly",
  per_sale: "Per Sale",
};

const EMPTY_FORM = { category: "fixed" as Category, name: "", amount: "", frequency: "monthly" as Frequency, notes: "" };

export default function CostingScreen() {
  const { activeWorkspaceId, role } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const canEdit = role != null && (WRITE_ROLES as readonly string[]).includes(role.toLowerCase());
  const { showAlert } = useAppAlert();
  const { showToast } = useToast();

  const [items, setItems]       = useState<CostItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [addOpen, setAddOpen]   = useState(false);
  const [editItem, setEditItem] = useState<CostItem | null>(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [profitPerSale, setProfitPerSale] = useState("200");
  const [activeTab, setActiveTab] = useState<Category | "summary">("summary");

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    const { data: res } = await invokeFn<Record<string, CostItemRow[]>>("pos-data", {
      workspace_id: activeWorkspaceId,
      resource: "costing-items",
      params: {},
    });
    const data = res?.["costing-items"] ?? [];
    setItems((data ?? []).map((i) => ({
      id: i.id, category: i.category, name: i.name,
      amount: Number(i.amount), frequency: i.frequency, notes: i.notes ?? "",
    })));
    setLoading(false);
  }, [activeWorkspaceId]);

  useEffect(() => { load(); }, [load]);

  const monthlyAll       = items.filter(i => i.frequency === "monthly").reduce((s, i) => s + i.amount, 0);
  const startupTotal     = items.filter(i => i.frequency === "one_time").reduce((s, i) => s + i.amount, 0);
  const perSaleTotal     = items.filter(i => i.frequency === "per_sale").reduce((s, i) => s + i.amount, 0);
  const profit           = Math.max(0, (parseFloat(profitPerSale) || 0) - perSaleTotal);
  const breakEven        = profit > 0 ? Math.ceil(monthlyAll / profit) : null;

  const itemsByCategory  = (cat: Category) => items.filter(i => i.category === cat);
  const catTotal         = (cat: Category) => itemsByCategory(cat).reduce((s, i) => s + i.amount, 0);

  const canSubmit = form.name.trim().length > 0 && !isNaN(parseFloat(form.amount)) && parseFloat(form.amount) >= 0;

  async function saveItem() {
    if (!form.name.trim()) { showToast({ title: "Error", message: "Name is required", type: "error" }); return; }
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt < 0) { showToast({ title: "Error", message: "Enter a valid amount", type: "error" }); return; }
    setSaving(true);
    const { error } = await invokeFn("costs-upsert", {
      workspace_id: activeWorkspaceId,
      ...(editItem ? { id: editItem.id } : {}),
      category:     form.category,
      name:         form.name.trim(),
      amount:       amt,
      frequency:    form.frequency,
      notes:        form.notes,
    });
    setSaving(false);
    if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
    await load();
    setAddOpen(false);
    setEditItem(null);
    setForm(EMPTY_FORM);
  }

  async function confirmDeleteItem(id: string) {
    const { error } = await invokeFn("costs-delete", {
      workspace_id: activeWorkspaceId, cost_item_id: id,
    });
    if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
    await load();
  }

  function deleteItem(id: string) {
    showAlert("Delete Item", "Remove this cost item?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { confirmDeleteItem(id).catch(console.error); } },
    ]);
  }

  function openEdit(item: CostItem) {
    setEditItem(item);
    setForm({ category: item.category, name: item.name, amount: String(item.amount), frequency: item.frequency, notes: item.notes });
    setAddOpen(true);
  }

  function renderCategoryDetail() {
    const cat = CATEGORIES.find(c => c.id === activeTab)!;
    const catItems = itemsByCategory(activeTab as Category);
    return (
      <>
        <View style={[s.catHeaderCard, { borderTopColor: cat.color }]}>
          <View style={[s.catIcon, { backgroundColor: `${cat.color}18` }]}>
            <Feather name={cat.icon} size={18} color={cat.color} />
          </View>
          <View style={{ flex:1 }}>
            <Text style={[s.catHeaderTitle, { color: cat.color }]}>{cat.label}</Text>
            <Text style={[s.catHeaderTotal, { fontFamily: MONO }]}>{peso(catTotal(activeTab as Category))}</Text>
          </View>
          {canEdit && (
            <Pressable style={[s.addBtn, { backgroundColor: cat.color }]}
              onPress={() => { setEditItem(null); setForm({ ...EMPTY_FORM, category: activeTab as Category }); setAddOpen(true); }}>
              <Feather name="plus" size={14} color="#fff" />
              <Text style={[s.addBtnTxt, { color: "#fff" }]}>Add</Text>
            </Pressable>
          )}
        </View>

        {catItems.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyTxt}>No {cat.label} costs yet</Text>
            {canEdit && <Text style={s.emptyHint}>Tap "Add" to add your first item</Text>}
          </View>
        ) : (
          catItems.map(item => (
            <View key={item.id} style={s.itemRow}>
              <View style={{ flex:1, gap:2 }}>
                <Text style={s.itemName}>{item.name}</Text>
                {item.notes ? <Text style={s.itemNotes}>{item.notes}</Text> : null}
                <View style={s.freqBadge}>
                  <Text style={s.freqBadgeTxt}>{FREQ_LABELS[item.frequency]}</Text>
                </View>
              </View>
              <Text style={[s.itemAmount, { color: cat.color, fontFamily: MONO }]}>{peso(item.amount)}</Text>
              {canEdit && (
                <View style={s.itemActions}>
                  <Pressable style={s.itemAction} onPress={() => openEdit(item)} hitSlop={8}>
                    <Feather name="edit-2" size={13} color={C.ink3} />
                  </Pressable>
                  <Pressable style={s.itemAction} onPress={() => deleteItem(item.id)} hitSlop={8}>
                    <Feather name="trash-2" size={13} color={C.bad} />
                  </Pressable>
                </View>
              )}
            </View>
          ))
        )}
      </>
    );
  }

  const TABS: { id: Category | "summary"; label: string }[] = [
    { id: "summary",   label: "Summary" },
    { id: "startup",   label: "Startup" },
    { id: "fixed",     label: "Fixed" },
    { id: "variable",  label: "Variable" },
    { id: "marketing", label: "Marketing" },
    { id: "buffer",    label: "Buffer" },
    { id: "growth",    label: "Growth" },
  ];

  return (
    <View style={s.root}>
      {/* Header */}
      <PosScreenHeader title="Business Costing"
        right={canEdit
          ? <Pressable style={s.addBtn} onPress={() => { setEditItem(null); setForm(EMPTY_FORM); setAddOpen(true); }}>
              <Feather name="plus" size={14} color="#000000" />
              <Text style={s.addBtnTxt}>Add Cost</Text>
            </Pressable>
          : undefined
        } />

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={s.tabRow}>
        {TABS.map(t => (
          <Pressable key={t.id} style={[s.tabBtn, activeTab===t.id && s.tabBtnActive]} onPress={() => setActiveTab(t.id)}>
            <Text style={[s.tabBtnTxt, activeTab===t.id && s.tabBtnTxtActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.amber} /></View>
      ) : (
        <KeyboardAwareScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>

          {activeTab === "summary" ? (
            <>
              {/* Summary cards */}
              <View style={s.cardRow}>
                <View style={[s.card, { borderTopColor: "#3B82F6" }]}>
                  <Text style={s.cardLabel}>Total Monthly Costs</Text>
                  <Text style={[s.cardValue, { color: "#3B82F6" }]}>{peso(monthlyAll)}</Text>
                  <Text style={s.cardSub}>fixed + variable + marketing + buffer</Text>
                </View>
                <View style={[s.card, { borderTopColor: "#F59E0B" }]}>
                  <Text style={s.cardLabel}>Startup Investment</Text>
                  <Text style={[s.cardValue, { color: "#F59E0B" }]}>{peso(startupTotal)}</Text>
                  <Text style={s.cardSub}>one-time costs</Text>
                </View>
              </View>

              {/* Break-even calculator */}
              <View style={s.breakEvenCard}>
                <View style={s.breakEvenHeader}>
                  <Feather name="target" size={16} color={C.amber} />
                  <Text style={s.breakEvenTitle}>Break-even Calculator</Text>
                </View>
                <Text style={s.breakEvenFormula}>Monthly Fixed Costs ÷ Profit per Sale = Break-even Orders</Text>
                <View style={s.beRow}>
                  <Text style={s.beLabel}>Monthly Costs</Text>
                  <Text style={[s.beValue, { fontFamily: MONO }]}>{peso(monthlyAll)}</Text>
                </View>
                <View style={s.beRow}>
                  <Text style={s.beLabel}>Cost per Sale</Text>
                  <Text style={[s.beValue, { fontFamily: MONO }]}>{peso(perSaleTotal)}</Text>
                </View>
                <View style={s.beRow}>
                  <Text style={s.beLabel}>Selling Price / Profit per Sale</Text>
                  <TextInput
                    style={[s.beInput, { fontFamily: MONO }]}
                    keyboardType="decimal-pad"
                    maxLength={12}
                    value={profitPerSale}
                    onChangeText={(v) => setProfitPerSale(sanitizeMoney(v))}
                    placeholder="200"
                    placeholderTextColor={C.ink4}
                  />
                </View>
                <View style={s.beRow}>
                  <Text style={s.beLabel}>Net Profit per Sale</Text>
                  <Text style={[s.beValue, { fontFamily: MONO, color: profit > 0 ? C.good : C.bad }]}>{peso(profit)}</Text>
                </View>
                <View style={[s.beDivider]} />
                <View style={s.beResult}>
                  <Text style={s.beResultLabel}>Break-even</Text>
                  <Text style={[s.beResultValue, { color: C.amber, fontFamily: MONO }]}>
                    {breakEven !== null ? `${breakEven} orders/month` : "Set a selling price above cost"}
                  </Text>
                </View>
              </View>

              {/* Category overview */}
              {CATEGORIES.map(cat => {
                const total = catTotal(cat.id);
                const count = itemsByCategory(cat.id).length;
                if (count === 0) return null;
                return (
                  <Pressable key={cat.id} style={s.catRow} onPress={() => setActiveTab(cat.id)}>
                    <View style={[s.catIcon, { backgroundColor: `${cat.color}18` }]}>
                      <Feather name={cat.icon} size={14} color={cat.color} />
                    </View>
                    <View style={{ flex:1 }}>
                      <Text style={s.catLabel}>{cat.label}</Text>
                      <Text style={s.catCount}>{count} item{count !== 1 ? "s" : ""}</Text>
                    </View>
                    <Text style={[s.catTotal, { color: cat.color, fontFamily: MONO }]}>{peso(total)}</Text>
                    <Feather name="chevron-right" size={14} color={C.ink4} />
                  </Pressable>
                );
              })}
            </>
          ) : renderCategoryDetail()
          }
        </KeyboardAwareScrollView>
      )}

      {/* Add/Edit modal */}
      <Modal visible={addOpen} animationType="fade" transparent onRequestClose={() => setAddOpen(false)}>
        <KeyboardSheet style={s.modalBd}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setAddOpen(false)} />
          <Pressable style={s.formSheet} onPress={() => {}}>
            <View style={s.formHeader}>
              <Text style={[s.formTitle, { flex: 1, marginBottom: 0 }]} numberOfLines={1}>{editItem ? "Edit Cost" : "Add Cost Item"}</Text>
              <Pressable onPress={() => setAddOpen(false)} hitSlop={8} style={{ padding: 4 }}>
                <Feather name="x" size={20} color={C.ink3} />
              </Pressable>
            </View>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={s.formContent} keyboardShouldPersistTaps="handled">
              <Text style={s.formLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:8, flexDirection:"row", marginBottom:4 }}>
                {CATEGORIES.map(cat => (
                  <Pressable key={cat.id}
                    style={[s.catChip, form.category===cat.id && { borderColor:cat.color, backgroundColor:`${cat.color}18` }]}
                    onPress={() => setForm(f => ({ ...f, category: cat.id }))}>
                    <Text style={[s.catChipTxt, form.category===cat.id && { color:cat.color }]}>{cat.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={s.formLabel}>Name <Text style={{ color:C.bad }}>*</Text></Text>
              <TextInput style={s.formInput} value={form.name} onChangeText={v => setForm(f => ({ ...f, name:v }))}
                placeholder="e.g. Monthly Rent" placeholderTextColor={C.ink4} />

              <Text style={s.formLabel}>Amount (₱) <Text style={{ color:C.bad }}>*</Text></Text>
              <TextInput style={s.formInput} value={form.amount} onChangeText={v => setForm(f => ({ ...f, amount:sanitizeMoney(v) }))}
                maxLength={12}
                placeholder="0.00" placeholderTextColor={C.ink4} keyboardType="decimal-pad" />

              <Text style={s.formLabel}>Frequency</Text>
              <View style={{ flexDirection:"row", gap:8 }}>
                {(["one_time","monthly","per_sale"] as Frequency[]).map(f => (
                  <Pressable key={f} style={[s.freqBtn, form.frequency===f && s.freqBtnActive]}
                    onPress={() => setForm(ff => ({ ...ff, frequency:f }))}>
                    <Text style={[s.freqBtnTxt, form.frequency===f && s.freqBtnTxtActive]}>{FREQ_LABELS[f]}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={s.formLabel}>Notes (optional)</Text>
              <TextInput style={[s.formInput, { minHeight:60, textAlignVertical:"top" }]}
                value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes:v }))}
                placeholder="Additional details…" placeholderTextColor={C.ink4} multiline />
            </ScrollView>
            <View style={s.formFooter}>
              <Pressable
                style={[s.footerSaveBtn, (saving || !canSubmit) && { opacity: 0.6 }]}
                onPress={saveItem} disabled={saving || !canSubmit}>
                <Text style={s.footerSaveBtnTxt}>{saving ? "Saving…" : editItem ? "Save Changes" : "Add Cost Item"}</Text>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardSheet>
      </Modal>
    </View>
  );
}

const makeStyles = (C: C) => StyleSheet.create({
  root:   { flex:1, backgroundColor:C.bg },
  header: { flexDirection:"row", alignItems:"center", gap:10, paddingHorizontal:16, paddingVertical:12, backgroundColor:C.bg2, borderBottomWidth:1, borderBottomColor:C.line },
  menuBtn:  { paddingVertical: 4, paddingRight: 4 },
  backBtn:  { paddingRight:6 },
  backText: { color:C.amber, fontSize:15, fontWeight:"600" },
  title:    { color:C.ink, fontSize:17, fontWeight:"700" },
  addBtn:   { flexDirection:"row", alignItems:"center", gap:6, paddingHorizontal:12, paddingVertical:7, borderRadius:8, backgroundColor:C.amber },
  addBtnTxt:{ color:"#000000", fontSize:13, fontWeight:"700" },
  tabScroll: { flexGrow:0, backgroundColor:C.bg2, borderBottomWidth:1, borderBottomColor:C.line },
  tabRow:    { paddingHorizontal:12, paddingVertical:8, gap:6, flexDirection:"row" },
  tabBtn:    { paddingHorizontal:14, paddingVertical:7, borderRadius:8, backgroundColor:C.surface, borderWidth:1, borderColor:C.line },
  tabBtnActive: { backgroundColor:`${C.amber}18`, borderColor:C.amber },
  tabBtnTxt:    { color:C.ink3, fontSize:12, fontWeight:"600" },
  tabBtnTxtActive: { color:C.amber },
  center:  { flex:1, alignItems:"center", justifyContent:"center" },
  content: { padding:16, gap:12, paddingBottom:40 },
  cardRow: { flexDirection:"row", gap:12 },
  card:    { flex:1, backgroundColor:C.surface, borderRadius:12, borderWidth:1, borderColor:C.line, borderTopWidth:3, padding:14, gap:4 },
  cardLabel: { color:C.ink4, fontSize:10, letterSpacing:0.5 },
  cardValue: { fontSize:22, fontWeight:"800" },
  cardSub:   { color:C.ink4, fontSize:10, lineHeight:14 },
  breakEvenCard: { backgroundColor:C.surface, borderRadius:12, borderWidth:1, borderColor:`${C.amber}33`, padding:16, gap:10 },
  breakEvenHeader: { flexDirection:"row", alignItems:"center", gap:8 },
  breakEvenTitle:  { color:C.ink, fontSize:14, fontWeight:"700" },
  breakEvenFormula:{ color:C.ink4, fontSize:11, fontStyle:"italic", borderLeftWidth:2, borderLeftColor:C.amber, paddingLeft:10 },
  beRow:   { flexDirection:"row", alignItems:"center", justifyContent:"space-between" },
  beLabel: { color:C.ink3, fontSize:12, flex:1 },
  beValue: { color:C.ink, fontSize:14, fontWeight:"700" },
  beInput: { backgroundColor:C.bg2, borderRadius:8, borderWidth:1, borderColor:`${C.amber}55`, paddingHorizontal:12, paddingVertical:6, color:C.amber, fontSize:15, fontWeight:"700", minWidth:100, textAlign:"right" },
  beDivider: { height:1, backgroundColor:C.line },
  beResult:  { flexDirection:"row", justifyContent:"space-between", alignItems:"center" },
  beResultLabel: { color:C.ink, fontSize:13, fontWeight:"600" },
  beResultValue: { fontSize:16, fontWeight:"800" },
  catRow:    { flexDirection:"row", alignItems:"center", gap:12, backgroundColor:C.surface, borderRadius:10, borderWidth:1, borderColor:C.line, padding:14 },
  catIcon:   { width:34, height:34, borderRadius:10, alignItems:"center", justifyContent:"center" },
  catLabel:  { color:C.ink, fontSize:13, fontWeight:"600" },
  catCount:  { color:C.ink4, fontSize:11, marginTop:1 },
  catTotal:  { fontSize:15, fontWeight:"700" },
  catHeaderCard: { flexDirection:"row", alignItems:"center", gap:12, backgroundColor:C.surface, borderRadius:12, borderWidth:1, borderColor:C.line, borderTopWidth:3, padding:14 },
  catHeaderTitle: { fontSize:16, fontWeight:"700" },
  catHeaderTotal: { fontSize:20, fontWeight:"800", color:C.ink, marginTop:2 },
  emptyWrap: { alignItems:"center", paddingVertical:40, gap:8 },
  emptyTxt:  { color:C.ink4, fontSize:13 },
  emptyHint: { color:C.ink4, fontSize:11, fontStyle:"italic" },
  itemRow:   { flexDirection:"row", alignItems:"flex-start", gap:12, backgroundColor:C.surface, borderRadius:10, borderWidth:1, borderColor:C.line, padding:14 },
  itemName:  { color:C.ink, fontSize:13, fontWeight:"600" },
  itemNotes: { color:C.ink4, fontSize:11, fontStyle:"italic" },
  freqBadge: { alignSelf:"flex-start", backgroundColor:C.bg2, borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:C.line },
  freqBadgeTxt: { color:C.ink4, fontSize:10, fontWeight:"600" },
  itemAmount:  { fontSize:15, fontWeight:"700", paddingTop:2 },
  itemActions: { flexDirection:"row", gap:6 },
  itemAction:  { width:28, height:28, borderRadius:8, alignItems:"center", justifyContent:"center", backgroundColor:C.bg2, borderWidth:1, borderColor:C.line },
  modalBd:   { flex:1, backgroundColor:"rgba(0,0,0,0.55)", justifyContent:"center", alignItems:"center", padding:16 },
  formSheet: { backgroundColor:C.bg2, borderRadius:20, overflow:"hidden", maxHeight:"88%", width:"100%", maxWidth:640 },
  formHeader:  { flexDirection:"row", alignItems:"center", justifyContent:"space-between", gap:10, paddingHorizontal:20, paddingTop:20, paddingBottom:14 },
  formContent: { padding:20, gap:10, paddingBottom:40 },
  formFooter:  { paddingHorizontal:20, paddingTop:10, paddingBottom:20, borderTopWidth:1, borderTopColor:C.line },
  formTitle:   { color:C.ink, fontSize:17, fontWeight:"700", marginBottom:6 },
  formLabel:   { color:C.ink3, fontSize:11, fontWeight:"600", letterSpacing:0.5, textTransform:"uppercase" },
  formInput:   { backgroundColor:C.surface, borderRadius:10, borderWidth:1, borderColor:C.line, paddingHorizontal:14, paddingVertical:12, color:C.ink, fontSize:14 },
  catChip:     { paddingHorizontal:12, paddingVertical:7, borderRadius:8, backgroundColor:C.surface, borderWidth:1, borderColor:C.line },
  catChipTxt:  { color:C.ink3, fontSize:12, fontWeight:"600" },
  freqBtn:     { flex:1, paddingVertical:9, alignItems:"center", borderRadius:8, backgroundColor:C.surface, borderWidth:1, borderColor:C.line },
  freqBtnActive:   { backgroundColor:`${C.amber}18`, borderColor:C.amber },
  freqBtnTxt:      { color:C.ink3, fontSize:12, fontWeight:"600" },
  freqBtnTxtActive:{ color:C.amber },
  saveBtn:    { backgroundColor:C.amber, borderRadius:10, padding:15, alignItems:"center", marginTop:8 },
  saveBtnTxt: { color:"#000000", fontSize:15, fontWeight:"700" },
  footerSaveBtn:    { backgroundColor:C.amber, borderRadius:R.cta, padding:14, alignItems:"center" },
  footerSaveBtnTxt: { color:"#000000", fontSize:13, fontWeight:"700" },
});

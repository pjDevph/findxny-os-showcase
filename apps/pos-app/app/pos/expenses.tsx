import {
  View, Text, Pressable, TextInput, FlatList,
  StyleSheet, ActivityIndicator, Platform,
} from "react-native";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { invokeFn } from "../../services/supabase";
import { useAuth } from "../../features/auth/AuthContext";
import { R } from "../../features/theme/tokens";
import { useTheme } from "../../features/theme/ThemeContext";
import { WRITE_ROLES } from "../../features/constants";
import { sanitizeMoney, sanitizeDateStr } from "../../features/utils/inputSanitizers";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { useToast } from "../../features/ui/ToastProvider";
import { useAppAlert } from "../../features/ui/AppAlertProvider";
import { FormSheetModal } from "../../features/ui/FormSheetModal";
import { makeFormFieldStyles } from "../../features/ui/formFieldStyles";
import { makeListToolbarStyles } from "../../features/ui/listToolbarStyles";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
const peso = (n: number) => `₱${Number(n).toFixed(2)}`;

type PaymentMethod = "cash" | "bank_transfer" | "card" | "gcash" | "maya" | "other";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash", bank_transfer: "Bank Transfer", card: "Card", gcash: "GCash", maya: "Maya", other: "Other",
};

interface Category { id: string; name: string; }

interface Expense {
  id: string;
  expense_date: string;
  amount: number;
  payment_method: PaymentMethod;
  vendor_name: string | null;
  notes: string | null;
  category_id: string | null;
  expense_categories: { id: string; name: string } | null;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function startOfMonthStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
}
function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

const EMPTY_FORM = {
  expense_date: todayStr(), category_id: "", amount: "",
  payment_method: "cash" as PaymentMethod, vendor_name: "", notes: "",
};

export default function ExpensesScreen() {
  const { activeWorkspaceId, activeBranchId, role } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const fieldStyles = useMemo(() => makeFormFieldStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const listStyles = useMemo(() => makeListToolbarStyles(C, insets.bottom), [C, insets.bottom]);
  const canWrite = role != null && (WRITE_ROLES as readonly string[]).includes(role);
  const { showToast } = useToast();
  const { showAlert } = useAppAlert();

  const [expenses, setExpenses]     = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [dateFrom, setDateFrom]     = useState(startOfMonthStr());
  const [dateTo, setDateTo]         = useState(todayStr());

  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    const [expRes, catRes] = await Promise.all([
      invokeFn<{ expenses: Expense[] }>("expenses-list", {
        workspace_id: activeWorkspaceId, date_from: dateFrom, date_to: dateTo,
      }),
      invokeFn<{ categories: Category[] }>("expense-categories-list", {
        workspace_id: activeWorkspaceId,
      }),
    ]);
    if (expRes.error) showToast({ title: "Error", message: expRes.error.message, type: "error" });
    setExpenses(expRes.data?.expenses ?? []);
    setCategories(catRes.data?.categories ?? []);
    setLoading(false);
  }, [activeWorkspaceId, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  function openAdd() {
    setForm({ ...EMPTY_FORM, expense_date: todayStr() });
    setShowForm(true);
  }

  async function saveExpense() {
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) { showToast({ title: "Error", message: "Enter a valid amount", type: "error" }); return; }
    setSaving(true);
    const { error } = await invokeFn("expenses-upsert", {
      workspace_id: activeWorkspaceId,
      expense_date: form.expense_date,
      category_id: form.category_id || undefined,
      amount: amt,
      payment_method: form.payment_method,
      vendor_name: form.vendor_name.trim() || undefined,
      notes: form.notes.trim() || undefined,
      branch_id: activeBranchId || undefined,
    });
    setSaving(false);
    if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
    setShowForm(false);
    load();
  }

  function confirmDelete(e: Expense) {
    showAlert("Delete Expense", `Remove this ${peso(e.amount)} expense? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { deleteExpense(e).catch(console.error); } },
    ]);
  }

  async function deleteExpense(e: Expense) {
    const { error } = await invokeFn("expenses-delete", { workspace_id: activeWorkspaceId, expense_id: e.id });
    if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
    load();
  }

  return (
    <View style={listStyles.root}>
      <PosScreenHeader title="Expenses"
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={listStyles.count}>{expenses.length} item{expenses.length === 1 ? "" : "s"}</Text>
            {canWrite && (
              <Pressable style={listStyles.addBtn} onPress={openAdd}>
                <Text style={listStyles.addBtnTxt}>+ Add</Text>
              </Pressable>
            )}
          </View>
        } />

      <View style={s.summaryStrip}>
        <View style={s.summaryChip}>
          <Text style={[s.summaryVal, { color: C.amber }]}>{peso(total)}</Text>
          <Text style={s.summaryLbl}>Total ({fmtDate(dateFrom)} – {fmtDate(dateTo)})</Text>
        </View>
      </View>

      {loading ? (
        <View style={listStyles.center}><ActivityIndicator color={C.amber} /></View>
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(e) => e.id}
          contentContainerStyle={listStyles.list}
          renderItem={({ item: e }) => (
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <View style={s.nameRow}>
                  <Text style={s.vendor}>{e.vendor_name || "Expense"}</Text>
                  {e.expense_categories && (
                    <View style={s.catPill}><Text style={s.catPillTxt}>{e.expense_categories.name}</Text></View>
                  )}
                </View>
                <Text style={s.meta}>{fmtDate(e.expense_date)} · {PAYMENT_LABELS[e.payment_method]}</Text>
                {!!e.notes && <Text style={s.notes} numberOfLines={1}>{e.notes}</Text>}
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Text style={s.amount}>{peso(e.amount)}</Text>
                {canWrite && (
                  <Pressable onPress={() => confirmDelete(e)} hitSlop={8}>
                    <Feather name="trash-2" size={14} color={C.ink4} />
                  </Pressable>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={listStyles.center}>
              <Text style={listStyles.empty}>No expenses found</Text>
              {canWrite && <Text style={listStyles.emptySub}>Tap + Add to log one</Text>}
            </View>
          }
        />
      )}

      <FormSheetModal
        visible={showForm}
        onClose={() => setShowForm(false)}
        title="New Expense"
        footer={
          <Pressable
            style={[fieldStyles.footerPrimaryBtn, (saving || !form.amount) && { opacity: 0.5 }]}
            onPress={saveExpense}
            disabled={saving || !form.amount}
          >
            <Text style={fieldStyles.footerPrimaryBtnTxt}>{saving ? "Saving…" : "Save Expense"}</Text>
          </Pressable>
        }
      >
        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Date</Text>
          <TextInput style={fieldStyles.input} value={form.expense_date}
            onChangeText={(v) => setForm((f) => ({ ...f, expense_date: sanitizeDateStr(v) }))}
            maxLength={10}
            placeholder="YYYY-MM-DD" placeholderTextColor={C.ink4} autoCapitalize="none" />
        </View>

        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Category</Text>
          <View style={s.chipGrid}>
            {categories.map((c) => (
              <Pressable key={c.id} style={[s.chip, form.category_id === c.id && s.chipSel]}
                onPress={() => setForm((f) => ({ ...f, category_id: c.id }))}>
                <Text style={[s.chipTxt, form.category_id === c.id && s.chipTxtSel]}>{c.name}</Text>
              </Pressable>
            ))}
            {categories.length === 0 && <Text style={s.meta}>No categories yet — add one on web first.</Text>}
          </View>
        </View>

        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Amount (₱) *</Text>
          <TextInput style={fieldStyles.input} value={form.amount}
            onChangeText={(v) => setForm((f) => ({ ...f, amount: sanitizeMoney(v) }))}
            maxLength={12}
            placeholder="0.00" placeholderTextColor={C.ink4} keyboardType="decimal-pad" />
        </View>

        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Payment Method</Text>
          <View style={s.chipGrid}>
            {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
              <Pressable key={m} style={[s.chip, form.payment_method === m && s.chipSel]}
                onPress={() => setForm((f) => ({ ...f, payment_method: m }))}>
                <Text style={[s.chipTxt, form.payment_method === m && s.chipTxtSel]}>{PAYMENT_LABELS[m]}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Vendor / Description</Text>
          <TextInput style={fieldStyles.input} value={form.vendor_name}
            onChangeText={(v) => setForm((f) => ({ ...f, vendor_name: v }))}
            placeholder="e.g. Meralco, SM Supermarket…" placeholderTextColor={C.ink4} />
        </View>

        <View style={fieldStyles.fieldGroup}>
          <Text style={fieldStyles.fieldLabel}>Notes</Text>
          <TextInput style={[fieldStyles.input, { minHeight: 56, textAlignVertical: "top" }]}
            value={form.notes} multiline
            onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
            placeholder="Optional notes…" placeholderTextColor={C.ink4} />
        </View>
      </FormSheetModal>
    </View>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  summaryStrip: { paddingHorizontal: 12, paddingTop: 10, backgroundColor: C.bg2 },
  summaryChip:  { alignItems: "center", paddingVertical: 10, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  summaryVal:   { fontSize: 18, fontWeight: "700", fontFamily: MONO },
  summaryLbl:   { color: C.ink3, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 2 },

  row:        { flexDirection: "row", alignItems: "flex-start", backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, marginBottom: 8, padding: 14, gap: 12 },
  nameRow:    { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  vendor:     { color: C.ink, fontSize: 14, fontWeight: "600" },
  catPill:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: R.full, backgroundColor: `${C.ink3}18`, borderWidth: 1, borderColor: C.line },
  catPillTxt: { color: C.ink3, fontSize: 10, fontWeight: "600" },
  meta:       { color: C.ink3, fontSize: 12 },
  notes:      { color: C.ink4, fontSize: 11, fontStyle: "italic", marginTop: 2 },
  amount:     { color: C.bad, fontSize: 15, fontWeight: "700", fontFamily: MONO },

  chipGrid:   { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.full, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  chipSel:    { backgroundColor: `${C.amber}22`, borderColor: `${C.amber}66` },
  chipTxt:    { color: C.ink3, fontSize: 12, fontWeight: "500" },
  chipTxtSel: { color: C.amber, fontWeight: "700" },
});

import { Pressable, Switch, Text, TextInput, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { R } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeContext";
import { MONO } from "../../theme/mono";
import { FormSheetModal } from "../../ui/FormSheetModal";
import { makeFormFieldStyles } from "../../ui/formFieldStyles";
import { ChipPickerGrid, type ChipOption } from "../../ui/ChipPickerGrid";
import { UnitPicker } from "../../ui/UnitPicker";
import { sanitizeMoney, sanitizeDecimal } from "../../utils/inputSanitizers";
import { RecipeEditor } from "./RecipeEditor";
import type { Category, Product, ProductForm, RecipeLine, PrepStation } from "../types";

const PREP_STATIONS: { id: PrepStation; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: "none", label: "None", icon: "minus-circle" },
  { id: "kitchen", label: "Kitchen", icon: "coffee" },
  { id: "drinks", label: "Drinks", icon: "droplet" },
  { id: "counter", label: "Counter", icon: "package" },
];

interface Props {
  readonly visible: boolean;
  readonly editProduct: Product | null;
  readonly categories: readonly Category[];
  readonly form: ProductForm;
  readonly onFormChange: (patch: Partial<ProductForm>) => void;
  readonly saving: boolean;
  readonly recipeSaving: boolean;
  readonly canWrite: boolean;
  readonly showAdvanced: boolean;
  readonly onShowAdvancedChange: (v: boolean) => void;
  readonly stockMode: "simple" | "recipe";
  readonly onStockModeChange: (v: "simple" | "recipe") => void;
  readonly stockUnit: string;
  readonly onStockUnitChange: (v: string) => void;
  readonly stockQty: string;
  readonly onStockQtyChange: (v: string) => void;
  readonly stockThreshold: string;
  readonly onStockThresholdChange: (v: string) => void;
  readonly alreadyActivated: boolean;
  readonly recipe: readonly RecipeLine[];
  readonly recipeCogs: number;
  readonly onAddIngredient: () => void;
  readonly onRemoveRecipeLine: (line: RecipeLine) => void;
  readonly onClose: () => void;
  readonly onSave: () => void;
}

export function ProductFormModal({
  visible, editProduct, categories, form, onFormChange, saving, recipeSaving, canWrite,
  showAdvanced, onShowAdvancedChange,
  stockMode, onStockModeChange, stockUnit, onStockUnitChange, stockQty, onStockQtyChange,
  stockThreshold, onStockThresholdChange, alreadyActivated,
  recipe, recipeCogs, onAddIngredient, onRemoveRecipeLine,
  onClose, onSave,
}: Props) {
  const { C } = useTheme();
  const s = styles(C);
  const fieldStyles = makeFormFieldStyles(C);
  const formPrice = parseFloat(form.price) || 0;

  const categoryOptions: ChipOption[] = [
    { key: "", label: "None" },
    ...categories.map(c => ({ key: c.id, label: c.name })),
  ];

  return (
    <FormSheetModal
      visible={visible}
      onClose={onClose}
      title={editProduct ? "Edit Product" : "New Product"}
      footer={
        <Pressable
          style={[fieldStyles.footerPrimaryBtn, (saving || !form.name.trim() || !form.price) && { opacity: 0.5 }]}
          onPress={onSave}
          disabled={saving || !form.name.trim() || !form.price}>
          <Text style={fieldStyles.footerPrimaryBtnTxt}>
            {saving || recipeSaving ? "Saving…" : editProduct ? "Save Changes" : "Create Product"}
          </Text>
        </Pressable>
      }
    >
      <Text style={s.fieldLabel}>Name *</Text>
      <TextInput style={fieldStyles.input}
        placeholder="e.g. Beef Belly Adobo Bowl"
        placeholderTextColor={C.ink4}
        maxLength={80}
        value={form.name}
        onChangeText={v => onFormChange({ name: v })} />

      <Text style={s.fieldLabel}>Category</Text>
      <ChipPickerGrid options={categoryOptions} selectedKey={form.category_id || ""} onSelect={(k) => onFormChange({ category_id: k })} />

      <Text style={s.fieldLabel}>Selling Price (₱) *</Text>
      <TextInput style={fieldStyles.input}
        placeholder="0.00" placeholderTextColor={C.ink4}
        keyboardType="decimal-pad"
        maxLength={12}
        value={form.price}
        onChangeText={v => onFormChange({ price: sanitizeMoney(v) })} />

      <View style={s.switchSection}>
        <View style={[s.switchRow, { borderBottomWidth: 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchLabel}>Track inventory</Text>
            <Text style={s.switchSub}>
              Off for services, rooms, or delivery fees. On for anything with real stock —
              choose below whether it's counted directly or made from a recipe.
            </Text>
          </View>
          <Switch value={form.track_inventory}
            onValueChange={v => onFormChange({ track_inventory: v })}
            trackColor={{ true: C.good }} thumbColor={C.ink} />
        </View>
      </View>

      <View style={{ marginBottom: 8 }}>
        <Text style={[s.switchLabel, { marginBottom: 8 }]}>Preparation Station</Text>
        <View style={s.row4}>
          {PREP_STATIONS.map(opt => {
            const active = form.prep_station === opt.id;
            return (
              <Pressable key={opt.id}
                style={[s.rowBtn, active && s.rowBtnActive]}
                onPress={() => onFormChange({ prep_station: opt.id })}>
                <Feather name={opt.icon} size={13} color={active ? C.amber : C.ink3} />
                <Text style={[s.rowBtnTxt, active && { color: C.amber }]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.switchSub}>
          {form.prep_station === "none" ? "No prep ticket — item goes straight to counter"
            : form.prep_station === "kitchen" ? "Sends ticket to Kitchen station"
            : form.prep_station === "drinks" ? "Sends ticket to Drinks / barista station"
            : "Sends ticket to Counter / packaging station"}
        </Text>
      </View>

      <View style={s.switchSection}>
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchLabel}>For sale on web menu</Text>
            <Text style={s.switchSub}>Show on your public menu site — independent of POS</Text>
          </View>
          <Switch value={form.for_sale} onValueChange={v => onFormChange({ for_sale: v })} trackColor={{ true: C.amber }} thumbColor={C.ink} />
        </View>
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchLabel}>Active on POS</Text>
            <Text style={s.switchSub}>Hidden products won't appear for cashiers — independent of the web menu</Text>
          </View>
          <Switch value={form.active} onValueChange={v => onFormChange({ active: v })} trackColor={{ true: C.good }} thumbColor={C.ink} />
        </View>
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchLabel}>Pin to top of POS grid</Text>
            <Text style={s.switchSub}>Pinned products appear first for cashiers</Text>
          </View>
          <Switch value={form.is_pinned} onValueChange={v => onFormChange({ is_pinned: v })} trackColor={{ true: C.amber }} thumbColor={C.ink} />
        </View>
        <View style={[s.switchRow, { borderBottomWidth: 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchLabel}>Featured on landing page</Text>
            <Text style={s.switchSub}>Shows in featured section of your menu site</Text>
          </View>
          <Switch value={form.featured} onValueChange={v => onFormChange({ featured: v })} trackColor={{ true: C.info }} thumbColor={C.ink} />
        </View>
      </View>

      {form.track_inventory && (
        <>
          <View style={s.row4}>
            {([{ id: "simple" as const, label: "Simple quantity" }, { id: "recipe" as const, label: "Recipe" }]).map(opt => {
              const active = stockMode === opt.id;
              return (
                <Pressable key={opt.id}
                  disabled={alreadyActivated}
                  style={[s.rowBtn, active && s.rowBtnActive, alreadyActivated && { opacity: 0.6 }]}
                  onPress={() => onStockModeChange(opt.id)}>
                  <Text style={[s.rowBtnTxt, active && { color: C.amber }]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {stockMode === "simple" ? (
            alreadyActivated ? (
              <View style={s.note}>
                <Feather name="check-circle" size={13} color={C.good} />
                <Text style={s.noteText}>
                  Stock tracking is active for this product. Adjust its quantity from the
                  Inventory screen — mode can't be changed once activated.
                </Text>
              </View>
            ) : (
              <>
                <Text style={s.switchSub}>
                  For items you physically count — bottled drinks, packaged goods, consumables.
                </Text>
                <View style={fieldStyles.fieldGroup}>
                  <Text style={s.fieldLabel}>Unit *</Text>
                  <UnitPicker value={stockUnit} onChange={onStockUnitChange} />
                </View>
                <View style={fieldStyles.row2}>
                  <View style={fieldStyles.fieldGroupHalf}>
                    <Text style={s.fieldLabel}>Starting Quantity *</Text>
                    <TextInput style={fieldStyles.input} placeholder="0" placeholderTextColor={C.ink4}
                      keyboardType="decimal-pad" maxLength={10} value={stockQty}
                      onChangeText={v => onStockQtyChange(sanitizeDecimal(v, { maxDecimals: 3 }))} />
                  </View>
                  <View style={fieldStyles.fieldGroupHalf}>
                    <Text style={s.fieldLabel}>Low Stock Alert At</Text>
                    <TextInput style={fieldStyles.input} placeholder="0 = disabled" placeholderTextColor={C.ink4}
                      keyboardType="decimal-pad" maxLength={10} value={stockThreshold}
                      onChangeText={v => onStockThresholdChange(sanitizeDecimal(v, { maxDecimals: 3 }))} />
                  </View>
                </View>
              </>
            )
          ) : (
            <RecipeEditor
              recipe={recipe} recipeCogs={recipeCogs} formPrice={formPrice} canWrite={canWrite}
              onAddIngredient={onAddIngredient} onRemoveLine={onRemoveRecipeLine}
            />
          )}
        </>
      )}

      <Pressable style={s.advancedToggle} onPress={() => onShowAdvancedChange(!showAdvanced)}>
        <Feather name={showAdvanced ? "chevron-up" : "chevron-down"} size={14} color={C.ink3} />
        <Text style={s.advancedToggleTxt}>
          {showAdvanced ? "Hide details" : "More details"}
          {(!showAdvanced && (form.sku || form.barcode || form.description || form.image_url)) ? "  ·  has values" : ""}
        </Text>
        <Text style={s.advancedToggleSub}>SKU, barcode, description, image</Text>
      </Pressable>

      {showAdvanced && (
        <>
          <View style={fieldStyles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>SKU</Text>
              <TextInput style={fieldStyles.input} placeholder="Optional" placeholderTextColor={C.ink4}
                autoCapitalize="none" value={form.sku} onChangeText={v => onFormChange({ sku: v })} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>Barcode</Text>
              <TextInput style={fieldStyles.input} placeholder="Optional" placeholderTextColor={C.ink4}
                autoCapitalize="none" maxLength={32} value={form.barcode} onChangeText={v => onFormChange({ barcode: v })} />
            </View>
          </View>
          <Text style={s.fieldLabel}>Description</Text>
          <TextInput style={[fieldStyles.input, { minHeight: 56, textAlignVertical: "top" }]}
            placeholder="Short description for menu / landing page"
            placeholderTextColor={C.ink4} multiline maxLength={300}
            value={form.description} onChangeText={v => onFormChange({ description: v })} />
          <Text style={s.fieldLabel}>Image URL</Text>
          <TextInput style={fieldStyles.input}
            placeholder="https://… (paste from web admin)"
            placeholderTextColor={C.ink4} autoCapitalize="none" autoCorrect={false}
            value={form.image_url} onChangeText={v => onFormChange({ image_url: v })} />
        </>
      )}
    </FormSheetModal>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  fieldLabel: { color: C.ink3, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: MONO, marginBottom: 4 },
  switchSection: { borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, overflow: "hidden" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  switchLabel: { color: C.ink2, fontSize: 13, fontWeight: "500" },
  switchSub: { color: C.ink4, fontSize: 11, marginTop: 1 },
  row4: { flexDirection: "row", gap: 6, marginBottom: 6 },
  rowBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 9, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  rowBtnActive: { borderColor: C.amber, backgroundColor: `${C.amber}18` },
  rowBtnTxt: { fontSize: 12, fontWeight: "600", color: C.ink3 },
  note: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    padding: 12, borderRadius: R.md, backgroundColor: `${C.info}0d`,
    borderWidth: 1, borderColor: `${C.info}33`,
  },
  noteText: { color: C.info, fontSize: 12, flex: 1, lineHeight: 17 },
  advancedToggle: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: R.md, borderWidth: 1, borderStyle: "dashed",
    borderColor: C.line, backgroundColor: C.surface,
  },
  advancedToggleTxt: { color: C.ink3, fontSize: 12, fontWeight: "600", flex: 1 },
  advancedToggleSub: { color: C.ink4, fontSize: 11 },
});

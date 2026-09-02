import { Modal, Pressable, ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { R } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeContext";
import { MONO } from "../../theme/mono";
import { KeyboardSheet } from "../../ui/KeyboardSheet";
import { peso } from "../../order/format";
import { sanitizeDecimal } from "../../utils/inputSanitizers";
import type { Ingredient } from "../types";

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly ingredients: readonly Ingredient[];
  readonly ingSearch: string;
  readonly onIngSearchChange: (v: string) => void;
  readonly selIng: Ingredient | null;
  readonly onSelectIng: (i: Ingredient | null) => void;
  readonly ingQty: string;
  readonly onIngQtyChange: (v: string) => void;
  readonly onAdd: () => void;
}

export function IngredientPickerModal({
  visible, onClose, ingredients, ingSearch, onIngSearchChange,
  selIng, onSelectIng, ingQty, onIngQtyChange, onAdd,
}: Props) {
  const { C } = useTheme();
  const s = styles(C);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardSheet style={s.modalBd}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <Pressable style={[s.sheet, { maxHeight: "75%" }]} onPress={() => {}}>
          <Text style={s.sheetTitle}>Pick Ingredient</Text>

          {selIng ? (
            <View style={s.sheetContent}>
              <View style={s.selIngCard}>
                <Text style={s.selIngName}>{selIng.name}</Text>
                <Text style={s.selIngDetail}>{peso(selIng.cost_per_unit)} / {selIng.unit}</Text>
                <Pressable onPress={() => onSelectIng(null)}>
                  <Text style={s.changeLink}>Change</Text>
                </Pressable>
              </View>
              <Text style={s.fieldLabel}>Quantity needed ({selIng.unit} per serving)</Text>
              <TextInput
                style={s.input}
                placeholder={`e.g. 0.5 (${selIng.unit})`}
                placeholderTextColor={C.ink4}
                keyboardType="decimal-pad"
                maxLength={10}
                value={ingQty}
                onChangeText={v => onIngQtyChange(sanitizeDecimal(v, { maxDecimals: 3 }))}
                autoFocus
              />
              {!!ingQty && (
                <Text style={s.costPreview}>
                  Cost: {peso((parseFloat(ingQty) || 0) * selIng.cost_per_unit)}
                </Text>
              )}
              <Pressable style={[s.primaryBtn, !ingQty && { opacity: 0.5 }]} onPress={onAdd} disabled={!ingQty}>
                <Text style={s.primaryBtnTxt}>Add to Recipe</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <TextInput
                style={[s.input, { marginHorizontal: 20 }]}
                placeholder="Search ingredients…"
                placeholderTextColor={C.ink4}
                value={ingSearch}
                onChangeText={onIngSearchChange}
                autoFocus
              />
              <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
                {ingredients.length === 0 && (
                  <Text style={[s.empty, { padding: 20 }]}>
                    Nothing in Inventory yet — add a raw material there first
                  </Text>
                )}
                {ingredients.map(ing => (
                  <Pressable key={ing.id} style={s.pickRow} onPress={() => onSelectIng(ing)}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.pickName}>{ing.name}</Text>
                      <Text style={s.pickDetail}>{ing.category}  ·  {peso(ing.cost_per_unit)}/{ing.unit}</Text>
                    </View>
                    <Feather name="chevron-right" size={14} color={C.ink4} />
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
        </Pressable>
      </KeyboardSheet>
    </Modal>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  modalBd: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 16 },
  sheet: { backgroundColor: C.bg2, borderRadius: R.xl, maxHeight: "92%", overflow: "hidden", width: "100%", maxWidth: 640 },
  sheetTitle: { color: C.ink, fontSize: 17, fontWeight: "700", padding: 20, paddingBottom: 0 },
  sheetContent: { padding: 20, gap: 12, paddingBottom: 40 },
  empty: { color: C.ink4, fontSize: 13, textAlign: "center" },
  fieldLabel: { color: C.ink3, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: MONO, marginBottom: 4 },
  input: { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 10, color: C.ink, fontSize: 14 },
  pickRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  pickName: { color: C.ink, fontSize: 14, fontWeight: "600" },
  pickDetail: { color: C.ink4, fontSize: 11, fontFamily: MONO, marginTop: 2 },
  selIngCard: { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.info, padding: 14, gap: 4 },
  selIngName: { color: C.ink, fontSize: 15, fontWeight: "700" },
  selIngDetail: { color: C.info, fontSize: 12, fontFamily: MONO },
  changeLink: { color: C.ink4, fontSize: 12, marginTop: 4 },
  costPreview: { color: C.amber, fontSize: 13, fontFamily: MONO, textAlign: "center" },
  primaryBtn: { backgroundColor: C.good, borderRadius: R.md, padding: 14, alignItems: "center" },
  primaryBtnTxt: { color: "#000000", fontSize: 15, fontWeight: "700" },
});

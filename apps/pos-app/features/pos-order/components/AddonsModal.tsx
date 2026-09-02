/**
 * AddonsModal — shown when a cashier taps a product that has add-on groups.
 *
 * Groups with max_select === 1 render as radio buttons (single-select).
 * Groups with max_select > 1 render as checkboxes (multi-select).
 * Required groups (is_required) must have at least min_select selections before
 * the Confirm button is enabled.
 */
import {
  Modal, View, Text, Pressable, ScrollView, StyleSheet,
  Platform,
} from "react-native";
import { useState, useEffect, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { R } from "../../theme/tokens";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
const peso = (n: number) => `₱${n.toFixed(2)}`;

export interface AddonGroup {
  id: string;
  name: string;
  is_required: boolean;
  min_select: number;
  max_select: number;
  addons: { id: string; name: string; price: number }[];
}

export interface SelectedAddon {
  addon_id: string;
  group_id: string;
  name: string;
  price: number;
  qty: number;
}

interface AddonsModalProps {
  visible: boolean;
  product: {
    id: string;
    name: string;
    price: number;
    addon_groups: AddonGroup[];
  } | null;
  onConfirm: (selections: SelectedAddon[]) => void;
  onClose: () => void;
}

export function AddonsModal({ visible, product, onConfirm, onClose }: AddonsModalProps) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();

  // Map of addon_id -> qty (0 = not selected)
  const [selections, setSelections] = useState<Record<string, number>>({});

  // Reset selections each time the modal opens with a new product
  useEffect(() => {
    if (visible) setSelections({});
  }, [visible, product?.id]);

  if (!product) return null;

  function toggleAddon(group: AddonGroup, addonId: string) {
    setSelections(prev => {
      const next = { ...prev };
      if (group.max_select === 1) {
        // Radio: deselect all others in group, then select this one
        for (const a of group.addons) {
          next[a.id] = a.id === addonId ? 1 : 0;
        }
      } else {
        // Checkbox: toggle this addon
        const current = next[addonId] ?? 0;
        if (current > 0) {
          next[addonId] = 0;
        } else {
          // Check we haven't hit max_select for the group
          const groupCount = group.addons.reduce((s, a) => s + (next[a.id] ?? 0), 0);
          if (groupCount < group.max_select) {
            next[addonId] = 1;
          }
        }
      }
      return next;
    });
  }

  // Validate required groups
  const validationErrors: string[] = [];
  for (const group of product.addon_groups) {
    if (!group.is_required) continue;
    const count = group.addons.reduce((s, a) => s + (selections[a.id] ?? 0), 0);
    if (count < group.min_select) {
      const minLabel = group.min_select === 1 ? "1 option" : `${group.min_select} options`;
      validationErrors.push(`${group.name}: select at least ${minLabel}`);
    }
  }
  const canConfirm = validationErrors.length === 0;

  // Compute addon total
  const addonTotal = product.addon_groups.flatMap(g => g.addons).reduce((sum, a) => {
    return sum + a.price * (selections[a.id] ?? 0);
  }, 0);
  const grandTotal = product.price + addonTotal;

  function handleConfirm() {
    if (!canConfirm) return;
    const result: SelectedAddon[] = [];
    for (const group of product!.addon_groups) {
      for (const addon of group.addons) {
        const qty = selections[addon.id] ?? 0;
        if (qty > 0) {
          result.push({ addon_id: addon.id, group_id: group.id, name: addon.name, price: addon.price, qty });
        }
      }
    }
    onConfirm(result);
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.backdrop} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.sheet}>
          {/* Header */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{product.name}</Text>
              <Text style={s.subtitle}>Customise your order</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={18} color={C.ink3} />
            </Pressable>
          </View>

          {/* Groups */}
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {product.addon_groups.map(group => {
              const groupCount = group.addons.reduce((s, a) => s + (selections[a.id] ?? 0), 0);
              const atMax = group.max_select > 1 && groupCount >= group.max_select;
              return (
                <View key={group.id} style={s.group}>
                  {/* Group header */}
                  <View style={s.groupHeader}>
                    <Text style={s.groupName}>
                      {group.name}
                      {group.is_required && <Text style={s.required}> *</Text>}
                    </Text>
                    <Text style={s.groupHint}>
                      {group.max_select === 1
                        ? "Choose 1"
                        : group.min_select > 0
                          ? `Choose ${group.min_select}–${group.max_select}`
                          : `Choose up to ${group.max_select}`}
                    </Text>
                  </View>

                  {/* Addon rows */}
                  {group.addons.map(addon => {
                    const qty = selections[addon.id] ?? 0;
                    const selected = qty > 0;
                    const isRadio = group.max_select === 1;
                    const disabled = !selected && atMax;

                    return (
                      <Pressable
                        key={addon.id}
                        style={[s.addonRow, selected && s.addonRowSelected, disabled && s.addonRowDisabled]}
                        onPress={() => !disabled && toggleAddon(group, addon.id)}
                      >
                        {/* Radio or checkbox indicator */}
                        {isRadio ? (
                          <View style={[s.radio, selected && s.radioSelected]}>
                            {selected && <View style={s.radioDot} />}
                          </View>
                        ) : (
                          <View style={[s.checkbox, selected && s.checkboxSelected]}>
                            {selected && <Text style={s.checkmark}>✓</Text>}
                          </View>
                        )}
                        <Text style={[s.addonName, selected && s.addonNameSelected]} numberOfLines={2}>
                          {addon.name}
                        </Text>
                        {addon.price > 0 && (
                          <Text style={[s.addonPrice, selected && s.addonPriceSelected]}>
                            +{peso(addon.price)}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>

          {/* Running total */}
          <View style={s.totalBar}>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalValue}>{peso(grandTotal)}</Text>
          </View>

          {/* Validation hint */}
          {!canConfirm && (
            <View style={s.errorBox}>
              {validationErrors.map((e, i) => (
                <Text key={i} style={s.errorText}>{e}</Text>
              ))}
            </View>
          )}

          {/* Footer */}
          <View style={[s.footer, { paddingBottom: 16 + insets.bottom }]}>
            <Pressable style={s.cancelBtn} onPress={onClose}>
              <Text style={s.cancelBtnTxt}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[s.confirmBtn, !canConfirm && s.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!canConfirm}
            >
              <Text style={s.confirmBtnTxt}>
                Add to Cart · {peso(grandTotal)}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center", alignItems: "center", padding: 24,
  },
  sheet: {
    backgroundColor: C.bg2, borderRadius: R.xl,
    width: "100%", maxWidth: 500, maxHeight: "90%", overflow: "hidden",
  },
  header: {
    flexDirection: "row", alignItems: "flex-start",
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  title:    { color: C.ink, fontSize: 16, fontWeight: "700" },
  subtitle: { color: C.ink4, fontSize: 12, marginTop: 2 },

  body: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, gap: 18 },

  group: { gap: 8 },
  groupHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  groupName: { color: C.ink, fontSize: 13, fontWeight: "700" },
  required:  { color: C.bad },
  groupHint: { color: C.ink4, fontSize: 11, fontFamily: MONO },

  addonRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: R.md,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
  },
  addonRowSelected: {
    backgroundColor: `${C.amber}14`, borderColor: `${C.amber}66`,
  },
  addonRowDisabled: { opacity: 0.6 },

  radio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.line,
    alignItems: "center", justifyContent: "center",
  },
  radioSelected: { borderColor: C.amber },
  radioDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: C.amber },

  checkbox: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: C.line,
    alignItems: "center", justifyContent: "center",
  },
  checkboxSelected: { borderColor: C.amber, backgroundColor: C.amber },
  checkmark:        { color: "#000000", fontSize: 11, fontWeight: "700" },

  addonName:         { flex: 1, color: C.ink, fontSize: 13 },
  addonNameSelected: { color: C.ink, fontWeight: "600" },
  addonPrice:        { color: C.ink3, fontSize: 12, fontFamily: MONO },
  addonPriceSelected:{ color: C.amber, fontWeight: "700" },

  totalBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: C.line,
    backgroundColor: C.surface,
  },
  totalLabel: { color: C.ink3, fontSize: 13, fontWeight: "600" },
  totalValue: { color: C.amber, fontSize: 20, fontWeight: "700", fontFamily: MONO },

  errorBox: {
    paddingHorizontal: 20, paddingBottom: 8, gap: 3,
  },
  errorText: { color: C.bad, fontSize: 11 },

  footer: {
    flexDirection: "row", gap: 10,
    padding: 16, borderTopWidth: 1, borderTopColor: C.line,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: R.lg, alignItems: "center",
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
  },
  cancelBtnTxt:     { color: C.ink3, fontSize: 14, fontWeight: "600" },
  confirmBtn:       { flex: 2, paddingVertical: 13, borderRadius: R.lg, alignItems: "center", backgroundColor: C.amber },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnTxt:    { color: "#000000", fontSize: 15, fontWeight: "700" },
});

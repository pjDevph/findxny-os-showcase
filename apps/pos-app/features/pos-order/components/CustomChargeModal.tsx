/**
 * CustomChargeModal — lets the cashier add a named charge (e.g. corkage, delivery,
 * damage fee) to the current cart before submitting the order.
 *
 * The charge is stored locally in cart.charges[] and posted to orders-add-charge
 * after the order is created in submitOrder().
 */
import {
  Modal, View, Text, TextInput, Pressable, StyleSheet,
  Platform, ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useEffect } from "react";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { R } from "../../theme/tokens";
import { KeyboardSheet } from "../../ui/KeyboardSheet";
import { sanitizeMoney } from "../../utils/inputSanitizers";

export interface CartCharge {
  /** local-only id — just for keying the list */
  tempId:  string;
  name:    string;
  amount:  number;
  taxable: boolean;
}

interface Props {
  readonly visible:  boolean;
  readonly onClose:  () => void;
  readonly onAdd:    (charge: CartCharge) => void;
  /** Current order subtotal — used to compute the "Service Charge" preset's
   *  suggested amount as a percentage rather than a hardcoded peso figure. */
  readonly subtotal: number;
}

interface ChargePreset {
  name: string;
  /** Flat peso amount, used when `pct` is unset. */
  amount: number;
  /** Percentage of the order subtotal — takes precedence over `amount` when set. */
  pct?: number;
  taxable: boolean;
}

const PRESETS: ChargePreset[] = [
  { name: "Corkage Fee",    amount: 200, taxable: false },
  { name: "Delivery Fee",   amount: 100, taxable: false },
  { name: "Damage Fee",     amount: 500, taxable: false },
  // No hardcoded peso figure — this is a % of whatever this order's subtotal
  // actually is, computed fresh each time the modal opens. Purely a manual,
  // explicit one-tap preset; nothing here is ever applied automatically.
  { name: "Service Charge 5%", amount: 0, pct: 0.05, taxable: true },
  { name: "Extra Pax",      amount: 150, taxable: false },
];

const MONO = Platform.select({ ios: "Courier New", android: "monospace", default: "monospace" });
const peso = (n: number) => `₱${n.toFixed(2)}`;

export function CustomChargeModal({ visible, onClose, onAdd, subtotal }: Props) {
  const { C } = useTheme();
  const s = makeStyles(C);
  const insets = useSafeAreaInsets();

  const [name,    setName]    = useState("");
  const [amount,  setAmount]  = useState("");
  const [taxable, setTaxable] = useState(false);

  // Reset form each time it opens
  useEffect(() => {
    if (visible) { setName(""); setAmount(""); setTaxable(false); }
  }, [visible]);

  function presetAmount(p: ChargePreset): number {
    return p.pct != null ? +(subtotal * p.pct).toFixed(2) : p.amount;
  }

  function applyPreset(p: ChargePreset) {
    const amt = presetAmount(p);
    setName(p.name);
    setAmount(amt > 0 ? amt.toFixed(2) : "");
    setTaxable(p.taxable);
  }

  function handleAdd() {
    const amt = parseFloat(amount);
    if (!name.trim() || isNaN(amt) || amt <= 0) return;
    onAdd({
      tempId:  `charge-${Date.now()}`,
      name:    name.trim(),
      amount:  +amt.toFixed(2),
      taxable,
    });
    onClose();
  }

  const canAdd = name.trim().length > 0 && parseFloat(amount) > 0;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardSheet style={s.backdrop} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.sheet}>
          {/* Header */}
          <View style={s.header}>
            <Text style={s.title}>Add Custom Charge</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={18} color={C.ink3} />
            </Pressable>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            {/* Presets */}
            <Text style={s.sectionLabel}>QUICK PRESETS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.presetRow}>
              {PRESETS.map(p => {
                const amt = presetAmount(p);
                return (
                  <Pressable key={p.name} style={s.presetChip} onPress={() => applyPreset(p)}>
                    <Text style={s.presetChipText}>{p.name}</Text>
                    {amt > 0 && (
                      <Text style={s.presetChipAmt}>{peso(amt)}</Text>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Name */}
            <Text style={s.label}>CHARGE NAME <Text style={{ color: C.bad }}>*</Text></Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Corkage Fee, Damage Fee…"
              placeholderTextColor={C.ink4}
              value={name}
              onChangeText={setName}
              maxLength={60}
              autoCapitalize="words"
            />

            {/* Amount */}
            <Text style={s.label}>AMOUNT <Text style={{ color: C.bad }}>*</Text></Text>
            <TextInput
              style={[s.input, s.amountInput]}
              placeholder="0.00"
              placeholderTextColor={C.ink4}
              value={amount}
              onChangeText={v => setAmount(sanitizeMoney(v))}
              keyboardType="decimal-pad"
              maxLength={12}
            />

            {/* Taxable toggle */}
            <Pressable style={s.taxableRow} onPress={() => setTaxable(t => !t)}>
              <View style={[s.checkbox, taxable && { backgroundColor: C.info, borderColor: C.info }]}>
                {taxable && <Text style={s.checkmark}>✓</Text>}
              </View>
              <View>
                <Text style={s.taxableLabel}>Apply to taxable subtotal</Text>
                <Text style={s.taxableHint}>Check if this charge should attract VAT/service fee</Text>
              </View>
            </Pressable>
          </ScrollView>

          {/* Footer */}
          <View style={[s.footer, { paddingBottom: 16 + insets.bottom }]}>
            <Pressable style={s.cancelBtn} onPress={onClose}>
              <Text style={s.cancelBtnTxt}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[s.addBtn, !canAdd && { opacity: 0.6 }]}
              onPress={handleAdd}
              disabled={!canAdd}
            >
              <Text style={s.addBtnTxt}>
                Add Charge{canAdd ? `  ·  ${peso(parseFloat(amount))}` : ""}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardSheet>
    </Modal>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center", alignItems: "center", padding: 24,
  },
  sheet: {
    backgroundColor: C.bg2, borderRadius: R.xl,
    width: "100%", maxWidth: 480, maxHeight: "85%", overflow: "hidden",
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  title: { color: C.ink, fontSize: 16, fontWeight: "700" },
  body:  { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 180, gap: 10 },

  sectionLabel: {
    color: C.ink4, fontSize: 9, fontFamily: MONO,
    letterSpacing: 1, textTransform: "uppercase", marginBottom: 2,
  },
  presetRow: { flexDirection: "row", gap: 8, paddingBottom: 4 },
  presetChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: R.md,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, gap: 2,
  },
  presetChipText: { color: C.ink2, fontSize: 12, fontWeight: "600" },
  presetChipAmt:  { color: C.amber, fontSize: 11, fontFamily: MONO },

  label: {
    color: C.ink4, fontSize: 9, fontFamily: MONO,
    letterSpacing: 1, textTransform: "uppercase",
  },
  input: {
    backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 14, paddingVertical: 12, color: C.ink, fontSize: 14,
  },
  amountInput: {
    fontSize: 24, fontWeight: "700", fontFamily: MONO, textAlign: "right", color: C.amber,
  },

  taxableRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 6 },
  checkbox: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: C.line,
    alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0,
  },
  checkmark: { color: "#fff", fontSize: 11, fontWeight: "700" },
  taxableLabel: { color: C.ink, fontSize: 13, fontWeight: "500" },
  taxableHint:  { color: C.ink4, fontSize: 11, marginTop: 1 },

  footer: {
    flexDirection: "row", gap: 10,
    padding: 16, borderTopWidth: 1, borderTopColor: C.line,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: R.lg, alignItems: "center",
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
  },
  cancelBtnTxt: { color: C.ink3, fontSize: 14, fontWeight: "600" },
  addBtn: {
    flex: 2, paddingVertical: 13, borderRadius: R.lg, alignItems: "center",
    backgroundColor: C.amber,
  },
  addBtnTxt: { color: "#000000", fontSize: 15, fontWeight: "700" },
});

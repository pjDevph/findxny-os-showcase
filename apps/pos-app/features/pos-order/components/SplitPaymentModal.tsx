/**
 * SplitPaymentModal — allows splitting a payment between two methods.
 *
 * Method 2 amount auto-fills as (total - method1Amount).
 * Confirm is only enabled when both amounts > 0 and sum exactly to total.
 */
import {
  Modal, View, Text, TextInput, Pressable, ScrollView, StyleSheet,
  Platform,
} from "react-native";
import { useState, useEffect, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { R } from "../../theme/tokens";
import { KeyboardSheet } from "../../ui/KeyboardSheet";
import { sanitizeMoney } from "../../utils/inputSanitizers";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
const peso = (n: number) => `₱${n.toFixed(2)}`;

type SplitMethodId = "cash" | "gcash" | "maya" | "card" | "qrph" | "bank_transfer";

export interface SplitMethod {
  method: SplitMethodId;
  amount: number;
  reference?: string;
}

interface SplitPaymentModalProps {
  visible: boolean;
  total: number;
  currency?: string;
  onConfirm: (split: { method1: SplitMethod; method2: SplitMethod }) => void;
  onClose: () => void;
}

const METHOD_OPTIONS: { id: SplitMethodId; label: string }[] = [
  { id: "cash",  label: "Cash" },
  { id: "gcash", label: "GCash" },
  { id: "maya",  label: "Maya" },
  { id: "card",  label: "Card" },
  { id: "qrph",  label: "QR PH" },
  { id: "bank_transfer", label: "Bank" },
];

function MethodPicker({
  value,
  exclude,
  onSelect,
  C,
  s,
}: {
  value: SplitMethodId;
  exclude: SplitMethodId;
  onSelect: (m: SplitMethodId) => void;
  C: ReturnType<typeof useTheme>["C"];
  s: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={s.methodRow}>
      {METHOD_OPTIONS.filter(m => m.id !== exclude).map(m => (
        <Pressable
          key={m.id}
          style={[s.methodChip, value === m.id && s.methodChipActive]}
          onPress={() => onSelect(m.id)}
        >
          <Text style={[s.methodChipTxt, value === m.id && s.methodChipTxtActive]}>{m.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function SplitPaymentModal({ visible, total, onConfirm, onClose }: SplitPaymentModalProps) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();

  const [method1, setMethod1]       = useState<SplitMethodId>("cash");
  const [method2, setMethod2]       = useState<SplitMethodId>("gcash");
  const [amount1Input, setAmount1Input] = useState("");
  const [amount2Input, setAmount2Input] = useState("");
  const [ref1, setRef1]             = useState("");
  const [ref2, setRef2]             = useState("");
  const [confirming, setConfirming] = useState(false);

  // Reset form on open
  useEffect(() => {
    if (visible) {
      setMethod1("cash");
      setMethod2("gcash");
      setAmount1Input("");
      setAmount2Input("");
      setRef1("");
      setRef2("");
      setConfirming(false);
    }
  }, [visible]);

  const amount1 = parseFloat(amount1Input) || 0;
  const amount2 = parseFloat(amount2Input) || 0;
  const sum     = +(amount1 + amount2).toFixed(2);
  const diff    = +(total - amount1).toFixed(2);

  // Auto-fill amount2 when amount1 changes
  function handleAmount1Change(v: string) {
    const clean = sanitizeMoney(v);
    setAmount1Input(clean);
    const a1 = parseFloat(clean) || 0;
    const remainder = +(total - a1).toFixed(2);
    if (remainder > 0) {
      setAmount2Input(remainder.toFixed(2));
    } else {
      setAmount2Input("");
    }
  }

  // If method1 would clash with method2 after picker change, swap method2
  function handleMethod1Change(m: SplitMethodId) {
    setMethod1(m);
    if (m === method2) {
      const next = METHOD_OPTIONS.find(o => o.id !== m);
      if (next) setMethod2(next.id);
    }
  }

  function handleMethod2Change(m: SplitMethodId) {
    setMethod2(m);
    if (m === method1) {
      const next = METHOD_OPTIONS.find(o => o.id !== m);
      if (next) setMethod1(next.id);
    }
  }

  const needsRef1 = method1 !== "cash";
  const needsRef2 = method2 !== "cash";
  const isValid   = amount1 > 0 && amount2 > 0 && Math.abs(sum - total) < 0.01
    && (!needsRef1 || ref1.trim().length > 0)
    && (!needsRef2 || ref2.trim().length > 0);
  const sumError  = amount1 > 0 && amount2 > 0 && Math.abs(sum - total) >= 0.01;

  function handleConfirm() {
    if (!isValid) return;
    if (!confirming) { setConfirming(true); return; }
    onConfirm({
      method1: { method: method1, amount: amount1, reference: ref1.trim() || undefined },
      method2: { method: method2, amount: amount2, reference: ref2.trim() || undefined },
    });
  }

  const METHOD_LABEL: Record<SplitMethodId, string> = {
    cash: "Cash", gcash: "GCash", maya: "Maya", card: "Card", qrph: "QR PH", bank_transfer: "Bank",
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardSheet style={s.backdrop} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.sheet}>
          {/* Header */}
          <View style={s.header}>
            <View>
              <Text style={s.title}>{confirming ? "Confirm Payment" : "Split Payment"}</Text>
              <Text style={s.totalLine}>Total: {peso(total)}</Text>
            </View>
            <Pressable onPress={confirming ? () => setConfirming(false) : onClose} hitSlop={8}>
              <Feather name={confirming ? "arrow-left" : "x"} size={18} color={C.ink3} />
            </Pressable>
          </View>

          {confirming ? (
            /* ── Confirmation view ─────────────────────────────── */
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
              <View style={s.confirmBlock}>
                <Text style={s.confirmBlockLabel}>PAYMENT 1</Text>
                <Text style={s.confirmMethod}>{METHOD_LABEL[method1]}</Text>
                <Text style={s.confirmAmount}>{peso(amount1)}</Text>
                {ref1 ? <Text style={s.confirmRef}>Ref: {ref1}</Text> : null}
              </View>
              <View style={s.divider}>
                <View style={s.dividerLine} />
                <Text style={s.dividerTxt}>+</Text>
                <View style={s.dividerLine} />
              </View>
              <View style={s.confirmBlock}>
                <Text style={s.confirmBlockLabel}>PAYMENT 2</Text>
                <Text style={s.confirmMethod}>{METHOD_LABEL[method2]}</Text>
                <Text style={s.confirmAmount}>{peso(amount2)}</Text>
                {ref2 ? <Text style={s.confirmRef}>Ref: {ref2}</Text> : null}
              </View>
              <View style={[s.sumRow, s.sumRowOk]}>
                <Text style={[s.sumText, { color: C.good }]}>
                  Total charged: {peso(sum)}  ✓
                </Text>
              </View>
            </ScrollView>
          ) : (
            /* ── Entry form ────────────────────────────────────── */
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {/* Payment 1 */}
              <View style={s.paymentBlock}>
                <Text style={s.blockLabel}>PAYMENT 1</Text>
                <MethodPicker value={method1} exclude={method2} onSelect={handleMethod1Change} C={C} s={s} />
                <Text style={s.fieldLabel}>AMOUNT</Text>
                <TextInput
                  style={s.amountInput}
                  keyboardType="decimal-pad"
                  maxLength={12}
                  placeholder="0.00"
                  placeholderTextColor={C.ink4}
                  value={amount1Input}
                  onChangeText={handleAmount1Change}
                />
                {amount1 > 0 && diff > 0 && (
                  <Text style={s.remainderHint}>Remaining: {peso(diff)}</Text>
                )}
                {needsRef1 && (
                  <>
                    <Text style={s.fieldLabel}>REFERENCE NO.</Text>
                    <TextInput
                      style={s.refInput}
                      placeholder="e.g. GCash ref #"
                      placeholderTextColor={C.ink4}
                      value={ref1}
                      onChangeText={setRef1}
                      maxLength={40}
                      autoCapitalize="characters"
                    />
                  </>
                )}
              </View>

              {/* Divider */}
              <View style={s.divider}>
                <View style={s.dividerLine} />
                <Text style={s.dividerTxt}>+</Text>
                <View style={s.dividerLine} />
              </View>

              {/* Payment 2 */}
              <View style={s.paymentBlock}>
                <Text style={s.blockLabel}>PAYMENT 2</Text>
                <MethodPicker value={method2} exclude={method1} onSelect={handleMethod2Change} C={C} s={s} />
                <Text style={s.fieldLabel}>AMOUNT</Text>
                <TextInput
                  style={s.amountInput}
                  keyboardType="decimal-pad"
                  maxLength={12}
                  placeholder="0.00"
                  placeholderTextColor={C.ink4}
                  value={amount2Input}
                  onChangeText={v => setAmount2Input(sanitizeMoney(v))}
                />
                {needsRef2 && (
                  <>
                    <Text style={s.fieldLabel}>REFERENCE NO.</Text>
                    <TextInput
                      style={s.refInput}
                      placeholder="e.g. Maya ref #"
                      placeholderTextColor={C.ink4}
                      value={ref2}
                      onChangeText={setRef2}
                      maxLength={40}
                      autoCapitalize="characters"
                    />
                  </>
                )}
              </View>

              {/* Sum summary */}
              {(amount1 > 0 || amount2 > 0) && (() => {
                const rowStyle  = sumError ? s.sumRowError  : isValid ? s.sumRowOk      : s.sumRowNeutral;
                const textColor = sumError ? C.bad          : isValid ? C.good          : C.ink3;
                const suffix    = sumError ? `  ⚠ must equal ${peso(total)}` : isValid ? "  ✓" : "";
                return (
                  <View style={[s.sumRow, rowStyle]}>
                    <Text style={[s.sumText, { color: textColor }]}>
                      {peso(amount1)} + {peso(amount2)} = {peso(sum)}{suffix}
                    </Text>
                  </View>
                );
              })()}
            </ScrollView>
          )}

          {/* Footer */}
          <View style={[s.footer, { paddingBottom: 16 + insets.bottom }]}>
            <Pressable style={s.cancelBtn} onPress={confirming ? () => setConfirming(false) : onClose}>
              <Text style={s.cancelBtnTxt}>{confirming ? "Back" : "Cancel"}</Text>
            </Pressable>
            <Pressable
              style={[s.confirmBtn, !isValid && s.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!isValid}
            >
              <Text style={s.confirmBtnTxt}>
                {confirming ? "Confirm & Checkout" : "Review Payment"}
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
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center", alignItems: "center", padding: 24,
  },
  sheet: {
    backgroundColor: C.bg2, borderRadius: R.xl,
    width: "100%", maxWidth: 480, maxHeight: "90%", overflow: "hidden",
  },
  header: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  title:     { color: C.ink, fontSize: 16, fontWeight: "700" },
  totalLine: { color: C.amber, fontSize: 22, fontWeight: "700", fontFamily: MONO, marginTop: 3 },

  body: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, gap: 14 },

  paymentBlock: { gap: 10 },
  blockLabel: {
    color: C.ink4, fontSize: 9, fontFamily: MONO,
    letterSpacing: 1.2, textTransform: "uppercase",
  },

  methodRow:    { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  methodChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
  },
  methodChipActive:  { backgroundColor: `${C.amber}18`, borderColor: C.amber },
  methodChipTxt:     { color: C.ink3, fontSize: 12, fontWeight: "600" },
  methodChipTxtActive: { color: C.amber, fontWeight: "700" },

  fieldLabel: {
    color: C.ink4, fontSize: 9, fontFamily: MONO,
    letterSpacing: 1, textTransform: "uppercase",
    marginTop: 2,
  },
  amountInput: {
    backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: `${C.amber}60`,
    paddingHorizontal: 14, paddingVertical: 12,
    color: C.amber, fontSize: 28, fontWeight: "700", fontFamily: MONO, textAlign: "right",
  },
  remainderHint: { color: C.ink4, fontSize: 11, fontFamily: MONO, textAlign: "right" },

  divider: { flexDirection: "row", alignItems: "center", gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.line },
  dividerTxt:  { color: C.ink4, fontSize: 16, fontFamily: MONO },

  sumRow: {
    padding: 12, borderRadius: R.md, alignItems: "center",
  },
  sumRowOk:      { backgroundColor: C.goodBg },
  sumRowError:   { backgroundColor: C.badBg },
  sumRowNeutral: { backgroundColor: C.surface },
  sumText:       { fontSize: 13, fontWeight: "700", fontFamily: MONO },

  refInput: {
    backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 14, paddingVertical: 10,
    color: C.ink, fontSize: 14, fontFamily: MONO,
  },

  confirmBlock: { gap: 4, alignItems: "center", paddingVertical: 8 },
  confirmBlockLabel: {
    color: C.ink4, fontSize: 9, fontFamily: MONO, letterSpacing: 1.2, textTransform: "uppercase",
  },
  confirmMethod: { color: C.ink, fontSize: 15, fontWeight: "600" },
  confirmAmount: { color: C.amber, fontSize: 28, fontWeight: "700", fontFamily: MONO },
  confirmRef:    { color: C.ink3, fontSize: 12, fontFamily: MONO },

  footer: {
    flexDirection: "row", gap: 10,
    padding: 16, borderTopWidth: 1, borderTopColor: C.line,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: R.lg, alignItems: "center",
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
  },
  cancelBtnTxt:       { color: C.ink3, fontSize: 14, fontWeight: "600" },
  confirmBtn:         { flex: 2, paddingVertical: 13, borderRadius: R.lg, alignItems: "center", backgroundColor: C.good },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnTxt:      { color: "#000000", fontSize: 15, fontWeight: "700" },
});

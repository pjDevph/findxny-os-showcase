/**
 * Order-confirmed overlay shown after a successful checkout.
 *
 * Extracted from app/pos/order.tsx — self-contained, owns its own styles.
 */
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useMemo } from "react";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
type C = ReturnType<typeof useTheme>["C"];

interface Props {
  readonly orderNo: string;
  readonly onClose: () => void;
  readonly onViewReceipt: () => void;
}

export function SuccessOverlay({ orderNo, onClose, onViewReceipt }: Props) {
  const { C } = useTheme();
  const su = useMemo(() => makeSuccessStyles(C), [C]);
  return (
    <View style={su.overlay}>
      <Text style={su.icon}>✓</Text>
      <Text style={su.orderNo}>#{orderNo}</Text>
      <Text style={su.label}>ORDER CONFIRMED</Text>
      <Pressable style={su.receiptBtn} onPress={onViewReceipt}>
        <Text style={su.receiptBtnText}>View / Print Receipt</Text>
      </Pressable>
      <Pressable style={su.btn} onPress={onClose}>
        <Text style={su.btnText}>New Order</Text>
      </Pressable>
    </View>
  );
}

const makeSuccessStyles = (C: C) => StyleSheet.create({
  overlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(26,21,16,0.95)",
    alignItems: "center", justifyContent: "center", gap: 8, zIndex: 100,
  },
  icon:    { fontSize: 64, color: C.good },
  orderNo: { fontSize: 52, color: C.amber, fontStyle: "italic", fontWeight: "600" },
  label:   { fontSize: 12, color: C.good, letterSpacing: 2, fontFamily: MONO, textTransform: "uppercase" },
  receiptBtn: {
    marginTop: 20, paddingHorizontal: 32, paddingVertical: 14,
    backgroundColor: C.amber, borderRadius: R.lg,
  },
  receiptBtnText: { color: "#000000", fontSize: 15, fontWeight: "700" },
  btn: {
    marginTop: 8, paddingHorizontal: 32, paddingVertical: 14,
    backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line,
  },
  btnText: { color: C.ink, fontSize: 15, fontWeight: "600" },
});

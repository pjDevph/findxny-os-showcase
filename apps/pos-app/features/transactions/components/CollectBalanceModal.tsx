import { View, Text, Pressable, Modal, TextInput, ActivityIndicator, StyleSheet } from "react-native";
import { R } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeContext";
import { MONO } from "../../theme/mono";
import { peso } from "../../order/format";
import type { CollectMethod } from "../types";

const COLLECT_METHODS: { id: CollectMethod; label: string }[] = [
  { id: "cash", label: "Cash" }, { id: "gcash", label: "GCash" }, { id: "maya", label: "Maya" },
  { id: "card", label: "Card" }, { id: "qrph", label: "QR PH" }, { id: "bank_transfer", label: "Bank" },
];

interface Props {
  readonly visible: boolean;
  readonly orderNo: string | undefined;
  readonly balanceDue: number;
  readonly method: CollectMethod;
  readonly onMethodChange: (m: CollectMethod) => void;
  readonly refNumber: string;
  readonly onRefNumberChange: (v: string) => void;
  readonly collecting: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export function CollectBalanceModal({
  visible, orderNo, balanceDue, method, onMethodChange, refNumber, onRefNumberChange, collecting, onClose, onConfirm,
}: Props) {
  const { C } = useTheme();
  const s = styles(C);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.bd} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <Text style={s.title}>Collect Balance</Text>
          <Text style={s.sub}>{orderNo}</Text>
          <Text style={s.amt}>{peso(balanceDue)}</Text>
          <View style={s.methodRow}>
            {COLLECT_METHODS.map(m => (
              <Pressable key={m.id}
                style={[s.methodBtn, method === m.id && s.methodBtnActive]}
                onPress={() => onMethodChange(m.id)}
              >
                <Text style={[s.methodBtnText, method === m.id && s.methodBtnTextActive]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
          {method !== "cash" && (
            <TextInput
              style={s.refInput}
              placeholder="Transaction reference no."
              placeholderTextColor={C.ink4}
              value={refNumber}
              onChangeText={onRefNumberChange}
              maxLength={40}
              autoCapitalize="characters"
            />
          )}
          <View style={s.actions}>
            <Pressable style={s.dismiss} onPress={onClose} disabled={collecting}>
              <Text style={s.dismissText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[s.confirm, collecting && { opacity: 0.5 }]}
              onPress={onConfirm}
              disabled={collecting}
            >
              {collecting
                ? <ActivityIndicator size="small" color="#000000" />
                : <Text style={s.confirmText}>Confirm</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  bd: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 16 },
  sheet: { backgroundColor: C.bg2, borderRadius: 20, padding: 20, gap: 12, width: "100%", maxWidth: 440 },
  title: { color: C.ink, fontSize: 18, fontWeight: "700" },
  sub: { color: C.ink3, fontSize: 13 },
  amt: { color: C.amber, fontSize: 28, fontWeight: "700", fontFamily: MONO },
  methodRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  methodBtn: { paddingHorizontal: 14, paddingVertical: 9, backgroundColor: C.bg, borderRadius: R.md, borderWidth: 1, borderColor: C.line },
  methodBtnActive: { backgroundColor: C.amberBg, borderColor: C.amber },
  methodBtnText: { color: C.ink2, fontSize: 13, fontWeight: "600" },
  methodBtnTextActive: { color: C.amber },
  refInput: { backgroundColor: C.bg, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: C.ink, fontFamily: MONO },
  actions: { flexDirection: "row", gap: 10, marginTop: 6 },
  dismiss: { flex: 1, paddingVertical: 13, borderRadius: R.lg, alignItems: "center", backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  dismissText: { color: C.ink2, fontSize: 14, fontWeight: "600" },
  confirm: { flex: 1, paddingVertical: 13, borderRadius: R.lg, alignItems: "center", backgroundColor: C.good },
  confirmText: { color: "#000000", fontSize: 14, fontWeight: "700" },
});

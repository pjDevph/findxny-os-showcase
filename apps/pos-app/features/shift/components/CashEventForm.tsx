import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { R } from "../../theme/tokens";
import { sanitizeMoney } from "../../utils/inputSanitizers";
import { CashEventRow } from "../CashEventRow";
import type { CashEvent, EventType } from "../types";

const EVENT_TYPE_OPTIONS: { id: EventType; label: string }[] = [
  { id: "in", label: "Cash In" },
  { id: "out", label: "Cash Out" },
  { id: "sale", label: "Sale" },
];

interface Props {
  readonly events: readonly CashEvent[];
  readonly evtType: EventType;
  readonly onEvtTypeChange: (t: EventType) => void;
  readonly evtAmt: string;
  readonly onEvtAmtChange: (v: string) => void;
  readonly evtReason: string;
  readonly onEvtReasonChange: (v: string) => void;
  readonly onAdd: () => void;
}

export function CashEventForm({ events, evtType, onEvtTypeChange, evtAmt, onEvtAmtChange, evtReason, onEvtReasonChange, onAdd }: Props) {
  const { C } = useTheme();
  const s = styles(C);

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Cash Drawer</Text>

      {/* Any staff member running a shift can log a Cash In/Out — it doesn't
          reveal the expected-vs-actual math, only Expected Drawer and
          reconciliation stay manager+. */}
      <View style={s.typeRow}>
        {EVENT_TYPE_OPTIONS.map(opt => (
          <Pressable
            key={opt.id}
            style={[s.typeBtn, evtType === opt.id && s.typeBtnActive]}
            onPress={() => onEvtTypeChange(opt.id)}
          >
            <Text style={[s.typeBtnText, evtType === opt.id && s.typeBtnTextActive]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={s.fieldLabel}>Amount (₱)</Text>
          <TextInput
            style={s.input} placeholder="0.00" placeholderTextColor={C.ink4}
            keyboardType="decimal-pad" maxLength={12} value={evtAmt} onChangeText={(v) => onEvtAmtChange(sanitizeMoney(v))}
          />
        </View>
      </View>

      <Text style={s.fieldLabel}>Reason</Text>
      <View style={s.row}>
        <TextInput
          style={[s.input, { flex: 1 }]}
          placeholder="e.g. Petty cash · Change refund…"
          placeholderTextColor={C.ink4}
          maxLength={200}
          value={evtReason} onChangeText={onEvtReasonChange}
        />
        <Pressable
          style={[s.addBtn, (!evtAmt || !evtReason.trim()) && { opacity: 0.6 }]}
          onPress={onAdd} disabled={!evtAmt || !evtReason.trim()}
        >
          <Text style={s.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {/* Events list — visible to everyone on shift for transparency */}
      {events.length > 0 && (
        <View style={s.evtList}>
          {[...events].reverse().map(evt => <CashEventRow key={evt.id} evt={evt} />)}
        </View>
      )}
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 16, gap: 12 },
  cardTitle: { color: C.ink, fontSize: 16, fontWeight: "600" },
  typeRow: { flexDirection: "row", gap: 8 },
  typeBtn: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  typeBtnActive: { borderColor: C.amber, backgroundColor: C.amberBg },
  typeBtnText: { color: C.ink3, fontSize: 13 },
  typeBtnTextActive: { color: C.amber, fontWeight: "600" },
  row: { flexDirection: "row", gap: 10 },
  fieldLabel: { color: C.ink3, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 },
  input: { backgroundColor: C.bg2, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 14 },
  addBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.rust, alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
  addBtnText: { color: "#000000", fontSize: 13, fontWeight: "700" },
  evtList: { gap: 1, backgroundColor: C.line, borderRadius: R.md, overflow: "hidden" },
});

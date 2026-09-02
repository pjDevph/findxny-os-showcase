import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { R } from "../../theme/tokens";
import { sanitizeMoney } from "../../utils/inputSanitizers";
import { peso } from "../../order/format";
import { ShiftStatusBadge } from "../ShiftStatusBadge";
import { ClockButtonRow } from "../ClockButtonRow";
import type { CurrentStatus, RegisterInfo, Shift } from "../types";

interface Props {
  readonly shift: Shift;
  readonly elapsed: string;
  readonly breakElapsed: string;
  readonly onClockIn: () => void;
  readonly onClockOut: () => void;
  readonly onBreakIn: () => void;
  readonly onBreakOut: () => void;
  readonly actualCashIn: string;
  readonly onActualCashChange: (v: string) => void;
  readonly onCloseShift: () => void;
  readonly closingShift: boolean;
  // Open-form props (only relevant when !shift.open)
  readonly registers: readonly RegisterInfo[];
  readonly registersLoading: boolean;
  readonly selectedRegisterId: string | null;
  readonly onSelectRegister: (id: string) => void;
  readonly cashierIn: string;
  readonly onCashierChange: (v: string) => void;
  readonly floatIn: string;
  readonly onFloatChange: (v: string) => void;
  readonly onOpenShift: () => void;
  readonly openingShift: boolean;
}

export function ShiftStatusCard({
  shift, elapsed, breakElapsed, onClockIn, onClockOut, onBreakIn, onBreakOut,
  actualCashIn, onActualCashChange, onCloseShift, closingShift,
  registers, registersLoading, selectedRegisterId, onSelectRegister,
  cashierIn, onCashierChange, floatIn, onFloatChange, onOpenShift, openingShift,
}: Props) {
  const { C } = useTheme();
  const s = styles(C);

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Shift Status</Text>

      {shift.open ? (
        <>
          <View style={s.statGrid}>
            {[
              { label: "Cashier", value: shift.cashier },
              { label: "Register", value: shift.registerName ?? "—" },
              { label: "Duration", value: elapsed || "0m" },
              { label: "Opening Float", value: peso(shift.openingFloat) },
            ].map(row => (
              <View key={row.label} style={s.statCell}>
                <Text style={s.statLabel}>{row.label}</Text>
                <Text style={s.statValue}>{row.value}</Text>
              </View>
            ))}
          </View>

          <ShiftStatusBadge currentStatus={shift.currentStatus} breakElapsed={breakElapsed} />

          <ClockButtonRow
            currentStatus={shift.currentStatus}
            onClockIn={onClockIn} onClockOut={onClockOut}
            onBreakIn={onBreakIn} onBreakOut={onBreakOut}
          />

          <Text style={s.fieldLabel}>Actual Cash Counted (₱)</Text>
          <TextInput
            style={s.input} placeholder="Count the drawer, then enter the total" placeholderTextColor={C.ink4}
            keyboardType="decimal-pad" maxLength={12} value={actualCashIn} onChangeText={(v) => onActualCashChange(sanitizeMoney(v))}
          />
          <Pressable style={[s.closeBtn, closingShift && { opacity: 0.6 }]} onPress={onCloseShift} disabled={closingShift}>
            {closingShift
              ? <ActivityIndicator size="small" color={C.bad} />
              : <Text style={s.closeBtnText}>Close Shift</Text>
            }
          </Pressable>
        </>
      ) : (
        <View style={s.openForm}>
          <Text style={s.fieldLabel}>Register</Text>
          {registersLoading ? (
            <ActivityIndicator color={C.amber} />
          ) : registers.length === 0 ? (
            <Text style={s.helpNote}>No registers configured for this branch yet. Ask an admin to add one in Settings.</Text>
          ) : (
            <View style={s.registerChipRow}>
              {registers.map((reg) => {
                const occupied = !!reg.openShift;
                const selected = selectedRegisterId === reg.id;
                return (
                  <Pressable
                    key={reg.id}
                    style={[s.registerChip, selected && { borderColor: C.amber, backgroundColor: C.amberBg }, occupied && s.registerChipDisabled]}
                    onPress={() => !occupied && onSelectRegister(reg.id)}
                    disabled={occupied}
                  >
                    <Text style={[s.registerChipTitle, selected && { color: C.amber }]}>{reg.name}</Text>
                    <Text style={s.registerChipSub}>{occupied ? `In use — ${reg.openShift!.cashier_name}` : "Available"}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {selectedRegisterId && (
            <>
              <Text style={s.fieldLabel}>Cashier Name</Text>
              <TextInput
                style={s.input} placeholder="Your name…" placeholderTextColor={C.ink4}
                maxLength={60} value={cashierIn} onChangeText={onCashierChange}
              />
              <Text style={s.fieldLabel}>Opening Float (₱)</Text>
              <TextInput
                style={s.input} placeholder="1000" placeholderTextColor={C.ink4}
                keyboardType="decimal-pad" maxLength={12} value={floatIn} onChangeText={(v) => onFloatChange(sanitizeMoney(v))}
              />
              <Pressable
                style={[s.openBtn, (!cashierIn.trim() || openingShift) && { opacity: 0.5 }]}
                onPress={onOpenShift} disabled={!cashierIn.trim() || openingShift}
              >
                {openingShift
                  ? <ActivityIndicator size="small" color="#000000" />
                  : <Text style={s.openBtnText}>Open Shift</Text>
                }
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 16, gap: 12 },
  cardTitle: { color: C.ink, fontSize: 16, fontWeight: "600" },
  helpNote: { color: C.ink4, fontSize: 12, lineHeight: 17 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 1, backgroundColor: C.line, borderRadius: R.md, overflow: "hidden" },
  statCell: { backgroundColor: C.bg2, padding: 12, width: "50%" },
  statLabel: { color: C.ink3, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 3 },
  statValue: { color: C.ink2, fontSize: 14, fontWeight: "600" },
  openForm: { gap: 10 },
  registerChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  registerChip: { minWidth: 120, paddingVertical: 10, paddingHorizontal: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg2 },
  registerChipDisabled: { opacity: 0.45 },
  registerChipTitle: { color: C.ink, fontSize: 13, fontWeight: "700" },
  registerChipSub: { color: C.ink4, fontSize: 11, marginTop: 2 },
  fieldLabel: { color: C.ink3, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 },
  input: { backgroundColor: C.bg2, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 14 },
  openBtn: { padding: 14, borderRadius: R.md, alignItems: "center", backgroundColor: C.amber },
  openBtnText: { color: "#000000", fontSize: 15, fontWeight: "700" },
  closeBtn: { padding: 12, borderRadius: R.md, alignItems: "center", borderWidth: 1, borderColor: "rgba(192,56,56,0.4)", backgroundColor: C.badBg },
  closeBtnText: { color: C.bad, fontSize: 14, fontWeight: "600" },
});

import React, { useState, useEffect, useMemo } from "react";
import {
  View, Text, Pressable, Modal, ScrollView,
  StyleSheet, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

// All hours in 24h format
const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

export interface AmenityTimePickerAmenity {
  name: string;
  hourly_rate: number;
  capacity?: number | null;
}

interface Props {
  visible:   boolean;
  amenity:   AmenityTimePickerAmenity | null;
  date:      string; // YYYY-MM-DD
  onConfirm: (startTime: string, endTime: string) => void;
  onClose:   () => void;
}

type Slot = "start" | "end" | "range" | "normal";

function slotState(h: string, start: string | null, end: string | null): Slot {
  if (start && h === start) return "start";
  if (end   && h === end)   return "end";
  if (start && end && h > start && h < end) return "range";
  return "normal";
}

function tapHour(
  h: string,
  selStart: string | null,
  selEnd: string | null,
  setSelStart: (v: string | null) => void,
  setSelEnd: (v: string | null) => void,
) {
  if (!selStart || selEnd) { setSelStart(h); setSelEnd(null); return; }
  if (h <= selStart)       { setSelStart(h); setSelEnd(null); return; }
  setSelEnd(h);
}

function calcHintStep(selStart: string | null, selEnd: string | null): string {
  if (!selStart) return "Select start";
  if (!selEnd)   return "Select end";
  return "Range selected";
}

function calcHintTxt(
  selStart: string | null,
  selEnd: string | null,
  hours: number,
): string {
  if (!selStart) return "Tap a time to set start";
  if (!selEnd)   return "Tap a later time to set end";
  return `${selStart}  →  ${selEnd}  ·  ${hours.toFixed(1)} hr${hours !== 1 ? "s" : ""}`;
}

export function AmenityTimePicker({ visible, amenity, date, onConfirm, onClose }: Props) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();

  const [selStart, setSelStart] = useState<string | null>(null);
  const [selEnd,   setSelEnd]   = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setSelStart(null); setSelEnd(null); }
  }, [visible, amenity?.name, date]);

  const hours = selStart && selEnd
    ? (new Date(`${date}T${selEnd}`).getTime() - new Date(`${date}T${selStart}`).getTime()) / 3_600_000
    : 0;
  const total = amenity ? +(hours * amenity.hourly_rate).toFixed(2) : 0;
  const canConfirm = !!(selStart && selEnd);

  const hintStep = calcHintStep(selStart, selEnd);
  const hintTxt  = calcHintTxt(selStart, selEnd, hours);

  if (!amenity) return null;

  function renderChip(h: string) {
    const st       = slotState(h, selStart, selEnd);
    const isStart  = st === "start";
    const isEnd    = st === "end";
    const isRange  = st === "range";
    const isActive = isStart || isEnd;

    return (
      <Pressable
        key={h}
        style={[s.chip, isRange && s.chipRange, isActive && s.chipActive]}
        onPress={() => tapHour(h, selStart, selEnd, setSelStart, setSelEnd)}
      >
        <Text style={[s.chipTxt, isRange && s.chipTxtRange, isActive && s.chipTxtActive]}>
          {h}
        </Text>
      </Pressable>
    );
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>

          {/* Header */}
          <View style={s.hdr}>
            <View style={s.badge}>
              <Text style={s.badgeTxt}>AMENITY</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{amenity.name}</Text>
              <Text style={s.meta}>
                {amenity.capacity ? `${amenity.capacity} guests  ·  ` : ""}
                {peso(amenity.hourly_rate)}/hr
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={16} style={s.closeBtn}>
              <Text style={s.closeX}>✕</Text>
            </Pressable>
          </View>

          {/* Date + step hint */}
          <View style={s.hintBox}>
            <View style={s.datePill}>
              <Text style={s.datePillTxt}>{date}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.hintStep}>{hintStep}</Text>
              <Text style={s.hintTxt}>{hintTxt}</Text>
            </View>
          </View>

          {/* Time grid */}
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={s.grid}>
            {/* Group by 6 per row */}
            {Array.from({ length: Math.ceil(HOURS.length / 6) }, (_, ri) => (
              <View key={ri} style={s.row}>
                {HOURS.slice(ri * 6, ri * 6 + 6).map(renderChip)}
              </View>
            ))}
          </ScrollView>

          {/* Legend */}
          <View style={s.legend}>
            <View style={s.lgItem}><View style={[s.lgDot, { backgroundColor: C.ink3 }]} /><Text style={s.lgTxt}>Available</Text></View>
            <View style={s.lgItem}><View style={[s.lgDot, { backgroundColor: C.amber }]} /><Text style={s.lgTxt}>Selected</Text></View>
          </View>

          {/* Footer */}
          <View style={[s.footer, { paddingBottom: 28 + insets.bottom }]}>
            {canConfirm && (
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>{hours.toFixed(1)} hr × {peso(amenity.hourly_rate)}/hr</Text>
                <Text style={s.totalAmt}>{peso(total)}</Text>
              </View>
            )}
            <Pressable
              style={[s.confirmBtn, !canConfirm && s.confirmDim]}
              disabled={!canConfirm}
              onPress={() => onConfirm(selStart!, selEnd!)}
            >
              <Text style={s.confirmTxt}>
                {canConfirm ? `Confirm  ${selStart}  →  ${selEnd}` : "Select start and end time"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.70)", justifyContent: "center", alignItems: "center", padding: 16 },
  sheet: {
    backgroundColor: C.bg2,
    borderRadius: R.xl,
    maxHeight: "85%",
    width: "100%",
    maxWidth: 640,
  },

  hdr: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  badge: {
    backgroundColor: `${C.amber}22`, borderRadius: R.sm,
    borderWidth: 1, borderColor: `${C.amber}44`,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  badgeTxt: { color: C.amber, fontSize: 9, fontWeight: "700", fontFamily: MONO, letterSpacing: 1 },
  name:     { color: C.ink, fontSize: 18, fontWeight: "700" },
  meta:     { color: C.ink3, fontSize: 12, fontFamily: MONO, marginTop: 2 },
  closeBtn: { padding: 4 },
  closeX:   { color: C.ink3, fontSize: 20, fontWeight: "600" },

  hintBox: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: `${C.amber}0D`,
    borderBottomWidth: 1, borderBottomColor: `${C.amber}22`,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  datePill: {
    backgroundColor: C.surface, borderRadius: R.md,
    borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  datePillTxt: { color: C.amber, fontSize: 12, fontWeight: "700", fontFamily: MONO },
  hintStep:    { color: C.amber, fontSize: 9, fontWeight: "700", fontFamily: MONO, letterSpacing: 0.8, textTransform: "uppercase" },
  hintTxt:     { color: C.ink2, fontSize: 12, fontFamily: MONO, marginTop: 2 },

  grid: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  row:  { flexDirection: "row", gap: 8 },

  chip: {
    flex: 1, paddingVertical: 12, alignItems: "center", justifyContent: "center",
    borderRadius: R.md, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.surface,
  },
  chipRange:  { backgroundColor: `${C.amber}22`, borderColor: `${C.amber}44` },
  chipActive: { backgroundColor: C.amber, borderColor: C.amber },
  chipTxt:         { color: C.ink3, fontSize: 13, fontWeight: "600", fontFamily: MONO },
  chipTxtRange:    { color: C.amber },
  chipTxtActive:   { color: C.bg, fontWeight: "700" },

  legend: {
    flexDirection: "row", justifyContent: "center", gap: 20,
    paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: C.line,
  },
  lgItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  lgDot:  { width: 8, height: 8, borderRadius: 4 },
  lgTxt:  { color: C.ink4, fontSize: 11, fontFamily: MONO },

  footer: {
    padding: 16, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: C.line, gap: 10,
  },
  totalRow:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { color: C.ink3, fontSize: 13, fontFamily: MONO },
  totalAmt:   { color: C.amber, fontSize: 18, fontWeight: "700", fontFamily: MONO },
  confirmBtn: {
    backgroundColor: C.amber, borderRadius: R.md,
    padding: 15, alignItems: "center",
  },
  confirmDim: { backgroundColor: C.surface2, opacity: 0.4 },
  confirmTxt: { color: C.bg, fontSize: 14, fontWeight: "700", fontFamily: MONO },
});

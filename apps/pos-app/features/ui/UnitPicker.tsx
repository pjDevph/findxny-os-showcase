/**
 * Curated unit chip-picker + "Custom…" free-text fallback — mirrors
 * apps/web's UnitPicker (features/admin/products/UnitPicker.tsx) so the same
 * unit vocabulary is used whether staff add stock from the tablet or the
 * browser, instead of a free-text field where "kg"/"Kg"/"kilo" all end up as
 * different values on the same ingredient.
 */
import { View, Text, Pressable, TextInput, StyleSheet, Platform } from "react-native";
import { useState } from "react";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
const CUSTOM = "__custom__";

export type UnitOption = { value: string; label: string };
export type UnitGroup = { label: string; options: UnitOption[] };

export const PURCHASE_UNIT_GROUPS: UnitGroup[] = [
  { label: "Common", options: [
    { value: "pcs",    label: "Piece" },
    { value: "dozen",  label: "Dozen" },
    { value: "bottle", label: "Bottle" },
    { value: "pack",   label: "Pack" },
  ] },
  { label: "Bulk container", options: [
    { value: "sack", label: "Sack" },
    { value: "box",  label: "Box" },
    { value: "case", label: "Case" },
    { value: "tray", label: "Tray" },
  ] },
  { label: "Weight", options: [
    { value: "kg", label: "Kilo" },
    { value: "g",  label: "Gram" },
  ] },
  { label: "Volume", options: [
    { value: "l",  label: "Liter" },
    { value: "ml", label: "Milliliter" },
  ] },
];

export function UnitPicker({
  value,
  onChange,
  groups = PURCHASE_UNIT_GROUPS,
}: {
  value: string;
  onChange: (v: string) => void;
  groups?: UnitGroup[];
}) {
  const { C } = useTheme();
  const s = makeStyles(C);
  const allValues = groups.flatMap(g => g.options.map(o => o.value));
  const isKnown = allValues.includes(value);
  const [customMode, setCustomMode] = useState(!isKnown && !!value);

  return (
    <View style={{ gap: 10 }}>
      {groups.map(g => (
        <View key={g.label} style={{ gap: 6 }}>
          <Text style={s.groupLabel}>{g.label}</Text>
          <View style={s.chipRow}>
            {g.options.map(o => {
              const active = !customMode && value === o.value;
              return (
                <Pressable key={o.value}
                  style={[s.chip, active && s.chipActive]}
                  onPress={() => { setCustomMode(false); onChange(o.value); }}>
                  <Text style={[s.chipTxt, active && s.chipTxtActive]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <View style={s.chipRow}>
        <Pressable
          style={[s.chip, customMode && s.chipActive]}
          onPress={() => { setCustomMode(true); onChange(isKnown ? "" : value); }}>
          <Text style={[s.chipTxt, customMode && s.chipTxtActive]}>Custom…</Text>
        </Pressable>
      </View>
      {customMode && (
        <TextInput
          style={s.customInput}
          value={value}
          onChangeText={onChange}
          maxLength={24}
          placeholder="Enter custom unit (e.g. Container)"
          placeholderTextColor={C.ink4}
          autoCapitalize="none"
        />
      )}
    </View>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  groupLabel: { color: C.ink4, fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: MONO },
  chipRow:    { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.full, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  chipActive: { borderColor: C.amber, backgroundColor: `${C.amber}18` },
  chipTxt:      { color: C.ink3, fontSize: 12, fontWeight: "500" },
  chipTxtActive: { color: C.amber },
  customInput: { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 10, color: C.ink, fontSize: 14 },
});

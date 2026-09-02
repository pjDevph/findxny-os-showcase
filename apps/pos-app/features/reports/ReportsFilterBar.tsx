import { View, Text, Pressable, ScrollView, TextInput, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";
import { MONO } from "../theme/mono";
import { sanitizeDateStr } from "../utils/inputSanitizers";
import { FilterDropdown } from "./FilterDropdown";
import { isoDate } from "./reportsHelpers";
import { PERIODS, type Period } from "./types";

interface Props {
  readonly period: Period;
  readonly onPeriodChange: (p: Period) => void;
  readonly customFrom: string;
  readonly onCustomFromChange: (v: string) => void;
  readonly customTo: string;
  readonly onCustomToChange: (v: string) => void;
  readonly useCustom: boolean;
  readonly chFilters: string[];
  readonly onChToggle: (v: string) => void;
  readonly payFilters: string[];
  readonly onPayToggle: (v: string) => void;
  readonly catFilters: string[];
  readonly onCatToggle: (v: string) => void;
  readonly onReset: () => void;
}

export function ReportsFilterBar({
  period, onPeriodChange, customFrom, onCustomFromChange, customTo, onCustomToChange, useCustom,
  chFilters, onChToggle, payFilters, onPayToggle, catFilters, onCatToggle, onReset,
}: Props) {
  const { C } = useTheme();
  const s = styles(C);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.fBar} contentContainerStyle={s.fBarContent}>
      {PERIODS.map(p => (
        <Pressable
          key={p.days}
          style={[s.periodChip, period === p.days && !useCustom && s.periodChipOn]}
          onPress={() => { onPeriodChange(p.days); onCustomFromChange(""); onCustomToChange(""); }}
        >
          <Text style={[s.periodChipTxt, period === p.days && !useCustom && s.periodChipTxtOn]}>{p.label}</Text>
        </Pressable>
      ))}
      <Pressable
        style={[s.periodChip, useCustom && s.periodChipOn]}
        onPress={() => {
          if (!useCustom) { onCustomFromChange(isoDate(-6)); onCustomToChange(isoDate(0)); }
          else { onCustomFromChange(""); onCustomToChange(""); }
        }}
      >
        <Feather name="calendar" size={11} color={useCustom ? C.amber : C.ink3} />
        <Text style={[s.periodChipTxt, useCustom && s.periodChipTxtOn]}>Custom</Text>
      </Pressable>
      {useCustom && (
        <>
          <View style={s.customDateWrap}>
            <Feather name="calendar" size={11} color={C.ink4} />
            <TextInput
              style={s.customDateInput}
              value={customFrom}
              onChangeText={(v) => onCustomFromChange(sanitizeDateStr(v))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={C.ink4}
              maxLength={10}
            />
          </View>
          <Text style={{ color: C.ink4, fontSize: 11 }}>→</Text>
          <View style={s.customDateWrap}>
            <Feather name="calendar" size={11} color={C.ink4} />
            <TextInput
              style={s.customDateInput}
              value={customTo}
              onChangeText={(v) => onCustomToChange(sanitizeDateStr(v))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={C.ink4}
              maxLength={10}
            />
          </View>
        </>
      )}
      <View style={s.fSep} />
      <FilterDropdown type="ch" selected={chFilters} onToggle={onChToggle} />
      <FilterDropdown type="pay" selected={payFilters} onToggle={onPayToggle} />
      <FilterDropdown type="cat" selected={catFilters} onToggle={onCatToggle} />
      <Pressable style={s.resetBtn} onPress={onReset}>
        <Feather name="x" size={12} color={C.ink3} />
        <Text style={s.resetBtnTxt}>Reset</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  fBar: { flexGrow: 0, flexShrink: 0, backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.line },
  fBarContent: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  fSep: { width: 1, height: 20, backgroundColor: C.line, marginHorizontal: 2 },
  periodChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.full,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, minHeight: 38,
    alignItems: "center", justifyContent: "center",
  },
  periodChipOn: { backgroundColor: `${C.amber}18`, borderColor: C.amber },
  periodChipTxt: { color: C.ink3, fontSize: 13, fontWeight: "600" },
  periodChipTxtOn: { color: C.amber },
  resetBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.md,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, minHeight: 38,
  },
  resetBtnTxt: { color: C.ink3, fontSize: 13, fontWeight: "600" },
  customDateWrap: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: C.surface, borderRadius: R.md,
    borderWidth: 1, borderColor: C.amber, minHeight: 38,
  },
  customDateInput: { color: C.ink, fontSize: 12, fontFamily: MONO, minWidth: 86 },
});

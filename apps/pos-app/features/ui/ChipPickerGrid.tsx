/**
 * ChipPickerGrid — wrap-row of selectable chips, optionally with a colored dot.
 *
 * Replaces staff.tsx's RolePickerGrid (copy-pasted verbatim between its
 * role-change and add-staff modals) and products.tsx's category-chip grid —
 * both were the same "grid of chips, one selected" markup with a different
 * data source.
 */
import { View, Text, Pressable, StyleSheet } from "react-native";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

export interface ChipOption {
  readonly key: string;
  readonly label: string;
  /** Optional colored dot next to the label (e.g. a role or category color). */
  readonly dotColor?: string;
  /** Optional small trailing tag (e.g. "current"). */
  readonly badge?: string;
}

interface Props {
  readonly options: readonly ChipOption[];
  readonly selectedKey: string | null;
  readonly onSelect: (key: string) => void;
}

export function ChipPickerGrid({ options, selectedKey, onSelect }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  return (
    <View style={s.grid}>
      {options.map((opt) => {
        const selected = opt.key === selectedKey;
        return (
          <Pressable key={opt.key} style={[s.chip, selected && s.chipSel]} onPress={() => onSelect(opt.key)}>
            {!!opt.dotColor && <View style={[s.dot, { backgroundColor: opt.dotColor }]} />}
            <Text style={[s.label, selected && s.labelSel]} numberOfLines={1}>{opt.label}</Text>
            {!!opt.badge && <Text style={s.badge}>{opt.badge}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: R.full, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  chipSel: { borderColor: C.amber, backgroundColor: C.amberBg },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: C.ink2, fontSize: 12.5, fontWeight: "600" },
  labelSel: { color: C.amber },
  badge: { color: C.ink4, fontSize: 10, fontFamily: "monospace" },
});

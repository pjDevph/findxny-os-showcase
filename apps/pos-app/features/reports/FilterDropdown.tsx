import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";
import { useAnchoredDropdown } from "../ui/useAnchoredDropdown";
import { AnchoredDropdown } from "../ui/AnchoredDropdown";
import { DD_LABELS, DD_OPTIONS, DD_OPTION_LABELS, type DDType } from "./types";

interface Props {
  readonly type: DDType;
  readonly selected: readonly string[];
  readonly onToggle: (v: string) => void;
}

/** One of the Channel/Payment/Category filter dropdowns in the reports filter
 *  bar — measure-and-position multi-select menu anchored to its own button. */
export function FilterDropdown({ type, selected, onToggle }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  const dd = useAnchoredDropdown();
  const label = selected.length === 0 ? `${DD_LABELS[type]} ▾` : `${DD_LABELS[type]} (${selected.length}) ▾`;

  return (
    <>
      <Pressable ref={dd.anchorRef} style={[s.ddBtn, selected.length > 0 && s.ddBtnOn]} onPress={dd.open}>
        <Text style={[s.ddBtnTxt, selected.length > 0 && s.ddBtnTxtOn]}>{label}</Text>
      </Pressable>
      <AnchoredDropdown visible={dd.visible} position={dd.position} onClose={dd.close}>
        {DD_OPTIONS[type].map(opt => {
          const active = selected.includes(opt);
          return (
            <Pressable key={opt} style={s.ddItem} onPress={() => onToggle(opt)}>
              <View style={[s.ddCheck, active && { backgroundColor: C.amber, borderColor: C.amber }]}>
                {active && <Feather name="check" size={10} color={C.bg} />}
              </View>
              <Text style={{ color: C.ink, fontSize: 14, flex: 1 }}>{DD_OPTION_LABELS[opt] ?? opt}</Text>
            </Pressable>
          );
        })}
      </AnchoredDropdown>
    </>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  ddBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.md,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, minHeight: 38,
    alignItems: "center", justifyContent: "center",
  },
  ddBtnOn: { backgroundColor: `${C.amber}18`, borderColor: C.amber },
  ddBtnTxt: { color: C.ink3, fontSize: 13, fontWeight: "600" },
  ddBtnTxtOn: { color: C.amber },
  ddItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.lineSoft,
  },
  ddCheck: {
    width: 20, height: 20, borderRadius: 4,
    borderWidth: 2, borderColor: C.line,
    alignItems: "center", justifyContent: "center",
  },
});

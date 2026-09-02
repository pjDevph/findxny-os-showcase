import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { useScrollOverflowHint } from "../ui/useScrollOverflowHint";
import type { StatusFilter } from "./types";

interface Tab { id: StatusFilter; label: string; count: number; warn: boolean }

interface Props {
  readonly statusFilter: StatusFilter;
  readonly onSelect: (id: StatusFilter) => void;
  readonly tabs: readonly Tab[];
}

export function StatusTabsRow({ statusFilter, onSelect, tabs }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  const hint = useScrollOverflowHint(24, "horizontal");

  return (
    <View style={s.wrap}>
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false} style={s.bar} contentContainerStyle={s.content}
        onLayout={hint.onLayout} onContentSizeChange={hint.onContentSizeChange} onScroll={hint.onScroll}
        scrollEventThrottle={32}
      >
        {tabs.map(tab => (
          <Pressable key={tab.id}
            style={[s.tab, statusFilter === tab.id && s.tabActive, tab.warn && statusFilter !== tab.id && s.tabWarn]}
            onPress={() => onSelect(tab.id)}>
            <Text style={[s.tabTxt, statusFilter === tab.id && s.tabTxtActive, tab.warn && statusFilter !== tab.id && s.tabTxtWarn]}>
              {tab.label}
            </Text>
            <View style={[s.count, statusFilter === tab.id && s.countActive, tab.warn && statusFilter !== tab.id && s.countWarn]}>
              <Text style={[s.countTxt, statusFilter === tab.id && s.countTxtActive, tab.warn && statusFilter !== tab.id && s.countTxtWarn]}>
                {tab.count}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      {/* A permanently-reserved slot, not an overlay — see CategoryFilterRow's
          identical fix: an absolutely-positioned hint floats on top of
          whatever tab is at the edge at ANY scroll position (including the
          untouched initial position), not just past the true end of content. */}
      <View style={s.hintSlot} pointerEvents="none">
        {hint.showHint && <View style={s.hintPill}><Feather name="chevrons-right" size={13} color={C.ink3} /></View>}
      </View>
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center" },
  bar: { flex: 1, flexShrink: 1, backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  content: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  hintSlot: { width: 28, alignItems: "center", justifyContent: "center", backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  hintPill: {
    backgroundColor: C.surface, borderRadius: R.full, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 4, paddingVertical: 3,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 2,
  },
  tab: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.full,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
  },
  tabActive: { backgroundColor: `${C.amber}18`, borderColor: `${C.amber}77` },
  tabWarn: { borderColor: `${C.warn}66` },
  tabTxt: { color: C.ink2, fontSize: 13, fontWeight: "600" },
  tabTxtActive: { color: C.amber, fontWeight: "700" },
  tabTxtWarn: { color: C.warn, fontWeight: "700" },
  count: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: R.full, backgroundColor: `${C.ink4}33` },
  countActive: { backgroundColor: `${C.amber}33` },
  countWarn: { backgroundColor: `${C.warn}22` },
  countTxt: { color: C.ink3, fontSize: 11, fontWeight: "700" },
  countTxtActive: { color: C.amber },
  countTxtWarn: { color: C.warn },
});

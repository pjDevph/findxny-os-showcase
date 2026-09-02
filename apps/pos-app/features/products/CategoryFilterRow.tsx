import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { useScrollOverflowHint } from "../ui/useScrollOverflowHint";
import type { Category } from "./types";

interface Props {
  readonly categories: readonly Category[];
  readonly categoryFilter: string;
  readonly onSelect: (id: string) => void;
  readonly totalCount: number;
  readonly categoryCount: (id: string) => number;
}

export function CategoryFilterRow({ categories, categoryFilter, onSelect, totalCount, categoryCount }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  const hint = useScrollOverflowHint(24, "horizontal");

  if (categories.length === 0) return null;

  return (
    <View style={s.wrap}>
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false} style={s.scroll} contentContainerStyle={s.row}
        onLayout={hint.onLayout} onContentSizeChange={hint.onContentSizeChange} onScroll={hint.onScroll}
        scrollEventThrottle={32}
      >
        <Pressable style={[s.chip, categoryFilter === "all" && s.chipActive]} onPress={() => onSelect("all")}>
          <Text style={[s.chipTxt, categoryFilter === "all" && s.chipTxtActive]}>All categories · {totalCount}</Text>
        </Pressable>
        {categories.map(c => (
          <Pressable key={c.id} style={[s.chip, categoryFilter === c.id && s.chipActive]} onPress={() => onSelect(c.id)}>
            <Text style={[s.chipTxt, categoryFilter === c.id && s.chipTxtActive]}>{c.name} · {categoryCount(c.id)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {/* A permanently-reserved slot, not an overlay — an absolutely-positioned
          hint floats on top of whatever chip is at the edge at ANY scroll
          position (including the untouched initial position), not just past
          the true end of content. Keeping this slot's width constant whether
          or not the pill is showing also avoids the chip row jumping width
          every time showHint flips. */}
      <View style={s.hintSlot} pointerEvents="none">
        {hint.showHint && <View style={s.hintPill}><Feather name="chevrons-right" size={13} color={C.ink3} /></View>}
      </View>
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center" },
  scroll: { flex: 1, flexShrink: 1, backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  row: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: "row" },
  hintSlot: { width: 28, alignItems: "center", justifyContent: "center", backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  hintPill: {
    backgroundColor: C.surface, borderRadius: R.full, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 4, paddingVertical: 3,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 2,
  },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.full, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  chipActive: { backgroundColor: `${C.amber}18`, borderColor: `${C.amber}77` },
  chipTxt: { color: C.ink3, fontSize: 12, fontWeight: "600" },
  chipTxtActive: { color: C.amber, fontWeight: "700" },
});

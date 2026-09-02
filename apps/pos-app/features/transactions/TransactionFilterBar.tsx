import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { SearchInput } from "../ui/SearchInput";
import { sourceColor } from "./transactionsHelpers";
import { PAYMENT_FILTERS, type DateFilter, type PaymentFilter, type SourceFilter, type StatusFilter } from "./types";

interface Props {
  readonly search: string;
  readonly onSearchChange: (v: string) => void;
  readonly dateFilter: DateFilter;
  readonly onDateFilterChange: (v: DateFilter) => void;
  readonly statusFilter: StatusFilter;
  readonly onStatusFilterChange: (v: StatusFilter) => void;
  readonly sourceFilter: SourceFilter;
  readonly onSourceFilterChange: (v: SourceFilter) => void;
  readonly paymentFilter: PaymentFilter;
  readonly onPaymentFilterChange: (v: PaymentFilter) => void;
}

export function TransactionFilterBar({
  search, onSearchChange, dateFilter, onDateFilterChange, statusFilter, onStatusFilterChange,
  sourceFilter, onSourceFilterChange, paymentFilter, onPaymentFilterChange,
}: Props) {
  const { C } = useTheme();
  const s = styles(C);

  return (
    <View style={s.wrap}>
      <View style={s.searchRow}>
        <SearchInput value={search} onChangeText={onSearchChange} placeholder="Search order #, customer, amount…" />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        <Text style={s.chipGroup}>Period</Text>
        {(["today", "week", "month", "all"] as DateFilter[]).map(f => (
          <Pressable key={f} style={[s.chip, dateFilter === f && s.chipOn]} onPress={() => onDateFilterChange(f)}>
            <Text style={[s.chipTxt, dateFilter === f && s.chipTxtOn]}>
              {f === "today" ? "Today" : f === "week" ? "Week" : f === "month" ? "Month" : "All"}
            </Text>
          </Pressable>
        ))}
        <View style={s.chipSep} />
        <Text style={s.chipGroup}>Status</Text>
        {(["all", "pending", "completed", "cancelled"] as StatusFilter[]).map(f => (
          <Pressable key={f} style={[s.chip, statusFilter === f && s.chipOn]} onPress={() => onStatusFilterChange(f)}>
            <Text style={[s.chipTxt, statusFilter === f && s.chipTxtOn]}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
        <View style={s.chipSep} />
        <Text style={s.chipGroup}>Source</Text>
        {(["all", "pos", "web", "kiosk"] as SourceFilter[]).map(f => (
          <Pressable key={`s-${f}`}
            style={[s.chip, sourceFilter === f && s.chipOn,
            f !== "all" && sourceFilter !== f && { borderColor: `${sourceColor(f)}40` }]}
            onPress={() => onSourceFilterChange(f)}
          >
            <Text style={[s.chipTxt, sourceFilter === f && s.chipTxtOn,
            f !== "all" && sourceFilter !== f && { color: sourceColor(f) }]}>
              {f === "all" ? "All" : f.toUpperCase()}
            </Text>
          </Pressable>
        ))}
        <View style={s.chipSep} />
        <Text style={s.chipGroup}>Payment</Text>
        {PAYMENT_FILTERS.map(f => (
          <Pressable key={`p-${f.id}`} style={[s.chip, paymentFilter === f.id && s.chipOn]} onPress={() => onPaymentFilterChange(f.id)}>
            <Text style={[s.chipTxt, paymentFilter === f.id && s.chipTxtOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  wrap: { backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.line },
  searchRow: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  chipRow: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, gap: 5, alignItems: "center" },
  chipGroup: { color: C.ink4, fontSize: 9, fontFamily: "monospace", letterSpacing: 0.5, marginRight: 2, textTransform: "uppercase" },
  chipSep: { width: 1, height: 16, backgroundColor: C.line, marginHorizontal: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.full, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  chipOn: { borderColor: C.amber, backgroundColor: C.amberBg },
  chipTxt: { color: C.ink3, fontSize: 11, fontWeight: "500" },
  chipTxtOn: { color: C.amber, fontWeight: "700" },
});

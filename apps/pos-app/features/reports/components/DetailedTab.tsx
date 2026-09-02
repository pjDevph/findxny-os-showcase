import { View, Text, Pressable, ScrollView, TextInput } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { MONO } from "../../theme/mono";
import { TblHdr } from "../TblHdr";
import { fmtTime, peso, shortNo } from "../reportsHelpers";
import type { makeStyles } from "../reportsScreenStyles";
import type { OrderRow } from "../types";
import { STATUS_COLOR } from "../types";

interface Props {
  readonly filteredOrders: OrderRow[];
  readonly searchQuery: string;
  readonly onSearchChange: (v: string) => void;
  readonly displayCount: number;
  readonly onShowMore: () => void;
  readonly exportingDetailed: boolean;
  readonly onExport: () => void;
  readonly onOpenOrder: (o: OrderRow) => void;
  readonly s: ReturnType<typeof makeStyles>;
}

export function DetailedTab({
  filteredOrders, searchQuery, onSearchChange, displayCount, onShowMore,
  exportingDetailed, onExport, onOpenOrder, s,
}: Props) {
  const { C } = useTheme();
  return (
    <View style={{ flex: 1, padding: 14 }}>
      <View style={[s.card, { flex: 1 }]}>
        <View style={s.cardHead}>
          <Feather name="list" size={14} color={C.ink3} />
          <Text style={s.cardTitle}>Detailed Report</Text>
          <View style={{ flex: 1 }} />
          <Pressable style={[s.hdrBtn, exportingDetailed && { opacity: 0.5 }]} onPress={onExport} disabled={exportingDetailed}>
            <Feather name="download" size={12} color={C.ink3} />
            <Text style={s.hdrBtnTxt}>{exportingDetailed ? "Exporting…" : "Export CSV"}</Text>
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
          <View style={s.searchWrap}>
            <Feather name="search" size={14} color={C.ink4} />
            <TextInput
              style={s.searchInput}
              placeholder="Search by order # or amount…"
              placeholderTextColor={C.ink4}
              value={searchQuery}
              onChangeText={onSearchChange}
              returnKeyType="done"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => onSearchChange("")} hitSlop={10}>
                <Feather name="x" size={14} color={C.ink4} />
              </Pressable>
            )}
          </View>
        </View>
        <TblHdr cols={[
          { label: "Order", style: { width: 70 } },
          { label: "Status", style: { width: 100 } },
          { label: "Date / Time", style: { flex: 1 } },
          { label: "Amount", style: { width: 140, textAlign: "right" as const } },
        ]} />
        <ScrollView style={{ flex: 1, minHeight: 0 }} showsVerticalScrollIndicator={false}>
          {filteredOrders.slice(0, displayCount).map((o, i) => {
            const sc = STATUS_COLOR[o.status] ?? C.ink4;
            return (
              <Pressable key={o.id} style={[s.orderRow, i % 2 === 1 && s.rowAlt]} onPress={() => onOpenOrder(o)}>
                <Text style={{ width: 70, color: C.ink, fontSize: 13, fontFamily: MONO, fontWeight: "600" }}>{shortNo(o.order_no)}</Text>
                <View style={{ width: 100 }}>
                  <View style={[s.statusPill, { backgroundColor: `${sc}22`, alignSelf: "flex-start" }]}>
                    <Text style={[s.statusTxt, { color: sc }]}>{o.status}</Text>
                  </View>
                </View>
                <Text style={{ flex: 1, color: C.ink3, fontSize: 12, fontFamily: MONO }}>{fmtTime(o.created_at)}</Text>
                <Text style={{ width: 140, textAlign: "right", color: C.amber, fontSize: 14, fontWeight: "700", fontFamily: MONO }}>{peso(o.total)}</Text>
              </Pressable>
            );
          })}
          {filteredOrders.length === 0 && (
            <View style={s.emptySection}>
              <Feather name="inbox" size={32} color={C.ink4} />
              <Text style={s.empty}>No orders found</Text>
            </View>
          )}
          {filteredOrders.length > displayCount && (
            <Pressable style={s.loadMoreBtn} onPress={onShowMore}>
              <Text style={s.loadMoreTxt}>Load more · showing {displayCount} of {filteredOrders.length}</Text>
              <Feather name="chevron-down" size={14} color={C.ink3} />
            </Pressable>
          )}
          {filteredOrders.length > 0 && filteredOrders.length <= displayCount && (
            <Text style={[s.empty, { paddingVertical: 14 }]}>All {filteredOrders.length} orders shown</Text>
          )}
          <View style={{ height: 8 }} />
        </ScrollView>
      </View>
    </View>
  );
}

import { View, Text, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { MONO } from "../../theme/mono";
import { CardHead } from "../CardHead";
import { TblHdr } from "../TblHdr";
import { peso } from "../reportsHelpers";
import type { makeStyles } from "../reportsScreenStyles";
import type { StaffRow } from "../types";

interface Props {
  readonly staffStats: StaffRow[] | null;
  readonly staffLoading: boolean;
  readonly exportingStaff: boolean;
  readonly onExport: () => void;
  readonly s: ReturnType<typeof makeStyles>;
}

export function StaffTab({ staffStats, staffLoading, exportingStaff, onExport, s }: Props) {
  const { C } = useTheme();
  return (
    <View style={{ flex: 1, padding: 14 }}>
      <View style={[s.card, { flex: 1 }]}>
        <CardHead icon="users" title="Staff Performance">
          <Pressable style={[s.hdrBtn, exportingStaff && { opacity: 0.5 }]} onPress={onExport} disabled={exportingStaff}>
            <Feather name="download" size={12} color={C.ink3} />
            <Text style={s.hdrBtnTxt}>{exportingStaff ? "Exporting…" : "Export CSV"}</Text>
          </Pressable>
        </CardHead>
        <TblHdr cols={[
          { label: "Staff", style: { flex: 1 } },
          { label: "Orders", style: { width: 60, textAlign: "right" as const } },
          { label: "Gross Sales", style: { width: 120, textAlign: "right" as const } },
          { label: "Net Sales", style: { width: 110, textAlign: "right" as const } },
          { label: "Cancels", style: { width: 70, textAlign: "right" as const } },
          { label: "Discounts", style: { width: 100, textAlign: "right" as const } },
        ]} />
        {staffLoading ? (
          <View style={s.center}><ActivityIndicator color={C.amber} /></View>
        ) : (
          <ScrollView style={{ flex: 1, minHeight: 0 }} showsVerticalScrollIndicator={false}>
            {(staffStats ?? []).map((row, i) => (
              <View key={row.cashier_id ?? `null-${i}`} style={[s.prodRow, i % 2 === 1 && s.rowAlt]}>
                <Text style={{ flex: 1, color: C.ink, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>
                  {row.cashier_id ? row.name : "Walk-in / No cashier"}
                </Text>
                <Text style={{ width: 60, textAlign: "right", color: C.ink3, fontSize: 13, fontFamily: MONO }}>{row.orders}</Text>
                <Text style={{ width: 120, textAlign: "right", color: C.amber, fontSize: 13, fontWeight: "700", fontFamily: MONO }}>{peso(row.grossSales)}</Text>
                <Text style={{ width: 110, textAlign: "right", color: C.good, fontSize: 13, fontFamily: MONO }}>{peso(row.netSales)}</Text>
                <Text style={{ width: 70, textAlign: "right", color: row.cancellations > 0 ? C.bad : C.ink4, fontSize: 13, fontFamily: MONO }}>{row.cancellations}</Text>
                <Text style={{ width: 100, textAlign: "right", color: C.warn, fontSize: 13, fontFamily: MONO }}>{peso(row.discountsGiven)}</Text>
              </View>
            ))}
            {(staffStats ?? []).length === 0 && !staffLoading && (
              <View style={s.emptySection}>
                <Feather name="users" size={32} color={C.ink4} />
                <Text style={s.empty}>No staff data for this period</Text>
              </View>
            )}
          </ScrollView>
        )}
        <View style={[s.cardFoot, { justifyContent: "center" }]}>
          <Text style={{ color: C.ink4, fontSize: 12 }}>{(staffStats ?? []).length} staff members</Text>
        </View>
      </View>
    </View>
  );
}

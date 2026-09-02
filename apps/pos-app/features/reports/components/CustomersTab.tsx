import { View, Text, ActivityIndicator, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { MONO } from "../../theme/mono";
import { CardHead } from "../CardHead";
import { KpiCard } from "../KpiCard";
import { TblHdr } from "../TblHdr";
import { peso } from "../reportsHelpers";
import type { makeStyles } from "../reportsScreenStyles";
import type { CustomerStats } from "../types";

interface Props {
  readonly customerStats: CustomerStats | null;
  readonly customerLoading: boolean;
  readonly bottomPad: number;
  readonly s: ReturnType<typeof makeStyles>;
}

export function CustomersTab({ customerStats, customerLoading, bottomPad, s }: Props) {
  const { C } = useTheme();
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: bottomPad, gap: 12 }} showsVerticalScrollIndicator={false}>
      {customerLoading ? (
        <View style={s.center}><ActivityIndicator color={C.amber} size="large" /></View>
      ) : (
        <>
          <View style={s.kpiRow}>
            <KpiCard flex={1} icon="users" label="Total Customers" value={String(customerStats?.totalCustomers ?? 0)} color={C.info} />
            <KpiCard flex={1} icon="repeat" label="Repeat Customers" value={String(customerStats?.repeatCustomers ?? 0)} color={C.good} />
            <KpiCard flex={1} icon="percent" label="Repeat Rate" value={`${(customerStats?.repeatRate ?? 0).toFixed(1)}%`} color={C.amber} />
          </View>
          {(customerStats?.topCustomers ?? []).length > 0 && (
            <View style={s.card}>
              <CardHead icon="star" title="Top Customers" />
              <TblHdr cols={[
                { label: "Name", style: { flex: 1 } },
                { label: "Phone", style: { width: 110 } },
                { label: "Orders", style: { width: 60, textAlign: "right" as const } },
                { label: "Spend", style: { width: 120, textAlign: "right" as const } },
                { label: "Points", style: { width: 70, textAlign: "right" as const } },
              ]} />
              <ScrollView showsVerticalScrollIndicator={false}>
                {(customerStats?.topCustomers ?? []).map((c, i) => (
                  <View key={c.customer_id} style={[s.prodRow, i % 2 === 1 && s.rowAlt]}>
                    <Text style={{ flex: 1, color: C.ink, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>{c.name}</Text>
                    <Text style={{ width: 110, color: C.ink3, fontSize: 12, fontFamily: MONO }}>{c.phone}</Text>
                    <Text style={{ width: 60, textAlign: "right", color: C.ink3, fontSize: 13, fontFamily: MONO }}>{c.orders}</Text>
                    <Text style={{ width: 120, textAlign: "right", color: C.amber, fontSize: 13, fontWeight: "700", fontFamily: MONO }}>{peso(c.totalSpend)}</Text>
                    <Text style={{ width: 70, textAlign: "right", color: C.good, fontSize: 13, fontFamily: MONO }}>{c.loyaltyPoints}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
          {!customerStats && !customerLoading && (
            <View style={s.emptySection}>
              <Feather name="user" size={32} color={C.ink4} />
              <Text style={s.empty}>No customer data for this period</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

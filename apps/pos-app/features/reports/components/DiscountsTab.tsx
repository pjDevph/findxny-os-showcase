import { View, Text, ActivityIndicator, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { MONO } from "../../theme/mono";
import { CardHead } from "../CardHead";
import { KpiCard } from "../KpiCard";
import { TblHdr } from "../TblHdr";
import { peso, pct } from "../reportsHelpers";
import type { makeStyles } from "../reportsScreenStyles";
import type { DiscountStats } from "../types";

interface Props {
  readonly discountStats: DiscountStats | null;
  readonly discountLoading: boolean;
  readonly bottomPad: number;
  readonly s: ReturnType<typeof makeStyles>;
}

export function DiscountsTab({ discountStats, discountLoading, bottomPad, s }: Props) {
  const { C } = useTheme();
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: bottomPad, gap: 12 }} showsVerticalScrollIndicator={false}>
      {discountLoading ? (
        <View style={s.center}><ActivityIndicator color={C.amber} size="large" /></View>
      ) : (
        <>
          <View style={s.kpiRow}>
            <KpiCard flex={1} icon="tag" label="Total Discount" value={peso(discountStats?.totalDiscount ?? 0)} color={C.warn} />
            <KpiCard flex={1} icon="percent" label="Discount Rate" value={`${(discountStats?.discountRate ?? 0).toFixed(1)}%`} color={C.amber} />
            <KpiCard flex={1} icon="rotate-ccw" label="Total Refunds" value={peso(discountStats?.totalRefunds ?? 0)} color={C.bad} />
          </View>
          {discountStats && (discountStats.manualDiscount + discountStats.seniorPwdDiscount + discountStats.voucherDiscount) > 0 && (
            <View style={s.card}>
              <CardHead icon="pie-chart" title="Discount Breakdown" />
              <View style={s.cardBody}>
                {[
                  { label: "Manual", value: discountStats.manualDiscount, color: C.warn },
                  { label: "Senior / PWD", value: discountStats.seniorPwdDiscount, color: C.info },
                  { label: "Voucher", value: discountStats.voucherDiscount, color: C.amber },
                ].map(item => {
                  const total = (discountStats.manualDiscount + discountStats.seniorPwdDiscount + discountStats.voucherDiscount) || 1;
                  return (
                    <View key={item.label} style={{ gap: 5 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ color: C.ink2, fontSize: 13, fontWeight: "500" }}>{item.label}</Text>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <Text style={{ color: C.ink4, fontSize: 11 }}>{pct(item.value, total)}</Text>
                          <Text style={{ color: item.color, fontSize: 13, fontWeight: "700", fontFamily: MONO }}>{peso(item.value)}</Text>
                        </View>
                      </View>
                      <View style={[s.barTrack, { height: 8 }]}>
                        <View style={[s.barFill, { width: `${(item.value / total) * 100}%` as `${number}%`, backgroundColor: item.color, height: 8 }]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
          {(discountStats?.topVouchers ?? []).length > 0 && (
            <View style={s.card}>
              <CardHead icon="gift" title="Top Vouchers" />
              <TblHdr cols={[
                { label: "Code", style: { flex: 1 } },
                { label: "Uses", style: { width: 70, textAlign: "right" as const } },
                { label: "Total Discount", style: { width: 130, textAlign: "right" as const } },
              ]} />
              <ScrollView showsVerticalScrollIndicator={false}>
                {(discountStats?.topVouchers ?? []).map((v, i) => (
                  <View key={`${v.code}-${i}`} style={[s.prodRow, i % 2 === 1 && s.rowAlt]}>
                    <Text style={{ flex: 1, color: C.ink, fontSize: 13, fontWeight: "600", fontFamily: MONO }}>{v.code}</Text>
                    <Text style={{ width: 70, textAlign: "right", color: C.ink3, fontSize: 13, fontFamily: MONO }}>{v.uses}</Text>
                    <Text style={{ width: 130, textAlign: "right", color: C.amber, fontSize: 13, fontWeight: "700", fontFamily: MONO }}>{peso(v.totalDiscounted)}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
          {!discountStats && !discountLoading && (
            <View style={s.emptySection}>
              <Feather name="tag" size={32} color={C.ink4} />
              <Text style={s.empty}>No discount data for this period</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

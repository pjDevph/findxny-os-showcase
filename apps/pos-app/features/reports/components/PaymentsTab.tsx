import { View, Text, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { MONO } from "../../theme/mono";
import { peso, pct } from "../reportsHelpers";
import type { makeStyles } from "../reportsScreenStyles";
import type { ReportsData } from "../types";

const CAT_COLOR_KEYS = ["amber", "good", "info", "warn", "bad"] as const;

interface Props {
  readonly data: ReportsData | null;
  readonly bottomPad: number;
  readonly s: ReturnType<typeof makeStyles>;
}

export function PaymentsTab({ data, bottomPad, s }: Props) {
  const { C } = useTheme();
  const totalPay = (data?.paymentBars ?? []).reduce((sum, b) => sum + b.value, 0);
  const maxPay = Math.max(...(data?.paymentBars ?? []).map(b => b.value), 1);
  const maxCh = Math.max(...(data?.channelRows ?? []).map(c => c.revenue), 1);
  const totalCat = (data?.categoryRows ?? []).reduce((sum, c) => sum + c.revenue, 0);
  const CAT_COLORS = CAT_COLOR_KEYS.map(k => C[k]);
  const totalChRev = (data?.channelRows ?? []).reduce((sum, c) => sum + c.revenue, 0);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: bottomPad, gap: 12 }} showsVerticalScrollIndicator={false}>
      <View style={s.card}>
        <View style={s.cardHead}>
          <Feather name="credit-card" size={14} color={C.good} />
          <Text style={s.cardTitle}>Payment Methods</Text>
          <View style={{ flex: 1 }} />
          <Text style={{ color: C.ink4, fontSize: 12 }}>Total: {peso(totalPay)}</Text>
        </View>
        <View style={s.cardBody}>
          {(data?.paymentBars ?? []).map(bar => (
            <View key={bar.label} style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                <Text style={{ color: C.ink, fontSize: 14, textTransform: "capitalize", fontWeight: "500" }}>
                  {bar.label.replace(/_/g, " ")}
                </Text>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: C.good, fontSize: 16, fontWeight: "800", fontFamily: MONO }}>{peso(bar.value)}</Text>
                  <Text style={{ color: C.ink4, fontSize: 11 }}>
                    {pct(bar.value, totalPay)} of total · {bar.count} txn{bar.count === 1 ? "" : "s"}
                  </Text>
                </View>
              </View>
              <View style={[s.barTrack, { height: 8 }]}>
                <View style={[s.barFill, { width: `${(bar.value / maxPay) * 100}%` as `${number}%`, backgroundColor: C.good, height: 8 }]} />
              </View>
            </View>
          ))}
          {(data?.paymentBars ?? []).length === 0 && <Text style={s.empty}>No payment data</Text>}
        </View>
      </View>

      {(data?.channelRows ?? []).length > 0 && (
        <View style={s.card}>
          <View style={s.cardHead}>
            <Feather name="globe" size={14} color={C.info} />
            <Text style={s.cardTitle}>Channel Distribution</Text>
          </View>
          <View style={s.cardBody}>
            {(data?.channelRows ?? []).map(ch => (
              <View key={ch.label} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <Text style={{ color: C.ink, fontSize: 14, textTransform: "capitalize", fontWeight: "500" }}>{ch.label}</Text>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: C.info, fontSize: 16, fontWeight: "800", fontFamily: MONO }}>{peso(ch.revenue)}</Text>
                    <Text style={{ color: C.ink4, fontSize: 11 }}>{ch.orders} orders · {pct(ch.revenue, totalChRev)}</Text>
                  </View>
                </View>
                <View style={[s.barTrack, { height: 8 }]}>
                  <View style={[s.barFill, { width: `${(ch.revenue / maxCh) * 100}%` as `${number}%`, backgroundColor: C.info, height: 8 }]} />
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {(data?.categoryRows ?? []).length > 0 && (
        <View style={s.card}>
          <View style={s.cardHead}>
            <Feather name="pie-chart" size={14} color={C.warn} />
            <Text style={s.cardTitle}>Category Breakdown</Text>
          </View>
          <View style={s.cardBody}>
            {(data?.categoryRows ?? []).map((cat, i) => {
              const color = CAT_COLORS[i % CAT_COLORS.length];
              return (
                <View key={cat.label} style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
                      <Text style={{ color: C.ink, fontSize: 14, textTransform: "capitalize", fontWeight: "500" }}>{cat.label}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color, fontSize: 16, fontWeight: "800", fontFamily: MONO }}>{peso(cat.revenue)}</Text>
                      <Text style={{ color: C.ink4, fontSize: 11 }}>{pct(cat.revenue, totalCat)} of total</Text>
                    </View>
                  </View>
                  <View style={[s.barTrack, { height: 8 }]}>
                    <View style={[s.barFill, { width: `${(cat.revenue / totalCat) * 100}%` as `${number}%`, backgroundColor: color, height: 8 }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

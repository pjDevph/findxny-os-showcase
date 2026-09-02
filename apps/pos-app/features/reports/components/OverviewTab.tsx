import { View, Text, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { MONO } from "../../theme/mono";
import { CardHead } from "../CardHead";
import { KpiCard } from "../KpiCard";
import { BarChart } from "../BarChart";
import { MetricBtn } from "../MetricBtn";
import { TblHdr } from "../TblHdr";
import { peso, pct } from "../reportsHelpers";
import type { makeStyles } from "../reportsScreenStyles";
import type { ProductRow, ReportsData, Tab, TrendMetric } from "../types";

const CAT_COLOR_KEYS = ["amber", "good", "info", "warn", "bad"] as const;

interface Props {
  readonly data: ReportsData | null;
  readonly trendMetric: TrendMetric;
  readonly onTrendMetricChange: (m: TrendMetric) => void;
  readonly sortedProducts: ProductRow[];
  readonly setActiveTab: (t: Tab) => void;
  readonly bottomPad: number;
  readonly s: ReturnType<typeof makeStyles>;
}

export function OverviewTab({ data, trendMetric, onTrendMetricChange, sortedProducts, setActiveTab, bottomPad, s }: Props) {
  const { C } = useTheme();
  const totalPay = (data?.paymentBars ?? []).reduce((sum, b) => sum + b.value, 0);
  const maxPay = Math.max(...(data?.paymentBars ?? []).map(b => b.value), 1);
  const totalCat = (data?.categoryRows ?? []).reduce((sum, c) => sum + c.revenue, 0);
  const CAT_COLORS = CAT_COLOR_KEYS.map(k => C[k]);

  return (
    <View style={{ flex: 1 }}>
      <View style={s.kpiRow}>
        <KpiCard flex={1} icon="trending-up" label="Gross Revenue" value={peso(data?.grossRevenue ?? 0)} color={C.amber} />
        <KpiCard flex={1} icon="dollar-sign" label="Net Sales" value={peso(data?.netRevenue ?? 0)} color={C.good} />
        <KpiCard flex={1} icon="shopping-bag" label="Orders" value={String(data?.orderCount ?? 0)} color={C.info} />
        <KpiCard flex={1} icon="bar-chart-2" label="Avg Order" value={peso(data?.avgOrderValue ?? 0)} color={C.amber} />
        <KpiCard flex={1} icon="users" label="Customers" value={String(data?.customerCount ?? 0)} color={C.good} />
      </View>
      <View style={s.body}>
        <View style={s.leftCol}>
          <View style={[s.card, { height: 220 }]}>
            <CardHead icon="bar-chart" title="Revenue Trend">
              <MetricBtn label="Revenue" active={trendMetric === "revenue"} onPress={() => onTrendMetricChange("revenue")} />
              <MetricBtn label="Orders" active={trendMetric === "orders"} onPress={() => onTrendMetricChange("orders")} />
              <MetricBtn label="AOV" active={trendMetric === "avgOrder"} onPress={() => onTrendMetricChange("avgOrder")} />
            </CardHead>
            <View style={{ flex: 1, paddingHorizontal: 4, paddingBottom: 4 }}>
              <BarChart data={data?.dailyTrend ?? []} metric={trendMetric} height={160} />
            </View>
          </View>
          <View style={[s.card, { flex: 1 }]}>
            <CardHead icon="star" title="Top Products" />
            <TblHdr cols={[
              { label: "#", style: { width: 28 } },
              { label: "Product", style: { flex: 1 } },
              { label: "Qty", style: { width: 52, textAlign: "right" as const } },
              { label: "Revenue", style: { width: 110, textAlign: "right" as const } },
            ]} />
            <ScrollView style={{ flex: 1, minHeight: 0 }} showsVerticalScrollIndicator={false}>
              {sortedProducts.slice(0, 5).map((p, i) => (
                <View key={p.product_id} style={[s.prodRow, i % 2 === 1 && s.rowAlt]}>
                  <View style={s.rankBadge}><Text style={s.rankTxt}>{i + 1}</Text></View>
                  <Text style={{ flex: 1, color: C.ink, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>{p.name}</Text>
                  <Text style={{ width: 52, textAlign: "right", color: C.ink3, fontSize: 13, fontFamily: MONO }}>{p.qty}</Text>
                  <Text style={{ width: 110, textAlign: "right", color: C.amber, fontSize: 13, fontWeight: "700", fontFamily: MONO }}>{peso(p.revenue)}</Text>
                </View>
              ))}
              {sortedProducts.length === 0 && (
                <Text style={[s.empty, { paddingVertical: 20 }]}>No product data</Text>
              )}
            </ScrollView>
            {sortedProducts.length > 5 && (
              <Pressable style={s.viewAllBtn} onPress={() => setActiveTab("products")}>
                <Text style={s.viewAllTxt}>View all {sortedProducts.length} products</Text>
                <Feather name="chevron-right" size={14} color={C.amber} />
              </Pressable>
            )}
          </View>
        </View>

        <View style={{ width: 280 }}>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: bottomPad }}>
            <View style={s.card}>
              <CardHead icon="credit-card" title="Payment" />
              <View style={s.cardBody}>
                {(data?.paymentBars ?? []).map(bar => (
                  <View key={bar.label} style={{ gap: 4 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: C.ink2, fontSize: 12, textTransform: "capitalize" }}>{bar.label.replace(/_/g, " ")}</Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Text style={{ color: C.ink4, fontSize: 11 }}>{pct(bar.value, totalPay)}</Text>
                        <Text style={{ color: C.good, fontSize: 12, fontFamily: MONO, fontWeight: "700" }}>{peso(bar.value)}</Text>
                      </View>
                    </View>
                    <View style={s.barTrack}>
                      <View style={[s.barFill, { width: `${(bar.value / maxPay) * 100}%` as `${number}%`, backgroundColor: C.good }]} />
                    </View>
                  </View>
                ))}
                {(data?.paymentBars ?? []).length === 0 && <Text style={s.empty}>No data</Text>}
              </View>
            </View>
            {(data?.categoryRows ?? []).length > 0 && (
              <View style={s.card}>
                <CardHead icon="pie-chart" title="Category" />
                <View style={s.cardBody}>
                  {(data?.categoryRows ?? []).map((cat, i) => {
                    const color = CAT_COLORS[i % CAT_COLORS.length];
                    return (
                      <View key={cat.label} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 3 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
                        <Text style={{ flex: 1, color: C.ink2, fontSize: 12, textTransform: "capitalize" }}>{cat.label}</Text>
                        <Text style={{ color: C.ink4, fontSize: 11, width: 40, textAlign: "right" }}>{pct(cat.revenue, totalCat)}</Text>
                        <Text style={{ color, fontSize: 12, fontFamily: MONO, fontWeight: "700", width: 76, textAlign: "right" }}>{peso(cat.revenue)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
            <View style={[s.card, { borderColor: `${C.bad}35` }]}>
              <CardHead icon="alert-triangle" title="Losses & Issues" />
              <View style={s.cardBody}>
                {[
                  { label: "Cancel Rate", value: `${(data?.cancellationRate ?? 0).toFixed(1)}%` },
                  { label: "Cancelled Orders", value: String(data?.cancelledCount ?? 0) },
                  { label: "Lost Revenue", value: peso(data?.lostRevenue ?? 0) },
                  { label: "Refunds", value: peso(data?.refundTotal ?? 0) },
                ].map((row, i) => (
                  <View key={row.label}>
                    {i > 0 && <View style={{ height: 1, backgroundColor: C.lineSoft, marginVertical: 4 }} />}
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: C.ink3, fontSize: 12 }}>{row.label}</Text>
                      <Text style={{ color: C.bad, fontSize: 14, fontWeight: "700", fontFamily: MONO }}>{row.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

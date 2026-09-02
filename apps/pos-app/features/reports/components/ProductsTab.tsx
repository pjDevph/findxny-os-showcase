import { View, Text, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { MONO } from "../../theme/mono";
import { MetricBtn } from "../MetricBtn";
import { TblHdr } from "../TblHdr";
import { peso } from "../reportsHelpers";
import type { makeStyles } from "../reportsScreenStyles";
import type { ProdMetric, ProductRow } from "../types";

interface Props {
  readonly sortedProducts: ProductRow[];
  readonly prodMetric: ProdMetric;
  readonly onProdMetricChange: (m: ProdMetric) => void;
  readonly s: ReturnType<typeof makeStyles>;
}

export function ProductsTab({ sortedProducts, prodMetric, onProdMetricChange, s }: Props) {
  const { C } = useTheme();
  return (
    <View style={{ flex: 1, padding: 14 }}>
      <View style={[s.card, { flex: 1 }]}>
        <View style={s.cardHead}>
          <Feather name="star" size={14} color={C.amber} />
          <Text style={s.cardTitle}>Top Products</Text>
          <View style={{ flex: 1 }} />
          <MetricBtn label="By Revenue" active={prodMetric === "revenue"} onPress={() => onProdMetricChange("revenue")} />
          <MetricBtn label="By Qty" active={prodMetric === "qty"} onPress={() => onProdMetricChange("qty")} />
        </View>
        <TblHdr cols={[
          { label: "#", style: { width: 32 } },
          { label: "Product", style: { flex: 1 } },
          { label: "Qty", style: { width: 70, textAlign: "right" as const } },
          { label: "Revenue", style: { width: 130, textAlign: "right" as const } },
        ]} />
        <ScrollView style={{ flex: 1, minHeight: 0 }} showsVerticalScrollIndicator={false}>
          {sortedProducts.map((p, i) => (
            <View key={p.product_id} style={[s.prodRow, i % 2 === 1 && s.rowAlt]}>
              <View style={s.rankBadge}><Text style={s.rankTxt}>{i + 1}</Text></View>
              <Text style={{ flex: 1, color: C.ink, fontSize: 14, fontWeight: "500" }} numberOfLines={1}>{p.name}</Text>
              <Text style={{ width: 70, textAlign: "right", color: C.ink3, fontSize: 14, fontFamily: MONO }}>{p.qty}</Text>
              <Text style={{ width: 130, textAlign: "right", color: C.amber, fontSize: 14, fontWeight: "700", fontFamily: MONO }}>{peso(p.revenue)}</Text>
            </View>
          ))}
          {sortedProducts.length === 0 && (
            <View style={s.emptySection}>
              <Feather name="package" size={32} color={C.ink4} />
              <Text style={s.empty}>No product data for this period</Text>
            </View>
          )}
        </ScrollView>
        <View style={[s.cardFoot, { justifyContent: "center" }]}>
          <Text style={{ color: C.ink4, fontSize: 12 }}>{sortedProducts.length} products</Text>
        </View>
      </View>
    </View>
  );
}

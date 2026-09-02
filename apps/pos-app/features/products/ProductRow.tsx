import { Pressable, Text, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { MONO } from "../theme/mono";
import { peso } from "../order/format";
import { Pill } from "../ui/Pill";
import { productColumns } from "./productsColumns";
import { getProductStatus, pct, statusColor } from "./productsHelpers";
import type { Product } from "./types";

interface Props {
  readonly product: Product;
  readonly canWrite: boolean;
  readonly onEdit: (p: Product) => void;
  readonly onMenu: (p: Product) => void;
}

const STOCK_META = {
  out_of_stock: { icon: "x-circle" as const, label: "Out of stock" },
  low_stock: { icon: "alert-triangle" as const, label: "Low stock" },
  in_stock: { icon: "layers" as const, label: "In stock" },
};

const PREP_STATION_META: Record<string, { icon: keyof typeof Feather.glyphMap; label: string }> = {
  kitchen: { icon: "thermometer", label: "Kitchen" },
  drinks: { icon: "coffee", label: "Drinks" },
  counter: { icon: "package", label: "Counter" },
};

export function ProductRow({ product: p, canWrite, onEdit, onMenu }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  const hasCogs = p.cogs > 0;
  const margin = p.price > 0 && hasCogs ? ((p.price - p.cogs) / p.price) * 100 : null;
  const missingPrice = p.price === 0;
  const { status, label: statusLabel } = getProductStatus(p);
  const chipColor = statusColor(status, C);

  return (
    <Pressable
      style={({ pressed }) => [s.row, pressed && { opacity: 0.75 }]}
      onPress={() => canWrite && onEdit(p)}
    >
      <View style={productColumns.colName}>
        <Text style={s.name} numberOfLines={1}>{p.name}</Text>
        <View style={s.meta}>
          {p.prep_station !== "none" && (
            <Pill
              size="sm"
              color={C.amber}
              icon={PREP_STATION_META[p.prep_station]?.icon}
              label={PREP_STATION_META[p.prep_station]?.label ?? p.prep_station}
            />
          )}
          {hasCogs && margin !== null && (
            <Pill size="sm" color={margin >= 0 ? C.good : C.bad} label={`${pct(margin)} margin`} />
          )}
        </View>
      </View>

      <Text style={[productColumns.colCat, s.colTxt]} numberOfLines={1}>{p.category_name ?? "—"}</Text>

      <Text style={[productColumns.colPrice, missingPrice ? s.priceMissing : s.priceNormal]}>
        {missingPrice ? "Missing" : peso(p.price)}
      </Text>

      <View style={productColumns.colType}>
        {(!p.track_inventory || p.stock_status === "not_tracked") ? (
          <Text style={s.colNone}>Not tracked</Text>
        ) : (
          <Pill size="sm" color={C[p.stock_status === "out_of_stock" ? "bad" : p.stock_status === "low_stock" ? "warn" : "good"]}
            icon={STOCK_META[p.stock_status as "out_of_stock" | "low_stock" | "in_stock"].icon}
            label={STOCK_META[p.stock_status as "out_of_stock" | "low_stock" | "in_stock"].label} />
        )}
      </View>

      <View style={productColumns.colStatus}>
        <Pill size="sm" color={chipColor} label={statusLabel} />
      </View>

      <View style={productColumns.colAction}>
        {canWrite && (
          <Pressable style={s.moreBtn} onPress={(e) => { e.stopPropagation(); onMenu(p); }} hitSlop={8}>
            <Feather name="more-vertical" size={16} color={C.ink3} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: C.lineSoft,
  },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 3 },
  name: { color: C.ink, fontSize: 13, fontWeight: "600" },
  priceNormal: { color: C.amber, fontSize: 13, fontWeight: "700", fontFamily: MONO },
  priceMissing: { color: C.warn, fontSize: 11, fontStyle: "italic", textAlign: "right" },
  colTxt: { color: C.ink3, fontSize: 12 },
  colNone: { color: C.ink4, fontSize: 11, fontStyle: "italic" },
  moreBtn: { padding: 4, borderRadius: R.md },
});

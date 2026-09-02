import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import type { DailyPoint, TrendMetric } from "./types";

interface Props {
  readonly data: DailyPoint[];
  readonly metric: TrendMetric;
  readonly height?: number;
}

export function BarChart({ data, metric, height = 140 }: Props) {
  const { C } = useTheme();
  if (!data.length) {
    return (
      <View style={{ height, alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Feather name="bar-chart-2" size={28} color={C.ink4} />
        <Text style={{ color: C.ink4, fontSize: 13 }}>No data for this period</Text>
      </View>
    );
  }
  const maxVal = Math.max(...data.map(d => d[metric]), 1);
  const showLabel = (i: number) =>
    data.length <= 8 || i === 0 || i === Math.floor(data.length / 2) || i === data.length - 1;

  return (
    <View style={{ height, flexDirection: "row", alignItems: "flex-end", gap: 2, paddingHorizontal: 8 }}>
      {data.map((pt, i) => {
        const barH = Math.max(4, (pt[metric] / maxVal) * (height - 22));
        const recent = i >= data.length - Math.ceil(data.length * 0.3);
        return (
          <View key={`${pt.date}-${i}`} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%", paddingBottom: 16 }}>
            <View style={{ width: "85%", height: barH, backgroundColor: recent ? C.amber : `${C.amber}50`, borderRadius: 3 }} />
            {showLabel(i) && (
              <Text style={{ position: "absolute", bottom: 0, fontSize: 8, color: C.ink4, textAlign: "center", width: "200%" }} numberOfLines={1}>
                {pt.date}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

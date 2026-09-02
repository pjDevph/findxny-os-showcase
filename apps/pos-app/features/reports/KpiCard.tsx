import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";

interface Props {
  readonly icon: React.ComponentProps<typeof Feather>["name"];
  readonly label: string;
  readonly value: string;
  readonly color: string;
  readonly flex?: number;
}

export function KpiCard({ icon, label, value, color, flex }: Props) {
  const { C } = useTheme();
  return (
    <View style={{
      flex, backgroundColor: C.surface, borderRadius: R.lg,
      borderWidth: 1, borderColor: C.line, borderTopWidth: 3, borderTopColor: color,
      paddingHorizontal: 16, paddingVertical: 14, gap: 5,
      ...(flex ? {} : { minWidth: 160, marginRight: 8 }),
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Feather name={icon} size={13} color={color} />
        <Text style={{ color, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: "600", flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={{ fontSize: 24, fontWeight: "800", color, letterSpacing: -0.5 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

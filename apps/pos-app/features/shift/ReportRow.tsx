import { View, Text } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { MONO } from "../theme/mono";

interface Props {
  readonly label: string;
  readonly value: string;
  readonly bold?: boolean;
}

export function ReportRow({ label, value, bold }: Props) {
  const { C } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: C.ink3, fontSize: 13, fontWeight: bold ? "700" : "400", flex: 1 }}>{label}</Text>
      <Text style={{ color: bold ? C.ink : C.ink2, fontSize: 13, fontWeight: bold ? "700" : "400", fontFamily: MONO }}>{value}</Text>
    </View>
  );
}

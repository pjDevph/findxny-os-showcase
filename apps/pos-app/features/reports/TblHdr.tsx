import { View, Text } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { MONO } from "../theme/mono";

interface Props {
  readonly cols: { label: string; style?: object }[];
}

export function TblHdr({ cols }: Props) {
  const { C } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 9, backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.line }}>
      {cols.map((col, i) => (
        <Text key={i} style={[{ color: C.ink4, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: MONO }, col.style]}>
          {col.label}
        </Text>
      ))}
    </View>
  );
}

import { Pressable, Text } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";

interface Props {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
}

export function MetricBtn({ label, active, onPress }: Props) {
  const { C } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.md,
        backgroundColor: active ? `${C.amber}22` : "transparent",
        borderWidth: 1, borderColor: active ? C.amber : C.line,
      }}
    >
      <Text style={{ color: active ? C.amber : C.ink4, fontSize: 11, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

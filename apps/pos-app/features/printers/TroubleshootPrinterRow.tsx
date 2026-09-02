import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { CardSection } from "./CardSection";
import { connLabel, typeIcon, typeLabel } from "./printerHelpers";
import type { makeStyles } from "./printersScreenStyles";
import type { Printer } from "./types";

interface Props {
  readonly p: Printer;
  readonly s: ReturnType<typeof makeStyles>;
  readonly testing: string | null;
  readonly onTest: (id: string) => void;
  readonly isLabelPrinter?: boolean;
  readonly testingLabel?: boolean;
  readonly onTestLabel?: () => void;
}

export function TroubleshootPrinterRow({ p, s, testing, onTest, isLabelPrinter, testingLabel, onTestLabel }: Props) {
  const { C } = useTheme();
  return (
    <CardSection icon={typeIcon(p.type)} title={p.name}>
      <View style={s.tsRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.toggleLabel}>{typeLabel(p.type)} · {connLabel(p.connection)}</Text>
          {!!p.ip_address && <Text style={s.toggleSub}>{p.ip_address}</Text>}
          {!!p.mac_address && <Text style={s.toggleSub}>{p.mac_address}</Text>}
          {!p.is_enabled && (
            <Text style={[s.toggleSub, { color: C.bad }]}>Disabled — enable in Devices tab</Text>
          )}
          {!!p.last_test && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
              <Feather name="check-circle" size={11} color={C.good} />
              <Text style={[s.toggleSub, { color: C.good }]}>
                Last test: {new Date(p.last_test).toLocaleString()}
              </Text>
            </View>
          )}
        </View>
        <View style={{ gap: 8 }}>
          <Pressable
            style={[s.testBtn, (!p.is_enabled || testing === p.id) && { opacity: 0.4 }]}
            onPress={() => onTest(p.id)}
            disabled={!p.is_enabled || testing === p.id}
          >
            {testing === p.id ? <ActivityIndicator size="small" color={C.amber} /> : <Feather name="send" size={14} color={C.amber} />}
            <Text style={s.testBtnTxt}>{testing === p.id ? "Sending…" : "Test"}</Text>
          </Pressable>
          {isLabelPrinter && (
            <Pressable
              style={[s.testBtn, (!p.is_enabled || testingLabel) && { opacity: 0.4 }]}
              onPress={onTestLabel}
              disabled={!p.is_enabled || testingLabel}
            >
              {testingLabel ? <ActivityIndicator size="small" color={C.amber} /> : <Feather name="tag" size={14} color={C.amber} />}
              <Text style={s.testBtnTxt}>{testingLabel ? "Sending…" : "Test Label"}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </CardSection>
  );
}

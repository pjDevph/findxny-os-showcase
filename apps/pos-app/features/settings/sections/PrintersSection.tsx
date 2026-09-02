import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { SectionLabel, Card } from "../SettingsCard";
import { useBuiltInPrinterLabel } from "../../printers/useBuiltInPrinterLabel";
import type { makeStyles } from "../settingsScreenStyles";

interface Props {
  readonly canEdit: boolean;
  readonly s: ReturnType<typeof makeStyles>;
}

export function PrintersSection({ canEdit, s }: Props) {
  const { C } = useTheme();
  const router = useRouter();
  const builtInLabel = useBuiltInPrinterLabel();

  return (
    <>
      <SectionLabel label="Printer Management" />
      <Card>
        <View style={s.printerSummaryRow}>
          <View style={s.printerSummaryIcon}>
            <Feather name="printer" size={20} color={C.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.printerSummaryTitle}>{builtInLabel.full}</Text>
            <Text style={s.printerSummarySub}>Thermal receipt printer · Always active</Text>
          </View>
          <View style={[s.printerSummaryBadge, { backgroundColor: `${C.good}20` }]}>
            <Text style={[s.printerSummaryBadgeTxt, { color: C.good }]}>ON</Text>
          </View>
        </View>

        <View style={[s.printerSummaryDivider, { backgroundColor: C.line }]} />

        <Text style={[s.helpNote, { marginBottom: 0 }]}>
          Add external label printers for drink labels, configure print routing rules,
          and customize label templates from the full management screen.
        </Text>
      </Card>

      <Pressable
        style={[s.printerNavBtn, !canEdit && { opacity: 0.6 }]}
        onPress={() => router.push("/pos/printers" as any)}
        disabled={!canEdit}
      >
        <Feather name="settings" size={16} color={C.amber} />
        <Text style={s.printerNavBtnTxt}>Open Printer Management</Text>
        <Feather name="arrow-right" size={14} color={C.amber} />
      </Pressable>
    </>
  );
}

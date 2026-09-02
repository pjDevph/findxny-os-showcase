import { View, Text, TextInput, Switch } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import type { makeStyles } from "./settingsScreenStyles";

type C = ReturnType<typeof useTheme>["C"];
type S = ReturnType<typeof makeStyles>;

interface Props {
  readonly title: string;
  readonly icon: keyof typeof Feather.glyphMap;
  readonly accent: string;
  readonly enabled: boolean;
  readonly canEdit: boolean;
  readonly pct: string;
  readonly hint: string;
  readonly onToggle: (v: boolean) => void;
  readonly onChange: (v: string) => void;
  readonly C: C;
  readonly s: S;
}

export function RatePctBlock({ title, icon, accent, enabled, canEdit, pct, hint, onToggle, onChange, C, s }: Props) {
  return (
    <View style={s.rateBlock}>
      <View style={s.rateToggleRow}>
        <View style={s.rateLabelGroup}>
          <View style={s.rateIconWrap}><Feather name={icon} size={14} color={enabled ? accent : C.ink4} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[s.rateTitle, !enabled && s.rateTitleOff]}>{title}</Text>
            <Text style={s.rateSub}>{enabled ? hint : "Currently disabled"}</Text>
          </View>
        </View>
        <Switch value={enabled} onValueChange={canEdit ? onToggle : undefined}
          trackColor={{ false: C.line, true: `${accent}66` }} thumbColor={enabled ? accent : C.ink3} disabled={!canEdit} />
      </View>
      {enabled && (
        <View style={s.pctRow}>
          <Text style={s.pctLabel}>Rate</Text>
          <View style={s.pctInputWrap}>
            <TextInput style={[s.pctInput, !canEdit && s.inputDisabled]} value={pct}
              onChangeText={onChange} editable={canEdit} keyboardType="decimal-pad" maxLength={6} placeholder="0" placeholderTextColor={C.ink4} />
            <Text style={s.pctSuffix}>%</Text>
          </View>
        </View>
      )}
    </View>
  );
}

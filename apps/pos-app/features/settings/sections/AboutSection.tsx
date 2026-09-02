import { View, Text, Platform } from "react-native";
import Constants from "expo-constants";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { SectionLabel, Card } from "../SettingsCard";
import type { makeStyles } from "../settingsScreenStyles";
import type { WorkspaceInfo } from "../types";

interface Props {
  readonly info: WorkspaceInfo | null;
  readonly role: string | null | undefined;
  readonly canEdit: boolean;
  readonly s: ReturnType<typeof makeStyles>;
}

export function AboutSection({ info, role, canEdit, s }: Props) {
  const { C } = useTheme();
  const deviceName = Constants.deviceName ?? "—";
  const platform = Platform.OS;
  const osVersion = String(Platform.Version);
  const appVersion = Constants.nativeAppVersion ?? "—";
  const buildVersion = Constants.nativeBuildVersion ?? "—";

  return (
    <>
      <SectionLabel label="This Device" />
      <Card>
        {[
          { label: "Device Name", value: deviceName },
          { label: "Platform", value: platform },
          { label: "OS Version", value: osVersion },
          { label: "App Version", value: appVersion },
          { label: "Build", value: buildVersion },
        ].map((row) => (
          <View key={row.label} style={s.metaRow}>
            <Text style={s.metaLabel}>{row.label}</Text>
            <Text style={s.metaValue} selectable>{row.value}</Text>
          </View>
        ))}
      </Card>

      <SectionLabel label="Workspace Info" />
      <Card>
        <View style={s.metaRow}>
          <Text style={s.metaLabel}>Workspace ID</Text>
          <Text style={s.metaValue} selectable>{info?.id ?? "—"}</Text>
        </View>
        <View style={s.metaRow}>
          <Text style={s.metaLabel}>Your Role</Text>
          <View style={[s.rolePill, { backgroundColor: `${C.amber}20` }]}>
            <Text style={[s.roleText, { color: C.amber }]}>{role ?? "—"}</Text>
          </View>
        </View>
      </Card>
      {!canEdit && (
        <View style={s.noEditBanner}>
          <Feather name="lock" size={13} color={C.ink4} />
          <Text style={s.noEditTxt}>Only the owner can edit store settings.</Text>
        </View>
      )}
    </>
  );
}

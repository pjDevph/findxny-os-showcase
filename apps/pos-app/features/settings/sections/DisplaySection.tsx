import { Text } from "react-native";
import { CustomerDisplaySettings } from "../../customerDisplay/CustomerDisplaySettings";
import { SectionLabel } from "../SettingsCard";
import type { makeStyles } from "../settingsScreenStyles";

interface Props {
  readonly s: ReturnType<typeof makeStyles>;
}

export function DisplaySection({ s }: Props) {
  return (
    <>
      <SectionLabel label="Customer Display" />
      <Text style={s.helpNote}>Customer-display settings apply to this device only.</Text>
      <CustomerDisplaySettings />
    </>
  );
}

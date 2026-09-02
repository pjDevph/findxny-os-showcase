import { TextInput } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { sanitizePhone } from "../../utils/inputSanitizers";
import { SectionLabel, Card, Field } from "../SettingsCard";
import type { makeStyles } from "../settingsScreenStyles";
import type { useWorkspaceSettings } from "../useWorkspaceSettings";

interface Props {
  readonly settings: ReturnType<typeof useWorkspaceSettings>;
  readonly canEdit: boolean;
  readonly s: ReturnType<typeof makeStyles>;
}

export function ProfileSection({ settings, canEdit, s }: Props) {
  const { C } = useTheme();
  const { form, update, receiptConfig, updateReceipt } = settings;

  return (
    <>
      <SectionLabel label="Store Profile" />
      <Card>
        <Field label="Store Name" required>
          <TextInput style={[s.input, !canEdit && s.inputDisabled]} value={form.name}
            onChangeText={(v) => update("name", v)} editable={canEdit} maxLength={60}
            placeholder="Your store name" placeholderTextColor={C.ink4} />
        </Field>
        <Field label="Phone / Contact">
          <TextInput style={[s.input, !canEdit && s.inputDisabled]} value={form.phone}
            onChangeText={(v) => update("phone", sanitizePhone(v))} editable={canEdit} maxLength={15}
            placeholder="+63 XXX XXX XXXX" placeholderTextColor={C.ink4} keyboardType="phone-pad" />
        </Field>
        <Field label="Store Address">
          <TextInput style={[s.input, s.inputMultiline, !canEdit && s.inputDisabled]} value={receiptConfig.address}
            onChangeText={(v) => updateReceipt("address", v)} editable={canEdit} maxLength={200}
            placeholder={"123 Main St, Brgy. Sample\nManila, NCR"} placeholderTextColor={C.ink4}
            multiline numberOfLines={2} textAlignVertical="top" />
        </Field>
        <Field label="TIN Number">
          <TextInput style={[s.input, !canEdit && s.inputDisabled]} value={receiptConfig.tin}
            onChangeText={(v) => updateReceipt("tin", v)} editable={canEdit} maxLength={20}
            placeholder="000-000-000-000" placeholderTextColor={C.ink4} keyboardType="numbers-and-punctuation" />
        </Field>
      </Card>
    </>
  );
}

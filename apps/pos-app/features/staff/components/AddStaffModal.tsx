import { useState } from "react";
import { Pressable, Text, TextInput, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { R } from "../../theme/tokens";
import { MONO } from "../../theme/mono";
import { FormSheetModal } from "../../ui/FormSheetModal";
import { ChipPickerGrid, type ChipOption } from "../../ui/ChipPickerGrid";
import { PinInput } from "../../ui/PinInput";
import { PermissionPreview } from "../PermissionPreview";
import { generatePIN } from "../staffHelpers";
import { MANAGEABLE_ROLES, roleColor, type WorkspaceRole } from "../types";

interface Props {
  readonly visible: boolean;
  readonly saving: boolean;
  readonly error: string;
  readonly onClose: () => void;
  readonly onSubmit: (form: { name: string; username: string; pin: string; role: WorkspaceRole }) => Promise<boolean>;
}

const EMPTY = { name: "", username: "", pin: "", role: "cashier" as WorkspaceRole };

export function AddStaffModal({ visible, saving, error, onClose, onSubmit }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  const [form, setForm] = useState(EMPTY);
  const [pinHide, setPinHide] = useState(true);

  function close() {
    setForm(EMPTY);
    setPinHide(true);
    onClose();
  }

  async function submit() {
    const ok = await onSubmit(form);
    if (ok) { setForm(EMPTY); setPinHide(true); }
  }

  const rc = roleColor(C, form.role);
  const roleOptions: ChipOption[] = MANAGEABLE_ROLES.map(r => ({
    key: r, label: r.charAt(0).toUpperCase() + r.slice(1), dotColor: roleColor(C, r),
  }));
  const canSubmit = !saving && !!form.name.trim() && !!form.username.trim() && form.pin.length >= 4;

  return (
    <FormSheetModal
      visible={visible}
      onClose={close}
      title="Add Staff Member"
      footer={
        <Pressable style={[s.confirmBtn, !canSubmit && { opacity: 0.5 }]} onPress={submit} disabled={!canSubmit}>
          <Text style={s.confirmBtnText} numberOfLines={1}>{saving ? "Creating…" : "Create Staff Account"}</Text>
        </Pressable>
      }
    >
      <Text style={s.subtitle}>Create a new POS login account for your team.</Text>

      <View style={s.fieldBlock}>
        <Text style={s.fieldLabel}>Full Name</Text>
        <TextInput style={s.input} placeholder="e.g. Maria Santos" placeholderTextColor={C.ink4}
          autoCapitalize="words" maxLength={60} value={form.name}
          onChangeText={v => setForm(f => ({ ...f, name: v }))} />
      </View>

      <View style={s.fieldBlock}>
        <Text style={s.fieldLabel}>Username</Text>
        <TextInput style={s.input} placeholder="e.g. maria_s" placeholderTextColor={C.ink4}
          autoCapitalize="none" autoCorrect={false} maxLength={30} value={form.username}
          onChangeText={v => setForm(f => ({ ...f, username: v.toLowerCase().replace(/[^a-z0-9_]/g, "") }))} />
        <Text style={s.fieldHint}>Letters, numbers, and underscores only.</Text>
      </View>

      <View style={s.fieldBlock}>
        <Text style={s.fieldLabel}>Login PIN</Text>
        <View style={s.pinInputRow}>
          <PinInput length={6} value={form.pin} onChange={v => setForm(f => ({ ...f, pin: v }))} secure={pinHide} />
          <Pressable style={s.pinVisBtn} onPress={() => setPinHide(h => !h)}>
            <Feather name={pinHide ? "eye" : "eye-off"} size={16} color={C.ink4} />
          </Pressable>
          <Pressable style={s.generatePinBtn} onPress={() => setForm(f => ({ ...f, pin: generatePIN() }))}>
            <Text style={s.generatePinText}>Generate</Text>
          </Pressable>
        </View>
        <Text style={s.fieldHint}>4–6 digit code used to log in on the POS device.</Text>
      </View>

      <View style={s.fieldBlock}>
        <Text style={s.fieldLabel}>Role</Text>
        <ChipPickerGrid options={roleOptions} selectedKey={form.role} onSelect={(k) => setForm(f => ({ ...f, role: k as WorkspaceRole }))} />
      </View>

      <PermissionPreview role={form.role} color={rc} mode="text" heading={`${form.role.charAt(0).toUpperCase() + form.role.slice(1)} can access:`} />

      {!!error && <Text style={s.errText}>{error}</Text>}
    </FormSheetModal>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  subtitle: { color: C.ink3, fontSize: 13, marginTop: -10 },
  fieldBlock: { gap: 6 },
  fieldLabel: { color: C.ink4, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: MONO },
  fieldHint: { color: C.ink4, fontSize: 11, lineHeight: 16 },
  input: { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 11, color: C.ink, fontSize: 14 },
  pinInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pinVisBtn: { padding: 11, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  generatePinBtn: { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 11 },
  generatePinText: { color: C.amber, fontSize: 12, fontWeight: "700" },
  errText: { color: C.bad, fontSize: 13 },
  confirmBtn: { padding: 14, borderRadius: R.cta, backgroundColor: C.info, alignItems: "center", justifyContent: "center" },
  confirmBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});

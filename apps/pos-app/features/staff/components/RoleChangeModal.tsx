import { useEffect, useState } from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { R } from "../../theme/tokens";
import { FormSheetModal } from "../../ui/FormSheetModal";
import { ChipPickerGrid, type ChipOption } from "../../ui/ChipPickerGrid";
import { PermissionPreview } from "../PermissionPreview";
import { MANAGEABLE_ROLES, roleColor, type StaffMember, type WorkspaceRole } from "../types";

interface Props {
  readonly visible: boolean;
  readonly staffMember: StaffMember | null;
  readonly saving: boolean;
  readonly onClose: () => void;
  readonly onConfirm: (newRole: WorkspaceRole) => void;
}

export function RoleChangeModal({ visible, staffMember, saving, onClose, onConfirm }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  const [pendingRole, setPendingRole] = useState<WorkspaceRole | null>(null);

  useEffect(() => { if (visible && staffMember) setPendingRole(staffMember.role); }, [visible, staffMember]);

  if (!staffMember) return null;
  const noChange = !pendingRole || pendingRole === staffMember.role;
  const previewRole = pendingRole ?? staffMember.role;
  const pc = roleColor(C, previewRole);

  const options: ChipOption[] = MANAGEABLE_ROLES.map(r => ({
    key: r,
    label: r.charAt(0).toUpperCase() + r.slice(1),
    dotColor: roleColor(C, r),
    badge: r === staffMember.role ? "current" : undefined,
  }));

  return (
    <FormSheetModal
      visible={visible}
      onClose={onClose}
      title="Change Role"
      footer={
        <Pressable
          style={[s.confirmBtn, (noChange || saving) && { opacity: 0.6 }]}
          onPress={() => pendingRole && onConfirm(pendingRole)}
          disabled={noChange || saving}
        >
          <Text style={s.confirmBtnText} numberOfLines={1}>{saving ? "Saving…" : `Set to ${pendingRole ?? "…"}`}</Text>
        </Pressable>
      }
    >
      <Text style={s.subtitle}>{staffMember.full_name}</Text>
      <ChipPickerGrid options={options} selectedKey={pendingRole} onSelect={(k) => setPendingRole(k as WorkspaceRole)} />
      <PermissionPreview role={previewRole} color={pc} mode="chips" heading={`${previewRole.charAt(0).toUpperCase() + previewRole.slice(1)} can access:`} />
    </FormSheetModal>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  subtitle: { color: C.ink3, fontSize: 13, marginTop: -10 },
  confirmBtn: { padding: 14, borderRadius: R.cta, backgroundColor: C.info, alignItems: "center", justifyContent: "center" },
  confirmBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});

import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { MONO } from "../theme/mono";
import { PinInput } from "../ui/PinInput";
import { PermissionPreview } from "./PermissionPreview";
import { initials } from "./staffHelpers";
import { PERM_SECTIONS, ROLE_DESC, TOTAL_TABS, roleColor, type StaffMember } from "./types";
import { canAccessPosRoute } from "../auth/rolePermissions";

interface Props {
  readonly selected: StaffMember;
  readonly myUserId: string | undefined;
  readonly canManage: boolean;
  readonly onOpenRoleChange: () => void;
  readonly onSuspend: (member: StaffMember) => void;
  readonly onArchive: (member: StaffMember) => void;
  readonly onRestore: (member: StaffMember) => void;
  readonly changePin: (userId: string, newPin: string) => Promise<boolean>;
  readonly pinSaving: boolean;
  readonly bottomInset: number;
}

export function StaffDetailPanel({
  selected, myUserId, canManage, onOpenRoleChange, onSuspend, onArchive, onRestore,
  changePin, pinSaving, bottomInset,
}: Props) {
  const { C } = useTheme();
  const s = styles(C);

  const [changingPin, setChangingPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [pinHide, setPinHide] = useState(true);

  useEffect(() => { setChangingPin(false); setNewPin(""); setPinHide(true); }, [selected.user_id]);

  const rc = roleColor(C, selected.role);
  const isMe = selected.user_id === myUserId;
  const isOwner = selected.role === "owner";
  const accessCount = PERM_SECTIONS.flatMap(sec => sec.keys).filter(k => canAccessPosRoute(selected.role, k)).length;
  const statusLabel = selected.is_archived ? "Archived" : selected.is_suspended ? "Suspended" : "Active";
  const statusColor = selected.is_archived ? C.bad : selected.is_suspended ? C.warn : C.good;

  async function handleSavePin() {
    if (newPin.length < 4) return;
    const ok = await changePin(selected.user_id, newPin);
    if (ok) { setChangingPin(false); setNewPin(""); }
  }

  return (
    <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={[s.content, { paddingBottom: bottomInset + 40 }]}>
      <View style={[s.profileCard, { borderTopColor: rc }]}>
        <View style={[s.avatar, { backgroundColor: `${rc}22` }]}>
          <Text style={[s.avatarText, { color: rc }]}>{initials(selected.full_name)}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={s.name}>{selected.full_name || "Unnamed Staff"}</Text>
            {isMe && <Text style={s.youTag}>you</Text>}
          </View>
          <Text style={s.username}>{selected.username ? `@${selected.username}` : "No username set"}</Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 2 }}>
            <View style={[s.rolePill, { backgroundColor: `${rc}18`, borderColor: `${rc}40` }]}>
              <Text style={[s.rolePillText, { color: rc }]}>{selected.role}</Text>
            </View>
            <View style={[s.rolePill, { backgroundColor: `${statusColor}14`, borderColor: `${statusColor}30` }]}>
              <Text style={[s.rolePillText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
          <Text style={s.roleDesc}>{ROLE_DESC[selected.role]}</Text>
        </View>
      </View>

      <PermissionPreview role={selected.role} color={rc} mode="grid" heading="Access Summary" badge={`${accessCount} / ${TOTAL_TABS} tabs`} />

      {canManage && !isOwner && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Role & Permissions</Text>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Current Role</Text>
            <View style={[s.rolePill, { backgroundColor: `${rc}18`, borderColor: `${rc}40` }]}>
              <Text style={[s.rolePillText, { color: rc }]}>{selected.role}</Text>
            </View>
          </View>
          <Pressable style={s.actionRow} onPress={onOpenRoleChange}>
            <Feather name="shield" size={15} color={C.info} />
            <Text style={s.actionRowText}>Change Role</Text>
            <Feather name="chevron-right" size={14} color={C.ink4} style={{ marginLeft: "auto" }} />
          </Pressable>
        </View>
      )}

      {canManage && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Security</Text>
          {changingPin ? (
            <>
              <View style={s.pinInputRow}>
                <PinInput length={6} value={newPin} onChange={setNewPin} secure={pinHide} autoFocus />
                <Pressable style={s.pinVisBtn} onPress={() => setPinHide(h => !h)}>
                  <Feather name={pinHide ? "eye" : "eye-off"} size={16} color={C.ink4} />
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable style={s.pinCancelBtn} onPress={() => { setChangingPin(false); setNewPin(""); setPinHide(true); }}>
                  <Text style={s.pinCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[s.pinSaveBtn, (newPin.length < 4 || pinSaving) && { opacity: 0.5 }]}
                  onPress={handleSavePin} disabled={newPin.length < 4 || pinSaving}
                >
                  <Text style={s.pinSaveBtnText}>{pinSaving ? "Saving…" : "Save PIN"}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable style={s.actionRow} onPress={() => { setChangingPin(true); setPinHide(true); }}>
              <Feather name="key" size={15} color={C.ink3} />
              <Text style={s.actionRowText}>Reset Login PIN</Text>
              <Feather name="chevron-right" size={14} color={C.ink4} style={{ marginLeft: "auto" }} />
            </Pressable>
          )}
        </View>
      )}

      {canManage && !isMe && !isOwner && (
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: C.bad }]}>Account Actions</Text>
          {selected.is_archived ? (
            <Pressable style={s.restoreBtn} onPress={() => onRestore(selected)}>
              <Feather name="refresh-cw" size={15} color={C.good} />
              <Text style={s.restoreBtnText}>Restore Staff Access</Text>
            </Pressable>
          ) : (
            <>
              <Pressable style={[s.actionRow, { borderColor: `${C.warn}40` }]} onPress={() => onSuspend(selected)}>
                <Feather name={selected.is_suspended ? "play-circle" : "pause-circle"} size={15} color={C.warn} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.actionRowText, { color: C.warn }]}>
                    {selected.is_suspended ? "Reactivate Account" : "Suspend Account"}
                  </Text>
                  <Text style={s.actionRowSub}>
                    {selected.is_suspended ? "Restore POS access" : "Temporarily block POS access"}
                  </Text>
                </View>
              </Pressable>
              <Pressable style={s.archiveBtn} onPress={() => onArchive(selected)}>
                <Feather name="archive" size={15} color={C.bad} />
                <View style={{ flex: 1 }}>
                  <Text style={s.archiveBtnText}>Archive Staff</Text>
                  <Text style={[s.actionRowSub, { color: `${C.bad}80` }]}>Permanently remove access. Keeps activity history.</Text>
                </View>
              </Pressable>
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  content: { padding: 18, gap: 14, paddingBottom: 40 },
  profileCard: {
    flexDirection: "row", gap: 14, alignItems: "flex-start",
    backgroundColor: C.bg2, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, borderTopWidth: 3, padding: 16,
  },
  avatar: { width: 52, height: 52, borderRadius: R.full, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarText: { fontSize: 18, fontWeight: "700" },
  name: { color: C.ink, fontSize: 17, fontWeight: "700" },
  username: { color: C.ink4, fontSize: 12, fontFamily: MONO },
  roleDesc: { color: C.ink3, fontSize: 12, lineHeight: 17, marginTop: 4 },
  youTag: {
    color: C.ink4, fontSize: 9, fontFamily: MONO,
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: R.full, borderWidth: 1, borderColor: C.line,
  },
  rolePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.full, borderWidth: 1 },
  rolePillText: { fontSize: 9, fontWeight: "700", fontFamily: MONO, textTransform: "uppercase" },
  section: { backgroundColor: C.bg2, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 14, gap: 10 },
  sectionTitle: { color: C.ink3, fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", fontFamily: MONO },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  infoLabel: { color: C.ink3, fontSize: 13 },
  actionRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  actionRowText: { color: C.ink2, fontSize: 13, fontWeight: "500" },
  actionRowSub: { color: C.ink4, fontSize: 11, marginTop: 2 },
  archiveBtn: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: `${C.bad}10`, borderRadius: R.md, borderWidth: 1, borderColor: `${C.bad}26`,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  archiveBtnText: { color: C.bad, fontSize: 13, fontWeight: "600" },
  restoreBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: `${C.good}10`, borderRadius: R.md, borderWidth: 1, borderColor: `${C.good}26`,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  restoreBtnText: { color: C.good, fontSize: 13, fontWeight: "600" },
  pinInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  pinVisBtn: { padding: 11, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  pinCancelBtn: { flex: 1, padding: 11, borderRadius: R.md, borderWidth: 1, borderColor: C.line, alignItems: "center" },
  pinCancelText: { color: C.ink3, fontSize: 13, fontWeight: "600" },
  pinSaveBtn: { flex: 2, padding: 11, borderRadius: R.md, backgroundColor: C.info, alignItems: "center" },
  pinSaveBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});

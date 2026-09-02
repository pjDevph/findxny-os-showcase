import { useMemo, useState } from "react";
import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { useAuth } from "../../features/auth/AuthContext";
import { useTheme } from "../../features/theme/ThemeContext";
import { makeStyles } from "../../features/staff/staffScreenStyles";
import { useStaffList } from "../../features/staff/useStaffList";
import { useMyAttendance } from "../../features/staff/useMyAttendance";
import { useStaffActions } from "../../features/staff/useStaffActions";
import { StaffListPanel } from "../../features/staff/StaffListPanel";
import { StaffOverviewPanel } from "../../features/staff/StaffOverviewPanel";
import { StaffDetailPanel } from "../../features/staff/StaffDetailPanel";
import { RoleChangeModal } from "../../features/staff/components/RoleChangeModal";
import { AddStaffModal } from "../../features/staff/components/AddStaffModal";
import { RoleFilterModal } from "../../features/staff/components/RoleFilterModal";
import type { WorkspaceRole } from "../../features/staff/types";

export default function StaffScreen() {
  const { activeWorkspaceId, role: myRole, user } = useAuth();
  const { C } = useTheme();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(C), [C]);

  const canManage = myRole === "owner" || myRole === "admin";

  const list = useStaffList(activeWorkspaceId);
  const attendance = useMyAttendance(activeWorkspaceId, user?.id);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => list.allStaff.find(m => m.user_id === selectedId) ?? null,
    [list.allStaff, selectedId],
  );

  function selectStaff(id: string) {
    setSelectedId(prev => prev === id ? null : id);
  }

  const actions = useStaffActions({
    activeWorkspaceId,
    setAllStaff: list.setAllStaff,
    fetchStaff: list.fetchStaff,
    onSelectionCleared: () => setSelectedId(null),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showRoleFilter, setShowRoleFilter] = useState(false);

  async function handleConfirmRoleChange(newRole: WorkspaceRole) {
    if (!selected) return;
    const ok = await actions.confirmRoleChange(selected.user_id, newRole);
    if (ok) setShowRoleModal(false);
  }

  const detailNode = selected ? (
    <StaffDetailPanel
      selected={selected}
      myUserId={user?.id}
      canManage={canManage}
      onOpenRoleChange={() => setShowRoleModal(true)}
      onSuspend={actions.handleSuspend}
      onArchive={actions.handleArchive}
      onRestore={actions.handleRestore}
      changePin={actions.changePin}
      pinSaving={actions.pinSaving}
      bottomInset={insets.bottom}
    />
  ) : isTablet ? (
    <StaffOverviewPanel
      allStaff={list.allStaff}
      noUsernameCount={list.stats.noUsername}
      suspendedCount={list.stats.suspended}
      canManage={canManage}
      myAttendance={attendance.myAttendance}
      attendanceBusy={attendance.attendanceBusy}
      onClockIn={() => { attendance.handleClockIn().catch(console.error); }}
      onClockOut={() => { attendance.handleClockOut().catch(console.error); }}
      onViewArchived={() => { list.setStatusTab("archived"); list.setSearch(""); list.setRoleFilter("all"); }}
      bottomInset={insets.bottom}
    />
  ) : null;

  const listPanel = (
    <StaffListPanel
      isTablet={isTablet}
      stats={list.stats}
      statusTab={list.statusTab}
      onStatusTabChange={(tab) => { list.setStatusTab(tab); setSelectedId(null); }}
      search={list.search}
      onSearchChange={list.setSearch}
      roleFilter={list.roleFilter}
      onOpenRoleFilter={() => setShowRoleFilter(true)}
      filtered={list.filtered}
      loading={list.loading}
      loadError={list.loadError}
      onRetry={list.fetchStaff}
      selectedId={selectedId}
      onSelect={selectStaff}
      myUserId={user?.id}
    />
  );

  return (
    <View style={s.root}>
      <PosScreenHeader
        title="Staff Management"
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={s.headerCount}>{list.stats.total} member{list.stats.total !== 1 ? "s" : ""}</Text>
            {canManage && (
              <Pressable style={s.addBtn} onPress={() => setShowAdd(true)}>
                <Feather name="user-plus" size={14} color="#000000" />
                <Text style={s.addBtnText}>Add Staff</Text>
              </Pressable>
            )}
          </View>
        }
      />

      {isTablet ? (
        <View style={{ flex: 1, flexDirection: "row" }}>
          {listPanel}
          <View style={s.rightPanel}>{detailNode}</View>
        </View>
      ) : (
        <>
          {listPanel}
          <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelectedId(null)}>
            <Pressable style={s.modalBd} onPress={() => setSelectedId(null)}>
              <Pressable style={[s.modalCard, { maxHeight: "92%" }]} onPress={() => {}}>
                <View style={s.phoneDetailHead}>
                  <Text style={s.sheetTitle}>Staff Details</Text>
                  <Pressable hitSlop={10} onPress={() => setSelectedId(null)}>
                    <Feather name="x" size={20} color={C.ink3} />
                  </Pressable>
                </View>
                {detailNode}
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}

      <AddStaffModal
        visible={showAdd}
        saving={actions.adding}
        error={actions.addError}
        onClose={() => { setShowAdd(false); actions.setAddError(""); }}
        onSubmit={async (form) => {
          const ok = await actions.addStaff(form);
          if (ok) setShowAdd(false);
          return ok;
        }}
      />
      <RoleChangeModal
        visible={showRoleModal}
        staffMember={selected}
        saving={actions.roleChanging}
        onClose={() => setShowRoleModal(false)}
        onConfirm={handleConfirmRoleChange}
      />
      <RoleFilterModal
        visible={showRoleFilter}
        roleFilter={list.roleFilter}
        onClose={() => setShowRoleFilter(false)}
        onSelect={list.setRoleFilter}
      />
    </View>
  );
}

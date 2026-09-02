import { useState } from "react";
import { supabase } from "../../services/supabase";
import { useAppAlert } from "../ui/AppAlertProvider";
import { useToast } from "../ui/ToastProvider";
import { extractFnError } from "./staffHelpers";
import type { StaffMember, WorkspaceRole } from "./types";

interface UseStaffActionsArgs {
  activeWorkspaceId: string | null | undefined;
  setAllStaff: React.Dispatch<React.SetStateAction<StaffMember[]>>;
  fetchStaff: () => Promise<void>;
  onSelectionCleared: () => void;
}

export function useStaffActions({ activeWorkspaceId, setAllStaff, fetchStaff, onSelectionCleared }: UseStaffActionsArgs) {
  const { showAlert } = useAppAlert();
  const { showToast } = useToast();
  const [roleChanging, setRoleChanging] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [pinSaving, setPinSaving] = useState(false);

  async function confirmRoleChange(userId: string, newRole: WorkspaceRole) {
    setRoleChanging(true);
    const { data, error } = await supabase.functions.invoke("employees-update", {
      body: { workspace_id: activeWorkspaceId, user_id: userId, role: newRole },
    });
    setRoleChanging(false);
    if (error || data?.error) { showToast({ title: "Error", message: await extractFnError(error, data), type: "error" }); return false; }
    setAllStaff(prev => prev.map(m => m.user_id === userId ? { ...m, role: newRole } : m));
    return true;
  }

  async function executeSuspendToggle(userId: string, isSuspended: boolean) {
    const { data, error } = await supabase.functions.invoke("employees-update", {
      body: { workspace_id: activeWorkspaceId, user_id: userId, is_suspended: !isSuspended },
    });
    if (error || data?.error) { showToast({ title: "Error", message: await extractFnError(error, data), type: "error" }); return; }
    setAllStaff(prev => prev.map(m => m.user_id === userId ? { ...m, is_suspended: !isSuspended } : m));
  }

  function handleSuspend(member: StaffMember) {
    const isSuspended = member.is_suspended;
    showAlert(
      isSuspended ? "Reactivate Staff" : "Suspend Staff",
      isSuspended
        ? `Reactivate ${member.full_name}? They will regain POS access with their current role.`
        : `Suspend ${member.full_name}?\n\nThey will immediately lose POS access. Past orders and reports remain linked. You can reactivate them anytime.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isSuspended ? "Reactivate" : "Suspend",
          style: isSuspended ? "default" : "destructive",
          onPress: () => { void executeSuspendToggle(member.user_id, isSuspended); },
        },
      ],
    );
  }

  async function executeArchive(userId: string) {
    const { data, error } = await supabase.functions.invoke("employees-remove", {
      body: { workspace_id: activeWorkspaceId, user_id: userId },
    });
    if (error || data?.error) { showToast({ title: "Error", message: await extractFnError(error, data), type: "error" }); return; }
    setAllStaff(prev => prev.map(m => m.user_id === userId ? { ...m, is_archived: true, is_suspended: false } : m));
    onSelectionCleared();
  }

  function handleArchive(member: StaffMember) {
    showAlert(
      "Archive Staff",
      `Archive ${member.full_name}?\n\nThey will lose POS access permanently. All activity history is preserved. You can restore them later if needed.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Archive", style: "destructive", onPress: () => { void executeArchive(member.user_id); } },
      ],
    );
  }

  async function executeRestore(userId: string) {
    const { data, error } = await supabase.functions.invoke("employees-update", {
      body: { workspace_id: activeWorkspaceId, user_id: userId, is_archived: false, is_suspended: false },
    });
    if (error || data?.error) { showToast({ title: "Error", message: await extractFnError(error, data), type: "error" }); return; }
    setAllStaff(prev => prev.map(m => m.user_id === userId ? { ...m, is_archived: false, is_suspended: false } : m));
    onSelectionCleared();
  }

  function handleRestore(member: StaffMember) {
    showAlert(
      "Restore Staff",
      `Restore ${member.full_name}? They will regain POS access with their previous role.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Restore", onPress: () => { void executeRestore(member.user_id); } },
      ],
    );
  }

  async function changePin(userId: string, newPin: string): Promise<boolean> {
    setPinSaving(true);
    const { data, error } = await supabase.functions.invoke("staff-reset-pin", {
      body: { workspace_id: activeWorkspaceId, user_id: userId, new_pin: newPin },
    });
    setPinSaving(false);
    if (error || data?.error) { showToast({ title: "Error", message: await extractFnError(error, data), type: "error" }); return false; }
    return true;
  }

  async function addStaff(form: { name: string; username: string; pin: string; role: WorkspaceRole }): Promise<boolean> {
    const name = form.name.trim();
    const uname = form.username.trim().toLowerCase();
    const pin = form.pin.trim();
    if (!name || !uname || !pin) return false;
    setAdding(true); setAddError("");
    const { data, error } = await supabase.functions.invoke("staff-create", {
      body: { workspace_id: activeWorkspaceId, full_name: name, username: uname, pin, role: form.role },
    });
    setAdding(false);
    if (error || data?.error) { setAddError(await extractFnError(error, data)); return false; }
    await fetchStaff();
    showToast({ title: "Staff Added", message: `${name} (@${uname}) can now log in to the POS.`, type: "success" });
    return true;
  }

  return {
    roleChanging, confirmRoleChange,
    handleSuspend, handleArchive, handleRestore,
    pinSaving, changePin,
    adding, addError, setAddError, addStaff,
  };
}

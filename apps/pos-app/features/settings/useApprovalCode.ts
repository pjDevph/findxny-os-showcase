import { useCallback, useEffect, useState } from "react";
import { invokeFn } from "../../services/supabase";
import { useAppAlert } from "../ui/AppAlertProvider";
import { useToast } from "../ui/ToastProvider";

export function useApprovalCode(activeWorkspaceId: string | null | undefined, enabled: boolean) {
  const { showAlert } = useAppAlert();
  const { showToast } = useToast();

  const [hasApprovalCode, setHasApprovalCode] = useState(false);
  const [approvalCodeLoading, setApprovalCodeLoading] = useState(false);
  const [newApprovalCode, setNewApprovalCode] = useState("");
  const [savingApprovalCode, setSavingApprovalCode] = useState(false);

  const loadApprovalCodeStatus = useCallback(async () => {
    if (!activeWorkspaceId || !enabled) return;
    setApprovalCodeLoading(true);
    const { data } = await invokeFn<{ has_code: boolean }>("workspace-approval-code", {
      action: "status", workspace_id: activeWorkspaceId,
    });
    setHasApprovalCode(!!data?.has_code);
    setApprovalCodeLoading(false);
  }, [activeWorkspaceId, enabled]);

  useEffect(() => { loadApprovalCodeStatus(); }, [loadApprovalCodeStatus]);

  async function saveApprovalCode() {
    if (!activeWorkspaceId || !newApprovalCode.trim()) return;
    setSavingApprovalCode(true);
    const { data, error } = await invokeFn<{ has_code: boolean }>("workspace-approval-code", {
      action: "set", workspace_id: activeWorkspaceId, code: newApprovalCode.trim(),
    });
    setSavingApprovalCode(false);
    if (error) {
      showToast({ title: "Error", message: error.message, type: "error" });
      return;
    }
    setHasApprovalCode(!!data?.has_code);
    setNewApprovalCode("");
    showToast({ title: "Saved", message: "Approval code updated.", type: "success" });
  }

  function clearApprovalCode() {
    showAlert(
      "Clear Approval Code?",
      "Managers and cashiers won't be able to authorise refunds, void orders, or item cancellations until a new code is set.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear", style: "destructive",
          onPress: async () => {
            if (!activeWorkspaceId) return;
            setSavingApprovalCode(true);
            const { data, error } = await invokeFn<{ has_code: boolean }>("workspace-approval-code", {
              action: "set", workspace_id: activeWorkspaceId,
            });
            setSavingApprovalCode(false);
            if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
            setHasApprovalCode(!!data?.has_code);
            setNewApprovalCode("");
            showToast({ title: "Cleared", message: "Approval code removed.", type: "success" });
          },
        },
      ],
    );
  }

  return {
    hasApprovalCode, approvalCodeLoading, newApprovalCode, setNewApprovalCode, savingApprovalCode,
    saveApprovalCode, clearApprovalCode,
  };
}

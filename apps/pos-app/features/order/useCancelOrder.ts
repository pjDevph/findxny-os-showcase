import { useState } from "react";
import { invokeFn } from "../../services/supabase";
import type { ManagerApprovalCreateResponse } from "./types";

interface ToastOpts { title: string; message: string; type: "error" | "success" | "info" }

interface Args {
  activeWorkspaceId: string | null | undefined;
  activeBranchId: string | null | undefined;
  isSelfApprover: boolean;
  getOrderId: () => string | null | undefined;
  onCancelled: () => void;
  showToast: (msg: string) => void;
  showAppToast: (opts: ToastOpts) => void;
}

/** Cancel flow for a loaded ticket / order being edited, including the
 *  manager-approval override needed when the kitchen has already started it. */
export function useCancelOrder({ activeWorkspaceId, activeBranchId, isSelfApprover, getOrderId, onCancelled, showToast, showAppToast }: Args) {
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelApprovalId, setCancelApprovalId] = useState<string | null>(null);
  const [showCancelApprovalModal, setShowCancelApprovalModal] = useState(false);

  async function confirmCancelOrder(managerApprovalId?: string) {
    const orderId = getOrderId();
    if (!orderId || !activeWorkspaceId) return;
    setCancelling(true);
    try {
      const { error } = await invokeFn("orders-cancel", {
        workspace_id: activeWorkspaceId,
        order_id: orderId,
        reason: cancelReason.trim() || undefined,
        ...(managerApprovalId ? { manager_approval_id: managerApprovalId } : {}),
      });
      if (error) {
        if (error.message?.includes("ORDER_IN_PREPARATION")) {
          setCancelling(false);
          await requestCancelApproval();
          return;
        }
        if (error.message?.includes("409") || error.message?.toLowerCase().includes("conflict")) {
          showAppToast({ title: "Cannot Cancel", message: error.message, type: "error" });
        } else {
          throw error;
        }
        return;
      }
      setCancelModalVisible(false);
      setCancelReason("");
      showToast("Order cancelled");
      onCancelled();
    } catch (e: any) {
      showAppToast({ title: "Cancel failed", message: e?.message ?? "Unknown error", type: "error" });
    } finally {
      setCancelling(false);
    }
  }

  // Kitchen has already started this order — request (and, for owner/admin/
  // manager, self-approve) a manager override, then retry the cancel.
  async function requestCancelApproval() {
    const orderId = getOrderId();
    if (!orderId || !activeWorkspaceId || !activeBranchId) return;
    const { data, error } = await invokeFn<ManagerApprovalCreateResponse>("manager-approval-create", {
      workspace_id: activeWorkspaceId, branch_id: activeBranchId,
      action_type: "void_order", target_type: "order", target_id: orderId,
      reason: cancelReason.trim() || "Cashier requested cancel — kitchen already started",
    });
    if (error || !data?.approval?.id) {
      showAppToast({ title: "Error", message: error?.message ?? "Could not request approval.", type: "error" });
      return;
    }
    const approvalId = data.approval.id;
    if (isSelfApprover) {
      const { data: vData, error: vErr } = await invokeFn<{ approval: { id: string; status: string } | null; message?: string }>(
        "manager-approval-verify",
        { workspace_id: activeWorkspaceId, approval_id: approvalId, action: "approve" },
      );
      if (vErr || vData?.approval?.status !== "approved") {
        showAppToast({ title: "Approval Rejected", message: vData?.message ?? vErr?.message ?? "Manager approval was not granted.", type: "error" });
        return;
      }
      await confirmCancelOrder(approvalId);
    } else {
      setCancelApprovalId(approvalId);
      setShowCancelApprovalModal(true);
    }
  }

  return {
    cancelModalVisible, setCancelModalVisible,
    cancelReason, setCancelReason,
    cancelling, cancelApprovalId,
    showCancelApprovalModal, setShowCancelApprovalModal,
    confirmCancelOrder,
  };
}

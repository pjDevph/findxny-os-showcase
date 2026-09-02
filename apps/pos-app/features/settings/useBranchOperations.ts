import { useCallback, useEffect, useState } from "react";
import { invokeFn } from "../../services/supabase";
import { useToast } from "../ui/ToastProvider";
import type { Branch, BranchRow, RegisterRow } from "./types";

export function useBranchOperations(activeWorkspaceId: string | null | undefined, enabled: boolean) {
  const { showToast } = useToast();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [togglingBranch, setTogglingBranch] = useState<string | null>(null);

  const [registersByBranch, setRegistersByBranch] = useState<Record<string, RegisterRow[]>>({});
  const [registersLoading, setRegistersLoading] = useState<Record<string, boolean>>({});
  const [newRegisterName, setNewRegisterName] = useState<Record<string, string>>({});
  const [savingRegister, setSavingRegister] = useState<string | null>(null);

  const loadBranches = useCallback(async () => {
    if (!activeWorkspaceId || !enabled) return;
    setBranchesLoading(true);
    const { data: raw } = await invokeFn<{ "settings-branches": BranchRow[] }>("pos-data", { workspace_id: activeWorkspaceId, resource: "settings-branches", params: { workspace_id: activeWorkspaceId } });
    const data = raw?.["settings-branches"] ?? null;
    setBranches(
      (data ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        accepting_orders: Boolean(b.accepting_orders),
        accepting_bookings: Boolean(b.accepting_bookings),
      })),
    );
    setBranchesLoading(false);
  }, [activeWorkspaceId, enabled]);

  useEffect(() => { loadBranches(); }, [loadBranches]);

  const loadRegisters = useCallback(async (branchId: string) => {
    if (!activeWorkspaceId) return;
    setRegistersLoading((p) => ({ ...p, [branchId]: true }));
    const { data } = await invokeFn<{ registers: RegisterRow[] }>("branch-registers", {
      action: "list", workspace_id: activeWorkspaceId, branch_id: branchId,
    });
    setRegistersByBranch((p) => ({ ...p, [branchId]: data?.registers ?? [] }));
    setRegistersLoading((p) => ({ ...p, [branchId]: false }));
  }, [activeWorkspaceId]);

  async function addRegister(branchId: string) {
    const name = (newRegisterName[branchId] ?? "").trim();
    if (!name || !activeWorkspaceId) return;
    setSavingRegister(branchId);
    const { data, error } = await invokeFn<{ register: RegisterRow }>("branch-registers", {
      action: "create", workspace_id: activeWorkspaceId, branch_id: branchId, name,
    });
    setSavingRegister(null);
    if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
    if (data?.register) {
      setRegistersByBranch((p) => ({ ...p, [branchId]: [...(p[branchId] ?? []), data.register] }));
      setNewRegisterName((p) => ({ ...p, [branchId]: "" }));
    }
  }

  async function setRegisterActive(branchId: string, registerId: string, isActive: boolean) {
    if (!activeWorkspaceId) return;
    setSavingRegister(registerId);
    const { data, error } = await invokeFn<{ register: RegisterRow }>("branch-registers", {
      action: "set_active", workspace_id: activeWorkspaceId, register_id: registerId, is_active: isActive,
    });
    setSavingRegister(null);
    if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
    if (data?.register) {
      setRegistersByBranch((p) => ({
        ...p,
        [branchId]: (p[branchId] ?? []).map((r) => (r.id === registerId ? data.register : r)),
      }));
    }
  }

  async function toggleBranchField(
    branchId: string,
    field: "accepting_orders" | "accepting_bookings",
    newVal: boolean,
  ) {
    if (togglingBranch) return;
    setTogglingBranch(`${branchId}-${field}`);
    setBranches((prev) => prev.map((b) => (b.id === branchId ? { ...b, [field]: newVal } : b)));
    const { error } = await invokeFn("branches-toggle", {
      workspace_id: activeWorkspaceId,
      branch_id: branchId,
      [field]: newVal,
    });
    if (error) {
      setBranches((prev) => prev.map((b) => (b.id === branchId ? { ...b, [field]: !newVal } : b)));
      showToast({ title: "Error", message: error.message, type: "error" });
    }
    setTogglingBranch(null);
  }

  return {
    branches, branchesLoading, togglingBranch, toggleBranchField,
    registersByBranch, registersLoading, newRegisterName, setNewRegisterName, savingRegister,
    loadRegisters, addRegister, setRegisterActive,
  };
}

import { useCallback, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { invokeFn, isNetworkError } from "../../services/supabase";
import type { RegisterInfo } from "./types";

export function useRegisters(activeWorkspaceId: string | null | undefined, activeBranchId: string | null | undefined) {
  const [registers, setRegisters] = useState<RegisterInfo[]>([]);
  const [registersLoading, setRegistersLoading] = useState(false);
  const [selectedRegisterId, setSelectedRegisterId] = useState<string | null>(null);

  const refreshRegisters = useCallback(async () => {
    if (!activeWorkspaceId || !activeBranchId) return;
    const cacheKey = `pos_registers_v1_${activeWorkspaceId}_${activeBranchId}`;
    setRegistersLoading(true);
    try {
      const { data, error } = await invokeFn<{ registers: RegisterInfo[] }>("pos-shift", {
        action: "list_registers", workspace_id: activeWorkspaceId, branch_id: activeBranchId,
      });
      // A failed/offline fetch used to fall through to `?? []`, wiping the
      // register list (Imin 1, Imin 2, Insa…) to nothing offline — "No
      // registers configured," indistinguishable from a genuinely empty
      // branch. openShift() itself already refuses to run offline, so this
      // cached list is read-only (for picking which register you're on
      // before reconnecting) — the `openShift` per-register status embedded
      // in it can go stale, same tradeoff as every other offline cache here.
      if (isNetworkError(error)) {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          try { setRegisters(JSON.parse(cached) as RegisterInfo[]); } catch { setRegisters([]); }
        } else {
          setRegisters([]);
        }
        return;
      }
      const rows = data?.registers ?? [];
      setRegisters(rows);
      AsyncStorage.setItem(cacheKey, JSON.stringify(rows)).catch(() => {});
    } catch {
      setRegisters([]);
    } finally {
      setRegistersLoading(false);
    }
  }, [activeWorkspaceId, activeBranchId]);

  return { registers, registersLoading, selectedRegisterId, setSelectedRegisterId, refreshRegisters };
}

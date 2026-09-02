import { useCallback, useEffect, useMemo, useState } from "react";
import { invokeFn } from "../../services/supabase";
import type { StaffListRow, StaffMember, StatusTab, WorkspaceRole } from "./types";

export function useStaffList(activeWorkspaceId: string | null | undefined) {
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const fetchStaff = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    const { data, error } = await invokeFn<{ "staff-list": StaffListRow[] }>(
      "pos-data", { workspace_id: activeWorkspaceId, resource: "staff-list" },
    );
    if (error) {
      setLoadError(error.message);
    } else {
      setLoadError("");
      setAllStaff(((data?.["staff-list"]) ?? []).map(m => ({
        user_id: m.user_id,
        username: m.profiles?.username ?? "",
        full_name: m.profiles?.full_name ?? "Unknown",
        role: m.role,
        branch_id: m.branch_id,
        created_at: m.created_at,
        is_archived: m.is_archived ?? false,
        is_suspended: m.is_suspended ?? false,
      })));
    }
    setLoading(false);
  }, [activeWorkspaceId]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const [statusTab, setStatusTab] = useState<StatusTab>("active");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<WorkspaceRole | "all">("all");

  const filtered = useMemo(() => {
    let list: StaffMember[];
    if (statusTab === "active") list = allStaff.filter(m => !m.is_archived && !m.is_suspended);
    else if (statusTab === "suspended") list = allStaff.filter(m => m.is_suspended && !m.is_archived);
    else list = allStaff.filter(m => m.is_archived);
    if (roleFilter !== "all") list = list.filter(m => m.role === roleFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m =>
        m.full_name.toLowerCase().includes(q) || m.username.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allStaff, statusTab, roleFilter, search]);

  const stats = useMemo(() => ({
    total: allStaff.length,
    active: allStaff.filter(m => !m.is_archived && !m.is_suspended).length,
    suspended: allStaff.filter(m => m.is_suspended && !m.is_archived).length,
    archived: allStaff.filter(m => m.is_archived).length,
    noUsername: allStaff.filter(m => !m.username && !m.is_archived).length,
  }), [allStaff]);

  return {
    allStaff, setAllStaff, loading, loadError, fetchStaff,
    statusTab, setStatusTab, search, setSearch, roleFilter, setRoleFilter,
    filtered, stats,
  };
}

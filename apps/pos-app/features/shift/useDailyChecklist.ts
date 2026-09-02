import { useCallback, useEffect, useState } from "react";
import { invokeFn } from "../../services/supabase";
import type { Checklist } from "./types";

export function useDailyChecklist(activeWorkspaceId: string | null | undefined, shiftId: string | null) {
  const [checklists, setChecklists] = useState<Checklist[]>([]);

  const loadChecklists = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const { data } = await invokeFn<{ checklists: Checklist[] }>("tasks-list", {
        workspace_id: activeWorkspaceId,
        date: today,
      });
      setChecklists(data?.checklists ?? []);
    } catch { /* silently ignore */ }
  }, [activeWorkspaceId]);

  useEffect(() => { void loadChecklists(); }, [loadChecklists]);

  const handleCompleteItem = useCallback(async (checklistId: string, itemId: string, alreadyDone: boolean) => {
    if (alreadyDone || !activeWorkspaceId) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      await invokeFn("tasks-complete-item", {
        workspace_id: activeWorkspaceId,
        checklist_id: checklistId,
        item_id: itemId,
        shift_id: shiftId ?? undefined,
        date: today,
      });
      setChecklists(prev => prev.map(cl =>
        cl.id === checklistId
          ? { ...cl, items: (cl.items ?? []).map((it) => it.id === itemId ? { ...it, completed: true } : it) }
          : cl,
      ));
    } catch { /* silently ignore */ }
  }, [activeWorkspaceId, shiftId]);

  return { checklists, loadChecklists, handleCompleteItem };
}

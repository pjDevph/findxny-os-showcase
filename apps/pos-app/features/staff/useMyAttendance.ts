import { useCallback, useEffect, useState } from "react";
import { invokeFn } from "../../services/supabase";
import { useToast } from "../ui/ToastProvider";

interface AttendanceRecord { id: string; clock_in: string; clock_out: string | null }

export function useMyAttendance(activeWorkspaceId: string | null | undefined, userId: string | undefined) {
  const { showToast } = useToast();
  const [myAttendance, setMyAttendance] = useState<AttendanceRecord | null>(null);
  const [attendanceBusy, setAttendanceBusy] = useState(false);

  const fetchMyAttendance = useCallback(async () => {
    if (!activeWorkspaceId || !userId) return;
    const { data } = await invokeFn<{ records: AttendanceRecord[] }>(
      "attendance-clock", { workspace_id: activeWorkspaceId, action: "list", user_id: userId },
    );
    const records = data?.records ?? [];
    setMyAttendance(records.find(r => !r.clock_out) ?? records[0] ?? null);
  }, [activeWorkspaceId, userId]);

  useEffect(() => { fetchMyAttendance(); }, [fetchMyAttendance]);

  async function handleClockIn() {
    if (!activeWorkspaceId) return;
    setAttendanceBusy(true);
    const { data, error } = await invokeFn<{ record: AttendanceRecord }>(
      "attendance-clock", { workspace_id: activeWorkspaceId, action: "clock_in" },
    );
    if (error) showToast({ title: "Clock in failed", message: error.message, type: "error" });
    else { setMyAttendance(data?.record ?? null); showToast({ title: "Clocked in", message: "Have a great shift!", type: "success" }); }
    setAttendanceBusy(false);
  }

  async function handleClockOut() {
    if (!activeWorkspaceId || !myAttendance) return;
    setAttendanceBusy(true);
    const { data, error } = await invokeFn<{ record: AttendanceRecord }>(
      "attendance-clock", { workspace_id: activeWorkspaceId, action: "clock_out", record_id: myAttendance.id },
    );
    if (error) showToast({ title: "Clock out failed", message: error.message, type: "error" });
    else { setMyAttendance(data?.record ?? null); showToast({ title: "Clocked out", message: "See you next shift!", type: "success" }); }
    setAttendanceBusy(false);
  }

  return { myAttendance, attendanceBusy, handleClockIn, handleClockOut };
}

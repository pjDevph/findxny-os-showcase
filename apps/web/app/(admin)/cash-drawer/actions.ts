"use server";
import { adminApi } from "@/lib/admin-api";

export async function fetchCashDrawerDay(workspaceId: string, date: string) {
  return adminApi.cashDrawerGetDay({ workspace_id: workspaceId, date });
}

export async function setCashDrawerStartingCash(workspaceId: string, date: string, startingCash: number) {
  return adminApi.cashDrawerSetStartingCash({ workspace_id: workspaceId, date, starting_cash: startingCash });
}

export async function addCashDrawerEntry(
  workspaceId: string,
  date: string,
  input: { kind: "cash_in" | "expense"; label: string; amount: number; remarks?: string | null; expense_type?: "Cash" | "Non-Cash" | null },
) {
  return adminApi.cashDrawerAddEntry({ workspace_id: workspaceId, date, ...input });
}

export async function removeCashDrawerEntry(workspaceId: string, entryId: string) {
  return adminApi.cashDrawerRemoveEntry({ workspace_id: workspaceId, entry_id: entryId });
}

export async function setCashDrawerManualOverride(workspaceId: string, date: string, netCashManual: number | null) {
  return adminApi.cashDrawerSetManualOverride({ workspace_id: workspaceId, date, net_cash_manual: netCashManual });
}

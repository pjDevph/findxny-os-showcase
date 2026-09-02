"use server";
import { adminApi } from "@/lib/admin-api";

export async function fetchRefunds(
  workspaceId: string,
  params: {
    date_from?: string;
    date_to?: string;
    refund_type?: "cash" | "xendit" | "all";
    page?: number;
    per_page?: number;
  } = {},
) {
  return adminApi.refunds(workspaceId, params);
}

import { canAccessPosRoute } from "../auth/rolePermissions";
import { TAB_LABELS, type WorkspaceRole } from "./types";

export function initials(name: string) {
  return name.split(" ").map(w => w[0]?.toUpperCase() ?? "").slice(0, 2).join("") || "?";
}

export function generatePIN(): string {
  const digits = Math.floor(100000 + Math.random() * 900000).toString(); // NOSONAR - non-security randomness
  return digits;
}

export function getRoleAccessSummary(role: WorkspaceRole): string {
  const keys = Object.keys(TAB_LABELS).filter(k => canAccessPosRoute(role, k));
  return keys.slice(0, 5).map(k => TAB_LABELS[k]).join(", ")
    + (keys.length > 5 ? ` +${keys.length - 5} more` : "");
}

interface FnErrorPayload {
  error?: string | { message?: string } | null;
}

export async function extractFnError(error: unknown, data: FnErrorPayload | null | undefined): Promise<string> {
  const errVal = data?.error;
  let msg: string = typeof errVal === "string" ? errVal : (errVal?.message ?? "");
  if (!msg && error) {
    try {
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
      msg = (await ctx?.json?.())?.error ?? "";
    } catch { /* ignore */ }
  }
  return msg || (error instanceof Error ? error.message : "Failed");
}

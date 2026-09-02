import { supabase } from "./supabase";

export type WorkspaceRole = "owner" | "admin" | "manager" | "cashier" | "kitchen";

export interface MembershipRow {
  workspace_id: string;
  role: WorkspaceRole;
  branch_id: string | null;
  workspaces: { id: string; name: string; slug: string; currency: string };
}

export async function listMyWorkspaces(): Promise<MembershipRow[]> {
  const { data, error } = await supabase()
    .from("workspace_members")
    .select("workspace_id, role, branch_id, workspaces(id, name, slug, currency)");
  if (error) throw error;
  return (data ?? []) as unknown as MembershipRow[];
}

const ADMIN_ROLES: WorkspaceRole[] = ["owner", "admin", "manager"];
export const isAdminRole = (r?: WorkspaceRole | null) => !!r && ADMIN_ROLES.includes(r);

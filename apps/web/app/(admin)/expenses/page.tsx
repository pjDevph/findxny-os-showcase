import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceId } from "@/lib/admin-api";
import ExpensesClient from "./ExpensesClient";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const wsId = await resolveWorkspaceId();

  if (!wsId) {
    return (
      <div className="admin-header">
        <div>
          <h1>Expenses</h1>
          <div className="sub">You must be a member of a workspace to view this page.</div>
        </div>
      </div>
    );
  }

  const supabase = createSupabaseServerClient();

  // Load branches and categories server-side for initial render
  const [{ data: branches }, { data: categories }] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name")
      .eq("workspace_id", wsId)
      .order("name"),
    supabase
      .from("expense_categories")
      .select("id, name, is_active, sort_order")
      .eq("workspace_id", wsId)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
  ]);

  return (
    <ExpensesClient
      workspaceId={wsId}
      initialBranches={branches ?? []}
      initialCategories={categories ?? []}
    />
  );
}

import { resolveWorkspaceId } from "@/lib/admin-api";
import { adminApi } from "@/lib/admin-api";
import RefundsClient from "./RefundsClient";

export const dynamic = "force-dynamic";

export default async function RefundsPage() {
  const wsId = await resolveWorkspaceId();

  if (!wsId) {
    return (
      <div className="admin-header">
        <div>
          <h1>Refunds</h1>
          <div className="sub">You must be a member of a workspace to view this page.</div>
        </div>
      </div>
    );
  }

  let initialData: { refunds: any[]; total_count: number; total_amount: number } = {
    refunds: [],
    total_count: 0,
    total_amount: 0,
  };
  let role = "";

  try {
    [initialData, { role }] = await Promise.all([
      adminApi.refunds(wsId, { page: 1, per_page: 50 }),
      adminApi.context(wsId),
    ]);
  } catch {
    // Render with empty data; client can retry
  }

  return <RefundsClient workspaceId={wsId} initialData={initialData} role={role} />;
}

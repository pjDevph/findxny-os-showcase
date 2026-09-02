import { resolveWorkspaceId } from "@/lib/admin-api";
import SuppliersClient from "./SuppliersClient";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const wsId = await resolveWorkspaceId();
  if (!wsId)
    return (
      <div className="admin-header">
        <div>
          <h1>Suppliers</h1>
        </div>
      </div>
    );
  return <SuppliersClient workspaceId={wsId} />;
}

import { resolveWorkspaceId } from "@/lib/admin-api";
import TasksClient from "./TasksClient";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const wsId = await resolveWorkspaceId();
  if (!wsId)
    return (
      <div className="admin-header">
        <div>
          <h1>Tasks</h1>
        </div>
      </div>
    );
  return <TasksClient workspaceId={wsId} />;
}

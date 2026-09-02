import { adminApi, resolveWorkspaceId } from "@/lib/admin-api";
import { ResourcesClient } from "./ResourcesClient";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const wsId = await resolveWorkspaceId();
  const [{ resources }, { branches }] = wsId
    ? await Promise.all([adminApi.resources(wsId), adminApi.branches(wsId)])
    : [{ resources: [] as any[] }, { branches: [] as any[] }];

  return (
    <ResourcesClient
      initialResources={resources}
      branches={branches}
      workspaceId={wsId ?? ""}
    />
  );
}

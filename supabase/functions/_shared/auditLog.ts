import { adminClient } from "./supabaseClient.ts";

export async function audit(params: {
  workspaceId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  const admin = adminClient();
  const { error } = await admin.from("audit_logs").insert({
    workspace_id: params.workspaceId,
    actor_id: params.actorId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    before: params.before ?? null,
    after: params.after ?? null,
  });
  if (error) console.error("audit insert failed:", error);
}

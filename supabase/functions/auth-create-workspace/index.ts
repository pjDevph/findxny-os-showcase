// POST /auth-create-workspace
// Creates a new workspace, the first branch, and assigns caller as 'owner'.
import { adminClient, userClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, Unauthorized, BadRequest } from "../_shared/errors.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace: z.object({
    name: z.string().min(2).max(120),
    slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, dashes"),
    currency: z.string().regex(/^[A-Z]{3}$/, "ISO 4217 currency code (e.g. USD, PHP)").default("USD"),
  }),
  branch: z.object({
    name: z.string().min(1).max(120),
    address: z.string().max(500).optional(),
  }),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw Unauthorized();
    const { data: userData, error: userErr } = await userClient(authHeader).auth.getUser();
    if (userErr || !userData.user) throw Unauthorized("Invalid session");

    const body = await parseBody(req, Body);
    const admin = adminClient();

    const { data: ws, error: wsErr } = await admin
      .from("workspaces")
      .insert({ name: body.workspace.name, slug: body.workspace.slug, currency: body.workspace.currency })
      .select()
      .single();
    if (wsErr) throw BadRequest(wsErr.message);

    const { data: branch, error: brErr } = await admin
      .from("branches")
      .insert({ workspace_id: ws.id, name: body.branch.name, address: body.branch.address ?? null })
      .select()
      .single();
    if (brErr) throw BadRequest(brErr.message);

    const { error: memErr } = await admin.from("workspace_members").insert({
      workspace_id: ws.id,
      user_id: userData.user.id,
      role: "owner",
      branch_id: branch.id,
    });
    if (memErr) throw BadRequest(memErr.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: ws.id, actorId: userData.user.id,
      action: "workspace.create", entityType: "workspace", entityId: ws.id,
      after: { workspace: ws, branch },
    }));

    return json({ workspace: ws, branch }, 201);
  } catch (err) { return handleError(err); }
});

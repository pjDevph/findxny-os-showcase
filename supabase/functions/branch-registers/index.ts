// POST /branch-registers — admin/owner CRUD for a branch's named registers
// (tills). Cashiers read the same data through pos-shift's list_registers
// action instead of this function — this one is management-only.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const List = z.object({
  action:       z.literal("list"),
  workspace_id: z.string().uuid(),
  branch_id:    z.string().uuid(),
});
const Create = z.object({
  action:       z.literal("create"),
  workspace_id: z.string().uuid(),
  branch_id:    z.string().uuid(),
  name:         z.string().trim().min(1).max(40),
});
const Rename = z.object({
  action:       z.literal("rename"),
  workspace_id: z.string().uuid(),
  register_id:  z.string().uuid(),
  name:         z.string().trim().min(1).max(40),
});
const SetActive = z.object({
  action:       z.literal("set_active"),
  workspace_id: z.string().uuid(),
  register_id:  z.string().uuid(),
  is_active:    z.boolean(),
});

const Body = z.discriminatedUnion("action", [List, Create, Rename, SetActive]);

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.ADMIN_ONLY);

    const admin = adminClient();

    if (body.action === "list") {
      const { data, error } = await admin.from("branch_registers")
        .select("id, name, is_active")
        .eq("workspace_id", body.workspace_id)
        .eq("branch_id", body.branch_id)
        .order("name", { ascending: true });
      if (error) throw BadRequest(error.message);
      return json({ registers: data ?? [] });
    }

    if (body.action === "create") {
      const { data, error } = await admin.from("branch_registers")
        .insert({ workspace_id: body.workspace_id, branch_id: body.branch_id, name: body.name })
        .select("id, name, is_active").single();
      if (error) throw BadRequest(error.message);
      EdgeRuntime.waitUntil(audit({
        workspaceId: body.workspace_id, actorId: ctx.userId,
        action: "branch_register.create", entityType: "branch_register", entityId: data.id,
        after: { name: data.name, branch_id: body.branch_id },
      }));
      return json({ register: data });
    }

    if (body.action === "rename") {
      const { data: existing } = await admin.from("branch_registers")
        .select("workspace_id, name").eq("id", body.register_id).maybeSingle();
      if (!existing || existing.workspace_id !== body.workspace_id) throw NotFound("Register not found");
      const { data, error } = await admin.from("branch_registers")
        .update({ name: body.name }).eq("id", body.register_id)
        .select("id, name, is_active").single();
      if (error) throw BadRequest(error.message);
      EdgeRuntime.waitUntil(audit({
        workspaceId: body.workspace_id, actorId: ctx.userId,
        action: "branch_register.rename", entityType: "branch_register", entityId: body.register_id,
        before: { name: existing.name }, after: { name: body.name },
      }));
      return json({ register: data });
    }

    // set_active
    const { data: existing } = await admin.from("branch_registers")
      .select("workspace_id, is_active").eq("id", body.register_id).maybeSingle();
    if (!existing || existing.workspace_id !== body.workspace_id) throw NotFound("Register not found");
    const { data, error } = await admin.from("branch_registers")
      .update({ is_active: body.is_active }).eq("id", body.register_id)
      .select("id, name, is_active").single();
    if (error) throw BadRequest(error.message);
    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: `branch_register.${body.is_active ? "activate" : "deactivate"}`,
      entityType: "branch_register", entityId: body.register_id,
      before: { is_active: existing.is_active }, after: { is_active: body.is_active },
    }));
    return json({ register: data });
  } catch (err) { return handleError(err); }
});

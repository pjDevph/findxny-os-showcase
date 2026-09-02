// POST /staff-create — create a POS staff account with name, username, and PIN.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  full_name:    z.string().min(1).max(80),
  username:     z.string().min(2).max(32).regex(/^[a-z0-9_]+$/, "lowercase letters, numbers, underscores only"),
  pin:          z.string().min(4).max(6).regex(/^\d+$/, "PIN must be numeric"),
  role:         z.enum(["admin", "manager", "cashier", "kitchen"]),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");

    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.ADMIN_ONLY);

    const admin = adminClient();

    const { data: existing } = await admin
      .from("profiles").select("id").eq("username", body.username).maybeSingle();
    if (existing) throw Conflict("Username already taken");

    // Synthetic email — users never see this
    const email = `${body.workspace_id}_${body.username}@staff.pos`;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password:      body.pin,
      email_confirm: true,
      user_metadata: { full_name: body.full_name },
    });
    if (createErr || !created?.user) throw BadRequest(createErr?.message ?? "Failed to create user");

    const targetId = created.user.id;

    await admin.from("profiles").upsert(
      { id: targetId, full_name: body.full_name, username: body.username, is_pos_staff: true },
      { onConflict: "id" },
    );

    const { error: memberErr } = await admin.from("workspace_members").insert({
      workspace_id: body.workspace_id,
      user_id:      targetId,
      role:         body.role,
    });
    if (memberErr) {
      await admin.auth.admin.deleteUser(targetId);
      throw BadRequest(memberErr.message);
    }

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "staff.create", entityType: "workspace_member", entityId: targetId,
      before: null,
      after: { full_name: body.full_name, username: body.username, role: body.role },
    }));

    return json({ user_id: targetId, username: body.username, full_name: body.full_name, role: body.role }, 201);
  } catch (err) { return handleError(err); }
});

// POST /employees-invite — invite or add a staff member to a workspace.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, Forbidden } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  email:        z.string().email(),
  role:         z.enum(["owner", "admin", "manager", "cashier", "kitchen"]),
  branch_id:    z.string().uuid().nullable().optional(),
  full_name:    z.string().optional(),
  // Optional POS access — if provided the user can also log into the POS app
  pos_username: z.string().min(2).max(32).regex(/^[a-z0-9_]+$/).optional(),
  pos_pin:      z.string().min(4).max(6).regex(/^\d+$/).optional(),
});

type BodyType = z.infer<typeof Body>;
type AdminClient = ReturnType<typeof adminClient>;

async function resolveTargetUser(
  admin: AdminClient, email: string, fullName: string | undefined,
): Promise<{ targetId: string; invited: boolean }> {
  const { data: existingId } = await admin.rpc("get_auth_user_id_by_email", { p_email: email });
  if (existingId) return { targetId: existingId, invited: false };

  const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: fullName ? { full_name: fullName } : undefined,
  });
  if (invErr || !inv?.user) throw BadRequest(invErr?.message ?? "Invite failed");
  return { targetId: inv.user.id, invited: true };
}

async function upsertProfileIfNew(
  admin: AdminClient, targetId: string, fullName: string | undefined, wasNewUser: boolean,
): Promise<void> {
  if (fullName && wasNewUser) {
    await admin.from("profiles").upsert({ id: targetId, full_name: fullName }, { onConflict: "id" });
  }
}

async function grantPosAccess(
  admin: AdminClient,
  targetId: string,
  pos_username: string,
  pos_pin: string,
): Promise<void> {
  // Check username isn't already taken by another user
  const { data: existing } = await admin
    .from("profiles").select("id").eq("username", pos_username).maybeSingle();
  if (existing && existing.id !== targetId) {
    throw BadRequest(`POS username "${pos_username}" is already taken`);
  }

  // Set password = PIN so the POS login can use email+PIN
  const { error: pwErr } = await admin.auth.admin.updateUserById(targetId, { password: pos_pin });
  if (pwErr) throw BadRequest(`Failed to set POS PIN: ${pwErr.message}`);

  // Mark as POS-capable in profile
  await admin.from("profiles").upsert(
    { id: targetId, username: pos_username, is_pos_staff: true },
    { onConflict: "id" },
  );
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.ADMIN_ONLY);

    if (body.role === "owner") throw Forbidden("Cannot assign owner role via invite");

    const admin = adminClient();
    const { targetId, invited } = await resolveTargetUser(admin, body.email, body.full_name);

    if (targetId === ctx.userId) throw BadRequest("Cannot modify your own membership via this endpoint");

    const { data: member, error: upsertErr } = await admin
      .from("workspace_members")
      .upsert(
        { workspace_id: body.workspace_id, user_id: targetId, role: body.role, branch_id: body.branch_id ?? null },
        { onConflict: "workspace_id,user_id" },
      )
      .select().single();
    if (upsertErr) throw BadRequest(upsertErr.message);

    await upsertProfileIfNew(admin, targetId, body.full_name, invited);

    if (body.pos_username && body.pos_pin) {
      await grantPosAccess(admin, targetId, body.pos_username, body.pos_pin);
    }

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "staff.invite", entityType: "workspace_member", entityId: targetId,
      after: { email: body.email, role: body.role, invited },
    }));

    return json({ member, user_id: targetId, invited }, 201);
  } catch (err) { return handleError(err); }
});

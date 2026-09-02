// POST /resources-upsert — create or update a bookable resource (room or amenity).
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const PhotoUrl = z.string().max(2000).refine(
  (s) => /^https?:\/\//.test(s) || s.startsWith("/") || /^[\w./-]+$/.test(s),
  "Photo must be a URL or storage path",
);

const Body = z.object({
  workspace_id:      z.string().uuid(),
  id:                z.string().uuid().optional(),
  name:              z.string().min(1).max(200),
  type:              z.enum(["room", "amenity"]),
  capacity:          z.number().int().positive().max(10_000).optional().nullable(),
  hourly_rate:       z.number().min(0).max(1_000_000).optional().default(0),
  branch_id:         z.string().uuid().optional().nullable(),
  active:            z.boolean().optional().default(true),
  // Listing fields
  nightly_rate:      z.number().min(0).max(1_000_000).optional().nullable(),
  short_description: z.string().max(500).optional().nullable(),
  description:       z.string().max(5000).optional().nullable(),
  base_pax:          z.number().int().positive().max(10_000).optional().nullable(),
  max_pax:           z.number().int().positive().max(10_000).optional().nullable(),
  extra_pax_fee:     z.number().min(0).max(1_000_000).optional().nullable(),
  security_deposit:  z.number().min(0).max(10_000_000).optional().nullable(),
  cleaning_fee:      z.number().min(0).max(1_000_000).optional().nullable(),
  check_in_time:     z.string().regex(TIME_RE).optional().nullable(),
  check_out_time:    z.string().regex(TIME_RE).optional().nullable(),
  inclusions:        z.array(z.string().max(200)).max(100).optional(),
  photos:            z.array(PhotoUrl).max(50).optional(),
  cover_photo:       PhotoUrl.optional().nullable(),
  house_rules:       z.string().max(5000).optional().nullable(),
  min_nights:        z.number().int().positive().max(365).optional().nullable(),
});

type BodyType = Awaited<ReturnType<typeof parseBody<typeof Body>>>;
type AdminClient = ReturnType<typeof adminClient>;
type Fields = Record<string, unknown>;
type AuditCtx = { userId: string };

async function updateResource(admin: AdminClient, body: BodyType, fields: Fields, ctx: AuditCtx) {
  const { data: existing } = await admin
    .from("bookable_resources").select("id, workspace_id").eq("id", body.id!).maybeSingle();
  if (!existing || existing.workspace_id !== body.workspace_id) throw NotFound("Resource not found");

  const { data: updated, error } = await admin
    .from("bookable_resources")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", body.id!).select().single();
  if (error) throw BadRequest(error.message);

  EdgeRuntime.waitUntil(audit({
    workspaceId: body.workspace_id, actorId: ctx.userId,
    action: "resource.update", entityType: "bookable_resource", entityId: body.id!,
    after: updated,
  }));
  return json({ resource: updated });
}

async function createResource(admin: AdminClient, body: BodyType, fields: Fields, ctx: AuditCtx) {
  const { data: created, error } = await admin
    .from("bookable_resources")
    .insert({ workspace_id: body.workspace_id, ...fields })
    .select().single();
  if (error) throw BadRequest(error.message);

  EdgeRuntime.waitUntil(audit({
    workspaceId: body.workspace_id, actorId: ctx.userId,
    action: "resource.create", entityType: "bookable_resource", entityId: created.id,
    after: created,
  }));
  return json({ resource: created }, 201);
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();

    const fields = {
      name:              body.name,
      type:              body.type,
      capacity:          body.capacity ?? null,
      hourly_rate:       body.hourly_rate ?? 0,
      branch_id:         body.branch_id ?? null,
      active:            body.active ?? true,
      nightly_rate:      body.nightly_rate ?? null,
      short_description: body.short_description ?? null,
      description:       body.description ?? null,
      base_pax:          body.base_pax ?? null,
      max_pax:           body.max_pax ?? null,
      extra_pax_fee:     body.extra_pax_fee ?? null,
      security_deposit:  body.security_deposit ?? null,
      cleaning_fee:      body.cleaning_fee ?? null,
      check_in_time:     body.check_in_time ?? null,
      check_out_time:    body.check_out_time ?? null,
      inclusions:        body.inclusions ?? [],
      photos:            body.photos ?? [],
      cover_photo:       body.cover_photo ?? null,
      house_rules:       body.house_rules ?? null,
      min_nights:        body.min_nights ?? 1,
    };

    if (body.id) return await updateResource(admin, body, fields, ctx);
    return await createResource(admin, body, fields, ctx);
  } catch (err) { return handleError(err); }
});

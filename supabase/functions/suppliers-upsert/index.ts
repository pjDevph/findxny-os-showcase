// POST /suppliers-upsert — create or update a supplier.
// Pass supplier_id to update an existing record; omit it to create.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id:  z.string().uuid(),
  supplier_id:   z.string().uuid().optional(),
  name:          z.string().min(1),
  contact_name:  z.string().optional(),
  phone:         z.string().optional(),
  email:         z.string().email().optional(),
  address:       z.string().optional(),
  notes:         z.string().optional(),
  is_active:     z.boolean().optional().default(true),
});

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.CATALOG_WRITE);

    const admin = adminClient();

    if (body.supplier_id) {
      // ── Update ────────────────────────────────────────────────────────────
      const { data: existing, error: fetchErr } = await admin
        .from("suppliers")
        .select("*")
        .eq("id", body.supplier_id)
        .maybeSingle();
      if (fetchErr) throw BadRequest(fetchErr.message);
      if (!existing || existing.workspace_id !== body.workspace_id) {
        throw NotFound("Supplier not found");
      }

      const patch = {
        name:         body.name.trim(),
        contact_name: body.contact_name ?? existing.contact_name,
        phone:        body.phone        ?? existing.phone,
        email:        body.email        ?? existing.email,
        address:      body.address      ?? existing.address,
        notes:        body.notes        ?? existing.notes,
        is_active:    body.is_active,
        updated_at:   new Date().toISOString(),
      };

      const { data: updated, error } = await admin
        .from("suppliers")
        .update(patch)
        .eq("id", body.supplier_id)
        .select()
        .single();
      if (error) throw BadRequest(error.message);

      EdgeRuntime.waitUntil(audit({
        workspaceId: body.workspace_id,
        actorId:     ctx.userId,
        action:      "supplier.update",
        entityType:  "supplier",
        entityId:    body.supplier_id,
        before:      existing,
        after:       updated,
      }));

      return json({ supplier: updated });
    } else {
      // ── Create ────────────────────────────────────────────────────────────
      const payload = {
        workspace_id: body.workspace_id,
        name:         body.name.trim(),
        contact_name: body.contact_name ?? null,
        phone:        body.phone        ?? null,
        email:        body.email        ?? null,
        address:      body.address      ?? null,
        notes:        body.notes        ?? null,
        is_active:    body.is_active,
      };

      const { data: created, error } = await admin
        .from("suppliers")
        .insert(payload)
        .select()
        .single();
      if (error) throw BadRequest(error.message);

      EdgeRuntime.waitUntil(audit({
        workspaceId: body.workspace_id,
        actorId:     ctx.userId,
        action:      "supplier.create",
        entityType:  "supplier",
        entityId:    created.id,
        before:      null,
        after:       created,
      }));

      return json({ supplier: created }, 201);
    }
  } catch (err) {
    return handleError(err);
  }
});

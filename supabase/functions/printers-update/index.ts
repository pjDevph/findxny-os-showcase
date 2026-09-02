// POST /printers-update — update name/type/connection/address on workspace_printers
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  printer_id:   z.string().uuid(),
  name:        z.string().min(1).max(200).optional(),
  type:        z.enum(["receipt", "label", "kitchen"]).optional(),
  connection:  z.enum(["builtin", "ethernet", "bluetooth", "usb", "network"]).optional(),
  mac_address: z.any(),
  ip_address:  z.any(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.ADMIN_ONLY);

    const admin = adminClient();

    function toAddressOrNull(v: unknown): string | null {
      return typeof v === "string" && v.trim() ? v.trim() : null;
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name       !== undefined) patch.name        = body.name;
    if (body.type       !== undefined) patch.type        = body.type;
    if (body.connection !== undefined) patch.connection  = body.connection;
    if ("mac_address" in body)         patch.mac_address = toAddressOrNull(body.mac_address);
    if ("ip_address"  in body)         patch.ip_address  = toAddressOrNull(body.ip_address);

    if (Object.keys(patch).length === 1) throw BadRequest("No fields to update");

    const { data: printer, error } = await admin
      .from("workspace_printers")
      .update(patch)
      .eq("workspace_id", body.workspace_id)
      .eq("id", body.printer_id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") throw NotFound("Printer not found");
      throw BadRequest(error.message);
    }

    return json({ ok: true, printer });
  } catch (err) { return handleError(err); }
});

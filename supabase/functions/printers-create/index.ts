// POST /printers-create — insert a new printer row into workspace_printers
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { parseBody, z } from "../_shared/validators.ts";

// mac_address/ip_address are bounded free-form strings rather than strict
// MAC/IP regexes: native device discovery overloads mac_address with USB
// device paths and platform-specific Bluetooth identifiers (e.g. iOS reports
// a CBPeripheral UUID, not a real MAC), and network printers may be
// addressed by hostname rather than a raw IPv4.
const Address = z.string().trim().min(1).max(255).nullable().optional().or(z.literal(""));

const Body = z.object({
  workspace_id: z.string().uuid(),
  name:         z.string().min(1).max(200),
  type:         z.enum(["receipt", "label", "kitchen"]),
  connection:   z.enum(["builtin", "ethernet", "bluetooth", "usb", "network"]),
  mac_address:  Address,
  ip_address:   Address,
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);

    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.ADMIN_ONLY);

    const admin = adminClient();

    const mac = body.mac_address || null;
    const ip  = body.ip_address || null;

    // Prevent duplicate address
    if (mac || ip) {
      const col = mac ? "mac_address" : "ip_address";
      const val = mac ?? ip;
      const { data: existing } = await admin
        .from("workspace_printers")
        .select("name")
        .eq("workspace_id", body.workspace_id)
        .eq(col, val)
        .single();
      if (existing) throw BadRequest(`A printer with this address already exists: "${(existing as any).name}". Remove it first or edit it instead.`);
    }

    const { data: printer, error } = await admin
      .from("workspace_printers")
      .insert({
        workspace_id: body.workspace_id,
        name:         body.name.trim(),
        type:         body.type,
        connection:   body.connection,
        mac_address:  mac,
        ip_address:   ip,
        is_enabled:   true,
        is_default:   false,
      })
      .select()
      .single();

    if (error) throw BadRequest(error.message);

    return json({ ok: true, printer }, 201);
  } catch (err) { return handleError(err); }
});

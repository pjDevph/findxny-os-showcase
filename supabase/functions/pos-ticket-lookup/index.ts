// POST /pos-ticket-lookup
// Cashier looks up a kiosk order by its ticket number (e.g. K-1042).
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  ticket_no:    z.string().min(1),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();

    const { data: order } = await admin
      .from("orders")
      .select("id, order_no, ticket_no, status, payment_status, subtotal, tax, total, table_no, notes, customer_id, created_at")
      .eq("workspace_id", body.workspace_id)
      .eq("ticket_no", body.ticket_no.trim().toUpperCase())
      .maybeSingle();

    if (!order) throw NotFound("Ticket not found");
    if (order.payment_status !== "pending_counter") {
      throw BadRequest(
        order.payment_status === "paid"
          ? "This order has already been paid."
          : "This order is not pending counter payment.",
      );
    }

    const { data: items } = await admin
      .from("order_items")
      .select("id, quantity, unit_price, total, notes, products(name)")
      .eq("order_id", order.id);

    let customer = null;
    if (order.customer_id) {
      const { data: c } = await admin
        .from("customers")
        .select("name, phone")
        .eq("id", order.customer_id)
        .maybeSingle();
      customer = c;
    }

    const formattedItems = (items ?? []).map((it: any) => ({
      id:         it.id,
      name:       it.products?.name ?? "Item",
      quantity:   it.quantity,
      unit_price: it.unit_price,
      total:      it.total,
      notes:      it.notes,
    }));

    return json({ order, items: formattedItems, customer });
  } catch (err) { return handleError(err); }
});

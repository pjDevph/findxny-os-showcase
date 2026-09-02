// POST /orders-update-pending
// Allows a cashier to modify a pending, unpaid order (items, quantities, notes, type, table, customer).
// Guards: status must be "pending" AND payment_status must NOT be "paid".
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { computePosOrderTotals, resolveRates } from "../_shared/orderPricing.ts";
import { createKitchenTickets } from "../_shared/kitchenTickets.ts";

const ItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity:   z.number().int().positive().max(99),
  item_notes: z.string().max(200).nullable().optional(),
});

const Body = z.object({
  workspace_id: z.string().uuid(),
  order_id:     z.string().uuid(),
  // All top-level order fields are optional — only provided fields are updated
  customer_id:  z.string().uuid().nullable().optional(),
  order_type:   z.string().optional(),
  table_name:   z.string().nullable().optional(),
  notes:        z.string().max(500).nullable().optional(),
  items:        z.array(ItemSchema).max(100).optional(),
});

type AdminClient = ReturnType<typeof adminClient>;

async function fetchOrderAndGuard(
  admin: AdminClient,
  orderId: string,
  workspaceId: string,
): Promise<Record<string, unknown>> {
  const { data: order, error } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw BadRequest(error.message);
  if (!order) throw NotFound("Order not found");

  if (order.status !== "pending") {
    throw Conflict(
      `Order cannot be edited: status is '${order.status}' (only pending orders can be modified)`,
    );
  }

  if (order.payment_status === "paid") {
    throw Conflict("Order cannot be edited: it has already been paid");
  }

  return order;
}

interface ResolvedProduct {
  id: string;
  price: number;
  kitchen_required: boolean;
  prep_station?: string | null;
  workspace_id: string;
  active: boolean;
}

/**
 * Re-derive unit_price from products.price server-side rather than trusting
 * the client — the client only ever sends product_id/quantity/notes.
 */
async function resolveItems(
  admin: AdminClient,
  workspaceId: string,
  items: { product_id: string; quantity: number; item_notes?: string | null }[],
): Promise<{
  rows: { product_id: string; quantity: number; unit_price: number; total: number; notes: string | null }[];
  subtotal: number;
  pMap: Map<string, ResolvedProduct>;
}> {
  if (items.length === 0) return { rows: [], subtotal: 0, pMap: new Map() };

  const productIds = [...new Set(items.map((i) => i.product_id))];
  const { data: products, error } = await admin
    .from("products")
    .select("id, price, kitchen_required, prep_station, workspace_id, active")
    .in("id", productIds);
  if (error) throw BadRequest(error.message);

  const pMap = new Map<string, ResolvedProduct>((products ?? []).map((p: any) => [p.id, p]));
  for (const p of products ?? []) {
    if (p.workspace_id !== workspaceId) throw BadRequest("Product not in workspace");
    if (!p.active) throw BadRequest(`Product ${p.id} inactive`);
  }

  let subtotal = 0;
  const rows = items.map((i) => {
    const product = pMap.get(i.product_id);
    if (!product) throw BadRequest(`Product ${i.product_id} not found`);
    const unit_price = Number(product.price);
    const total = +(unit_price * i.quantity).toFixed(2);
    subtotal += total;
    return { product_id: i.product_id, quantity: i.quantity, unit_price, total, notes: i.item_notes ?? null };
  });

  return { rows, subtotal, pMap };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== "POST") throw BadRequest("POST only");

    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();

    // ── 1. Fetch order and enforce guards ──────────────────────────────
    const order = await fetchOrderAndGuard(admin, body.order_id, body.workspace_id);

    // ── 2. Replace items if provided (atomic reverse+delete+reinsert RPC) ──
    let newItems: unknown[] = [];
    let subtotal: number | undefined;
    let pMap = new Map<string, ResolvedProduct>();

    if (body.items !== undefined) {
      const resolved = await resolveItems(admin, body.workspace_id, body.items);
      subtotal = resolved.subtotal;
      pMap = resolved.pMap;

      const { data: rpcResult, error: rpcErr } = await admin.rpc("update_pending_order_items", {
        p_order_id: body.order_id,
        p_items: resolved.rows,
      });
      if (rpcErr) {
        const msg = rpcErr.message ?? "Failed to update order items";
        const match = msg.match(/INSUFFICIENT_STOCK:\s*(.+)/);
        throw match ? Conflict(match[1]) : BadRequest(msg);
      }
      newItems = (rpcResult as { items: unknown[] }).items;

      // Regenerate kitchen tickets for the new item set — the RPC's delete of
      // the old order_items already cascade-deleted their kitchen_ticket_items,
      // leaving behind empty kitchen_tickets rows; clear those before recreating.
      await admin.from("kitchen_tickets").delete().eq("order_id", body.order_id);
      await createKitchenTickets(
        admin,
        { branchId: order.branch_id as string, workspaceId: body.workspace_id, orderId: body.order_id },
        newItems as { id: string; product_id: string }[],
        pMap,
      );
    } else {
      // No items change — fetch existing for the response
      const { data: existing } = await admin
        .from("order_items")
        .select("*")
        .eq("order_id", body.order_id);
      newItems = existing ?? [];
    }

    // ── 3. Build the orders row update payload ─────────────────────────
    const updatePayload: Record<string, unknown> = {};
    let voucherInvalidated = false;

    if (body.customer_id !== undefined) updatePayload.customer_id = body.customer_id;
    if (body.order_type  !== undefined) updatePayload.type        = body.order_type;
    if (body.table_name  !== undefined) updatePayload.table_no    = body.table_name;
    if (body.notes       !== undefined) updatePayload.notes       = body.notes;

    // Recompute subtotal/tax/discount/total together server-side when items
    // changed — previously only `total` was rewritten (via a bespoke,
    // tax-blind formula), leaving subtotal/tax stale and the row internally
    // inconsistent (total != subtotal + tax - discount).
    if (subtotal !== undefined) {
      let voucherPortion = 0;
      if (order.voucher_id) {
        const { data: redemption } = await admin
          .from("voucher_redemptions")
          .select("discount_amount")
          .eq("order_id", body.order_id)
          .maybeSingle();
        voucherPortion = Number(redemption?.discount_amount ?? 0);
      }

      let voucherDiscount = voucherPortion;
      if (order.voucher_id) {
        const { data: voucher } = await admin
          .from("vouchers")
          .select("min_spend")
          .eq("id", order.voucher_id as string)
          .maybeSingle();

        if (voucher && subtotal < Number(voucher.min_spend ?? 0)) {
          updatePayload.voucher_id   = null;
          updatePayload.voucher_code = null;
          voucherInvalidated = true;
          voucherDiscount = 0;
        }
      }

      // Reapply the order's existing (non-voucher) manual discount amount as-is
      // — this endpoint doesn't let the client change the discount itself, so
      // there's nothing new to re-validate against the large-discount
      // manager-approval gate here, only the tax/total math around it.
      const src = order.discount_source as string | null;
      let manualDiscountAmount = 0;
      if (src === "manual") {
        manualDiscountAmount = Number(order.discount ?? 0);
      } else if (src === "mixed") {
        manualDiscountAmount = Math.max(0, Number(order.discount ?? 0) - voucherPortion);
      }
      // src === "senior_pwd": computePosOrderTotals recomputes the 20% itself.
      // src === "voucher" / null: manual portion is 0.

      const { taxRate, svcRate } = await resolveRates(admin, body.workspace_id);
      const totals = computePosOrderTotals({
        subtotal,
        taxRate,
        svcRate,
        isSeniorPwd: Boolean(order.is_senior_pwd),
        manualDiscountAmount,
        voucherDiscount,
      });

      updatePayload.subtotal        = subtotal;
      updatePayload.tax             = totals.tax;
      updatePayload.service_fee     = totals.service_fee;
      updatePayload.discount        = totals.discount;
      updatePayload.discount_source = totals.discount_source;
      updatePayload.total           = totals.total;
    }

    // Always write updated_at (some Supabase setups don't auto-update it)
    updatePayload.updated_at = new Date().toISOString();

    const { data: updated, error: uErr } = await admin
      .from("orders")
      .update(updatePayload)
      // Optimistic concurrency: fetchOrderAndGuard already required 'pending'
      // above, but re-assert it here so a concurrent cancel (or anything else
      // that moves the order out of 'pending' between our read and this
      // write) makes this match zero rows instead of silently reapplying
      // edits to an order that's no longer editable.
      .eq("id", body.order_id)
      .eq("status", "pending")
      .select()
      .single();
    if (uErr) {
      if (uErr.code === "PGRST116") throw Conflict("Order was modified by another request — please retry");
      throw BadRequest(uErr.message);
    }

    // ── 4. Audit log ───────────────────────────────────────────────────
    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id,
      actorId:     ctx.userId,
      action:      "order.update_pending",
      entityType:  "order",
      entityId:    body.order_id,
      before:      order,
      after:       { order: updated, items: newItems },
    }));

    return json({ order: updated, items: newItems, voucher_invalidated: voucherInvalidated });
  } catch (err) {
    return handleError(err);
  }
});

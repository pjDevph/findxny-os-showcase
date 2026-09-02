// Shared helper: reverse stock deductions for one or more order_items,
// belonging to a cancelled/voided order (or a single cancelled line item).
//
// The sale deduction trigger (trg_deduct_stock_on_order_item) writes
// stock_movements rows with:
//   type   = 'sale'
//   reason = 'order_item:<order_item_id>'
//
// Idempotency is per order_item (not per order) — before reversing an item,
// check for an existing stock_movements row with
// reason LIKE 'order_item_void:<itemId>%'. This lets a whole-order cancel, a
// single-item cancel, and an item-set edit all call this safely without
// double-restoring stock for an item another caller already reversed.
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface ReversalCtx {
  workspaceId: string;
  branchId: string;
  orderId: string;
  itemId: string;
  suffix: string;
}

async function reverseStockForItem(
  admin: SupabaseClient,
  ctx: ReversalCtx,
): Promise<"reversed" | "skipped" | "nothing"> {
  const { data: existing } = await admin
    .from("stock_movements")
    .select("id")
    .like("reason", `order_item_void:${ctx.itemId}%`)
    .limit(1);
  if (existing && existing.length > 0) return "skipped";

  const { data: movements } = await admin
    .from("stock_movements")
    .select("inventory_item_id, quantity")
    .eq("reason", `order_item:${ctx.itemId}`)
    .eq("type", "sale");
  if (!movements || movements.length === 0) return "nothing";

  const totals = new Map<string, number>();
  for (const m of movements) {
    totals.set(m.inventory_item_id, (totals.get(m.inventory_item_id) ?? 0) + Number(m.quantity));
  }

  const { data: invItems } = await admin
    .from("inventory_items")
    .select("id, quantity")
    .in("id", Array.from(totals.keys()));
  const invItemById = new Map<string, { id: string; quantity: number }>();
  for (const inv of invItems ?? []) invItemById.set(inv.id, inv);

  let ok = true;
  for (const [itemInvId, qty] of totals) {
    const applied = await applyStockRestock(admin, ctx, invItemById.get(itemInvId), itemInvId, qty);
    if (!applied) ok = false;
  }
  return ok ? "reversed" : "nothing";
}

async function applyStockRestock(
  admin: SupabaseClient,
  ctx: ReversalCtx,
  invItem: { id: string; quantity: number } | undefined,
  invItemId: string,
  qty: number,
): Promise<boolean> {
  if (!invItem) return false;

  const { error: uErr } = await admin
    .from("inventory_items")
    .update({ quantity: Number(invItem.quantity) + qty, updated_at: new Date().toISOString() })
    .eq("id", invItemId);
  if (uErr) {
    console.error(`[reverseOrderStock] update failed for item ${invItemId}:`, uErr.message);
    return false;
  }

  const { error: mErr } = await admin.from("stock_movements").insert({
    workspace_id:      ctx.workspaceId,
    branch_id:         ctx.branchId,
    inventory_item_id: invItemId,
    type:              "in",
    quantity:          qty,
    reason:            `order_item_void:${ctx.itemId}:${ctx.suffix}`,
    order_id:          ctx.orderId,
  });
  if (mErr) {
    console.error(`[reverseOrderStock] movement insert failed for item ${invItemId}:`, mErr.message);
    return false;
  }
  return true;
}

/**
 * Given an order, returns the order_item ids that are safe to restore stock
 * for on a refund/void — i.e. items whose kitchen ticket(s) never reached
 * served/completed. Items with no kitchen ticket at all (never fired to the
 * kitchen, or a non-kitchen product like a drink) are treated as not-served
 * and included — mirrors the guard in order-items-cancel/index.ts.
 */
export async function getUnservedOrderItemIds(
  admin: SupabaseClient,
  orderId: string,
): Promise<string[]> {
  const { data: items } = await admin.from("order_items").select("id").eq("order_id", orderId);
  const itemIds = (items ?? []).map((i: { id: string }) => i.id);
  if (itemIds.length === 0) return [];

  const { data: ticketItems } = await admin
    .from("kitchen_ticket_items")
    .select("order_item_id, kitchen_tickets(kitchen_status)")
    .in("order_item_id", itemIds);

  const servedItemIds = new Set<string>();
  for (const kti of ticketItems ?? []) {
    const status = (kti as any).kitchen_tickets?.kitchen_status ?? "new";
    if (["served", "completed"].includes(status)) servedItemIds.add((kti as any).order_item_id);
  }

  return itemIds.filter((id) => !servedItemIds.has(id));
}

/**
 * @param orderItemIds Optional — restrict to these order_item ids. Defaults to
 *                     all of the order's current items (preserves the original
 *                     whole-order behavior for existing callers).
 * @returns `{ reversed: number, skipped: number }` — counts of items reversed
 *          vs. skipped because they were already reversed by another caller.
 */
export async function reverseOrderStock(
  admin: SupabaseClient,
  orderId: string,
  suffix: string,
  orderItemIds?: string[],
): Promise<{ reversed: number; skipped: number }> {
  const { data: order } = await admin
    .from("orders")
    .select("workspace_id, branch_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { reversed: 0, skipped: 0 };

  let targetIds = orderItemIds;
  if (!targetIds) {
    const { data: items } = await admin.from("order_items").select("id").eq("order_id", orderId);
    targetIds = (items ?? []).map((item: { id: string }) => item.id);
  }
  if (!targetIds || targetIds.length === 0) return { reversed: 0, skipped: 0 };

  let reversed = 0;
  let skipped = 0;
  for (const itemId of targetIds) {
    const result = await reverseStockForItem(admin, {
      workspaceId: order.workspace_id, branchId: order.branch_id, orderId, itemId, suffix,
    });
    if (result === "reversed") reversed++;
    else if (result === "skipped") skipped++;
  }

  return { reversed, skipped };
}

// Shared: group an order's items by prep station and create one kitchen
// ticket per station. Used at order creation and again when a pending
// order's items are edited (so the kitchen display doesn't silently lose
// ticket items on an edit).
import { adminClient } from "./supabaseClient.ts";

export interface KitchenTicketItem {
  id: string;
  product_id: string;
}

export interface KitchenTicketProduct {
  kitchen_required: boolean;
  prep_station?: string | null;
}

export async function createKitchenTickets(
  admin: ReturnType<typeof adminClient>,
  params: { branchId: string; workspaceId: string; orderId: string },
  insertedItems: KitchenTicketItem[],
  pMap: Map<string, KitchenTicketProduct>,
): Promise<void> {
  const byStation = new Map<string, KitchenTicketItem[]>();
  for (const it of insertedItems) {
    const p = pMap.get(it.product_id);
    // prep_station takes priority; fall back to kitchen_required for older products
    const station = p?.prep_station && p.prep_station !== "none"
      ? p.prep_station
      : (p?.kitchen_required ? "kitchen" : "none");
    if (station === "none") continue;
    const group = byStation.get(station) ?? [];
    group.push(it);
    byStation.set(station, group);
  }
  if (byStation.size === 0) return;

  for (const [station, items] of byStation) {
    const { data: ticket } = await admin.from("kitchen_tickets").insert({
      order_id: params.orderId, branch_id: params.branchId, workspace_id: params.workspaceId, station,
    }).select().single();
    if (ticket) {
      await admin.from("kitchen_ticket_items").insert(
        items.map((it) => ({ ticket_id: ticket.id, order_item_id: it.id })),
      );
    }
  }
}

/**
 * Pure roll-up: given every kitchen_status on an order's tickets, what
 * should the order's own status read as? 'completed' only once every ticket
 * is served/completed, 'ready' once every ticket has reached ready-or-later,
 * 'preparing' once any ticket has started, else 'pending'. Shared by
 * recomputeOrderStatus (writes it back to orders.status) and by
 * dashboard-live-orders/-counts in pos-data (which only need it for display,
 * to show an order's *real* kitchen state even when orders.status itself
 * has drifted — e.g. a payment confirmation that completed the sale before
 * the kitchen finished).
 */
export function deriveOrderStatusFromTicketStatuses(statuses: string[]): "pending" | "preparing" | "ready" | "completed" {
  const allDone    = statuses.every((s) => s === "served" || s === "completed");
  const allReady   = statuses.every((s) => s === "ready" || s === "served" || s === "completed");
  const anyStarted = statuses.some((s) => s !== "new");

  if (allDone) return "completed";
  if (allReady) return "ready";
  if (anyStarted) return "preparing";
  return "pending";
}

/**
 * Roll up an order's status from ALL of its kitchen tickets (not just the
 * one that just changed) and write it back — an order only reaches
 * 'completed' once every ticket is served/completed, matching
 * deriveOrderStatusFromTicketStatuses above. Previously each caller
 * (kitchen-update-status, pos-kitchen) wrote orders.status from only the
 * single ticket being updated, so a multi-station order (e.g. Kitchen +
 * Drinks) could get marked "completed" the moment just ONE of its tickets
 * was served, even while the other was still sitting untouched. No-op for a
 * cancelled order, or an order with no kitchen tickets at all (nothing to
 * roll up from — those orders complete on payment instead, see
 * payments-cash-confirm/pos-counter-pay).
 */
export async function recomputeOrderStatus(
  admin: ReturnType<typeof adminClient>,
  orderId: string,
): Promise<void> {
  const { data: tickets } = await admin
    .from("kitchen_tickets")
    .select("kitchen_status")
    .eq("order_id", orderId);
  if (!tickets || tickets.length === 0) return;

  const nextStatus = deriveOrderStatusFromTicketStatuses(tickets.map((t) => t.kitchen_status ?? "new"));

  await admin.from("orders")
    .update({ status: nextStatus })
    .eq("id", orderId)
    .neq("status", "cancelled");
}

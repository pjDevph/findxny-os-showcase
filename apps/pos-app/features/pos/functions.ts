import { invokeFn } from "../../services/supabase";

/**
 * Update items on a pending order (edit flow).
 * Calls the orders-update-pending edge function.
 */
export async function ordersUpdatePending(params: {
  orderId: string;
  workspaceId: string;
  items: { product_id: string; quantity: number; unit_price: number; notes?: string | null }[];
  orderType: string;
  tableNo: string | null;
  notes: string | null;
}): Promise<{ data: unknown; error: Error | null }> {
  return invokeFn<unknown>("orders-update-pending", {
    order_id:   params.orderId,
    workspace_id: params.workspaceId,
    items:      params.items,
    order_type: params.orderType,
    table_no:   params.tableNo ?? undefined,
    notes:      params.notes ?? undefined,
  });
}

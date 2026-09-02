"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceId } from "@/lib/admin-api";

async function invoke(name: string, body: unknown) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) {
    // FunctionsHttpError swallows the response body in `error.message`; pull
    // it out so the surfaced error reads as the edge function intended,
    // not just "Edge Function returned a non-2xx status code".
    let detail = "";
    try {
      const ctx = error.context;
      if (ctx?.json) detail = JSON.stringify(await ctx.json());
      else if (ctx?.text) detail = await ctx.text();
    } catch { /* ignore */ }
    const suffix = detail ? ` — ${detail}` : "";
    throw new Error(`${name}: ${error.message || "failed"}${suffix}`);
  }
  return data;
}

async function withWorkspace<T extends Record<string, unknown>>(extra: T) {
  const workspace_id = await resolveWorkspaceId();
  if (!workspace_id) throw new Error("No workspace context — not signed in or not a member.");
  return { workspace_id, ...extra };
}

export async function cancelOrder(orderId: string) {
  await invoke("orders-cancel", await withWorkspace({ order_id: orderId }));
  revalidatePath("/orders");
}

export async function managerCancelOrder(orderId: string) {
  const ws = await withWorkspace({ order_id: orderId });
  // Create approval, self-verify with session JWT, then cancel with the approval ID.
  const { data: ap } = await (async () => {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.functions.invoke("manager-approval-create", {
      body: { workspace_id: ws.workspace_id, action_type: "void_order", target_type: "order", target_id: orderId, reason: "Manager override — kitchen cancellation" },
    });
    if (error) throw new Error("Could not create approval");
    return { data: data as { approval: { id: string } } };
  })();
  const approvalId = ap?.approval?.id;
  if (!approvalId) throw new Error("Approval creation failed");
  const { data: vd } = await (async () => {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.functions.invoke("manager-approval-verify", {
      body: { workspace_id: ws.workspace_id, approval_id: approvalId, action: "approve" },
    });
    if (error) throw new Error("Manager verification failed");
    return { data: data as { approval: { id: string; status: string } | null } };
  })();
  if (vd?.approval?.status !== "approved") throw new Error("Approval was not granted");
  await invoke("orders-cancel", { ...ws, manager_approval_id: approvalId, reason: "Manager override — kitchen cancellation" });
  revalidatePath("/orders");
}

/**
 * Cancel a single line item on an order (e.g. "drink served, food cancelled").
 * order-items-cancel blocks outright if the item was already served
 * (ITEM_ALREADY_SERVED), and requires manager approval if it's currently in
 * prep (ITEM_IN_PREPARATION) — mirror managerCancelOrder's self-approval
 * flow for the latter; let the former bubble up as-is, it's not recoverable.
 */
export async function cancelOrderItem(orderId: string, orderItemId: string, reason: string) {
  const ws = await withWorkspace({ order_id: orderId, order_item_id: orderItemId, reason });
  try {
    await invoke("order-items-cancel", ws);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("ITEM_IN_PREPARATION")) throw err;

    const supabase = createSupabaseServerClient();
    const { data: ap, error: apErr } = await supabase.functions.invoke("manager-approval-create", {
      body: { workspace_id: ws.workspace_id, action_type: "void_order", target_type: "order", target_id: orderId, reason },
    });
    if (apErr) throw new Error("Could not create approval");
    const approvalId = (ap as { approval?: { id: string } })?.approval?.id;
    if (!approvalId) throw new Error("Approval creation failed");

    const { data: vd, error: vErr } = await supabase.functions.invoke("manager-approval-verify", {
      body: { workspace_id: ws.workspace_id, approval_id: approvalId, action: "approve" },
    });
    if (vErr) throw new Error("Manager verification failed");
    if ((vd as { approval?: { status?: string } })?.approval?.status !== "approved") {
      throw new Error("Approval was not granted");
    }

    await invoke("order-items-cancel", { ...ws, manager_approval_id: approvalId });
  }
  revalidatePath("/orders");
}

export async function advanceOrder(orderId: string, status: "preparing" | "ready" | "completed") {
  await invoke("orders-advance", await withWorkspace({ order_id: orderId, status }));
  revalidatePath("/orders");
  revalidatePath("/kitchen");
}

export async function kitchenUpdateStatus(ticketId: string, status: string) {
  await invoke("kitchen-update-status", await withWorkspace({ ticket_id: ticketId, status }));
  revalidatePath("/kitchen");
}

export async function confirmBooking(bookingId: string) {
  await invoke("bookings-confirm", await withWorkspace({ booking_id: bookingId }));
  revalidatePath("/bookings");
}

export async function cancelBooking(bookingId: string) {
  await invoke("bookings-cancel", await withWorkspace({ booking_id: bookingId }));
  revalidatePath("/bookings");
}

export async function markBookingPaid(bookingId: string) {
  await invoke("bookings-mark-paid", await withWorkspace({ booking_id: bookingId }));
  revalidatePath("/bookings");
}

export async function checkInBooking(bookingId: string) {
  await invoke("bookings-check-in", await withWorkspace({ booking_id: bookingId, action: "check_in" }));
  revalidatePath("/bookings");
}

export async function checkOutBooking(bookingId: string) {
  await invoke("bookings-check-in", await withWorkspace({ booking_id: bookingId, action: "check_out" }));
  revalidatePath("/bookings");
}

export async function rescheduleBooking(
  bookingId: string,
  newStartTime: string,
  newEndTime: string,
  reason?: string,
): Promise<{
  booking: { id: string; status: string; total: number; payment_status: string };
  original_booking_id: string;
  price_difference: number;
  balance_due: number;
  refund_due: number;
}> {
  const data = await invoke("bookings-reschedule", await withWorkspace({
    booking_id:     bookingId,
    new_start_time: newStartTime,
    new_end_time:   newEndTime,
    ...(reason ? { reason } : {}),
  }));
  revalidatePath("/bookings");
  return data as {
    booking: { id: string; status: string; total: number; payment_status: string };
    original_booking_id: string;
    price_difference: number;
    balance_due: number;
    refund_due: number;
  };
}

export async function voidTransaction(transactionId: string, reason: string) {
  await invoke("transactions-void", await withWorkspace({ transaction_id: transactionId, reason }));
  revalidatePath("/transactions");
}

export async function adjustInventory(inventoryItemId: string, branchId: string, quantity: number, reason: string) {
  await invoke("inventory-adjust", await withWorkspace({
    branch_id: branchId,
    inventory_item_id: inventoryItemId,
    type: quantity >= 0 ? "in" : "out",
    quantity: Math.abs(quantity),
    reason,
  }));
  revalidatePath("/inventory");
}

export async function refundBooking(
  bookingId: string,
  amount: number,
  method: "cash" | "gcash" | "maya" | "xendit" | "bank_transfer" | "other",
  reason: string,
): Promise<{ booking: { id: string; payment_status: string; amount_paid: number; total: number }; transaction: { id: string } }> {
  const data = await invoke("bookings-refund", await withWorkspace({
    booking_id: bookingId,
    amount,
    method,
    reason,
  }));
  revalidatePath("/bookings");
  return data as { booking: { id: string; payment_status: string; amount_paid: number; total: number }; transaction: { id: string } };
}

export async function fetchExtendedReport(
  resource: "bookings-analytics" | "staff-performance" | "discounts-refunds" | "customer-ltv" | "period-comparison",
  fromDate: string,
  toDate: string,
): Promise<any> {
  const data = await invoke("reports-extended", await withWorkspace({
    resource,
    from_date: fromDate,
    to_date: toDate,
  }));
  return data;
}

export interface ZReport {
  id: string;
  report_no: number;
  report_date: string;
  branch_id: string;
  gross_sales: number;
  discount_amount: number;
  net_sales: number;
  vatable_sales: number;
  vat_amount: number;
  vat_exempt_sales: number;
  zero_rated_sales: number;
  payment_breakdown: Record<string, number>;
  void_count: number;
  void_amount: number;
  refund_count: number;
  refund_amount: number;
  order_count: number;
  cancelled_count: number;
  first_receipt_no: string | null;
  last_receipt_no: string | null;
  opening_float: number;
  cash_in: number;
  cash_out: number;
  expected_cash: number;
  cashier_name: string | null;
  created_at: string;
  payload: Record<string, unknown> | null;
}

// ── Vouchers ──────────────────────────────────────────────────────────────────

export async function createVoucher(payload: Record<string, unknown>) {
  const data = await invoke("vouchers-create", payload);
  revalidatePath("/vouchers");
  return data as { voucher: Record<string, unknown> };
}

export async function upsertVoucher(payload: Record<string, unknown>) {
  const data = await invoke("vouchers-upsert", payload);
  revalidatePath("/vouchers");
  return data as { voucher: Record<string, unknown> };
}

export async function deleteVoucher(id: string, workspaceId: string) {
  await invoke("vouchers-delete", { workspace_id: workspaceId, id });
  revalidatePath("/vouchers");
}

// ── Z Reports ─────────────────────────────────────────────────────────────────

export async function getZReports(): Promise<ZReport[]> {
  const supabase = createSupabaseServerClient();
  const workspace_id = await resolveWorkspaceId();
  if (!workspace_id) return [];
  const { data } = await supabase
    .from("z_reports")
    .select("*")
    .eq("workspace_id", workspace_id)
    .order("report_date", { ascending: false })
    .limit(365);
  return (data ?? []) as ZReport[];
}

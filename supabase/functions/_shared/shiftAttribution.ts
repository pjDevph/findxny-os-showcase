// Attributes an order to the cashier's currently open shift when a staff
// member settles it after the fact (counter-pay, cash-confirm on an
// outstanding balance) — these orders are frequently created with no
// shift_id at all (e.g. web/kiosk guest checkout, source='web'), so without
// this the cash a cashier physically collects for them never counts toward
// their shift's expectedCash/cashSales in buildShiftReport (pos-shift/index.ts),
// producing a phantom drawer variance and an invisible line item on their
// end-of-shift summary.
type Admin = { from: (table: string) => any };

export async function attributeOrderToOpenShift(
  admin: Admin,
  workspaceId: string,
  cashierId: string,
  orderId: string,
): Promise<void> {
  const { data: existing } = await admin.from("orders")
    .select("shift_id, cashier_id").eq("id", orderId).maybeSingle();
  // Already attributed (e.g. a normal in-person POS sale that already carries
  // its own shift_id) — never overwrite an existing assignment.
  if (existing?.shift_id) return;

  const { data: openShift } = await admin.from("shifts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("cashier_id", cashierId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // No open shift for this cashier (e.g. a manager settling a balance from
  // the back office with no till open) — leave shift_id null rather than
  // guessing; the order still surfaces via reports-extended's cashier_id
  // grouping.
  if (!openShift) {
    if (!existing?.cashier_id) {
      await admin.from("orders").update({ cashier_id: cashierId }).eq("id", orderId);
    }
    return;
  }

  await admin.from("orders")
    .update({ shift_id: openShift.id, cashier_id: existing?.cashier_id ?? cashierId })
    .eq("id", orderId);
}

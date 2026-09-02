// POST /orders-create
// Creates an order with items, computes totals, optionally creates a kitchen ticket.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, Conflict } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { idempotencyGuard, type IdempotencyHandle } from "../_shared/idempotency.ts";
import { phStartOfDay, phEndOfDay } from "../_shared/dates.ts";
import { computePosOrderTotals, validateLargeDiscount } from "../_shared/orderPricing.ts";
import { createKitchenTickets } from "../_shared/kitchenTickets.ts";

const Body = z.object({
  workspace_id:                z.string().uuid(),
  branch_id:                   z.string().uuid(),
  customer_id:                 z.string().uuid().optional(),
  type:                        z.enum(["dine_in","takeaway","delivery","booking"]).default("dine_in"),
  order_type:                  z.enum(["dine_in","takeout","room_service","walk_in","qr_order","delivery"]).optional(),
  table_no:                    z.string().regex(/^[A-Za-z0-9-]{1,20}$/).optional(),
  // Dine-in floor/seating-area quick-select (1st Flr / 2nd Flr / RF Top /
  // Alfresco etc.) — free text, not an enum, so the business can rename/add
  // areas client-side without a server redeploy.
  serve_location:              z.string().max(50).optional(),
  notes:                       z.string().max(500).optional(),
  booking_id:                  z.string().uuid().optional(),
  shift_id:                    z.string().uuid().optional(),
  discount_amount:             z.number().min(0).default(0),
  // Cashier can waive tax/service charge per order in the payment screen —
  // default true (workspace rate applies) so older clients that never send
  // these behave exactly as before.
  apply_tax:                   z.boolean().optional().default(true),
  apply_service:               z.boolean().optional().default(true),
  voucher_code:                z.string().min(1).max(50).optional(),
  is_senior_pwd:               z.boolean().optional().default(false),
  discount_manager_approval_id: z.string().uuid().optional(),
  // Create the order as an unpaid "open tab": owes the full total, no payment
  // recorded now. Marked partially_paid with balance_due = total so the existing
  // Transactions → Collect Balance flow can settle it later.
  unpaid:                      z.boolean().optional().default(false),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    variant_id: z.string().uuid().optional(),
    quantity:   z.number().int().positive().max(99),
    notes:      z.string().max(200).optional(),
    addons: z.array(z.object({
      addon_id: z.string().uuid(),
      name:     z.string(),
      price:    z.number().min(0),
      qty:      z.number().int().positive().default(1),
    })).optional().default([]),
    // Per-item discount (e.g. a comped drink) — clamped server-side to this
    // line's own gross total (unit_price*quantity) in buildItemRows, then
    // folded into the order's manual discount bucket for reporting/approval.
    discount_amount: z.number().min(0).optional().default(0),
  })).max(100).default([]),
});

type AdminClient = ReturnType<typeof adminClient>;
type ParsedBody = z.infer<typeof Body>;

interface AddonInput {
  addon_id: string;
  name: string;
  price: number;
  qty: number;
}

interface ItemRow {
  product_id: string;
  variant_id: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  notes: string | null;
  discount_amount: number;
  _addons?: AddonInput[];
}

async function validateBranchAndRates(
  admin: AdminClient,
  body: ParsedBody,
): Promise<{ taxRate: number; svcRate: number }> {
  const { data: branch } = await admin
    .from("branches").select("id, workspace_id").eq("id", body.branch_id).maybeSingle();
  if (!branch || branch.workspace_id !== body.workspace_id) throw BadRequest("Branch not in workspace");

  const { data: ws } = await admin
    .from("workspaces").select("tax_rate, service_rate").eq("id", body.workspace_id).maybeSingle();
  return { taxRate: Number(ws?.tax_rate ?? 0), svcRate: Number(ws?.service_rate ?? 0) };
}

async function buildItemRows(
  admin: AdminClient,
  body: ParsedBody,
): Promise<{ itemRows: ItemRow[]; subtotal: number; itemDiscountTotal: number; pMap: Map<string, { price: number; kitchen_required: boolean; workspace_id: string; active: boolean }> }> {
  const pMap     = new Map<string, { price: number; kitchen_required: boolean; workspace_id: string; active: boolean }>();
  const variantMap = new Map<string, { price_delta: number }>();
  let subtotal   = 0;
  let itemDiscountTotal = 0;
  const itemRows: ItemRow[] = [];

  if (body.items.length === 0) return { itemRows, subtotal, itemDiscountTotal, pMap };

  const productIds = [...new Set(body.items.map((i) => i.product_id))];
  const { data: products, error: pErr } = await admin
    .from("products")
    .select("id, price, kitchen_required, prep_station, workspace_id, active, track_inventory")
    .in("id", productIds);
  if (pErr) throw BadRequest(pErr.message);
  products!.forEach((p) => pMap.set(p.id, p));
  for (const id of productIds) {
    if (!pMap.has(id)) throw BadRequest(`Product ${id} not found`);
  }
  for (const p of products!) {
    if (p.workspace_id !== body.workspace_id) throw BadRequest("Product not in workspace");
    if (!p.active) throw BadRequest(`Product ${p.id} inactive`);
  }

  // G6 — stock check: fast-fail UX for products that track inventory,
  // aggregating demand across every line that shares a catalog entry
  // (whether that's a raw material or another product's own stock — a
  // self-stocked product's own demand is just its 1-row "consumes itself"
  // recipe_items line, same mechanism as a multi-ingredient recipe).
  // This is a pre-check only — the create_pos_order RPC's deduction triggers
  // are the actual, TOCTOU-safe source of truth.
  const trackedIds = body.items
    .filter((i) => (pMap.get(i.product_id) as any)?.track_inventory)
    .map((i) => i.product_id);
  if (trackedIds.length > 0) {
    const { data: recipeRows } = await admin
      .from("recipe_items")
      .select("product_id, catalog_id, qty_used")
      .in("product_id", [...new Set(trackedIds)]);
    const demand = new Map<string, number>();
    for (const i of body.items) {
      if (!(pMap.get(i.product_id) as any)?.track_inventory) continue;
      for (const ri of recipeRows ?? []) {
        if (ri.product_id !== i.product_id) continue;
        demand.set(ri.catalog_id, (demand.get(ri.catalog_id) ?? 0) + Number(ri.qty_used) * i.quantity);
      }
    }
    if (demand.size > 0) {
      const { data: stocks } = await admin
        .from("inventory_items")
        .select("catalog_id, quantity, inventory_catalog(name)")
        .eq("branch_id", body.branch_id)
        .in("catalog_id", [...demand.keys()]);
      for (const s of stocks ?? []) {
        const needed = demand.get(s.catalog_id) ?? 0;
        if (Number(s.quantity) < needed) {
          const name = (s.inventory_catalog as any)?.name ?? s.catalog_id;
          throw BadRequest(`Insufficient stock for ${name}: need ${needed}, have ${s.quantity}`);
        }
      }
    }
  }

  const variantIds = body.items.map((i) => i.variant_id).filter(Boolean) as string[];
  if (variantIds.length) {
    const { data: vars } = await admin.from("product_variants").select("id, price_delta").in("id", variantIds);
    vars?.forEach((v) => variantMap.set(v.id, v));
  }

  for (const i of body.items) {
    const product    = pMap.get(i.product_id)!;
    const variant    = i.variant_id ? variantMap.get(i.variant_id) : undefined;
    const unit_price = Number(product.price) + Number(variant?.price_delta ?? 0);
    const total      = +(unit_price * i.quantity).toFixed(2);
    // total stays the gross line amount (unit_price*quantity) — every other
    // consumer of order_items.total (reports, receipts, order-items-cancel)
    // assumes that invariant. The discount is its own column, folded into
    // the order-level discount instead of eating into this line's total.
    const discount_amount = +Math.min(Math.max(i.discount_amount ?? 0, 0), total).toFixed(2);
    subtotal += total;
    itemDiscountTotal += discount_amount;
    itemRows.push({ product_id: i.product_id, variant_id: i.variant_id ?? null, quantity: i.quantity, unit_price, total, notes: i.notes ?? null, discount_amount, _addons: (i.addons ?? []) as AddonInput[] });
  }

  return { itemRows, subtotal, itemDiscountTotal, pMap };
}

interface VoucherResult {
  voucher: {
    id: string; code: string; name: string;
    discount_type: string; discount_value: number;
    max_cap: number | null;
    min_spend: number;
    usage_limit: number | null; usage_count: number;
    one_per_customer: boolean; applies_to: string;
    valid_from: string | null; valid_until: string | null;
    status: string;
  };
  voucherDiscount: number;
}

async function validateAndApplyVoucher(
  admin: AdminClient,
  body: ParsedBody,
  subtotal: number,
): Promise<VoucherResult> {
  const code = body.voucher_code!.trim().toUpperCase();

  const { data: voucher } = await admin.from("vouchers")
    .select("id,code,name,discount_type,discount_value,max_cap,min_spend,usage_limit,usage_count,one_per_customer,applies_to,valid_from,valid_until,status")
    .eq("workspace_id", body.workspace_id)
    .eq("code", code)
    .maybeSingle();

  if (!voucher) throw BadRequest(`Voucher "${code}" not found`);
  if (voucher.status === "disabled") throw BadRequest("Voucher is disabled");

  const now = new Date();
  if (voucher.valid_until && phEndOfDay(voucher.valid_until) < now) throw BadRequest("Voucher has expired");
  if (voucher.valid_from && phStartOfDay(voucher.valid_from) > now) throw BadRequest("Voucher is not yet active");
  if (voucher.usage_limit !== null && voucher.usage_count >= voucher.usage_limit) {
    throw BadRequest("Voucher usage limit reached");
  }
  if (Number(voucher.min_spend) > 0 && subtotal < Number(voucher.min_spend)) {
    throw BadRequest(`Minimum spend of ₱${Number(voucher.min_spend).toFixed(2)} required for this voucher`);
  }

  if (voucher.one_per_customer && body.customer_id) {
    const { data: existing } = await admin.from("voucher_redemptions")
      .select("id").eq("voucher_id", voucher.id).eq("customer_id", body.customer_id).maybeSingle();
    if (existing) throw BadRequest("This voucher has already been used by this customer");
  }

  // G4: Enforce applies_to category restriction.
  // 'order' means the voucher applies to all items (no restriction).
  // Any other value (e.g. 'food', 'drinks', 'rooms', 'amenities') requires at
  // least one item in the order to belong to a product_category whose name
  // matches the applies_to value (case-insensitive).
  if (voucher.applies_to && voucher.applies_to !== "order" && body.items.length > 0) {
    const productIds = [...new Set(body.items.map((i) => i.product_id))];
    const { data: itemCategories } = await admin
      .from("products")
      .select("id, product_categories(name)")
      .in("id", productIds);
    const hasMatch = (itemCategories ?? []).some((p: { product_categories: { name: string } | null }) =>
      p.product_categories?.name?.toLowerCase() === voucher.applies_to.toLowerCase()
    );
    if (!hasMatch) {
      throw BadRequest("Voucher is not applicable to any items in this order");
    }
  }

  const base = subtotal;
  let voucherDiscount: number;
  if (voucher.discount_type === "percentage") {
    const raw = base * (Number(voucher.discount_value) / 100);
    voucherDiscount = voucher.max_cap ? Math.min(raw, Number(voucher.max_cap)) : raw;
  } else {
    voucherDiscount = Math.min(Number(voucher.discount_value), base);
  }
  voucherDiscount = +voucherDiscount.toFixed(2);

  return { voucher, voucherDiscount };
}

async function insertOrderAndItems(
  admin: AdminClient,
  body: ParsedBody,
  ctx: { userId: string },
  subtotal: number,
  taxRate: number,
  svcRate: number,
  itemRows: ItemRow[],
  itemDiscountTotal: number,
  voucherResult?: VoucherResult,
) {
  // SC/PWD: 20% of VAT-exclusive subtotal using workspace tax rate — this
  // overrides any manual/per-item discount entirely, same as before.
  let manualDiscount = body.discount_amount;
  if (body.is_senior_pwd) {
    manualDiscount = Math.round((subtotal / (1 + taxRate)) * 0.2 * 100) / 100;
  } else {
    manualDiscount += itemDiscountTotal;
  }

  // Large discount check applies to manual/SC/PWD discount only, not voucher
  await validateLargeDiscount(admin, manualDiscount, body.is_senior_pwd, body.discount_manager_approval_id);

  const voucherDiscount = voucherResult?.voucherDiscount ?? 0;
  const { tax, service_fee, discount, discount_source, total } = computePosOrderTotals({
    subtotal, taxRate, svcRate, isSeniorPwd: body.is_senior_pwd, manualDiscountAmount: manualDiscount, voucherDiscount,
  });

  const { data: rpcResult, error: rpcErr } = await admin.rpc("create_pos_order", {
    p_order: {
      workspace_id: body.workspace_id,
      branch_id: body.branch_id,
      customer_id: body.customer_id ?? null,
      cashier_id: ctx.userId,
      type: body.type,
      status: "pending",
      subtotal, tax, service_fee, discount, total,
      notes: body.notes ?? null,
      table_no: body.table_no ?? null,
      is_senior_pwd: body.is_senior_pwd,
      discount_source,
      voucher_id:   voucherResult?.voucher.id   ?? null,
      voucher_code: voucherResult?.voucher.code ?? null,
      created_by: ctx.userId,
      source: "pos",
      shift_id: body.shift_id ?? null,
      order_type: body.order_type ?? null,
      serve_location: body.serve_location ?? null,
    },
    p_items: itemRows.map((row) => ({
      product_id: row.product_id,
      variant_id: row.variant_id,
      quantity:   row.quantity,
      unit_price: row.unit_price,
      total:      row.total,
      notes:      row.notes,
      discount_amount: row.discount_amount,
      addons:     row._addons ?? [],
    })),
  });
  if (rpcErr) {
    const msg = rpcErr.message ?? "Failed to create order";
    const match = msg.match(/INSUFFICIENT_STOCK:\s*(.+)/);
    throw match ? Conflict(match[1]) : BadRequest(msg);
  }

  const { order, items: insertedItems } = rpcResult as { order: any; items: (ItemRow & { id: string })[] };

  // Unpaid tab: no payment is collected at checkout, so payments-cash-confirm
  // never runs to set these. Mark the freshly-created order as owing its full
  // total, reusing the same (payment_status='partially_paid', balance_due>0)
  // shape that Transactions → Collect Balance already knows how to settle.
  if (body.unpaid && Number(total) > 0) {
    const { error: unpaidErr } = await admin.from("orders")
      .update({ payment_status: "partially_paid", balance_due: total })
      .eq("id", order.id);
    if (unpaidErr) throw BadRequest(unpaidErr.message);
    order.payment_status = "partially_paid";
    order.balance_due    = total;
  }

  // Atomically claim voucher usage and record redemption (non-fatal if race-lost)
  if (voucherResult) {
    try {
      const { data: claim } = await admin.rpc("claim_voucher_usage", {
        p_voucher_id:   voucherResult.voucher.id,
        p_workspace_id: body.workspace_id,
      }).single();
      if (claim?.success) {
        await admin.from("voucher_redemptions").insert({
          workspace_id:    body.workspace_id,
          voucher_id:      voucherResult.voucher.id,
          order_id:        order.id,
          customer_id:     body.customer_id ?? null,
          code_snapshot:   voucherResult.voucher.code,
          discount_amount: voucherResult.voucherDiscount,
          order_total:     subtotal,
          redeemed_by:     ctx.userId,
        });
      } else {
        console.error("claim_voucher_usage:", claim?.reason);
      }
    } catch (e) {
      console.error("Voucher claim error:", e);
    }
  }

  return { order, insertedItems };
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  let idem: IdempotencyHandle | null = null;
  let orderCreated = false;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    idem = await idempotencyGuard(req, "orders-create", JSON.stringify(body));
    if (idem.cached) return json(idem.cached.response, idem.cached.status);

    const admin = adminClient();

    // The workspace's configured rates were always applied in full here,
    // regardless of the payment screen's "Tax"/"Service X%" toggles — those
    // only ever changed what the client displayed, never what got charged.
    // A cashier waiving service charge for one order still had it silently
    // added server-side, so the real order total came out higher than shown
    // (surfacing later as a bogus "Cash received less than amount due").
    const { taxRate: wsTaxRate, svcRate: wsSvcRate } = await validateBranchAndRates(admin, body);
    const taxRate = body.apply_tax ? wsTaxRate : 0;
    const svcRate = body.apply_service ? wsSvcRate : 0;
    const { itemRows, subtotal, itemDiscountTotal, pMap } = await buildItemRows(admin, body);
    const voucherResult = body.voucher_code
      ? await validateAndApplyVoucher(admin, body, subtotal)
      : undefined;
    const { order, insertedItems } = await insertOrderAndItems(admin, body, ctx, subtotal, taxRate, svcRate, itemRows, itemDiscountTotal, voucherResult);
    orderCreated = true;

    if (body.booking_id) {
      await admin.from("order_booking_link").insert({ order_id: order.id, booking_id: body.booking_id });
    }

    await createKitchenTickets(
      admin,
      { branchId: body.branch_id, workspaceId: body.workspace_id, orderId: order.id as string },
      insertedItems as unknown as { id: string; product_id: string }[],
      pMap,
    );

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "order.create", entityType: "order", entityId: order.id,
      after: { order, items: insertedItems },
    }));

    const result = { order, items: insertedItems };
    await idem.commit(201, result);
    return json(result, 201);
  } catch (err) {
    if (idem && !orderCreated) await idem.release().catch(() => {});
    return handleError(err);
  }
});

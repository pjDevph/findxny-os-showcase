// POST /public-orders-create
// No auth required — guest checkout for QR-table / kiosk ordering.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { createInvoice } from "../_shared/xenditClient.ts";
import { rateLimit } from "../_shared/rateLimit.ts";
import { idempotencyGuard, type IdempotencyHandle } from "../_shared/idempotency.ts";
import { phStartOfDay, phEndOfDay } from "../_shared/dates.ts";
import { normalizePhone, isValidPHMobile } from "../_shared/phone.ts";

const Body = z.object({
  workspace_slug: z.string().min(1).max(100),
  branch_id:      z.string().uuid().optional(),
  customer: z.object({
    name:  z.string().min(1).max(120),
    phone: z.string().min(7).max(20)
      .transform(normalizePhone)
      .refine(isValidPHMobile, "Invalid Philippine mobile number — expected format: 09XXXXXXXXX or +639XXXXXXXXX"),
    email: z.string().email().max(254).optional(),
  }),
  table_no: z.string().regex(/^[A-Za-z0-9-]{1,20}$/).optional(),
  notes:    z.string().max(500).optional(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity:   z.number().int().positive().max(99),
    notes:      z.string().max(200).optional(),
  })).min(1).max(100),
  payment_method: z.enum(["cash","gcash","card","qrph","maya","pay_at_counter"]).optional(),
  cash_received:  z.number().positive().max(1_000_000).optional(),
  voucher_code:   z.string().min(1).max(50).optional(),
});

type Admin = ReturnType<typeof adminClient>;

type ProductRow = {
  id: string;
  price: number;
  kitchen_required: boolean;
  workspace_id: string;
  for_sale: boolean;
};

type OrderItemRow = {
  id: string;
  product_id: string;
  order_id: string;
  quantity: number;
  unit_price: number;
  total: number;
  notes: string | null;
};

async function resolveWorkspace(admin: Admin, slug: string) {
  const { data } = await admin.from("workspaces")
    .select("id, currency, tax_rate, service_rate").eq("slug", slug).maybeSingle();
  if (!data) throw NotFound("Workspace not found");
  return data;
}

async function resolveBranch(admin: Admin, wsId: string, branchId?: string) {
  if (branchId) return branchId;
  const { data } = await admin.from("branches")
    .select("id").eq("workspace_id", wsId).limit(1).maybeSingle();
  if (!data) throw BadRequest("Workspace has no branches");
  return data.id;
}

async function upsertCustomer(admin: Admin, wsId: string, c: { name: string; phone: string; email?: string }) {
  const { data: existing } = await admin.from("customers")
    .select("id").eq("workspace_id", wsId).eq("phone", c.phone).maybeSingle();
  if (existing?.id) return existing.id;
  const { data, error } = await admin.from("customers")
    .insert({ workspace_id: wsId, name: c.name, phone: c.phone, email: c.email ?? null }).select().single();
  if (error) {
    // 23505 = unique_violation: concurrent request inserted the same phone first
    if (error.code === "23505") {
      const { data: retry } = await admin.from("customers")
        .select("id").eq("workspace_id", wsId).eq("phone", c.phone).maybeSingle();
      if (retry?.id) return retry.id;
    }
    throw BadRequest(error.message);
  }
  if (!data) throw BadRequest("Failed to create customer");
  return data.id;
}

async function priceItems(admin: Admin, wsId: string, items: { product_id: string; quantity: number; notes?: string }[]) {
  const ids = [...new Set(items.map((i) => i.product_id))];
  const { data: products, error } = await admin
    .from("products").select("id, price, kitchen_required, workspace_id, for_sale").eq("workspace_id", wsId).in("id", ids);
  if (error) throw BadRequest(error.message);
  const rows_found = (products ?? []) as ProductRow[];
  if (rows_found.length !== ids.length) throw BadRequest("One or more products not found");
  const pMap = new Map<string, ProductRow>(rows_found.map((p) => [p.id, p]));
  for (const p of rows_found) {
    if (p.workspace_id !== wsId) throw BadRequest("Product not in workspace");
    // This is the public/web ordering endpoint — visibility here is gated by
    // `for_sale` (the web-menu toggle), not `active` (the POS-only toggle).
    // The two are independent; a product hidden from POS can still be a
    // valid web order, and vice versa.
    if (!p.for_sale) throw BadRequest(`Product ${p.id} is not for sale`);
  }
  let subtotal = 0;
  const rows = items.map((i) => {
    const product = pMap.get(i.product_id);
    if (!product) throw BadRequest(`Product ${i.product_id} not found`);
    const unit_price = Number(product.price);
    const total = +(unit_price * i.quantity).toFixed(2);
    subtotal += total;
    return { product_id: i.product_id, quantity: i.quantity, unit_price, total, notes: i.notes ?? null };
  });
  return { rows, subtotal, pMap };
}

async function validateAndApplyVoucher(admin: Admin, wsId: string, voucherCode: string, subtotal: number) {
  const code = voucherCode.trim().toUpperCase();

  const { data: voucher } = await admin.from("vouchers")
    .select("id,code,name,discount_type,discount_value,max_cap,min_spend,usage_limit,usage_count,applies_to,valid_from,valid_until,status")
    .eq("workspace_id", wsId)
    .eq("code", code)
    .maybeSingle();

  if (!voucher) throw BadRequest(`Voucher "${code}" not found`);
  if (voucher.status === "disabled") throw BadRequest("Voucher is disabled");

  const now = new Date();
  if (voucher.valid_until && phEndOfDay(voucher.valid_until) < now) throw BadRequest("Voucher has expired");
  if (voucher.valid_from && phStartOfDay(voucher.valid_from) > now) throw BadRequest("Voucher is not yet active");
  if (voucher.usage_limit !== null && voucher.usage_count >= voucher.usage_limit) throw BadRequest("Voucher usage limit reached");
  if (Number(voucher.min_spend) > 0 && subtotal < Number(voucher.min_spend))
    throw BadRequest(`Minimum order of ₱${Number(voucher.min_spend).toFixed(2)} required for this voucher`);

  let discount: number;
  if (voucher.discount_type === "percentage") {
    const raw = subtotal * (Number(voucher.discount_value) / 100);
    discount = voucher.max_cap ? Math.min(raw, Number(voucher.max_cap)) : raw;
  } else {
    discount = Math.min(Number(voucher.discount_value), subtotal);
  }
  return { voucher, discount: +discount.toFixed(2) };
}

async function spawnKitchenTicket(
  admin: Admin, orderId: string, branchId: string, wsId: string,
  insertedItems: OrderItemRow[], pMap: Map<string, ProductRow>,
) {
  const kitchenItems = insertedItems.filter((it) => pMap.get(it.product_id)?.kitchen_required);
  if (!kitchenItems.length) return;
  const { data: ticket, error: tErr } = await admin.from("kitchen_tickets")
    .insert({ order_id: orderId, branch_id: branchId, workspace_id: wsId }).select().single();
  if (tErr || !ticket) {
    console.error("[public-orders-create] kitchen_tickets insert failed:", tErr?.message);
    return;
  }
  const { error: itErr } = await admin.from("kitchen_ticket_items")
    .insert(kitchenItems.map((it) => ({ ticket_id: ticket.id, order_item_id: it.id })));
  if (itErr) {
    console.error("[public-orders-create] kitchen_ticket_items insert failed:", itErr.message);
    await admin.from("kitchen_tickets").delete().eq("id", ticket.id);
  }
}

async function settleCashImmediate(
  admin: Admin, ws: { id: string; currency: string }, branchId: string,
  orderId: string, total: number, cashReceived: number,
) {
  if (cashReceived < total) throw BadRequest("Cash received less than total");
  const change = +(cashReceived - total).toFixed(2);

  const { data: intent, error: iErr } = await admin.from("payment_intents").insert({
    workspace_id: ws.id, order_id: orderId,
    provider: "cash", amount: total, currency: ws.currency, status: "succeeded",
    metadata: { cash_received: cashReceived, change },
  }).select().single();
  if (iErr || !intent) throw BadRequest(iErr?.message ?? "Failed to create payment intent");

  const { data: payment, error: pErr } = await admin.from("payments")
    .insert({ intent_id: intent.id, amount: total, method: "cash", status: "succeeded" }).select().single();
  if (pErr) throw BadRequest(pErr.message);

  const { data: updatedOrder, error: oErr } = await admin.from("orders")
    .update({ status: "completed", payment_status: "paid" }).eq("id", orderId).select().single();
  if (oErr || !updatedOrder) throw BadRequest(oErr?.message ?? "Failed to update order status");

  const { data: tx, error: tErr } = await admin.from("transactions").insert({
    workspace_id: ws.id, branch_id: branchId,
    type: "sale", reference_table: "orders", reference_id: orderId,
    amount: total, status: "completed", payment_method: "cash",
  }).select().single();
  if (tErr || !tx) throw BadRequest(tErr?.message ?? "Failed to create transaction");

  const { data: receipt } = await admin.from("receipts").insert({
    workspace_id: ws.id, transaction_id: tx.id,
    payload: { type: "orders", ref_id: orderId, amount: total, currency: ws.currency, method: "cash", issued_at: new Date().toISOString() },
  }).select().single();

  return { order: updatedOrder, payment, transaction: tx, receipt };
}

function computeOrderTotals(ws: { tax_rate?: number | null; service_rate?: number | null }, subtotal: number) {
  const taxRate = ws.tax_rate ?? 0.12;
  const svcRate = ws.service_rate ?? 0;
  const tax     = +(subtotal * taxRate).toFixed(2);
  const svc     = +(subtotal * svcRate).toFixed(2);
  const total   = +(subtotal + tax + svc).toFixed(2);
  return { tax, svc, total };
}

function classifyPaymentMethod(paymentMethod: string | undefined, cashReceived: number | undefined) {
  const isCounterPay = paymentMethod === "pay_at_counter"
    || (paymentMethod === "cash" && !cashReceived);
  const isDigitalPayment = ["gcash", "maya", "card", "qrph"].includes(paymentMethod ?? "");
  return { isCounterPay, isDigitalPayment };
}

async function resolveTicketNo(admin: Admin, isCounterPay: boolean): Promise<string | null> {
  if (!isCounterPay) return null;
  const { data: t } = await admin.rpc("next_kiosk_ticket");
  return t ? String(t) : null;
}

async function insertOrderWithItems(opts: {
  admin: Admin;
  ws: { id: string };
  branchId: string;
  custId: string;
  body: z.infer<typeof Body>;
  subtotal: number;
  tax: number;
  svc: number;
  total: number;
  ticketNo: string | null;
  isCounterPay: boolean;
  rows: { product_id: string; quantity: number; unit_price: number; total: number; notes: string | null }[];
  voucherDiscount?: number;
  voucherId?: string;
  voucherCodeStr?: string;
}) {
  const { admin, ws, branchId, custId, body, subtotal, tax, svc, total, ticketNo, isCounterPay, rows, voucherDiscount = 0, voucherId, voucherCodeStr } = opts;

  // Same atomic, lock-ordered RPC the staff POS path (orders-create) uses:
  // order + items insert in one transaction (a failed item insert rolls back
  // the order too — no orphaned "pending" order with zero items to clean up),
  // and every affected inventory row gets locked up front in a stable order
  // before any deduction, so two concurrent guest orders sharing inventory
  // can't deadlock across separate order_items inserts.
  const { data: rpcResult, error: rpcErr } = await admin.rpc("create_pos_order", {
    p_order: {
      workspace_id: ws.id,
      branch_id: branchId,
      customer_id: custId,
      cashier_id: null,
      type: body.table_no ? "dine_in" : "takeaway",
      status: "pending",
      subtotal, tax, service_fee: svc, total,
      notes: body.notes ?? null,
      table_no: body.table_no ?? null,
      is_senior_pwd: false,
      discount: voucherDiscount > 0 ? voucherDiscount : 0,
      discount_source: voucherDiscount > 0 ? "voucher" : null,
      voucher_id: voucherId ?? null,
      voucher_code: voucherCodeStr ?? null,
      created_by: null,
      source: "web",
      ticket_no: ticketNo,
      payment_status: isCounterPay ? "pending_counter" : null,
    },
    p_items: rows.map((r) => ({
      product_id: r.product_id,
      quantity:   r.quantity,
      unit_price: r.unit_price,
      total:      r.total,
      notes:      r.notes,
    })),
  });
  if (rpcErr) {
    const match = rpcErr.message.match(/INSUFFICIENT_STOCK:\s*(.+)/);
    throw BadRequest(match ? match[1] : rpcErr.message);
  }

  const { order, items: insertedItems } = rpcResult as { order: any; items: OrderItemRow[] };
  return { order, insertedItems: insertedItems ?? [] };
}

async function dispatchDigitalPayment(
  admin: Admin,
  ws: { id: string; currency: string },
  order: { id: string; order_no: string },
  total: number,
  body: z.infer<typeof Body>,
) {
  const { data: intent, error: iErr } = await admin.from("payment_intents").insert({
    workspace_id: ws.id, order_id: order.id,
    provider: "xendit", amount: total, currency: ws.currency, status: "pending",
  }).select().single();
  if (iErr || !intent) throw BadRequest(iErr?.message ?? "Failed to create payment intent");

  const paymentMethod = body.payment_method;
  if (!paymentMethod) throw BadRequest("Payment method required for digital payment");

  const invoice = await createInvoice({
    orderId:       order.id,
    orderNo:       order.order_no,
    amount:        total,
    currency:      ws.currency,
    paymentMethod,
    customer: {
      name:  body.customer.name,
      phone: body.customer.phone,
      email: body.customer.email,
    },
  });
  await admin.from("payment_intents")
    .update({ provider_intent_id: invoice.id }).eq("id", intent.id);
  if (!invoice.invoice_url) throw BadRequest("Payment provider did not return a checkout URL");
  return String(invoice.invoice_url);
}

async function writeAuditLog(
  admin: Admin,
  ws: { id: string },
  order: { id: string; order_no: string },
  ticketNo: string | null,
  total: number,
  itemCount: number,
) {
  await admin.from("audit_logs").insert({
    workspace_id: ws.id, actor_id: null,
    action: "order.public_create", entity_type: "order", entity_id: order.id,
    after: { order_no: order.order_no, ticket_no: ticketNo, total, items: itemCount },
  });
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  let idem: IdempotencyHandle | null = null;
  let orderCreated = false;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    await rateLimit(req, { scope: "public-orders-create", max: 20, windowSec: 300 });
    const body = await parseBody(req, Body);
    await rateLimit(req, {
      scope: "public-orders-create:phone",
      key: `${body.workspace_slug}:${body.customer.phone}`,
      max: 10, windowSec: 300,
    });
    idem = await idempotencyGuard(req, "public-orders-create", JSON.stringify(body));
    if (idem.cached) return json(idem.cached.response, idem.cached.status);
    const admin = adminClient();

    const ws       = await resolveWorkspace(admin, body.workspace_slug);
    const branchId = await resolveBranch(admin, ws.id, body.branch_id);
    const custId   = await upsertCustomer(admin, ws.id, body.customer);
    const { rows, subtotal, pMap } = await priceItems(admin, ws.id, body.items);

    let voucherDiscount = 0;
    let voucherData: { id: string; code: string } | undefined;
    if (body.voucher_code) {
      const v = await validateAndApplyVoucher(admin, ws.id, body.voucher_code, subtotal);
      voucherDiscount = v.discount;
      voucherData = { id: v.voucher.id, code: v.voucher.code };
    }

    const { tax, svc, total: rawTotal } = computeOrderTotals(ws, subtotal);
    const total = +Math.max(0, rawTotal - voucherDiscount).toFixed(2);

    const { isCounterPay, isDigitalPayment } = classifyPaymentMethod(body.payment_method, body.cash_received);
    const ticketNo = await resolveTicketNo(admin, isCounterPay);

    const { order, insertedItems } = await insertOrderWithItems(
      { admin, ws, branchId, custId, body, subtotal, tax, svc, total, ticketNo, isCounterPay, rows,
        voucherDiscount, voucherId: voucherData?.id, voucherCodeStr: voucherData?.code },
    );
    orderCreated = true;

    if (!isCounterPay && !isDigitalPayment) {
      await spawnKitchenTicket(admin, order.id, branchId, ws.id, insertedItems, pMap);
    }

    if (voucherData && voucherDiscount > 0) {
      try {
        const { data: claim } = await admin.rpc("claim_voucher_usage", {
          p_voucher_id:   voucherData.id,
          p_workspace_id: ws.id,
        }).single();
        const claimResult = claim as { success?: boolean } | null;
        if (claimResult?.success) {
          await admin.from("voucher_redemptions").insert({
            workspace_id:    ws.id,
            voucher_id:      voucherData.id,
            order_id:        order.id,
            customer_id:     custId,
            code_snapshot:   voucherData.code,
            discount_amount: voucherDiscount,
            order_total:     subtotal,
            redeemed_by:     null,
          });
        }
      } catch (e) {
        console.error("Voucher claim error:", e);
      }
    }

    let settled: Awaited<ReturnType<typeof settleCashImmediate>> | undefined;
    if (body.payment_method === "cash" && body.cash_received) {
      settled = await settleCashImmediate(admin, ws, branchId, order.id, total, body.cash_received);
    }

    let checkoutUrl: string | undefined;
    if (isDigitalPayment) {
      checkoutUrl = await dispatchDigitalPayment(admin, ws, order, total, body);
    }

    await writeAuditLog(admin, ws, order, ticketNo, total, insertedItems.length);

    const result = { order: settled?.order ?? order, items: insertedItems, checkout_url: checkoutUrl, ...(settled ?? {}) };
    await idem.commit(201, result);
    return json(result, 201);
  } catch (err) {
    if (idem && !orderCreated) await idem.release().catch(() => {});
    return handleError(err);
  }
});

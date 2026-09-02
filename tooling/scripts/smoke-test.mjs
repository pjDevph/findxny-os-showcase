#!/usr/bin/env node
// =============================================================
// Backend smoke test — hits every Edge Function in dependency order.
//
// Prereqs:
//   - Migrations applied (0001_init.sql + 0002_rls.sql)
//   - All Edge Functions deployed (auth/orders/kitchen/payments/bookings/
//     inventory + the public-* guest functions)
//   - Env vars set:
//       SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//       XENDIT_WEBHOOK_TOKEN  (to authenticate the payments-webhook step)
//       SMOKE_EMAIL (e.g. smoke+ts@yourdomain.com), SMOKE_PASSWORD
//
// Run:   node tooling/scripts/smoke-test.mjs
// =============================================================

import { loadSmokeConfig } from "./_shared/smoke-helpers.mjs";

// --- load supabase/.env if env vars not already set ---
const { URL, ANON, SVC, EMAIL, PASSWORD, FN, REST, svcH: svcHeaders } = loadSmokeConfig({
  missingEnvMessage: "Missing env vars. Need SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.",
});

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const icon = ok ? "PASS" : "FAIL";
  console.log(`[${icon}] ${name}${detail ? `  — ${detail}` : ""}`);
}

async function call(name, url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  const ok = res.status < 400;
  record(name, ok, `HTTP ${res.status}${ok ? "" : " — " + (body?.error?.message ?? text.slice(0,200))}`);
  return { ok, status: res.status, body };
}

// ---------- helpers ----------
const headers = (jwt, extra = {}) => ({
  "apikey": ANON,
  "Authorization": `Bearer ${jwt ?? ANON}`,
  "content-type": "application/json",
  ...extra,
});

// ---------- run ----------
console.log(`\nSmoke test against ${URL}`);
console.log(`Test user: ${EMAIL}\n`);

// 1. Admin-create a confirmed user with the service role, then sign in.
//    (Bypasses the "Confirm email" Auth setting so smoke runs unattended.)
let jwt;
{
  const create = await fetch(`${URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "content-type": "application/json" },
    body: JSON.stringify({
      email: EMAIL, password: PASSWORD, email_confirm: true,
      user_metadata: { full_name: "Smoke Test" },
    }),
  });
  const cBody = await create.json();
  // 422 = "user already exists" — fine, we'll just sign in
  if (!create.ok && create.status !== 422 && cBody?.code !== "email_exists") {
    record("auth.admin-create", false, JSON.stringify(cBody).slice(0, 200));
    printSummary(); process.exit(1);
  }
  record("auth.admin-create", true, EMAIL);

  const signin = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const iBody = await signin.json();
  if (signin.ok && iBody.access_token) {
    jwt = iBody.access_token;
    record("auth.signin", true, EMAIL);
  } else {
    record("auth.signin", false, JSON.stringify(iBody).slice(0, 200));
    printSummary(); process.exit(1);
  }
}

// 2. auth-create-workspace
let workspaceId, branchId;
const wsSlug = `smoke-${Date.now()}`;
{
  const r = await call("fn:auth-create-workspace", FN("auth-create-workspace"), {
    method: "POST", headers: headers(jwt),
    body: JSON.stringify({
      workspace: { name: "Smoke Cafe", slug: wsSlug, currency: "USD" },
      branch:    { name: "Main", address: "Smoke St" },
    }),
  });
  if (!r.ok) { printSummary(); process.exit(1); }
  workspaceId = r.body.workspace.id;
  branchId    = r.body.branch.id;
  console.log(`   workspace=${workspaceId}  branch=${branchId}  slug=${wsSlug}`);
}

// 3. Seed: insert a product + bookable resource + inventory item (service role bypasses RLS)
let productId, resourceId, inventoryItemId;
{
  const p = await fetch(REST("products"), {
    method: "POST", headers: { ...svcHeaders, Prefer: "return=representation" },
    body: JSON.stringify({ workspace_id: workspaceId, name: "Smoke Burger", sku: `SM-${Date.now()}`, price: 9.99, kitchen_required: true }),
  });
  const pBody = await p.json();
  productId = Array.isArray(pBody) ? pBody[0]?.id : pBody.id;
  record("seed.product", !!productId, productId ?? JSON.stringify(pBody).slice(0,200));

  const r = await fetch(REST("bookable_resources"), {
    method: "POST", headers: { ...svcHeaders, Prefer: "return=representation" },
    body: JSON.stringify({ workspace_id: workspaceId, branch_id: branchId, type: "room", name: "Smoke Room", capacity: 4, hourly_rate: 20 }),
  });
  const rBody = await r.json();
  resourceId = Array.isArray(rBody) ? rBody[0]?.id : rBody.id;
  record("seed.resource", !!resourceId, resourceId ?? JSON.stringify(rBody).slice(0,200));

  const i = await fetch(REST("inventory_items"), {
    method: "POST", headers: { ...svcHeaders, Prefer: "return=representation" },
    body: JSON.stringify({ workspace_id: workspaceId, branch_id: branchId, product_id: productId, quantity: 10, unit: "pcs" }),
  });
  const iBody = await i.json();
  inventoryItemId = Array.isArray(iBody) ? iBody[0]?.id : iBody.id;
  record("seed.inventory", !!inventoryItemId, inventoryItemId ?? JSON.stringify(iBody).slice(0,200));
}

// 4. orders-create (with kitchen-required item → should auto-create kitchen ticket)
let orderId, ticketId;
{
  const r = await call("fn:orders-create", FN("orders-create"), {
    method: "POST", headers: headers(jwt),
    body: JSON.stringify({
      workspace_id: workspaceId, branch_id: branchId, type: "dine_in", table_no: "1", tax_rate: 0.1,
      items: [{ product_id: productId, quantity: 2 }],
    }),
  });
  if (r.ok) orderId = r.body.order.id;
  // Look up the kitchen ticket
  if (orderId) {
    const t = await fetch(REST(`kitchen_tickets?order_id=eq.${orderId}&select=id`), { headers: svcHeaders });
    const tBody = await t.json();
    ticketId = tBody[0]?.id;
  }
}

// 5. kitchen-update-status: new -> preparing -> ready -> completed
if (ticketId) {
  for (const status of ["preparing", "ready", "completed"]) {
    await call(`fn:kitchen-update-status (${status})`, FN("kitchen-update-status"), {
      method: "POST", headers: headers(jwt),
      body: JSON.stringify({ workspace_id: workspaceId, ticket_id: ticketId, status }),
    });
  }
}

// 6. payments-create-intent (on a NEW order so we can pay it)
let payOrderId;
{
  const r = await call("fn:orders-create (for payment)", FN("orders-create"), {
    method: "POST", headers: headers(jwt),
    body: JSON.stringify({ workspace_id: workspaceId, branch_id: branchId, type: "takeaway", items: [{ product_id: productId, quantity: 1 }] }),
  });
  if (r.ok) payOrderId = r.body.order.id;

  await call("fn:payments-create-intent", FN("payments-create-intent"), {
    method: "POST", headers: headers(jwt),
    body: JSON.stringify({ workspace_id: workspaceId, order_id: payOrderId }),
  });
}

// 7. payments-cash-confirm (on yet another order so we have a payment + transaction to refund/void)
let cashOrderId, paymentId, transactionId;
{
  const r1 = await call("fn:orders-create (for cash)", FN("orders-create"), {
    method: "POST", headers: headers(jwt),
    body: JSON.stringify({ workspace_id: workspaceId, branch_id: branchId, type: "takeaway", items: [{ product_id: productId, quantity: 1 }] }),
  });
  if (r1.ok) cashOrderId = r1.body.order.id;

  const r2 = await call("fn:payments-cash-confirm", FN("payments-cash-confirm"), {
    method: "POST", headers: headers(jwt),
    body: JSON.stringify({ workspace_id: workspaceId, branch_id: branchId, order_id: cashOrderId, cash_received: 50 }),
  });
  if (r2.ok) {
    paymentId     = r2.body.payment.id;
    transactionId = r2.body.transaction.id;
  }
}

// 8. refunds-create + transactions-void
if (paymentId) {
  await call("fn:refunds-create", FN("refunds-create"), {
    method: "POST", headers: headers(jwt),
    body: JSON.stringify({ workspace_id: workspaceId, branch_id: branchId, payment_id: paymentId, amount: 1.00, reason: "smoke partial refund" }),
  });
}
if (transactionId) {
  // Need a fresh transaction to void (we can't void one already partially refunded)
  await call("fn:transactions-void", FN("transactions-void"), {
    method: "POST", headers: headers(jwt),
    body: JSON.stringify({ workspace_id: workspaceId, transaction_id: transactionId, reason: "smoke void" }),
  });
}

// 9. bookings-hold -> confirm -> cancel
let bookingId;
{
  const start = new Date(Date.now() + 60 * 60_000).toISOString();
  const end   = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  const r = await call("fn:bookings-hold", FN("bookings-hold"), {
    method: "POST", headers: headers(jwt),
    body: JSON.stringify({ workspace_id: workspaceId, branch_id: branchId, resource_id: resourceId, start_time: start, end_time: end }),
  });
  if (r.ok) bookingId = r.body.booking.id;
}
if (bookingId) {
  await call("fn:bookings-confirm", FN("bookings-confirm"), {
    method: "POST", headers: headers(jwt),
    body: JSON.stringify({ workspace_id: workspaceId, booking_id: bookingId }),
  });
  await call("fn:bookings-cancel", FN("bookings-cancel"), {
    method: "POST", headers: headers(jwt),
    body: JSON.stringify({ workspace_id: workspaceId, booking_id: bookingId, reason: "smoke" }),
  });
}

// 10. orders-cancel (need a draft order — create one)
{
  const r = await call("fn:orders-create (to cancel)", FN("orders-create"), {
    method: "POST", headers: headers(jwt),
    body: JSON.stringify({ workspace_id: workspaceId, branch_id: branchId, type: "delivery", items: [{ product_id: productId, quantity: 1 }] }),
  });
  if (r.ok) {
    await call("fn:orders-cancel", FN("orders-cancel"), {
      method: "POST", headers: headers(jwt),
      body: JSON.stringify({ workspace_id: workspaceId, order_id: r.body.order.id, reason: "smoke" }),
    });
  }
}

// 11. inventory-adjust
if (inventoryItemId) {
  await call("fn:inventory-adjust", FN("inventory-adjust"), {
    method: "POST", headers: headers(jwt),
    body: JSON.stringify({ workspace_id: workspaceId, branch_id: branchId, inventory_item_id: inventoryItemId, type: "in", quantity: 5, reason: "smoke restock" }),
  });
}

// 12. payments-webhook — Xendit invoice callback.
//     Sends the real x-callback-token + a well-formed invoice body for an
//     unknown invoice id. The handler authenticates the token, finds no
//     matching payment_intent, and returns 200 { ignored: "unknown intent" }.
//     If this fails with 401, it's almost always that the deployed function's
//     XENDIT_WEBHOOK_TOKEN secret (set via `supabase secrets set`, not this
//     env file) doesn't match SUPABASE env's copy below — verify against the
//     project's actual secrets rather than editing this script.
{
  const token = process.env.XENDIT_WEBHOOK_TOKEN;
  if (!token) {
    record("fn:payments-webhook", false, "XENDIT_WEBHOOK_TOKEN missing from env — cannot authenticate the webhook");
  } else {
    await call("fn:payments-webhook (unknown invoice → ignored)", FN("payments-webhook"), {
      method: "POST", headers: { ...headers(jwt), "x-callback-token": token },
      body: JSON.stringify({
        id:             `inv_smoke_${Date.now()}`,
        external_id:    "order_00000000-0000-0000-0000-000000000000",
        status:         "PAID",
        amount:         9.99,
        payment_method: "GCASH",
      }),
    });
  }
}

// 13. public-orders-create (pay at counter) → public-orders-cancel
//     Guest checkout: no auth, customer identified by phone. The order stays
//     "pending" with no kitchen ticket, so the guest can self-cancel it.
{
  const phone = `0917${String(Date.now()).slice(-7)}`;
  const r = await call("fn:public-orders-create (counter)", FN("public-orders-create"), {
    method: "POST", headers: headers(),
    body: JSON.stringify({
      workspace_slug: wsSlug, branch_id: branchId,
      customer: { name: "Guest Smoke", phone },
      items: [{ product_id: productId, quantity: 1 }],
      payment_method: "pay_at_counter",
    }),
  });
  const orderNo = r.ok ? r.body.order?.order_no : null;
  if (orderNo) {
    await call("fn:public-orders-cancel", FN("public-orders-cancel"), {
      method: "POST", headers: headers(),
      body: JSON.stringify({ order_no: orderNo, phone, reason: "smoke cancel" }),
    });
  }
}

// 14. public-bookings-create (counter, >48h out) → public-track-booking → public-bookings-cancel
//     Check-in is 3 days out so it clears the 48-hour cancellation policy.
//     Uses +639XXXXXXXXX (not the 0918... local format public-orders-create
//     accepts) — public-bookings-create validates this more strictly.
{
  const phone = `+639${String(Date.now()).slice(-9)}`;
  const start = new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString();
  const end   = new Date(Date.now() + 3 * 24 * 60 * 60_000 + 2 * 60 * 60_000).toISOString();
  const r = await call("fn:public-bookings-create (counter)", FN("public-bookings-create"), {
    method: "POST", headers: headers(),
    body: JSON.stringify({
      workspace_slug: wsSlug, branch_id: branchId, resource_id: resourceId,
      customer: { name: "Guest Smoke", phone },
      start_time: start, end_time: end,
      payment_method: "counter",
    }),
  });
  const bookingRef = r.ok ? r.body.booking?.id?.slice(0, 8) : null;
  if (bookingRef) {
    await call("fn:public-track-booking", FN("public-track-booking"), {
      method: "POST", headers: headers(),
      body: JSON.stringify({ booking_ref: bookingRef, phone }),
    });
    await call("fn:public-bookings-cancel", FN("public-bookings-cancel"), {
      method: "POST", headers: headers(),
      body: JSON.stringify({ booking_ref: bookingRef, phone, reason: "smoke cancel" }),
    });
  }
}

printSummary();

function printSummary() {
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n──────── Smoke test summary ────────`);
  console.log(`  Total:  ${results.length}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  if (failed) {
    console.log(`\nFailures:`);
    for (const r of results.filter(r => !r.ok)) console.log(`  - ${r.name}: ${r.detail}`);
  }
  process.exit(failed ? 1 : 0);
}

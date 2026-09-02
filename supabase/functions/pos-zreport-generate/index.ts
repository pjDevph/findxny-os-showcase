// POST /pos-zreport-generate — Generate an X-report (read-only snapshot) or
// Z-report (closes the day, saves to z_reports) for BIR-compliant POS reporting.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, InternalError } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

// ── Request schema ────────────────────────────────────────────────────────────

const Body = z.object({
  workspace_id:  z.string().uuid(),
  branch_id:     z.string().uuid(),
  type:          z.enum(["x", "z"]),
  report_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  opening_float: z.number().min(0).optional().default(0),
});

type BodyType = z.infer<typeof Body>;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return today's date in UTC+8 as a YYYY-MM-DD string. */
function todayUtc8(): string {
  const now = new Date();
  // Add 8 hours (in ms) to UTC to get Philippine Standard Time date
  const pstMs = now.getTime() + 8 * 60 * 60 * 1000;
  return new Date(pstMs).toISOString().slice(0, 10);
}

/** Sum a numeric field over an array, coercing null/undefined to 0. */
function sumField<T>(arr: T[], field: keyof T): number {
  return arr.reduce((acc, row) => acc + (Number(row[field]) || 0), 0);
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== "POST") throw BadRequest("POST only");

    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin      = adminClient();
    const reportDate = body.report_date ?? todayUtc8();

    // ── 2. Check if already closed (Z only) ──────────────────────────────────
    const { data: existing, error: existErr } = await admin
      .from("z_reports")
      .select("*")
      .eq("branch_id", body.branch_id)
      .eq("report_date", reportDate)
      .maybeSingle();

    if (existErr) throw BadRequest(existErr.message);

    if (existing) {
      // Return the stored payload regardless of X or Z request; flag it closed
      const existingPayload = (existing.payload as Record<string, unknown>) ?? {};
      return json({ ...existingPayload, already_closed: true });
    }

    // ── 3a. Fetch orders for the day ─────────────────────────────────────────
    const dayStart  = `${reportDate}T00:00:00+08:00`;
    const nextDay   = new Date(reportDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const dayEnd    = `${nextDay.toISOString().slice(0, 10)}T00:00:00+08:00`;

    const { data: orders, error: ordersErr } = await admin
      .from("orders")
      .select("id, order_no, total, subtotal, discount, tax, service_fee, status, payment_status, source")
      .eq("workspace_id", body.workspace_id)
      .eq("branch_id", body.branch_id)
      .gte("created_at", dayStart)
      .lt("created_at", dayEnd)
      .order("created_at", { ascending: true });

    if (ordersErr) throw BadRequest(ordersErr.message);

    const allOrders       = orders ?? [];
    const completedOrders = allOrders.filter((o) => o.status === "completed");
    const cancelledOrders = allOrders.filter((o) => o.status === "cancelled");

    // ── 3b. Fetch payment intents for those orders ────────────────────────────
    const orderIds = allOrders.map((o) => o.id);
    let paymentIntents: Array<{ order_id: string; amount: number; provider: string }> = [];

    if (orderIds.length > 0) {
      const { data: intents, error: intentsErr } = await admin
        .from("payment_intents")
        .select("order_id, amount, provider")
        .in("order_id", orderIds)
        .eq("status", "succeeded");

      if (intentsErr) throw BadRequest(intentsErr.message);
      paymentIntents = (intents ?? []) as typeof paymentIntents;
    }

    // ── 3c. Fetch cash drawer events (cash_in / cash_out) for the day ─────────
    let cash_in  = 0;
    let cash_out = 0;

    try {
      const { data: drawerEvents, error: drawerErr } = await admin
        .from("cash_drawer_events")
        .select("type, amount")
        .eq("branch_id", body.branch_id)
        .gte("created_at", dayStart)
        .lt("created_at", dayEnd);

      if (!drawerErr && drawerEvents) {
        for (const ev of drawerEvents) {
          if (ev.type === "cash_in")  cash_in  += Number(ev.amount) || 0;
          if (ev.type === "cash_out") cash_out += Number(ev.amount) || 0;
        }
      }
    } catch {
      // Table may not have a branch_id column on older deployments; fall back to 0
      cash_in  = 0;
      cash_out = 0;
    }

    // ── 3d. Fetch refunds ──────────────────────────────────────────────────────
    // Sourced from `transactions` (type='refund'), the same table
    // reports-refund-total reads — scoped to this branch/day like every other
    // figure on this report. This used to read booking_payment_transactions,
    // which never receives a row for an order-level refund (refunds-create
    // writes to `refunds`/`transactions`, not booking_payment_transactions),
    // so real order refunds never showed up here even though gross/net sales
    // above are order-only too — both sides of the report now agree on scope.
    let refunds: Array<{ amount: number }> = [];
    try {
      const { data: refundRows, error: refundErr } = await admin
        .from("transactions")
        .select("amount")
        .eq("workspace_id", body.workspace_id)
        .eq("branch_id", body.branch_id)
        .eq("type", "refund")
        .eq("status", "completed")
        .gte("created_at", dayStart)
        .lt("created_at", dayEnd);

      if (!refundErr && refundRows) {
        refunds = refundRows.map((r) => ({ amount: Math.abs(Number(r.amount) || 0) }));
      }
    } catch {
      refunds = [];
    }

    // ── 3e. Calculations ──────────────────────────────────────────────────────
    // gross_sales = net total + discounts (pre-discount gross)
    const gross_sales     = +(sumField(completedOrders, "total") + sumField(completedOrders, "discount")).toFixed(2);
    const discount_amount = +sumField(completedOrders, "discount").toFixed(2);
    const net_sales       = +sumField(completedOrders, "total").toFixed(2);

    // Real collected VAT, summed straight from each order's own `tax` column
    // (computed at checkout time via computePosOrderTotals, additive on top of
    // subtotal — not VAT-inclusive) — not a hardcoded 12% derived by dividing
    // net_sales by 1.12, which was both the wrong formula (tax is additive
    // here, not inclusive) and ignored per-order tax exemptions/rate changes.
    // Orders with tax=0 (e.g. a senior-citizen/PWD VAT-exempt sale, or the
    // checkout's "apply tax" toggle switched off) fall into vat_exempt_sales
    // instead of vatable_sales, mirroring how they were actually rung up.
    const vatableOrders   = completedOrders.filter((o) => Number(o.tax) > 0);
    const exemptOrders    = completedOrders.filter((o) => Number(o.tax) <= 0);
    const vatable_sales   = +sumField(vatableOrders, "subtotal").toFixed(2);
    const vat_exempt_sales_real = +sumField(exemptOrders, "subtotal").toFixed(2);
    const vat_amount      = +sumField(completedOrders, "tax").toFixed(2);

    // Payment breakdown by method
    const payment_breakdown: Record<string, number> = {
      cash: 0, gcash: 0, maya: 0, card: 0, qrph: 0, other: 0,
    };
    for (const intent of paymentIntents) {
      const provider = intent.provider?.toLowerCase() ?? "other";
      const amount   = Number(intent.amount) || 0;
      if (provider in payment_breakdown) {
        payment_breakdown[provider] += amount;
      } else {
        payment_breakdown.other += amount;
      }
    }
    for (const key of Object.keys(payment_breakdown)) {
      payment_breakdown[key] = +payment_breakdown[key].toFixed(2);
    }

    const void_count  = cancelledOrders.length;
    const void_amount = +sumField(cancelledOrders, "total").toFixed(2);

    const refund_count  = refunds.length;
    const refund_amount = +sumField(refunds, "amount").toFixed(2);

    const order_count     = completedOrders.length;
    const cancelled_count = cancelledOrders.length;

    const first_receipt_no = completedOrders[0]?.order_no ?? null;
    const last_receipt_no  = completedOrders[completedOrders.length - 1]?.order_no ?? null;

    const opening_float = body.opening_float ?? 0;
    const expected_cash = +(opening_float + payment_breakdown.cash + cash_in - cash_out).toFixed(2);

    // ── 3f. Branch + workspace info for report header ─────────────────────────
    const [branchRes, wsRes] = await Promise.all([
      admin.from("branches").select("name, address").eq("id", body.branch_id).maybeSingle(),
      admin.from("workspaces").select("name, receipt_tin").eq("id", body.workspace_id).maybeSingle(),
    ]);

    if (branchRes.error) throw BadRequest(branchRes.error.message);
    if (wsRes.error)     throw BadRequest(wsRes.error.message);

    const branch    = branchRes.data;
    const workspace = wsRes.data;

    const { data: profile } = await admin
      .from("profiles").select("full_name").eq("id", ctx.userId).maybeSingle();
    const cashier_name = profile?.full_name ?? null;

    // ── 4. Build report object ────────────────────────────────────────────────
    const report: Record<string, unknown> = {
      report_no:        0,           // filled for Z below
      report_type:      body.type,
      report_date:      reportDate,
      already_closed:   false,
      branch_name:      branch?.name          ?? null,
      workspace_name:   workspace?.name       ?? null,
      tin:              workspace?.receipt_tin ?? null,
      gross_sales,
      discount_amount,
      net_sales,
      vatable_sales,
      vat_amount,
      vat_exempt_sales: vat_exempt_sales_real,
      zero_rated_sales: 0,
      payment_breakdown,
      void_count,
      void_amount,
      refund_count,
      refund_amount,
      order_count,
      cancelled_count,
      first_receipt_no,
      last_receipt_no,
      opening_float,
      cash_in:          +cash_in.toFixed(2),
      cash_out:         +cash_out.toFixed(2),
      expected_cash,
      cashier_name,
      generated_at:     new Date().toISOString(),
    };

    // ── 5. Z-report: persist to z_reports ────────────────────────────────────
    if (body.type === "z") {
      // Determine next sequential report_no for this branch
      const { data: maxRow, error: maxErr } = await admin
        .from("z_reports")
        .select("report_no")
        .eq("branch_id", body.branch_id)
        .order("report_no", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (maxErr) throw BadRequest(maxErr.message);

      const newReportNo = (Number(maxRow?.report_no) || 0) + 1;
      report.report_no  = newReportNo;

      // Populate the real typed columns (not just `payload`) — z_reports'
      // schema (0069_z_reports.sql) defines gross_sales/net_sales/vat_amount/
      // etc. as NOT NULL DEFAULT 0 columns that both this table's readers
      // (web admin z-reports list, POS z-reports list) select directly, so
      // leaving them unset made every saved Z-report display as zeros even
      // though the real numbers were sitting in `payload`. Also uses the
      // schema's actual `created_by`/`created_at` columns — the previous
      // `generated_by`/`generated_at` keys don't exist on this table.
      const { data: saved, error: saveErr } = await admin
        .from("z_reports")
        .insert({
          branch_id:         body.branch_id,
          workspace_id:      body.workspace_id,
          report_date:       reportDate,
          report_no:         newReportNo,
          report_type:       "z",
          gross_sales,
          discount_amount,
          net_sales,
          vatable_sales,
          vat_amount,
          vat_exempt_sales:  vat_exempt_sales_real,
          zero_rated_sales:  0,
          void_count,
          void_amount,
          refund_count,
          refund_amount,
          payment_breakdown,
          order_count,
          cancelled_count,
          first_receipt_no,
          last_receipt_no,
          opening_float,
          cash_in:           +cash_in.toFixed(2),
          cash_out:          +cash_out.toFixed(2),
          expected_cash,
          cashier_id:        ctx.userId,
          cashier_name,
          created_by:        ctx.userId,
          payload:           report,
        })
        .select()
        .single();

      if (saveErr) {
        // Unique-constraint violation: another request just closed this date
        if (saveErr.code === "23505") {
          const { data: raceRow } = await admin
            .from("z_reports")
            .select("*")
            .eq("branch_id", body.branch_id)
            .eq("report_date", reportDate)
            .maybeSingle();
          if (raceRow) {
            const racePayload = (raceRow.payload as Record<string, unknown>) ?? {};
            return json({ ...racePayload, already_closed: true });
          }
        }
        throw InternalError(`Failed to save Z-report: ${saveErr.message}`);
      }

      EdgeRuntime.waitUntil(audit({
        workspaceId: body.workspace_id,
        actorId:     ctx.userId,
        action:      "zreport.generated",
        entityType:  "z_report",
        entityId:    saved?.id ?? null,
        after: {
          report_no:   newReportNo,
          report_date: reportDate,
          branch_id:   body.branch_id,
        },
      }));
    }

    // ── 6. Return ─────────────────────────────────────────────────────────────
    return json(report);

  } catch (err) {
    return handleError(err);
  }
});

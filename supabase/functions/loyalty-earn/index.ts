// POST /loyalty-earn — award loyalty points for a completed order.
// Body: { workspace_id, customer_id, order_id, order_total }
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  customer_id:  z.string().uuid(),
  order_id:     z.string().uuid(),
  order_total:  z.number().min(0),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();

    // 1+3. Fetch active loyalty rules and current customer balance in parallel
    const [rulesRes, custRes] = await Promise.all([
      admin.from("loyalty_rules")
        .select("*")
        .eq("workspace_id", body.workspace_id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(),
      admin.from("customers")
        .select("id, points_balance, workspace_id")
        .eq("id", body.customer_id)
        .eq("workspace_id", body.workspace_id)
        .maybeSingle(),
    ]);
    if (rulesRes.error) throw BadRequest(rulesRes.error.message);
    const rules = rulesRes.data;
    if (!rules) return json({ skipped: true, reason: "No active loyalty rules" });

    // 2. Compute points earned
    const pointsEarned = Math.floor(body.order_total * rules.points_per_peso);
    if (pointsEarned < 1) {
      return json({ skipped: true, reason: "Order total too small to earn points" });
    }

    // Verify customer (workspace already scoped in the fetch above)
    if (custRes.error) throw BadRequest(custRes.error.message);
    const customer = custRes.data;
    if (!customer) throw NotFound("Customer not found");

    const currentBalance = customer.points_balance ?? 0;

    // 4. Compute new balance
    const newBalance = currentBalance + pointsEarned;

    // 5. Update customer points_balance
    const { error: updateErr } = await admin
      .from("customers")
      .update({ points_balance: newBalance })
      .eq("id", body.customer_id)
      .eq("workspace_id", body.workspace_id);
    if (updateErr) throw BadRequest(updateErr.message);

    // 6. Insert ledger entry
    const { data: transaction, error: insertErr } = await admin
      .from("customer_points")
      .insert({
        workspace_id:  body.workspace_id,
        customer_id:   body.customer_id,
        order_id:      body.order_id,
        type:          "earn",
        points:        pointsEarned,
        balance_after: newBalance,
        created_by:    ctx.userId,
      })
      .select()
      .single();
    if (insertErr) throw BadRequest(insertErr.message);

    // 7. Audit
    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id,
      actorId:     ctx.userId,
      action:      "loyalty.earn",
      entityType:  "customer_points",
      entityId:    transaction.id,
      before:      { points_balance: currentBalance },
      after:       { points_balance: newBalance, points_earned: pointsEarned },
    }));

    return json({ points_earned: pointsEarned, new_balance: newBalance, transaction });
  } catch (err) { return handleError(err); }
});

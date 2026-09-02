// POST /loyalty-redeem — redeem loyalty points against an order.
// Body: { workspace_id, customer_id, order_id, points_to_redeem }
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id:     z.string().uuid(),
  customer_id:      z.string().uuid(),
  order_id:         z.string().uuid(),
  points_to_redeem: z.number().int().positive(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();

    // 1+3. Fetch active loyalty rules and customer balance in parallel
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
    if (!rules) throw BadRequest("No active loyalty rules");

    // 2. Validate minimum redemption threshold
    if (body.points_to_redeem < rules.min_redeem_points) {
      throw BadRequest(
        `Minimum redemption is ${rules.min_redeem_points} points; got ${body.points_to_redeem}`,
      );
    }

    // Verify customer and sufficient balance (workspace already scoped in the fetch above)
    if (custRes.error) throw BadRequest(custRes.error.message);
    const customer = custRes.data;
    if (!customer) throw NotFound("Customer not found");

    const currentBalance = customer.points_balance ?? 0;
    if (currentBalance < body.points_to_redeem) {
      throw BadRequest("Insufficient points balance");
    }

    // 4. Compute peso value of redeemed points
    const pesoValue  = body.points_to_redeem * rules.peso_per_point;
    const newBalance = currentBalance - body.points_to_redeem;

    // 5. Update customer points_balance
    const { error: updateErr } = await admin
      .from("customers")
      .update({ points_balance: newBalance })
      .eq("id", body.customer_id)
      .eq("workspace_id", body.workspace_id);
    if (updateErr) throw BadRequest(updateErr.message);

    // 6. Insert ledger entry (points stored as negative for redemption)
    const { data: transaction, error: insertErr } = await admin
      .from("customer_points")
      .insert({
        workspace_id:  body.workspace_id,
        customer_id:   body.customer_id,
        order_id:      body.order_id,
        type:          "redeem",
        points:        -body.points_to_redeem,
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
      action:      "loyalty.redeem",
      entityType:  "customer_points",
      entityId:    transaction.id,
      before:      { points_balance: currentBalance },
      after:       { points_balance: newBalance, points_redeemed: body.points_to_redeem, peso_value: pesoValue },
    }));

    return json({
      points_redeemed: body.points_to_redeem,
      peso_value:      pesoValue,
      new_balance:     newBalance,
      transaction,
    });
  } catch (err) { return handleError(err); }
});

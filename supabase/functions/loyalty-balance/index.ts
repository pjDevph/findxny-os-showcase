// POST /loyalty-balance — fetch a customer's points balance, rules, and transaction history.
// Body: { workspace_id, customer_id, limit? }
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  customer_id:  z.string().uuid(),
  limit:        z.number().int().min(1).max(100).optional().default(20),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();

    // 1. Fetch customer (verify workspace)
    const { data: customer, error: custErr } = await admin
      .from("customers")
      .select("id, name, points_balance, workspace_id")
      .eq("id", body.customer_id)
      .eq("workspace_id", body.workspace_id)
      .maybeSingle();
    if (custErr) throw BadRequest(custErr.message);
    if (!customer) throw NotFound("Customer not found");

    // 2+3. Fetch rules and transaction history in parallel
    const [rulesRes, txRes] = await Promise.all([
      admin.from("loyalty_rules")
        .select("*")
        .eq("workspace_id", body.workspace_id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(),
      admin.from("customer_points")
        .select("*")
        .eq("workspace_id", body.workspace_id)
        .eq("customer_id", body.customer_id)
        .order("created_at", { ascending: false })
        .limit(body.limit),
    ]);
    if (rulesRes.error) throw BadRequest(rulesRes.error.message);
    if (txRes.error)    throw BadRequest(txRes.error.message);
    const loyaltyRule  = rulesRes.data;
    const transactions = txRes.data;

    const balance    = customer.points_balance ?? 0;
    const pesoValue  = loyaltyRule ? balance * loyaltyRule.peso_per_point : 0;

    return json({
      balance,
      peso_value:   pesoValue,
      rules:        loyaltyRule ?? null,
      transactions: transactions ?? [],
    });
  } catch (err) { return handleError(err); }
});

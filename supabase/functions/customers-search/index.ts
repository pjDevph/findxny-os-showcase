// POST /customers-search { workspace_id, query, branch_id?, limit? }
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { ilikePattern } from "../_shared/postgrest.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  query:        z.string().min(2),
  branch_id:    z.string().uuid().optional(),
  limit:        z.number().int().positive().max(20).optional(),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx  = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin   = adminClient();
    const limit   = body.limit ?? 10;
    const pattern = ilikePattern(body.query);

    // Fetch customers matching name or phone via ILIKE, with nested orders for aggregation.
    // Equivalent SQL:
    //   SELECT c.*, MAX(o.created_at) as last_order_at, COUNT(o.id)::int as total_orders
    //   FROM customers c
    //   LEFT JOIN orders o ON o.customer_id = c.id
    //   WHERE c.workspace_id = :workspace_id
    //     AND (c.name ILIKE '%' || :query || '%' OR c.phone ILIKE '%' || :query || '%')
    //   GROUP BY c.id
    //   ORDER BY last_order_at DESC NULLS LAST, c.name
    //   LIMIT :limit
    const { data: rows, error } = await admin
      .from("customers")
      .select("id, name, phone, email, notes, orders(created_at)")
      .eq("workspace_id", body.workspace_id)
      .or(`name.ilike.${pattern},phone.ilike.${pattern}`)
      .limit(limit * 4); // over-fetch to compensate before JS sort+trim
    if (error) throw BadRequest(error.message);

    // Aggregate order stats in JS (PostgREST does not support LEFT JOIN GROUP BY inline)
    const customers = (rows ?? []).map((c: any) => {
      const orderDates: string[] = (c.orders ?? []).map((o: any) => o.created_at as string);
      orderDates.sort((a, b) => (a > b ? -1 : 1));
      return {
        id:            c.id,
        name:          c.name,
        phone:         c.phone ?? null,
        email:         c.email ?? null,
        notes:         c.notes ?? null,
        last_order_at: orderDates[0] ?? null,
        total_orders:  orderDates.length,
      };
    });

    // ORDER BY last_order_at DESC NULLS LAST, c.name
    customers.sort((a: any, b: any) => {
      if (a.last_order_at && b.last_order_at) {
        return a.last_order_at > b.last_order_at ? -1 : 1;
      }
      if (a.last_order_at) return -1;
      if (b.last_order_at) return 1;
      return (a.name as string).localeCompare(b.name);
    });

    return json({ customers: customers.slice(0, limit) });
  } catch (err) { return handleError(err); }
});

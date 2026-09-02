// POST /payments-create-intent — creates a Stripe PaymentIntent for an order or booking.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { audit } from "../_shared/auditLog.ts";
import { paymentProvider } from "../_shared/paymentProvider.ts";
import { parseBody, z } from "../_shared/validators.ts";

const Body = z.object({
  workspace_id: z.string().uuid(),
  order_id:     z.string().uuid().optional(),
  booking_id:   z.string().uuid().optional(),
}).refine((b) => b.order_id || b.booking_id, "Provide order_id or booking_id");

type BodyType = Awaited<ReturnType<typeof parseBody<typeof Body>>>;
type AdminClient = ReturnType<typeof adminClient>;

async function resolveAmountForIntent(admin: AdminClient, body: BodyType): Promise<number> {
  if (body.order_id) {
    const { data: o, error } = await admin.from("orders")
      .select("total, workspace_id").eq("id", body.order_id).maybeSingle();
    if (error) throw BadRequest(error.message);
    if (!o || o.workspace_id !== body.workspace_id) throw NotFound("Order not found");
    return Number(o.total);
  }
  const { data: b, error } = await admin.from("bookings")
    .select("total, workspace_id").eq("id", body.booking_id ?? "").maybeSingle();
  if (error) throw BadRequest(error.message);
  if (!b || b.workspace_id !== body.workspace_id) throw NotFound("Booking not found");
  return Number(b.total);
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.STAFF_WRITE);

    const admin = adminClient();
    let currency = "PHP";
    const amount = await resolveAmountForIntent(admin, body);

    const { data: ws } = await admin.from("workspaces").select("currency").eq("id", body.workspace_id).single();
    if (ws?.currency) currency = ws.currency;

    const provider = await paymentProvider.createIntent(amount, currency, {
      workspace_id: body.workspace_id,
      order_id: body.order_id ?? "",
      booking_id: body.booking_id ?? "",
    });

    const { data: intent, error: iErr } = await admin.from("payment_intents").insert({
      workspace_id: body.workspace_id,
      order_id: body.order_id ?? null,
      booking_id: body.booking_id ?? null,
      provider: "stripe",
      provider_intent_id: provider.id,
      amount, currency,
      status: "pending",
      client_secret: provider.client_secret,
      metadata: { created_by: ctx.userId },
    }).select().single();
    if (iErr) throw BadRequest(iErr.message);

    EdgeRuntime.waitUntil(audit({
      workspaceId: body.workspace_id, actorId: ctx.userId,
      action: "payment.intent.create", entityType: "payment_intent", entityId: intent.id, after: intent,
    }));
    return json({ intent }, 201);
  } catch (err) { return handleError(err); }
});

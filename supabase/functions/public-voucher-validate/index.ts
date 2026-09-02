// POST /public-voucher-validate — read-only voucher check for customer checkout.
// No auth required; no usage is recorded.
import { adminClient } from "../_shared/supabaseClient.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound } from "../_shared/errors.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { rateLimit } from "../_shared/rateLimit.ts";
import { phStartOfDay, phEndOfDay } from "../_shared/dates.ts";

const Body = z.object({
  workspace_slug: z.string().min(1).max(100),
  voucher_code:   z.string().min(1).max(50),
  subtotal:       z.number().min(0),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    await rateLimit(req, { scope: "public-voucher-validate", max: 30, windowSec: 60 });
    const body = await parseBody(req, Body);

    const admin = adminClient();

    const { data: ws } = await admin.from("workspaces")
      .select("id").eq("slug", body.workspace_slug).maybeSingle();
    if (!ws) throw NotFound("Workspace not found");

    const code = body.voucher_code.trim().toUpperCase();
    const subtotal = body.subtotal;

    const { data: voucher } = await admin.from("vouchers")
      .select("id,code,name,discount_type,discount_value,max_cap,min_spend,usage_limit,usage_count,applies_to,valid_from,valid_until,status")
      .eq("workspace_id", ws.id)
      .eq("code", code)
      .maybeSingle();

    if (!voucher) return json({ valid: false, reason: `Voucher "${code}" not found`, discount_amount: 0 });

    const now = new Date();
    if (voucher.status === "disabled")
      return json({ valid: false, reason: "This voucher is no longer active", discount_amount: 0 });
    if (voucher.valid_until && phEndOfDay(voucher.valid_until) < now)
      return json({ valid: false, reason: "This voucher has expired", discount_amount: 0 });
    if (voucher.valid_from && phStartOfDay(voucher.valid_from) > now)
      return json({ valid: false, reason: `This voucher is valid from ${new Date(voucher.valid_from + "T00:00:00+08:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`, discount_amount: 0 });
    if (voucher.usage_limit !== null && voucher.usage_count >= voucher.usage_limit)
      return json({ valid: false, reason: "This voucher has reached its usage limit", discount_amount: 0 });
    if (Number(voucher.min_spend) > 0 && subtotal < Number(voucher.min_spend))
      return json({ valid: false, reason: `Minimum order of ₱${Number(voucher.min_spend).toFixed(2)} required`, discount_amount: 0 });

    let discount: number;
    if (voucher.discount_type === "percentage") {
      const raw = subtotal * (Number(voucher.discount_value) / 100);
      discount = voucher.max_cap ? Math.min(raw, Number(voucher.max_cap)) : raw;
    } else {
      discount = Math.min(Number(voucher.discount_value), subtotal);
    }
    discount = +discount.toFixed(2);

    return json({
      valid: true,
      reason: null,
      discount_amount: discount,
      voucher_code: voucher.code,
      voucher_name: voucher.name,
    });
  } catch (err) { return handleError(err); }
});

// Shared POS order pricing: tax, senior/PWD discount, voucher discount, and
// the manager-approval gate for large manual discounts. Used by orders-create,
// orders-update-pending, and order-items-cancel so the three totals-computing
// paths can't drift from each other again.
//
// Not related to public-orders-create's local computeOrderTotals(), which has
// its own guest/QR service-fee model — deliberately out of scope here.
import { adminClient } from "./supabaseClient.ts";
import { BadRequest } from "./errors.ts";

export interface OrderTotalsInput {
  subtotal: number;
  taxRate: number;
  svcRate?: number;
  isSeniorPwd: boolean;
  manualDiscountAmount: number;
  voucherDiscount?: number;
}

export interface OrderTotals {
  tax: number;
  service_fee: number;
  discount: number;
  discount_source: string | null;
  total: number;
}

export async function resolveRates(
  admin: ReturnType<typeof adminClient>, workspaceId: string,
): Promise<{ taxRate: number; svcRate: number }> {
  const { data: ws } = await admin.from("workspaces").select("tax_rate, service_rate").eq("id", workspaceId).maybeSingle();
  return { taxRate: Number(ws?.tax_rate ?? 0), svcRate: Number(ws?.service_rate ?? 0) };
}

export function computePosOrderTotals(input: OrderTotalsInput): OrderTotals {
  const { subtotal, taxRate, svcRate = 0, isSeniorPwd, voucherDiscount = 0 } = input;
  const tax = +(subtotal * taxRate).toFixed(2);
  const service_fee = +(subtotal * svcRate).toFixed(2);

  // SC/PWD: 20% of VAT-exclusive subtotal using workspace tax rate.
  let manualDiscount = input.manualDiscountAmount;
  if (isSeniorPwd) {
    manualDiscount = Math.round((subtotal / (1 + taxRate)) * 0.2 * 100) / 100;
  }

  const discount = +Math.min(manualDiscount + voucherDiscount, subtotal + tax + service_fee).toFixed(2);

  let discount_source: string | null = null;
  if (discount > 0) {
    const hasManual = manualDiscount > 0;
    const hasVoucher = voucherDiscount > 0;
    if (isSeniorPwd)                    discount_source = "senior_pwd";
    else if (hasManual && hasVoucher)   discount_source = "mixed";
    else if (hasVoucher)                discount_source = "voucher";
    else                                discount_source = "manual";
  }

  const total = +(subtotal + tax + service_fee - discount).toFixed(2);

  return { tax, service_fee, discount, discount_source, total };
}

/**
 * Large manual/SC-PWD discounts (>₱500) require a valid, unused manager
 * approval whose recorded ceiling (metadata.amount) isn't exceeded. Voucher
 * discounts are exempt — they're already bounded by the voucher's own rules.
 */
export async function validateLargeDiscount(
  admin: ReturnType<typeof adminClient>,
  discount: number,
  isSeniorPwd: boolean,
  managerApprovalId: string | undefined,
): Promise<void> {
  if (discount <= 500 || isSeniorPwd) return;
  if (!managerApprovalId) {
    throw BadRequest("Large discount requires manager approval");
  }
  const { data: approval } = await admin
    .from("manager_approvals")
    .select("id,status,metadata")
    .eq("id", managerApprovalId)
    .maybeSingle();
  if (approval?.status !== "approved") {
    throw BadRequest("Manager approval for large discount is invalid");
  }
  const approvedAmount = Number((approval.metadata as Record<string, unknown>)?.amount ?? 0);
  if (approvedAmount > 0 && discount > approvedAmount) {
    throw BadRequest(`Discount ₱${discount} exceeds approved amount ₱${approvedAmount}`);
  }
}

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveWorkspaceId } from "@/lib/admin-api";
import VouchersClient from "./VouchersClient";

export const dynamic = "force-dynamic";

export default async function VouchersPage() {
  const wsId = await resolveWorkspaceId();

  if (!wsId) {
    return (
      <div className="admin-header">
        <div>
          <h1>Vouchers &amp; Discounts</h1>
          <div className="sub">You must be a member of a workspace to view this page.</div>
        </div>
      </div>
    );
  }

  const supabase = createSupabaseServerClient();

  const [{ data: vouchers }, { data: redemptions }] = await Promise.all([
    supabase
      .from("vouchers")
      .select("*")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false }),
    supabase
      .from("voucher_redemptions")
      .select("voucher_id, discount_amount")
      .eq("workspace_id", wsId),
  ]);

  // Aggregate redemption stats per voucher
  const statsMap: Record<string, { redemptions: number; totalDiscount: number }> = {};
  for (const r of redemptions ?? []) {
    if (!r.voucher_id) continue;
    if (!statsMap[r.voucher_id]) statsMap[r.voucher_id] = { redemptions: 0, totalDiscount: 0 };
    statsMap[r.voucher_id].redemptions += 1;
    statsMap[r.voucher_id].totalDiscount += Number(r.discount_amount ?? 0);
  }

  return (
    <VouchersClient
      workspaceId={wsId}
      initialVouchers={vouchers ?? []}
      statsMap={statsMap}
    />
  );
}

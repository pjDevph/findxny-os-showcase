"use client";

import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { adminClient } from "@/lib/admin-client";

// Wraps the generic ExportCsvButton with transactions-specific paging + flatten
// logic. Resolves the workspace via `me()` lazily so it works from a client
// component without a wsId prop.
export function ExportTransactionsButton({
  type, status,
}: {
  type?: string;
  status?: string;
}) {
  let wsId: string | null = null;
  async function getWsId() {
    if (wsId) return wsId;
    const { memberships } = await adminClient.me();
    wsId = memberships[0]?.workspace_id ?? null;
    return wsId;
  }

  return (
    <ExportCsvButton
      label="Export CSV"
      filename={`transactions-${new Date().toISOString().slice(0, 10)}.csv`}
      columns={["created_at", "reference", "order_no", "type", "status", "amount", "currency"]}
      fetchPage={async (offset, limit) => {
        const ws = await getWsId();
        if (!ws) return { rows: [], total: 0 };
        const res = await adminClient.transactions(ws, { type, status, limit, offset });
        return { rows: res.transactions ?? [], total: res.total ?? 0 };
      }}
      flatten={(t: any) => ({
        created_at: t.created_at,
        reference:  t.reference ?? t.id,
        order_no:   t.orders?.order_no ?? "",
        type:       t.type,
        status:     t.status,
        amount:     Number(t.amount),
        currency:   t.currency ?? "",
      })}
    />
  );
}

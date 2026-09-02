"use client";

import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { adminClient } from "@/lib/admin-client";

export function ExportBookingsButton({ status }: { status?: string }) {
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
      filename={`bookings-${new Date().toISOString().slice(0, 10)}.csv`}
      columns={[
        "id", "status", "start_time", "end_time",
        "customer_name", "customer_phone", "customer_email",
        "resource_name", "resource_type", "branch_name",
        "total", "notes", "created_at",
      ]}
      fetchPage={async (offset, limit) => {
        const ws = await getWsId();
        if (!ws) return { rows: [], total: 0 };
        const res = await adminClient.bookings(ws, { status, limit, offset });
        return { rows: res.bookings ?? [], total: res.total ?? 0 };
      }}
      flatten={(b: any) => ({
        id:             b.id,
        status:         b.status,
        start_time:     b.start_time,
        end_time:       b.end_time,
        customer_name:  b.customers?.name ?? "",
        customer_phone: b.customers?.phone ?? "",
        customer_email: b.customers?.email ?? "",
        resource_name:  b.bookable_resources?.name ?? "",
        resource_type:  b.bookable_resources?.type ?? "",
        branch_name:    b.branches?.name ?? "",
        total:          Number(b.total ?? 0),
        notes:          b.notes ?? "",
        created_at:     b.created_at,
      })}
    />
  );
}

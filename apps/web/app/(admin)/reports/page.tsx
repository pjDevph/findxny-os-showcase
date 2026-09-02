import { adminApi, resolveWorkspaceId } from "@/lib/admin-api";
import { ReportsClient } from "./ReportsClient";
import "./reports.css";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const wsId = await resolveWorkspaceId();

  const [data, custResult, onlineCustResult] = wsId
    ? await Promise.all([
        adminApi.reports(wsId, { days: 30 }),
        adminApi.customers(wsId, { limit: 500 }).catch((err) => { console.error("[reports] customers fetch failed:", err?.message ?? err); return { customers: [] as any[], total: 0, limit: 500, offset: 0 }; }),
        adminApi.onlineCustomers(wsId).catch((err) => { console.error("[reports] onlineCustomers fetch failed:", err?.message ?? err); return { orders: [] as any[] }; }),
      ])
    : [
        { orders: [] as any[], transactions: [] as any[], order_items: [] as any[], expenses: [] as any[] },
        { customers: [] as any[], total: 0, limit: 500, offset: 0 },
        { orders: [] as any[] },
      ];

  const now = new Date();
  const from30 = new Date(now);
  from30.setDate(from30.getDate() - 29);

  return (
    <ReportsClient
      transactions={data.transactions}
      orders={data.orders}
      orderItems={data.order_items}
      expenses={(data as any).expenses ?? []}
      customers={custResult.customers}
      onlineOrders={onlineCustResult.orders}
      initialFrom={from30.toISOString().slice(0, 10)}
      initialTo={now.toISOString().slice(0, 10)}
    />
  );
}

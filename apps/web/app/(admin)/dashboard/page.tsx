import { adminApi, resolveWorkspaceId } from "@/lib/admin-api";
import { DashboardClient } from "./DashboardClient";
import "./dashboard.css";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const wsId = await resolveWorkspaceId();

  const [dashData, reportsData, branchesData] = wsId
    ? await Promise.all([
        adminApi.dashboard(wsId),
        adminApi.reports(wsId, { days: 1 }),
        adminApi.branches(wsId).catch(() => ({ branches: [] as any[] })),
      ])
    : [
        {
          recent_orders: [] as any[],
          today_orders: [] as any[],
          kitchen_tickets: [] as any[],
          transactions: [] as any[],
          active_bookings: [] as any[],
        },
        { orders: [] as any[], transactions: [] as any[], order_items: [] as any[] },
        { branches: [] as any[] },
      ];

  return (
    <DashboardClient
      todayOrders={dashData.today_orders}
      transactions={reportsData.transactions}
      orderItems={reportsData.order_items}
      branches={branchesData.branches}
    />
  );
}

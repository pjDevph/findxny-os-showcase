import { adminApi, resolveWorkspaceId } from "@/lib/admin-api";
import CustomersClient from "./CustomersClient";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const wsId = await resolveWorkspaceId();
  const [customersRes, ordersRes, bookingsRes] = wsId
    ? await Promise.all([
        adminApi.customers(wsId),
        adminApi.orders(wsId, { limit: 200 }),
        adminApi.bookings(wsId, { limit: 200 }),
      ])
    : [
        { customers: [] as any[] },
        { orders: [] as any[], total: 0, limit: 200, offset: 0 },
        { bookings: [] as any[], total: 0, limit: 200, offset: 0 },
      ];

  return (
    <CustomersClient
      customers={customersRes.customers}
      orders={ordersRes.orders}
      bookings={bookingsRes.bookings}
    />
  );
}

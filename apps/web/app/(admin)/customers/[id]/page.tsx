import { adminApi, resolveWorkspaceId } from "@/lib/admin-api";
import { notFound } from "next/navigation";
import CustomerDetailClient from "./CustomerDetailClient";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const wsId = await resolveWorkspaceId();
  if (!wsId) notFound();

  const [customersRes, ordersRes, bookingsRes] = await Promise.all([
    adminApi.customers(wsId),
    adminApi.orders(wsId, { limit: 200 }),
    adminApi.bookings(wsId, { limit: 200 }),
  ]);

  const customer = customersRes.customers.find((c: any) => c.id === params.id);
  if (!customer) notFound();

  return (
    <CustomerDetailClient
      customer={customer}
      allOrders={ordersRes.orders}
      allBookings={bookingsRes.bookings}
    />
  );
}

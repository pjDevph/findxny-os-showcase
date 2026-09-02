import { adminApi, resolveWorkspaceId } from "@/lib/admin-api";
import { TransactionsPageClient } from "./TransactionsPageClient";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; type?: string; page?: string };
}) {
  const wsId = await resolveWorkspaceId();

  const now       = new Date();
  const defaultTo = now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const defaultFrom = defaultTo.slice(0, 7) + "-01";

  const from = searchParams?.from ?? defaultFrom;
  const to   = searchParams?.to   ?? defaultTo;
  const type = searchParams?.type;

  let transactions: any[] = [];
  let total = 0;

  if (wsId) {
    try {
      const result = await adminApi.transactions(wsId, { from, to, ...(type ? { type } : {}), limit: 2000 });
      transactions = result.transactions ?? [];
      total        = result.total        ?? 0;
    } catch {
      // Edge function unavailable — render with empty data
    }
  }

  return (
    <TransactionsPageClient
      transactions={transactions}
      total={total}
      initialFrom={from}
      initialTo={to}
      initialType={type ?? "all"}
    />
  );
}

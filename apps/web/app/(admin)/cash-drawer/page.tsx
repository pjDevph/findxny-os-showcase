import { adminApi, resolveWorkspaceId } from "@/lib/admin-api";
import { CashDrawerClient } from "./CashDrawerClient";

export const dynamic = "force-dynamic";

export default async function CashDrawerPage() {
  const wsId = await resolveWorkspaceId();
  // Use local PH date, not UTC
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

  // Fetch 3 days to avoid UTC/local timezone edge cases at midnight
  const { transactions } = wsId
    ? await adminApi.reports(wsId, { days: 3 })
    : { transactions: [] as any[] };

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Cash Drawer</h1>
          <div className="sub">Today · {today}</div>
        </div>
      </div>
      <div className="admin-body">
        <CashDrawerClient workspaceId={wsId ?? ""} transactions={transactions} date={today} />
      </div>
    </>
  );
}

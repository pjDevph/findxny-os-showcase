import { getZReports } from "../actions";
import { ZReportsClient } from "./ZReportsClient";

export const dynamic = "force-dynamic";

export default async function ZReportsPage() {
  let reports = await getZReports().catch(() => [] as Awaited<ReturnType<typeof getZReports>>);

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Z Reports</h1>
          <div className="sub">End-of-day sales reports · last {reports.length} on record</div>
        </div>
      </div>
      <div className="admin-body">
        <ZReportsClient reports={reports} />
      </div>
    </>
  );
}

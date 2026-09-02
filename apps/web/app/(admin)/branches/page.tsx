import { adminApi, resolveWorkspaceId } from "@/lib/admin-api";
import { revalidatePath } from "next/cache";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";

async function toggleOrders(workspaceId: string, branchId: string, next: boolean, _: FormData) {
  "use server";
  await adminApi.branchesToggle({ workspace_id: workspaceId, branch_id: branchId, accepting_orders: next });
  revalidatePath("/branches");
}

async function toggleBookings(workspaceId: string, branchId: string, next: boolean, _: FormData) {
  "use server";
  await adminApi.branchesToggle({ workspace_id: workspaceId, branch_id: branchId, accepting_bookings: next });
  revalidatePath("/branches");
}

type BranchToggleCellProps = {
  canToggle: boolean;
  accepting: boolean;
  label: "orders" | "bookings";
  branchName: string;
  action: () => void | Promise<void>;
};

function BranchToggleCell({ canToggle, accepting, label, branchName, action }: BranchToggleCellProps) {
  if (!canToggle) {
    return (
      <span className={`pill ${accepting ? "ok" : "warn"}`}>
        {accepting ? "Accepting" : "Paused"}
      </span>
    );
  }
  const pauseLabel  = `Pause ${label}`;
  const resumeLabel = `Resume ${label}`;
  const body = accepting
    ? (label === "orders"
        ? `Customers won't be able to place new orders at this branch until you resume.`
        : `New room bookings will be blocked at this branch until you resume.`)
    : (label === "orders"
        ? `Customers will be able to place orders at this branch again.`
        : `Customers will be able to book rooms at this branch again.`);
  return (
    <ConfirmActionButton
      className={`btn-xs ${accepting ? "danger" : "primary"}`}
      title={accepting ? `${pauseLabel} at ${branchName}?` : `${resumeLabel} at ${branchName}?`}
      body={body}
      confirmLabel={accepting ? pauseLabel : resumeLabel}
      tone={accepting ? "warning" : "neutral"}
      action={action}
    >
      {accepting ? pauseLabel : resumeLabel}
    </ConfirmActionButton>
  );
}

function BranchRow({ b, wsId, canToggle }: { b: any; wsId: string; canToggle: boolean }) {
  return (
    <tr>
      <td className="bold">{b.name}</td>
      <td className="dim">{b.address ?? "—"}</td>
      <td>
        <BranchToggleCell
          canToggle={canToggle}
          accepting={b.accepting_orders}
          label="orders"
          branchName={b.name}
          action={toggleOrders.bind(null, wsId, b.id, !b.accepting_orders, new FormData())}
        />
      </td>
      <td>
        <BranchToggleCell
          canToggle={canToggle}
          accepting={b.accepting_bookings}
          label="bookings"
          branchName={b.name}
          action={toggleBookings.bind(null, wsId, b.id, !b.accepting_bookings, new FormData())}
        />
      </td>
      <td><span className="mono">{b.id.slice(0, 8)}…</span></td>
      <td className="dim">{new Date(b.created_at).toLocaleDateString("en-PH")}</td>
    </tr>
  );
}

export const dynamic = "force-dynamic";

export default async function BranchesPage() {
  const wsId = await resolveWorkspaceId();
  const [{ branches }, ctx] = wsId
    ? await Promise.all([adminApi.branches(wsId), adminApi.context(wsId)])
    : [{ branches: [] as any[] }, { workspace: null as any, role: "" }];

  const ws = ctx.workspace;
  const canToggle = ctx.role === "owner" || ctx.role === "admin";

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Branches</h1>
          <div className="sub">{branches.length} locations</div>
        </div>
      </div>
      <div className="admin-body">
        <div className="admin-card" style={{ marginBottom: 20 }}>
          <h2>Workspace</h2>
          <div className="grid-3col">
            <div><div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 6 }}>Name</div>
              <div style={{ fontFamily: "var(--f-display)", fontSize: 22, color: "var(--text-0)", letterSpacing: "0.04em" }}>{ws?.name ?? "—"}</div></div>
            <div><div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 6 }}>Slug</div>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 14, color: "var(--amber-bright)" }}>{ws?.slug ?? "—"}</div></div>
            <div><div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 6 }}>Currency</div>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 14, color: "var(--text-0)" }}>{ws?.currency ?? "—"}</div></div>
          </div>
        </div>

        <div className="admin-table-wrap">
          <div className="admin-table-head">
            <h2>All Branches</h2>
            {!canToggle && (
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>
                Owner/admin can toggle accepting state
              </span>
            )}
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                <th>Accepting Orders</th>
                <th>Accepting Bookings</th>
                <th>Branch ID</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {branches.length === 0 && (
                <tr><td colSpan={6} className="empty">No branches found</td></tr>
              )}
              {branches.map((b: any) => (
                <BranchRow key={b.id} b={b} wsId={wsId ?? ""} canToggle={canToggle} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

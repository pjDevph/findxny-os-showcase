import { adminApi, resolveWorkspaceId } from "@/lib/admin-api";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { InviteEmployee } from "@/features/admin/employees/InviteEmployee";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";

const ROLE_COLOR: Record<string, string> = {
  owner: "amber", admin: "warn", manager: "info", cashier: "ok", kitchen: "neutral",
};
const STATUS_COLOR = { active: "ok", suspended: "amber", archived: "neutral" } as const;
const ROLES = ["owner", "admin", "manager", "cashier", "kitchen"] as const;

type EmpTab = "active" | "suspended" | "archived" | "permissions" | "attendance";

const PERMISSION_FEATURES = [
  "Dashboard", "Orders", "Prep Display", "Transactions", "Reports",
  "Products", "Inventory", "Staff", "Shift & Cash", "Settings",
];
const ROLE_DEFAULTS: Record<string, string[]> = {
  owner:   PERMISSION_FEATURES,
  admin:   PERMISSION_FEATURES,
  manager: ["Dashboard", "Orders", "Prep Display", "Transactions", "Reports", "Products", "Inventory"],
  cashier: ["Orders", "Prep Display"],
  kitchen: ["Prep Display"],
};

// ── Server Actions ──────────────────────────────────────────────────────────

async function inviteEmployee(workspaceId: string, formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const full_name = String(formData.get("full_name") ?? "").trim() || undefined;
  const role = String(formData.get("role") ?? "cashier") as typeof ROLES[number];
  const branchRaw = String(formData.get("branch_id") ?? "");
  const branch_id = branchRaw || null;
  if (!email) return;
  await adminApi.employeesInvite({ workspace_id: workspaceId, email, full_name, role, branch_id });
  revalidatePath("/employees");
}

async function updateEmployee(workspaceId: string, userId: string, formData: FormData) {
  "use server";
  const role = String(formData.get("role") ?? "") as typeof ROLES[number];
  const branchRaw = String(formData.get("branch_id") ?? "");
  const branch_id = branchRaw || null;
  await adminApi.employeesUpdate({ workspace_id: workspaceId, user_id: userId, role, branch_id });
  revalidatePath("/employees");
}

async function suspendEmployee(workspaceId: string, userId: string, suspend: boolean) {
  "use server";
  await adminApi.employeesUpdate({ workspace_id: workspaceId, user_id: userId, is_suspended: suspend });
  revalidatePath("/employees");
}

async function archiveEmployee(workspaceId: string, userId: string) {
  "use server";
  await adminApi.employeesUpdate({ workspace_id: workspaceId, user_id: userId, is_archived: true });
  revalidatePath("/employees");
}

async function restoreEmployee(workspaceId: string, userId: string) {
  "use server";
  await adminApi.employeesUpdate({ workspace_id: workspaceId, user_id: userId, is_archived: false, is_suspended: false });
  revalidatePath("/employees");
}

async function togglePermission(workspaceId: string, role: string, feature: string, granted: boolean) {
  "use server";
  await adminApi.rolePermissionsUpsert({ workspace_id: workspaceId, role, feature, granted });
  revalidatePath("/employees");
}

// ── Page ────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export default async function StaffPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const tab: EmpTab = (searchParams?.tab as EmpTab) ?? "active";
  const wsId = await resolveWorkspaceId();

  const [{ members: allMembers }, { branches }, ctx, { records: attendanceRecords }, { overrides }] = wsId
    ? await Promise.all([
        adminApi.employees(wsId),
        adminApi.branches(wsId),
        adminApi.context(wsId),
        adminApi.attendance(wsId),
        adminApi.rolePermissions(wsId),
      ])
    : [
        { members: [] as any[] }, { branches: [] as any[] }, { workspace: null, role: "" } as any,
        { records: [] as any[] }, { overrides: [] as any[] },
      ];

  const myId = (ctx as any).userId ?? "";
  const canManage = ctx.role === "owner" || ctx.role === "admin";
  const canGrantOwner = ctx.role === "owner";

  const active    = allMembers.filter((m: any) => !m.is_archived && !m.is_suspended);
  const suspended = allMembers.filter((m: any) => !m.is_archived &&  m.is_suspended);
  const archived  = allMembers.filter((m: any) =>  m.is_archived);

  const tabBar = (
    <div className="admin-tabs">
      <Link href="/employees"                      className={`admin-tab ${tab === "active"      ? "active" : ""}`}>
        Active <span className="admin-tab-count">{active.length}</span>
      </Link>
      <Link href="/employees?tab=suspended"        className={`admin-tab ${tab === "suspended"   ? "active" : ""}`}>
        Suspended {suspended.length > 0 && <span className="admin-tab-count amber">{suspended.length}</span>}
      </Link>
      <Link href="/employees?tab=archived"         className={`admin-tab ${tab === "archived"    ? "active" : ""}`}>
        Archived {archived.length > 0 && <span className="admin-tab-count">{archived.length}</span>}
      </Link>
      <Link href="/employees?tab=permissions"      className={`admin-tab ${tab === "permissions" ? "active" : ""}`}>Permissions</Link>
      <Link href="/employees?tab=attendance"       className={`admin-tab ${tab === "attendance"  ? "active" : ""}`}>Attendance</Link>
    </div>
  );

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Staff</h1>
          <div className="sub">{allMembers.length} workspace member{allMembers.length !== 1 ? "s" : ""}</div>
        </div>
        {canManage && (tab === "active" || tab === "suspended") && (
          <InviteEmployee
            branches={branches}
            inviteAction={inviteEmployee.bind(null, wsId ?? "")}
            canGrantOwner={canGrantOwner}
          />
        )}
      </div>

      {tabBar}

      <div className="admin-body">

        {/* ── Active Tab ── */}
        {tab === "active" && (
          <StaffTable
            members={active}
            branches={branches}
            wsId={wsId ?? ""}
            myId={myId}
            canManage={canManage}
            canGrantOwner={canGrantOwner}
            updateEmployee={updateEmployee}
            suspendEmployee={suspendEmployee}
            archiveEmployee={archiveEmployee}
            restoreEmployee={restoreEmployee}
            mode="active"
          />
        )}

        {/* ── Suspended Tab ── */}
        {tab === "suspended" && (
          <StaffTable
            members={suspended}
            branches={branches}
            wsId={wsId ?? ""}
            myId={myId}
            canManage={canManage}
            canGrantOwner={canGrantOwner}
            updateEmployee={updateEmployee}
            suspendEmployee={suspendEmployee}
            archiveEmployee={archiveEmployee}
            restoreEmployee={restoreEmployee}
            mode="suspended"
          />
        )}

        {/* ── Archived Tab ── */}
        {tab === "archived" && (
          <StaffTable
            members={archived}
            branches={branches}
            wsId={wsId ?? ""}
            myId={myId}
            canManage={canManage}
            canGrantOwner={canGrantOwner}
            updateEmployee={updateEmployee}
            suspendEmployee={suspendEmployee}
            archiveEmployee={archiveEmployee}
            restoreEmployee={restoreEmployee}
            mode="archived"
          />
        )}

        {/* ── Attendance Tab ── */}
        {tab === "attendance" && (
          <div className="admin-table-wrap">
            <div className="admin-table-head"><h2>Recent Attendance</h2></div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Staff Name</th><th>Date</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {attendanceRecords.length === 0 && (
                  <tr><td colSpan={6} className="empty">No attendance records yet</td></tr>
                )}
                {attendanceRecords.map((r: any) => {
                  // Manila-local day bucketing — matches the cash-drawer page's
                  // convention so a late clock-in doesn't land on the wrong date.
                  const clockIn = new Date(r.clock_in);
                  const clockOut = r.clock_out ? new Date(r.clock_out) : null;
                  const dateLabel = clockIn.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
                  const timeFmt = (d: Date) => d.toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit" });
                  const hours = clockOut ? ((clockOut.getTime() - clockIn.getTime()) / 3_600_000).toFixed(1) : "—";
                  return (
                    <tr key={r.id}>
                      <td className="bold">{r.staff_name}</td>
                      <td>{dateLabel}</td>
                      <td>{timeFmt(clockIn)}</td>
                      <td>{clockOut ? timeFmt(clockOut) : "—"}</td>
                      <td>{hours}</td>
                      <td>
                        <span className={`pill ${clockOut ? "neutral" : "ok"}`}>
                          {clockOut ? "Complete" : "Clocked In"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Permissions Tab ── */}
        {tab === "permissions" && (
          <div>
            <div style={{
              padding: "12px 18px", marginBottom: 20,
              background: "rgba(var(--tint-rgb), 0.05)", border: "1px solid rgba(var(--tint-rgb), 0.18)",
              borderRadius: 12, fontSize: 13, color: "var(--text-2)",
            }}>
              Overrides saved here are display-only — they change what this matrix shows as
              granted per role, but do not change actual access. Real permissions are still
              enforced by each feature&apos;s own backend checks.
            </div>
            <div className="admin-table-wrap">
              <div className="admin-table-head"><h2>Access Matrix</h2></div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    {ROLES.map((r) => (
                      <th key={r} style={{ textAlign: "center" }}>
                        <span className={`pill ${ROLE_COLOR[r] ?? "neutral"}`}>{r}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_FEATURES.map((feature) => (
                    <tr key={feature}>
                      <td className="bold">{feature}</td>
                      {ROLES.map((role) => {
                        // Owner is never actually restrictable by this table, so its
                        // column stays non-interactive to avoid a "why did unchecking
                        // this do nothing" moment.
                        if (role === "owner") {
                          return (
                            <td key={role} style={{ textAlign: "center" }}>
                              <span style={{ color: "var(--ok)", fontSize: 16 }}>✓</span>
                            </td>
                          );
                        }
                        const override = overrides.find((o: any) => o.role === role && o.feature === feature);
                        const allowed = override ? override.granted : (ROLE_DEFAULTS[role] ?? []).includes(feature);
                        return (
                          <td key={role} style={{ textAlign: "center" }}>
                            <form action={togglePermission.bind(null, wsId ?? "", role, feature, !allowed)}>
                              <button
                                type="submit"
                                disabled={!canManage}
                                style={{ background: "none", border: "none", fontSize: 16, cursor: canManage ? "pointer" : "default", padding: 4 }}
                                title={canManage ? "Click to toggle" : undefined}
                              >
                                {allowed
                                  ? <span style={{ color: "var(--ok)" }}>✓</span>
                                  : <span style={{ color: "var(--text-3)", fontSize: 14 }}>—</span>}
                              </button>
                            </form>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </>
  );
}

// ── StaffTable component ─────────────────────────────────────────────────────

type StaffTableMode = "active" | "suspended" | "archived";

function StaffTable({
  members, branches, wsId, myId, canManage, canGrantOwner,
  updateEmployee, suspendEmployee, archiveEmployee, restoreEmployee, mode,
}: {
  members: any[];
  branches: any[];
  wsId: string;
  myId: string;
  canManage: boolean;
  canGrantOwner: boolean;
  updateEmployee: (wsId: string, userId: string, fd: FormData) => Promise<void>;
  suspendEmployee: (wsId: string, userId: string, suspend: boolean) => Promise<void>;
  archiveEmployee: (wsId: string, userId: string) => Promise<void>;
  restoreEmployee: (wsId: string, userId: string) => Promise<void>;
  mode: StaffTableMode;
}) {
  const emptyMsg = mode === "active" ? "No active staff" : mode === "suspended" ? "No suspended staff" : "No archived staff";

  return (
    <div className="admin-table-wrap">
      <div className="admin-table-head">
        <h2>{mode === "active" ? "Active Staff" : mode === "suspended" ? "Suspended Staff" : "Archived Staff"}</h2>
        {canManage && (
          <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>
            {canManage ? "Owner/admin can manage" : "Read-only"}
          </span>
        )}
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Role</th>
            <th>Branch</th>
            <th>Phone</th>
            <th>Since</th>
            {canManage && <th></th>}
          </tr>
        </thead>
        <tbody>
          {members.length === 0 && (
            <tr><td colSpan={canManage ? 7 : 6} className="empty">{emptyMsg}</td></tr>
          )}
          {members.map((m: any) => {
            const isSelf = m.user_id === myId;
            const isOwner = m.role === "owner";
            const editable = canManage && !isSelf && (!isOwner || canGrantOwner) && mode !== "archived";

            const statusLabel = m.is_archived ? "Archived" : m.is_suspended ? "Suspended" : "Active";
            const statusKey   = m.is_archived ? "archived"  : m.is_suspended ? "suspended"  : "active";

            return (
              <tr key={m.user_id} style={m.is_archived ? { opacity: 0.55 } : undefined}>
                <td className="bold" style={{ color: m.is_suspended ? "var(--text-3)" : undefined }}>
                  {m.profiles?.full_name ?? "—"}
                  {isSelf && <span style={{ marginLeft: 6, fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--text-3)" }}>(you)</span>}
                </td>
                <td>
                  <span className={`pill ${STATUS_COLOR[statusKey]}`}>{statusLabel}</span>
                </td>
                <td>
                  {editable ? (
                    <form action={updateEmployee.bind(null, wsId, m.user_id)} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <select name="role" defaultValue={m.role} className="input" style={{ padding: "4px 8px", fontSize: 12 }}>
                        {ROLES.filter((r) => r !== "owner" || canGrantOwner).map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      <select name="branch_id" defaultValue={m.branch_id ?? ""} className="input" style={{ padding: "4px 8px", fontSize: 12 }}>
                        <option value="">All</option>
                        {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <ConfirmSubmitButton className="btn-xs primary" title="Save changes?" body="Update this member's role / branch." confirmLabel="Save">Save</ConfirmSubmitButton>
                    </form>
                  ) : (
                    <span className={`pill ${ROLE_COLOR[m.role] ?? "neutral"}`}>{m.role}</span>
                  )}
                </td>
                <td className="dim">{m.branches?.name ?? "All branches"}</td>
                <td className="dim">{m.profiles?.phone ?? "—"}</td>
                <td className="dim">{new Date(m.created_at).toLocaleDateString("en-PH")}</td>
                {canManage && (
                  <td>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      {mode === "archived" ? (
                        /* Restore from archived */
                        !isSelf && (
                          <ConfirmActionButton
                            className="btn-xs"
                            title={`Restore ${m.profiles?.full_name ?? "this member"}?`}
                            body="They will be set back to Active and can log in again."
                            confirmLabel="Restore"
                            cancelLabel="Cancel"
                            action={restoreEmployee.bind(null, wsId, m.user_id)}
                          >
                            Restore
                          </ConfirmActionButton>
                        )
                      ) : (
                        <>
                          {/* Suspend / Unsuspend */}
                          {!isSelf && !isOwner && (
                            m.is_suspended ? (
                              <ConfirmActionButton
                                className="btn-xs"
                                title={`Unsuspend ${m.profiles?.full_name ?? "this member"}?`}
                                body="They will be able to log in to POS and Web again."
                                confirmLabel="Unsuspend"
                                cancelLabel="Cancel"
                                action={suspendEmployee.bind(null, wsId, m.user_id, false)}
                              >
                                Unsuspend
                              </ConfirmActionButton>
                            ) : (
                              <ConfirmActionButton
                                className="btn-xs amber"
                                title={`Suspend ${m.profiles?.full_name ?? "this member"}?`}
                                body="They lose POS and Web access immediately. You can unsuspend them later."
                                confirmLabel="Suspend"
                                cancelLabel="Cancel"
                                action={suspendEmployee.bind(null, wsId, m.user_id, true)}
                              >
                                Suspend
                              </ConfirmActionButton>
                            )
                          )}

                          {/* Remove (archive) */}
                          {editable && (
                            <ConfirmActionButton
                              className="btn-xs danger"
                              title={`Remove ${m.profiles?.full_name ?? "this member"}?`}
                              body="Their account is archived — access is revoked. Re-invite by email to restore."
                              confirmLabel="Remove"
                              cancelLabel="Keep"
                              action={archiveEmployee.bind(null, wsId, m.user_id)}
                            >
                              Remove
                            </ConfirmActionButton>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

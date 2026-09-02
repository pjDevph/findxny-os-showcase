// POST /cash-drawer — multiplexed API for the web admin Cash Drawer page's
// day-level reconciliation ledger (get_day / set_starting_cash / add_entry /
// remove_entry / set_manual_override). Workspace(+branch)+calendar-day-scoped
// — distinct from pos-shift's per-terminal `shifts`/`cash_drawer_events`.
import { adminClient } from "../_shared/supabaseClient.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { Roles } from "../_shared/permissions.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, NotFound, Conflict } from "../_shared/errors.ts";
import { parseBody, z } from "../_shared/validators.ts";
import { audit } from "../_shared/auditLog.ts";

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

const GetDay = z.object({
  action:       z.literal("get_day"),
  workspace_id: z.string().uuid(),
  branch_id:    z.string().uuid().nullable().optional(),
  date:         DateStr,
});
const SetStartingCash = z.object({
  action:        z.literal("set_starting_cash"),
  workspace_id:  z.string().uuid(),
  branch_id:     z.string().uuid().nullable().optional(),
  date:          DateStr,
  starting_cash: z.number().nonnegative(),
});
const AddEntry = z.object({
  action:       z.literal("add_entry"),
  workspace_id: z.string().uuid(),
  branch_id:    z.string().uuid().nullable().optional(),
  date:         DateStr,
  kind:         z.enum(["cash_in", "expense"]),
  label:        z.string().min(1),
  amount:       z.number().positive(),
  remarks:      z.string().nullable().optional(),
  expense_type: z.enum(["Cash", "Non-Cash"]).nullable().optional(),
});
const RemoveEntry = z.object({
  action:       z.literal("remove_entry"),
  workspace_id: z.string().uuid(),
  entry_id:     z.string().uuid(),
});
const SetManualOverride = z.object({
  action:          z.literal("set_manual_override"),
  workspace_id:    z.string().uuid(),
  branch_id:       z.string().uuid().nullable().optional(),
  date:            DateStr,
  net_cash_manual: z.number().nullable(),
});

const Body = z.discriminatedUnion("action", [
  GetDay, SetStartingCash, AddEntry, RemoveEntry, SetManualOverride,
]);

type Sb = ReturnType<typeof adminClient>;

function filterByBranch<T>(q: T, branchId: string | null): T {
  return (branchId === null
    ? (q as any).is("branch_id", null)
    : (q as any).eq("branch_id", branchId)) as T;
}

async function getOrCreateDay(
  sb: Sb, workspaceId: string, branchId: string | null, date: string,
): Promise<{ id: string; [k: string]: unknown }> {
  const { data: existing } = await filterByBranch(
    sb.from("cash_drawer_days").select("*").eq("workspace_id", workspaceId), branchId,
  ).eq("drawer_date", date).maybeSingle();
  if (existing) return existing;

  // Carry forward the prior day's manual override as this day's starting
  // cash, if one was ever set — we don't recompute a running total from
  // `transactions` here (that data lives outside this function's scope), so
  // this is a best-effort default, not a guaranteed-accurate opening balance.
  const { data: prior } = await filterByBranch(
    sb.from("cash_drawer_days").select("net_cash_manual").eq("workspace_id", workspaceId), branchId,
  ).lt("drawer_date", date).order("drawer_date", { ascending: false }).limit(1).maybeSingle();
  const startingCash = Number(prior?.net_cash_manual ?? 0);

  const { data: created, error } = await sb.from("cash_drawer_days").insert({
    workspace_id: workspaceId, branch_id: branchId, drawer_date: date,
    starting_cash: startingCash,
  }).select().single();
  if (error) throw BadRequest(error.message);
  return created;
}

async function handleGetDay(sb: Sb, body: z.infer<typeof GetDay>) {
  const branchId = body.branch_id ?? null;
  const day = await getOrCreateDay(sb, body.workspace_id, branchId, body.date);
  const { data: entries } = await sb.from("cash_drawer_entries")
    .select("*").eq("day_id", day.id).order("created_at", { ascending: true });
  return json({ day, entries: entries ?? [] });
}

async function handleSetStartingCash(sb: Sb, body: z.infer<typeof SetStartingCash>, actorId: string) {
  const branchId = body.branch_id ?? null;
  const day = await getOrCreateDay(sb, body.workspace_id, branchId, body.date);
  const { data: updated, error } = await sb.from("cash_drawer_days").update({
    starting_cash: body.starting_cash, updated_by: actorId, updated_at: new Date().toISOString(),
  }).eq("id", day.id).select().single();
  if (error) throw BadRequest(error.message);
  await audit({
    workspaceId: body.workspace_id, actorId, action: "cash_drawer.set_starting_cash",
    entityType: "cash_drawer_day", entityId: day.id, before: day, after: updated,
  });
  return json({ day: updated });
}

async function handleAddEntry(sb: Sb, body: z.infer<typeof AddEntry>, actorId: string) {
  const branchId = body.branch_id ?? null;
  const day = await getOrCreateDay(sb, body.workspace_id, branchId, body.date);
  const { data: entry, error } = await sb.from("cash_drawer_entries").insert({
    day_id: day.id, kind: body.kind, label: body.label, amount: body.amount,
    remarks: body.remarks ?? null, expense_type: body.expense_type ?? null,
    created_by: actorId,
  }).select().single();
  if (error) throw BadRequest(error.message);
  await audit({
    workspaceId: body.workspace_id, actorId, action: "cash_drawer.add_entry",
    entityType: "cash_drawer_entry", entityId: entry.id, after: entry,
  });
  return json({ entry });
}

async function handleRemoveEntry(sb: Sb, body: z.infer<typeof RemoveEntry>, actorId: string) {
  const { data: entry } = await sb.from("cash_drawer_entries")
    .select("*, cash_drawer_days!inner(workspace_id)").eq("id", body.entry_id).maybeSingle();
  if (!entry) throw NotFound("Entry not found");
  if ((entry as any).cash_drawer_days.workspace_id !== body.workspace_id) {
    throw Conflict("Entry does not belong to this workspace");
  }
  const { error } = await sb.from("cash_drawer_entries").delete().eq("id", body.entry_id);
  if (error) throw BadRequest(error.message);
  await audit({
    workspaceId: body.workspace_id, actorId, action: "cash_drawer.remove_entry",
    entityType: "cash_drawer_entry", entityId: body.entry_id, before: entry,
  });
  return json({ deleted: true });
}

async function handleSetManualOverride(sb: Sb, body: z.infer<typeof SetManualOverride>, actorId: string) {
  const branchId = body.branch_id ?? null;
  const day = await getOrCreateDay(sb, body.workspace_id, branchId, body.date);
  const { data: updated, error } = await sb.from("cash_drawer_days").update({
    net_cash_manual: body.net_cash_manual, updated_by: actorId, updated_at: new Date().toISOString(),
  }).eq("id", day.id).select().single();
  if (error) throw BadRequest(error.message);
  await audit({
    workspaceId: body.workspace_id, actorId, action: "cash_drawer.set_manual_override",
    entityType: "cash_drawer_day", entityId: day.id, before: day, after: updated,
  });
  return json({ day: updated });
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const sb = adminClient();
    const ctx = await requireAuth(req, body.workspace_id);
    requireRole(ctx, Roles.VOID_REFUND);

    if (body.action === "get_day")             return await handleGetDay(sb, body);
    if (body.action === "set_starting_cash")   return await handleSetStartingCash(sb, body, ctx.userId);
    if (body.action === "add_entry")           return await handleAddEntry(sb, body, ctx.userId);
    if (body.action === "remove_entry")        return await handleRemoveEntry(sb, body, ctx.userId);
    return await handleSetManualOverride(sb, body, ctx.userId);
  } catch (err) { return handleError(err); }
});

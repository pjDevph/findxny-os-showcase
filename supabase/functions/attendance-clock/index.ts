// POST /attendance-clock — self-service staff time in/out. Any authenticated
// workspace member clocks themselves in/out; ctx.userId is the identity, no
// separate device/session plumbing needed since POS terminals already use
// per-staff PIN login (see staff-login-resolve).
import { adminClient } from "../_shared/supabaseClient.ts";
import { requireAuth } from "../_shared/auth.ts";
import { json, preflight } from "../_shared/response.ts";
import { handleError, BadRequest, Conflict, NotFound } from "../_shared/errors.ts";
import { parseBody, z } from "../_shared/validators.ts";

const ClockIn = z.object({
  action:       z.literal("clock_in"),
  workspace_id: z.string().uuid(),
  branch_id:    z.string().uuid().nullable().optional(),
});
const ClockOut = z.object({
  action:       z.literal("clock_out"),
  workspace_id: z.string().uuid(),
  record_id:    z.string().uuid(),
});
const List = z.object({
  action:       z.literal("list"),
  workspace_id: z.string().uuid(),
  user_id:      z.string().uuid().nullable().optional(),
});

const Body = z.discriminatedUnion("action", [ClockIn, ClockOut, List]);

type Sb = ReturnType<typeof adminClient>;
const MANAGE_ROLES = ["owner", "admin", "manager"];

async function handleClockIn(sb: Sb, body: z.infer<typeof ClockIn>, userId: string) {
  const { data: open } = await sb.from("attendance_records")
    .select("id").eq("workspace_id", body.workspace_id).eq("user_id", userId)
    .is("clock_out", null).maybeSingle();
  if (open) throw Conflict("Already clocked in — clock out first");

  const { data: record, error } = await sb.from("attendance_records").insert({
    workspace_id: body.workspace_id, branch_id: body.branch_id ?? null, user_id: userId,
  }).select().single();
  if (error) throw BadRequest(error.message);
  return json({ record });
}

async function handleClockOut(sb: Sb, body: z.infer<typeof ClockOut>, userId: string) {
  const { data: record } = await sb.from("attendance_records")
    .select("*").eq("id", body.record_id).maybeSingle();
  if (!record) throw NotFound("Attendance record not found");
  if (record.workspace_id !== body.workspace_id || record.user_id !== userId) {
    throw Conflict("This record does not belong to you");
  }
  if (record.clock_out) throw Conflict("Already clocked out");

  const { data: updated, error } = await sb.from("attendance_records")
    .update({ clock_out: new Date().toISOString() }).eq("id", body.record_id).select().single();
  if (error) throw BadRequest(error.message);
  return json({ record: updated });
}

async function handleList(sb: Sb, body: z.infer<typeof List>, userId: string, role: string) {
  let q = sb.from("attendance_records")
    .select("*").eq("workspace_id", body.workspace_id)
    .order("clock_in", { ascending: false }).limit(200);
  // Self-service: non-managers only ever see their own records. Managers can
  // pass user_id to view a specific staff member, or omit it for everyone
  // (needed by the web admin Attendance tab).
  if (!MANAGE_ROLES.includes(role)) {
    q = q.eq("user_id", userId);
  } else if (body.user_id) {
    q = q.eq("user_id", body.user_id);
  }
  const { data, error } = await q;
  if (error) throw BadRequest(error.message);
  return json({ records: data ?? [] });
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    if (req.method !== "POST") throw BadRequest("POST only");
    const body = await parseBody(req, Body);
    const sb = adminClient();
    const ctx = await requireAuth(req, body.workspace_id);

    if (body.action === "clock_in")  return await handleClockIn(sb, body, ctx.userId);
    if (body.action === "clock_out") return await handleClockOut(sb, body, ctx.userId);
    return await handleList(sb, body, ctx.userId, ctx.role);
  } catch (err) { return handleError(err); }
});

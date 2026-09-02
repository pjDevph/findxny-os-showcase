import * as SQLite from "expo-sqlite";
import { useSyncExternalStore } from "react";
import { invokeFn } from "../../services/supabase";
import { getIsConnected } from "./networkStatus";
import { removeOfflineReceipt } from "./offlineReceipts";

interface QueueRow {
  id:          string;
  order_no:    string;
  order_body:  string;
  pay_body:    string | null;
  extras_body: string | null;
  created_at:  number;
  attempts:    number;
  last_error:  string | null;
  idem_key:    string | null;
}

/** Custom charges and loyalty-point redemption — on the online path
 *  (createOrderWithCharges) these are separate calls fired alongside
 *  orders-create, not part of the order body itself (orders-create's schema
 *  has no `charges` field). The offline queue used to skip both entirely: it
 *  only replayed orders-create + the payment leg, so an offline order with a
 *  corkage/delivery charge synced at a LOWER total than what was actually
 *  collected from the customer (the charge amount just vanished — never
 *  billed, never recorded as revenue), and a redeemed loyalty discount
 *  applied to the order's total without ever decrementing the customer's
 *  points balance server-side. Both are now replayed post-creation, same as
 *  the online path, best-effort (a charge/loyalty failure doesn't block the
 *  order sync — matches createOrderWithCharges's own .catch-and-warn, not a
 *  stricter guarantee than the online path already provides). */
export interface OfflineOrderExtras {
  charges?: { name: string; amount: number; taxable: boolean }[];
  loyalty?: { customerId: string; pointsToRedeem: number };
}

/** A payment-settlement retry for an order that ALREADY exists server-side —
 *  distinct from QueueRow, which also carries an order_body to (re)create the
 *  order itself. Used when an online checkout's orders-create call succeeds
 *  but the immediately-following payments-cash-confirm call fails: the order
 *  must not be recreated (that would duplicate it), only the payment leg
 *  retried. See enqueuePaymentRetry(). */
interface PaymentQueueRow {
  id:         string;
  order_id:   string;
  order_no:   string;
  pay_body:   string;
  created_at: number;
  attempts:   number;
  last_error: string | null;
}

/** A queued clock-in/out, break, or cash-drawer event — see enqueueShiftAction.
 *  `body` is the full pos-shift request body including its own `action`
 *  field (pos-shift is multiplexed on that field, unlike orders-create/
 *  payments-cash-confirm which are single-purpose), so replaying it is just
 *  "send this exact body again," no reconstruction needed. */
interface ShiftActionQueueRow {
  id:         string;
  body:       string;
  created_at: number;
  attempts:   number;
  last_error: string | null;
}

export interface StuckOrder {
  id:        string;
  orderNo:   string;
  attempts:  number;
  createdAt: number;
  lastError: string | null;
}

// After this many failed attempts, flushQueue() stops auto-retrying the row —
// without a cap, an order that can never succeed (e.g. a product went out of
// stock or was deleted while offline) retried every reconnect + every 30s
// timer tick forever, with no way for the cashier to know it was stuck.
const MAX_ATTEMPTS = 8;

let pendingCount = 0;
let stuckCount = 0;
const countListeners = new Set<() => void>();
const emitCount = () => { for (const l of countListeners) l(); };

// startSyncService() fires getPendingCount() and flushQueue() concurrently on
// every app launch, so getDb() must cache the in-flight open — not just the
// resolved handle — or both callers race SQLite.openDatabaseAsync at once and
// one connection comes back broken (NativeDatabase.prepareAsync NullPointerException
// on its first statement).
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const DB_NAME = "pos_offline.db";

async function openAndInit(): Promise<SQLite.SQLiteDatabase> {
  const newDb = await SQLite.openDatabaseAsync(DB_NAME);
  await newDb.execAsync(`
    CREATE TABLE IF NOT EXISTS offline_orders (
      id          TEXT PRIMARY KEY,
      order_no    TEXT NOT NULL,
      order_body  TEXT NOT NULL,
      pay_body    TEXT,
      created_at  INTEGER NOT NULL,
      attempts    INTEGER NOT NULL DEFAULT 0,
      last_error  TEXT,
      idem_key    TEXT
    );
  `);
  await newDb.execAsync(`
    CREATE TABLE IF NOT EXISTS offline_payments (
      id          TEXT PRIMARY KEY,
      order_id    TEXT NOT NULL,
      order_no    TEXT NOT NULL,
      pay_body    TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      attempts    INTEGER NOT NULL DEFAULT 0,
      last_error  TEXT
    );
  `);
  await newDb.execAsync(`
    CREATE TABLE IF NOT EXISTS offline_shift_actions (
      id          TEXT PRIMARY KEY,
      body        TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      attempts    INTEGER NOT NULL DEFAULT 0,
      last_error  TEXT
    );
  `);
  // Defensive migration for devices whose local DB predates last_error/idem_key —
  // SQLite has no "ADD COLUMN IF NOT EXISTS", so just swallow the
  // duplicate-column error on installs that already have it.
  try {
    await newDb.execAsync(`ALTER TABLE offline_orders ADD COLUMN last_error TEXT;`);
  } catch { /* column already exists */ }
  try {
    await newDb.execAsync(`ALTER TABLE offline_orders ADD COLUMN idem_key TEXT;`);
  } catch { /* column already exists */ }
  try {
    await newDb.execAsync(`ALTER TABLE offline_orders ADD COLUMN extras_body TEXT;`);
  } catch { /* column already exists */ }
  await refreshCounts(newDb);
  return newDb;
}

async function refreshCounts(d: SQLite.SQLiteDatabase): Promise<void> {
  const countsFor = async (table: "offline_orders" | "offline_payments" | "offline_shift_actions") => d.getFirstAsync<{ pending: number; stuck: number }>(
    `SELECT SUM(CASE WHEN attempts < ? THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN attempts >= ? THEN 1 ELSE 0 END) AS stuck FROM ${table}`,
    [MAX_ATTEMPTS, MAX_ATTEMPTS],
  );
  const [orders, payments, shiftActions] = await Promise.all([
    countsFor("offline_orders"), countsFor("offline_payments"), countsFor("offline_shift_actions"),
  ]);
  pendingCount = (orders?.pending ?? 0) + (payments?.pending ?? 0) + (shiftActions?.pending ?? 0);
  stuckCount = (orders?.stuck ?? 0) + (payments?.stuck ?? 0) + (shiftActions?.stuck ?? 0);
}

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = openAndInit().catch(async () => {
    // A previous crash/kill mid-write (or the concurrent-open race this
    // comment used to describe) can leave the on-disk file in a state where
    // every single statement NPEs forever — there's no repairing that file
    // from JS, so self-heal by deleting it and starting a fresh queue rather
    // than permanently bricking offline orders on this device.
    try {
      await SQLite.deleteDatabaseAsync(DB_NAME);
    } catch { /* best-effort — fall through to retry regardless */ }
    return openAndInit();
  });
  try {
    return await dbPromise;
  } catch (e) {
    dbPromise = null;
    throw e;
  }
}

export async function enqueueOrder(opts: {
  id:        string;
  orderNo:   string;
  orderBody: object;
  /** A single payment_intent leg, or — for split payment — an array of legs
   *  applied sequentially once the order exists. Each leg's amount is fixed
   *  (its own split portion, always sent as amount_tendered), never "the
   *  remaining balance", so legs are safe to apply in any order or even
   *  retry independently: applying leg A doesn't change what leg B needs to
   *  charge. Only concurrent application within the same order is unsafe
   *  (a balance_due read/write race) — flushOrderRows processes rows and
   *  their legs strictly sequentially, never concurrently, so that never
   *  happens here. */
  payBody:   object | object[] | null;
  /** Custom charges + loyalty redemption to replay after the order is
   *  created — see OfflineOrderExtras' doc. Omit/null for a cart with
   *  neither. */
  extras?:   OfflineOrderExtras | null;
  /** Reuse the Idempotency-Key already sent to orders-create by a failed
   *  online checkout attempt, so if that request actually reached the server
   *  before the response was lost, this replay dedupes against it instead of
   *  creating a second order. Omit for orders that never attempted the
   *  online path (the pre-flight "no connection" case). */
  idemKey?:  string;
}): Promise<void> {
  try {
    const d = await getDb();
    await d.runAsync(
      "INSERT OR IGNORE INTO offline_orders (id, order_no, order_body, pay_body, extras_body, created_at, idem_key) VALUES (?,?,?,?,?,?,?)",
      [
        opts.id, opts.orderNo, JSON.stringify(opts.orderBody),
        opts.payBody ? JSON.stringify(opts.payBody) : null,
        opts.extras ? JSON.stringify(opts.extras) : null,
        Date.now(), opts.idemKey ?? null,
      ],
    );
    pendingCount++;
    emitCount();
  } catch (e) {
    dbPromise = null;
    throw e;
  }
}

/** Queue a payment-settlement retry for an order that was already created
 *  server-side (online checkout succeeded, but the immediate
 *  payments-cash-confirm call that follows it failed) — NOT for a brand-new
 *  offline order, which is enqueueOrder's job. Shares flushQueue's retry
 *  loop, MAX_ATTEMPTS cap, and the StuckOrdersModal review UI, so a payment
 *  that keeps failing (not just a transient network blip) surfaces to the
 *  cashier the same way a stuck offline order does, instead of leaving the
 *  order permanently Pending/UNPAID with no visible recovery path. */
export async function enqueuePaymentRetry(opts: {
  id: string; orderId: string; orderNo: string;
  /** A single leg, or (split payment) an array of the legs that didn't
   *  settle live — see enqueueOrder's payBody doc for why applying each
   *  leg's fixed amount independently, in any order, is safe. */
  payBody: object | object[];
}): Promise<void> {
  try {
    const d = await getDb();
    await d.runAsync(
      "INSERT OR IGNORE INTO offline_payments (id, order_id, order_no, pay_body, created_at) VALUES (?,?,?,?,?)",
      [opts.id, opts.orderId, opts.orderNo, JSON.stringify(opts.payBody), Date.now()],
    );
    pendingCount++;
    emitCount();
  } catch (e) {
    dbPromise = null;
    throw e;
  }
}

/** Queue a clock-in/out, break, or cash-drawer event whose live pos-shift
 *  call failed — postClockAction/addEvent in useShiftState.ts used to just
 *  update local UI state and forget about it on failure, with no retry and
 *  no record that anything needed pushing. Worse, the next reconciliation
 *  pull (refreshSummary) overwrites shift.events from server truth, so an
 *  event that never made it to the server used to just silently vanish from
 *  the UI too, not merely stay unsynced. Shares flushQueue's retry loop,
 *  MAX_ATTEMPTS cap, and the StuckOrdersModal review UI — and, since it
 *  shares the same pendingCount, also correctly blocks closeShift() the same
 *  way an unsynced order does (see useShiftState.ts's closeShift stuck/
 *  pending guard). `body` must be the exact pos-shift request body,
 *  `action` field included — see ShiftActionQueueRow's doc. */
export async function enqueueShiftAction(opts: { id: string; body: object }): Promise<void> {
  try {
    const d = await getDb();
    await d.runAsync(
      "INSERT OR IGNORE INTO offline_shift_actions (id, body, created_at) VALUES (?,?,?)",
      [opts.id, JSON.stringify(opts.body), Date.now()],
    );
    pendingCount++;
    emitCount();
  } catch (e) {
    dbPromise = null;
    throw e;
  }
}

export async function getPendingCount(): Promise<number> {
  const d = await getDb();
  await refreshCounts(d);
  emitCount();
  return pendingCount;
}

export function getPendingCountSync() { return pendingCount; }
export function getStuckCountSync() { return stuckCount; }

function subscribeCount(cb: () => void) {
  countListeners.add(cb);
  return () => { countListeners.delete(cb); };
}

export function usePendingCount() {
  return useSyncExternalStore(subscribeCount, getPendingCountSync, () => 0);
}

export function useStuckCount() {
  return useSyncExternalStore(subscribeCount, getStuckCountSync, () => 0);
}

/** "Shift: clock_in" etc. — StuckOrder's `orderNo` field is really just "the
 *  label to show," and a shift action has no order number, so this is what
 *  fills that slot in the merged review list. */
function shiftActionLabel(bodyJson: string): string {
  try {
    const parsed = JSON.parse(bodyJson);
    return `Shift: ${parsed.action ?? "action"}`;
  } catch {
    return "Shift action";
  }
}

/** Orders (brand-new offline orders, payment-only retries for already-
 *  created orders, and queued shift actions) that have exhausted
 *  MAX_ATTEMPTS and are no longer auto-retried — surfaced for manual review.
 *  Merged from all three tables so StuckOrdersModal shows a single list
 *  regardless of which kind of row is stuck. */
export async function getStuckOrders(): Promise<StuckOrder[]> {
  const d = await getDb();
  const orderRows = await d.getAllAsync<QueueRow>(
    "SELECT * FROM offline_orders WHERE attempts >= ? ORDER BY created_at",
    [MAX_ATTEMPTS],
  );
  const paymentRows = await d.getAllAsync<PaymentQueueRow>(
    "SELECT * FROM offline_payments WHERE attempts >= ? ORDER BY created_at",
    [MAX_ATTEMPTS],
  );
  const shiftActionRows = await d.getAllAsync<ShiftActionQueueRow>(
    "SELECT * FROM offline_shift_actions WHERE attempts >= ? ORDER BY created_at",
    [MAX_ATTEMPTS],
  );
  return [
    ...orderRows.map(r => ({ id: r.id, orderNo: r.order_no, attempts: r.attempts, createdAt: r.created_at, lastError: r.last_error })),
    ...paymentRows.map(r => ({ id: r.id, orderNo: r.order_no, attempts: r.attempts, createdAt: r.created_at, lastError: r.last_error })),
    ...shiftActionRows.map(r => ({ id: r.id, orderNo: shiftActionLabel(r.body), attempts: r.attempts, createdAt: r.created_at, lastError: r.last_error })),
  ].sort((a, b) => a.createdAt - b.createdAt);
}

/** Cashier chose to give it another shot — resets attempts so flushQueue()
 *  will pick it up again. `id`s are unique across all three tables (order
 *  ids are "offln-…", payment-retry/shift-action ids are caller-supplied and
 *  prefixed distinctly — see their enqueue* callers), so trying each table
 *  in turn only ever touches the row that actually exists. */
export async function retryStuckOrder(id: string): Promise<void> {
  const d = await getDb();
  let res = await d.runAsync("UPDATE offline_orders SET attempts = 0, last_error = NULL WHERE id = ?", [id]);
  if (res.changes === 0) {
    res = await d.runAsync("UPDATE offline_payments SET attempts = 0, last_error = NULL WHERE id = ?", [id]);
  }
  if (res.changes === 0) {
    await d.runAsync("UPDATE offline_shift_actions SET attempts = 0, last_error = NULL WHERE id = ?", [id]);
  }
  await refreshCounts(d);
  emitCount();
  void flushQueue();
}

/** Cashier chose to abandon it — permanently deletes the queued row. For an
 *  offline_orders row this means the order was never created server-side.
 *  For an offline_payments row the order DOES already exist (only its
 *  payment settlement is being abandoned) — it stays Pending/UNPAID until
 *  someone settles it another way (e.g. Collect Balance). For an
 *  offline_shift_actions row, the clock/break/cash event never reached the
 *  server and never will — local shift state may now disagree with the
 *  server's shift_events/cash_drawer_events history. */
export async function discardStuckOrder(id: string): Promise<void> {
  const d = await getDb();
  let res = await d.runAsync("DELETE FROM offline_orders WHERE id = ?", [id]);
  if (res.changes === 0) {
    res = await d.runAsync("DELETE FROM offline_payments WHERE id = ?", [id]);
  }
  if (res.changes === 0) {
    await d.runAsync("DELETE FROM offline_shift_actions WHERE id = ?", [id]);
  }
  await refreshCounts(d);
  emitCount();
}

async function recordFailure(d: SQLite.SQLiteDatabase, rowId: string, message: string): Promise<void> {
  await d.runAsync("UPDATE offline_orders SET attempts = attempts + 1, last_error = ? WHERE id = ?", [message.slice(0, 500), rowId]);
}

async function recordPaymentFailure(d: SQLite.SQLiteDatabase, rowId: string, message: string): Promise<void> {
  await d.runAsync("UPDATE offline_payments SET attempts = attempts + 1, last_error = ? WHERE id = ?", [message.slice(0, 500), rowId]);
}

async function recordShiftActionFailure(d: SQLite.SQLiteDatabase, rowId: string, message: string): Promise<void> {
  await d.runAsync("UPDATE offline_shift_actions SET attempts = attempts + 1, last_error = ? WHERE id = ?", [message.slice(0, 500), rowId]);
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") { try { return JSON.stringify(err); } catch { /* fall through */ } }
  return fallback;
}

type ReconnectCb = (pendingCount: number, doFlush: () => Promise<void>) => void;
let reconnectCb: ReconnectCb | null = null;

export function setReconnectCallback(cb: ReconnectCb | null): void {
  reconnectCb = cb;
}

/** Applies one or more payment legs (single-method: one; split: two) against
 *  an already-existing order. Each leg gets its own stable per-leg
 *  Idempotency-Key (`${keyBase}` for a lone leg — unchanged from before
 *  split support existed, so already-queued single-leg rows keep working
 *  with the same key — or `${keyBase}_${idx}` per leg when there's more than
 *  one), so a leg that already succeeded on a prior attempt safely no-ops on
 *  retry instead of double-charging, while a leg that hasn't succeeded yet
 *  gets applied. Attempts every leg even if an earlier one fails, so one
 *  wedged leg doesn't block progress on the other. Returns the first error
 *  seen (if any) — callers keep the row queued for retry when this returns
 *  an error, since it means at least one leg still isn't settled. */
async function applyPayLegs(orderId: string, payBodyJson: string, keyBase: string): Promise<string | null> {
  const parsed = JSON.parse(payBodyJson);
  const legs: object[] = Array.isArray(parsed) ? parsed : [parsed];
  let firstError: string | null = null;
  for (let i = 0; i < legs.length; i++) {
    const idemKey = legs.length > 1 ? `${keyBase}_${i}` : keyBase;
    const { error } = await invokeFn("payments-cash-confirm", { ...legs[i], order_id: orderId }, { "Idempotency-Key": idemKey });
    if (error && !firstError) firstError = error.message ?? "payments-cash-confirm failed";
  }
  return firstError;
}

/** Replays custom charges + loyalty redemption after order creation — the
 *  offline-queue counterpart to createOrderWithCharges's Promise.all (see
 *  OfflineOrderExtras' doc). Best-effort, same as the online path: a
 *  charge/loyalty failure is logged, not retried, and never blocks the
 *  order row itself from being deleted as synced — the order existing
 *  correctly matters more than a secondary charge/redemption succeeding. */
async function applyExtras(
  orderId: string, workspaceId: unknown, branchId: unknown, extrasJson: string | null,
): Promise<void> {
  if (!extrasJson) return;
  const extras: OfflineOrderExtras = JSON.parse(extrasJson);
  for (const charge of extras.charges ?? []) {
    await invokeFn("orders-add-charge", {
      workspace_id: workspaceId, branch_id: branchId, order_id: orderId,
      name: charge.name, amount: charge.amount, taxable: charge.taxable,
    }).catch(e => console.warn("[offlineQueue] orders-add-charge failed for charge:", charge.name, e));
  }
  if (extras.loyalty) {
    await invokeFn("loyalty-redeem", {
      workspace_id: workspaceId, customer_id: extras.loyalty.customerId,
      order_id: orderId, points_to_redeem: extras.loyalty.pointsToRedeem,
    }).catch(e => console.warn("[offlineQueue] loyalty-redeem failed:", e));
  }
}

/** Replays queued brand-new-order rows (pre-flight offline or a failed
 *  online orders-create) through orders-create, then their cash pay leg. */
async function flushOrderRows(d: SQLite.SQLiteDatabase): Promise<void> {
  const rows = await d.getAllAsync<QueueRow>(
    "SELECT * FROM offline_orders WHERE attempts < ? ORDER BY created_at LIMIT 10",
    [MAX_ATTEMPTS],
  );
  for (const row of rows) {
    try {
      const orderBody = JSON.parse(row.order_body);
      // Idempotency-Key is either the key reused from a failed online
      // checkout attempt (row.idem_key — see submitOfflineOrder's
      // orderIdemKey param) or one keyed on the local row id (stable across
      // retries of this same row) — without it, a crash/kill between
      // orders-create succeeding and this row's DELETE below being durably
      // written causes the next flush to re-read the same un-deleted row
      // and create a second, duplicate order.
      // invokeFn, not the raw supabase.functions.invoke client — the raw
      // client only ever reports the generic "Edge Function returned a
      // non-2xx status code" and discards the real {error:{message}} body
      // every edge function actually returns, which would make the "needs
      // attention" review list (StuckOrdersModal) useless: every failure
      // would show the same meaningless generic text instead of the real
      // reason (out of stock, invalid product, etc).
      const { data, error } = await invokeFn<{ order?: { id: string }; error?: string }>(
        "orders-create", orderBody, { "Idempotency-Key": row.idem_key || `offlineorder_${row.id}` },
      );
      if (error ?? data?.error) {
        await recordFailure(d, row.id, error?.message ?? data?.error ?? "orders-create failed");
        continue;
      }
      if (data?.order?.id) {
        await applyExtras(data.order.id, orderBody.workspace_id, orderBody.branch_id, row.extras_body);
      }
      if (row.pay_body && data?.order?.id) {
        // Order creation succeeded but settling (one or more legs of) the
        // payment failed — keep the row so the next flush retries whatever
        // didn't settle (now safely, via the per-leg idempotency keys above,
        // which return the same already-applied result instead of
        // duplicating it). Previously this row was deleted unconditionally,
        // silently leaving a pending/unpaid order behind with cash already
        // collected from the customer and no further retry ever attempted.
        const payError = await applyPayLegs(data.order.id, row.pay_body, `offlinepay_${row.id}`);
        if (payError) {
          await recordFailure(d, row.id, payError);
          continue;
        }
      }
      await d.runAsync("DELETE FROM offline_orders WHERE id = ?", [row.id]);
      // The order is now real server-side and will show up in Order History
      // normally on the next refresh — the local reprint-before-sync cache
      // (offlineReceipts.ts) has served its purpose for this row.
      if (orderBody.workspace_id) removeOfflineReceipt(orderBody.workspace_id, row.id).catch(() => {});
    } catch (e) {
      await recordFailure(d, row.id, errMessage(e, "unexpected error"));
    }
  }
}

/** Replays payment-only retries: the order already exists (an online
 *  checkout's orders-create succeeded but the follow-up payments-cash-confirm
 *  call failed) — only the settlement leg is replayed here, never a second
 *  orders-create, or this would duplicate the order. */
async function flushPaymentRows(d: SQLite.SQLiteDatabase): Promise<void> {
  const rows = await d.getAllAsync<PaymentQueueRow>(
    "SELECT * FROM offline_payments WHERE attempts < ? ORDER BY created_at LIMIT 10",
    [MAX_ATTEMPTS],
  );
  for (const row of rows) {
    try {
      const payError = await applyPayLegs(row.order_id, row.pay_body, `offlinepay_${row.id}`);
      if (payError) {
        await recordPaymentFailure(d, row.id, payError);
        continue;
      }
      await d.runAsync("DELETE FROM offline_payments WHERE id = ?", [row.id]);
    } catch (e) {
      await recordPaymentFailure(d, row.id, errMessage(e, "unexpected error"));
    }
  }
}

/** Replays queued clock-in/out, break, and cash-drawer events. Unlike
 *  flushOrderRows/flushPaymentRows (independent rows, safe to skip a failed
 *  one and keep going), these are a state-transition sequence for the SAME
 *  shift — clock_in before break_in before break_out before clock_out — so a
 *  failed row STOPS this pass instead of continuing to the next, or a later
 *  action could apply out of order against server state the earlier one
 *  never actually reached (e.g. a break recorded before the clock-in that
 *  was supposed to precede it). The query's ORDER BY created_at already
 *  ensures whatever DOES run, runs in the order the cashier actually tapped
 *  it. */
async function flushShiftActionRows(d: SQLite.SQLiteDatabase): Promise<void> {
  const rows = await d.getAllAsync<ShiftActionQueueRow>(
    "SELECT * FROM offline_shift_actions WHERE attempts < ? ORDER BY created_at LIMIT 10",
    [MAX_ATTEMPTS],
  );
  for (const row of rows) {
    try {
      const body = JSON.parse(row.body);
      const { error } = await invokeFn("pos-shift", body, { "Idempotency-Key": `offlineshiftact_${row.id}` });
      if (error) {
        await recordShiftActionFailure(d, row.id, error.message ?? "pos-shift failed");
        break;
      }
      await d.runAsync("DELETE FROM offline_shift_actions WHERE id = ?", [row.id]);
    } catch (e) {
      await recordShiftActionFailure(d, row.id, errMessage(e, "unexpected error"));
      break;
    }
  }
}

let syncing = false;

export async function flushQueue(): Promise<void> {
  if (syncing || !getIsConnected()) return;
  syncing = true;
  try {
    const d = await getDb();
    await flushOrderRows(d);
    await flushPaymentRows(d);
    await flushShiftActionRows(d);
    await refreshCounts(d);
    emitCount();
  } finally {
    syncing = false;
  }
}

export function startSyncService(): () => void {
  void getPendingCount();
  void flushQueue();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { onConnectivityChange, getIsConnected } = require("./networkStatus") as typeof import("./networkStatus");
  let wasConnected = getIsConnected();
  const unsubscribe = onConnectivityChange((now) => {
    if (now && !wasConnected) {
      if (reconnectCb && pendingCount > 0) {
        reconnectCb(pendingCount, flushQueue);
      } else {
        void flushQueue();
      }
    }
    wasConnected = now;
  });

  // Periodic retry every 30 s — catches the case where the user dismissed the
  // reconnect dialog ("Later") or a flush failed silently mid-session. Only
  // fires while pendingCount > 0, which excludes rows that already hit
  // MAX_ATTEMPTS — those no longer get auto-retried (see getStuckOrders()).
  const interval = setInterval(() => {
    if (getIsConnected() && pendingCount > 0) {
      void flushQueue();
    }
  }, 30_000);

  return () => {
    unsubscribe();
    clearInterval(interval);
  };
}

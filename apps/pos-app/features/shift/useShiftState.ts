import { useCallback, useEffect, useState } from "react";
import { supabase, invokeFn, isNetworkError } from "../../services/supabase";
import { useAppAlert } from "../ui/AppAlertProvider";
import { useToast } from "../ui/ToastProvider";
import { getIsConnected } from "../offline/networkStatus";
import { flushQueue, getPendingCountSync, getStuckCountSync, enqueueShiftAction } from "../offline/offlineQueue";
import type { ShiftReportData } from "../receipt/generateShiftReport";
import type { CashierReceiptData } from "../receipt/generateCashierCloseReceipt";
import { formatDuration } from "./shiftHelpers";
import { EMPTY_SHIFT, STORAGE_KEY, type CashEvent, type CurrentStatus, type EventType, type RegisterInfo, type Shift } from "./types";

interface Args {
  activeWorkspaceId: string | null | undefined;
  activeBranchId: string | null | undefined;
  isManager: boolean;
  registers: RegisterInfo[];
  selectedRegisterId: string | null;
  refreshRegisters: () => Promise<void>;
  onManagerClosed: (reportData: ShiftReportData | null) => void;
  onCashierClosed: (receipt: CashierReceiptData | null) => void;
}

export function useShiftState({ activeWorkspaceId, activeBranchId, isManager, registers, selectedRegisterId, refreshRegisters, onManagerClosed, onCashierClosed }: Args) {
  const { showAlert } = useAppAlert();
  const { showToast } = useToast();

  const [shift, setShift] = useState<Shift>(EMPTY_SHIFT);
  const [cashierIn, setCashierIn] = useState("");
  const [floatIn, setFloatIn] = useState("1000");
  const [elapsed, setElapsed] = useState("");
  const [breakElapsed, setBreakElapsed] = useState("");
  const [openingShift, setOpeningShift] = useState(false);
  const [closingShift, setClosingShift] = useState(false);
  const [actualCashIn, setActualCashIn] = useState("");
  const [evtType, setEvtType] = useState<EventType>("in");
  const [evtAmt, setEvtAmt] = useState("");
  const [evtReason, setEvtReason] = useState("");

  /** Reconcile local drawer events against the server's cash_drawer_events —
   * local state is optimistic/cached and drifts on failed syncs, restarts, or multi-device shifts. */
  const refreshSummary = useCallback(async (shiftId: string) => {
    try {
      const { data } = await supabase.functions.invoke("pos-shift", {
        body: { action: "get_summary", shift_id: shiftId },
      });
      const serverEvents = data?.events as
        { id: string; type: string; amount: number; reason: string | null; created_at: string }[] | undefined;
      if (!serverEvents) return;
      // Server truth is INCOMPLETE while a clock/cash action is still queued
      // for retry (see enqueueShiftAction) — that action's local event isn't
      // in serverEvents yet, so overwriting shift.events with server truth
      // right now would silently erase it (not just leave it unsynced —
      // actually delete it from what the cashier sees). Wait for the queue
      // to drain; the next reconciliation (e.g. the following shift load)
      // will be complete. Global pendingCount, not shift-action-specific —
      // a pending ORDER also delays this, which is a harmless bit of extra
      // caution, not a correctness issue.
      if (getPendingCountSync() > 0) return;
      const mapped: CashEvent[] = serverEvents
        .filter(e => e.type === "sale" || e.type === "cash_in" || e.type === "cash_out")
        .map(e => ({
          id: e.id,
          type: e.type === "cash_in" ? "in" : e.type === "cash_out" ? "out" : "sale",
          amount: Number(e.amount),
          reason: e.reason ?? "",
          time: e.created_at,
        }));
      setShift(prev => {
        const next = { ...prev, events: mapped };
        try {
          const AsyncStorage = require("@react-native-async-storage/async-storage").default;
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch { /* ignore */ }
        return next;
      });
    } catch { /* keep locally recorded events if reconciliation fails */ }
  }, []);

  /* Load from AsyncStorage, then reconcile against the server if a shift is open */
  useEffect(() => {
    try {
      const AsyncStorage = require("@react-native-async-storage/async-storage").default;
      AsyncStorage.getItem(STORAGE_KEY).then((v: string | null) => {
        if (!v) return;
        const loaded: Shift = JSON.parse(v);
        setShift(loaded);
        if (loaded.open && loaded.shiftId) void refreshSummary(loaded.shiftId);
      });
    } catch { /* ignore */ }
  }, [refreshSummary]);

  /* Elapsed timer */
  useEffect(() => {
    if (!shift.open || !shift.openedAt) { setElapsed(""); return; }
    const tick = () => setElapsed(formatDuration(shift.openedAt!));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [shift.open, shift.openedAt]);

  /* Break elapsed timer */
  useEffect(() => {
    if (shift.currentStatus !== "on_break" || !shift.breakStartedAt) { setBreakElapsed(""); return; }
    const tick = () => setBreakElapsed(formatDuration(shift.breakStartedAt!));
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, [shift.currentStatus, shift.breakStartedAt]);

  async function save(next: Shift) {
    setShift(next);
    try {
      const AsyncStorage = require("@react-native-async-storage/async-storage").default;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
  }

  async function openShift() {
    if (!cashierIn.trim() || !activeWorkspaceId || !selectedRegisterId || openingShift) return;
    const selectedRegister = registers.find(r => r.id === selectedRegisterId);
    if (!selectedRegister) return;
    const openedAt = new Date().toISOString();
    const floatAmt = parseFloat(floatIn) || 0;
    const newShift: Shift = {
      open: true, cashier: cashierIn.trim(), openedAt,
      openingFloat: floatAmt, registerId: selectedRegisterId, registerName: selectedRegister.name,
      events: [], shiftId: null, currentStatus: "clocked_out", breakStartedAt: null,
    };
    // Unlike orders, a shift has no offline queue to catch up later — and it
    // can't get one cheaply, because everything downstream keys off a real
    // server-side shift_id: postClockAction() no-ops entirely when shiftId
    // is null (clock-in/out and breaks would silently stop working for the
    // rest of the shift), cash-in/cash-out events would post shift_id:
    // undefined, and every order taken in the meantime would carry
    // shift_id: null and never show up in ANY shift's report, even after
    // reconnecting — there's no later step that goes back and re-attributes
    // them. So this used to fall back to a local-only shift on a network
    // failure; now it just requires connectivity, the same as bookings and
    // unpaid tabs.
    if (!getIsConnected()) {
      showToast({ title: "No internet connection", message: "Opening a shift requires internet — connect and try again.", type: "error" });
      return;
    }
    setOpeningShift(true);
    try {
      const { data, error } = await invokeFn<{ shift?: { id: string } }>("pos-shift", {
        action: "open_shift",
        workspace_id: activeWorkspaceId,
        branch_id: activeBranchId ?? undefined,
        register_id: selectedRegisterId,
        cashier_name: cashierIn.trim(),
        opening_float: floatAmt,
      });
      if (error) {
        // A real rejection (e.g. the register-still-open guard, or another
        // device winning the race on the same register) — don't open a
        // local-only shift the cashier would wrongly believe is synced.
        showToast({ title: "Could not open shift", message: error.message ?? "Please try again.", type: "error" });
        void refreshRegisters();
        return;
      }
      if (!data?.shift?.id) {
        showToast({ title: "Could not open shift", message: "Server didn't return a shift — please try again.", type: "error" });
        return;
      }
      newShift.shiftId = data.shift.id;
      save(newShift);
    } catch {
      // getIsConnected() above only reflects the last known connectivity
      // state — a flaky-but-associated connection can still fail here. No
      // offline fallback (see the block above for why), so this is a real
      // failure: the shift did not open.
      showToast({ title: "Could not open shift", message: "Couldn't reach the server. Check your connection and try again.", type: "error" });
    } finally {
      setOpeningShift(false);
    }
  }

  function closeShift() {
    const actualCash = parseFloat(actualCashIn);
    if (isNaN(actualCash) || actualCash < 0) {
      showToast({ title: "Count the drawer first", message: "Enter the actual cash counted before closing.", type: "error" });
      return;
    }
    showAlert("Close shift?", "Make sure the drawer has been counted.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Close", style: "destructive",
        onPress: () => { void (async () => {
          if (!shift.shiftId) { save({ ...shift, open: false, currentStatus: "clocked_out" }); return; }

          setClosingShift(true);
          try {
            // A cash order queued offline under this shift carries this
            // shift's shift_id verbatim (see buildOrderBody/submitOfflineOrder)
            // and will still land in this shift's sales history whenever it
            // syncs, even after close — but close_shift's expected_float/
            // variance are computed once, at this moment, and never
            // recomputed. An order that syncs after this point would be
            // correctly counted as revenue but permanently missing from this
            // shift's cash reconciliation. If we're online, force a sync
            // attempt right now (typically a couple of seconds) instead of
            // silently leaving that gap; if we're genuinely offline, block —
            // close_shift's own network call would fail anyway.
            // Stuck orders (repeatedly failed to sync — see MAX_ATTEMPTS in
            // offlineQueue.ts) are deliberately excluded from pendingCount so
            // they stop being auto-retried forever, which also means they'd
            // silently fall through the pendingOffline check below: a real
            // order sitting unsynced on this device, with the shift closing
            // right over it, exactly the gap the comment above describes —
            // except flushQueue() can't fix this one no matter how long we
            // wait for a connection, since stuck rows are excluded from what
            // it retries. Block outright and point at the review UI instead
            // of attempting a flush that will never pick these up.
            const stuckOffline = getStuckCountSync();
            if (stuckOffline > 0) {
              showToast({
                title: "Can't close shift yet",
                message: `${stuckOffline} order${stuckOffline === 1 ? "" : "s"} from this session failed to sync and need review — open "Orders needing attention" above to retry or discard ${stuckOffline === 1 ? "it" : "them"} before closing.`,
                type: "error",
              });
              return;
            }

            let pendingOffline = getPendingCountSync();
            if (pendingOffline > 0) {
              if (getIsConnected()) {
                showToast({ title: "Syncing pending orders…", message: `Waiting for ${pendingOffline} order${pendingOffline === 1 ? "" : "s"} to sync before closing.`, type: "info" });
                await flushQueue();
                pendingOffline = getPendingCountSync();
              }
              if (pendingOffline > 0) {
                showToast({
                  title: "Can't close shift yet",
                  message: `${pendingOffline} order${pendingOffline === 1 ? "" : "s"} from this session ${pendingOffline === 1 ? "hasn't" : "haven't"} synced yet — connect to the internet and try again, or the drawer count won't include ${pendingOffline === 1 ? "it" : "them"}.`,
                  type: "error",
                });
                return;
              }
            }

            const { data: closeData, error } = await invokeFn<{ receipt?: CashierReceiptData }>("pos-shift", {
              action: "close_shift", shift_id: shift.shiftId, closing_float: actualCash,
            });
            if (error) {
              showToast({ title: "Could not close shift", message: error.message ?? "Please try again.", type: "error" });
              return;
            }

            // Blind close: cashiers never see expected/variance here — a
            // manager reconciles it separately. Managers closing their own
            // register do get the full breakdown, same as before.
            if (isManager) {
              let reportData: ShiftReportData | null = null;
              try {
                const { data } = await supabase.functions.invoke("pos-shift", {
                  body: { action: "get_shift_report", shift_id: shift.shiftId },
                });
                if (data) {
                  reportData = {
                    businessName: data.businessName ?? "",
                    shiftId: data.shiftId,
                    openedAt: data.openedAt,
                    closedAt: data.closedAt,
                    openFloat: data.openFloat,
                    cashSales: data.cashSales,
                    onlineSales: data.onlineSales,
                    totalSales: data.totalSales,
                    paymentBreakdown: data.paymentBreakdown,
                    itemCount: data.itemCount,
                    topProducts: data.topProducts ?? [],
                    discountTotal: data.discountTotal ?? 0,
                    serviceFeeTotal: data.serviceFeeTotal ?? 0,
                    voidCount: data.voidCount ?? 0,
                    voidAmount: data.voidAmount ?? 0,
                    refundCount: data.refundCount ?? 0,
                    refundAmount: data.refundAmount ?? 0,
                    cashIn: data.cashIn ?? 0,
                    cashOut: data.cashOut ?? 0,
                    expectedCash: data.expectedCash,
                    actualCash: data.actualCash,
                    variance: data.variance,
                    printedAt: new Date().toISOString(),
                  };
                }
              } catch (err) {
                console.error("[ShiftReport] fetch failed:", err);
              }
              onManagerClosed(reportData);
            } else if (closeData?.receipt) {
              onCashierClosed({ ...closeData.receipt, printedAt: new Date().toISOString() });
            } else {
              showToast({ title: "Shift closed", message: "Thanks — a manager will reconcile the drawer.", type: "success" });
            }

            setActualCashIn("");
            save({ ...shift, open: false, currentStatus: "clocked_out" });
          } finally {
            setClosingShift(false);
          }
        })(); },
      },
    ]);
  }

  async function postClockAction(action: "clock_in" | "clock_out" | "break_in" | "break_out") {
    if (!shift.shiftId || !activeWorkspaceId) return;
    const body = {
      action, shift_id: shift.shiftId,
      workspace_id: activeWorkspaceId, branch_id: activeBranchId ?? undefined,
    };
    // invokeFn (not the raw client) resolves {data,error} rather than
    // throwing on a normal function-level failure — this used to be a bare
    // try/catch around supabase.functions.invoke() with nothing checking the
    // resolved error, so a genuine server REJECTION (not just "offline") was
    // silently swallowed too: the cashier's local status flipped to
    // clocked-in/out as if it worked, with nothing ever actually recorded
    // server-side and no error shown.
    const { error } = await invokeFn("pos-shift", body);
    if (error) {
      if (isNetworkError(error)) {
        // Genuinely offline (or a dropped connection) — queue for retry
        // instead of just forgetting about it. See enqueueShiftAction's doc
        // for why this also protects against refreshSummary() silently
        // erasing this from shift.events later.
        await enqueueShiftAction({ id: `shiftact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, body }); // NOSONAR - non-security randomness
        flushQueue().catch(() => {});
      } else {
        // A real rejection (e.g. already clocked in from another device) —
        // do NOT update local status to match an action that didn't happen.
        showToast({ title: "Could not update status", message: error.message ?? "Please try again.", type: "error" });
        return;
      }
    }
    const nextStatus: CurrentStatus = action === "clock_in" ? "clocked_in"
      : action === "clock_out" ? "clocked_out"
      : action === "break_in" ? "on_break" : "clocked_in";
    save({
      ...shift, currentStatus: nextStatus,
      breakStartedAt: action === "break_in" ? new Date().toISOString() : action === "break_out" ? null : shift.breakStartedAt,
    });
  }

  async function addEvent() {
    const amt = parseFloat(evtAmt);
    if (!amt || !evtReason.trim() || !activeWorkspaceId) return;
    const evt: CashEvent = {
      id: Math.random().toString(36).slice(2), // NOSONAR - non-security randomness
      type: evtType, amount: amt,
      reason: evtReason.trim(), time: new Date().toISOString(),
    };
    // Map POS type names to pos-shift API names
    const apiType = evtType === "in" ? "cash_in" : evtType === "out" ? "cash_out" : "sale";
    const body = {
      action: "cash_event", workspace_id: activeWorkspaceId,
      shift_id: shift.shiftId ?? undefined, branch_id: activeBranchId ?? undefined,
      type: apiType, amount: amt, reason: evt.reason,
    };
    let synced = false;
    const { error } = await invokeFn("pos-shift", body);
    if (!error) {
      synced = true;
    } else if (isNetworkError(error)) {
      await enqueueShiftAction({ id: `shiftact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, body }); // NOSONAR - non-security randomness
      flushQueue().catch(() => {});
      showToast({ title: "Cash Event", message: "Saved locally — will sync once you're back online.", type: "info" });
    } else {
      // A real rejection — don't record it locally as if it happened.
      showToast({ title: "Cash Event", message: error.message ?? "Could not record — please try again.", type: "error" });
      return;
    }
    save({ ...shift, events: [...shift.events, evt] });
    setEvtAmt("");
    setEvtReason("");
    if (synced && shift.shiftId) void refreshSummary(shift.shiftId);
  }

  const salesTotal = shift.events.filter(e => e.type === "sale").reduce((sum, e) => sum + e.amount, 0);
  const cashIn = shift.events.filter(e => e.type === "in").reduce((sum, e) => sum + e.amount, 0);
  const cashOut = shift.events.filter(e => e.type === "out").reduce((sum, e) => sum + e.amount, 0);
  const expected = shift.openingFloat + salesTotal + cashIn - cashOut;

  return {
    shift, cashierIn, setCashierIn, floatIn, setFloatIn, elapsed, breakElapsed,
    openingShift, closingShift, actualCashIn, setActualCashIn,
    evtType, setEvtType, evtAmt, setEvtAmt, evtReason, setEvtReason,
    openShift, closeShift, postClockAction, addEvent,
    salesTotal, cashIn, cashOut, expected,
  };
}

import { useCallback, useEffect, useState } from "react";
import { invokeFn } from "../../services/supabase";
import { useToast } from "../ui/ToastProvider";
import { EscPrinterNative, isIminPrinterAvailable } from "../../modules/esc-printer";
import { generateShiftReport } from "../receipt/generateShiftReport";
import { printShiftReportImin } from "../receipt/printShiftReportImin";
import type { PendingReconShift, ReconDetail } from "./types";

export function usePendingReconciliation(
  isManager: boolean,
  activeWorkspaceId: string | null | undefined,
  activeBranchId: string | null | undefined,
) {
  const { showToast } = useToast();
  const [pendingRecon, setPendingRecon] = useState<PendingReconShift[]>([]);
  const [pendingReconLoading, setPendingReconLoading] = useState(false);
  const [reconDetailShift, setReconDetailShift] = useState<PendingReconShift | null>(null);
  const [reconDetail, setReconDetail] = useState<ReconDetail | null>(null);
  const [reconDetailLoading, setReconDetailLoading] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [printingRecon, setPrintingRecon] = useState(false);

  const loadPendingReconciliation = useCallback(async () => {
    if (!isManager || !activeWorkspaceId) return;
    setPendingReconLoading(true);
    try {
      const { data } = await invokeFn<{ shifts: PendingReconShift[] }>("pos-shift", {
        action: "list_pending_reconciliation", workspace_id: activeWorkspaceId, branch_id: activeBranchId ?? undefined,
      });
      setPendingRecon(data?.shifts ?? []);
    } catch {
      setPendingRecon([]);
    } finally {
      setPendingReconLoading(false);
    }
  }, [isManager, activeWorkspaceId, activeBranchId]);

  useEffect(() => { void loadPendingReconciliation(); }, [loadPendingReconciliation]);

  async function openReconDetail(row: PendingReconShift) {
    setReconDetailShift(row);
    setReconDetail(null);
    setReconDetailLoading(true);
    try {
      const { data, error } = await invokeFn<any>("pos-shift", { action: "get_shift_report", shift_id: row.id });
      if (error || !data) { showToast({ title: "Error", message: error?.message ?? "Could not load shift detail", type: "error" }); return; }
      setReconDetail({
        businessName: data.businessName ?? "", shiftId: data.shiftId, openedAt: data.openedAt, closedAt: data.closedAt,
        openFloat: data.openFloat, cashSales: data.cashSales, onlineSales: data.onlineSales,
        totalSales: data.totalSales, paymentBreakdown: data.paymentBreakdown, itemCount: data.itemCount, topProducts: data.topProducts ?? [],
        discountTotal: data.discountTotal ?? 0, serviceFeeTotal: data.serviceFeeTotal ?? 0,
        voidCount: data.voidCount ?? 0, voidAmount: data.voidAmount ?? 0,
        refundCount: data.refundCount ?? 0, refundAmount: data.refundAmount ?? 0,
        cashIn: data.cashIn, cashOut: data.cashOut, expectedCash: data.expectedCash,
        actualCash: data.actualCash, variance: data.variance, printedAt: new Date().toISOString(),
        cashierName: data.cashierName, registerName: data.registerName, branchName: data.branchName,
      });
    } finally {
      setReconDetailLoading(false);
    }
  }

  async function markReconciled() {
    if (!reconDetailShift || !activeWorkspaceId) return;
    setReconciling(true);
    const { error } = await invokeFn("pos-shift", {
      action: "reconcile_shift", workspace_id: activeWorkspaceId, shift_id: reconDetailShift.id,
    });
    setReconciling(false);
    if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
    showToast({ title: "Reconciled", message: `${reconDetailShift.registerName ?? "Shift"} marked reconciled.`, type: "success" });
    setPendingRecon((prev) => prev.filter((r) => r.id !== reconDetailShift.id));
    setReconDetailShift(null);
    setReconDetail(null);
  }

  // Reconciliation review had no way to print/reprint a paper copy of the
  // cashier's shift summary — the manager could only mark it reconciled with
  // nothing to file. reconDetail already carries every field generateShiftReport
  // needs (ReconDetail extends ShiftReportData), so this is just wiring the
  // same print path the cashier's own shift-close screen already uses.
  async function printReconciliation() {
    if (!reconDetail) return;
    setPrintingRecon(true);
    try {
      if (await isIminPrinterAvailable()) {
        await printShiftReportImin(reconDetail, { title: "RECONCILIATION REPORT", showReconciliation: true });
        return;
      }
      if (!EscPrinterNative) {
        showToast({ title: "Printer", message: "ESC/POS printer not available in this build", type: "error" });
        return;
      }
      const bytes = generateShiftReport(reconDetail);
      let binary = "";
      bytes.forEach(b => { binary += String.fromCharCode(b); });
      await EscPrinterNative.printRaw(btoa(binary));
    } catch (e: any) {
      showToast({ title: "Print Error", message: e?.message ?? "Could not print report. Check printer connection.", type: "error" });
    } finally {
      setPrintingRecon(false);
    }
  }

  return {
    pendingRecon, pendingReconLoading, loadPendingReconciliation,
    reconDetailShift, setReconDetailShift, reconDetail, reconDetailLoading, reconciling,
    openReconDetail, markReconciled, printingRecon, printReconciliation,
  };
}

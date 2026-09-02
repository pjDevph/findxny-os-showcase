import { useState } from "react";
import { invokeFn } from "../../services/supabase";
import { useAppAlert } from "../ui/AppAlertProvider";
import { useToast } from "../ui/ToastProvider";
import { EscPrinterNative, isIminPrinterAvailable } from "../../modules/esc-printer";
import { generateShiftReport, type ShiftReportData } from "../receipt/generateShiftReport";
import { generateCashierCloseReceipt, type CashierReceiptData } from "../receipt/generateCashierCloseReceipt";
import { printShiftReportImin } from "../receipt/printShiftReportImin";
import { printZReport } from "./shiftHelpers";
import type { ZReportPayload } from "./types";

export function useShiftReports(
  activeWorkspaceId: string | null | undefined,
  activeBranchId: string | null | undefined,
) {
  const { showAlert } = useAppAlert();
  const { showToast } = useToast();

  const [xReportData, setXReportData] = useState<ZReportPayload | null>(null);
  const [zReportData, setZReportData] = useState<ZReportPayload | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState<"x" | "z" | null>(null);

  const [shiftReportData, setShiftReportData] = useState<ShiftReportData | null>(null);
  const [showShiftReportPreview, setShowShiftReportPreview] = useState(false);
  const [printingShiftReport, setPrintingShiftReport] = useState(false);

  const [cashierReceiptData, setCashierReceiptData] = useState<CashierReceiptData | null>(null);
  const [showCashierReceipt, setShowCashierReceipt] = useState(false);
  const [printingCashierReceipt, setPrintingCashierReceipt] = useState(false);

  async function runXReport(openingFloat: number) {
    setReportLoading(true);
    const { data, error } = await invokeFn<ZReportPayload>("pos-zreport-generate", {
      workspace_id: activeWorkspaceId,
      branch_id: activeBranchId,
      type: "x",
      opening_float: openingFloat ?? 0,
    });
    setReportLoading(false);
    if (error || !data) {
      showToast({ title: "X Report", message: "Failed to generate X Report", type: "error" });
      return;
    }
    setXReportData(data);
    setShowReportModal("x");
  }

  async function runZReport(openingFloat: number) {
    setReportLoading(true);
    const { data, error } = await invokeFn<ZReportPayload>("pos-zreport-generate", {
      workspace_id: activeWorkspaceId,
      branch_id: activeBranchId,
      type: "z",
      opening_float: openingFloat ?? 0,
    });
    setReportLoading(false);
    if (error || !data) {
      showToast({ title: "Z Report", message: "Failed to generate Z Report", type: "error" });
      return;
    }
    setZReportData(data);
    setShowReportModal("z");
  }

  function confirmZReport(openingFloat: number) {
    showAlert(
      "Close Day?",
      "This will generate a Z Report for today and close the day. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Yes, Close Day", style: "destructive", onPress: () => { void runZReport(openingFloat); } },
      ],
    );
  }

  async function handlePrintReport(data: ZReportPayload) {
    if (!EscPrinterNative) {
      showToast({ title: "Printer", message: "ESC/POS printer not available in this build", type: "error" });
      return;
    }
    try {
      const bytes = printZReport(data, "58");
      let binary = "";
      bytes.forEach(b => { binary += String.fromCharCode(b); });
      await EscPrinterNative.printRaw(btoa(binary));
    } catch {
      showToast({ title: "Print Error", message: "Could not print report. Check printer connection.", type: "error" });
    }
  }

  async function printShiftReport() {
    if (!shiftReportData) return;
    setPrintingShiftReport(true);
    try {
      if (await isIminPrinterAvailable()) {
        await printShiftReportImin(shiftReportData, { title: "SHIFT CLOSE REPORT", showReconciliation: true });
        return;
      }
      if (!EscPrinterNative) {
        showToast({ title: "Printer", message: "ESC/POS printer not available in this build", type: "error" });
        return;
      }
      const bytes = generateShiftReport(shiftReportData);
      let binary = "";
      bytes.forEach(b => { binary += String.fromCharCode(b); });
      await EscPrinterNative.printRaw(btoa(binary));
    } catch (e: any) {
      showToast({ title: "Print Error", message: e?.message ?? "Could not print report. Check printer connection.", type: "error" });
    } finally {
      setPrintingShiftReport(false);
    }
  }

  async function printCashierReceipt() {
    if (!cashierReceiptData) return;
    setPrintingCashierReceipt(true);
    try {
      if (await isIminPrinterAvailable()) {
        await printShiftReportImin(cashierReceiptData, { title: "SHIFT CLOSE - CASHIER COPY", showReconciliation: false });
        return;
      }
      if (!EscPrinterNative) {
        showToast({ title: "Printer", message: "ESC/POS printer not available in this build", type: "error" });
        return;
      }
      const bytes = generateCashierCloseReceipt(cashierReceiptData);
      let binary = "";
      bytes.forEach(b => { binary += String.fromCharCode(b); });
      await EscPrinterNative.printRaw(btoa(binary));
    } catch (e: any) {
      showToast({ title: "Print Error", message: e?.message ?? "Could not print receipt. Check printer connection.", type: "error" });
    } finally {
      setPrintingCashierReceipt(false);
    }
  }

  return {
    xReportData, zReportData, reportLoading, showReportModal, setShowReportModal,
    runXReport, confirmZReport, handlePrintReport,
    shiftReportData, setShiftReportData, showShiftReportPreview, setShowShiftReportPreview,
    printingShiftReport, printShiftReport,
    cashierReceiptData, setCashierReceiptData, showCashierReceipt, setShowCashierReceipt,
    printingCashierReceipt, printCashierReceipt,
  };
}

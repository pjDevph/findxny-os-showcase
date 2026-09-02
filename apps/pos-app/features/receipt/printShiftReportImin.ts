/**
 * IMIN structured-print renderer for shift-report-shaped content — the
 * manager's shift-close report, the manager's reconciliation review, and the
 * cashier's blind-close receipt all share this shape (see printReceiptImin.ts
 * for the background on why IMIN hardware needs the SDK's structured calls
 * instead of raw ESC/POS byte injection: it resolves without error but never
 * reaches the physical head).
 */
import PrinterSDK, { IminFontStyle, IminPrintAlign, IminTypeface } from "react-native-printer-imin";
import { getIminPaperWidth, getIminPrinterProblem } from "../../modules/esc-printer";
import type { ShiftReportData } from "./generateShiftReport";
import type { CashierReceiptData } from "./generateCashierCloseReceipt";
import type { PaperWidth } from "./printerConfig";

const peso = (n: number) => `P${n.toFixed(2)}`;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = String(d.getDate()).padStart(2, "0");
  const mon = months[d.getMonth()];
  const yr = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${dd} ${mon} ${yr} ${hh}:${mm}`;
}

function widthFor(paperWidth?: PaperWidth | null): number {
  return paperWidth === "80" ? 48 : 32;
}

function padL(s: string, len: number): string {
  if (s.length >= len) return s.slice(0, len);
  return s + " ".repeat(len - s.length);
}

function padR(s: string, len: number): string {
  if (s.length >= len) return s.slice(0, len);
  return " ".repeat(len - s.length) + s;
}

// Same figures as printReceiptImin.ts — confirmed via on-device calibration
// that fontSize/printAndFeedPaper are the levers that actually affect this
// hardware's output; see that file for the full history.
const BODY_FONT_SIZE = 20;
const ROW_FEED_DOTS = 12;
const TIGHT_FEED_DOTS = 6;

async function printLine(
  text: string,
  opts: { align?: IminPrintAlign; bold?: boolean; fontSize?: number; feedDots?: number } = {},
): Promise<void> {
  await PrinterSDK.printTextBitmap(text, {
    align: opts.align ?? IminPrintAlign.left,
    fontStyle: opts.bold ? IminFontStyle.bold : IminFontStyle.normal,
    typeface: IminTypeface.Monospace,
    fontSize: opts.fontSize ?? BODY_FONT_SIZE,
  });
  await PrinterSDK.printAndFeedPaper(opts.feedDots ?? ROW_FEED_DOTS);
}

function makeRow(W: number) {
  return async (label: string, value: string, opts: { bold?: boolean; fontSize?: number } = {}): Promise<void> => {
    const fs = opts.fontSize ?? BODY_FONT_SIZE;
    const effectiveW = Math.max(8, Math.round(W * BODY_FONT_SIZE / fs));
    const lw = Math.floor(effectiveW * 0.55);
    const vw = effectiveW - lw - 1;
    await printLine(padL(label, lw) + " " + padR(value, vw), opts);
  };
}

export type ShiftReportIminData = (ShiftReportData | CashierReceiptData) & {
  expectedCash?: number; variance?: number;
  cashierName?: string | null; registerName?: string | null;
};

/**
 * @param showReconciliation true for the manager's shift-close/reconciliation
 * report (prints Expected/Actual/Variance + shortage warning); false for the
 * cashier's blind-close receipt (prints only what the cashier themself
 * counted — same blind-close rule generateCashierCloseReceipt.ts enforces).
 */
export async function printShiftReportImin(
  data: ShiftReportIminData,
  opts: { title: string; showReconciliation: boolean; paperWidth?: PaperWidth | null },
): Promise<void> {
  const problem = await getIminPrinterProblem();
  if (problem) throw new Error(`Built-in printer: ${problem}`);

  const W = widthFor((await getIminPaperWidth()) ?? opts.paperWidth);
  const row = makeRow(W);
  const rule = "-".repeat(W);
  const tight = { feedDots: TIGHT_FEED_DOTS };

  await PrinterSDK.setPrintModel(0);
  await PrinterSDK.enterPrinterBuffer(true);
  try {
    await PrinterSDK.printAndFeedPaper(20);
    await printLine((data.businessName || "FINDXNY").toUpperCase().slice(0, W), { align: IminPrintAlign.center, bold: true, fontSize: 26, ...tight });
    await printLine(opts.title, { align: IminPrintAlign.center, bold: true, ...tight });
    await printLine(rule, tight);

    await row("Shift #:", data.shiftId.slice(-8));
    if (data.cashierName) await row("Cashier :", data.cashierName);
    if (data.registerName) await row("Register:", data.registerName);
    await row("Opened :", fmtDate(data.openedAt));
    await row("Closed :", fmtDate(data.closedAt));
    await printLine(rule);

    const pmLabels: Record<string, string> = { cash: "Cash", gcash: "GCash", maya: "Maya", card: "Card", qrph: "QR Ph", bank_transfer: "Bank" };
    await printLine("SALES SUMMARY", { bold: true });
    for (const [key, label] of Object.entries(pmLabels)) {
      const amt = (data.paymentBreakdown as Record<string, number>)[key] ?? 0;
      if (amt > 0) await row(`  ${label}`, peso(amt));
    }
    await printLine("  " + "-".repeat(W - 2), tight);
    await row("  TOTAL", peso(data.totalSales), { bold: true, fontSize: 24 });
    await row("  Items Sold", String(data.itemCount));
    await printLine(rule);

    if (data.topProducts.length > 0) {
      await printLine("TOP ITEMS", { bold: true });
      for (const p of data.topProducts.slice(0, 5)) {
        await row(`  ${p.name}`, `x${p.qty}`);
      }
      await printLine(rule);
    }

    if (data.discountTotal > 0 || data.serviceFeeTotal > 0 || data.voidCount > 0 || data.refundCount > 0) {
      await printLine("ADJUSTMENTS", { bold: true });
      if (data.discountTotal > 0) await row("  Discounts", peso(data.discountTotal));
      if (data.serviceFeeTotal > 0) await row("  Service Charge", peso(data.serviceFeeTotal));
      if (data.voidCount > 0) await row(`  Voided (${data.voidCount})`, peso(data.voidAmount));
      if (data.refundCount > 0) await row(`  Refunded (${data.refundCount})`, peso(data.refundAmount));
      await printLine(rule);
    }

    await printLine(opts.showReconciliation ? "CASH RECONCILIATION" : "MY CASH COUNT", { bold: true });
    await row("  Float In", peso(data.openFloat));
    await row("  Cash Sales", peso(data.cashSales));
    if (data.cashIn > 0) await row("  Cash In", peso(data.cashIn));
    if (data.cashOut > 0) await row("  Cash Out", `-${peso(data.cashOut)}`);

    if (opts.showReconciliation && data.expectedCash !== undefined && data.variance !== undefined) {
      await row("  Expected", peso(data.expectedCash), { bold: true });
      await row("  Actual Cash", peso(data.actualCash));
      await row("  Variance", peso(data.variance), { bold: true });
      if (data.variance < 0) {
        await printLine("*** SHORTAGE ***", { align: IminPrintAlign.center, bold: true });
      }
    } else {
      await row("  Cash Counted", peso(data.actualCash), { bold: true });
    }
    await printLine(rule);

    await row("Printed:", fmtDate(data.printedAt));
    await PrinterSDK.printAndFeedPaper(100);
    await PrinterSDK.partialCut();
  } catch (e) {
    await PrinterSDK.exitPrinterBuffer(true).catch(() => {});
    throw e;
  }
  await PrinterSDK.commitPrinterBuffer();
  await PrinterSDK.exitPrinterBuffer(true);
}

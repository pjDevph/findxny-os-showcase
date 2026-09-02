/**
 * ESC/POS cashier's copy of a shift close — printed for the cashier at the
 * moment they close, before a manager reconciles. Deliberately omits
 * expectedCash/variance: the blind-close control means a cashier must never
 * see (or print) the target figure the manager checks their count against.
 * 58mm paper → 32 chars/line
 */
import { CMD_ALIGN_C, CMD_ALIGN_L, CMD_BOLD_OFF, CMD_BOLD_ON, CMD_CUT, CMD_FEED3, CMD_INIT, createEscPosWriter, padEnd, padStart } from "./escPos";
import type { ShiftReportData } from "./generateShiftReport";

const W = 32; // 58mm paper, 32 chars/line

export type CashierReceiptData = Omit<ShiftReportData, "expectedCash" | "variance"> & {
  cashierName?: string | null;
  registerName?: string | null;
  branchName?: string | null;
};

const peso = (n: number) => `P${n.toFixed(2)}`;

/** Format ISO date as "DD MMM YYYY HH:mm" using vanilla JS Date */
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

export function generateCashierCloseReceipt(data: CashierReceiptData): Uint8Array {
  const { push, text, lf, bytes } = createEscPosWriter();

  const line = (): void => { text("-".repeat(W)); lf(); };
  const row = (label: string, value: string): void => {
    const lw = Math.floor(W * 0.55);
    const vw = W - lw - 1;
    text(padEnd(label, lw) + " " + padStart(value, vw));
    lf();
  };

  // ── Init + header ──────────────────────────────────────────────────────────
  push(CMD_INIT, CMD_ALIGN_C, CMD_BOLD_ON);
  text((data.businessName || "FINDXNY").toUpperCase().slice(0, W)); lf();
  text("SHIFT CLOSE - CASHIER COPY"); lf();
  push(CMD_BOLD_OFF, CMD_ALIGN_L);
  line();

  // ── Shift info ─────────────────────────────────────────────────────────────
  row("Shift #:", data.shiftId.slice(-8));
  if (data.cashierName) row("Cashier :", data.cashierName);
  if (data.registerName) row("Register:", data.registerName);
  row("Opened :", fmtDate(data.openedAt));
  row("Closed :", fmtDate(data.closedAt));
  line();

  // ── Sales summary ──────────────────────────────────────────────────────────
  const pmLabels: Record<string, string> = { cash: "Cash", gcash: "GCash", maya: "Maya", card: "Card", qrph: "QR Ph", bank_transfer: "Bank" };
  text("SALES SUMMARY"); lf();
  for (const [key, label] of Object.entries(pmLabels)) {
    const amt = (data.paymentBreakdown as Record<string, number>)[key] ?? 0;
    if (amt > 0) row(`  ${label}`, peso(amt));
  }
  text("  " + "-".repeat(W - 2)); lf();
  push(CMD_BOLD_ON);
  row("  TOTAL", peso(data.totalSales));
  push(CMD_BOLD_OFF);
  row("  Items Sold", String(data.itemCount));
  line();

  // ── Top items (only if present) ───────────────────────────────────────────
  if (data.topProducts.length > 0) {
    text("TOP ITEMS"); lf();
    const products = data.topProducts.slice(0, 5);
    for (const p of products) {
      const qtyStr = `x${p.qty}`;
      const prefixLen = 2;
      const suffixLen = 2 + qtyStr.length;
      const nameAvail = W - prefixLen - suffixLen;
      const nameTrunc = p.name.slice(0, nameAvail);
      text("  " + padEnd(nameTrunc, nameAvail) + "  " + qtyStr); lf();
    }
    line();
  }

  // ── Adjustments (only if any occurred this shift) ─────────────────────────
  if (data.discountTotal > 0 || data.serviceFeeTotal > 0 || data.voidCount > 0 || data.refundCount > 0) {
    text("ADJUSTMENTS"); lf();
    if (data.discountTotal > 0) row("  Discounts", peso(data.discountTotal));
    if (data.serviceFeeTotal > 0) row("  Service Charge", peso(data.serviceFeeTotal));
    if (data.voidCount > 0) row(`  Voided (${data.voidCount})`, peso(data.voidAmount));
    if (data.refundCount > 0) row(`  Refunded (${data.refundCount})`, peso(data.refundAmount));
    line();
  }

  // ── Cash count — no expected/variance, this is a blind close ─────────────
  text("MY CASH COUNT"); lf();
  row("  Float In", peso(data.openFloat));
  row("  Cash Sales", peso(data.cashSales));
  if (data.cashIn > 0) row("  Cash In", peso(data.cashIn));
  if (data.cashOut > 0) row("  Cash Out", `-${peso(data.cashOut)}`);
  push(CMD_BOLD_ON);
  row("  Cash Counted", peso(data.actualCash));
  push(CMD_BOLD_OFF);
  line();

  push(CMD_ALIGN_C);
  text("Submitted for manager reconciliation."); lf();
  push(CMD_ALIGN_L);
  line();

  // ── Printed timestamp ─────────────────────────────────────────────────────
  row("Printed:", fmtDate(data.printedAt));

  push(CMD_FEED3, CMD_CUT);

  return bytes();
}

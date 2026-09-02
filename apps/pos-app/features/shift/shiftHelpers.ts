import { CMD_ALIGN_C, CMD_ALIGN_L, CMD_BOLD_OFF, CMD_BOLD_ON, CMD_CUT, CMD_FEED3, CMD_INIT, createEscPosWriter, padEnd, padStart } from "../receipt/escPos";
import type { ZReportPayload } from "./types";

// Specific payment methods, not a lumped "online" figure — matches the
// checkout screen's own method picker (Cash/GCash/Maya/Card/QR Ph/Bank) so
// sales can actually be reconciled per method instead of guessed at.
export const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash", gcash: "GCash", maya: "Maya", card: "Card", qrph: "QR Ph", bank_transfer: "Bank", other: "Other",
};

export function paymentBreakdownRows(breakdown: Record<string, number> | undefined): [string, number][] {
  if (!breakdown) return [];
  return Object.entries(PAYMENT_LABELS)
    .map(([key, label]) => [label, breakdown[key] ?? 0] as [string, number])
    .filter(([, amt]) => amt > 0);
}

export function formatDuration(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function printZReport(data: ZReportPayload, paperWidth: "58" | "80" = "58"): Uint8Array {
  const W = paperWidth === "80" ? 48 : 32;
  const { push, text, lf, bytes } = createEscPosWriter();

  const line = (): void => { text("-".repeat(W)); lf(); };
  const row = (label: string, value: string): void => {
    const lw = Math.floor(W * 0.55);
    const vw = W - lw - 1;
    text(padEnd(label, lw) + " " + padStart(value, vw)); lf();
  };
  const center = (t: string): void => {
    push(CMD_ALIGN_C); text(t.slice(0, W)); lf(); push(CMD_ALIGN_L);
  };

  const fmtPeso = (n: number): string => `P${n.toFixed(2)}`;
  const fmtNeg = (n: number): string => `(${n.toFixed(2)})`;
  const reportLabel = data.report_type === "z" ? "Z - REPORT" : "X - REPORT";
  const reportNo = data.report_type === "z"
    ? `No: Z-${String(data.report_no).padStart(5, "0")}`
    : `No: X-${String(data.report_no).padStart(5, "0")}`;
  const reportDate = new Date(data.report_date).toLocaleDateString("en-PH", {
    year: "numeric", month: "long", day: "numeric",
  });
  const printedAt = new Date(data.generated_at).toLocaleString("en-PH", {
    month: "2-digit", day: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  push(CMD_INIT);

  push(CMD_ALIGN_C, CMD_BOLD_ON);
  text((data.workspace_name || "—").toUpperCase().slice(0, W)); lf();
  push(CMD_BOLD_OFF);
  text((data.branch_name || "").slice(0, W)); lf();
  if (data.tin) { text(`TIN: ${data.tin}`); lf(); }
  line();

  push(CMD_ALIGN_C, CMD_BOLD_ON);
  text(reportLabel); lf();
  push(CMD_BOLD_OFF);
  text(reportNo); lf();
  text(`Date: ${reportDate}`); lf();
  push(CMD_ALIGN_L);
  line();

  push(CMD_BOLD_ON); text("SALES SUMMARY"); lf(); push(CMD_BOLD_OFF);
  row("Gross Sales", fmtPeso(data.gross_sales));
  if (data.discount_amount > 0) row("Less Discounts", fmtNeg(data.discount_amount));
  push(CMD_BOLD_ON); row("NET SALES", fmtPeso(data.net_sales)); push(CMD_BOLD_OFF);
  line();

  push(CMD_BOLD_ON); text("VAT BREAKDOWN"); lf(); push(CMD_BOLD_OFF);
  row("VATable Sales", fmtPeso(data.vatable_sales));
  row("VAT 12%", fmtPeso(data.vat_amount));
  row("VAT-Exempt", fmtPeso(data.vat_exempt_sales));
  row("Zero-Rated", fmtPeso(data.zero_rated_sales));
  line();

  push(CMD_BOLD_ON); text("PAYMENT METHODS"); lf(); push(CMD_BOLD_OFF);
  const pmLabels: Record<string, string> = { cash: "Cash", gcash: "GCash", maya: "Maya", card: "Card", qrph: "QR Ph", other: "Other" };
  for (const [key, label] of Object.entries(pmLabels)) {
    const amt = (data.payment_breakdown as Record<string, number>)[key] ?? 0;
    if (amt > 0) row(label, fmtPeso(amt));
  }
  line();

  push(CMD_BOLD_ON); text("VOIDS & CANCELLATIONS"); lf(); push(CMD_BOLD_OFF);
  row("Void Count", String(data.void_count));
  row("Void Amount", fmtPeso(data.void_amount));
  line();

  push(CMD_BOLD_ON); text("REFUNDS"); lf(); push(CMD_BOLD_OFF);
  row("Refund Count", String(data.refund_count));
  row("Refund Amount", fmtPeso(data.refund_amount));
  line();

  push(CMD_BOLD_ON); text("CASH DRAWER"); lf(); push(CMD_BOLD_OFF);
  row("Opening Float", fmtPeso(data.opening_float));
  row("+ Cash Sales", fmtPeso(data.payment_breakdown.cash));
  if (data.cash_in > 0) row("+ Cash In", fmtPeso(data.cash_in));
  if (data.cash_out > 0) row("- Cash Out", fmtPeso(data.cash_out));
  push(CMD_BOLD_ON); row("Expected Cash", fmtPeso(data.expected_cash)); push(CMD_BOLD_OFF);
  line();

  push(CMD_BOLD_ON); text("RECEIPT RANGE"); lf(); push(CMD_BOLD_OFF);
  if (data.first_receipt_no && data.last_receipt_no) {
    center(`${data.first_receipt_no} to ${data.last_receipt_no}`);
  } else {
    center("No receipts");
  }
  push(CMD_ALIGN_C);
  text(`Orders: ${data.order_count} | Cancelled: ${data.cancelled_count}`); lf();
  push(CMD_ALIGN_L);
  line();

  push(CMD_ALIGN_C);
  text(`Printed: ${printedAt}`); lf();
  push(CMD_BOLD_ON); text("--- END OF REPORT ---"); lf(); push(CMD_BOLD_OFF);
  push(CMD_FEED3, CMD_CUT);

  return bytes();
}

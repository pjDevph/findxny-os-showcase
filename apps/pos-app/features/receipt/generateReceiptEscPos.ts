/**
 * ESC/POS receipt generator for INSA / iMin built-in thermal printers.
 * Produces a base64-encoded byte string for EscPrinterNative.printRaw().
 *
 * 58mm paper → 32 chars/line   80mm paper → 48 chars/line
 */
import { ReceiptConfig, ReceiptPayload } from "./receiptConfig";

// ── ESC/POS command bytes ─────────────────────────────────────────────────────
const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

const CMD_INIT       = [ESC, 0x40];
const CMD_ALIGN_L    = [ESC, 0x61, 0x00];
const CMD_ALIGN_C    = [ESC, 0x61, 0x01];
const CMD_BOLD_ON    = [ESC, 0x45, 0x01];
const CMD_BOLD_OFF   = [ESC, 0x45, 0x00];
const CMD_FEED3      = [ESC, 0x64, 0x03];  // feed 3 lines
const CMD_CUT        = [GS,  0x56, 0x41, 0x00]; // partial cut
// ESC 3 n (set line spacing) was tried here and hung the built-in printer on
// real hardware — sendBytes() in EscPrinterModule.kt writes to /dev/printer0
// with no timeout, and this device's firmware never drained the buffer after
// receiving it, leaving the print call stuck forever (no error, no popup).
// Do not reintroduce without a driver-level timeout on that write.

const PAY: Record<string, string> = {
  cash: "Cash", gcash: "GCash", maya: "Maya", qrph: "QR Ph", card: "Card",
  bank_transfer: "Bank Transfer", other: "Other",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function encodeText(t: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < t.length; i++) out.push(t.charCodeAt(i) & 0xFF);
  return out;
}

function padL(s: string, len: number): string {
  if (s.length >= len) return s.slice(0, len);
  return s + " ".repeat(len - s.length);
}

function padR(s: string, len: number): string {
  if (s.length >= len) return s.slice(0, len);
  return " ".repeat(len - s.length) + s;
}

const peso = (n: number) => `P${n.toFixed(2)}`;

// ── Single-copy builder ───────────────────────────────────────────────────────

type Printers = {
  push: (...cmds: number[][]) => void;
  text: (t: string) => void;
  lf:   (n?: number) => void;
  line: () => void;
  row:  (label: string, value: string) => void;
};

function printStoreHeader(
  p: Printers,
  storeName: string,
  config: ReceiptConfig,
  copyLabel: string | null,
  W: number,
  headerLabel: string,
  showTin: boolean,
): void {
  if (copyLabel) {
    p.push(CMD_ALIGN_C);
    p.text(`-- ${copyLabel} --`); p.lf();
  }
  p.push(CMD_ALIGN_C, CMD_BOLD_ON);
  p.text((storeName || "—").toUpperCase().slice(0, W)); p.lf();
  p.push(CMD_BOLD_OFF);
  if (config.address) { p.text(config.address.slice(0, W)); p.lf(); }
  if (showTin && config.tin) {
    p.text(`TIN: ${config.tin}`); p.lf();
  }
  p.push(CMD_BOLD_ON);
  p.text(headerLabel);
  p.push(CMD_BOLD_OFF);
  p.lf();
  p.line();
}

function printOrderInfo(p: Printers, payload: ReceiptPayload, config: ReceiptConfig): void {
  const dateStr = new Date(payload.timestamp).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
  p.push(CMD_ALIGN_L);
  p.row("Order No.", `${config.orderNoPrefix ?? ""}${payload.orderNo}`);
  p.row("Date", dateStr);
  if (payload.tableNo)      p.row("Table",    payload.tableNo);
  if (payload.customerName) p.row("Customer", payload.customerName);
  if (payload.cashierName)  p.row("Cashier",  payload.cashierName);
  const isBookingOnly = payload.bookings.length > 0 && payload.items.length === 0;
  if (payload.orderType && !isBookingOnly) p.row("Type", payload.orderType.replaceAll("_", " ").toUpperCase());
  // Floor/seating-area only makes sense for dine-in — see printReceiptImin.ts
  // for the same gate.
  if (payload.orderType === "dine_in" && payload.floor) p.row("Floor", payload.floor);
  if (payload.internalNote) p.row("Note", payload.internalNote);
  p.line();
}

function printItems(p: Printers, payload: ReceiptPayload, W: number): void {
  const nameW = W - 7 - 10;
  p.text(padL("ITEM", nameW) + padR("QTY", 7) + padR("AMOUNT", 10)); p.lf();
  for (const item of payload.items) {
    // Show the shelf price here (not netted against item.discount) so this
    // reconciles with Subtotal below, which also sums gross line totals —
    // the "Discount -X" line right under this one is where the deduction
    // shows, once, not baked silently into this number too.
    const amt = item.price * item.qty;
    const label = item.sku ? `${item.sku} ${item.name}` : item.name;
    p.text(padL(label.slice(0, nameW), nameW) + padR(`x${item.qty}`, 7) + padR(amt.toFixed(2), 10));
    p.lf();
    if (item.notes) { p.text(`  ${item.notes.slice(0, W - 2)}`); p.lf(); }
    if (item.discount) { p.text(`  Discount -${item.discount.toFixed(2)}`); p.lf(); }
  }
  for (const b of payload.bookings) {
    p.text(padL(b.name.slice(0, nameW), nameW) + padR("x1", 7) + padR(b.total.toFixed(2), 10));
    p.lf();
  }
  p.line();
}

function printCharges(p: Printers, payload: ReceiptPayload, W: number): void {
  if (!payload.charges || payload.charges.length === 0) return;
  const nameW = W - 7 - 10;
  for (const ch of payload.charges) {
    p.text(padL(ch.name.slice(0, nameW), nameW) + padR("—", 7) + padR(ch.amount.toFixed(2), 10));
    p.lf();
  }
}

function printTotals(
  p: Printers,
  payload: ReceiptPayload,
  mode: "simple" | "official",
): void {
  p.row("Subtotal", peso(payload.subtotal));
  if (mode === "official" && payload.tax > 0) {
    p.row(`VAT (${(payload.taxRatePct * 100).toFixed(0)}%)`, peso(payload.tax));
  }
  if (payload.serviceFee > 0) {
    p.row(`Svc Chg (${(payload.svcRatePct * 100).toFixed(0)}%)`, peso(payload.serviceFee));
  }
  if (payload.discount > 0) p.row(
    payload.is_senior_pwd ? "SC/PWD Discount (20%)" : "Discount",
    `-${peso(payload.discount)}`,
  );
  if (payload.voucherDiscount && payload.voucherDiscount > 0) p.row(
    `Voucher${payload.appliedVoucherCode ? ` (${payload.appliedVoucherCode})` : ""}`,
    `-${peso(payload.voucherDiscount)}`,
  );
  p.push(CMD_BOLD_ON);
  p.row("TOTAL", peso(payload.total));
  p.push(CMD_BOLD_OFF);
  p.line();
}

function printPayment(p: Printers, payload: ReceiptPayload): void {
  // Partial payment: show amount paid and outstanding balance before payment method
  if (payload.balanceDue != null && payload.balanceDue > 0) {
    p.push(CMD_BOLD_ON); p.row("PAID", peso(payload.amountPaid ?? 0));
    p.row("BALANCE DUE", peso(payload.balanceDue)); p.push(CMD_BOLD_OFF);
  }
  if (payload.splitPayments && payload.splitPayments.length > 0) {
    for (const leg of payload.splitPayments) {
      p.row("Payment", `${PAY[leg.method] ?? leg.method} — ${peso(leg.amount)}`);
      if (leg.refNumber) p.row("Ref No.", leg.refNumber);
    }
  } else {
    p.row("Payment", PAY[payload.payMethod] ?? payload.payMethod);
    if (payload.payMethod === "cash") {
      p.row("Cash", peso(payload.cashAmt));
      if (payload.change >= 0) p.row("Change", peso(payload.change));
    }
    if (payload.refNumber) p.row("Ref No.", payload.refNumber);
  }
  if (payload.voucherCode) p.row("WiFi Voucher", payload.voucherCode);
}

function printFooter(p: Printers, config: ReceiptConfig, W: number, mode: "simple" | "official"): void {
  if (config.promoLine) {
    p.line();
    p.push(CMD_ALIGN_C); p.text(config.promoLine.slice(0, W)); p.lf(); p.push(CMD_ALIGN_L);
  }
  if (config.footer) {
    p.push(CMD_ALIGN_C); p.text(config.footer.slice(0, W)); p.lf(); p.push(CMD_ALIGN_L);
  }
  if (config.wifiSsid) {
    p.push(CMD_ALIGN_C);
    const cred = config.wifiCred ? `  ${config.wifiCred}` : "";
    p.text(`WiFi: ${config.wifiSsid}${cred}`.slice(0, W)); p.lf();
    p.push(CMD_ALIGN_L);
  }
  p.push(CMD_ALIGN_C);
  p.text("** Thank you for your business! **"); p.lf();
  if (mode === "official") {
    p.lf();
    if (config.ptu_no)        { p.text(`PTU No.: ${config.ptu_no}`.slice(0, W)); p.lf(); }
    if (config.min_no)        { p.text(`MIN: ${config.min_no}`.slice(0, W)); p.lf(); }
    if (config.accred_no) {
      const al = config.accred_date
        ? `Accred No.: ${config.accred_no} (${config.accred_date})`
        : `Accred No.: ${config.accred_no}`;
      p.text(al.slice(0, W)); p.lf();
    }
    if (config.serial_series) { p.text(`Series: ${config.serial_series}`.slice(0, W)); p.lf(); }
  }
  p.push(CMD_ALIGN_L);
  p.push(CMD_FEED3, CMD_CUT);
}

function buildCopy(opts: {
  bytes: number[];
  payload: ReceiptPayload;
  config: ReceiptConfig;
  storeName: string;
  copyLabel: string | null;
  W: number;
  mode: "simple" | "official";
  showTin: boolean;
}): void {
  const { bytes, payload, config, storeName, copyLabel, W, mode, showTin } = opts;
  const push = (...cmds: number[][]): void => {
    for (const cmd of cmds) for (const b of cmd) bytes.push(b);
  };
  const text = (t: string): void => {
    for (const b of encodeText(t)) bytes.push(b);
  };
  const lf = (n = 1): void => {
    for (let i = 0; i < n; i++) bytes.push(LF);
  };
  const line = (): void => { text("-".repeat(W)); lf(); };
  const row = (label: string, value: string): void => {
    const lw = Math.floor(W * 0.55);
    const vw = W - lw - 1;
    text(padL(label, lw) + " " + padR(value, vw));
    lf();
  };
  const p: Printers = { push, text, lf, line, row };

  const isBookingOnly = payload.bookings.length > 0 && payload.items.length === 0;
  let headerLabel: string;
  if (isBookingOnly)          headerLabel = "BOOKING CONFIRMATION";
  else if (mode === "official") headerLabel = "SALES INVOICE";
  else                          headerLabel = "SALES ORDER";
  push(CMD_INIT);
  // Top margin: after a cut the print head sits ~15mm below the cutter, so the
  // first lines land in the tear-off zone. Feed enough lines that the header
  // (on BOTH the customer copy — first print after the prior cut — and the
  // merchant copy) clears the dead zone. 5 lines ≈ 21mm on this INSA printer.
  p.lf(5);
  printStoreHeader(p, storeName, config, copyLabel, W, headerLabel, showTin);
  printOrderInfo(p, payload, config);
  printItems(p, payload, W);
  printCharges(p, payload, W);
  printTotals(p, payload, mode);
  printPayment(p, payload);
  printFooter(p, config, W, mode);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateReceiptEscPos(
  payload:   ReceiptPayload,
  config:    ReceiptConfig,
  storeName: string,
  opts: {
    paperWidth?:  "58" | "80";
    receiptMode?: "simple" | "official";
    showTin?:     boolean;
    copies?:      number;
  } = {},
): string /* base64 */ {
  const W       = opts.paperWidth === "80" ? 48 : 32;
  const mode    = opts.receiptMode ?? "simple";
  const showTin = opts.showTin ?? true;
  const copies  = opts.copies ?? 1;

  const bytes: number[] = [];

  if (copies >= 2) {
    buildCopy({ bytes, payload, config, storeName, copyLabel: "Customer Copy", W, mode, showTin });
    buildCopy({ bytes, payload, config, storeName, copyLabel: "Merchant Copy", W, mode, showTin });
  } else {
    buildCopy({ bytes, payload, config, storeName, copyLabel: null, W, mode, showTin });
  }

  // base64 encode without spread (avoids stack overflow on large receipts)
  const arr = new Uint8Array(bytes);
  let binary = "";
  arr.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

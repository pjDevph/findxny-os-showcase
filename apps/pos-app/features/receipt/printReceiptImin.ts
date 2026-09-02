/**
 * IMIN structured-print receipt — a parallel renderer to
 * generateReceiptEscPos.ts for IMIN's built-in printer (see
 * printStationTicketImin.ts for the background on why this hardware needs
 * its own SDK's calls instead of raw ESC/POS byte injection).
 *
 * Row alignment (label/value columns via padL/padR, like the ESC/POS
 * version) only holds up if every character is the same width, so every
 * line here forces IminTypeface.Monospace — the default font isn't
 * guaranteed fixed-width and would visibly misalign the amount column.
 */
import PrinterSDK, { IminFontStyle, IminPrintAlign, IminTypeface } from "react-native-printer-imin";
import { getIminPaperWidth, getIminPrinterProblem } from "../../modules/esc-printer";
import { formatCashierName, ReceiptConfig, ReceiptPayload } from "./receiptConfig";
import type { PaperWidth } from "./printerConfig";

const PAY: Record<string, string> = {
  cash: "Cash", gcash: "GCash", maya: "Maya", qrph: "QR Ph", card: "Card",
  bank_transfer: "Bank Transfer", other: "Other",
};

// Tried the real ₱ sign here since IMIN's printText renders actual Android
// font glyphs (unlike ESC/POS's single-byte codepage) — but ₱ (U+20B1) isn't
// in most monospace bitmap fonts' glyph tables, so it fell back to a glyph
// from a different font in Android's fallback chain and printed as an
// unrelated (CJK-looking) character instead. Plain "P" is guaranteed to be
// in any monospace font.
const peso = (n: number) => `P${n.toFixed(2)}`;

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

// Confirmed via on-device calibration prints: setTextSize/setTextLineSpacing
// have no effect on printText() output on this hardware at any value — text
// mode is stuck at a fixed, oversized glyph height no matter what's asked
// for. printTextBitmap()'s setTextBitmapSize is a different native call pair
// (SDK section 3.11) confirmed to actually change glyph size on this
// hardware, so body text renders through that now instead.
//
// setTextBitmapLineSpacing (embedding "\n" per the SDK's own example,
// section 3.11.9) turned out NOT to close the gap either — 1 is the
// documented floor for that parameter (range 1-255) and still read as loose
// as text mode's fixed pitch. printAndFeedPaper(dots) is the one lever
// proven (via the dot-ruler calibration print) to give exact, tunable
// vertical spacing, so it's used here instead of the embedded newline —
// tuned smaller than the old ROW_FEED_DOTS=16 since these glyphs are
// genuinely smaller now too.
const BODY_FONT_SIZE = 20;
const ROW_FEED_DOTS = 12;
// Decorative lines (store header, footer thank-you/wifi/etc.) don't carry
// aligned numeric columns the way item/totals/payment rows do, so they can
// afford to sit closer together than the body — this is what actually
// shrinks the header/footer blocks, since neither fontSize nor bold changes
// row height on their own.
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
    // Column padding is computed in CHARACTERS, but characters get physically
    // wider when a row asks for a bigger fontSize (e.g. TOTAL's emphasis
    // size) — without scaling the budget down to match, a fully-padded
    // string sized for BODY_FONT_SIZE overflows the paper's physical width
    // at a larger font and wraps onto a second line.
    const fs = opts.fontSize ?? BODY_FONT_SIZE;
    const effectiveW = Math.max(8, Math.round(W * BODY_FONT_SIZE / fs));
    const lw = Math.floor(effectiveW * 0.55);
    const vw = effectiveW - lw - 1;
    await printLine(padL(label, lw) + " " + padR(value, vw), opts);
  };
}

type Row = (label: string, value: string, opts?: { bold?: boolean; fontSize?: number }) => Promise<void>;

async function printStoreHeader(
  storeName: string,
  config: ReceiptConfig,
  copyLabel: string | null,
  W: number,
  headerLabel: string,
  showTin: boolean,
  rule: string,
): Promise<void> {
  const tight = { feedDots: TIGHT_FEED_DOTS };
  // bold:true never visibly renders through printTextBitmap on this
  // hardware (same class of dead setter as setTextSize/setTextLineSpacing
  // under text mode — fontStyle just doesn't take here either), so the store
  // name gets real emphasis the confirmed-working way: a bigger fontSize,
  // like TOTAL already uses.
  await printLine((storeName || "—").toUpperCase().slice(0, W), { align: IminPrintAlign.center, bold: true, fontSize: 26, ...tight });
  if (copyLabel) await printLine(copyLabel.toUpperCase(), { align: IminPrintAlign.center, bold: true, ...tight });
  if (config.address) await printLine(config.address.slice(0, W), { align: IminPrintAlign.center, ...tight });
  if (showTin && config.tin) await printLine(`TIN: ${config.tin}`, { align: IminPrintAlign.center, ...tight });
  await printLine(headerLabel, { align: IminPrintAlign.center, bold: true, ...tight });
  await printLine(rule, tight);
}

async function printOrderInfo(payload: ReceiptPayload, config: ReceiptConfig, row: Row, rule: string): Promise<void> {
  const dateStr = new Date(payload.timestamp).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  await row("Order No.", `${config.orderNoPrefix ?? ""}${payload.orderNo}`);
  await row("Date", dateStr);
  if (payload.tableNo) await row("Table", payload.tableNo);
  await row("Customer", payload.customerName || "Walk-in");
  if (payload.cashierName) await row("Cashier", formatCashierName(payload.cashierName) ?? payload.cashierName);
  const isBookingOnly = payload.bookings.length > 0 && payload.items.length === 0;
  if (payload.orderType && !isBookingOnly) await row("Type", payload.orderType.replaceAll("_", " ").toUpperCase());
  // Floor/seating-area only makes sense for dine-in (it's meaningless for a
  // takeout bag or a room-service delivery) — gated the same way even though
  // the cart UI already only lets it be set for dine-in, so a stale value
  // from before an order-type switch can never leak onto the receipt.
  if (payload.orderType === "dine_in" && payload.floor) await row("Floor", payload.floor);
  if (payload.internalNote) await row("Note", payload.internalNote);
  await printLine(rule);
}

async function printItemsSection(payload: ReceiptPayload, W: number, rule: string, includeSku: boolean): Promise<void> {
  const nameW = W - 7 - 10;
  await printLine(padL("ITEM", nameW) + padR("QTY", 7) + padR("AMOUNT", 10), { bold: true });
  for (const item of payload.items) {
    // Shelf price, not netted against item.discount — reconciles with
    // Subtotal below (also a sum of gross line totals). The "Discount -X"
    // line right under this one is where the deduction shows, once.
    const amt = item.price * item.qty;
    const label = includeSku && item.sku ? `${item.sku} ${item.name}` : item.name;
    await printLine(padL(label.slice(0, nameW), nameW) + padR(String(item.qty), 7) + padR(peso(amt), 10));
    if (item.notes) await printLine(`  ${item.notes.slice(0, W - 2)}`);
    if (item.discount) await printLine(`  Discount -${peso(item.discount)}`);
  }
  for (const b of payload.bookings) {
    await printLine(padL(b.name.slice(0, nameW), nameW) + padR("1", 7) + padR(peso(b.total), 10));
  }
  if (payload.charges && payload.charges.length > 0) {
    for (const ch of payload.charges) {
      await printLine(padL(ch.name.slice(0, nameW), nameW) + padR("—", 7) + padR(peso(ch.amount), 10));
    }
  }
  await printLine(rule);
}

async function printTotalsSection(payload: ReceiptPayload, mode: "simple" | "official", row: Row, rule: string): Promise<void> {
  await row("Subtotal", peso(payload.subtotal));
  if (mode === "official" && payload.tax > 0) {
    await row(`VAT (${(payload.taxRatePct * 100).toFixed(0)}%)`, peso(payload.tax));
  }
  if (payload.serviceFee > 0) {
    await row(`Svc Chg (${(payload.svcRatePct * 100).toFixed(0)}%)`, peso(payload.serviceFee));
  }
  if (payload.discount > 0) {
    await row(payload.is_senior_pwd ? "SC/PWD Discount (20%)" : "Discount", `-${peso(payload.discount)}`);
  }
  if (payload.voucherDiscount && payload.voucherDiscount > 0) {
    const voucherSuffix = payload.appliedVoucherCode ? ` (${payload.appliedVoucherCode})` : "";
    await row(`Voucher${voucherSuffix}`, `-${peso(payload.voucherDiscount)}`);
  }
  await row("TOTAL", peso(payload.total), { bold: true, fontSize: 32 });
  await printLine(rule);
}

async function printSplitPayments(payload: ReceiptPayload, row: Row, statusLabel: string): Promise<void> {
  for (const leg of payload.splitPayments ?? []) {
    await row((PAY[leg.method] ?? leg.method).toUpperCase(), statusLabel, { bold: true });
    await row("Amount", peso(leg.amount));
    if (leg.refNumber) await row("Reference", leg.refNumber);
  }
}

async function printSinglePayment(payload: ReceiptPayload, row: Row, statusLabel: string): Promise<void> {
  await row((PAY[payload.payMethod] ?? payload.payMethod).toUpperCase(), statusLabel, { bold: true });
  if (payload.payMethod === "cash") {
    await row("Cash", peso(payload.cashAmt));
    if (payload.change >= 0) await row("Change", peso(payload.change));
  }
  if (payload.refNumber) await row("Reference", payload.refNumber);
}

async function printPaymentSection(payload: ReceiptPayload, row: Row): Promise<void> {
  const hasBalance = payload.balanceDue != null && payload.balanceDue > 0;
  if (hasBalance) {
    await row("PAID", peso(payload.amountPaid ?? 0), { bold: true });
    await row("BALANCE DUE", peso(payload.balanceDue as number), { bold: true });
  }
  // Fully settled orders get a prominent PAID next to the method — a
  // partial-balance order shouldn't, since that would read as the whole
  // order being settled when it isn't (the rows above already cover it).
  const statusLabel = hasBalance ? "" : "PAID";

  const hasSplit = payload.splitPayments && payload.splitPayments.length > 0;
  if (hasSplit) await printSplitPayments(payload, row, statusLabel);
  else await printSinglePayment(payload, row, statusLabel);

  if (payload.voucherCode) await row("WiFi Voucher", payload.voucherCode);
}

async function printFooterSection(config: ReceiptConfig, W: number, mode: "simple" | "official"): Promise<void> {
  const c = { align: IminPrintAlign.center, feedDots: TIGHT_FEED_DOTS };
  if (config.promoLine) await printLine(config.promoLine.slice(0, W), { ...c, bold: true });
  if (config.footer) await printLine(config.footer.slice(0, W), c);
  if (config.wifiSsid) {
    const cred = config.wifiCred ? `  ${config.wifiCred}` : "";
    await printLine(`WiFi: ${config.wifiSsid}${cred}`.slice(0, W), c);
  }
  await printLine("** Thank you for your business! **", c);
  if (mode === "official") {
    if (config.ptu_no) await printLine(`PTU No.: ${config.ptu_no}`.slice(0, W), c);
    if (config.min_no) await printLine(`MIN: ${config.min_no}`.slice(0, W), c);
    if (config.accred_no) {
      const al = config.accred_date
        ? `Accred No.: ${config.accred_no} (${config.accred_date})`
        : `Accred No.: ${config.accred_no}`;
      await printLine(al.slice(0, W), c);
    }
    if (config.serial_series) await printLine(`Series: ${config.serial_series}`.slice(0, W), c);
  }
}

async function printCopy(
  payload: ReceiptPayload,
  config: ReceiptConfig,
  storeName: string,
  copyLabel: string | null,
  W: number,
  mode: "simple" | "official",
  showTin: boolean,
): Promise<void> {
  const rule = "-".repeat(W);
  const row = makeRow(W);

  // Small top margin so the header isn't flush against wherever the last
  // job left off. Not the ESC/POS version's "cutter dead zone" concern —
  // this hardware's own cut already gives a clean starting position.
  await PrinterSDK.printAndFeedPaper(20);

  const isBookingOnly = payload.bookings.length > 0 && payload.items.length === 0;
  const headerLabel = isBookingOnly
    ? "BOOKING CONFIRMATION"
    : mode === "official" ? "SALES INVOICE" : "SALES ORDER";

  // Item/SKU codes are staff shorthand — meaningful on the Merchant Copy
  // (and the single-copy case), not on the customer-facing copy.
  const includeSku = copyLabel !== "Customer Copy";

  await printStoreHeader(storeName, config, copyLabel, W, headerLabel, showTin, rule);
  await printOrderInfo(payload, config, row, rule);
  await printItemsSection(payload, W, rule, includeSku);
  await printTotalsSection(payload, mode, row, rule);
  await printPaymentSection(payload, row);
  await printFooterSection(config, W, mode);

  // 80 dots jammed the cutter on this hardware originally; 150 confirmed
  // clean cuts. 100 is a middle step down to trim paper further while still
  // giving the blade meaningfully more room than the value that jammed.
  await PrinterSDK.printAndFeedPaper(100);
  await PrinterSDK.partialCut();
}

export async function printReceiptImin(
  payload: ReceiptPayload,
  config: ReceiptConfig,
  storeName: string,
  opts: {
    paperWidth?:  PaperWidth | null;
    receiptMode?: "simple" | "official";
    showTin?:     boolean;
    copies?:      number;
  } = {},
): Promise<void> {
  const mode    = opts.receiptMode ?? "simple";
  const showTin = opts.showTin ?? true;
  const copies  = opts.copies ?? 1;

  const problem = await getIminPrinterProblem();
  if (problem) throw new Error(`Built-in printer: ${problem}`);

  // Prefer what the printer itself reports over the manually configured
  // setting — see printStationTicketImin.ts for the same reasoning.
  const W = widthFor((await getIminPaperWidth()) ?? opts.paperWidth);

  // 0 = small ticket mode — see printStationTicketImin.ts's file header for
  // why this must be forced rather than trusted to whatever the printer was
  // last left in.
  await PrinterSDK.setPrintModel(0);
  // setTextLineSpacing() used to be called here, but on-device calibration
  // confirmed it has no effect on this hardware's printText() output at any
  // value — printLine() now renders through printTextBitmap() instead, whose
  // own fontSize/lineHeight are what actually control size and spacing. (0.2
  // used to reproducibly hang this native call; moot now that it isn't
  // called at all.)

  await PrinterSDK.enterPrinterBuffer(true);
  try {
    if (copies >= 2) {
      await printCopy(payload, config, storeName, "Customer Copy", W, mode, showTin);
      await printCopy(payload, config, storeName, "Merchant Copy", W, mode, showTin);
    } else {
      await printCopy(payload, config, storeName, null, W, mode, showTin);
    }
  } catch (e) {
    await PrinterSDK.exitPrinterBuffer(true).catch(() => {});
    throw e;
  }

  await PrinterSDK.commitPrinterBuffer();
  await PrinterSDK.exitPrinterBuffer(true);
}

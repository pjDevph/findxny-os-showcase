/**
 * IMIN structured-print server checklist — a parallel renderer to
 * generateServerTicketEscPos.ts for IMIN's built-in printer. See
 * printStationTicketImin.ts for the full background on why this hardware
 * needs the SDK's structured calls instead of raw ESC/POS byte injection,
 * and why every job runs as one buffered transaction.
 *
 * Unlike the kitchen/drinks tickets, this lists ALL of payload.items
 * unfiltered — the point of a server checklist is every item on the order,
 * regardless of prep_station — with a checkbox per line for the server to
 * mark off as each item reaches the table.
 */
import PrinterSDK, { IminFontStyle, IminPrintAlign } from "react-native-printer-imin";
import { getIminPaperWidth, getIminPrinterProblem } from "../../modules/esc-printer";
import { ReceiptPayload } from "./receiptConfig";
import type { PaperWidth } from "./printerConfig";

// Mirrors generateServerTicketEscPos's widthFor(): 58mm → 32 chars, 80mm → 48.
function widthFor(paperWidth?: PaperWidth | null): number {
  return paperWidth === "80" ? 48 : 32;
}

// See printReceiptImin.ts for the calibration prints that found this:
// setTextSize/setTextLineSpacing don't affect printText() output on this
// hardware at any value. printTextBitmap()'s setTextBitmapSize is a
// different native call pair (SDK section 3.11) confirmed to actually
// change glyph size, so this renders through that instead, with
// printAndFeedPaper(dots) — not the embedded-"\n"/setTextBitmapLineSpacing
// pattern the SDK's own example uses — for line advance, since that's the
// one lever proven (via the dot-ruler calibration print) to give exact,
// tunable spacing.
const BODY_FONT_SIZE = 20;
const ROW_FEED_DOTS = 12;

async function printLine(
  text: string,
  opts: { align?: IminPrintAlign; bold?: boolean; fontSize?: number } = {},
): Promise<void> {
  await PrinterSDK.printTextBitmap(text, {
    align: opts.align ?? IminPrintAlign.left,
    fontStyle: opts.bold ? IminFontStyle.bold : IminFontStyle.normal,
    fontSize: opts.fontSize ?? BODY_FONT_SIZE,
  });
  await PrinterSDK.printAndFeedPaper(ROW_FEED_DOTS);
}

async function printItems(items: ReceiptPayload["items"]): Promise<void> {
  for (const item of items) {
    const skuPrefix = item.sku ? `${item.sku} ` : "";
    await printLine(`[ ] ${item.qty}x ${skuPrefix}${item.name}`, { bold: true });
    if (item.notes) await printLine(`      ${item.notes}`);
    for (const addon of item.addons ?? []) {
      const addonQty = addon.qty > 1 ? ` (${addon.qty}x)` : "";
      await printLine(`      + ${addon.name}${addonQty}`);
    }
  }
}

/**
 * Mirrors generateServerTicketEscPos: returns without printing anything if
 * the order has no items (same "skip, don't send an empty ticket" contract
 * the ESC/POS callers rely on).
 */
export async function printServerTicketImin(
  payload: ReceiptPayload,
  paperWidth?: PaperWidth | null,
): Promise<void> {
  const items = payload.items ?? [];
  if (items.length === 0) return;

  const problem = await getIminPrinterProblem();
  if (problem) throw new Error(`Built-in printer: ${problem}`);

  // Prefer what the printer itself reports over the manually configured
  // setting — the hardware always knows what's actually loaded, the setting
  // only knows what someone last typed in.
  const rule = "-".repeat(widthFor((await getIminPaperWidth()) ?? paperWidth));

  // 0 = small ticket mode — see printStationTicketImin.ts's file header for
  // why this must be forced rather than trusted to whatever the printer was
  // last left in.
  await PrinterSDK.setPrintModel(0);

  // isClean=true: discard any stale queued data from a previous job that
  // never got submitted, so this ticket starts from a known-empty queue.
  await PrinterSDK.enterPrinterBuffer(true);
  try {
    await PrinterSDK.printAndFeedPaper(20);

    await printLine("*** ORDER CHECKLIST ***", { align: IminPrintAlign.center, bold: true, fontSize: 32 });
    await printLine(rule);

    const dateStr = new Date(payload.timestamp).toLocaleString("en-PH", { hour: "2-digit", minute: "2-digit" });
    await printLine(`Order No. #${payload.orderNo}`, { align: IminPrintAlign.center, bold: true });
    const typeAndTable = [
      payload.orderType ? payload.orderType.replaceAll("_", " ").toUpperCase() : null,
      payload.tableNo ? `Table ${payload.tableNo}` : null,
    ].filter(Boolean).join("   ");
    await printLine(typeAndTable ? `${typeAndTable}   ${dateStr}` : dateStr, { align: IminPrintAlign.center });
    if (payload.customerName) await printLine(`Customer: ${payload.customerName}`);
    await printLine(rule);

    await printItems(items);
    await printLine(rule);

    // Floor/seating-area footer — the whole point of the checklist is
    // telling the server where to deliver it, so this is the last thing
    // read before heading out. Dine-in only, same gate as the receipt.
    if (payload.orderType === "dine_in" && payload.floor) {
      await printLine(`Serve at: ${payload.floor}`, { align: IminPrintAlign.center, bold: true, fontSize: 26 });
      await printLine(rule);
    }

    // Same clearance tuned for the station tickets' cutter — see
    // printStationTicketImin.ts for the jam/waste history behind this value.
    await PrinterSDK.printAndFeedPaper(100);
    await PrinterSDK.partialCut();
  } catch (e) {
    await PrinterSDK.exitPrinterBuffer(true).catch(() => {});
    throw e;
  }

  await PrinterSDK.commitPrinterBuffer();
  await PrinterSDK.exitPrinterBuffer(true);
}

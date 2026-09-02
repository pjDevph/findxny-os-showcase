/**
 * IMIN structured-print station ticket — a parallel renderer to
 * generateStationTicketEscPos.ts for IMIN's built-in printer.
 *
 * Raw ESC/POS byte injection (sendRAWData/sendRAWDataHexStr) never reached
 * the physical head on this hardware for an unrelated reason: this app's own
 * native module only knows how to reach /dev/printer0 or an INSA USB chip
 * (28E9:0289) — neither exists on IMIN terminals, whose built-in printer is
 * driven entirely through com.imin.printerservice. This file goes through
 * react-native-printer-imin instead, which talks to that service directly.
 *
 * Immediate/"command mode" calls (printText/printAndLineFeed fired one at a
 * time, each its own round-trip) produced correct output WITHIN a ticket but
 * two separate tickets printed back-to-back overlapped/double-exposed on the
 * same paper position, even after enlarging the feed between them — ruling
 * out "not enough paper fed". Per IMIN's SDK docs (section 3.18, Transaction
 * printing): command-mode calls execute individually, while transaction mode
 * queues an entire ticket and prints it as one atomic job — "It is
 * recommended to use transaction printing for the whole receipt." That's
 * the documented fix for exactly this overlap symptom, not ad hoc delays.
 *
 * Swan2 specifically (per the built-in printer dev docs, section 3.4.11) has
 * two firmware modes: 0 = "small ticket mode" (normal continuous receipt
 * paper), 1 = "Label mode" (gap-fed labels, used by this app's separate drink
 * label feature). Whichever mode the printer was last left in persists
 * across jobs, so a ticket print after a label print — or after any other
 * app used this printer — can land in the wrong mode and confuse the
 * cutter's idea of where paper actually is. Forcing mode 0 before every
 * ticket keeps this print unaffected by whatever ran before it.
 */
import PrinterSDK, { IminFontStyle, IminPrintAlign } from "react-native-printer-imin";
import { getIminPaperWidth, getIminPrinterProblem } from "../../modules/esc-printer";
import { ReceiptPayload } from "./receiptConfig";
import type { PaperWidth } from "./printerConfig";
import type { StationTicketStation } from "./generateStationTicketEscPos";

const STATION_LABEL: Record<StationTicketStation, string> = {
  kitchen: "KITCHEN",
  drinks:  "DRINKS",
};

// Mirrors generateStationTicketEscPos's widthFor(): 58mm → 32 chars, 80mm → 48.
// Swan2's built-in printer is the 80mm-capable variant, so a shop running
// 80mm ticket rolls needs this or every rule/header only fills half the paper.
function widthFor(paperWidth?: PaperWidth | null): number {
  return paperWidth === "80" ? 48 : 32;
}

// See printReceiptImin.ts for the calibration prints that found this:
// setTextSize/setTextLineSpacing don't affect printText() output on this
// hardware at any value — text mode is stuck at a fixed, oversized glyph
// height regardless of what's asked for. printTextBitmap()'s
// setTextBitmapSize is a different native call pair (SDK section 3.11)
// confirmed to actually change glyph size, so tickets render through that
// instead. setTextBitmapLineSpacing (embedding "\n" per the SDK's own
// example, 3.11.9) turned out NOT to close the spacing gap — 1 is the
// documented floor for that parameter and still read as loose as text
// mode's fixed pitch — so printAndFeedPaper(dots) is used for line advance
// instead, the one lever proven (via the dot-ruler calibration print) to
// give exact, tunable spacing.
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
    await printLine(`${item.qty}x  ${skuPrefix}${item.name}`, { bold: true });
    if (item.notes) await printLine(`    ${item.notes}`);
    for (const addon of item.addons ?? []) {
      const addonQty = addon.qty > 1 ? ` (${addon.qty}x)` : "";
      await printLine(`    + ${addon.name}${addonQty}`);
    }
  }
}

/**
 * Mirrors generateStationTicketEscPos: filters to the station's items,
 * returns without printing anything if there are none (same "skip, don't
 * send an empty ticket" contract the ESC/POS callers rely on).
 */
export async function printStationTicketImin(
  payload: ReceiptPayload,
  station: StationTicketStation,
  paperWidth?: PaperWidth | null,
): Promise<void> {
  const items = (payload.items ?? []).filter(i => i.prep_station === station);
  if (items.length === 0) return;

  const problem = await getIminPrinterProblem();
  if (problem) throw new Error(`Built-in printer: ${problem}`);

  // Prefer what the printer itself reports over the manually configured
  // setting — the hardware always knows what's actually loaded, the setting
  // only knows what someone last typed in.
  const rule = "-".repeat(widthFor((await getIminPaperWidth()) ?? paperWidth));

  // 0 = small ticket mode — see file header. Must happen before entering the
  // print transaction below, not queued inside it.
  await PrinterSDK.setPrintModel(0);
  // setTextLineSpacing() used to be called here, but on-device calibration
  // confirmed it has no effect on this hardware's printText() output at any
  // value — see printLine()'s comment above for what actually controls size
  // and spacing now. (0.2 used to reproducibly hang this native call; moot
  // now that it isn't called at all.)

  // isClean=true: discard any stale queued data from a previous job that
  // never got submitted (e.g. a prior crash mid-transaction), so this
  // ticket starts from a known-empty queue rather than appending to leftovers.
  await PrinterSDK.enterPrinterBuffer(true);
  try {
    // Trimmed from 120 — that was carried over from the INSA ESC/POS
    // printer's cutter dead zone, which doesn't apply here at all (this is
    // the top of a fresh job, not a post-cut position).
    await PrinterSDK.printAndFeedPaper(20);

    await printLine(`*** ${STATION_LABEL[station]} ***`, { align: IminPrintAlign.center, bold: true, fontSize: 32 });
    await printLine(rule);

    const dateStr = new Date(payload.timestamp).toLocaleString("en-PH", { hour: "2-digit", minute: "2-digit" });
    await printLine(`Order No. #${payload.orderNo}`, { align: IminPrintAlign.center, bold: true });
    const typeAndTable = [
      payload.orderType ? payload.orderType.replaceAll("_", " ").toUpperCase() : null,
      payload.tableNo ? `Table ${payload.tableNo}` : null,
    ].filter(Boolean).join("   ");
    await printLine(typeAndTable ? `${typeAndTable}   ${dateStr}` : dateStr, { align: IminPrintAlign.center });
    await printLine(rule);

    await printItems(items);
    await printLine(rule);

    // 80 dots jammed the cutter originally; 150 confirmed clean cuts. 100 is
    // a middle step down to trim paper further while still giving the blade
    // meaningfully more room than the value that jammed.
    await PrinterSDK.printAndFeedPaper(100);
    await PrinterSDK.partialCut();
  } catch (e) {
    // Something went wrong building the job — discard the queue rather than
    // leaving half a ticket buffered to bleed into the next print.
    await PrinterSDK.exitPrinterBuffer(true).catch(() => {});
    throw e;
  }

  // Submits the queued job — the printer executes it as a single job from
  // here, so it can't interleave with whatever gets queued next.
  await PrinterSDK.commitPrinterBuffer();
  // isCommit=true here means "clear the queue on exit", not "discard the
  // ticket" — commitPrinterBuffer() already submitted it for printing.
  await PrinterSDK.exitPrinterBuffer(true);
}

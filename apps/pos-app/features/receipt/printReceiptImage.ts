/**
 * Image-based receipt printing — renders PrintableReceiptView off-screen
 * (via ReceiptImageCaptureHost, mounted at the app root), captures it to a
 * bitmap, and sends that through PrinterSDK.printSingleBitmapBlackWhite().
 *
 * Built to replace printReceiptImin.ts's text-mode rendering after
 * setTextLineSpacing() reproducibly hung the native bridge (twice, with no
 * error, no completion — see printStationTicketImin.ts's history for the
 * full account). One image transfer per copy has far less surface area for
 * that than dozens of stateful printText/setTextLineSpacing/setAlignment
 * calls, and guarantees the print matches the on-screen preview exactly,
 * since both are the same component now.
 */
import PrinterSDK from "react-native-printer-imin";
import { getIminPrinterProblem } from "../../modules/esc-printer";
import { requestReceiptCapture } from "./receiptImageBridge";
import { pixelWidthFor } from "./PrintableReceiptView";
import { ReceiptConfig, ReceiptPayload } from "./receiptConfig";
import type { PaperWidth } from "./printerConfig";

async function printOneCopy(
  payload: ReceiptPayload,
  config: ReceiptConfig,
  storeName: string,
  copyLabel: string | null,
  mode: "simple" | "official",
  showTin: boolean,
  includeSku: boolean,
  pixelWidth: number,
): Promise<void> {
  const uri = await requestReceiptCapture({
    payload, config, storeName, copyLabel, mode, showTin, includeSku, pixelWidth,
  });
  console.log(`[printReceiptImage] captured ${copyLabel ?? "receipt"} at ${uri}, printing at width ${pixelWidth}`);
  try {
    await PrinterSDK.printSingleBitmapBlackWhite(uri, { width: pixelWidth });
    console.log(`[printReceiptImage] printSingleBitmapBlackWhite resolved for ${copyLabel ?? "receipt"}`);
  } catch (e) {
    console.log(`[printReceiptImage] printSingleBitmapBlackWhite THREW for ${copyLabel ?? "receipt"}:`, e);
    throw e;
  }
  // Same clearance that worked for the text-mode cutter — see
  // printStationTicketImin.ts for the jam/waste history behind this value.
  await PrinterSDK.printAndFeedPaper(100);
  await PrinterSDK.partialCut();
  console.log(`[printReceiptImage] feed+cut done for ${copyLabel ?? "receipt"}`);
}

export async function printReceiptImage(
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
  const pixelWidth = pixelWidthFor(opts.paperWidth === "80" ? "80" : "58");

  const problem = await getIminPrinterProblem();
  if (problem) throw new Error(`Built-in printer: ${problem}`);

  await PrinterSDK.setPrintModel(0);

  if (copies >= 2) {
    await printOneCopy(payload, config, storeName, "Customer Copy", mode, showTin, false, pixelWidth);
    // No confirmed completion signal from the SDK for either the bitmap
    // transfer or the cut — same reasoning as the text-mode receipt/ticket
    // pacing (see receiptPrintUtils.ts), a fixed pause before the next job
    // is queued so it can't race the one still physically printing.
    await new Promise(resolve => setTimeout(resolve, 2000));
    await printOneCopy(payload, config, storeName, "Merchant Copy", mode, showTin, true, pixelWidth);
  } else {
    await printOneCopy(payload, config, storeName, null, mode, showTin, true, pixelWidth);
  }
}

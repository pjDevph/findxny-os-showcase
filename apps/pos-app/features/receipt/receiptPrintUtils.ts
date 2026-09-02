/**
 * Shared receipt print logic — same IMIN-vs-raw-ESC/POS branch that
 * stationTicketPrintUtils.ts uses for kitchen/drinks tickets, so the
 * built-in printer on IMIN terminals (Swan2 etc.) gets a working receipt
 * path instead of the raw byte injection that never reaches the physical
 * head on that hardware (see printStationTicketImin.ts for background).
 */
import { EscPrinterNative, isIminPrinterAvailable } from "../../modules/esc-printer";
import { generateReceiptEscPos } from "./generateReceiptEscPos";
import { printReceiptImin } from "./printReceiptImin";
import { ReceiptConfig, ReceiptPayload } from "./receiptConfig";
import type { PrinterConfig } from "./printerConfig";

export async function printReceipt(
  payload:   ReceiptPayload,
  config:    ReceiptConfig,
  storeName: string,
  printer:   PrinterConfig,
): Promise<void> {
  if (!EscPrinterNative) throw new Error("Printer module not available — rebuild required (expo run:android).");

  const opts = {
    paperWidth:  printer.paperWidth === "80" ? ("80" as const) : ("58" as const),
    copies:      printer.copies,
    receiptMode: printer.receiptMode,
    showTin:     printer.showTin,
  };

  if (await isIminPrinterAvailable()) {
    // Image-capture path (printReceiptImage) was tried and abandoned — every
    // JS-level step succeeded (correct-size capture, printSingleBitmapBlackWhite
    // resolved cleanly, feed+cut confirmed) but nothing ever reached paper,
    // consistently, across multiple well-instrumented tests. iminPrintUtils
    // (the object printSingleBitmapBlackWhite calls into) is proven non-null —
    // it's the same object powering printText/printAndFeedPaper/partialCut,
    // which work — so the failure is inside the vendor's closed-source
    // printSingleBitmapBlackWhite implementation itself, not reachable from
    // here. Text mode via printReceiptImin is the confirmed-working path;
    // printReceiptImage.ts / PrintableReceiptView.tsx / the capture host are
    // left in place in case a future SDK update fixes bitmap printing.
    console.log(`[printReceipt] sending receipt for order ${payload.orderNo} to IMIN built-in printer`);
    await printReceiptImin(payload, config, storeName, opts);
    // Callers typically print kitchen/drinks tickets right after this on the
    // same built-in printer — commitPrinterBuffer() resolves once the job is
    // submitted, not once the physical head finishes it, so without this
    // pause the next transaction can be queued while this one is still
    // printing (the same overlap issue fixed between the two station
    // tickets — see stationTicketPrintUtils.ts).
    await new Promise(resolve => setTimeout(resolve, 2000));
    return;
  }

  const base64 = generateReceiptEscPos(payload, config, storeName, opts);
  await EscPrinterNative.printRaw(base64);
}

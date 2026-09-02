/**
 * Shared kitchen/drinks ticket print logic used by both order.tsx
 * (print-on-checkout) and ReceiptModal (manual reprint button).
 */
import { EscPrinterNative, isIminPrinterAvailable } from "../../modules/esc-printer";
import { ReceiptPayload } from "./receiptConfig";
import type { PrinterConfig } from "./printerConfig";
import { generateStationTicketEscPos, StationTicketStation } from "./generateStationTicketEscPos";
import { generateServerTicketEscPos } from "./generateServerTicketEscPos";
import { printStationTicketImin } from "./printStationTicketImin";
import { printServerTicketImin } from "./printServerTicketImin";

/**
 * Prints one station's ticket. Silently no-ops (does not throw) if the order
 * has no items for that station — not every order needs both a kitchen and a
 * drinks ticket. Falls back to the built-in printer when no dedicated
 * kitchen/drinks printer is configured in Routing, so this works out of the
 * box for shops with just one thermal printer — the ticket just prints on
 * the same roll as the receipt, cut separately.
 */
export async function printStationTicket(
  payload: ReceiptPayload,
  station: StationTicketStation,
  printerConfig: PrinterConfig,
): Promise<void> {
  if (!EscPrinterNative) throw new Error("Printer module not available — rebuild required (expo run:android).");

  const allItems = payload.items ?? [];
  // Same staleness guard as drink labels: if no item carries prep_station at
  // all, the product cache is stale — bail rather than silently print nothing
  // (or print everything under the wrong station).
  const anyHasPrepStation = allItems.some(i => i.prep_station);
  if (!anyHasPrepStation) {
    throw new Error("Product data is outdated. Please navigate away and back (or restart the app) to refresh, then try again.");
  }

  const addr = station === "kitchen" ? printerConfig.kitchenTicketPrinterId : printerConfig.drinksTicketPrinterId;

  // A dedicated external ticket printer is a completely different device
  // from IMIN's built-in one — keep sending it plain ESC/POS bytes
  // regardless of what hardware this terminal itself is.
  if (addr) {
    const base64 = generateStationTicketEscPos(payload, station, { paperWidth: printerConfig.ticketPaperWidth ?? "58" });
    if (!base64) return; // no items for this station — nothing to print
    console.log(`[printStationTicket] sending ${station} ticket for order ${payload.orderNo} to ${addr}`);
    await EscPrinterNative.printRawToDevice(base64, addr);
    return;
  }

  // Built-in printer. IMIN terminals need their SDK's structured print
  // calls (see printStationTicketImin.ts) — raw ESC/POS byte injection
  // resolved without error on this hardware but never reached the physical
  // head, even wrapped in the SDK's own buffer transaction.
  if (await isIminPrinterAvailable()) {
    const items = (payload.items ?? []).filter(i => i.prep_station === station);
    if (items.length === 0) return;
    console.log(`[printStationTicket] sending ${station} ticket for order ${payload.orderNo} to IMIN built-in printer`);
    await printStationTicketImin(payload, station, printerConfig.ticketPaperWidth);
    return;
  }

  const base64 = generateStationTicketEscPos(payload, station, { paperWidth: printerConfig.ticketPaperWidth ?? "58" });
  if (!base64) return; // no items for this station — nothing to print
  console.log(`[printStationTicket] sending ${station} ticket for order ${payload.orderNo} to built-in printer`);
  await EscPrinterNative.printRaw(base64);
}

/**
 * Prints the server checklist — every item on the order, unfiltered by
 * prep_station, each with a checkbox for the server to mark off at delivery.
 * Unlike printStationTicket(), there's no routed printer address to check:
 * this always rides on the built-in/receipt printer, the same way
 * printReceipt() resolves its target, since there's no separate "server
 * printer" concept in Routing.
 */
export async function printServerTicket(
  payload: ReceiptPayload,
  printerConfig: PrinterConfig,
): Promise<void> {
  if (!EscPrinterNative) throw new Error("Printer module not available — rebuild required (expo run:android).");

  if ((payload.items ?? []).length === 0) return; // nothing to check off

  if (await isIminPrinterAvailable()) {
    console.log(`[printServerTicket] sending server checklist for order ${payload.orderNo} to IMIN built-in printer`);
    await printServerTicketImin(payload, printerConfig.paperWidth);
    return;
  }

  const base64 = generateServerTicketEscPos(payload, { paperWidth: printerConfig.paperWidth });
  if (!base64) return;
  console.log(`[printServerTicket] sending server checklist for order ${payload.orderNo} to built-in printer`);
  await EscPrinterNative.printRaw(base64);
}

/** Fires kitchen, drinks, and the server checklist. Printed SEQUENTIALLY, not
 * concurrently: when stations fall back to the same built-in printer (the
 * common single-printer setup), two overlapping USB/IMIN print sessions to
 * the same device collide and one ticket silently fails to print — reliably
 * the later one. Awaiting each in turn guarantees one print session finishes
 * before the next begins. Each is still independently caught so one ticket's
 * failure doesn't block the others. */
export async function printStationTickets(
  payload: ReceiptPayload,
  printerConfig: PrinterConfig,
): Promise<void> {
  const failures: string[] = [];
  const stations = ["kitchen", "drinks"] as StationTicketStation[];
  for (const station of stations) {
    try {
      await printStationTicket(payload, station, printerConfig);
    } catch (e) {
      failures.push(e instanceof Error ? e.message : String(e));
    }
    // IMIN's commitPrinterBuffer() resolves once the job is submitted, not
    // once the physical head finishes it — with no completion callback
    // exposed to JS, this pause is what actually keeps the next ticket's
    // transaction from being queued while the printer is still working
    // through this one (the cause of the overlap seen on IMIN hardware).
    if (await isIminPrinterAvailable()) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  try {
    await printServerTicket(payload, printerConfig);
  } catch (e) {
    failures.push(e instanceof Error ? e.message : String(e));
  }
  if (failures.length > 0) throw new Error(failures.join(" / "));
}

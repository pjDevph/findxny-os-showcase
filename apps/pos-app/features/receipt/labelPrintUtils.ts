/**
 * Shared drink-label print logic used by both ReceiptModal (auto-print + reprint button)
 * and order.tsx (print-on-submit).
 */
import { EscPrinterNative } from "../../modules/esc-printer";
import { loadReceiptConfig, ReceiptPayload } from "./receiptConfig";
import type { PrinterConfig } from "./printerConfig";
import { generateDrinkLabelTspl, generateOrderLabelTspl } from "./generateLabelTspl";

export async function printDrinkLabels(
  payload: ReceiptPayload,
  printerConfig: PrinterConfig,
): Promise<void> {
  const addr = printerConfig.labelPrinterId;
  if (!addr) throw new Error("No label printer configured. Go to Printers → Routing and save a label printer.");
  if (!EscPrinterNative) throw new Error("Printer module not available — rebuild required (expo run:android).");

  const cfg       = await loadReceiptConfig();
  const fontSz    = printerConfig.drinkLabelFontSize ?? "normal";
  const paperW    = printerConfig.labelPaperWidth ?? "40";
  const allItems = payload.items ?? [];

  // Primary guard: prep_station === "drinks" (same logic as Prep Display).
  // If no item has prep_station, product data is stale — require a reload rather than
  // accidentally printing food items.
  const anyHasPrepStation = allItems.some(i => i.prep_station);
  if (!anyHasPrepStation) {
    throw new Error("Product data is outdated. Please navigate away and back (or restart the app) to refresh, then try again.");
  }
  const drinkItems = allItems.filter(i => i.prep_station === "drinks");

  // Optional secondary filter: comma-separated category names in Printers → Routing.
  // "beverage" was the old hardcoded default that never matched any real category — treat it as empty.
  const rawCat = printerConfig.drinkLabelCategory?.toLowerCase().trim() === "beverage"
    ? ""
    : (printerConfig.drinkLabelCategory ?? "");
  const catFilters = rawCat.split(",").map(s => s.toLowerCase().trim()).filter(Boolean);
  const labelItems = catFilters.length > 0
    ? drinkItems.filter(i => catFilters.includes((i.category ?? "").toLowerCase().trim()))
    : drinkItems;

  console.log(
    `[printDrinkLabels] addr=${addr} mode=${printerConfig.drinkLabelMode} ` +
    `drinks=${drinkItems.length}/${allItems.length} catFilters=[${catFilters.join(",")}] labelItems=${labelItems.length}`,
  );

  if (labelItems.length === 0) {
    const reason = drinkItems.length === 0
      ? "No drink items in this order (only kitchen/food items). Labels only print for drinks."
      : `No items match the selected categories (${catFilters.join(", ")}). Check Printers → Routing.`;
    throw new Error(reason);
  }

  // Default to per_item_qty if mode was never saved
  const mode = printerConfig.drinkLabelMode ?? "per_item_qty";

  if (mode === "per_item_qty") {
    const totalLabels = labelItems.reduce((sum, i) => sum + i.qty, 0);
    let labelIndex = 0;
    for (const item of labelItems) {
      for (let i = 0; i < item.qty; i++) {
        labelIndex++;
        const base64 = generateDrinkLabelTspl(
          { name: item.name, sku: item.sku, notes: item.notes, addons: item.addons },
          {
            orderNo:     payload.orderNo,
            tableNo:     payload.tableNo,
            orderType:   payload.orderType,
            timestamp:   payload.timestamp,
            orderPrefix: cfg.orderNoPrefix,
          },
          labelIndex,
          totalLabels,
          { paperWidth: paperW, fontSize: fontSz },
        );
        console.log(`[printDrinkLabels] sending label ${labelIndex}/${totalLabels} for "${item.name}" to ${addr}`);
        await EscPrinterNative.printRawToDevice(base64, addr);
      }
    }
  } else {
    const base64 = generateOrderLabelTspl(
      labelItems,
      { orderNo: payload.orderNo, tableNo: payload.tableNo, orderType: payload.orderType, timestamp: payload.timestamp },
      { paperWidth: paperW },
    );
    console.log(`[printDrinkLabels] sending batch label (${labelItems.length} items) to ${addr}`);
    await EscPrinterNative.printRawToDevice(base64, addr);
  }
}

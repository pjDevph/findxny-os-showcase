/**
 * Printer config — DEVICE-LOCAL settings (each register/printer differs).
 *
 * Paper width, auto-print, and copy count belong to the physical device, not
 * the store, so they live in AsyncStorage (not the workspaces row). Reactive so
 * Settings edits flow into the receipt/print flow immediately.
 */
import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type PaperWidth = "40" | "58" | "80";
export type ReceiptMode = "simple" | "official";

export interface PrinterConfig {
  paperWidth:  PaperWidth;
  /** Print automatically on order completion (needs a native printer; see notes). */
  autoPrint:   boolean;
  /** Copies per print: 2 = Customer Copy + Merchant Copy. */
  copies:      number;
  /**
   * "simple"   — acknowledgement receipt: no TIN row, no VAT/SVC breakdown.
   * "official" — full BIR-format receipt: TIN, VAT, service charge rows visible.
   */
  receiptMode: ReceiptMode;
  /** Show TIN row when receiptMode is "official". Flip off to suppress TIN on a specific device. */
  showTin: boolean;
  /** Label printer device address (IP or MAC). Set via Printer Management → Routing. */
  labelPrinterId?:  string | null;
  /** "per_item_qty" = one label per unit (2x Latte → 2 labels). "per_order" = one label for whole order. */
  drinkLabelMode?:     "per_item_qty" | "per_order" | null;
  /** Online order trigger: print on confirm or only after paid/accepted. */
  drinkLabelFireOn?:   "confirmed" | "paid" | null;
  /** Category name to filter drink labels (e.g. "Beverage"). Empty = print for all items. */
  drinkLabelCategory?: string | null;
  /** Paper width of the external label printer. Defaults to "40" for 40mm sticker rolls. */
  labelPaperWidth?: PaperWidth | null;
  /** Font size for drink labels. */
  drinkLabelFontSize?: "normal" | "large" | null;
  /** Auto-print drink labels immediately on checkout (no tap required). */
  labelAutoPrint?: boolean;
  /** Kitchen ticket printer device address. Set via Printer Management → Routing. */
  kitchenTicketPrinterId?: string | null;
  /** Drinks ticket printer device address. Set via Printer Management → Routing. */
  drinksTicketPrinterId?: string | null;
  /** Auto-print kitchen/drinks tickets immediately on checkout (no tap required). */
  ticketAutoPrint?: boolean;
  /** Paper width of the kitchen/drinks ticket printer(s). Defaults to "58". */
  ticketPaperWidth?: PaperWidth | null;
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  paperWidth:      "58",
  autoPrint:       false,
  copies:          2,
  receiptMode:     "simple",
  showTin:         true,
  labelPrinterId:     null,
  drinkLabelMode:     null,
  drinkLabelFireOn:   null,
  drinkLabelCategory: null,
  labelPaperWidth:    null,
  drinkLabelFontSize: null,
  labelAutoPrint:     false,
  kitchenTicketPrinterId: null,
  drinksTicketPrinterId:  null,
  ticketAutoPrint:        false,
  ticketPaperWidth:       null,
};

const STORAGE_KEY = "pos_printer_config_v1";

let current: PrinterConfig = DEFAULT_PRINTER_CONFIG;
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

export function getPrinterConfig(): PrinterConfig {
  return current;
}

export async function hydratePrinterConfig(): Promise<PrinterConfig> {
  if (hydrated) return current;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: PrinterConfig = { ...DEFAULT_PRINTER_CONFIG, ...JSON.parse(raw) };
      // "beverage" was the old hardcoded default — it never reliably matched anything.
      // Migrate to "" (all items) so existing devices don't need a manual fix.
      if (parsed.drinkLabelCategory?.toLowerCase().trim() === "beverage") {
        parsed.drinkLabelCategory = "";
      }
      current = parsed;
      emit();
    }
  } catch { /* keep defaults */ }
  return current;
}

export async function updatePrinterConfig(patch: Partial<PrinterConfig>) {
  current = { ...current, ...patch };
  emit();
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* best effort */ }
}

function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }

export function usePrinterConfig(): PrinterConfig {
  return useSyncExternalStore(subscribe, getPrinterConfig, getPrinterConfig);
}

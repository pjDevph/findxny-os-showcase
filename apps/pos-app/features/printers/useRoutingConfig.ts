import { useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { View } from "react-native";
import { invokeFn } from "../../services/supabase";
import { useToast } from "../ui/ToastProvider";
import { useAnchoredDropdown } from "../ui/useAnchoredDropdown";
import { syncLabelPrinterAddress, syncTicketPrinterAddress } from "./printerHelpers";
import type { Printer, RoutingConfig } from "./types";

export type PrinterDropdownField = "drinkLabel" | "kitchenTicket" | "drinksTicket";

/** Owns routing-config persistence plus the category/printer picker dropdowns
 *  used to pick per-station printers and drink-label category filters.
 *  The printer picker has three separate trigger buttons (drink label,
 *  kitchen ticket, drinks ticket), so it tracks its own {x,y} instead of
 *  going through useAnchoredDropdown (which assumes a single anchor). */
export function useRoutingConfig(
  activeWorkspaceId: string | null | undefined,
  routing: RoutingConfig,
  setRouting: Dispatch<SetStateAction<RoutingConfig>>,
  printers: Printer[],
) {
  const { showToast } = useToast();
  const [savingRouting, setSavingRouting] = useState(false);
  const [printerDdField, setPrinterDdField] = useState<PrinterDropdownField | null>(null);
  const [printerDdPos, setPrinterDdPos] = useState({ top: 0, left: 0, width: 0 });
  const catDropdown = useAnchoredDropdown();

  const canSaveRouting = (!routing.drinkLabelEnabled || !!routing.drinkLabelPrinterId)
    && (!(routing.kitchenTicketEnabled || routing.drinksTicketEnabled)
      || !!(routing.kitchenTicketPrinterId || routing.drinksTicketPrinterId));

  function openPrinterDropdown(field: PrinterDropdownField, ref: RefObject<View | null>) {
    ref.current?.measureInWindow((x, y, width, height) => {
      setPrinterDdPos({ top: y + height + 4, left: x, width });
      setPrinterDdField(field);
    });
  }

  function closePrinterDropdown() { setPrinterDdField(null); }

  function selectPrinter(id: string) {
    if (printerDdField === "drinkLabel") setRouting(r => ({ ...r, drinkLabelPrinterId: id }));
    if (printerDdField === "kitchenTicket") setRouting(r => ({ ...r, kitchenTicketPrinterId: id }));
    if (printerDdField === "drinksTicket") setRouting(r => ({ ...r, drinksTicketPrinterId: id }));
    closePrinterDropdown();
  }

  function clearCategoryFilter() {
    setRouting(r => ({ ...r, drinkLabelCategory: "" }));
  }

  function toggleCategory(name: string) {
    setRouting(r => {
      const current = r.drinkLabelCategory.split(",").map(s => s.trim()).filter(Boolean);
      const selected = current.includes(name);
      const next = selected ? current.filter(n => n !== name) : [...current, name];
      return { ...r, drinkLabelCategory: next.join(",") };
    });
  }

  async function saveRouting() {
    if (!activeWorkspaceId) return;
    setSavingRouting(true);
    try {
      const { error } = await invokeFn("printers-config-update", {
        workspace_id: activeWorkspaceId, config_type: "routing", value: routing,
      });
      if (error) throw error;
      await syncLabelPrinterAddress(routing, printers);
      await syncTicketPrinterAddress(routing, printers);
      showToast({ title: "Saved", message: "Routing rules saved.", type: "success" });
    } catch (e: any) {
      showToast({ title: "Error", message: e?.message ?? "Failed to save routing", type: "error" });
    } finally {
      setSavingRouting(false);
    }
  }

  return {
    savingRouting, saveRouting, canSaveRouting,
    catDropdown, printerDdField, printerDdPos,
    openPrinterDropdown, closePrinterDropdown, selectPrinter, clearCategoryFilter, toggleCategory,
  };
}

import { Platform, PermissionsAndroid } from "react-native";
import { Feather } from "@expo/vector-icons";
import PrinterSDK, { IminFontStyle, IminPrintAlign, IminTypeface } from "react-native-printer-imin";
import { invokeFn } from "../../services/supabase";
import { EscPrinterNative, getIminPrinterProblem, isIminPrinterAvailable } from "../../modules/esc-printer";
import { updatePrinterConfig } from "../receipt/printerConfig";
import { CMD_ALIGN_C, CMD_ALIGN_L, CMD_BOLD_OFF, CMD_BOLD_ON, CMD_CUT, CMD_FEED3, CMD_INIT, createEscPosWriter } from "../receipt/escPos";
import {
  TYPE_ICONS,
  type Category, type LabelTemplate, type LoadedPrintersPayload, type Printer, type PrinterForm, type RoutingConfig,
} from "./types";

// BLUETOOTH_CONNECT is a runtime-dangerous permission starting API 31 — below
// that, BLUETOOTH is a normal permission granted automatically from the
// manifest, so PermissionsAndroid.request is a same-tick no-op there.
export async function ensureBluetoothPermission(): Promise<boolean> {
  if (Platform.OS !== "android" || (Platform.Version as number) < 31) return true;
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

export function validatePrinterForm(form: PrinterForm): string | null {
  if (!form.name.trim()) return "Printer name is required.";
  if (form.connection === "network" && !form.ip_address.trim()) return "IP address is required for network printers.";
  if (form.connection === "bluetooth" && !form.mac_address.trim()) return "MAC address is required for Bluetooth printers.";
  return null;
}

export async function persistPrinter(editingId: string | null, payload: Record<string, unknown>): Promise<void> {
  if (editingId) {
    const { data, error } = await invokeFn<{ ok?: boolean }>("printers-update", { ...payload, printer_id: editingId });
    if (error || !data?.ok) throw error ?? new Error("Failed to update printer");
  } else {
    const { data, error } = await invokeFn<{ ok?: boolean }>("printers-create", payload);
    if (error || !data?.ok) throw error ?? new Error("Failed to create printer");
  }
}

export function applyPrintersPayload(
  payload: LoadedPrintersPayload,
  setPrinters: (v: Printer[]) => void,
  setRouting: (v: RoutingConfig) => void,
  setTemplate: (v: LabelTemplate) => void,
  setCategories: (v: Category[]) => void,
  defaultRouting: RoutingConfig,
  defaultTemplate: LabelTemplate,
) {
  setPrinters(payload.printers);
  const cfg = payload.printer_config ?? {};
  if (cfg.routing) setRouting({ ...defaultRouting, ...cfg.routing });
  if (cfg.labelTemplate) setTemplate({ ...defaultTemplate, ...cfg.labelTemplate });
  setCategories(payload.categories);
}

export async function syncLabelPrinterAddress(routing: RoutingConfig, printers: Printer[]) {
  if (routing.drinkLabelPrinterId) {
    // Sync the device address from the server-selected printer record.
    // Do this regardless of drinkLabelEnabled so the address persists even when
    // the feature is toggled off — the cashier shouldn't have to re-pair every visit.
    const lp = printers.find(p => p.id === routing.drinkLabelPrinterId);
    const deviceAddr = lp?.ip_address || lp?.mac_address || null;
    await updatePrinterConfig({
      labelPrinterId: deviceAddr,
      drinkLabelMode: routing.drinkLabelMode,
      drinkLabelFireOn: routing.drinkLabelFireOn,
      drinkLabelCategory: routing.drinkLabelCategory || null,
      labelPaperWidth: routing.drinkLabelPaperWidth,
    });
  }
  // Never clear labelPrinterId here — it's a device-local setting.
  // Clearing is only appropriate when the user explicitly removes the printer record.
}

export async function syncTicketPrinterAddress(routing: RoutingConfig, printers: Printer[]) {
  // Same two-tier addressing as syncLabelPrinterAddress: workspace-level
  // routing.*PrinterId picks a printer *record*; device-local printerConfig
  // resolves it to an *address* for this specific terminal. Sync both
  // stations regardless of their enabled flags, for the same reason —
  // addresses shouldn't need re-pairing every time a toggle flips.
  const kp = routing.kitchenTicketPrinterId ? printers.find(p => p.id === routing.kitchenTicketPrinterId) : null;
  const dp = routing.drinksTicketPrinterId ? printers.find(p => p.id === routing.drinksTicketPrinterId) : null;
  await updatePrinterConfig({
    kitchenTicketPrinterId: kp?.ip_address || kp?.mac_address || null,
    drinksTicketPrinterId: dp?.ip_address || dp?.mac_address || null,
    ticketPaperWidth: routing.ticketPaperWidth,
  });
}

export function buildPrinterSavePayload(workspaceId: string | null | undefined, form: PrinterForm): Record<string, unknown> {
  return {
    workspace_id: workspaceId,
    name: form.name.trim(),
    type: form.type,
    connection: form.connection,
    mac_address: form.mac_address.trim() || null,
    ip_address: form.ip_address.trim() || null,
  };
}

export const typeLabel = (t: string) =>
  ({ receipt: "Receipt", label: "Label", kitchen: "Kitchen", "customer-display": "Display" }[t] ?? t);
export const connLabel = (c: string) =>
  ({ builtin: "Built-in", ethernet: "Ethernet", bluetooth: "Bluetooth", usb: "USB", network: "Network" }[c] ?? c);
export const typeIcon = (t: string): keyof typeof Feather.glyphMap => TYPE_ICONS[t] ?? "printer";

/** Client-side test-receipt bytes for the built-in / network receipt printer path. */
export function buildTestReceiptBytes(printerName: string): string {
  const { push, text, lf, bytes } = createEscPosWriter();
  const name = (printerName ?? "Printer").replace(/[^\x20-\x7E]/g, "").trim() || "Printer";
  push(CMD_INIT, CMD_ALIGN_C);
  push(CMD_BOLD_ON); text("TEST PRINT"); lf(); push(CMD_BOLD_OFF);
  text("----------------------------"); lf(); lf();
  text("Printer is working correctly."); lf(); lf();
  push(CMD_ALIGN_L);
  text("Printer: " + name); lf();
  push(CMD_FEED3, CMD_CUT);
  let bin = "";
  for (const b of bytes()) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Test bytes for the INSA built-in printer troubleshoot button — separate
 *  copy (not the same message as buildTestReceiptBytes) since it's meant to
 *  isolate the built-in device from any workspace printer record. Only
 *  reaches the physical head on real INSA hardware — see
 *  printBuiltInTestPage() for the IMIN equivalent. */
export function buildInsaTestBytes(): string {
  const { push, text, lf, bytes } = createEscPosWriter();
  const now = new Date();
  const dateStr = now.toDateString() + " " + now.toTimeString().slice(0, 8);
  push(CMD_INIT, CMD_ALIGN_C);
  push(CMD_BOLD_ON); text("BUILT-IN PRINTER TEST"); lf(); push(CMD_BOLD_OFF);
  text("Receipt printer OK"); lf();
  text(dateStr); lf();
  push(CMD_FEED3, CMD_CUT);
  let bin = "";
  for (const b of bytes()) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Built-in printer troubleshoot test — routes to IMIN's structured print API
 * on IMIN terminals (Swan2 etc.), since raw ESC/POS byte injection
 * (buildInsaTestBytes + EscPrinterNative.printRaw) never reaches the
 * physical head on that hardware at all (no /dev/printer0, no INSA USB
 * chip — see printStationTicketImin.ts for the full background). This test
 * button used to silently fail on IMIN devices for exactly that reason.
 */
export async function printBuiltInTestPage(): Promise<void> {
  if (await isIminPrinterAvailable()) {
    const problem = await getIminPrinterProblem();
    if (problem) throw new Error(`Built-in printer: ${problem}`);
    const now = new Date();
    const dateStr = now.toDateString() + " " + now.toTimeString().slice(0, 8);
    await PrinterSDK.setPrintModel(0);
    // setTextLineSpacing() used to be called here — dropped since on-device
    // calibration confirmed it has no effect on this hardware's printText()
    // output (see printSpacingCalibrationGrid() below).
    await PrinterSDK.enterPrinterBuffer(true);
    try {
      await PrinterSDK.printAndFeedPaper(20);
      await PrinterSDK.printText("BUILT-IN PRINTER TEST", { align: IminPrintAlign.center, fontStyle: IminFontStyle.bold });
      await PrinterSDK.printAndFeedPaper(16);
      await PrinterSDK.printText("Receipt printer OK", { align: IminPrintAlign.center });
      await PrinterSDK.printAndFeedPaper(16);
      await PrinterSDK.printText(dateStr, { align: IminPrintAlign.center });
      await PrinterSDK.printAndFeedPaper(16);
      await PrinterSDK.printAndFeedPaper(100);
      await PrinterSDK.partialCut();
    } catch (e) {
      await PrinterSDK.exitPrinterBuffer(true).catch(() => {});
      throw e;
    }
    await PrinterSDK.commitPrinterBuffer();
    await PrinterSDK.exitPrinterBuffer(true);
    return;
  }

  if (!EscPrinterNative) throw new Error("Printing isn't available on this app version. Reinstall the latest FINDXNY app and try again.");
  await EscPrinterNative.printRaw(buildInsaTestBytes());
}

/**
 * Physical ruler print for the built-in printer's dot-to-mm ratio.
 *
 * Earlier calibration prints (see git history on this function) established
 * that printAndFeedPaper(dots) is the one lever that reliably changes
 * row-to-row spacing on this hardware — but every dot value picked so far
 * (12/16/20/24/32/40) was chosen by comparing rows to EACH OTHER on paper,
 * never against a real ruler. This prints a labeled line, feeds an exact
 * dot count, prints another labeled line, and repeats — so the physical gap
 * between two consecutive lines can be measured directly with a ruler
 * against the paper. Measuring in mm for each labeled step gives an actual
 * dots-per-mm figure for this unit, which turns "try 16, try 20, see what
 * looks OK" into "we want ~3.5mm of row height, so feed ~N dots".
 */
export async function printDotRulerGrid(): Promise<void> {
  if (!(await isIminPrinterAvailable())) throw new Error("Built-in printer not available on this device.");
  const problem = await getIminPrinterProblem();
  if (problem) throw new Error(`Built-in printer: ${problem}`);

  const steps = [20, 40, 60, 80, 100];

  await PrinterSDK.setPrintModel(0);
  await PrinterSDK.enterPrinterBuffer(true);
  try {
    await PrinterSDK.printAndFeedPaper(20);
    await PrinterSDK.printText("DOT RULER", { align: IminPrintAlign.center, fontStyle: IminFontStyle.bold });
    await PrinterSDK.printAndFeedPaper(16);
    await PrinterSDK.printText("Measure gap between each line below", { align: IminPrintAlign.center });
    await PrinterSDK.printAndFeedPaper(16);
    await PrinterSDK.printText("with a ruler, in mm.", { align: IminPrintAlign.center });
    await PrinterSDK.printAndFeedPaper(16);

    await PrinterSDK.printText("---------- START ----------", { align: IminPrintAlign.left, typeface: IminTypeface.Monospace });
    for (const dots of steps) {
      await PrinterSDK.printAndFeedPaper(dots);
      await PrinterSDK.printText(`---------- +${dots} dots ----------`, { align: IminPrintAlign.left, typeface: IminTypeface.Monospace });
    }

    await PrinterSDK.printAndFeedPaper(100);
    await PrinterSDK.partialCut();
  } catch (e) {
    await PrinterSDK.exitPrinterBuffer(true).catch(() => {});
    throw e;
  }
  await PrinterSDK.commitPrinterBuffer();
  await PrinterSDK.exitPrinterBuffer(true);
}

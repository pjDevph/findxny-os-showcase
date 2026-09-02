import { useState } from "react";
import { invokeFn } from "../../services/supabase";
import { EscPrinterNative } from "../../modules/esc-printer";
import { generateDrinkLabelTspl } from "../receipt/generateLabelTspl";
import { useToast } from "../ui/ToastProvider";
import { buildTestReceiptBytes, ensureBluetoothPermission } from "./printerHelpers";
import type { Printer, RoutingConfig, LabelTemplate } from "./types";

/** Sends test print/label jobs to a printer and marks it tested on success. */
export function usePrinterTest(
  activeWorkspaceId: string | null | undefined,
  printers: Printer[],
  routing: RoutingConfig,
  template: LabelTemplate,
  loadAll: () => Promise<void>,
) {
  const { showToast } = useToast();
  const [testing, setTesting] = useState<string | null>(null);
  const [testingLabel, setTestingLabel] = useState(false);

  async function testPrinter(id: string) {
    const p = printers.find(pr => pr.id === id);
    if (!p) return;
    if (!EscPrinterNative) {
      showToast({ title: "Print failed", message: "Printing isn't available on this app version. Reinstall the latest FINDXNY app and try again.", type: "error" });
      return;
    }
    if (p.connection === "bluetooth" && !(await ensureBluetoothPermission())) {
      showToast({ title: "Permission needed", message: "Bluetooth permission was denied. Enable it for FINDXNY in Android Settings → Apps → Permissions.", type: "error" });
      return;
    }
    setTesting(id);
    try {
      if (p.connection === "usb" || p.connection === "bluetooth") {
        if (typeof EscPrinterNative.printRawToDevice !== "function")
          throw new Error("External printing isn't available on this app version. Reinstall the latest FINDXNY app and try again.");
        const addr = p.mac_address || p.ip_address || null;
        if (!addr) throw new Error("No address configured for this printer.");
        const base64 = generateDrinkLabelTspl(
          { name: "Test Label", notes: p.connection === "bluetooth" ? "Bluetooth Test" : "USB Test" },
          { orderNo: "TEST", tableNo: "—", orderType: "dine_in", timestamp: new Date().toISOString() },
          1, 1,
          { paperWidth: routing.drinkLabelPaperWidth ?? "40", fontSize: template.fontSize ?? "normal" },
        );
        await EscPrinterNative.printRawToDevice(base64, addr);
      } else {
        const base64 = buildTestReceiptBytes(p.name);
        await EscPrinterNative.printRaw(base64);
      }
      invokeFn("printers-update-meta", { workspace_id: activeWorkspaceId, printer_id: id, mark_tested: true })
        .then(() => loadAll()).catch(() => {});
    } catch (e: any) {
      showToast({ title: "Print failed", message: e?.message ?? "Could not send test print.", type: "error" });
    } finally {
      setTesting(null);
    }
  }

  async function testLabelPrint(deviceAddr: string) {
    if (!EscPrinterNative) {
      showToast({ title: "Not available", message: "Printing isn't available on this app version. Reinstall the latest FINDXNY app and try again.", type: "error" });
      return;
    }
    // Same Bluetooth MAC pattern the native module uses to route the address.
    const isBluetooth = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(deviceAddr);
    if (isBluetooth && !(await ensureBluetoothPermission())) {
      showToast({ title: "Permission needed", message: "Bluetooth permission was denied. Enable it for FINDXNY in Android Settings → Apps → Permissions.", type: "error" });
      return;
    }
    setTestingLabel(true);
    try {
      const base64 = generateDrinkLabelTspl(
        { name: "Iced Latte", notes: "Extra Shot · No Sugar" },
        { orderNo: "0042", tableNo: "Table 3", orderType: "dine_in", timestamp: new Date().toISOString() },
        1, 2,
        { paperWidth: routing.drinkLabelPaperWidth ?? "40", fontSize: template.fontSize ?? "normal" },
      );
      await EscPrinterNative.printRawToDevice(base64, deviceAddr);
      showToast({ title: "Success", message: "Test label sent to label printer.", type: "success" });
    } catch (e: any) {
      showToast({ title: "Label test failed", message: e?.message ?? "Could not send test label.", type: "error" });
    } finally {
      setTestingLabel(false);
    }
  }

  return { testing, testingLabel, testPrinter, testLabelPrint };
}

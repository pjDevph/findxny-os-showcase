import { useState } from "react";
import { EscPrinterNative, type BluetoothPrinterDevice, type UsbPrinterDevice } from "../../modules/esc-printer";
import { useToast } from "../ui/ToastProvider";
import { ensureBluetoothPermission } from "./printerHelpers";
import type { PrinterForm } from "./types";

/** USB / Bluetooth device discovery for the Add/Edit printer form. */
export function useDeviceScan(setForm: (updater: (f: PrinterForm) => PrinterForm) => void) {
  const { showToast } = useToast();
  const [scanningUsb, setScanningUsb] = useState(false);
  const [detectedUsbPrinters, setDetectedUsbPrinters] = useState<UsbPrinterDevice[]>([]);
  const [scanningBt, setScanningBt] = useState(false);
  const [detectedBtPrinters, setDetectedBtPrinters] = useState<BluetoothPrinterDevice[]>([]);

  function resetDetected() {
    setDetectedUsbPrinters([]);
    setDetectedBtPrinters([]);
  }

  async function scanUsbPrinters() {
    if (!EscPrinterNative) {
      showToast({ title: "Not available", message: "Printer scanning isn't available on this app version. Reinstall the latest FINDXNY app and try again.", type: "error" });
      return;
    }
    setScanningUsb(true);
    setDetectedUsbPrinters([]);
    try {
      const found = await EscPrinterNative.listUsbPrinters();
      setDetectedUsbPrinters(found);
      if (found.length === 0) {
        showToast({ title: "No USB printers found", message: "Ensure the XP-365B is plugged in via USB and powered on.", type: "info" });
      }
    } catch (e: any) {
      showToast({ title: "Scan failed", message: e?.message || "Could not scan for USB printers.", type: "error" });
    } finally {
      setScanningUsb(false);
    }
  }

  function applyDetectedPrinter(p: UsbPrinterDevice) {
    // USB device descriptor strings can contain lone surrogates (invalid UTF-16) that
    // cause Deno's JSON.parse to throw "unsupported Unicode escape sequence". Strip them.
    const safeName = p.name.replace(/[^ -~]/g, "").trim() || `USB Printer (${p.address})`;
    setForm(f => ({ ...f, name: f.name || safeName, type: "label", connection: "usb", mac_address: p.address }));
    setDetectedUsbPrinters([]);
    if (!p.hasPermission) {
      showToast({
        title: "Permission needed",
        message: "Android hasn't granted USB access yet. Unplug and reconnect the printer — Android will show a permission dialog.",
        type: "info",
      });
    }
  }

  async function scanBluetoothPrinters() {
    if (!EscPrinterNative) {
      showToast({ title: "Not available", message: "Bluetooth scanning isn't available on this app version. Reinstall the latest FINDXNY app and try again.", type: "error" });
      return;
    }
    if (!(await ensureBluetoothPermission())) {
      showToast({ title: "Permission needed", message: "Bluetooth permission was denied. Enable it for FINDXNY in Android Settings → Apps → Permissions.", type: "error" });
      return;
    }
    setScanningBt(true);
    setDetectedBtPrinters([]);
    try {
      const found = await EscPrinterNative.listBluetoothPrinters();
      setDetectedBtPrinters(found);
      if (found.length === 0) {
        showToast({ title: "No paired devices", message: "Pair the printer via Android Settings → Bluetooth first, then scan here.", type: "info" });
      }
    } catch (e: any) {
      showToast({ title: "Scan failed", message: e?.message || "Could not scan for Bluetooth printers.", type: "error" });
    } finally {
      setScanningBt(false);
    }
  }

  function applyBluetoothPrinter(p: BluetoothPrinterDevice) {
    setForm(f => ({ ...f, name: f.name || p.name || `BT Printer (${p.address})`, type: "label", connection: "bluetooth", mac_address: p.address }));
    setDetectedBtPrinters([]);
  }

  return {
    scanningUsb, detectedUsbPrinters, scanUsbPrinters, applyDetectedPrinter,
    scanningBt, detectedBtPrinters, scanBluetoothPrinters, applyBluetoothPrinter,
    resetDetected,
  };
}

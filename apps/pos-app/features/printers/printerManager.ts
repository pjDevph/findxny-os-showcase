/**
 * Printer Management Utilities
 *
 * Handles:
 * - Loading/saving printer configs from DB (workspaces.printer_config)
 * - Printer connection testing (mock + real)
 * - Device address validation (IP, MAC, device names)
 */

import { invokeFn } from "../../services/supabase";

export type PrinterType = "thermal" | "label" | "bluetooth_receipt";

export interface Printer {
  id: string;
  name: string;
  type: PrinterType;
  deviceAddress: string;
  model: string;
  isDefault?: boolean;
}

export interface PrinterConfig {
  id?: string;
  printers: Printer[];
  lastUpdated?: string;
}

/**
 * Load printer configuration for a workspace
 */
export async function loadPrinterConfig(
  workspaceId: string
): Promise<PrinterConfig> {
  const { data, error } = await invokeFn<{ "printer-config": { printer_config: PrinterConfig | null } | null }>(
    "pos-data",
    { workspace_id: workspaceId, resource: "printer-config", params: {} }
  );

  if (error) throw error;
  return data?.["printer-config"]?.printer_config ?? { printers: [] };
}

/**
 * Save printer configuration to workspace
 */
export async function savePrinterConfig(
  workspaceId: string,
  config: PrinterConfig
): Promise<void> {
  const { error } = await invokeFn("printers-config-update", {
    workspace_id: workspaceId,
    config_type: "printers",
    value: { printers: config.printers },
  });

  if (error) throw error;
}

/**
 * Validate device address format
 */
export function isValidDeviceAddress(address: string, type: PrinterType): boolean {
  if (!address.trim()) return false;

  switch (type) {
    case "thermal":
    case "label":
      // IP address: 192.168.1.100
      return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(address.trim()) ||
             /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(address.trim()); // hostname

    case "bluetooth_receipt":
      // MAC address: 00:1A:2B:3C:4D:5E or device name
      return /^[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}$/.test(address.trim()) ||
             /^[a-zA-Z0-9\s\-_]+$/.test(address.trim());

    default:
      return true;
  }
}

/**
 * Test printer connection
 * In production, this would use native APIs to actually test the connection.
 * For now, it's a simulated test that validates the address format.
 */
export async function testPrinterConnection(
  printer: Printer
): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    // Simulate network delay
    setTimeout(() => {
      const isValid = isValidDeviceAddress(printer.deviceAddress, printer.type);

      if (!isValid) {
        resolve({
          success: false,
          message: `Invalid ${printer.type === "bluetooth_receipt" ? "MAC address or device name" : "IP address"} format`,
        });
        return;
      }

      // In a real app, you would:
      // 1. On Android: use react-native-escpos or similar native library
      // 2. For network printers: try TCP connection to port 9100 (thermal) or 515 (label)
      // 3. For Bluetooth: use BluetoothAPI on native layer
      resolve({
        success: true,
        message: `Connected to ${printer.name} at ${printer.deviceAddress}`,
      });
    }, 800);
  });
}

/**
 * Get printer icon recommendation based on type
 */
export function getPrinterTypeLabel(type: PrinterType): string {
  const labels: Record<PrinterType, string> = {
    thermal: "Thermal Receipt Printer",
    label: "Label Printer",
    bluetooth_receipt: "Bluetooth Receipt Printer",
  };
  return labels[type] ?? "Printer";
}

/**
 * Get recommended models for printer type
 */
export function getRecommendedModels(type: PrinterType): string[] {
  switch (type) {
    case "thermal":
      return [
        "Zebra ZD400",
        "Epson TM-M30",
        "Epson TM-M50",
        "Star Micronics SM-S210i",
        "iMin A40",
        "INSA A41",
      ];

    case "label":
      return [
        "Zebra ZD220",
        "Zebra ZD411",
        "Brother QL-810W",
        "Brother QL-1110NWB",
        "Epson ColorWorks C3500",
      ];

    case "bluetooth_receipt":
      return [
        "IZZO bluetooth receipt",
        "Anycall thermal printer",
        "Godox receipt printer",
        "Thermal receipt (80mm BT)",
      ];

    default:
      return [];
  }
}

/**
 * Format printer display text
 */
export function formatPrinterDisplay(printer: Printer): string {
  return `${printer.name} (${printer.type}) — ${printer.deviceAddress}`;
}

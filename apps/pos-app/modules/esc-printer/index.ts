import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";
import PrinterSDK from "react-native-printer-imin";

export interface UsbPrinterDevice {
  name:         string;
  manufacturer: string;
  vendorId:     string;
  productId:    string;
  /** Pass to printRawToDevice() — format "VVVV:PPPP". */
  address:      string;
  hasPermission: boolean;
}

export interface BluetoothPrinterDevice {
  name:    string;
  /** Pass to printRawToDevice() — format "AA:BB:CC:DD:EE:FF". */
  address: string;
  type:    "classic" | "ble" | "dual" | "unknown";
}

export type EscPrinterNativeModule = {
  openCashDrawer(): Promise<void>;
  printRaw(base64: string): Promise<void>;
  /**
   * Send raw ESC/POS bytes to a specific external printer.
   * address: "VVVV:PPPP" for USB, "AA:BB:CC:DD:EE:FF" for Bluetooth, or "/dev/..." file path.
   */
  printRawToDevice(base64: string, address: string): Promise<void>;
  listUsbPrinters(): Promise<UsbPrinterDevice[]>;
  /** Returns bonded (paired) Bluetooth devices. User must pair via Android Settings first. */
  listBluetoothPrinters(): Promise<BluetoothPrinterDevice[]>;
};

const NativeEscPrinter = requireOptionalNativeModule<EscPrinterNativeModule>("EscPrinter") ?? null;

// Only a CONFIRMED positive result is cached. "This is IMIN hardware" is a
// fact that can't change mid-session, so once true, stay true without
// re-probing. A failure is NOT cached the same way — binding to
// com.imin.printerservice can fail transiently (service still starting,
// recovering from an earlier wedge, etc.), and caching that as a permanent
// "not IMIN" used to mean one bad bind attempt silently broke printing for
// the rest of the app's life, falling back to the raw ESC/POS path that
// doesn't work on this hardware at all — with no error surfaced anywhere
// obvious, since every print "succeeded" against a transport that just
// doesn't reach the physical head here.
let iminAvailable: boolean | null = null;

/**
 * True on IMIN terminals (built-in printer via `com.imin.printerservice`),
 * false everywhere else. Raw ESC/POS byte injection (sendRAWData/
 * sendRAWDataHexStr) was tried here and confirmed unreliable on real
 * hardware — it resolved without error but never reached the physical head,
 * even wrapped in the SDK's own enterPrinterBuffer/exitPrinterBuffer
 * transaction. IMIN print output is generated via the SDK's structured
 * calls instead — see features/receipt/printStationTicketImin.ts for the
 * pattern — so callers use this flag to pick which renderer to use, rather
 * than this module silently swapping transports the way printRawToDevice's
 * USB/Bluetooth routing does.
 */
export async function isIminPrinterAvailable(): Promise<boolean> {
  if (iminAvailable === true) return true;
  if (Platform.OS !== "android") return false;
  try {
    await PrinterSDK.initPrinter();
    // Resets density/alignment/etc. to firmware defaults. Without this, the
    // printer keeps whatever config the last app (or the last mode switch)
    // left it in — initPrinter() alone only binds the service, it doesn't
    // reset printer state.
    await PrinterSDK.initPrinterParams();
    iminAvailable = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Human-readable hardware status, or null if healthy. Codes per the IMIN
 * built-in printer dev docs (section 3.3): 0 normal, 3 door open,
 * 4 overheated, 7 paper missing. Anything else surfaces the SDK's own
 * message text.
 */
export async function getIminPrinterProblem(): Promise<string | null> {
  const { code, message } = await PrinterSDK.getPrinterStatus();
  if (Number(code) === 0) return null;
  return message || `Printer error (code ${code})`;
}

/**
 * Physical paper width the printer itself reports ("58" or "80"), or null if
 * the query fails. The app also has a manual paperWidth/ticketPaperWidth
 * setting, but that has to be kept in sync by hand — this asks the hardware
 * directly instead, since IMIN's SDK already knows what's loaded
 * (section 3.4.8: getPrinterPaperType()). Callers should prefer this over
 * the stored setting and only fall back to it when this returns null.
 */
export async function getIminPaperWidth(): Promise<"58" | "80" | null> {
  try {
    const type = Number(await PrinterSDK.getPrinterPaperType());
    if (type === 80) return "80";
    if (type === 58) return "58";
    return null;
  } catch {
    return null;
  }
}

export const EscPrinterNative: EscPrinterNativeModule | null = NativeEscPrinter && {
  ...NativeEscPrinter,
  async openCashDrawer(): Promise<void> {
    // openCashBox() is a purpose-built structured call (not raw byte
    // injection), so it doesn't carry the same reliability concern as
    // sendRAWData/sendRAWDataHexStr did for ticket content.
    if (await isIminPrinterAvailable()) {
      await PrinterSDK.openCashBox();
      return;
    }
    return NativeEscPrinter.openCashDrawer();
  },
};

export { PrinterSDK };

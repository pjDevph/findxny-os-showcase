/**
 * ESC/POS label generators for thermal label printers.
 *
 * generateLabelEscPos     — batch label: all items in one label (order summary)
 * generateDrinkLabelEscPos — single drink label per unit (1/2, 2/2 style)
 *
 * Both produce base64-encoded bytes for EscPrinterNative.printRaw().
 * 40mm paper → 24 chars/line  |  58mm paper → 32 chars/line  |  80mm paper → 48 chars/line
 */
import { ReceiptConfig, ReceiptPayload } from "./receiptConfig";
import type { PaperWidth } from "./printerConfig";

// ── ESC/POS command bytes ─────────────────────────────────────────────────────
const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

const CMD_INIT       = [ESC, 0x40];
const CMD_ALIGN_L    = [ESC, 0x61, 0x00];
const CMD_ALIGN_C    = [ESC, 0x61, 0x01];
const CMD_BOLD_ON    = [ESC, 0x45, 0x01];
const CMD_BOLD_OFF   = [ESC, 0x45, 0x00];
const CMD_FEED2      = [ESC, 0x64, 0x02];  // feed 2 lines
const CMD_FF         = [0x0C];             // form feed — flushes buffer and prints on label printers
const CMD_CUT        = [GS,  0x56, 0x41, 0x00]; // partial cut (ignored by cutter-less label printers)

// ── Helpers ───────────────────────────────────────────────────────────────────

function encodeText(t: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < t.length; i++) out.push(t.charCodeAt(i) & 0xFF);
  return out;
}

function padL(s: string, len: number): string {
  if (s.length >= len) return s.slice(0, len);
  return s + " ".repeat(len - s.length);
}

function padR(s: string, len: number): string {
  if (s.length >= len) return s.slice(0, len);
  return " ".repeat(len - s.length) + s;
}

function widthFor(paperWidth?: PaperWidth): number {
  if (paperWidth === "80") return 48;
  if (paperWidth === "40") return 24;
  return 32; // 58mm default
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Batch label: one label per ORDER showing all items.
 * cfg accepts either a ReceiptConfig object or a plain order-prefix string (legacy).
 */
export function generateLabelEscPos(
  payload: ReceiptPayload,
  cfg: ReceiptConfig | string = "",
  opts: { storeName?: string; paperWidth?: PaperWidth } = {},
): string {
  const prefix = typeof cfg === "string" ? cfg : cfg.orderNoPrefix;
  const W = widthFor(opts.paperWidth);

  const bytes: number[] = [];
  const push = (...cmds: number[][]): void => { for (const cmd of cmds) for (const b of cmd) bytes.push(b); };
  const text = (t: string): void => { for (const b of encodeText(t)) bytes.push(b); };
  const lf = (n = 1): void => { for (let i = 0; i < n; i++) bytes.push(LF); };
  const line = (): void => { text("-".repeat(W)); lf(); };

  push(CMD_INIT);

  if (opts.storeName) {
    push(CMD_ALIGN_C, CMD_BOLD_ON);
    text(opts.storeName.slice(0, W));
    push(CMD_BOLD_OFF);
    lf();
  }

  push(CMD_ALIGN_C, CMD_BOLD_ON);
  text(`ORDER #${prefix}${payload.orderNo}`);
  push(CMD_BOLD_OFF);
  lf();

  push(CMD_ALIGN_C);
  text(new Date(payload.timestamp).toLocaleString("en-PH", {
    month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }));
  lf();

  push(CMD_ALIGN_L);
  line();

  const itemNameW = W - 6;
  for (const item of payload.items) {
    const label = item.sku ? `${item.sku} ${item.name}` : item.name;
    text(padL(label.slice(0, itemNameW), itemNameW) + padR(`x${item.qty}`, 6));
    lf();
    if (item.notes) { text(`  ${item.notes.slice(0, W - 2)}`); lf(); }
  }
  for (const b of payload.bookings) {
    text(padL(b.name.slice(0, itemNameW), itemNameW) + padR("x1", 6));
    lf();
  }

  push(CMD_FF);
  return toBase64(bytes);
}

/**
 * Drink label: one label per UNIT of a single item.
 * Call once per unit: qty=2 → call with (item, info, 1, 2) then (item, info, 2, 2).
 *
 * Label layout (40mm example):
 *   [   CARAMEL LATTE   ]  ← bold / large, centered
 *   [   Medium / Hot    ]  ← modifiers
 *   ------------------------
 *   #0042 TBL3 1/4 10:32  ← order#, table, counter, time
 */
export function generateDrinkLabelEscPos(
  item: { name: string; notes?: string | null },
  orderInfo: {
    orderNo:      string;
    tableNo:      string;
    orderType:    string;
    timestamp:    string;
    orderPrefix?: string;
  },
  qtyIndex: number,
  qtyTotal: number,
  opts: { paperWidth?: PaperWidth; fontSize?: "normal" | "large" } = {},
): string {
  const W = widthFor(opts.paperWidth);

  const bytes: number[] = [];
  const push = (...cmds: number[][]): void => { for (const cmd of cmds) for (const b of cmd) bytes.push(b); };
  const text = (t: string): void => { for (const b of encodeText(t)) bytes.push(b); };
  const lf = (n = 1): void => { for (let i = 0; i < n; i++) bytes.push(LF); };

  const CMD_LARGE_ON  = [ESC, 0x21, 0x30]; // double width + height
  const CMD_LARGE_OFF = [ESC, 0x21, 0x00];

  const shortNo  = `#${(/\d+/.exec(orderInfo.orderNo) ?? [orderInfo.orderNo])[0].slice(-4).padStart(4, "0")}`;
  const tableStr = (orderInfo.tableNo || orderInfo.orderType || "Take-out").slice(0, W <= 24 ? 6 : 12);
  const qtyStr   = `${qtyIndex}/${qtyTotal}`;
  const timeStr  = new Date(orderInfo.timestamp).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false });

  push(CMD_INIT);

  // ── Row 1: info header — #0042 · TABLE 3 · 14:32 ──────────────────────────
  push(CMD_ALIGN_L);
  const infoSep  = W <= 24 ? " " : " · ";
  const infoLine = [shortNo, tableStr, timeStr].join(infoSep);
  text(infoLine.slice(0, W));
  lf();

  // ── Row 2: item name (bold/large) + qty counter right-aligned ─────────────
  const largeMode = opts.fontSize === "large";
  const printW    = largeMode ? Math.floor(W / 2) : W;  // large doubles char width
  const nameMax   = printW - qtyStr.length - 1;
  const nameLine  = padL(item.name.toUpperCase().slice(0, nameMax), nameMax) + " " + qtyStr;

  if (largeMode) {
    push(CMD_LARGE_ON);
    text(nameLine.slice(0, printW));
    push(CMD_LARGE_OFF);
  } else {
    push(CMD_BOLD_ON);
    text(nameLine.slice(0, W));
    push(CMD_BOLD_OFF);
  }
  lf();

  // ── Row 3: blank separator ────────────────────────────────────────────────
  lf();

  // ── Row 4+: modifiers / notes (bold, uppercase) ───────────────────────────
  if (item.notes?.trim()) {
    push(CMD_BOLD_ON, CMD_ALIGN_L);
    const parts = item.notes.trim().toUpperCase().split(/\s*[·•,]\s*/).filter(Boolean);
    if (parts.length <= 2) {
      // All on one line
      text(parts.join(W <= 24 ? " " : " · ").slice(0, W));
      lf();
    } else {
      // First N-1 mods on line 1, last mod on its own line for emphasis
      text(parts.slice(0, -1).join(" · ").slice(0, W));
      lf();
      text(parts[parts.length - 1].slice(0, W));
      lf();
    }
    push(CMD_BOLD_OFF);
  }

  push(CMD_FF);
  return toBase64(bytes);
}

// ── Shared helper ──────────────────────────────────────────────────────────────
function toBase64(bytes: number[]): string {
  const arr = new Uint8Array(bytes);
  let binary = "";
  arr.forEach(b => { binary += String.fromCodePoint(b); });
  return btoa(binary);
}

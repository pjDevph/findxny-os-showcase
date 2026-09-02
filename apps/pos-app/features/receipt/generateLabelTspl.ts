/**
 * TSPL (TSC Printer Language) label generator for Xprinter XP-365B and similar label printers.
 * Coordinates in dots at 203 DPI — 8 dots ≈ 1 mm.
 *
 * Font dot widths (×1 scale):
 *   "2" → 12 px wide, 20 px tall  — ~25 chars in 310 usable dots (40mm minus margins)
 *   "3" → 20 px wide, 20 px tall  — ~15 chars in 310 dots
 *   "4" → 32 px wide, 32 px tall  — ~9  chars in 310 dots
 */
import type { PaperWidth } from "./printerConfig";

const DOTS_PER_MM = 8; // 203 DPI ≈ 8 dots/mm
const BOTTOM_PAD  = 18; // breathing room at label bottom (~2mm)
const MIN_HEIGHT_MM = 20;
// Every drink label printed here is implicitly a "drinks"-station item — this
// print type only ever handles items filtered to prep_station === "drinks"
// (see labelPrintUtils.ts) — but unlike the kitchen/drinks station TICKET,
// which always headers itself "*** KITCHEN ***" / "*** DRINKS ***", the
// physical label sticker printed nothing identifying the station at all.
// Small tag using TSPL's smallest built-in font, pushing everything below it
// down by STATION_TAG_OFFSET so nothing gets clipped at the label's bottom.
const STATION_TAG_OFFSET = 15;

function labelWidthMm(paperWidth?: PaperWidth): number {
  if (paperWidth === "80") return 80;
  if (paperWidth === "40") return 40;
  return 58;
}

function tsplToBase64(tspl: string): string {
  let bin = "";
  for (let i = 0; i < tspl.length; i++) bin += String.fromCharCode(tspl.charCodeAt(i) & 0xFF);
  return btoa(bin);
}

function tsplStr(s: string): string {
  return s.replace(/"/g, "'");
}

/** Word-wrap `text` into lines of at most `maxChars` each. Max 2 lines returned. */
function wrapName(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word.slice(0, maxChars);
    }
  }
  if (current) lines.push(current.slice(0, maxChars));
  return lines.slice(0, 2);
}

/**
 * Choose the best font + wrapping for the drink name so it always shows in full.
 * Priority: large font → normal font → small font → hard truncate.
 */
function bestNameLayout(
  name: string,
  large: boolean,
): { font: string; lineHeightDots: number; lines: string[] } {
  const USABLE    = 310;
  const primary   = large ? "4" : "3";
  const primaryPx = large ? 32  : 20;
  const primaryH  = large ? 35  : 23;
  const primaryMax = Math.floor(USABLE / primaryPx);

  const lines = wrapName(name, primaryMax);
  if (lines.length <= 2) return { font: primary, lineHeightDots: primaryH, lines };

  if (large) {
    const fallbackLines = wrapName(name, 15);
    if (fallbackLines.length <= 2) return { font: "3", lineHeightDots: 23, lines: fallbackLines };
  }

  const smallLines = wrapName(name, 25);
  return { font: "2", lineHeightDots: 23, lines: smallLines };
}

/** Short table/type label that fits on the info line. */
function tableLabel(tableNo: string, orderType: string): string {
  if (tableNo) return `T${tableNo}`.toUpperCase().slice(0, 5);
  const abbr: Record<string, string> = {
    dine_in: "DIN", takeout: "OUT", walk_in: "WLK", room_service: "RM",
  };
  return abbr[orderType] ?? orderType.slice(0, 4).toUpperCase();
}

/**
 * Single drink label per unit (1/3, 2/3, 3/3 style — counter is global across all items in order).
 * Height auto-fits to content — no wasted blank space.
 * Returns base64-encoded TSPL for EscPrinterNative.printRawToDevice().
 *
 * Layout:
 *   #0042 T3 05:54 1/3   ← info + global qty counter (small)
 *   ICED LATTE           ← full name, never truncated (large or normal)
 *   HOT  EXTRA SHOT      ← modifiers (small)
 */
export function generateDrinkLabelTspl(
  item: { name: string; sku?: string | null; notes?: string | null; addons?: { name: string; price: number; qty: number }[] | null },
  orderInfo: {
    orderNo:      string;
    tableNo:      string;
    orderType:    string;
    timestamp:    string;
    orderPrefix?: string;
  },
  qtyIndex: number,
  qtyTotal: number,
  opts: { paperWidth?: PaperWidth; fontSize?: "normal" | "large"; labelHeightMm?: number } = {},
): string {
  const widthMm = labelWidthMm(opts.paperWidth);
  const large   = opts.fontSize === "large";

  const shortNo  = `#${(/\d+/.exec(orderInfo.orderNo) ?? [orderInfo.orderNo])[0].slice(-4).padStart(4, "0")}`;
  const tbl      = tableLabel(orderInfo.tableNo, orderInfo.orderType);
  const qtyStr   = `${qtyIndex}/${qtyTotal}`;
  const d        = new Date(orderInfo.timestamp);
  const timeStr  = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  // NB: no SKU here — the per-unit drink label is width-constrained; adding the
  // code pushed the "1/2" qty counter off the edge. The code still prints on the
  // receipt, batch label, and kitchen/drinks tickets.
  const infoLine = tsplStr(`${shortNo} ${tbl} ${timeStr} ${qtyStr}`);
  const fullName = item.name.toUpperCase();
  const layout   = bestNameLayout(fullName, large);

  // Build modifier list: addons first, then free-text notes
  const modParts: string[] = [
    ...(item.addons ?? []).map(a => a.name.toUpperCase()),
    ...(item.notes?.trim()
      ? item.notes.trim().toUpperCase().split(/\s*[·•,]\s*/).filter(Boolean)
      : []),
  ];
  const modLine1 = modParts.length > 0 ? modParts.slice(0, 3).join("  ").slice(0, 26) : null;
  const modLine2 = modParts.length > 3 ? modParts.slice(3, 6).join("  ").slice(0, 26) : null;

  // Calculate total content height before writing SIZE
  let contentEndY = STATION_TAG_OFFSET + 28 + layout.lines.length * layout.lineHeightDots;
  if (modLine1) { contentEndY += 3 + 23; }
  if (modLine2) { contentEndY += 23; }
  const heightMm = opts.labelHeightMm ?? Math.max(MIN_HEIGHT_MM, Math.ceil((contentEndY + BOTTOM_PAD) / DOTS_PER_MM));

  let t = "";
  t += `SIZE ${widthMm} mm,${heightMm} mm\r\n`;
  t += `GAP 2 mm,0\r\n`;
  t += `DIRECTION 0\r\n`;
  t += `CLS\r\n`;

  // Station tag — this label type is always drinks (see comment on
  // STATION_TAG_OFFSET above).
  t += `TEXT 5,2,"1",0,1,1,"DRINKS"\r\n`;

  // Row 1: order info + global qty counter
  t += `TEXT 5,${5 + STATION_TAG_OFFSET},"2",0,1,1,"${infoLine}"\r\n`;

  // Row 2 (+optional Row 3): drink name
  let y = 28 + STATION_TAG_OFFSET;
  for (const line of layout.lines) {
    t += `TEXT 5,${y},"${layout.font}",0,1,1,"${tsplStr(line)}"\r\n`;
    y += layout.lineHeightDots;
  }

  // Modifier lines
  if (modLine1) {
    t += `TEXT 5,${y + 3},"2",0,1,1,"${tsplStr(modLine1)}"\r\n`;
    if (modLine2) {
      t += `TEXT 5,${y + 26},"2",0,1,1,"${tsplStr(modLine2)}"\r\n`;
    }
  }

  t += `PRINT 1,1\r\n`;
  return tsplToBase64(t);
}

/**
 * Batch label for an entire order (all items listed).
 */
export function generateOrderLabelTspl(
  items: { name: string; qty: number; notes?: string | null }[],
  orderInfo: {
    orderNo:   string;
    tableNo:   string;
    orderType: string;
    timestamp: string;
  },
  opts: { paperWidth?: PaperWidth; labelHeightMm?: number } = {},
): string {
  const widthMm  = labelWidthMm(opts.paperWidth);
  const heightMm = opts.labelHeightMm ?? Math.max(30, 25 + items.length * 8 + STATION_TAG_OFFSET);

  const shortNo  = `#${(/\d+/.exec(orderInfo.orderNo) ?? [orderInfo.orderNo])[0].slice(-4).padStart(4, "0")}`;
  const tbl      = tableLabel(orderInfo.tableNo, orderInfo.orderType);
  const d        = new Date(orderInfo.timestamp);
  const timeStr  = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  let t = "";
  t += `SIZE ${widthMm} mm,${heightMm} mm\r\n`;
  t += `GAP 2 mm,0\r\n`;
  t += `DIRECTION 0\r\n`;
  t += `CLS\r\n`;
  // Station tag — this label type is always drinks (see comment on
  // STATION_TAG_OFFSET above).
  t += `TEXT 5,2,"1",0,1,1,"DRINKS"\r\n`;
  t += `TEXT 5,${5 + STATION_TAG_OFFSET},"3",0,1,1,"${tsplStr(`${shortNo} ${tbl}`)}"\r\n`;
  t += `TEXT 5,${30 + STATION_TAG_OFFSET},"2",0,1,1,"${tsplStr(timeStr)}"\r\n`;

  let y = 55 + STATION_TAG_OFFSET;
  for (const item of items) {
    const itemLine = tsplStr((`x${item.qty} ${item.name}`).toUpperCase().slice(0, 26));
    t += `TEXT 5,${y},"2",0,1,1,"${itemLine}"\r\n`;
    y += 22;
    if (item.notes?.trim()) {
      t += `TEXT 10,${y},"2",0,1,1,"${tsplStr(item.notes.trim().toUpperCase().slice(0, 24))}"\r\n`;
      y += 22;
    }
  }

  t += `PRINT 1,1\r\n`;
  return tsplToBase64(t);
}

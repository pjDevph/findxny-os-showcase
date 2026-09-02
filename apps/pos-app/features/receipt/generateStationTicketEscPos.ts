/**
 * ESC/POS kitchen/drinks ticket generator — a prep docket routed to a station
 * printer (kitchen or bar), distinct from the customer receipt. No prices:
 * this is a prep document, not a financial one.
 *
 * 58mm paper → 32 chars/line   80mm paper → 48 chars/line
 */
import { ReceiptPayload } from "./receiptConfig";
import type { PaperWidth } from "./printerConfig";

export type StationTicketStation = "kitchen" | "drinks";

// ── ESC/POS command bytes ─────────────────────────────────────────────────────
const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

const CMD_INIT       = [ESC, 0x40];
const CMD_ALIGN_L    = [ESC, 0x61, 0x00];
const CMD_ALIGN_C    = [ESC, 0x61, 0x01];
const CMD_BOLD_ON    = [ESC, 0x45, 0x01];
const CMD_BOLD_OFF   = [ESC, 0x45, 0x00];
const CMD_DOUBLE_ON  = [GS,  0x21, 0x11]; // double width + double height
const CMD_DOUBLE_OFF = [GS,  0x21, 0x00];
const CMD_FEED3      = [ESC, 0x64, 0x03]; // feed 3 lines
const CMD_CUT        = [GS,  0x56, 0x41, 0x00]; // partial cut

const STATION_LABEL: Record<StationTicketStation, string> = {
  kitchen: "KITCHEN",
  drinks:  "DRINKS",
};

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
  return paperWidth === "80" ? 48 : 32; // 58mm default
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Filters payload.items to the given station's prep_station and builds a
 * standalone prep ticket. Returns null if no items match — callers should
 * skip printing rather than send an empty ticket.
 */
export function generateStationTicketEscPos(
  payload: ReceiptPayload,
  station: StationTicketStation,
  opts: { paperWidth?: PaperWidth } = {},
): string | null {
  const items = (payload.items ?? []).filter(i => i.prep_station === station);
  if (items.length === 0) return null;

  const W = widthFor(opts.paperWidth);
  const bytes: number[] = [];
  const push = (...cmds: number[][]): void => { for (const cmd of cmds) for (const b of cmd) bytes.push(b); };
  const text = (t: string): void => { for (const b of encodeText(t)) bytes.push(b); };
  const lf   = (n = 1): void => { for (let i = 0; i < n; i++) bytes.push(LF); };
  const line = (): void => { text("-".repeat(W)); lf(); };

  push(CMD_INIT);
  // Top margin so the (double-height) station label clears the cutter dead
  // zone — tickets print right after the receipt's cut, otherwise the
  // "*** KITCHEN ***" / "*** DRINKS ***" header gets sheared off.
  // 5 lines ≈ 21mm, matching the receipt top margin on this INSA printer.
  lf(5);
  push(CMD_ALIGN_C, CMD_BOLD_ON, CMD_DOUBLE_ON);
  text(`*** ${STATION_LABEL[station]} ***`); lf();
  push(CMD_DOUBLE_OFF, CMD_BOLD_OFF, CMD_ALIGN_L);
  line();

  const dateStr = new Date(payload.timestamp).toLocaleString("en-PH", {
    hour: "2-digit", minute: "2-digit",
  });
  const orderLabel = `#${payload.orderNo}`;
  const lw = Math.floor(W * 0.6);
  push(CMD_BOLD_ON);
  text(padL("Order No.", 10) + " " + padR(orderLabel, W - 11)); lf();
  push(CMD_BOLD_OFF);
  const typeAndTable = [
    payload.orderType ? payload.orderType.replaceAll("_", " ").toUpperCase() : null,
    payload.tableNo ? `Table ${payload.tableNo}` : null,
  ].filter(Boolean).join("   ");
  if (typeAndTable) { text(padL(typeAndTable, lw) + padR(dateStr, W - lw)); lf(); }
  else { text(padR(dateStr, W)); lf(); }
  line();

  for (const item of items) {
    push(CMD_BOLD_ON);
    text(`${item.qty}x  ${item.sku ? `${item.sku} ` : ""}${item.name}`.slice(0, W)); lf();
    push(CMD_BOLD_OFF);
    if (item.notes) { text(`    ${item.notes}`.slice(0, W)); lf(); }
    for (const addon of item.addons ?? []) {
      const addonQty = addon.qty > 1 ? ` (${addon.qty}x)` : "";
      text(`    + ${addon.name}${addonQty}`.slice(0, W)); lf();
    }
  }
  line();

  push(CMD_ALIGN_L, CMD_FEED3, CMD_CUT);

  const arr = new Uint8Array(bytes);
  let binary = "";
  arr.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

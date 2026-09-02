import type { ReceiptPayload, ReceiptConfig } from "./receiptConfig";
import type { ReceiptMode } from "./printerConfig";

/** Receipts print on 58mm/80mm thermal paper only; 40mm is for the separate label printer. */
type ReceiptPaperWidth = "58" | "80";

function esc(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function peso(n: number) { return `&#8369;${n.toFixed(2)}`; }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Only data: and http(s): URIs are safe to embed in the receipt img src. */
function safeImgSrc(src: string): string {
  return src.startsWith("data:") || src.startsWith("http://") || src.startsWith("https://")
    ? src : "";
}

/** Width cap in px: 58mm thermal ≈ 220px printable, 80mm ≈ 300px. */
const WIDTH: Record<ReceiptPaperWidth, number> = { "58": 220, "80": 300 };

const PAY_LABEL: Record<string, string> = {
  cash: "Cash", gcash: "GCash", maya: "Maya", qrph: "QR Ph", card: "Card",
  bank_transfer: "Bank Transfer", other: "Other",
};

function infoRow(label: string, value: string) {
  return `<div class="info-row"><span class="info-label">${label}</span><span>${value}</span></div>`;
}

function buildItemRows(payload: ReceiptPayload): string {
  const items = payload.items.map(it => {
    // Shelf price, not netted against it.discount — reconciles with
    // Subtotal below (also a sum of gross line totals). The "Discount -X"
    // sub-line rendered right after this is where the deduction shows, once.
    const lineTotal = it.price * it.qty;
    return `<tr>
      <td class="name">${it.sku ? `<span class="code">${esc(it.sku)}</span> ` : ""}${esc(it.name)}${it.notes ? `<br><span class="sub">${esc(it.notes)}</span>` : ""}${it.discount ? `<br><span class="sub">Discount -${peso(it.discount)}</span>` : ""}</td>
      <td class="qty">${it.qty}</td>
      <td class="amt">${peso(lineTotal)}</td>
    </tr>`;
  }).join("");
  const bookings = payload.bookings.map(b =>
    `<tr>
      <td class="name">${esc(b.name)}</td>
      <td class="qty">1</td>
      <td class="amt">${peso(b.total)}</td>
    </tr>`
  ).join("");
  return items + bookings;
}

function buildTotalsBlock(payload: ReceiptPayload, mode: ReceiptMode): string {
  const { subtotal, tax, taxRatePct, serviceFee, svcRatePct, discount } = payload;
  const vatPct = (taxRatePct * 100).toFixed(0);
  const svcPct = (svcRatePct * 100).toFixed(0);
  const isOfficial = mode === "official";
  const rows = [
    infoRow("Subtotal", peso(subtotal)),
    isOfficial && tax > 0        ? infoRow(`VAT (${vatPct}%)`,           peso(tax))          : "",
    serviceFee > 0               ? infoRow(`Service Chg (${svcPct}%)`,   peso(serviceFee))   : "",
    discount > 0                 ? infoRow("Discount",                   `-${peso(discount)}`) : "",
  ].join("\n");
  return `${rows}
<table><tbody>
  <tr class="total-row">
    <td><b>TOTAL</b></td><td></td>
    <td class="amt"><b>${peso(payload.total)}</b></td>
  </tr>
</tbody></table>`;
}

function buildPaymentBlock(payload: ReceiptPayload): string {
  const { payMethod, cashAmt, change, refNumber, voucherCode, splitPayments } = payload;
  const rows: string[] = [];
  if (splitPayments && splitPayments.length > 0) {
    for (const leg of splitPayments) {
      rows.push(infoRow("Payment", esc(`${PAY_LABEL[leg.method] ?? leg.method} — ${peso(leg.amount)}`)));
      if (leg.refNumber) rows.push(infoRow("Ref No.", esc(leg.refNumber)));
    }
  } else {
    const label = PAY_LABEL[payMethod] ?? payMethod;
    rows.push(infoRow("Payment", esc(label)));
    if (payMethod === "cash")                 rows.push(infoRow("Cash",   peso(cashAmt)));
    if (payMethod === "cash" && change >= 0)   rows.push(infoRow("Change", peso(change)));
    if (refNumber)                             rows.push(infoRow("Ref No.", esc(refNumber)));
  }
  if (voucherCode) rows.push(infoRow("WiFi Voucher", `<b>${esc(voucherCode)}</b>`));
  return rows.join("\n");
}

function buildFooterBlock(config: ReceiptConfig, mode: ReceiptMode): string {
  const credSuffix = config.wifiCred ? ` &nbsp;|&nbsp; ${esc(config.wifiCred)}` : "";
  const wifi = config.wifiSsid
    ? `<div class="divider"></div><div class="center sub">WiFi: <b>${esc(config.wifiSsid)}</b>${credSuffix}</div>`
    : "";
  const promo = config.promoLine
    ? `<div class="divider"></div><div class="footer-txt promo">${esc(config.promoLine)}</div>`
    : "";
  const footer = config.footer
    ? `<div class="divider"></div><div class="footer-txt">${esc(config.footer).replaceAll("\n", "<br>")}</div>`
    : "";

  let birBlock = "";
  if (mode === "official") {
    const lines: string[] = [];
    if (config.ptu_no)        lines.push(`PTU No.: ${esc(config.ptu_no)}`);
    if (config.min_no)        lines.push(`MIN: ${esc(config.min_no)}`);
    if (config.accred_no) {
      const al = config.accred_date
        ? `Accred No.: ${esc(config.accred_no)} (${esc(config.accred_date)})`
        : `Accred No.: ${esc(config.accred_no)}`;
      lines.push(al);
    }
    if (config.serial_series) lines.push(`Series: ${esc(config.serial_series)}`);
    if (lines.length > 0) {
      birBlock = `<div class="footer-txt" style="margin-top:6px;">${lines.join("<br>")}</div>`;
    }
  }

  return `${promo}${footer}${wifi}
<div class="footer-txt" style="margin-top:6px;">** Thank you for your business **</div>${birBlock}`;
}

function buildCopy(
  payload: ReceiptPayload,
  config: ReceiptConfig,
  storeName: string,
  mode: ReceiptMode,
  copyLabel: string | null,
): string {
  const { orderNo, orderType, tableNo, customerName, internalNote, cashierName, timestamp } = payload;
  const badge       = copyLabel ? `<div class="copy-badge">${esc(copyLabel)}</div>` : "";
  const isOfficial    = mode === "official";
  const isBookingOnly = payload.bookings.length > 0 && payload.items.length === 0;
  let headerLabel: string;
  if (isBookingOnly)   headerLabel = "BOOKING CONFIRMATION";
  else if (isOfficial) headerLabel = "SALES INVOICE";
  else                 headerLabel = "SALES ORDER";
  const logoSrc     = safeImgSrc(config.receiptLogo);
  const logoHtml    = logoSrc
    ? `<img src="${logoSrc}" style="max-width:120px;max-height:56px;display:block;margin:0 auto 6px;" />`
    : "";
  const displayNo   = `${esc(config.orderNoPrefix)}${esc(orderNo)}`;

  return `<div class="receipt">
${badge}
<div class="center" style="margin-bottom:10px;">
  ${logoHtml}
  <div class="store">${esc(storeName)}</div>
  ${config.address ? `<div class="sub">${esc(config.address).replaceAll("\n", "<br>")}</div>` : ""}
  ${isOfficial && config.tin ? `<div class="sub">TIN NO: ${esc(config.tin)}</div>` : ""}
  <div style="margin-top:6px;font-weight:bold;letter-spacing:2px;">${headerLabel}</div>
</div>
<div class="divider"></div>
${infoRow("Order No.", displayNo)}
${infoRow("Date",      esc(fmtDate(timestamp)))}
${tableNo      ? infoRow("Table",    esc(tableNo))      : ""}
${customerName ? infoRow("Customer", esc(customerName)) : ""}
${cashierName  ? infoRow("Cashier",  esc(cashierName))  : ""}
${infoRow("Type", esc(orderType.replaceAll("_", " ").toUpperCase()))}
${internalNote ? infoRow("Note", esc(internalNote)) : ""}
<div class="divider"></div>
<table>
  <thead><tr>
    <td class="name"><b>Item</b></td>
    <td class="qty"><b>Qty</b></td>
    <td class="amt"><b>Amt</b></td>
  </tr></thead>
  <tbody>${buildItemRows(payload)}</tbody>
</table>
<div class="divider"></div>
${buildTotalsBlock(payload, mode)}
<div class="divider"></div>
${buildPaymentBlock(payload)}
${buildFooterBlock(config, mode)}
</div>`;
}

export function generateReceiptHtml(
  payload: ReceiptPayload,
  config: ReceiptConfig,
  storeName: string,
  opts: { paperWidth?: ReceiptPaperWidth; copies?: number; receiptMode?: ReceiptMode; showTin?: boolean } = {},
): string {
  const { paperWidth = "58", copies = 1, receiptMode = "simple", showTin = true } = opts;
  const maxWidth = WIDTH[paperWidth];

  const copyLabels: (string | null)[] =
    copies >= 2 ? ["Customer Copy", "Merchant Copy"] : [null];

  const effectiveConfig: ReceiptConfig =
    receiptMode === "official" && !showTin ? { ...config, tin: "" } : config;

  const bodies = copyLabels
    .map((label, i) =>
      (i > 0 ? '<div class="cut"></div>' : "") +
      buildCopy(payload, effectiveConfig, storeName, receiptMode, label)
    )
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px; color: #000; background: #fff;
    padding: 10px; max-width: ${maxWidth}px; margin: 0 auto;
  }
  .receipt { margin-bottom: 0; }
  .center { text-align: center; }
  .store  { font-size: 16px; font-weight: bold; }
  .sub    { font-size: 10px; color: #555; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 2px 0; }
  .name { width: 58%; }
  .name .code { font-family: monospace; font-weight: bold; color: #555; }
  .qty  { width: 12%; text-align: center; }
  .amt  { width: 30%; text-align: right; }
  .total-row td { font-weight: bold; font-size: 14px; border-top: 1px solid #000; padding-top: 4px; }
  .info-row { display: flex; justify-content: space-between; margin: 2px 0; }
  .info-label { color: #555; }
  .footer-txt { text-align: center; font-size: 10px; color: #555; margin-top: 8px; }
  .promo { font-weight: bold; color: #000; }
  .copy-badge {
    text-align: center; font-size: 9px; letter-spacing: 2px; text-transform: uppercase;
    color: #555; border: 1px dashed #aaa; padding: 2px 0; margin-bottom: 8px;
  }
  .cut {
    border-top: 2px dashed #000; margin: 14px 0;
    text-align: center; font-size: 9px; color: #aaa; padding-top: 2px;
  }
  .cut::after { content: "✂  cut here"; }
  @media print {
    body { padding: 0; }
    .cut { page-break-after: always; }
  }
</style>
</head>
<body>
${bodies}
</body>
</html>`;
}

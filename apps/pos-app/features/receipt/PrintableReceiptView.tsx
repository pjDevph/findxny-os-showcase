/**
 * Visual receipt renderer for image-based printing — captured via
 * react-native-view-shot into a bitmap and sent through
 * PrinterSDK.printSingleBitmapBlackWhite(), instead of the many stateful
 * printText()/setTextLineSpacing() calls printReceiptImin.ts made. Those
 * calls (line spacing especially) proved to hang the native bridge
 * intermittently with no error, no completion, and no way to detect it from
 * JS — one image transfer per copy has far less surface area for that.
 *
 * This is the SAME visual design as printReceiptImin.ts (and, on-screen,
 * ReceiptModal's own preview) — deliberately plain monospace/black-on-white,
 * since a thermal printer can't render anything else anyway.
 *
 * Pixel sizing: react-native-view-shot only resizes its capture when BOTH
 * width AND height are given (checked the native source — a width-only
 * option is silently ignored), and passing a guessed height is fragile
 * since it depends on content length. So instead of asking view-shot to
 * resize, this component is laid out at `pixelWidth / PixelRatio.get()` dp —
 * a size that, once multiplied back up by the device's own pixel ratio
 * during capture, comes out to exactly `pixelWidth` real pixels. Every
 * dimension (font sizes, padding, rule thickness) is scaled by the same
 * factor so proportions stay correct regardless of device density.
 */
import { View, Text, StyleSheet, PixelRatio } from "react-native";
import { ReceiptConfig, ReceiptPayload } from "./receiptConfig";
import { formatCashierName } from "./receiptConfig";

const PAY: Record<string, string> = {
  cash: "Cash", gcash: "GCash", maya: "Maya", qrph: "QR Ph", card: "Card",
  bank_transfer: "Bank Transfer", other: "Other",
};

const peso = (n: number) => `P${n.toFixed(2)}`;

export function pixelWidthFor(paperWidth?: "58" | "80" | null): number {
  return paperWidth === "80" ? 576 : 384;
}

interface Scale {
  page: number;
  fontLine: number;
  fontRow: number;
  fontHeader: number;
}

function makeScale(pixelWidth: number): Scale {
  const factor = 1 / PixelRatio.get();
  return {
    page: pixelWidth * factor,
    fontLine: 24 * factor,
    fontRow: 22 * factor,
    fontHeader: 30 * factor,
  };
}

function Line({
  children, align = "left", bold = false, size,
}: Readonly<{ children: string; align?: "left" | "center"; bold?: boolean; size: number }>) {
  return (
    <Text style={[s.line, { textAlign: align, fontWeight: bold ? "700" : "400", fontSize: size }]}>
      {children}
    </Text>
  );
}

function Row({
  label, value, bold = false, fontSize,
}: Readonly<{ label: string; value: string; bold?: boolean; fontSize: number }>) {
  return (
    <View style={s.row}>
      <Text style={[s.rowText, { fontSize }, bold && s.bold]} numberOfLines={1}>{label}</Text>
      <Text style={[s.rowText, { fontSize }, bold && s.bold, s.rowValue]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Rule() {
  return <View style={s.rule} />;
}

interface Props {
  readonly payload: ReceiptPayload;
  readonly config: ReceiptConfig;
  readonly storeName: string;
  readonly copyLabel: string | null;
  readonly mode: "simple" | "official";
  readonly showTin: boolean;
  readonly includeSku: boolean;
  readonly pixelWidth: number;
}

export function PrintableReceiptView({
  payload, config, storeName, copyLabel, mode, showTin, includeSku, pixelWidth,
}: Props) {
  const sc = makeScale(pixelWidth);
  const isBookingOnly = payload.bookings.length > 0 && payload.items.length === 0;
  const headerLabel = isBookingOnly
    ? "BOOKING CONFIRMATION"
    : mode === "official" ? "SALES INVOICE" : "SALES ORDER";
  const dateStr = new Date(payload.timestamp).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const hasBalance = payload.balanceDue != null && payload.balanceDue > 0;
  const statusLabel = hasBalance ? "" : "PAID";
  const hasSplit = payload.splitPayments && payload.splitPayments.length > 0;
  const row = (label: string, value: string, bold = false) => (
    <Row label={label} value={value} bold={bold} fontSize={sc.fontRow} />
  );

  return (
    <View style={[s.page, { width: sc.page }]}>
      <Line align="center" bold size={sc.fontHeader}>{(storeName || "—").toUpperCase()}</Line>
      {!!copyLabel && <Line align="center" bold size={sc.fontLine}>{copyLabel.toUpperCase()}</Line>}
      {!!config.address && <Line align="center" size={sc.fontLine}>{config.address}</Line>}
      {showTin && !!config.tin && <Line align="center" size={sc.fontLine}>{`TIN: ${config.tin}`}</Line>}
      <Line align="center" bold size={sc.fontLine}>{headerLabel}</Line>
      <Rule />

      {row("Order No.", `${config.orderNoPrefix ?? ""}${payload.orderNo}`)}
      {row("Date", dateStr)}
      {!!payload.tableNo && row("Table", payload.tableNo)}
      {row("Customer", payload.customerName || "Walk-in")}
      {!!payload.cashierName && row("Cashier", formatCashierName(payload.cashierName) ?? payload.cashierName)}
      {!isBookingOnly && !!payload.orderType && row("Type", payload.orderType.replaceAll("_", " ").toUpperCase())}
      {!!payload.internalNote && row("Note", payload.internalNote)}
      <Rule />

      <View style={s.row}>
        <Text style={[s.rowText, { fontSize: sc.fontRow }, s.bold]} numberOfLines={1}>ITEM</Text>
        <Text style={[s.rowText, { fontSize: sc.fontRow }, s.bold, s.rowValue]} numberOfLines={1}>QTY / AMOUNT</Text>
      </View>
      {payload.items.map((item, idx) => {
        const label = includeSku && item.sku ? `${item.sku} ${item.name}` : item.name;
        // Shelf price, not netted against item.discount — reconciles with
        // Subtotal below (also a sum of gross line totals). The "Discount -X"
        // line rendered right after this is where the deduction shows, once.
        const amt = item.price * item.qty;
        return (
          <View key={`item-${idx}`}>
            {row(label, `${item.qty} / ${peso(amt)}`)}
            {!!item.notes && <Line size={sc.fontLine}>{`  ${item.notes}`}</Line>}
            {item.discount ? <Line size={sc.fontLine}>{`  Discount -${peso(item.discount)}`}</Line> : null}
          </View>
        );
      })}
      {payload.bookings.map((b, idx) => (
        <View key={`booking-${idx}`}>{row(b.name, `1 / ${peso(b.total)}`)}</View>
      ))}
      {(payload.charges ?? []).map((ch, idx) => (
        <View key={`charge-${idx}`}>{row(ch.name, peso(ch.amount))}</View>
      ))}
      <Rule />

      {row("Subtotal", peso(payload.subtotal))}
      {mode === "official" && payload.tax > 0 && row(`VAT (${(payload.taxRatePct * 100).toFixed(0)}%)`, peso(payload.tax))}
      {payload.serviceFee > 0 && row(`Svc Chg (${(payload.svcRatePct * 100).toFixed(0)}%)`, peso(payload.serviceFee))}
      {payload.discount > 0 && row(payload.is_senior_pwd ? "SC/PWD Discount (20%)" : "Discount", `-${peso(payload.discount)}`)}
      {payload.voucherDiscount != null && payload.voucherDiscount > 0 && row(
        `Voucher${payload.appliedVoucherCode ? ` (${payload.appliedVoucherCode})` : ""}`,
        `-${peso(payload.voucherDiscount)}`,
      )}
      {row("TOTAL", peso(payload.total), true)}
      <Rule />

      {hasBalance && (
        <>
          {row("PAID", peso(payload.amountPaid ?? 0), true)}
          {row("BALANCE DUE", peso(payload.balanceDue as number), true)}
        </>
      )}
      {hasSplit ? (
        payload.splitPayments!.map((leg, idx) => (
          <View key={`split-${idx}`}>
            {row((PAY[leg.method] ?? leg.method).toUpperCase(), statusLabel, true)}
            {row("Amount", peso(leg.amount))}
            {!!leg.refNumber && row("Reference", leg.refNumber)}
          </View>
        ))
      ) : (
        <>
          {row((PAY[payload.payMethod] ?? payload.payMethod).toUpperCase(), statusLabel, true)}
          {payload.payMethod === "cash" && (
            <>
              {row("Cash", peso(payload.cashAmt))}
              {payload.change >= 0 && row("Change", peso(payload.change))}
            </>
          )}
          {!!payload.refNumber && row("Reference", payload.refNumber)}
        </>
      )}
      {!!payload.voucherCode && row("WiFi Voucher", payload.voucherCode)}

      {!!config.promoLine && <Line align="center" bold size={sc.fontLine}>{config.promoLine}</Line>}
      {!!config.footer && <Line align="center" size={sc.fontLine}>{config.footer}</Line>}
      {!!config.wifiSsid && (
        <Line align="center" size={sc.fontLine}>{`WiFi: ${config.wifiSsid}${config.wifiCred ? `  ${config.wifiCred}` : ""}`}</Line>
      )}
      <Line align="center" size={sc.fontLine}>** Thank you for your business! **</Line>
      {mode === "official" && (
        <>
          {!!config.ptu_no && <Line align="center" size={sc.fontLine}>{`PTU No.: ${config.ptu_no}`}</Line>}
          {!!config.min_no && <Line align="center" size={sc.fontLine}>{`MIN: ${config.min_no}`}</Line>}
          {!!config.accred_no && (
            <Line align="center" size={sc.fontLine}>
              {config.accred_date ? `Accred No.: ${config.accred_no} (${config.accred_date})` : `Accred No.: ${config.accred_no}`}
            </Line>
          )}
          {!!config.serial_series && <Line align="center" size={sc.fontLine}>{`Series: ${config.serial_series}`}</Line>}
        </>
      )}
    </View>
  );
}

const INK = "#000000";
const s = StyleSheet.create({
  page: { backgroundColor: "#ffffff", paddingHorizontal: 10, paddingVertical: 6 },
  line: { fontFamily: "monospace", color: INK, marginVertical: 1 },
  row: { flexDirection: "row", justifyContent: "space-between", marginVertical: 1 },
  rowText: { fontFamily: "monospace", color: INK, flexShrink: 1, flexGrow: 1 },
  rowValue: { textAlign: "right", flexShrink: 0, flexGrow: 0, marginLeft: 6 },
  bold: { fontWeight: "700" },
  rule: { borderBottomWidth: 1, borderStyle: "dashed", borderColor: INK, marginVertical: 4 },
});

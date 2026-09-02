import { Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { peso } from "../../order/format";
import { ReportDetailModal, reportSectionStyles } from "./ReportDetailModal";
import { ReportRow } from "../ReportRow";
import type { ZReportPayload } from "../types";

interface Props {
  readonly mode: "x" | "z" | null;
  readonly data: ZReportPayload | null;
  readonly onClose: () => void;
  readonly onPrint: (data: ZReportPayload) => void;
}

export function XZReportModal({ mode, data, onClose, onPrint }: Props) {
  const { C } = useTheme();
  const rs = reportSectionStyles(C);
  if (!mode || !data) return null;

  const isZ = mode === "z";
  const title = isZ ? `Z REPORT — #Z-${String(data.report_no).padStart(5, "0")}` : "X REPORT";
  const reportDate = new Date(data.report_date).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const pm = data.payment_breakdown;
  const pmEntries: [string, number][] = [
    ["Cash", pm.cash], ["GCash", pm.gcash], ["Maya", pm.maya], ["Card", pm.card], ["QR Ph", pm.qrph], ["Other", pm.other],
  ].filter(([, v]) => (v as number) > 0) as [string, number][];

  return (
    <ReportDetailModal
      visible title={title} subtitle={reportDate} onClose={onClose}
      primaryAction={{ label: "Print", onPress: () => onPrint(data), kind: "info" }}
    >
      <Text style={rs.rSection}>SALES SUMMARY</Text>
      <View style={rs.rCard}>
        <ReportRow label="Gross Sales" value={peso(data.gross_sales)} />
        {data.discount_amount > 0 && <ReportRow label="Less: Discounts" value={`(${data.discount_amount.toFixed(2)})`} />}
        <ReportRow label="Net Sales" value={peso(data.net_sales)} bold />
      </View>

      <Text style={rs.rSection}>VAT BREAKDOWN</Text>
      <View style={rs.rCard}>
        <ReportRow label="VATable Sales" value={peso(data.vatable_sales)} />
        <ReportRow label="VAT 12%" value={peso(data.vat_amount)} />
        <ReportRow label="VAT-Exempt" value={peso(data.vat_exempt_sales)} />
        <ReportRow label="Zero-Rated" value={peso(data.zero_rated_sales)} />
      </View>

      <Text style={rs.rSection}>PAYMENTS</Text>
      <View style={rs.rCard}>
        {pmEntries.length > 0
          ? pmEntries.map(([label, val]) => <ReportRow key={label} label={label} value={peso(val)} />)
          : <Text style={{ color: C.ink4, fontSize: 12 }}>No payments</Text>
        }
      </View>

      <Text style={rs.rSection}>VOIDS &amp; REFUNDS</Text>
      <View style={rs.rCard}>
        <ReportRow label={`Voids: ${data.void_count}`} value={peso(data.void_amount)} />
        <ReportRow label={`Refunds: ${data.refund_count}`} value={peso(data.refund_amount)} />
      </View>

      <Text style={rs.rSection}>CASH DRAWER</Text>
      <View style={rs.rCard}>
        <ReportRow label="Opening Float" value={peso(data.opening_float)} />
        <ReportRow label="+ Cash Sales" value={peso(data.payment_breakdown.cash)} />
        <ReportRow label="+ Cash In" value={peso(data.cash_in)} />
        <ReportRow label="- Cash Out" value={peso(data.cash_out)} />
        <ReportRow label="Expected Cash" value={peso(data.expected_cash)} bold />
      </View>

      <Text style={rs.rSection}>RECEIPT RANGE</Text>
      <View style={rs.rCard}>
        <ReportRow label="First" value={data.first_receipt_no ?? "—"} />
        <ReportRow label="Last" value={data.last_receipt_no ?? "—"} />
        <ReportRow label="Orders" value={String(data.order_count)} />
        <ReportRow label="Cancelled" value={String(data.cancelled_count)} />
      </View>
    </ReportDetailModal>
  );
}

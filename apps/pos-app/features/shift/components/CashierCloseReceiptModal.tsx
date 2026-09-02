import { Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { peso } from "../../order/format";
import type { CashierReceiptData } from "../../receipt/generateCashierCloseReceipt";
import { ReportDetailModal, reportSectionStyles } from "./ReportDetailModal";
import { ReportRow } from "../ReportRow";
import { paymentBreakdownRows } from "../shiftHelpers";

interface Props {
  readonly visible: boolean;
  readonly data: CashierReceiptData | null;
  readonly printing: boolean;
  readonly onClose: () => void;
  readonly onPrint: () => void;
}

// Cashier's own copy of a shift close — no expected/variance rows here,
// same blind-close rule the close screen itself enforces: a manager
// reconciles the drawer separately and is the only one who sees the math.
export function CashierCloseReceiptModal({ visible, data, printing, onClose, onPrint }: Props) {
  const { C } = useTheme();
  const rs = reportSectionStyles(C);
  if (!data) return null;

  return (
    <ReportDetailModal
      visible={visible} title="SHIFT CLOSED" subtitle={`Shift #${data.shiftId.slice(-8)}`}
      onClose={onClose} closeLabel="Done"
      primaryAction={{ label: "Print My Copy", onPress: onPrint, busy: printing, kind: "info" }}
    >
      <Text style={rs.rSection}>SHIFT INFO</Text>
      <View style={rs.rCard}>
        {!!data.cashierName && <ReportRow label="Cashier" value={data.cashierName} />}
        {!!data.registerName && <ReportRow label="Register" value={data.registerName} />}
        <ReportRow label="Opened" value={new Date(data.openedAt).toLocaleString("en-PH")} />
        <ReportRow label="Closed" value={new Date(data.closedAt).toLocaleString("en-PH")} />
      </View>

      <Text style={rs.rSection}>SALES SUMMARY</Text>
      <View style={rs.rCard}>
        {paymentBreakdownRows(data.paymentBreakdown).length > 0
          ? paymentBreakdownRows(data.paymentBreakdown).map(([label, amt]) => <ReportRow key={label} label={label} value={peso(amt)} />)
          : <Text style={{ color: C.ink4, fontSize: 12 }}>No sales this shift</Text>
        }
        <ReportRow label="Total" value={peso(data.totalSales)} bold />
        <ReportRow label="Transactions" value={String(data.itemCount)} />
      </View>

      {data.topProducts.length > 0 && (
        <>
          <Text style={rs.rSection}>TOP ITEMS</Text>
          <View style={rs.rCard}>
            {data.topProducts.map(p => <ReportRow key={p.name} label={p.name} value={`x${p.qty}`} />)}
          </View>
        </>
      )}

      {(data.discountTotal > 0 || data.serviceFeeTotal > 0 || data.voidCount > 0 || data.refundCount > 0) && (
        <>
          <Text style={rs.rSection}>ADJUSTMENTS</Text>
          <View style={rs.rCard}>
            {data.discountTotal > 0 && <ReportRow label="Discounts" value={peso(data.discountTotal)} />}
            {data.serviceFeeTotal > 0 && <ReportRow label="Service Charge" value={peso(data.serviceFeeTotal)} />}
            {data.voidCount > 0 && <ReportRow label={`Voided (${data.voidCount})`} value={peso(data.voidAmount)} />}
            {data.refundCount > 0 && <ReportRow label={`Refunded (${data.refundCount})`} value={peso(data.refundAmount)} />}
          </View>
        </>
      )}

      <Text style={rs.rSection}>MY CASH COUNT</Text>
      <View style={rs.rCard}>
        <ReportRow label="Float In" value={peso(data.openFloat)} />
        <ReportRow label="Cash Sales" value={peso(data.cashSales)} />
        {data.cashIn > 0 && <ReportRow label="+ Cash In" value={peso(data.cashIn)} />}
        {data.cashOut > 0 && <ReportRow label="- Cash Out" value={peso(data.cashOut)} />}
        <ReportRow label="Cash Counted" value={peso(data.actualCash)} bold />
      </View>

      <Text style={{ color: C.ink4, fontSize: 12, marginTop: 10 }}>
        Submitted for manager reconciliation. Keep this copy as your record of the count.
      </Text>
    </ReportDetailModal>
  );
}

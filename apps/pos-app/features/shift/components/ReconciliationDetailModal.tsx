import { Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { peso } from "../../order/format";
import { ReportDetailModal, reportSectionStyles } from "./ReportDetailModal";
import { ReportRow } from "../ReportRow";
import { fmtDateTime, paymentBreakdownRows } from "../shiftHelpers";
import type { PendingReconShift, ReconDetail } from "../types";

interface Props {
  readonly shift: PendingReconShift | null;
  readonly detail: ReconDetail | null;
  readonly loading: boolean;
  readonly reconciling: boolean;
  readonly printing: boolean;
  readonly onClose: () => void;
  readonly onReconcile: () => void;
  readonly onPrint: () => void;
}

export function ReconciliationDetailModal({ shift, detail, loading, reconciling, printing, onClose, onReconcile, onPrint }: Props) {
  const { C } = useTheme();
  const rs = reportSectionStyles(C);
  if (!shift) return null;

  return (
    <ReportDetailModal
      visible={!!shift} title={shift.registerName ?? "Register"}
      subtitle={`${shift.cashierName} · Closed ${fmtDateTime(shift.closedAt)}`}
      onClose={onClose} loading={loading || !detail}
      secondaryAction={detail ? { label: "Print", onPress: onPrint, busy: printing, kind: "info" } : undefined}
      primaryAction={detail ? { label: "Mark Reconciled", onPress: onReconcile, busy: reconciling, kind: "amber" } : undefined}
    >
      {detail && (
        <>
          <Text style={rs.rSection}>SHIFT INFO</Text>
          <View style={rs.rCard}>
            <ReportRow label="Branch" value={detail.branchName ?? "—"} />
            <ReportRow label="Opened" value={new Date(detail.openedAt).toLocaleString("en-PH")} />
            <ReportRow label="Closed" value={new Date(detail.closedAt).toLocaleString("en-PH")} />
          </View>

          <Text style={rs.rSection}>SALES SUMMARY</Text>
          <View style={rs.rCard}>
            {paymentBreakdownRows(detail.paymentBreakdown).length > 0
              ? paymentBreakdownRows(detail.paymentBreakdown).map(([label, amt]) => <ReportRow key={label} label={label} value={peso(amt)} />)
              : <Text style={{ color: C.ink4, fontSize: 12 }}>No sales this shift</Text>
            }
            <ReportRow label="Total" value={peso(detail.totalSales)} bold />
            <ReportRow label="Transactions" value={String(detail.itemCount)} />
          </View>

          {(detail.discountTotal > 0 || detail.serviceFeeTotal > 0 || detail.voidCount > 0 || detail.refundCount > 0) && (
            <>
              <Text style={rs.rSection}>ADJUSTMENTS</Text>
              <View style={rs.rCard}>
                {detail.discountTotal > 0 && <ReportRow label="Discounts" value={peso(detail.discountTotal)} />}
                {detail.serviceFeeTotal > 0 && <ReportRow label="Service Charge" value={peso(detail.serviceFeeTotal)} />}
                {detail.voidCount > 0 && <ReportRow label={`Voided (${detail.voidCount})`} value={peso(detail.voidAmount)} />}
                {detail.refundCount > 0 && <ReportRow label={`Refunded (${detail.refundCount})`} value={peso(detail.refundAmount)} />}
              </View>
            </>
          )}

          <Text style={rs.rSection}>CASH RECONCILIATION</Text>
          <View style={rs.rCard}>
            <ReportRow label="Float In" value={peso(detail.openFloat)} />
            <ReportRow label="Cash Sales" value={peso(detail.cashSales)} />
            {detail.cashIn > 0 && <ReportRow label="+ Cash In" value={peso(detail.cashIn)} />}
            {detail.cashOut > 0 && <ReportRow label="- Cash Out" value={peso(detail.cashOut)} />}
            <ReportRow label="Expected" value={peso(detail.expectedCash)} bold />
            <ReportRow label="Actual Cash" value={peso(detail.actualCash)} />
            <ReportRow label="Variance" value={peso(detail.variance)} bold />
            {detail.variance !== 0 && (
              <Text style={{ color: detail.variance < 0 ? C.bad : C.good, fontSize: 12, fontWeight: "700", marginTop: 6 }}>
                {detail.variance < 0 ? "⚠ Shortage — actual cash is below expected." : "Excess — actual cash is above expected."}
              </Text>
            )}
          </View>
        </>
      )}
    </ReportDetailModal>
  );
}

/**
 * Shift & Cash Drawer Management
 */
import { View, Text, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { useEffect, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../features/auth/AuthContext";
import { useTheme } from "../../features/theme/ThemeContext";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { KeyboardAwareScrollView } from "../../features/ui/KeyboardAwareScrollView";
import { WRITE_ROLES } from "../../features/constants";
import { NAV_BAR_CLEARANCE } from "../../features/ui/safeAreaPadding";
import { makeStyles } from "../../features/shift/shiftScreenStyles";
import { useRegisters } from "../../features/shift/useRegisters";
import { usePendingReconciliation } from "../../features/shift/usePendingReconciliation";
import { useDailyChecklist } from "../../features/shift/useDailyChecklist";
import { useShiftState } from "../../features/shift/useShiftState";
import { useShiftReports } from "../../features/shift/useShiftReports";
import { ShiftHeaderPill } from "../../features/shift/ShiftHeaderPill";
import { ReconciliationCard } from "../../features/shift/components/ReconciliationCard";
import { ShiftStatusCard } from "../../features/shift/components/ShiftStatusCard";
import { DrawerSummaryCard } from "../../features/shift/components/DrawerSummaryCard";
import { CashEventForm } from "../../features/shift/components/CashEventForm";
import { CashEventRow } from "../../features/shift/CashEventRow";
import { DailyChecklistCard } from "../../features/shift/components/DailyChecklistCard";
import { XZReportModal } from "../../features/shift/components/XZReportModal";
import { ShiftCloseReportModal } from "../../features/shift/components/ShiftCloseReportModal";
import { CashierCloseReceiptModal } from "../../features/shift/components/CashierCloseReceiptModal";
import { ReconciliationDetailModal } from "../../features/shift/components/ReconciliationDetailModal";
import { OfflineBanner } from "../../features/offline/OfflineBanner";
import { OfflineToggleButton } from "../../features/offline/OfflineToggleButton";

export default function ShiftScreen() {
  const { activeWorkspaceId, activeBranchId, role } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { height: winHeight } = useWindowDimensions();

  const isManager = role != null && (WRITE_ROLES as readonly string[]).includes(role);
  const canZReport = role === "owner" || role === "admin" || role === "manager";

  const registerApi = useRegisters(activeWorkspaceId, activeBranchId);
  const reconApi = usePendingReconciliation(isManager, activeWorkspaceId, activeBranchId);
  const reportsApi = useShiftReports(activeWorkspaceId, activeBranchId);

  const shiftApi = useShiftState({
    activeWorkspaceId, activeBranchId, isManager,
    registers: registerApi.registers, selectedRegisterId: registerApi.selectedRegisterId,
    refreshRegisters: registerApi.refreshRegisters,
    onManagerClosed: (reportData) => {
      if (reportData) {
        reportsApi.setShiftReportData(reportData);
        reportsApi.setShowShiftReportPreview(true);
      }
      void reconApi.loadPendingReconciliation();
    },
    onCashierClosed: (receipt) => {
      if (!receipt) return;
      reportsApi.setCashierReceiptData(receipt);
      reportsApi.setShowCashierReceipt(true);
    },
  });

  const checklistApi = useDailyChecklist(activeWorkspaceId, shiftApi.shift.shiftId);

  // Registers are only relevant before opening a shift on this device —
  // once one is open here, the register can't change out from under it.
  useEffect(() => {
    if (shiftApi.shift.open) return;
    registerApi.setSelectedRegisterId(null);
    void registerApi.refreshRegisters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftApi.shift.open, registerApi.refreshRegisters]);

  return (
    <View style={s.root}>
      <PosScreenHeader
        title="Shift & Cash"
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <OfflineToggleButton />
            <ShiftHeaderPill open={shiftApi.shift.open} />
          </View>
        }
      />
      {/* closeShift() blocks the close while orders are still queued/stuck
          offline (see useShiftState.ts) — shown here too, not just on the
          order screen, so that block is actually actionable from where the
          cashier hits it instead of sending them hunting for the banner. */}
      <OfflineBanner />

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + NAV_BAR_CLEARANCE + winHeight * 0.7 }]}
        showsVerticalScrollIndicator={false}
      >
        {isManager && (
          <ReconciliationCard
            pendingRecon={reconApi.pendingRecon}
            loading={reconApi.pendingReconLoading}
            onRefresh={() => { void reconApi.loadPendingReconciliation(); }}
            onSelect={(row) => { void reconApi.openReconDetail(row); }}
          />
        )}

        <ShiftStatusCard
          shift={shiftApi.shift}
          elapsed={shiftApi.elapsed}
          breakElapsed={shiftApi.breakElapsed}
          onClockIn={() => { void shiftApi.postClockAction("clock_in"); }}
          onClockOut={() => { void shiftApi.postClockAction("clock_out"); }}
          onBreakIn={() => { void shiftApi.postClockAction("break_in"); }}
          onBreakOut={() => { void shiftApi.postClockAction("break_out"); }}
          actualCashIn={shiftApi.actualCashIn}
          onActualCashChange={shiftApi.setActualCashIn}
          onCloseShift={shiftApi.closeShift}
          closingShift={shiftApi.closingShift}
          registers={registerApi.registers}
          registersLoading={registerApi.registersLoading}
          selectedRegisterId={registerApi.selectedRegisterId}
          onSelectRegister={registerApi.setSelectedRegisterId}
          cashierIn={shiftApi.cashierIn}
          onCashierChange={shiftApi.setCashierIn}
          floatIn={shiftApi.floatIn}
          onFloatChange={shiftApi.setFloatIn}
          onOpenShift={() => { void shiftApi.openShift(); }}
          openingShift={shiftApi.openingShift}
        />

        <DrawerSummaryCard
          openingFloat={shiftApi.shift.openingFloat}
          salesTotal={shiftApi.salesTotal}
          cashIn={shiftApi.cashIn}
          cashOut={shiftApi.cashOut}
          expected={shiftApi.expected}
          eventCount={shiftApi.shift.events.length}
          isManager={isManager}
        />

        {shiftApi.shift.open && (
          <CashEventForm
            events={shiftApi.shift.events}
            evtType={shiftApi.evtType} onEvtTypeChange={shiftApi.setEvtType}
            evtAmt={shiftApi.evtAmt} onEvtAmtChange={shiftApi.setEvtAmt}
            evtReason={shiftApi.evtReason} onEvtReasonChange={shiftApi.setEvtReason}
            onAdd={() => { void shiftApi.addEvent(); }}
          />
        )}

        {!shiftApi.shift.open && shiftApi.shift.events.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Last Shift Events</Text>
            {[...shiftApi.shift.events].reverse().map(evt => <CashEventRow key={evt.id} evt={evt} />)}
          </View>
        )}

        <DailyChecklistCard
          checklists={checklistApi.checklists}
          onCompleteItem={checklistApi.handleCompleteItem}
          onRefresh={() => { void checklistApi.loadChecklists(); }}
        />

        {isManager && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Daily Reports</Text>
            <Text style={[s.fieldLabel, { marginBottom: 10 }]}>Generate end-of-day reports for this branch</Text>
            <View style={s.reportBtnRow}>
              <Pressable
                style={[s.reportBtn, s.xReportBtn, reportsApi.reportLoading && { opacity: 0.5 }]}
                onPress={() => { void reportsApi.runXReport(shiftApi.shift.openingFloat); }}
                disabled={reportsApi.reportLoading}
              >
                {reportsApi.reportLoading && reportsApi.showReportModal === null ? (
                  <ActivityIndicator size="small" color={C.info} />
                ) : null}
                <Text style={[s.reportBtnText, { color: C.info }]}>X Report</Text>
              </Pressable>
              <Pressable
                style={[s.reportBtn, s.zReportBtn, (!canZReport || reportsApi.reportLoading) && { opacity: 0.5 }]}
                onPress={() => reportsApi.confirmZReport(shiftApi.shift.openingFloat)}
                disabled={!canZReport || reportsApi.reportLoading}
              >
                <Text style={[s.reportBtnText, { color: "#000000" }]}>Z Report{"\n"}(Close Day)</Text>
              </Pressable>
            </View>
            {!canZReport && (
              <Text style={{ fontSize: 11, color: C.ink4, marginTop: 4 }}>
                Z Report requires manager or higher role.
              </Text>
            )}
          </View>
        )}
      </KeyboardAwareScrollView>

      <XZReportModal
        mode={reportsApi.showReportModal}
        data={reportsApi.showReportModal === "x" ? reportsApi.xReportData : reportsApi.zReportData}
        onClose={() => reportsApi.setShowReportModal(null)}
        onPrint={(data) => { void reportsApi.handlePrintReport(data); }}
      />

      <ShiftCloseReportModal
        visible={reportsApi.showShiftReportPreview}
        data={reportsApi.shiftReportData}
        printing={reportsApi.printingShiftReport}
        onClose={() => reportsApi.setShowShiftReportPreview(false)}
        onPrint={() => { void reportsApi.printShiftReport(); }}
      />

      <ReconciliationDetailModal
        shift={reconApi.reconDetailShift}
        detail={reconApi.reconDetail}
        loading={reconApi.reconDetailLoading}
        reconciling={reconApi.reconciling}
        printing={reconApi.printingRecon}
        onClose={() => reconApi.setReconDetailShift(null)}
        onReconcile={() => { void reconApi.markReconciled(); }}
        onPrint={() => { void reconApi.printReconciliation(); }}
      />

      <CashierCloseReceiptModal
        visible={reportsApi.showCashierReceipt}
        data={reportsApi.cashierReceiptData}
        printing={reportsApi.printingCashierReceipt}
        onClose={() => reportsApi.setShowCashierReceipt(false)}
        onPrint={() => { void reportsApi.printCashierReceipt(); }}
      />
    </View>
  );
}

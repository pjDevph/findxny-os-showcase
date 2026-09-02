import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, FlatList, Modal, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { buildCsvSections, shareCsv } from "../../features/utils/exportCsv";
import { invokeFn } from "../../services/supabase";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { useAuth } from "../../features/auth/AuthContext";
import { useTheme } from "../../features/theme/ThemeContext";
import { StatTileRow } from "../../features/ui/StatTileRow";
import { EmptyState } from "../../features/ui/EmptyState";
import { ReceiptModal } from "../../features/receipt/ReceiptModal";
import { ManagerApprovalModal } from "../../features/pos-order/components/ManagerApprovalModal";
import { RefundModal } from "../../features/pos-order/components/RefundModal";
import { useToast } from "../../features/ui/ToastProvider";
import { useAppAlert } from "../../features/ui/AppAlertProvider";
import { phDateStr } from "../../features/utils/phDate";
import { makeStyles } from "../../features/transactions/transactionsScreenStyles";
import { useTransactionsList } from "../../features/transactions/useTransactionsList";
import { useTransactionDetail } from "../../features/transactions/useTransactionDetail";
import { DetailPanel } from "../../features/transactions/DetailPanel";
import { TxRow } from "../../features/transactions/TxRow";
import { TransactionFilterBar } from "../../features/transactions/TransactionFilterBar";
import { CollectBalanceModal } from "../../features/transactions/components/CollectBalanceModal";
import { CachedDataBanner } from "../../features/offline/CachedDataBanner";
import { fmtDateShort, paymentMethodLabel, rangeStart } from "../../features/transactions/transactionsHelpers";
import type { ExportRow, OrderItem } from "../../features/transactions/types";

export default function TransactionsScreen() {
  const { activeWorkspaceId, activeBranchId, role, memberships } = useAuth();
  // Previously hardcoded "POS System" — every reprint from Order History
  // showed the wrong store name regardless of the actual workspace, unlike
  // checkout's receipt (order.tsx) and the Receipts screen, both of which
  // already resolve the real name. Same pattern as receipts.tsx.
  const storeName = memberships.find((m) => m.workspace_id === activeWorkspaceId)?.workspace_name ?? "POS";
  // manager-approval-verify only allows admin/owner to self-approve their own
  // request (a deliberate segregation-of-duties control — see its comment:
  // "admin/owner may self-approve — they already have full authority").
  // Including "manager" here used to make the UI hide the PIN-entry section
  // for managers, who the server then unconditionally rejects with "A manager
  // cannot approve their own request" — a lone manager could never complete
  // a refund/void/cancel at all. Must mirror the server's actual policy.
  const isSelfApprover = role === "admin" || role === "owner";
  const { C } = useTheme();
  const { showAlert } = useAppAlert();
  const { showToast } = useToast();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const isWide = W >= 768;

  const { focus_order_id: focusOrderId } = useLocalSearchParams<{ focus_order_id?: string }>();

  const list = useTransactionsList(activeWorkspaceId);
  const detailApi = useTransactionDetail({
    activeWorkspaceId, activeBranchId, isSelfApprover,
    setOrders: list.setOrders, reloadList: () => list.load(0, true),
  });
  const [exporting, setExporting] = useState(false);

  // Deep link from the Dashboard's Live Orders table: ?focus_order_id=<id>
  // auto-opens that order's detail once the list has loaded. Guarded by a ref
  // so dismissing the panel doesn't immediately reopen it on the next render.
  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    const id = typeof focusOrderId === "string" ? focusOrderId : undefined;
    if (!id || list.loading || focusedRef.current === id) return;
    const match = list.orders.find(o => o.id === id);
    if (!match) return;
    focusedRef.current = id;
    detailApi.openDetail(match).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusOrderId, list.orders, list.loading]);

  async function exportCSV() {
    if (!activeWorkspaceId) return;
    setExporting(true);
    const start = rangeStart(list.dateFilter);
    const ep: Record<string, unknown> = {};
    if (start) ep.start = start;
    if (list.statusFilter !== "all") ep.status = list.statusFilter;
    if (list.sourceFilter !== "all") ep.source = list.sourceFilter;
    if (list.paymentFilter !== "all") ep.payment_method = list.paymentFilter;
    const { data: expData, error } = await invokeFn<{ "transactions-export": ExportRow[] }>("pos-data", {
      workspace_id: activeWorkspaceId, resource: "transactions-export", params: ep,
    });
    const data = expData?.["transactions-export"] ?? null;
    setExporting(false);
    if (error || !data?.length) { showToast({ title: "Export", message: error?.message ?? "No data", type: "error" }); return; }
    const header = ["Order No", "Date", "Type", "Source", "Table", "Guest", "Subtotal", "Tax", "Service Fee", "Total", "Status", "Payment Method"];
    const rows = data.map((o: ExportRow) => [
      o.order_no, fmtDateShort(o.created_at), o.order_type ?? "", o.source ?? "pos",
      o.table_no ?? "", o.notes ?? "", o.subtotal ?? "", o.tax ?? "", o.service_fee ?? "", o.total, o.status,
      paymentMethodLabel(o.payment_methods),
    ]);
    const cancelledCount = data.filter((o: ExportRow) => o.status === "cancelled").length;
    const sum = (fn: (o: ExportRow) => number | null) => data.reduce((acc: number, o: ExportRow) => acc + (fn(o) ?? 0), 0);
    const summaryRows = [
      ["Total Orders", data.length],
      ["Cancelled Orders", cancelledCount],
      ["Total Subtotal", sum(o => o.subtotal).toFixed(2)],
      ["Total Tax", sum(o => o.tax).toFixed(2)],
      ["Total Service Fee", sum(o => o.service_fee).toFixed(2)],
      ["Total Revenue", sum(o => o.total).toFixed(2)],
    ];
    try {
      await shareCsv(`order-history-${phDateStr()}.csv`, buildCsvSections([
        { header, rows },
        { title: "SUMMARY", header: ["Metric", "Value"], rows: summaryRows },
      ]));
    } catch (e: any) {
      showToast({ title: "Export failed", message: e?.message ?? "Could not create the CSV file.", type: "error" });
    }
  }

  const headerNode = (
    <PosScreenHeader title="Order History"
      right={
        <Pressable style={[s.exportBtn, exporting && { opacity: 0.5 }]} onPress={exportCSV} disabled={exporting}>
          <Feather name="download" size={13} color={C.amber} />
          <Text style={s.exportBtnTxt}>{exporting ? "Exporting…" : "Export CSV"}</Text>
        </Pressable>
      }
    />
  );

  const filterNode = (
    <TransactionFilterBar
      search={list.searchQuery} onSearchChange={list.setSearchQuery}
      dateFilter={list.dateFilter} onDateFilterChange={list.setDateFilter}
      statusFilter={list.statusFilter} onStatusFilterChange={list.setStatusFilter}
      sourceFilter={list.sourceFilter} onSourceFilterChange={list.setSourceFilter}
      paymentFilter={list.paymentFilter} onPaymentFilterChange={list.setPaymentFilter}
    />
  );

  const summaryNode = !list.loading && list.filtered.length > 0 ? (
    <View style={s.summaryBarWrap}>
      <StatTileRow tiles={[
        { key: "transactions", label: "Transactions", value: `${list.filtered.length}${list.hasMore ? "+" : ""}` },
        { key: "revenue", label: "Revenue", value: `₱${list.revenueTotal.toFixed(2)}`, color: C.good },
        { key: "pending", label: "Pending", value: list.pendingCount, color: list.pendingCount > 0 ? C.warn : C.ink3 },
        { key: "cancelled", label: "Cancelled", value: list.cancelledCount, color: list.cancelledCount > 0 ? C.bad : C.ink3 },
      ]} />
    </View>
  ) : null;

  const listNode = (
    <FlatList
      data={list.filtered}
      keyExtractor={o => o.id}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
      onEndReached={list.loadMore}
      onEndReachedThreshold={0.3}
      renderItem={({ item: o }) => (
        <TxRow
          order={o} selected={detailApi.detail?.id === o.id} C={C} s={s}
          onPress={() => { detailApi.openDetail(o).catch(console.error); }}
        />
      )}
      ListEmptyComponent={
        list.loading ? null : (
          <EmptyState
            icon="inbox"
            title={list.searchQuery.trim() ? "No matching orders" : "No transactions found"}
            subtitle='Try switching to "All" or "This Month"'
          />
        )
      }
      ListFooterComponent={
        list.loadingMore ? <ActivityIndicator color={C.amber} style={{ padding: 16 }} /> :
        list.hasMore && list.filtered.length > 0 ? (
          <Pressable style={s.loadMoreBtn} onPress={list.loadMore}>
            <Text style={s.loadMoreTxt}>Load more</Text>
          </Pressable>
        ) : list.filtered.length > 0 ? (
          <Text style={s.endTxt}>— End of results —</Text>
        ) : null
      }
    />
  );

  const detail = detailApi.detail;
  const detailPanelProps = detail ? {
    C, order: detail, items: detailApi.detailItems, itemsLoading: detailApi.detailLoading,
    payment: detailApi.detailPayment, cashierName: detailApi.detailCashier,
    cancelling: detailApi.cancelling,
    showCancelBtn: detailApi.showCancelBtn, showForceCancelBtn: detailApi.showForceCancelBtn,
    showRefundBtn: detailApi.showRefundBtn, showCollectBalanceBtn: detailApi.showCollectBalanceBtn,
    onCollectBalance: () => { detailApi.setCollectMethod("cash"); detailApi.setCollectRef(""); detailApi.setCollectVisible(true); },
    onReprint: detailApi.onReprint, onCancel: () => { detailApi.handleCancelOrder().catch(console.error); },
    onForceCancel: () => {
      showAlert(
        "Force Cancel Preparing Order",
        "The kitchen has already started this order. Cancel it? The restaurant absorbs the cost — not the customer.",
        [
          { text: "Keep Order", style: "cancel" },
          { text: "Cancel Anyway", style: "destructive", onPress: () => detailApi.openVoidApproval().catch(console.error) },
        ],
      );
    },
    onRefundApproval: () => { detailApi.setShowRefundModal(true); },
    onCancelItem: (item: OrderItem) => { detailApi.handleCancelItem(item).catch(console.error); },
    cancellingItemId: detailApi.cancellingItemId,
    onClose: () => detailApi.setDetail(null),
  } : null;

  const collectModalNode = (
    <CollectBalanceModal
      visible={detailApi.collectVisible}
      orderNo={detail?.order_no}
      balanceDue={Number(detail?.balance_due) > 0 ? Number(detail?.balance_due) : Number(detail?.total ?? 0)}
      method={detailApi.collectMethod}
      onMethodChange={detailApi.setCollectMethod}
      refNumber={detailApi.collectRef}
      onRefNumberChange={detailApi.setCollectRef}
      collecting={detailApi.collecting}
      onClose={() => detailApi.setCollectVisible(false)}
      onConfirm={() => { detailApi.collectBalance().catch(console.error); }}
    />
  );

  if (isWide) {
    return (
      <View style={s.root}>
        {headerNode}
        {filterNode}
        {summaryNode}
        {list.loading ? <View style={s.center}><ActivityIndicator color={C.amber} /></View> : (
          <View style={s.wideBody}>
            <View style={s.wideList}>{listNode}</View>
            <View style={s.wideDetail}>
              {detailPanelProps ? (
                <DetailPanel {...detailPanelProps} asModal={false} />
              ) : (
                <View style={s.noSelection}>
                  <Feather name="file-text" size={32} color={C.ink4} />
                  <Text style={s.noSelectionTxt}>Select a transaction</Text>
                  <Text style={s.noSelectionSub}>Tap any row to view details,{"\n"}reprint, cancel, or refund</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <ReceiptModal visible={detailApi.showReceiptModal} payload={detailApi.receiptPayload}
          storeName={storeName} isReprint onClose={() => detailApi.setShowReceiptModal(false)} />
        <ManagerApprovalModal visible={detailApi.showApproval} approvalId={detailApi.approvalId}
          actionLabel={detailApi.approvalAction === "void_order" ? "Void Order" : "Cancel Item"}
          onApproved={id => { detailApi.onManagerApproved(id).catch(console.error); }}
          onRejected={() => undefined} onClose={() => detailApi.setShowApproval(false)} />
        <RefundModal visible={detailApi.showRefundModal}
          workspaceId={activeWorkspaceId} branchId={activeBranchId}
          orderId={detail?.id ?? ""} orderNo={detail?.order_no ?? ""}
          paymentId={detailApi.detailPayment?.payment_id ?? ""} paidAmount={detailApi.detailPayment?.amount ?? 0}
          isSelfApprover={isSelfApprover}
          onClose={() => detailApi.setShowRefundModal(false)} onSuccess={detailApi.handleRefundSuccess} />
        {collectModalNode}
      </View>
    );
  }

  return (
    <View style={s.root}>
      {headerNode}
      <CachedDataBanner />
      {filterNode}
      {summaryNode}
      {list.loading ? <View style={s.center}><ActivityIndicator color={C.amber} /></View> : listNode}

      <Modal visible={!!detail} animationType="slide" transparent onRequestClose={() => detailApi.setDetail(null)}>
        <View style={s.modalBd}>
          {detailPanelProps && <DetailPanel {...detailPanelProps} asModal />}
        </View>
      </Modal>

      <ReceiptModal visible={detailApi.showReceiptModal} payload={detailApi.receiptPayload}
        storeName="POS System" isReprint onClose={() => detailApi.setShowReceiptModal(false)} />
      <ManagerApprovalModal visible={detailApi.showApproval} approvalId={detailApi.approvalId}
        actionLabel={detailApi.approvalAction === "void_order" ? "Void Order" : "Cancel Item"}
        onApproved={id => { detailApi.onManagerApproved(id).catch(console.error); }}
        onRejected={() => undefined} onClose={() => detailApi.setShowApproval(false)} />
      <RefundModal visible={detailApi.showRefundModal}
        workspaceId={activeWorkspaceId} branchId={activeBranchId}
        orderId={detail?.id ?? ""} orderNo={detail?.order_no ?? ""}
        paymentId={detailApi.detailPayment?.payment_id ?? ""} paidAmount={detailApi.detailPayment?.amount ?? 0}
        isSelfApprover={isSelfApprover}
        onClose={() => detailApi.setShowRefundModal(false)} onSuccess={detailApi.handleRefundSuccess} />
      {collectModalNode}
    </View>
  );
}

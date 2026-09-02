/**
 * Reports & Analytics — tabbed command-center
 * Tabs: Overview | Products | Payments | Detailed | Bookings | Staff | Discounts | Customers
 */
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useState, useMemo } from "react";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../../features/auth/AuthContext";
import { useTheme } from "../../features/theme/ThemeContext";
import { ReceiptModal } from "../../features/receipt/ReceiptModal";
import { RefreshButton } from "../../features/ui/RefreshButton";
import { NAV_BAR_CLEARANCE } from "../../features/ui/safeAreaPadding";
import { phDateStr } from "../../features/utils/phDate";
import { buildCsvSections, shareCsv } from "../../features/utils/exportCsv";
import { useToast } from "../../features/ui/ToastProvider";
import { makeStyles } from "../../features/reports/reportsScreenStyles";
import { useReportsData } from "../../features/reports/useReportsData";
import { useExtendedReports } from "../../features/reports/useExtendedReports";
import { useOrderDetail } from "../../features/reports/useOrderDetail";
import { ReportsFilterBar } from "../../features/reports/ReportsFilterBar";
import { fmtTime } from "../../features/reports/reportsHelpers";
import { OverviewTab } from "../../features/reports/components/OverviewTab";
import { ProductsTab } from "../../features/reports/components/ProductsTab";
import { PaymentsTab } from "../../features/reports/components/PaymentsTab";
import { DetailedTab } from "../../features/reports/components/DetailedTab";
import { BookingsTab } from "../../features/reports/components/BookingsTab";
import { StaffTab } from "../../features/reports/components/StaffTab";
import { ShiftsTab } from "../../features/reports/components/ShiftsTab";
import { DiscountsTab } from "../../features/reports/components/DiscountsTab";
import { CustomersTab } from "../../features/reports/components/CustomersTab";
import { OrderDetailModal } from "../../features/reports/components/OrderDetailModal";
import { TABS, type ProdMetric, type Tab, type TrendMetric } from "../../features/reports/types";

export default function ReportsScreen() {
  const { activeWorkspaceId, memberships } = useAuth();
  // Previously hardcoded "POS System" — reprint from Reports showed the
  // wrong store name regardless of the actual workspace. Same pattern as
  // receipts.tsx / transactions.tsx.
  const storeName = memberships.find((m) => m.workspace_id === activeWorkspaceId)?.workspace_name ?? "POS";
  const { C } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPad = insets.bottom + NAV_BAR_CLEARANCE;
  const s = useMemo(() => makeStyles(C), [C]);
  const { showToast } = useToast();
  const [exportingDetailed, setExportingDetailed] = useState(false);
  const [exportingStaff, setExportingStaff] = useState(false);
  const [exportingShifts, setExportingShifts] = useState(false);

  const reportsData = useReportsData(activeWorkspaceId);
  const {
    period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo,
    chFilters, setChFilters, payFilters, setPayFilters, catFilters, setCatFilters,
    data, loading, refreshing, refreshAll, resetFilters, useCustom, fromDate, toDate,
  } = reportsData;

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("revenue");
  const [prodMetric, setProdMetric] = useState<ProdMetric>("revenue");
  const [searchQuery, setSearchQuery] = useState("");
  const [displayCount, setDisplayCount] = useState(30);

  const extended = useExtendedReports(activeWorkspaceId, activeTab, fromDate, toDate);
  const orderDetail = useOrderDetail(activeWorkspaceId);

  function ddToggle(kind: "ch" | "pay" | "cat", v: string) {
    const fn = { ch: setChFilters, pay: setPayFilters, cat: setCatFilters }[kind];
    fn(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]);
  }

  const sortedProducts = useMemo(() => {
    if (!data?.topProducts) return [];
    return [...data.topProducts].sort((a, b) =>
      prodMetric === "qty" ? b.qty - a.qty : b.revenue - a.revenue,
    );
  }, [data?.topProducts, prodMetric]);

  const filteredOrders = useMemo(() => {
    if (!data?.recentOrders) return [];
    if (!searchQuery.trim()) return data.recentOrders;
    const q = searchQuery.toLowerCase().trim();
    return data.recentOrders.filter(o => {
      if (o.order_no.toLowerCase().includes(q)) return true;
      const num = parseFloat(q);
      return !isNaN(num) && Math.abs(o.total - num) < 0.01;
    });
  }, [data?.recentOrders, searchQuery]);

  // Detailed-report CSV export — the full filtered order list (all matches,
  // not just the paginated slice shown on screen).
  async function exportDetailed() {
    if (!filteredOrders.length) { showToast({ title: "Export", message: "No orders to export.", type: "error" }); return; }
    setExportingDetailed(true);
    try {
      const header = ["Order No", "Status", "Date / Time", "Total"];
      const rows = filteredOrders.map(o => [o.order_no, o.status, fmtTime(o.created_at), Number(o.total).toFixed(2)]);
      const statusCounts: Record<string, number> = {};
      for (const o of filteredOrders) statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
      const totalAmount = filteredOrders.reduce((acc, o) => acc + Number(o.total), 0);
      const summaryRows = [
        ["Total Orders", filteredOrders.length],
        ...Object.entries(statusCounts).map(([status, count]) => [`Status: ${status}`, count]),
        ["Total Amount", totalAmount.toFixed(2)],
      ];
      await shareCsv(`detailed-report-${phDateStr()}.csv`, buildCsvSections([
        { header, rows },
        { title: "SUMMARY", header: ["Metric", "Value"], rows: summaryRows },
      ]));
    } catch (e: any) {
      showToast({ title: "Export failed", message: e?.message ?? "Could not create the CSV file.", type: "error" });
    } finally {
      setExportingDetailed(false);
    }
  }

  async function exportStaff() {
    const rows = extended.staffStats ?? [];
    if (!rows.length) { showToast({ title: "Export", message: "No staff data to export.", type: "error" }); return; }
    setExportingStaff(true);
    try {
      const header = ["Staff", "Orders", "Gross Sales", "Net Sales", "Cancellations", "Discounts Given", "Avg Order Value"];
      const dataRows = rows.map(r => [
        r.name, r.orders, r.grossSales.toFixed(2), r.netSales.toFixed(2),
        r.cancellations, r.discountsGiven.toFixed(2),
        r.orders ? (r.grossSales / r.orders).toFixed(2) : "0.00",
      ]);
      const totalOrders = rows.reduce((acc, r) => acc + r.orders, 0);
      const totalGross = rows.reduce((acc, r) => acc + r.grossSales, 0);
      const totalNet = rows.reduce((acc, r) => acc + r.netSales, 0);
      const summaryRows = [
        ["Total Staff", rows.length],
        ["Total Orders", totalOrders],
        ["Total Gross Sales", totalGross.toFixed(2)],
        ["Total Net Sales", totalNet.toFixed(2)],
        ["Total Cancellations", rows.reduce((acc, r) => acc + r.cancellations, 0)],
        ["Total Discounts Given", rows.reduce((acc, r) => acc + r.discountsGiven, 0).toFixed(2)],
        ["Avg Order Value (all staff)", totalOrders ? (totalGross / totalOrders).toFixed(2) : "0.00"],
      ];
      await shareCsv(`staff-performance-${phDateStr()}.csv`, buildCsvSections([
        { header, rows: dataRows },
        { title: "SUMMARY", header: ["Metric", "Value"], rows: summaryRows },
      ]));
    } catch (e: any) {
      showToast({ title: "Export failed", message: e?.message ?? "Could not create the CSV file.", type: "error" });
    } finally {
      setExportingStaff(false);
    }
  }

  async function exportShifts() {
    const rows = extended.shiftHistory ?? [];
    if (!rows.length) { showToast({ title: "Export", message: "No shift history to export.", type: "error" }); return; }
    setExportingShifts(true);
    try {
      const header = [
        "Cashier", "Register", "Branch", "Status", "Opened At", "Closed At",
        "Opening Float", "Closing Float", "Expected Float", "Variance", "Reconciled At",
        "Transactions", "Cash", "GCash", "Maya", "Card", "QR Ph", "Bank Transfer", "Other", "Total Sales",
      ];
      const dataRows = rows.map(r => [
        r.cashierName, r.registerName ?? "—", r.branchName ?? "—", r.status,
        fmtTime(r.openedAt), r.closedAt ? fmtTime(r.closedAt) : "—",
        r.openingFloat.toFixed(2), r.closingFloat != null ? r.closingFloat.toFixed(2) : "—",
        r.expectedFloat != null ? r.expectedFloat.toFixed(2) : "—", r.variance != null ? r.variance.toFixed(2) : "—",
        r.reconciledAt ? fmtTime(r.reconciledAt) : "Not reconciled", r.transactionCount,
        r.paymentBreakdown.cash.toFixed(2), r.paymentBreakdown.gcash.toFixed(2), r.paymentBreakdown.maya.toFixed(2),
        r.paymentBreakdown.card.toFixed(2), r.paymentBreakdown.qrph.toFixed(2), r.paymentBreakdown.bank_transfer.toFixed(2),
        r.paymentBreakdown.other.toFixed(2), r.totalSales.toFixed(2),
      ]);
      const pmKeys = ["cash", "gcash", "maya", "card", "qrph", "bank_transfer", "other"] as const;
      const pmTotals = pmKeys.map(k => rows.reduce((acc, r) => acc + r.paymentBreakdown[k], 0));
      const reconciled = rows.filter(r => r.variance != null);
      const totalVariance = reconciled.reduce((acc, r) => acc + (r.variance ?? 0), 0);
      const summaryRows = [
        ["Total Shifts", rows.length],
        ["Total Transactions", rows.reduce((acc, r) => acc + r.transactionCount, 0)],
        ["Total Cash", pmTotals[0].toFixed(2)],
        ["Total GCash", pmTotals[1].toFixed(2)],
        ["Total Maya", pmTotals[2].toFixed(2)],
        ["Total Card", pmTotals[3].toFixed(2)],
        ["Total QR Ph", pmTotals[4].toFixed(2)],
        ["Total Bank Transfer", pmTotals[5].toFixed(2)],
        ["Total Other", pmTotals[6].toFixed(2)],
        ["Total Sales", rows.reduce((acc, r) => acc + r.totalSales, 0).toFixed(2)],
        ["Reconciled Shifts", reconciled.length],
        ["Total Variance (reconciled)", totalVariance.toFixed(2)],
      ];
      await shareCsv(`shift-history-${phDateStr()}.csv`, buildCsvSections([
        { header, rows: dataRows },
        { title: "SUMMARY", header: ["Metric", "Value"], rows: summaryRows },
      ]));
    } catch (e: any) {
      showToast({ title: "Export failed", message: e?.message ?? "Could not create the CSV file.", type: "error" });
    } finally {
      setExportingShifts(false);
    }
  }

  return (
    <View style={s.root}>
      <View style={[s.hdr, { paddingTop: insets.top > 0 ? insets.top + 10 : 12 }]}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backTxt}>‹ POS</Text>
        </Pressable>
        <Text style={s.hdrTitle}>Reports & Analytics</Text>
        <View style={{ flex: 1 }} />
        <RefreshButton onPress={() => refreshAll()} refreshing={refreshing} />
      </View>

      <ReportsFilterBar
        period={period} onPeriodChange={setPeriod}
        customFrom={customFrom} onCustomFromChange={setCustomFrom}
        customTo={customTo} onCustomToChange={setCustomTo}
        useCustom={useCustom}
        chFilters={chFilters} onChToggle={(v) => ddToggle("ch", v)}
        payFilters={payFilters} onPayToggle={(v) => ddToggle("pay", v)}
        catFilters={catFilters} onCatToggle={(v) => ddToggle("cat", v)}
        onReset={resetFilters}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={{ paddingHorizontal: 8 }}>
        {TABS.map(tab => (
          <Pressable key={tab.id} style={[s.tabItem, activeTab === tab.id && s.tabItemActive]} onPress={() => { setActiveTab(tab.id); setDisplayCount(30); }}>
            <Feather name={tab.icon} size={13} color={activeTab === tab.id ? C.amber : C.ink4} />
            <Text style={[s.tabTxt, activeTab === tab.id && s.tabTxtActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.amber} size="large" /></View>
      ) : (
        <>
          {activeTab === "overview" && (
            <OverviewTab
              data={data} trendMetric={trendMetric} onTrendMetricChange={setTrendMetric}
              sortedProducts={sortedProducts} setActiveTab={setActiveTab} bottomPad={bottomPad} s={s}
            />
          )}
          {activeTab === "products" && (
            <ProductsTab sortedProducts={sortedProducts} prodMetric={prodMetric} onProdMetricChange={setProdMetric} s={s} />
          )}
          {activeTab === "payments" && <PaymentsTab data={data} bottomPad={bottomPad} s={s} />}
          {activeTab === "detailed" && (
            <DetailedTab
              filteredOrders={filteredOrders} searchQuery={searchQuery} onSearchChange={setSearchQuery}
              displayCount={displayCount} onShowMore={() => setDisplayCount(c => c + 30)}
              exportingDetailed={exportingDetailed} onExport={exportDetailed}
              onOpenOrder={orderDetail.openOrderDetail} s={s}
            />
          )}
          {activeTab === "bookings" && (
            <BookingsTab bookingStats={extended.bookingStats} bookingLoading={extended.bookingLoading} bottomPad={bottomPad} s={s} />
          )}
          {activeTab === "staff" && (
            <StaffTab
              staffStats={extended.staffStats} staffLoading={extended.staffLoading}
              exportingStaff={exportingStaff} onExport={exportStaff} s={s}
            />
          )}
          {activeTab === "shifts" && (
            <ShiftsTab
              shiftHistory={extended.shiftHistory} shiftSummary={extended.shiftSummary}
              shortageByDay={extended.shortageByDay} shiftHistoryLoading={extended.shiftHistoryLoading}
              exportingShifts={exportingShifts} onExport={exportShifts} s={s}
            />
          )}
          {activeTab === "discounts" && (
            <DiscountsTab discountStats={extended.discountStats} discountLoading={extended.discountLoading} bottomPad={bottomPad} s={s} />
          )}
          {activeTab === "customers" && (
            <CustomersTab customerStats={extended.customerStats} customerLoading={extended.customerLoading} bottomPad={bottomPad} s={s} />
          )}
        </>
      )}

      <OrderDetailModal
        order={orderDetail.selectedOrder}
        items={orderDetail.detailItems}
        loading={orderDetail.detailLoading}
        onClose={() => orderDetail.setSelectedOrder(null)}
        onReprint={orderDetail.showReprint}
        s={s}
      />

      <ReceiptModal
        visible={orderDetail.showReceiptModal}
        payload={orderDetail.receiptPayload}
        storeName={storeName}
        isReprint
        onClose={() => orderDetail.setShowReceiptModal(false)}
      />
    </View>
  );
}

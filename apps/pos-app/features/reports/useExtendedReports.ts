import { useCallback, useEffect, useState } from "react";
import { invokeFn } from "../../services/supabase";
import type {
  BookingStats, BookingsAnalyticsResponse, CustomerLtvResponse, CustomerStats,
  DiscountStats, DiscountsRefundsResponse, ShiftHistoryResponse, ShiftCashierSummaryRow,
  ShiftHistoryRow, ShortageDayRow, StaffPerformanceResponse, StaffRow, Tab,
} from "./types";

/** Lazy loaders for the Bookings/Staff/Discounts/Customers tabs — each only
 *  fetches once the cashier actually selects that tab (or the date range
 *  changes while it's active), not on every screen load. */
export function useExtendedReports(activeWorkspaceId: string | null | undefined, activeTab: Tab, fromDate: string, toDate: string) {
  const [bookingStats, setBookingStats] = useState<BookingStats | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [staffStats, setStaffStats] = useState<StaffRow[] | null>(null);
  const [staffLoading, setStaffLoading] = useState(false);
  const [discountStats, setDiscountStats] = useState<DiscountStats | null>(null);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [customerStats, setCustomerStats] = useState<CustomerStats | null>(null);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [shiftHistory, setShiftHistory] = useState<ShiftHistoryRow[] | null>(null);
  const [shiftSummary, setShiftSummary] = useState<ShiftCashierSummaryRow[] | null>(null);
  const [shortageByDay, setShortageByDay] = useState<ShortageDayRow[] | null>(null);
  const [shiftHistoryLoading, setShiftHistoryLoading] = useState(false);

  const loadBookings = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setBookingLoading(true);
    try {
      const { data: d } = await invokeFn<BookingsAnalyticsResponse>("reports-extended", {
        workspace_id: activeWorkspaceId,
        resource: "bookings-analytics",
        from_date: fromDate,
        to_date: toDate,
      });
      if (d) {
        setBookingStats({
          totalBookings: d.total_bookings ?? 0,
          revenue: d.revenue ?? 0,
          cancellationRate: d.cancellation_rate ?? 0,
          noShowRate: d.no_show_rate ?? 0,
          byResource: (d.by_resource ?? []).map((r) => ({
            name: r.name ?? "—", type: r.type ?? "—",
            bookings: r.bookings ?? 0, revenue: r.revenue ?? 0,
          })),
          byDay: (d.by_day ?? []).map((r) => ({
            date: r.date ?? "—", bookings: r.bookings ?? 0,
          })),
        });
      }
    } catch { /* silent */ }
    setBookingLoading(false);
  }, [activeWorkspaceId, fromDate, toDate]);

  const loadStaff = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setStaffLoading(true);
    try {
      const { data: d } = await invokeFn<StaffPerformanceResponse>("reports-extended", {
        workspace_id: activeWorkspaceId,
        resource: "staff-performance",
        from_date: fromDate,
        to_date: toDate,
      });
      if (d) {
        const rows: StaffRow[] = (d.staff ?? []).map((r) => ({
          cashier_id: r.cashier_id ?? null,
          name: r.name ?? "Walk-in / No cashier",
          orders: r.orders ?? 0, grossSales: r.gross_sales ?? 0,
          netSales: r.net_sales ?? 0, cancellations: r.cancellations ?? 0,
          discountsGiven: r.discounts_given ?? 0,
        }));
        rows.sort((a, b) => b.grossSales - a.grossSales);
        setStaffStats(rows);
      }
    } catch { /* silent */ }
    setStaffLoading(false);
  }, [activeWorkspaceId, fromDate, toDate]);

  const loadDiscounts = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setDiscountLoading(true);
    try {
      const { data: d } = await invokeFn<DiscountsRefundsResponse>("reports-extended", {
        workspace_id: activeWorkspaceId,
        resource: "discounts-refunds",
        from_date: fromDate,
        to_date: toDate,
      });
      if (d) {
        setDiscountStats({
          totalDiscount: d.total_discount ?? 0,
          discountRate: d.discount_rate ?? 0,
          totalRefunds: d.total_refunds ?? 0,
          manualDiscount: d.manual_discount ?? 0,
          seniorPwdDiscount: d.senior_pwd_discount ?? 0,
          voucherDiscount: d.voucher_discount ?? 0,
          topVouchers: (d.top_vouchers ?? []).map((v) => ({
            code: v.code ?? "—", uses: v.uses ?? 0, totalDiscounted: v.total_discounted ?? 0,
          })),
        });
      }
    } catch { /* silent */ }
    setDiscountLoading(false);
  }, [activeWorkspaceId, fromDate, toDate]);

  const loadShiftHistory = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setShiftHistoryLoading(true);
    try {
      const { data: d } = await invokeFn<ShiftHistoryResponse>("reports-extended", {
        workspace_id: activeWorkspaceId,
        resource: "shift-history",
        from_date: fromDate,
        to_date: toDate,
      });
      if (d) {
        setShiftHistory(d.shifts ?? []);
        setShiftSummary(d.summaryByCashier ?? []);
        setShortageByDay(d.shortageByDay ?? []);
      }
    } catch { /* silent */ }
    setShiftHistoryLoading(false);
  }, [activeWorkspaceId, fromDate, toDate]);

  const loadCustomers = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setCustomerLoading(true);
    try {
      const { data: d } = await invokeFn<CustomerLtvResponse>("reports-extended", {
        workspace_id: activeWorkspaceId,
        resource: "customer-ltv",
        from_date: fromDate,
        to_date: toDate,
      });
      if (d) {
        setCustomerStats({
          totalCustomers: d.total_customers ?? 0,
          repeatCustomers: d.repeat_customers ?? 0,
          repeatRate: d.repeat_rate ?? 0,
          topCustomers: (d.top_customers ?? []).map((c) => ({
            customer_id: c.customer_id ?? "—",
            name: c.name ?? "—", phone: c.phone ?? "—",
            orders: c.orders ?? 0, totalSpend: c.total_spend ?? 0,
            loyaltyPoints: c.loyalty_points ?? 0,
          })),
        });
      }
    } catch { /* silent */ }
    setCustomerLoading(false);
  }, [activeWorkspaceId, fromDate, toDate]);

  // Fire the right loader when tab is selected or date range changes
  useEffect(() => {
    if (activeTab === "bookings") loadBookings();
    if (activeTab === "staff") loadStaff();
    if (activeTab === "shifts") loadShiftHistory();
    if (activeTab === "discounts") loadDiscounts();
    if (activeTab === "customers") loadCustomers();
  }, [activeTab, loadBookings, loadStaff, loadShiftHistory, loadDiscounts, loadCustomers]);

  return {
    bookingStats, bookingLoading, staffStats, staffLoading,
    shiftHistory, shiftSummary, shortageByDay, shiftHistoryLoading,
    discountStats, discountLoading, customerStats, customerLoading,
  };
}

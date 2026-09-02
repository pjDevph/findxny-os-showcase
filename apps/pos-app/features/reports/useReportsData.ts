import { useCallback, useEffect, useMemo, useState } from "react";
import { invokeFn, isNetworkError } from "../../services/supabase";
import { useToast } from "../ui/ToastProvider";
import { assembleReportsData, buildItemsParams, buildOrdersParams, periodDates, sinceDate, untilDate } from "./reportsHelpers";
import { phStartOfDayIso } from "../utils/phDate";
import type { Period, SectionRes } from "./types";

export function useReportsData(activeWorkspaceId: string | null | undefined) {
  const [period, setPeriod] = useState<Period>(30);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [chFilters, setChFilters] = useState<string[]>([]);
  const [payFilters, setPayFilters] = useState<string[]>([]);
  const [catFilters, setCatFilters] = useState<string[]>([]);

  // When a Custom from/to range is active it replaces the quick-pick period
  // entirely (they're mutually exclusive in ReportsFilterBar) — every
  // section below must use customFrom/customTo's bounds, not just the
  // extended tabs, or picking e.g. "Jan 1 – Jan 5" silently kept showing
  // orders through today on the Overview/Products/Payments/Detailed tabs.
  const useCustomRange = !!(customFrom && customTo);

  // Raw per-section fetch results — kept separate so each section's own
  // useEffect can depend only on the filters that actually affect it
  // (see fetch*Section below), instead of one combined effect that
  // refetched every section whenever any filter changed.
  const [ordersRes, setOrdersRes] = useState<SectionRes>({ data: null });
  const [channelRes, setChannelRes] = useState<SectionRes>({ data: null });
  const [itemsRes, setItemsRes] = useState<SectionRes>({ data: null });
  const [payRes, setPayRes] = useState<SectionRes>({ data: null });
  const [refundRes, setRefundRes] = useState<SectionRes>({ data: null });
  const [sectionsLoaded, setSectionsLoaded] = useState({ orders: false, channel: false, items: false, pay: false, refund: false });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { showToast } = useToast();

  // invokeFn never throws on a network failure — it resolves {data: null,
  // error}. assembleReportsData() below defaults every section's numbers to
  // 0/[] on null data, so setting section state straight from a
  // network-failed response used to silently blank out real, already-loaded
  // report numbers with no error shown. Guarding each setter here means a
  // section only ever updates from data that's actually real — a fetch that
  // fails offline just leaves whatever was already on screen.
  /** Returns true when the fetch was skipped because it failed offline —
   *  refreshAll uses this to tell the cashier a manual refresh didn't
   *  actually pull anything new, instead of just quietly no-opping. */
  function applySection(res: SectionRes & { error?: Error | null }, set: (r: SectionRes) => void): boolean {
    if (isNetworkError(res.error)) return true;
    set(res);
    return false;
  }

  // Combined view model for the Overview/Products/Payments/Detailed tabs,
  // recomputed whenever any one of the 5 raw sections updates. Cheap client-side
  // aggregation (no network), so deriving it this way (instead of one shared
  // fetch) is what lets each section below refetch independently.
  const data = useMemo(
    () => assembleReportsData(ordersRes, channelRes, itemsRes, payRes, refundRes),
    [ordersRes, channelRes, itemsRes, payRes, refundRes],
  );

  // reports-orders-main drives KPIs/trend/recent-orders and is filtered by
  // channel + payment method server-side, so it depends on chFilters/payFilters.
  const fetchOrdersSection = useCallback(async () => {
    if (!activeWorkspaceId) return false;
    let offline = false;
    try {
      const since = useCustomRange ? phStartOfDayIso(customFrom) : sinceDate(period);
      const until = useCustomRange ? untilDate(customTo) : undefined;
      const res = await invokeFn<Record<string, unknown[]>>("pos-data", {
        workspace_id: activeWorkspaceId,
        resource: "reports-orders-main",
        params: buildOrdersParams(since, chFilters, payFilters, until),
      });
      offline = applySection(res, setOrdersRes);
    } catch { /* silent */ }
    setSectionsLoaded((f) => ({ ...f, orders: true }));
    return offline;
  }, [activeWorkspaceId, period, chFilters, payFilters, useCustomRange, customFrom, customTo]);

  // reports-channel-breakdown is not filtered by any of the dropdowns — it
  // only depends on the selected period/custom range.
  const fetchChannelSection = useCallback(async () => {
    if (!activeWorkspaceId) return false;
    let offline = false;
    try {
      const since = useCustomRange ? phStartOfDayIso(customFrom) : sinceDate(period);
      const until = useCustomRange ? untilDate(customTo) : undefined;
      const res = await invokeFn<Record<string, unknown[]>>("pos-data", {
        workspace_id: activeWorkspaceId,
        resource: "reports-channel-breakdown",
        params: { since, ...(until ? { until } : {}) },
      });
      offline = applySection(res, setChannelRes);
    } catch { /* silent */ }
    setSectionsLoaded((f) => ({ ...f, channel: true }));
    return offline;
  }, [activeWorkspaceId, period, useCustomRange, customFrom, customTo]);

  // reports-product-ranking drives Top Products/Category and is filtered by
  // category server-side, so it depends on catFilters (not ch/payFilters).
  const fetchItemsSection = useCallback(async () => {
    if (!activeWorkspaceId) return false;
    let offline = false;
    try {
      const since = useCustomRange ? phStartOfDayIso(customFrom) : sinceDate(period);
      const until = useCustomRange ? untilDate(customTo) : undefined;
      const res = await invokeFn<Record<string, unknown[]>>("pos-data", {
        workspace_id: activeWorkspaceId,
        resource: "reports-product-ranking",
        params: buildItemsParams(since, catFilters, until),
      });
      offline = applySection(res, setItemsRes);
    } catch { /* silent */ }
    setSectionsLoaded((f) => ({ ...f, items: true }));
    return offline;
  }, [activeWorkspaceId, period, catFilters, useCustomRange, customFrom, customTo]);

  // reports-payment-breakdown is filtered by payment method server-side, so
  // it depends on payFilters (not ch/catFilters).
  const fetchPaySection = useCallback(async () => {
    if (!activeWorkspaceId) return false;
    let offline = false;
    try {
      const since = useCustomRange ? phStartOfDayIso(customFrom) : sinceDate(period);
      const until = useCustomRange ? untilDate(customTo) : undefined;
      const res = await invokeFn<Record<string, unknown[]>>("pos-data", {
        workspace_id: activeWorkspaceId,
        resource: "reports-payment-breakdown",
        params: { since, ...(until ? { until } : {}), ...(payFilters.length > 0 ? { payment_methods: payFilters } : {}) },
      });
      offline = applySection(res, setPayRes);
    } catch { /* silent */ }
    setSectionsLoaded((f) => ({ ...f, pay: true }));
    return offline;
  }, [activeWorkspaceId, period, payFilters, useCustomRange, customFrom, customTo]);

  // reports-refund-total is not filtered by any of the dropdowns — it only
  // depends on the selected period/custom range, same as channel-breakdown.
  const fetchRefundSection = useCallback(async () => {
    if (!activeWorkspaceId) return false;
    let offline = false;
    try {
      const since = useCustomRange ? phStartOfDayIso(customFrom) : sinceDate(period);
      const until = useCustomRange ? untilDate(customTo) : undefined;
      const res = await invokeFn<Record<string, unknown[]>>("pos-data", {
        workspace_id: activeWorkspaceId,
        resource: "reports-refund-total",
        params: { since, ...(until ? { until } : {}) },
      });
      offline = applySection(res, setRefundRes);
    } catch { /* silent */ }
    setSectionsLoaded((f) => ({ ...f, refund: true }));
    return offline;
  }, [activeWorkspaceId, period, useCustomRange, customFrom, customTo]);

  // Each effect only re-fires for the filters that actually feed its resource —
  // e.g. toggling a category filter refetches product-ranking only, not
  // channel/payment breakdowns.
  useEffect(() => { fetchOrdersSection(); }, [fetchOrdersSection]);
  useEffect(() => { fetchChannelSection(); }, [fetchChannelSection]);
  useEffect(() => { fetchItemsSection(); }, [fetchItemsSection]);
  useEffect(() => { fetchPaySection(); }, [fetchPaySection]);
  useEffect(() => { fetchRefundSection(); }, [fetchRefundSection]);

  // Full-screen loading spinner only gates the very first load; subsequent
  // filter-triggered section refetches update in place.
  useEffect(() => {
    if (sectionsLoaded.orders && sectionsLoaded.channel && sectionsLoaded.items && sectionsLoaded.pay && sectionsLoaded.refund) {
      setLoading(false);
    }
  }, [sectionsLoaded]);

  // Manual "Refresh" button — explicitly re-fetches every section at once.
  const refreshAll = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setRefreshing(true);
    const results = await Promise.all([
      fetchOrdersSection(), fetchChannelSection(), fetchItemsSection(), fetchPaySection(), fetchRefundSection(),
    ]);
    setRefreshing(false);
    // Explicit user-initiated action — worth a toast when it silently did
    // nothing, unlike the mount/filter-triggered fetches above (which stay
    // quiet so switching a filter offline doesn't spam an error every time).
    if (results.some(Boolean)) {
      showToast({ title: "Couldn't refresh", message: "No connection — showing the last synced numbers.", type: "error" });
    }
  }, [activeWorkspaceId, fetchOrdersSection, fetchChannelSection, fetchItemsSection, fetchPaySection, fetchRefundSection, showToast]);

  // Derived date range used by extended tabs
  const { fromDate, toDate } = useMemo(
    () => periodDates(period, customFrom, customTo, useCustomRange),
    [period, customFrom, customTo, useCustomRange],
  );

  function resetFilters() { setChFilters([]); setPayFilters([]); setCatFilters([]); }

  return {
    period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo,
    chFilters, setChFilters, payFilters, setPayFilters, catFilters, setCatFilters,
    data, loading, refreshing, refreshAll, resetFilters,
    useCustom: useCustomRange, fromDate, toDate,
  };
}

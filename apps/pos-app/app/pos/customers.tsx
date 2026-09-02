/**
 * Customers — read-only CRM view (matches web's Customers page, which is also
 * read-only: customer records are created implicitly by orders/bookings, not
 * managed directly here or on web).
 */
import {
  View, Text, Pressable, TextInput, FlatList,
  StyleSheet, ActivityIndicator, Platform,
} from "react-native";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { invokeFn } from "../../services/supabase";
import { useAuth } from "../../features/auth/AuthContext";
import { R } from "../../features/theme/tokens";
import { useTheme } from "../../features/theme/ThemeContext";
import { PAGE_SIZES } from "../../features/constants";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { NAV_BAR_CLEARANCE } from "../../features/ui/safeAreaPadding";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
const peso = (n: number) => `₱${Number(n).toFixed(2)}`;

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  total_orders: number;
  total_spend: number;
  last_order_at: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export default function CustomersScreen() {
  const { activeWorkspaceId } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]     = useState(true);
  const [search, setSearch]       = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const pageRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(async (pageNum: number) => {
    if (!activeWorkspaceId) return;
    const isFirst = pageNum === 0;
    if (isFirst) setLoading(true); else setLoadingMore(true);
    const from = pageNum * PAGE_SIZES.customersList, to = from + PAGE_SIZES.customersList - 1;
    const params: Record<string, unknown> = { from, to };
    if (debouncedSearch) params.search = debouncedSearch;
    const { data } = await invokeFn<{ "customers-list": Customer[] }>("pos-data", {
      workspace_id: activeWorkspaceId,
      resource: "customers-list",
      params,
    });
    const rows = data?.["customers-list"] ?? [];
    setCustomers((prev) => (isFirst ? rows : [...prev, ...rows]));
    setHasMore(rows.length === PAGE_SIZES.customersList);
    pageRef.current = pageNum;
    if (isFirst) setLoading(false); else setLoadingMore(false);
  }, [activeWorkspaceId, debouncedSearch]);

  useEffect(() => { fetchPage(0); }, [fetchPage]);

  function loadMore() {
    if (loadingMore || !hasMore || loading) return;
    fetchPage(pageRef.current + 1);
  }

  const totalSpend = customers.reduce((sum, c) => sum + c.total_spend, 0);

  return (
    <View style={s.root}>
      <PosScreenHeader title="Customers"
        right={<Text style={s.count}>{customers.length} loaded</Text>} />

      <View style={s.summaryStrip}>
        <View style={s.summaryChip}>
          <Text style={s.summaryVal}>{customers.length}</Text>
          <Text style={s.summaryLbl}>Customers</Text>
        </View>
        <View style={s.summaryChip}>
          <Text style={[s.summaryVal, { color: C.amber }]}>{peso(totalSpend)}</Text>
          <Text style={s.summaryLbl}>Lifetime Spend</Text>
        </View>
      </View>

      <View style={s.toolbar}>
        <View style={s.searchWrap}>
          <Text style={s.searchIcon}>⌕</Text>
          <TextInput
            style={s.searchInput}
            placeholder="Search name or phone…"
            placeholderTextColor={C.ink4}
            value={search}
            onChangeText={setSearch}
          />
          {search ? <Pressable onPress={() => setSearch("")}><Text style={s.clearX}>✕</Text></Pressable> : null}
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.amber} /></View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(c) => c.id}
          contentContainerStyle={s.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          renderItem={({ item: c }) => (
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{c.name || "Unnamed"}</Text>
                <View style={s.metaRow}>
                  {!!c.phone && (
                    <View style={s.metaItem}>
                      <Feather name="phone" size={11} color={C.ink3} />
                      <Text style={s.meta}>{c.phone}</Text>
                    </View>
                  )}
                  {!!c.email && (
                    <View style={s.metaItem}>
                      <Feather name="mail" size={11} color={C.ink3} />
                      <Text style={s.meta}>{c.email}</Text>
                    </View>
                  )}
                </View>
                <Text style={s.lastOrder}>Last order {fmtDate(c.last_order_at)}</Text>
              </View>
              <View style={s.statsWrap}>
                <Text style={s.spend}>{peso(c.total_spend)}</Text>
                <Text style={s.orderCount}>{c.total_orders} order{c.total_orders === 1 ? "" : "s"}</Text>
              </View>
            </View>
          )}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={C.amber} /> : null}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={s.empty}>No customers found</Text>
              <Text style={s.emptySub}>Customer records are created automatically from orders and bookings</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  count:  { color: C.ink4, fontSize: 12, fontFamily: MONO },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 60, paddingHorizontal: 30 },
  empty:  { color: C.ink4, fontSize: 13 },
  emptySub: { color: C.ink4, fontSize: 11, textAlign: "center" },
  list:   { padding: 10, paddingBottom: 100 },

  summaryStrip: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: 10, backgroundColor: C.bg2 },
  summaryChip:  { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  summaryVal:   { color: C.ink, fontSize: 18, fontWeight: "700", fontFamily: MONO },
  summaryLbl:   { color: C.ink3, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 2 },

  toolbar:     { backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.lineSoft, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 },
  searchWrap:  { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10 },
  searchIcon:  { color: C.ink3, fontSize: 16, marginRight: 6 },
  searchInput: { flex: 1, paddingVertical: 9, color: C.ink, fontSize: 14 },
  clearX:      { color: C.ink4, paddingHorizontal: 6 },

  row:        { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, marginBottom: 8, padding: 14, gap: 12 },
  name:       { color: C.ink, fontSize: 15, fontWeight: "600" },
  metaRow:    { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  metaItem:   { flexDirection: "row", alignItems: "center", gap: 4 },
  meta:       { color: C.ink3, fontSize: 12 },
  lastOrder:  { color: C.ink4, fontSize: 10, fontFamily: MONO, marginTop: 4 },
  statsWrap:  { alignItems: "flex-end" },
  spend:      { color: C.amber, fontSize: 14, fontWeight: "700", fontFamily: MONO },
  orderCount: { color: C.ink4, fontSize: 10, marginTop: 2 },
});

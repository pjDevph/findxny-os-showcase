/**
 * Z-Reports — browsable history of past end-of-day closes. Generating a NEW
 * Z-report still happens on the Shift screen at close-out (pos-zreport-generate);
 * this screen reads the persisted z_reports rows those closes create.
 */
import {
  View, Text, Pressable, FlatList,
  StyleSheet, Modal, ActivityIndicator, Platform, ScrollView,
} from "react-native";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { invokeFn } from "../../services/supabase";
import { useAuth } from "../../features/auth/AuthContext";
import { R } from "../../features/theme/tokens";
import { useTheme } from "../../features/theme/ThemeContext";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { useToast } from "../../features/ui/ToastProvider";
import { NAV_BAR_CLEARANCE } from "../../features/ui/safeAreaPadding";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
const peso = (n: number) => `₱${Number(n).toFixed(2)}`;

interface PaymentBreakdown { cash: number; gcash: number; maya: number; card: number; qrph: number; other: number; }

interface ZReport {
  id: string;
  branch_id: string;
  branches: { name: string } | null;
  report_no: number;
  report_date: string;
  gross_sales: number;
  discount_amount: number;
  net_sales: number;
  vatable_sales: number;
  vat_amount: number;
  vat_exempt_sales: number;
  zero_rated_sales: number;
  void_count: number;
  void_amount: number;
  refund_count: number;
  refund_amount: number;
  payment_breakdown: PaymentBreakdown;
  order_count: number;
  cancelled_count: number;
  first_receipt_no: string | null;
  last_receipt_no: string | null;
  opening_float: number;
  cash_in: number;
  cash_out: number;
  expected_cash: number;
  cashier_name: string | null;
  created_at: string;
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function DetailRow({ k, v, s, C }: { k: string; v: string; s: ReturnType<typeof makeStyles>; C: ReturnType<typeof useTheme>["C"] }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailK}>{k}</Text>
      <Text style={s.detailV}>{v}</Text>
    </View>
  );
}

export default function ZReportsScreen() {
  const { activeWorkspaceId } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [reports, setReports] = useState<ZReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail]   = useState<ZReport | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    const { data, error } = await invokeFn<{ "zreports-list": ZReport[] }>("pos-data", {
      workspace_id: activeWorkspaceId, resource: "zreports-list", params: {},
    });
    if (error) showToast({ title: "Error", message: error.message, type: "error" });
    setReports(data?.["zreports-list"] ?? []);
    setLoading(false);
  }, [activeWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  return (
    <View style={s.root}>
      <PosScreenHeader title="Z Reports"
        right={<Text style={s.count}>{reports.length} on record</Text>} />

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.amber} /></View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(r) => r.id}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + NAV_BAR_CLEARANCE }]}
          renderItem={({ item: r }) => (
            <Pressable style={s.row} onPress={() => setDetail(r)}>
              <View style={{ flex: 1 }}>
                <View style={s.nameRow}>
                  <Text style={s.zNo}>Z-{String(r.report_no).padStart(4, "0")}</Text>
                  <Text style={s.date}>{fmtDate(r.report_date)}</Text>
                </View>
                <Text style={s.meta}>{r.branches?.name ?? "—"} · {r.cashier_name ?? "—"} · {r.order_count} orders</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={s.netSales}>{peso(r.net_sales)}</Text>
                <Text style={s.metaSmall}>net sales</Text>
              </View>
              <Feather name="chevron-right" size={16} color={C.ink4} style={{ marginLeft: 8 }} />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={s.empty}>No Z-reports yet</Text>
              <Text style={s.emptySub}>Generate one from the Shift screen when closing out a day</Text>
            </View>
          }
        />
      )}

      <Modal visible={!!detail} animationType="slide" transparent onRequestClose={() => setDetail(null)}>
        <Pressable style={s.modalBd} onPress={() => setDetail(null)}>
          <Pressable style={s.sheetWrap} onPress={() => {}}>
            {detail && (
              <>
                <View style={s.sheetHeader}>
                  <Text style={s.sheetTitle}>Z-{String(detail.report_no).padStart(4, "0")} · {fmtDate(detail.report_date)}</Text>
                  <Pressable onPress={() => setDetail(null)} hitSlop={8}>
                    <Feather name="x" size={20} color={C.ink3} />
                  </Pressable>
                </View>
                <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={[s.sheetContent, { paddingBottom: 40 + insets.bottom }]}>
                  <Text style={s.sectionHead}>SALES SUMMARY</Text>
                  <DetailRow s={s} C={C} k="Gross Sales" v={peso(detail.gross_sales)} />
                  <DetailRow s={s} C={C} k="Discounts" v={peso(detail.discount_amount)} />
                  <DetailRow s={s} C={C} k="Net Sales" v={peso(detail.net_sales)} />

                  <Text style={s.sectionHead}>VAT BREAKDOWN</Text>
                  <DetailRow s={s} C={C} k="Vatable Sales" v={peso(detail.vatable_sales)} />
                  <DetailRow s={s} C={C} k="VAT Amount" v={peso(detail.vat_amount)} />
                  <DetailRow s={s} C={C} k="VAT Exempt" v={peso(detail.vat_exempt_sales)} />
                  <DetailRow s={s} C={C} k="Zero Rated" v={peso(detail.zero_rated_sales)} />

                  <Text style={s.sectionHead}>PAYMENT METHODS</Text>
                  {Object.entries(detail.payment_breakdown ?? {}).map(([k, v]) => (
                    <DetailRow key={k} s={s} C={C} k={k.toUpperCase()} v={peso(Number(v))} />
                  ))}

                  <Text style={s.sectionHead}>VOIDS & REFUNDS</Text>
                  <DetailRow s={s} C={C} k="Voids" v={`${detail.void_count} / ${peso(detail.void_amount)}`} />
                  <DetailRow s={s} C={C} k="Refunds" v={`${detail.refund_count} / ${peso(detail.refund_amount)}`} />
                  <DetailRow s={s} C={C} k="Cancelled Orders" v={String(detail.cancelled_count)} />

                  <Text style={s.sectionHead}>CASH DRAWER</Text>
                  <DetailRow s={s} C={C} k="Opening Float" v={peso(detail.opening_float)} />
                  <DetailRow s={s} C={C} k="Cash In" v={peso(detail.cash_in)} />
                  <DetailRow s={s} C={C} k="Cash Out" v={peso(detail.cash_out)} />
                  <DetailRow s={s} C={C} k="Expected Cash" v={peso(detail.expected_cash)} />

                  <Text style={s.sectionHead}>RECEIPT RANGE</Text>
                  <DetailRow s={s} C={C} k="First Receipt" v={detail.first_receipt_no ?? "—"} />
                  <DetailRow s={s} C={C} k="Last Receipt" v={detail.last_receipt_no ?? "—"} />
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  count:  { color: C.ink4, fontSize: 12, fontFamily: MONO },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 60 },
  empty:  { color: C.ink4, fontSize: 13 },
  emptySub: { color: C.ink4, fontSize: 11 },
  list:   { padding: 10, paddingBottom: 100 },

  row:        { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, marginBottom: 8, padding: 14, gap: 8 },
  nameRow:    { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 },
  zNo:        { color: C.ink, fontSize: 14, fontWeight: "700", fontFamily: MONO },
  date:       { color: C.ink3, fontSize: 12 },
  meta:       { color: C.ink3, fontSize: 12 },
  metaSmall:  { color: C.ink4, fontSize: 9, textTransform: "uppercase", marginTop: 2 },
  netSales:   { color: C.amber, fontSize: 15, fontWeight: "700", fontFamily: MONO },

  modalBd:      { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheetWrap:    { backgroundColor: C.bg2, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: "85%", overflow: "hidden" },
  sheetHeader:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: C.line },
  sheetTitle:   { color: C.ink, fontSize: 16, fontWeight: "700", fontFamily: MONO },
  sheetContent: { padding: 20, paddingBottom: 40 },
  sectionHead:  { color: C.amber, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginTop: 16, marginBottom: 6, fontFamily: MONO },
  detailRow:    { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  detailK:      { color: C.ink3, fontSize: 13 },
  detailV:      { color: C.ink, fontSize: 13, fontWeight: "600", fontFamily: MONO },
});

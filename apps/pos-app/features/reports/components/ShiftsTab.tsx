import { View, Text, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { MONO } from "../../theme/mono";
import { CardHead } from "../CardHead";
import { KpiCard } from "../KpiCard";
import { TblHdr } from "../TblHdr";
import { fmtTime, peso } from "../reportsHelpers";
import type { makeStyles } from "../reportsScreenStyles";
import type { ShiftCashierSummaryRow, ShiftHistoryRow, ShortageDayRow } from "../types";

interface Props {
  readonly shiftHistory: ShiftHistoryRow[] | null;
  readonly shiftSummary: ShiftCashierSummaryRow[] | null;
  readonly shortageByDay: ShortageDayRow[] | null;
  readonly shiftHistoryLoading: boolean;
  readonly exportingShifts: boolean;
  readonly onExport: () => void;
  readonly s: ReturnType<typeof makeStyles>;
}

export function ShiftsTab({ shiftHistory, shiftSummary, shortageByDay, shiftHistoryLoading, exportingShifts, onExport, s }: Props) {
  const { C } = useTheme();
  const shifts = shiftHistory ?? [];
  const summary = shiftSummary ?? [];
  const days = shortageByDay ?? [];
  const totalShortage = summary.reduce((sum, r) => sum + r.shortageTotal, 0);
  const totalOverage = summary.reduce((sum, r) => sum + r.overageTotal, 0);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 12 }} showsVerticalScrollIndicator={false}>
      {shiftHistoryLoading ? (
        <View style={s.center}><ActivityIndicator color={C.amber} size="large" /></View>
      ) : (
        <>
          <View style={s.kpiRow}>
            <KpiCard flex={1} icon="users" label="Cashiers" value={String(summary.length)} color={C.info} />
            <KpiCard flex={1} icon="clock" label="Shifts" value={String(shifts.length)} color={C.info} />
            <KpiCard flex={1} icon="trending-down" label="Total Shortage" value={peso(totalShortage)} color={C.bad} />
            <KpiCard flex={1} icon="trending-up" label="Total Overage" value={peso(totalOverage)} color={C.good} />
          </View>

          <View style={s.card}>
            <CardHead icon="user-check" title="Quick Summary by Cashier" />
            <TblHdr cols={[
              { label: "Cashier", style: { flex: 1 } },
              { label: "Shifts", style: { width: 60, textAlign: "right" as const } },
              { label: "Total Sales", style: { width: 110, textAlign: "right" as const } },
              { label: "Shortage", style: { width: 90, textAlign: "right" as const } },
              { label: "Overage", style: { width: 90, textAlign: "right" as const } },
            ]} />
            {summary.map((r, i) => (
              <View key={`${r.cashierName}-${i}`} style={[s.prodRow, i % 2 === 1 && s.rowAlt]}>
                <Text style={{ flex: 1, color: C.ink, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>{r.cashierName}</Text>
                <Text style={{ width: 60, textAlign: "right", color: C.ink3, fontSize: 13, fontFamily: MONO }}>{r.shiftCount}</Text>
                <Text style={{ width: 110, textAlign: "right", color: C.amber, fontSize: 13, fontWeight: "700", fontFamily: MONO }}>{peso(r.totalSales)}</Text>
                <Text style={{ width: 90, textAlign: "right", color: r.shortageTotal > 0 ? C.bad : C.ink4, fontSize: 13, fontFamily: MONO }}>
                  {r.shortageTotal > 0 ? peso(r.shortageTotal) : "—"}
                </Text>
                <Text style={{ width: 90, textAlign: "right", color: r.overageTotal > 0 ? C.good : C.ink4, fontSize: 13, fontFamily: MONO }}>
                  {r.overageTotal > 0 ? peso(r.overageTotal) : "—"}
                </Text>
              </View>
            ))}
            {summary.length === 0 && (
              <View style={s.emptySection}>
                <Feather name="user-check" size={32} color={C.ink4} />
                <Text style={s.empty}>No shifts for this period</Text>
              </View>
            )}
          </View>

          {days.length > 0 && (
            <View style={s.card}>
              <CardHead icon="calendar" title="Shortage / Overage by Day" />
              <TblHdr cols={[
                { label: "Date", style: { flex: 1 } },
                { label: "Shortage", style: { width: 100, textAlign: "right" as const } },
                { label: "Overage", style: { width: 100, textAlign: "right" as const } },
                { label: "Net", style: { width: 100, textAlign: "right" as const } },
              ]} />
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 240 }}>
                {days.map((d, i) => (
                  <View key={`${d.date}-${i}`} style={[s.prodRow, i % 2 === 1 && s.rowAlt]}>
                    <Text style={{ flex: 1, color: C.ink3, fontSize: 13, fontFamily: MONO }}>{d.date}</Text>
                    <Text style={{ width: 100, textAlign: "right", color: d.shortageTotal > 0 ? C.bad : C.ink4, fontSize: 13, fontFamily: MONO }}>
                      {d.shortageTotal > 0 ? peso(d.shortageTotal) : "—"}
                    </Text>
                    <Text style={{ width: 100, textAlign: "right", color: d.overageTotal > 0 ? C.good : C.ink4, fontSize: 13, fontFamily: MONO }}>
                      {d.overageTotal > 0 ? peso(d.overageTotal) : "—"}
                    </Text>
                    <Text style={{ width: 100, textAlign: "right", color: d.netVariance < 0 ? C.bad : C.good, fontSize: 13, fontWeight: "700", fontFamily: MONO }}>
                      {peso(d.netVariance)}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={s.card}>
            <CardHead icon="list" title="Full Shift History">
              <Pressable style={[s.hdrBtn, exportingShifts && { opacity: 0.5 }]} onPress={onExport} disabled={exportingShifts}>
                <Feather name="download" size={12} color={C.ink3} />
                <Text style={s.hdrBtnTxt}>{exportingShifts ? "Exporting…" : "Export CSV"}</Text>
              </Pressable>
            </CardHead>
            <TblHdr cols={[
              { label: "Cashier", style: { flex: 1 } },
              { label: "Opened", style: { width: 90 } },
              { label: "Register", style: { width: 90 } },
              { label: "Total Sales", style: { width: 100, textAlign: "right" as const } },
              { label: "Variance", style: { width: 90, textAlign: "right" as const } },
            ]} />
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {shifts.map((r, i) => (
                <View key={r.id} style={[s.prodRow, i % 2 === 1 && s.rowAlt]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.ink, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>{r.cashierName}</Text>
                    <Text style={{ color: C.ink4, fontSize: 11 }} numberOfLines={1}>
                      {r.status === "open" ? "In progress" : r.reconciledAt ? "Reconciled" : "Pending reconciliation"}
                    </Text>
                  </View>
                  <Text style={{ width: 90, color: C.ink3, fontSize: 12, fontFamily: MONO }}>{fmtTime(r.openedAt)}</Text>
                  <Text style={{ width: 90, color: C.ink3, fontSize: 12 }} numberOfLines={1}>{r.registerName ?? "—"}</Text>
                  <Text style={{ width: 100, textAlign: "right", color: C.amber, fontSize: 13, fontWeight: "700", fontFamily: MONO }}>{peso(r.totalSales)}</Text>
                  <Text style={{ width: 90, textAlign: "right", color: r.variance == null ? C.ink4 : r.variance < 0 ? C.bad : C.good, fontSize: 13, fontFamily: MONO }}>
                    {r.variance == null ? "—" : peso(r.variance)}
                  </Text>
                </View>
              ))}
              {shifts.length === 0 && (
                <View style={s.emptySection}>
                  <Feather name="clock" size={32} color={C.ink4} />
                  <Text style={s.empty}>No shifts for this period</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </>
      )}
    </ScrollView>
  );
}

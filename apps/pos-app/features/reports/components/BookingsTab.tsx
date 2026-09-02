import { View, Text, ActivityIndicator, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { MONO } from "../../theme/mono";
import { CardHead } from "../CardHead";
import { KpiCard } from "../KpiCard";
import { TblHdr } from "../TblHdr";
import { peso } from "../reportsHelpers";
import type { makeStyles } from "../reportsScreenStyles";
import type { BookingStats } from "../types";

interface Props {
  readonly bookingStats: BookingStats | null;
  readonly bookingLoading: boolean;
  readonly bottomPad: number;
  readonly s: ReturnType<typeof makeStyles>;
}

export function BookingsTab({ bookingStats, bookingLoading, bottomPad, s }: Props) {
  const { C } = useTheme();
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: bottomPad, gap: 12 }} showsVerticalScrollIndicator={false}>
      {bookingLoading ? (
        <View style={s.center}><ActivityIndicator color={C.amber} size="large" /></View>
      ) : (
        <>
          <View style={s.kpiRow}>
            <KpiCard flex={1} icon="calendar" label="Total Bookings" value={String(bookingStats?.totalBookings ?? 0)} color={C.info} />
            <KpiCard flex={1} icon="dollar-sign" label="Revenue" value={peso(bookingStats?.revenue ?? 0)} color={C.good} />
            <KpiCard flex={1} icon="x-circle" label="Cancellation Rate" value={`${(bookingStats?.cancellationRate ?? 0).toFixed(1)}%`} color={C.warn} />
            <KpiCard flex={1} icon="user-x" label="No-show Rate" value={`${(bookingStats?.noShowRate ?? 0).toFixed(1)}%`} color={C.bad} />
          </View>
          {(bookingStats?.byResource ?? []).length > 0 && (
            <View style={s.card}>
              <CardHead icon="map-pin" title="By Resource" />
              <TblHdr cols={[
                { label: "Resource", style: { flex: 1 } },
                { label: "Type", style: { width: 90 } },
                { label: "Bookings", style: { width: 80, textAlign: "right" as const } },
                { label: "Revenue", style: { width: 120, textAlign: "right" as const } },
              ]} />
              <ScrollView showsVerticalScrollIndicator={false}>
                {(bookingStats?.byResource ?? []).map((r, i) => (
                  <View key={`${r.name}-${i}`} style={[s.prodRow, i % 2 === 1 && s.rowAlt]}>
                    <Text style={{ flex: 1, color: C.ink, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>{r.name}</Text>
                    <Text style={{ width: 90, color: C.ink3, fontSize: 12, textTransform: "capitalize" }}>{r.type}</Text>
                    <Text style={{ width: 80, textAlign: "right", color: C.info, fontSize: 13, fontFamily: MONO }}>{r.bookings}</Text>
                    <Text style={{ width: 120, textAlign: "right", color: C.amber, fontSize: 13, fontWeight: "700", fontFamily: MONO }}>{peso(r.revenue)}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
          {(bookingStats?.byDay ?? []).length > 0 && (
            <View style={s.card}>
              <CardHead icon="bar-chart-2" title="Bookings by Day" />
              <TblHdr cols={[
                { label: "Date", style: { flex: 1 } },
                { label: "Bookings", style: { width: 90, textAlign: "right" as const } },
              ]} />
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 260 }}>
                {(bookingStats?.byDay ?? []).map((d, i) => (
                  <View key={`${d.date}-${i}`} style={[s.prodRow, i % 2 === 1 && s.rowAlt]}>
                    <Text style={{ flex: 1, color: C.ink3, fontSize: 13, fontFamily: MONO }}>{d.date}</Text>
                    <Text style={{ width: 90, textAlign: "right", color: C.info, fontSize: 13, fontWeight: "700", fontFamily: MONO }}>{d.bookings}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
          {!bookingStats && !bookingLoading && (
            <View style={s.emptySection}>
              <Feather name="calendar" size={32} color={C.ink4} />
              <Text style={s.empty}>No booking data for this period</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

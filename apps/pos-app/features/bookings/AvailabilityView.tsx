import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { RoomAvailCard } from "./RoomAvailCard";
import type { StyleMap, ThemeColors } from "./bookingsScreenStyles";
import type { Booking, Resource } from "./types";

interface Props {
  readonly resources: Resource[];
  readonly bookings: Booking[];
  readonly checkIn: string;
  readonly checkOut: string;
  readonly onCheckInChange: (d: string) => void;
  readonly onCheckOutChange: (d: string) => void;
  readonly onOpenDatePicker: (target: "availCI" | "availCO") => void;
  readonly loading: boolean;
  readonly s: StyleMap;
  readonly C: ThemeColors;
  readonly onViewCalendar: (r: Resource) => void;
  readonly onBook: (r: Resource) => void;
  readonly onViewBooking: (b: Booking) => void;
}

export function AvailabilityView({
  resources, bookings, checkIn, checkOut, onCheckInChange, onCheckOutChange,
  onOpenDatePicker, loading, s, C,
  onViewCalendar, onBook, onViewBooking,
}: Props) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrowStr = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  function shiftDates(delta: number) {
    const ci = new Date(checkIn + "T12:00:00");
    ci.setDate(ci.getDate() + delta);
    const co = new Date(checkOut + "T12:00:00");
    co.setDate(co.getDate() + delta);
    onCheckInChange(ci.toISOString().slice(0, 10));
    onCheckOutChange(co.toISOString().slice(0, 10));
  }

  const nights = Math.max(1, Math.round((new Date(checkOut + "T12:00:00").getTime() - new Date(checkIn + "T12:00:00").getTime()) / 86_400_000));
  const ciDisplay = new Date(checkIn + "T12:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  const coDisplay = new Date(checkOut + "T12:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" });

  function getRoomStatus(resourceId: string): {
    kind: "available" | "hold" | "confirmed" | "checked_in";
    booking: Booking | null;
    checkoutAt: string | null;
  } {
    const rangeStart = new Date(checkIn + "T00:00:00");
    const rangeEnd = new Date(checkOut + "T23:59:59");
    const effectiveStart = checkIn === todayStr ? new Date() : rangeStart;
    const overlaps = bookings.filter(b =>
      b.resource_id === resourceId &&
      b.status !== "cancelled" &&
      new Date(b.start_time) < rangeEnd &&
      new Date(b.end_time) > effectiveStart
    );
    if (!overlaps.length) return { kind: "available", booking: null, checkoutAt: null };
    const bk = overlaps.find(b => b.status === "confirmed" && b.checked_in_at)
      || overlaps.find(b => b.status === "confirmed")
      || overlaps[0];
    const kind: "hold" | "confirmed" | "checked_in" =
      bk.checked_in_at ? "checked_in"
      : bk.status === "confirmed" ? "confirmed"
      : "hold";
    const last = overlaps.reduce(
      (m, b) => (new Date(b.end_time) > new Date(m) ? b.end_time : m),
      overlaps[0].end_time,
    );
    return { kind, booking: bk, checkoutAt: last };
  }

  const isPastRange = checkOut < todayStr;

  return (
    <>
      <View style={s.stayDatesLabelRow}>
        <Text style={s.stayDatesLabel}>STAY DATES</Text>
      </View>

      <View style={s.stayDatesRow}>
        <Pressable style={s.stayDateField} onPress={() => onOpenDatePicker("availCI")}>
          <Text style={s.stayDateFieldLbl}>Check-in: {ciDisplay}</Text>
        </Pressable>
        <Text style={s.stayDatesArrow}>→</Text>
        <Pressable style={s.stayDateField} onPress={() => onOpenDatePicker("availCO")}>
          <Text style={s.stayDateFieldLbl}>Check-out: {coDisplay}</Text>
        </Pressable>
        <Text style={s.stayNightCount}>{nights} night{nights !== 1 ? "s" : ""}</Text>
        <View style={{ flex: 1 }} />
        <Pressable style={[s.dateChip, checkIn === todayStr && s.dateChipActive]}
          onPress={() => { onCheckInChange(todayStr); onCheckOutChange(tomorrowStr); }}>
          <Text style={[s.dateChipTxt, checkIn === todayStr && s.dateChipTxtActive]}>Today</Text>
        </Pressable>
        <Pressable style={[s.dateChip, checkIn === tomorrowStr && s.dateChipActive]}
          onPress={() => {
            const d2 = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
            onCheckInChange(tomorrowStr);
            onCheckOutChange(d2);
          }}>
          <Text style={[s.dateChipTxt, checkIn === tomorrowStr && s.dateChipTxtActive]}>Tomorrow</Text>
        </Pressable>
        <Pressable style={s.stayPickDatesBtn} onPress={() => onOpenDatePicker("availCI")}>
          <Feather name="calendar" size={13} color={C.amber} />
          <Text style={s.stayPickDatesBtnTxt}>Pick Dates</Text>
        </Pressable>
        <Pressable onPress={() => shiftDates(-1)} style={s.dateArrowBtn} hitSlop={8}>
          <Feather name="chevron-left" size={20} color={C.ink2} />
        </Pressable>
        <Pressable onPress={() => shiftDates(1)} style={s.dateArrowBtn} hitSlop={8}>
          <Feather name="chevron-right" size={20} color={C.ink2} />
        </Pressable>
      </View>

      <View style={s.sectionLabelRow}>
        <Text style={s.sectionLabel}>ROOM AVAILABILITY</Text>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.amber} /></View>
      ) : resources.length === 0 ? (
        <View style={s.center}>
          <Feather name="home" size={40} color={C.ink4} />
          <Text style={s.emptyTxt}>No rooms configured</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={s.availGrid}>
            {resources.map(r => {
              const { kind, booking, checkoutAt } = getRoomStatus(r.id);
              return (
                <RoomAvailCard
                  key={r.id}
                  resource={r}
                  kind={kind}
                  booking={booking}
                  checkoutAt={checkoutAt}
                  isPastDate={isPastRange}
                  s={s} C={C}
                  onViewCalendar={() => onViewCalendar(r)}
                  onBook={() => onBook(r)}
                  onViewBooking={booking ? () => onViewBooking(booking) : undefined}
                />
              );
            })}
          </View>
          <Text style={s.availHint}>Tap a room card to open the monthly room calendar. Use Pick to step through dates.</Text>
        </ScrollView>
      )}
    </>
  );
}

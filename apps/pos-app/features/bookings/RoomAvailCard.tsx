import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { peso } from "../order/format";
import { fmtDT, parseNotes } from "./bookingsHelpers";
import type { StyleMap, ThemeColors } from "./bookingsScreenStyles";
import type { Booking, Resource } from "./types";

interface Props {
  readonly resource: Resource;
  readonly kind: "available" | "hold" | "confirmed" | "checked_in";
  readonly booking: Booking | null;
  readonly checkoutAt: string | null;
  readonly isPastDate: boolean;
  readonly s: StyleMap;
  readonly C: ThemeColors;
  readonly onViewCalendar: () => void;
  readonly onBook: () => void;
  readonly onViewBooking?: () => void;
}

export function RoomAvailCard({
  resource, kind, booking, checkoutAt, isPastDate, s, C, onViewCalendar, onBook, onViewBooking,
}: Props) {
  const { guestName } = parseNotes(booking?.notes ?? null);
  const STATUS: Record<string, { label: string; color: string }> = {
    available: { label: "Available", color: C.good },
    hold: { label: "Hold", color: C.warn },
    confirmed: { label: "Reserved", color: C.amber },
    checked_in: { label: "Checked-in", color: C.rust },
  };
  const { label: statusLabel, color: statusColor } = STATUS[kind] ?? { label: kind, color: C.ink4 };

  return (
    <View style={s.availCard}>
      <View style={s.availCardInner}>
        <View style={s.availCardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.availCardName} numberOfLines={2}>{resource.name}</Text>
            <Text style={s.availCardSub}>
              {resource.capacity ? `${resource.capacity} pax · ` : ""}
              {resource.type === "room" && resource.nightly_rate != null
                ? `${peso(resource.nightly_rate)}/night`
                : `${peso(resource.hourly_rate ?? 0)}/hr`}
            </Text>
          </View>
          <View style={[s.availStatusBadge, { borderColor: `${statusColor}66`, backgroundColor: `${statusColor}18` }]}>
            <Text style={[s.availStatusTxt, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        {kind === "available" ? (
          <Text style={s.availDetail}>Available for selected stay</Text>
        ) : booking ? (
          <>
            <Text style={s.availDetail} numberOfLines={2}>
              {guestName ? `Guest: ${guestName} • ` : ""}
              {fmtDT(booking.start_time)} → {fmtDT(booking.end_time)}
            </Text>
            {!!checkoutAt && <Text style={s.availNext} numberOfLines={1}>Next free: {fmtDT(checkoutAt)}</Text>}
          </>
        ) : null}

        <View style={s.availActions}>
          {!!onViewBooking && (
            <Pressable style={[s.availBtnCal, { borderColor: `${C.amber}44` }]} onPress={onViewBooking}>
              <Feather name="eye" size={12} color={C.amber} />
              <Text style={[s.availBtnCalTxt, { color: C.amber }]}>Details</Text>
            </Pressable>
          )}
          <Pressable style={s.availBtnCal} onPress={onViewCalendar}>
            <Feather name="calendar" size={12} color={C.ink3} />
            <Text style={s.availBtnCalTxt}>Calendar</Text>
          </Pressable>
          {kind === "available" && !isPastDate && (
            <Pressable style={s.availBtnBook} onPress={onBook}>
              <Feather name="plus" size={12} color="#000000" />
              <Text style={s.availBtnBookTxt}>Book</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

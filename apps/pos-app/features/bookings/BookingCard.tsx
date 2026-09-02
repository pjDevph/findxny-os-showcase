import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { peso } from "../order/format";
import { bookingRef, fmtDT, fmtExpiry, nightCount, parseNotes } from "./bookingsHelpers";
import type { StyleMap, ThemeColors } from "./bookingsScreenStyles";
import type { Booking } from "./types";

interface Props {
  readonly b: Booking;
  readonly s: StyleMap;
  readonly C: ThemeColors;
  readonly SC: Record<string, string>;
  readonly checkActionLoading: string | null;
  readonly onPress: () => void;
  readonly onConfirm: () => void;
  readonly onCheckIn: () => void;
  readonly onCheckOut: () => void;
  readonly onCancel: () => void;
  readonly onCollectCash: () => void;
  readonly onNoShow: () => void;
  readonly onComplete: () => void;
}

export function BookingCard({
  b, s, C, SC, checkActionLoading,
  onPress, onConfirm, onCheckIn, onCheckOut, onCancel, onCollectCash,
  onNoShow, onComplete,
}: Props) {
  const { guestName, guestPhone, guestEmail, noteText } = parseNotes(b.notes);
  const nights = nightCount(b.start_time, b.end_time);
  const statusColor = SC[b.status] ?? C.ink3;
  const displayStatus = b.status.replace(/_/g, " ").toUpperCase();
  const daysToCheckIn = (new Date(b.start_time).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  const paymentUrgent = b.payment_status !== "paid" && b.status === "confirmed" && b.total > 0 && daysToCheckIn >= 0 && daysToCheckIn <= 2;

  return (
    <Pressable style={[
      s.card,
      b.status === "hold" && { borderColor: `${C.warn}44` },
      (b.status === "cancelled" || b.status === "completed") && { opacity: 0.6 },
    ]} onPress={onPress}>
      <View style={s.cardTop}>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={s.cardRoom}>{b.resource_name ?? "Room"}</Text>
          <Text style={s.cardRef}>{bookingRef(b.id)}</Text>
        </View>
        <View style={[s.badge, { backgroundColor: `${statusColor}22`, borderColor: `${statusColor}44` }]}>
          <Text style={[s.badgeTxt, { color: statusColor }]}>{displayStatus}</Text>
        </View>
      </View>

      {!!guestName && (
        <View style={s.cardGuestRow}>
          <Feather name="user" size={12} color={C.ink4} />
          <Text style={s.cardGuestName}>{guestName}</Text>
          {!!guestPhone && <Text style={s.cardGuestPhone}>{guestPhone}</Text>}
          {!!guestEmail && <Text style={s.cardGuestPhone}>{guestEmail}</Text>}
        </View>
      )}

      <View style={s.cardTimeRow}>
        <Feather name="calendar" size={12} color={C.ink4} />
        <Text style={s.cardTime}>
          {fmtDT(b.start_time)}  →  {fmtDT(b.end_time)}
          {"  ·  "}{nights} night{nights !== 1 ? "s" : ""}
        </Text>
      </View>

      {!!b.checked_in_at && (
        <Text style={[s.cardNotes, { color: C.good }]}>✓ Checked in {fmtDT(b.checked_in_at)}</Text>
      )}

      {!!noteText && <Text style={s.cardNotes}>{noteText}</Text>}

      {b.status === "hold" && b.hold_expires_at && (
        <Text style={[s.expiryTxt, new Date(b.hold_expires_at).getTime() - Date.now() < 3 * 60_000 && s.expiryUrgent]}>
          {fmtExpiry(b.hold_expires_at)}
        </Text>
      )}

      {paymentUrgent && (
        <View style={s.payUrgentBanner}>
          <Feather name="alert-triangle" size={11} color={C.bad} />
          <Text style={s.payUrgentTxt}>
            Full payment required — check-in in {daysToCheckIn < 1 ? "less than 1 day" : `${Math.ceil(daysToCheckIn)} day${Math.ceil(daysToCheckIn) !== 1 ? "s" : ""}`}
          </Text>
        </View>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={s.cardTotal}>{peso(b.total)}</Text>
        {b.total > 0 && b.status !== "cancelled" && b.status !== "completed" && b.payment_status !== "paid" && (
          <View style={[s.payPill, b.payment_status === "partial" && s.payPillPartial]}>
            <Text style={[s.payPillTxt, b.payment_status === "partial" && s.payPillPartialTxt]}>
              {b.payment_status === "partial" ? "PARTIAL" : "UNPAID"}
            </Text>
          </View>
        )}
        {b.total > 0 && b.payment_status === "paid" && b.status !== "cancelled" && (
          <View style={s.payPillPaid}>
            <Text style={s.payPillPaidTxt}>PAID</Text>
          </View>
        )}
      </View>

      <View style={s.cardActions}>
        <Pressable style={s.cardDetailBtn} onPress={(e) => { e.stopPropagation?.(); onPress(); }}>
          <Feather name="info" size={13} color={C.ink3} />
          <Text style={s.cardDetailBtnTxt}>Details</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {b.status === "hold" && (
          <Pressable style={s.cardChipGreen} onPress={(e) => { e.stopPropagation?.(); onConfirm(); }}>
            <Feather name="check-circle" size={13} color="#000000" />
            <Text style={s.cardChipGreenTxt}>Confirm</Text>
          </Pressable>
        )}
        {b.status === "confirmed" && (
          <>
            <Pressable
              style={[s.cardChipGreen, checkActionLoading === b.id && { opacity: 0.5 }]}
              onPress={(e) => { e.stopPropagation?.(); onCheckIn(); }}
              disabled={checkActionLoading === b.id}
            >
              <Feather name="log-in" size={13} color="#000000" />
              <Text style={s.cardChipGreenTxt}>Check In</Text>
            </Pressable>
            <Pressable
              style={[s.cardChipCancel, { borderColor: `${C.warn}44`, backgroundColor: `${C.warn}12` }, checkActionLoading === b.id && { opacity: 0.5 }]}
              onPress={(e) => { e.stopPropagation?.(); onNoShow(); }}
              disabled={checkActionLoading === b.id}
            >
              <Feather name="user-x" size={13} color={C.warn} />
            </Pressable>
          </>
        )}
        {b.status === "checked_in" && (
          <Pressable
            style={[s.cardChipAmber, checkActionLoading === b.id && { opacity: 0.5 }]}
            onPress={(e) => { e.stopPropagation?.(); onCheckOut(); }}
            disabled={checkActionLoading === b.id}
          >
            <Feather name="log-out" size={13} color={C.amber} />
            <Text style={s.cardChipAmberTxt}>Check Out</Text>
          </Pressable>
        )}
        {b.status === "checked_out" && (
          <Pressable
            style={[s.cardChipGreen, checkActionLoading === b.id && { opacity: 0.5 }]}
            onPress={(e) => { e.stopPropagation?.(); onComplete(); }}
            disabled={checkActionLoading === b.id}
          >
            <Feather name="check-square" size={13} color="#000000" />
            <Text style={s.cardChipGreenTxt}>Complete</Text>
          </Pressable>
        )}
        {(b.status === "hold" || b.status === "confirmed") && (
          <Pressable style={s.cardChipCancel} onPress={(e) => { e.stopPropagation?.(); onCancel(); }} hitSlop={8}>
            <Feather name="x" size={14} color={C.bad} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

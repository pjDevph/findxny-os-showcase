import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { peso } from "../order/format";
import { bookingRef, fmtDate, fmtDT, fmtTime, nightCount, parseNotes } from "./bookingsHelpers";
import type { StyleMap, ThemeColors } from "./bookingsScreenStyles";
import type { Booking } from "./types";

interface Props {
  readonly booking: Booking | null;
  readonly s: StyleMap;
  readonly C: ThemeColors;
  readonly SC: Record<string, string>;
  readonly checkActionLoading: string | null;
  readonly onClose: () => void;
  readonly onConfirm: (b: Booking) => void;
  readonly onCheckIn: (b: Booking) => void;
  readonly onCheckOut: (b: Booking) => void;
  readonly onCancel: (b: Booking) => void;
  readonly onCollectCash: (b: Booking) => void;
  readonly onNoShow: (b: Booking) => void;
  readonly onComplete: (b: Booking) => void;
  readonly onRefund: (b: Booking) => void;
  readonly onMarkPaid: (b: Booking) => void;
  readonly onReschedule: (b: Booking) => void;
}

export function DetailModal({
  booking, s, C, SC, checkActionLoading,
  onClose, onConfirm, onCheckIn, onCheckOut, onCancel, onCollectCash,
  onNoShow, onComplete, onRefund, onMarkPaid, onReschedule,
}: Props) {
  if (!booking) return null;
  const b = booking;
  const { guestName, guestPhone, guestEmail, noteText } = parseNotes(b.notes);
  const nights = nightCount(b.start_time, b.end_time);
  const statusColor = SC[b.status] ?? C.ink3;

  return (
    <Modal visible={!!booking} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={s.overlayBd} onPress={onClose}>
        <Pressable style={s.detailSheet} onPress={() => {}}>

          <View style={s.detailHeader}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.detailRoom}>{b.resource_name ?? "Room"}</Text>
              <Text style={s.detailRef}>{bookingRef(b.id)}</Text>
            </View>
            <View style={[s.badge, { backgroundColor: `${statusColor}22`, borderColor: `${statusColor}44` }]}>
              <Text style={[s.badgeTxt, { color: statusColor }]}>
                {b.status.replace(/_/g, " ").toUpperCase()}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={{ marginLeft: 8 }}>
              <Feather name="x" size={20} color={C.ink3} />
            </Pressable>
          </View>

          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
            <View style={s.detailSection}>
              <Text style={s.detailSectionTitle}>GUEST</Text>
              <View style={s.detailRow}>
                <Feather name="user" size={13} color={C.ink4} />
                <Text style={s.detailVal}>{guestName || "—"}</Text>
              </View>
              {!!guestPhone && (
                <View style={s.detailRow}>
                  <Feather name="phone" size={13} color={C.ink4} />
                  <Text style={s.detailVal}>{guestPhone}</Text>
                </View>
              )}
              {!!guestEmail && (
                <View style={s.detailRow}>
                  <Feather name="mail" size={13} color={C.ink4} />
                  <Text style={s.detailVal}>{guestEmail}</Text>
                </View>
              )}
              {!!noteText && (
                <View style={s.detailRow}>
                  <Feather name="message-square" size={13} color={C.ink4} />
                  <Text style={[s.detailVal, { fontStyle: "italic", color: C.ink3 }]}>{noteText}</Text>
                </View>
              )}
            </View>

            <View style={s.detailSection}>
              <Text style={s.detailSectionTitle}>SCHEDULE</Text>
              <View style={s.detailRow}>
                <Feather name="log-in" size={13} color={C.ink4} />
                <View>
                  <Text style={s.detailLabel}>Check-in</Text>
                  <Text style={s.detailVal}>{fmtDate(b.start_time)}  {fmtTime(b.start_time)}</Text>
                </View>
              </View>
              <View style={s.detailRow}>
                <Feather name="log-out" size={13} color={C.ink4} />
                <View>
                  <Text style={s.detailLabel}>Check-out</Text>
                  <Text style={s.detailVal}>{fmtDate(b.end_time)}  {fmtTime(b.end_time)}</Text>
                </View>
              </View>
              <View style={s.detailRow}>
                <Feather name="moon" size={13} color={C.ink4} />
                <Text style={s.detailVal}>{nights} night{nights !== 1 ? "s" : ""}</Text>
              </View>
              {!!b.checked_in_at && (
                <View style={s.detailRow}>
                  <Feather name="check-circle" size={13} color={C.good} />
                  <Text style={[s.detailVal, { color: C.good }]}>Checked in {fmtDT(b.checked_in_at)}</Text>
                </View>
              )}
            </View>

            <View style={s.detailSection}>
              <Text style={s.detailSectionTitle}>PAYMENT</Text>
              <View style={s.detailRow}>
                <Feather name="tag" size={13} color={C.ink4} />
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={s.detailLabel}>Total</Text>
                  <Text style={[s.detailVal, { color: C.amber, fontWeight: "700" }]}>{peso(b.total)}</Text>
                </View>
              </View>
              <View style={s.detailRow}>
                <Feather name="credit-card" size={13} color={C.ink4} />
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={s.detailLabel}>Status</Text>
                  <Text style={[s.detailVal, {
                    color: b.payment_status === "paid" ? C.good :
                           b.payment_status === "partial" ? C.amber :
                           b.total === 0 ? C.ink3 :
                           b.status === "cancelled" ? C.ink3 : C.warn,
                    fontWeight: "600",
                  }]}>
                    {b.total === 0 ? "No charge" :
                     b.status === "cancelled" ? "Voided" :
                     b.payment_status === "paid" ? "Paid" :
                     b.payment_status === "partial" ? "Partial deposit" :
                     "Unpaid"}
                  </Text>
                </View>
              </View>
            </View>

          </ScrollView>

          <View style={s.detailFooter}>
            <Pressable style={s.detailCloseBtn} onPress={onClose}>
              <Text style={s.detailCloseBtnTxt}>Close</Text>
            </Pressable>
            {(b.status === "hold" || b.status === "confirmed") && (
              <Pressable style={s.detailFooterDanger} onPress={() => { onClose(); onCancel(b); }}>
                <Feather name="x" size={14} color={C.bad} />
                <Text style={s.detailFooterDangerTxt}>Cancel</Text>
              </Pressable>
            )}
            {b.status === "hold" && (
              <Pressable style={s.detailFooterPrimary} onPress={() => { onClose(); onConfirm(b); }}>
                <Feather name="check-circle" size={15} color="#000000" />
                <Text style={s.detailFooterPrimaryTxt}>Confirm</Text>
              </Pressable>
            )}
            {b.status === "confirmed" && b.payment_status !== "paid" && b.total > 0 && (
              <Pressable
                style={s.detailFooterAlt}
                onPress={() => { onClose(); onCollectCash(b); }}
              >
                <Feather name="dollar-sign" size={15} color={C.amber} />
                <Text style={s.detailFooterAltTxt}>Collect Cash</Text>
              </Pressable>
            )}
            {(b.status === "hold" || b.status === "confirmed") && b.payment_status !== "paid" && b.total > 0 && (
              <Pressable
                style={[s.detailFooterAlt, checkActionLoading === b.id && { opacity: 0.5 }]}
                onPress={() => { onClose(); onMarkPaid(b); }}
                disabled={checkActionLoading === b.id}
              >
                <Feather name="check" size={15} color={C.good} />
                <Text style={[s.detailFooterAltTxt, { color: C.good }]}>Mark Paid</Text>
              </Pressable>
            )}
            {b.status === "confirmed" && (
              <Pressable style={s.detailFooterAlt} onPress={() => { onClose(); onReschedule(b); }}>
                <Feather name="calendar" size={15} color={C.info} />
                <Text style={[s.detailFooterAltTxt, { color: C.info }]}>Reschedule</Text>
              </Pressable>
            )}
            {b.status === "confirmed" && (
              <>
                <Pressable
                  style={[s.detailFooterPrimary, checkActionLoading === b.id && { opacity: 0.5 }]}
                  onPress={() => { onClose(); onCheckIn(b); }}
                  disabled={checkActionLoading === b.id}
                >
                  <Feather name="log-in" size={15} color="#000000" />
                  <Text style={s.detailFooterPrimaryTxt}>Check In</Text>
                </Pressable>
                <Pressable
                  style={[s.detailFooterDanger, { borderColor: `${C.warn}44`, backgroundColor: `${C.warn}15` }, checkActionLoading === b.id && { opacity: 0.5 }]}
                  onPress={() => { onClose(); onNoShow(b); }}
                  disabled={checkActionLoading === b.id}
                >
                  <Feather name="user-x" size={15} color={C.warn} />
                  <Text style={[s.detailFooterDangerTxt, { color: C.warn }]}>No Show</Text>
                </Pressable>
              </>
            )}
            {b.status === "checked_in" && (
              <Pressable
                style={[s.detailFooterAlt, checkActionLoading === b.id && { opacity: 0.5 }]}
                onPress={() => { onClose(); onCheckOut(b); }}
                disabled={checkActionLoading === b.id}
              >
                <Feather name="log-out" size={15} color={C.amber} />
                <Text style={s.detailFooterAltTxt}>Check Out</Text>
              </Pressable>
            )}
            {b.status === "checked_out" && (
              <Pressable
                style={[s.detailFooterPrimary, checkActionLoading === b.id && { opacity: 0.5 }]}
                onPress={() => { onClose(); onComplete(b); }}
                disabled={checkActionLoading === b.id}
              >
                <Feather name="check-square" size={15} color="#000000" />
                <Text style={s.detailFooterPrimaryTxt}>Complete</Text>
              </Pressable>
            )}
            {b.amount_paid > 0 && b.status !== "hold" && b.status !== "expired" && (
              <Pressable style={s.detailFooterRefund} onPress={() => { onClose(); onRefund(b); }}>
                <Feather name="rotate-ccw" size={14} color={C.ink2} />
                <Text style={s.detailFooterRefundTxt}>Refund</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

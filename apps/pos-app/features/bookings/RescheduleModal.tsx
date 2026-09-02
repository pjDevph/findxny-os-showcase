import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { KeyboardSheet } from "../ui/KeyboardSheet";
import { MONO } from "../theme/mono";
import { sanitizeDateStr, sanitizeTimeStr } from "../utils/inputSanitizers";
import { bookingRef, toISO } from "./bookingsHelpers";
import type { StyleMap, ThemeColors } from "./bookingsScreenStyles";
import type { Booking } from "./types";

interface Props {
  readonly booking: Booking | null;
  readonly s: StyleMap;
  readonly C: ThemeColors;
  readonly onClose: () => void;
  readonly onDone: (booking: Booking, newStartISO: string, newEndISO: string, reason: string) => void;
}

export function RescheduleModal({ booking, s, C, onClose, onDone }: Props) {
  const [checkInDate, setCheckInDate] = useState("");
  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [inlineErr, setInlineErr] = useState<string | null>(null);

  useEffect(() => {
    if (booking) {
      const start = new Date(booking.start_time);
      const end = new Date(booking.end_time);
      const pad = (n: number) => String(n).padStart(2, "0");
      setCheckInDate(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
      setCheckInTime(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
      setCheckOutDate(`${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`);
      setCheckOutTime(`${pad(end.getHours())}:${pad(end.getMinutes())}`);
      setReason("");
      setInlineErr(null);
      setBusy(false);
    }
  }, [booking]);

  function submit() {
    if (!booking) return;
    if (!checkInDate || !checkOutDate) { setInlineErr("Enter both check-in and check-out dates."); return; }
    const newStartISO = toISO(checkInDate, checkInTime || "14:00");
    const newEndISO = toISO(checkOutDate, checkOutTime || "11:00");
    if (new Date(newEndISO) <= new Date(newStartISO)) { setInlineErr("Check-out must be after check-in."); return; }
    setBusy(true);
    setInlineErr(null);
    onDone(booking, newStartISO, newEndISO, reason.trim());
  }

  return (
    <Modal visible={!!booking} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardSheet style={s.centeredOverlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <Pressable style={s.alertSheet} onPress={() => {}}>
          <View style={[s.alertIconWrap, { backgroundColor: `${C.info}18` }]}>
            <Feather name="calendar" size={28} color={C.info} />
          </View>
          <Text style={s.alertTitle}>Reschedule Booking</Text>
          {!!booking && (
            <Text style={s.alertBody}>
              {booking.resource_name ?? "Booking"} · {bookingRef(booking.id)}
            </Text>
          )}
          <View style={{ alignSelf: "stretch", gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>New Check-in Date</Text>
                <TextInput style={s.input} value={checkInDate} onChangeText={(v) => { setCheckInDate(sanitizeDateStr(v)); setInlineErr(null); }}
                  maxLength={10} placeholder="YYYY-MM-DD" placeholderTextColor={C.ink4} autoCapitalize="none" />
              </View>
              <View style={{ width: 90 }}>
                <Text style={s.fieldLabel}>Time</Text>
                <TextInput style={s.input} value={checkInTime} onChangeText={(v) => { setCheckInTime(sanitizeTimeStr(v)); setInlineErr(null); }}
                  maxLength={5} placeholder="14:00" placeholderTextColor={C.ink4} autoCapitalize="none" />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>New Check-out Date</Text>
                <TextInput style={s.input} value={checkOutDate} onChangeText={(v) => { setCheckOutDate(sanitizeDateStr(v)); setInlineErr(null); }}
                  maxLength={10} placeholder="YYYY-MM-DD" placeholderTextColor={C.ink4} autoCapitalize="none" />
              </View>
              <View style={{ width: 90 }}>
                <Text style={s.fieldLabel}>Time</Text>
                <TextInput style={s.input} value={checkOutTime} onChangeText={(v) => { setCheckOutTime(sanitizeTimeStr(v)); setInlineErr(null); }}
                  maxLength={5} placeholder="11:00" placeholderTextColor={C.ink4} autoCapitalize="none" />
              </View>
            </View>
            <Text style={s.fieldLabel}>Reason (optional)</Text>
            <TextInput
              style={[s.input, { minHeight: 56, textAlignVertical: "top" }]}
              multiline
              value={reason}
              maxLength={200}
              onChangeText={setReason}
              placeholder="Why is this booking being moved?"
              placeholderTextColor={C.ink4}
            />
            {!!inlineErr && (
              <Text style={{ color: C.bad, fontSize: 12, fontFamily: MONO }}>{inlineErr}</Text>
            )}
          </View>
          <View style={s.alertActions}>
            <Pressable style={s.alertKeepBtn} onPress={onClose}>
              <Text style={s.alertKeepTxt}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[s.alertCancelBtn, { borderColor: `${C.info}44`, backgroundColor: `${C.info}18` }, busy && { opacity: 0.5 }]}
              onPress={submit}
              disabled={busy}
            >
              {busy
                ? <ActivityIndicator size="small" color={C.info} />
                : <Text style={[s.alertCancelTxt, { color: C.info }]}>Reschedule</Text>
              }
            </Pressable>
          </View>
        </Pressable>
      </KeyboardSheet>
    </Modal>
  );
}

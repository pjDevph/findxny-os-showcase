import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { KeyboardSheet } from "../ui/KeyboardSheet";
import { MONO } from "../theme/mono";
import { sanitizeMoney } from "../utils/inputSanitizers";
import { peso } from "../order/format";
import { bookingRef } from "./bookingsHelpers";
import type { StyleMap, ThemeColors } from "./bookingsScreenStyles";
import type { Booking } from "./types";

interface Props {
  readonly booking: Booking | null;
  readonly s: StyleMap;
  readonly C: ThemeColors;
  readonly onClose: () => void;
  readonly onDone: (booking: Booking, amount: number, method: string, reason: string) => void;
}

const METHODS = ["cash", "gcash", "maya", "other"] as const;

export function RefundModal({ booking, s, C, onClose, onDone }: Props) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [inlineErr, setInlineErr] = useState<string | null>(null);

  useEffect(() => {
    if (booking) {
      setAmount(String(booking.amount_paid));
      setMethod("cash");
      setReason("");
      setInlineErr(null);
      setBusy(false);
    }
  }, [booking]);

  function submit() {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setInlineErr("Enter a valid refund amount."); return; }
    if (!booking) return;
    if (amt > booking.amount_paid) { setInlineErr(`Cannot exceed amount paid (${peso(booking.amount_paid)}).`); return; }
    if (reason.trim().length < 3) { setInlineErr("Reason must be at least 3 characters."); return; }
    setBusy(true);
    setInlineErr(null);
    onDone(booking, amt, method, reason.trim());
  }

  return (
    <Modal visible={!!booking} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardSheet style={s.centeredOverlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <Pressable style={s.alertSheet} onPress={() => {}}>
          <View style={[s.alertIconWrap, { backgroundColor: `${C.ink3}18` }]}>
            <Feather name="rotate-ccw" size={28} color={C.ink2} />
          </View>
          <Text style={s.alertTitle}>Issue Refund</Text>
          {!!booking && (
            <Text style={s.alertBody}>
              {booking.resource_name ?? "Booking"} · {bookingRef(booking.id)}{"\n"}
              <Text style={{ color: C.amber, fontWeight: "700" }}>Paid: {peso(booking.amount_paid)}</Text>
            </Text>
          )}
          <View style={{ alignSelf: "stretch", gap: 10 }}>
            <Text style={s.fieldLabel}>Refund Amount</Text>
            <TextInput
              style={s.input}
              keyboardType="decimal-pad"
              maxLength={12}
              value={amount}
              onChangeText={(v) => { setAmount(sanitizeMoney(v)); setInlineErr(null); }}
              placeholder="0.00"
              placeholderTextColor={C.ink4}
            />
            <Text style={s.fieldLabel}>Method</Text>
            <View style={s.chipGrid}>
              {METHODS.map((m) => (
                <Pressable key={m} style={[s.chip, method === m && s.chipSel]} onPress={() => setMethod(m)}>
                  <Text style={[s.chipTxt, method === m && s.chipTxtSel]}>{m.charAt(0).toUpperCase() + m.slice(1)}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.fieldLabel}>Reason <Text style={{ color: C.bad }}>*</Text></Text>
            <TextInput
              style={[s.input, { minHeight: 56, textAlignVertical: "top" }]}
              multiline
              value={reason}
              maxLength={200}
              onChangeText={(v) => { setReason(v); setInlineErr(null); }}
              placeholder="Reason for refund…"
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
              style={[s.alertCancelBtn, { borderColor: `${C.ink3}44`, backgroundColor: `${C.ink3}18` }, busy && { opacity: 0.5 }]}
              onPress={submit}
              disabled={busy}
            >
              {busy
                ? <ActivityIndicator size="small" color={C.ink2} />
                : <Text style={[s.alertCancelTxt, { color: C.ink2 }]}>Confirm Refund</Text>
              }
            </Pressable>
          </View>
        </Pressable>
      </KeyboardSheet>
    </Modal>
  );
}

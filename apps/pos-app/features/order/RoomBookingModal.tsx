/**
 * Room booking form modal — dates, times, guest details, live price summary.
 *
 * Extracted from app/pos/order.tsx. Full-screen (not a centered card) so the
 * long form has a definite height for its scroll region.
 */
import { View, Text, Pressable, ScrollView, TextInput, Modal, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { KeyboardSheet } from "../ui/KeyboardSheet";
import { useTheme } from "../theme/ThemeContext";
import { peso } from "./format";
import { sanitizePhone, sanitizeTimeStr } from "../utils/inputSanitizers";
import type { Resource } from "./types";
import type { OrderScreenStyles } from "./orderScreenStyles";

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onPickDates: () => void;
  readonly selRes: Resource | null;
  readonly bStartTime: string; readonly setBStartTime: (v: string) => void;
  readonly bEndTime: string;   readonly setBEndTime: (v: string) => void;
  readonly bGuest: string;     readonly setBGuest: (v: string) => void;
  readonly bPhone: string;     readonly setBPhone: (v: string) => void;
  readonly bEmail: string;     readonly setBEmail: (v: string) => void;
  readonly bNotes: string;     readonly setBNotes: (v: string) => void;
  readonly bCheckIn: string;
  readonly bCheckOut: string;
  readonly bNights: number;
  readonly bIsNightly: boolean;
  readonly bHrsActual: number;
  readonly bFormTotal: number;
  readonly bCanAdd: boolean;
  readonly isTablet: boolean;
  readonly onAddBooking: () => void;
  readonly bottomInset: number;
  readonly s: OrderScreenStyles;
  readonly C: ReturnType<typeof useTheme>["C"];
}

export function RoomBookingModal(p: Props) {
  const {
    visible, onClose, onPickDates, selRes,
    bStartTime, setBStartTime, bEndTime, setBEndTime,
    bGuest, setBGuest, bPhone, setBPhone, bEmail, setBEmail, bNotes, setBNotes,
    bCheckIn, bCheckOut, bNights, bIsNightly, bHrsActual, bFormTotal, bCanAdd,
    onAddBooking, isTablet, bottomInset, s, C,
  } = p;
  if (selRes?.type !== "room") return null;
  return (
      
        <Modal visible={visible} animationType="fade" transparent
          onRequestClose={() => onClose()}>
          <KeyboardSheet style={[StyleSheet.absoluteFill, { backgroundColor: C.bg2 }]}>
            <View style={{ flex: 1 }}>
              {/* Header */}
              <View style={s.bookingModalHead}>
                <View>
                  <Text style={s.bookingModalTitle}>Book Room</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Text style={s.bookingModalSub}>{selRes.name}{selRes.capacity ? "  ·" : ""}</Text>
                    {!!selRes.capacity && (
                      <>
                        <Feather name="users" size={11} color={C.ink3} />
                        <Text style={s.bookingModalSub}>{selRes.capacity} pax</Text>
                      </>
                    )}
                  </View>
                </View>
                <Pressable onPress={() => onClose()} hitSlop={8}>
                  <Feather name="x" size={20} color={C.ink3} />
                </Pressable>
              </View>

              {/* Body: form + summary column */}
              <View style={[s.bookingModalBody, isTablet && { flexDirection: "row", gap: 16 }]}>
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={s.bookingModalForm}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {bCheckIn && bCheckOut ? (
                    <Pressable style={s.bDateBar} onPress={() => { onPickDates(); }}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.bDateBarLabel}>DATES</Text>
                        <Text style={s.bDateBarValue}>{bCheckIn}  →  {bCheckOut}</Text>
                      </View>
                      <Text style={s.bDateBarEdit}>✎ Change</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={s.bDatePickerBtn} onPress={() => { onPickDates(); }}>
                      <Text style={s.bDatePickerTxt}>Tap to select check-in & check-out dates</Text>
                    </Pressable>
                  )}
                  <View style={s.bRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.bLabel}>CHECK-IN TIME</Text>
                      <TextInput style={s.bInput} placeholder="14:00" maxLength={5}
                        placeholderTextColor={C.ink4} value={bStartTime} onChangeText={v => setBStartTime(sanitizeTimeStr(v))} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.bLabel}>CHECK-OUT TIME</Text>
                      <TextInput style={s.bInput} placeholder="11:00" maxLength={5}
                        placeholderTextColor={C.ink4} value={bEndTime} onChangeText={v => setBEndTime(sanitizeTimeStr(v))} />
                    </View>
                  </View>
                  <Text style={s.bLabel}>GUEST NAME <Text style={{ color: C.bad }}>*</Text></Text>
                  <TextInput style={s.bInput} placeholder="Juan dela Cruz"
                    placeholderTextColor={C.ink4} value={bGuest} onChangeText={setBGuest} />
                  <View style={s.bRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.bLabel}>CONTACT NO. (optional)</Text>
                      <TextInput style={s.bInput} placeholder="09XXXXXXXXX" maxLength={15}
                        placeholderTextColor={C.ink4} value={bPhone} onChangeText={v => setBPhone(sanitizePhone(v))}
                        keyboardType="phone-pad" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.bLabel}>EMAIL (optional)</Text>
                      <TextInput style={s.bInput} placeholder="email@example.com"
                        placeholderTextColor={C.ink4} value={bEmail} onChangeText={setBEmail}
                        keyboardType="email-address" autoCapitalize="none" />
                    </View>
                  </View>
                  <Text style={s.bLabel}>NOTES (optional)</Text>
                  <TextInput style={[s.bInput, { minHeight: 64, textAlignVertical: "top" }]}
                    placeholder="Special requests…" placeholderTextColor={C.ink4}
                    multiline value={bNotes} onChangeText={setBNotes} />
                </ScrollView>

                {/* Booking summary — tablet only */}
                {isTablet && (
                  <View style={s.bookingModalSummary}>
                    <Text style={s.bookingModalSummaryTitle}>Summary</Text>
                    <View style={s.bookingModalSummaryRow}>
                      <Text style={s.bookingModalSummaryLbl}>ROOM</Text>
                      <Text style={s.bookingModalSummaryVal} numberOfLines={2}>{selRes.name}</Text>
                    </View>
                    {!!bCheckIn && (
                      <View style={s.bookingModalSummaryRow}>
                        <Text style={s.bookingModalSummaryLbl}>DATES</Text>
                        <Text style={s.bookingModalSummaryVal}>{bCheckIn}{"\n"}→ {bCheckOut}</Text>
                      </View>
                    )}
                    {bHrsActual > 0 && (
                      <View style={s.bookingModalSummaryRow}>
                        <Text style={s.bookingModalSummaryLbl}>DURATION</Text>
                        <Text style={s.bookingModalSummaryVal}>
                          {bIsNightly ? `${bNights} night${bNights !== 1 ? "s" : ""}` : `${bHrsActual.toFixed(1)} hrs`}
                        </Text>
                      </View>
                    )}
                    {selRes.capacity ? (
                      <View style={s.bookingModalSummaryRow}>
                        <Text style={s.bookingModalSummaryLbl}>CAPACITY</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Feather name="users" size={12} color={C.ink2} />
                          <Text style={s.bookingModalSummaryVal}>{selRes.capacity} pax</Text>
                        </View>
                      </View>
                    ) : null}
                    {bHrsActual > 0 && (
                      <View style={s.bookingModalSummaryTotalRow}>
                        <Text style={s.bookingModalSummaryTotalLbl}>Total</Text>
                        <Text style={s.bookingModalSummaryTotalVal}>{peso(bFormTotal)}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* Sticky footer */}
              {!bGuest.trim() && (
                <Text style={{ color: C.bad, fontSize: 11, paddingHorizontal: 20, paddingBottom: 6 }}>
                  Guest name is required
                </Text>
              )}
              <View style={[s.bookingModalFooter, { paddingBottom: 16 + bottomInset }]}>
                <Pressable style={s.bookingModalCancelBtn} onPress={() => onClose()}>
                  <Text style={s.bookingModalCancelBtnTxt}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[s.bookingModalAddBtn, !bCanAdd && { opacity: 0.6 }]}
                  onPress={onAddBooking}
                  disabled={!bCanAdd}
                >
                  <Text style={s.bookingModalAddBtnTxt}>
                    Add to Order{bFormTotal > 0 ? `  ·  ${peso(bFormTotal)}` : ""}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardSheet>
        </Modal>
  );
}

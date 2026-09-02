import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { sanitizeTimeStr } from "../utils/inputSanitizers";
import { peso } from "../order/format";
import { sanitizeNoteInput } from "./bookingsHelpers";
import { MAX_NOTES, type BookFieldErrors, EMPTY_BOOKING_FORM, type Resource } from "./types";
import type { StyleMap, ThemeColors } from "./bookingsScreenStyles";

/**
 * NOTE: as of the features/bookings/ extraction, nothing opens this form's
 * modal — see useBookingForm.ts for why. Preserved verbatim.
 */
interface Props {
  readonly resources: Resource[];
  readonly form: typeof EMPTY_BOOKING_FORM;
  readonly selected: Resource | undefined;
  readonly hours: number;
  readonly totalAmt: number;
  readonly saving: boolean;
  readonly canSubmit: boolean;
  readonly fieldErrors: BookFieldErrors;
  readonly s: StyleMap;
  readonly C: ThemeColors;
  readonly onRoomSelect: (r: Resource) => void;
  readonly onSetFormField: (field: keyof typeof EMPTY_BOOKING_FORM, value: string) => void;
  readonly onBlurName: () => void;
  readonly onBlurPhone: () => void;
  readonly onSaveConfirmed: () => void;
  readonly onClose: () => void;
}

export function BookingFormContent({
  resources, form, selected, hours, totalAmt, saving, canSubmit, fieldErrors, s, C,
  onRoomSelect, onSetFormField, onBlurName, onBlurPhone, onSaveConfirmed, onClose,
}: Props) {
  const nights = Math.max(1, Math.round(hours / 24));
  return (
    <View style={s.sheet}>
      <View style={s.sheetHeader}>
        <Text style={[s.sheetTitle, { flex: 1 }]} numberOfLines={1}>New Room Booking</Text>
        <Pressable onPress={onClose} hitSlop={8}><Feather name="x" size={20} color={C.ink3} /></Pressable>
      </View>
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={s.sheetContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={s.fieldLabel}>Room</Text>
        <View style={s.chipGrid}>
          {resources.length === 0
            ? <Text style={s.emptyTxt}>No rooms configured</Text>
            : resources.map((r) => (
              <Pressable key={r.id} style={[s.chip, form.resource_id === r.id && s.chipSel]} onPress={() => onRoomSelect(r)}>
                <Text style={[s.chipTxt, form.resource_id === r.id && s.chipTxtSel]}>{r.name}</Text>
                <View style={s.chipSubRow}>
                  {!!r.capacity && (
                    <>
                      <Feather name="users" size={10} color={form.resource_id === r.id ? C.amber : C.ink4} />
                      <Text style={[s.chipSub, form.resource_id === r.id && { color: C.amber }]}>{r.capacity}</Text>
                    </>
                  )}
                  <Text style={[s.chipSub, form.resource_id === r.id && { color: C.amber }]}>
                    {r.type === "room" && r.nightly_rate != null
                      ? `${peso(r.nightly_rate)}/night`
                      : `${peso(r.hourly_rate ?? 0)}/hr`}
                  </Text>
                </View>
              </Pressable>
            ))
          }
        </View>
        {form.check_in_date && form.check_out_date ? (
          <Pressable style={s.dateBar} onPress={() => selected && onRoomSelect(selected)}>
            <View style={{ flex: 1 }}>
              <Text style={s.dateBarLabel}>DATES</Text>
              <Text style={s.dateBarDates}>{form.check_in_date}  →  {form.check_out_date}</Text>
            </View>
            <Text style={s.dateBarEdit}>✎ Change</Text>
          </Pressable>
        ) : (
          <Text style={s.datePlaceholder}>
            {form.resource_id ? "↑ Tap room again to pick dates" : "↑ Tap a room to open the availability calendar"}
          </Text>
        )}
        <View style={s.row2}>
          <View style={{ flex: 1 }}>
            <Text style={s.fieldLabel}>Check-in Time</Text>
            <TextInput style={s.input} placeholder="14:00" placeholderTextColor={C.ink4} maxLength={5}
              value={form.check_in_time} onChangeText={(v) => onSetFormField("check_in_time", sanitizeTimeStr(v))} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.fieldLabel}>Check-out Time</Text>
            <TextInput style={s.input} placeholder="11:00" placeholderTextColor={C.ink4} maxLength={5}
              value={form.check_out_time} onChangeText={(v) => onSetFormField("check_out_time", sanitizeTimeStr(v))} />
          </View>
        </View>
        {hours > 0 && selected && (
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>
              {selected.type === "room" && selected.nightly_rate != null
                ? `${nights} night${nights !== 1 ? "s" : ""} × ${peso(selected.nightly_rate)}/night`
                : `${hours.toFixed(1)} hrs × ${peso(selected.hourly_rate ?? 0)}/hr`}
            </Text>
            <Text style={s.totalAmt}>{peso(totalAmt)}</Text>
          </View>
        )}
        <Text style={s.fieldLabel}>Guest Name <Text style={{ color: C.bad }}>*</Text></Text>
        <TextInput
          style={[s.input, fieldErrors.name ? { borderColor: C.bad } : undefined]}
          placeholder="Juan dela Cruz" placeholderTextColor={C.ink4}
          autoCapitalize="words" autoCorrect={false} maxLength={80}
          value={form.guest_name}
          onChangeText={(v) => onSetFormField("guest_name", v)}
          onBlur={onBlurName}
        />
        {fieldErrors.name ? (
          <Text style={{ color: C.bad, fontSize: 11, marginTop: 3 }}>{fieldErrors.name}</Text>
        ) : null}
        <Text style={[s.fieldLabel, { marginTop: 12 }]}>
          Contact No.{selected?.type === "room" ? <Text style={{ color: C.bad }}> *</Text> : <Text style={{ color: C.ink4 }}> (optional)</Text>}
        </Text>
        <View style={{ flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: fieldErrors.phone ? C.bad : C.line, backgroundColor: C.surface, overflow: "hidden" }}>
          <View style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: `${C.ink4}22`, borderRightWidth: 1, borderRightColor: C.line, justifyContent: "center" }}>
            <Text style={{ color: C.ink3, fontSize: 14, fontWeight: "600" }}>+63</Text>
          </View>
          <TextInput
            style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 14 }}
            keyboardType="numeric"
            maxLength={10}
            value={form.guest_phone}
            onChangeText={(v) => {
              const digits = v.replace(/\D/g, "").slice(0, 10);
              onSetFormField("guest_phone", digits);
            }}
            placeholder="9171234567"
            placeholderTextColor={C.ink4}
            onBlur={onBlurPhone}
          />
        </View>
        {fieldErrors.phone ? (
          <Text style={{ color: C.bad, fontSize: 11, marginTop: 3 }}>{fieldErrors.phone}</Text>
        ) : selected?.type === "room" && !form.guest_phone ? (
          <Text style={{ color: C.ink4, fontSize: 11, marginTop: 3 }}>Required — guest needs this to track or cancel online</Text>
        ) : null}
        <Text style={[s.fieldLabel, { marginTop: 12 }]}>Email (optional — receipt will be auto-sent on payment)</Text>
        <TextInput
          style={[s.input, fieldErrors.email ? { borderColor: C.bad } : undefined]}
          placeholder="guest@email.com" placeholderTextColor={C.ink4}
          keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
          value={form.guest_email}
          onChangeText={(v) => onSetFormField("guest_email", v)}
        />
        {fieldErrors.email ? (
          <Text style={{ color: C.bad, fontSize: 11, marginTop: 3 }}>{fieldErrors.email}</Text>
        ) : null}
        <Text style={[s.fieldLabel, { marginTop: 12 }]}>Notes (optional)</Text>
        <TextInput
          style={[s.input, { minHeight: 64, textAlignVertical: "top" }, fieldErrors.notes ? { borderColor: C.bad } : undefined]}
          placeholder="Special requests, preferences…" placeholderTextColor={C.ink4} multiline
          maxLength={MAX_NOTES}
          value={form.notes}
          onChangeText={(v) => onSetFormField("notes", sanitizeNoteInput(v))}
        />
        <Text style={{ color: fieldErrors.notes ? C.bad : C.ink4, fontSize: 11, textAlign: "right", marginTop: 2 }}>
          {form.notes.length}/{MAX_NOTES}
        </Text>
      </ScrollView>
      <View style={s.sheetFooter}>
        <Pressable
          style={[s.headerConfirmBtn, s.footerConfirmBtn, (!canSubmit || saving) && { opacity: 0.6 }]}
          onPress={onSaveConfirmed}
          disabled={!canSubmit || saving}
        >
          <Text style={s.headerConfirmBtnTxt}>{saving ? "Booking…" : "Confirm Booking"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

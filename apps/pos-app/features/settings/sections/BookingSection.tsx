import { View, Text, TextInput } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { R } from "../../theme/tokens";
import { sanitizeInteger } from "../../utils/inputSanitizers";
import { SectionLabel, Card, Field } from "../SettingsCard";
import type { makeStyles } from "../settingsScreenStyles";
import type { useWorkspaceSettings } from "../useWorkspaceSettings";

interface Props {
  readonly settings: ReturnType<typeof useWorkspaceSettings>;
  readonly canEditBooking: boolean;
  readonly s: ReturnType<typeof makeStyles>;
}

export function BookingSection({ settings, canEditBooking, s }: Props) {
  const { C } = useTheme();
  const { bookingForm, setBookingForm, setBookingDirty } = settings;

  return (
    <>
      <SectionLabel label="Booking Rules" />
      <Card>
        <Field label="Booking Hold Window (minutes)">
          <TextInput
            style={[s.input, !canEditBooking && s.inputDisabled]}
            value={bookingForm.hold_minutes}
            onChangeText={(v) => { setBookingForm((f) => ({ ...f, hold_minutes: sanitizeInteger(v, { maxLen: 4 }) })); setBookingDirty(true); }}
            editable={canEditBooking}
            keyboardType="number-pad"
            maxLength={4}
            placeholder="e.g. 30"
            placeholderTextColor={C.ink4}
          />
          <Text style={s.fieldDesc}>How long a booking is held before it expires without payment</Text>
        </Field>
        <Field label="Time Slot Size (minutes)">
          <TextInput
            style={[s.input, !canEditBooking && s.inputDisabled]}
            value={bookingForm.slot_minutes}
            onChangeText={(v) => { setBookingForm((f) => ({ ...f, slot_minutes: sanitizeInteger(v, { maxLen: 4 }) })); setBookingDirty(true); }}
            editable={canEditBooking}
            keyboardType="number-pad"
            maxLength={4}
            placeholder="e.g. 60"
            placeholderTextColor={C.ink4}
          />
          <Text style={s.fieldDesc}>Default duration for each booking time slot</Text>
        </Field>
        {!canEditBooking && (
          <View style={s.noEditBanner}>
            <Feather name="lock" size={13} color={C.ink4} />
            <Text style={s.noEditTxt}>Manager or higher required to edit booking rules.</Text>
          </View>
        )}
      </Card>
      <View style={{ marginHorizontal: 2, marginTop: 8, padding: 12, backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line }}>
        <Text style={{ color: C.ink4, fontSize: 12 }}>
          Also configurable in Web Admin → Settings → Operations & Booking. Changes here sync immediately.
        </Text>
      </View>
    </>
  );
}

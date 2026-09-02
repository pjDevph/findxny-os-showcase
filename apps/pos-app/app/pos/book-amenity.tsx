import {
  View, Text, Pressable, TextInput, FlatList,
  StyleSheet, ActivityIndicator, Platform,
} from "react-native";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { invokeFn } from "../../services/supabase";
import { useAuth } from "../../features/auth/AuthContext";
import { R } from "../../features/theme/tokens";
import { useTheme } from "../../features/theme/ThemeContext";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { getIsConnected } from "../../features/offline/networkStatus";
import { useAppAlert } from "../../features/ui/AppAlertProvider";
import { useToast } from "../../features/ui/ToastProvider";
import { FormSheetModal } from "../../features/ui/FormSheetModal";
import { makeFormFieldStyles } from "../../features/ui/formFieldStyles";
import { NAV_BAR_CLEARANCE } from "../../features/ui/safeAreaPadding";
import { sanitizeDateStr, sanitizeTimeStr, sanitizePhone } from "../../features/utils/inputSanitizers";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
const peso = (n: number) => `₱${n.toFixed(2)}`;

interface Resource {
  id: string;
  name: string;
  capacity: number | null;
  hourly_rate: number;
  branch_id: string | null;
}

interface Booking {
  id: string;
  resource_id: string;
  resource_name: string | null;
  start_time: string;
  end_time: string;
  status: "hold" | "confirmed" | "completed" | "cancelled";
  payment_status: "unpaid" | "partial" | "paid" | null;
  total: number;
  notes: string | null;
}

interface RawAmenityResource {
  id: string;
  name: string;
  capacity: number | null;
  hourly_rate: number;
  branch_id: string | null;
}

interface RawAmenityBooking {
  id: string;
  resource_id: string;
  start_time: string;
  end_time: string;
  status: Booking["status"];
  payment_status?: Booking["payment_status"];
  total: number;
  notes: string | null;
  bookable_resources: { name: string } | null;
}

function fmtDT(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
}
function toISO(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function hoursFrom(s: string, e: string) {
  return Math.max(0, (new Date(e).getTime() - new Date(s).getTime()) / 3_600_000);
}

const EMPTY = {
  resource_id: "", date: "", start_time: "09:00", end_time: "11:00",
  guest_name: "", guest_phone: "", notes: "",
};

export default function BookAmenityScreen() {
  const { activeWorkspaceId, activeBranchId } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const fieldStyles = useMemo(() => makeFormFieldStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { showAlert } = useAppAlert();
  const { showToast } = useToast();

  const [resources, setResources] = useState<Resource[]>([]);
  const [bookings, setBookings]   = useState<Booking[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(EMPTY);
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    const { data: payload } = await invokeFn<{
      "booking-amenity-load": { resources: RawAmenityResource[]; bookings: RawAmenityBooking[] };
    }>("pos-data", { workspace_id: activeWorkspaceId, resource: "booking-amenity-load" });
    const res = payload?.["booking-amenity-load"]?.resources ?? [];
    const bks = payload?.["booking-amenity-load"]?.bookings  ?? [];
    setResources((res ?? []).map((r) => ({
      id: r.id, name: r.name, capacity: r.capacity ?? null,
      hourly_rate: Number(r.hourly_rate), branch_id: r.branch_id ?? null,
    })));
    setBookings((bks ?? []).map((b) => ({
      id: b.id, resource_id: b.resource_id,
      resource_name: b.bookable_resources?.name ?? null,
      start_time: b.start_time, end_time: b.end_time,
      status: b.status, payment_status: b.payment_status ?? "unpaid",
      total: Number(b.total), notes: b.notes ?? null,
    })));
    setLoading(false);
  }, [activeWorkspaceId]);

  useEffect(() => { load(); }, [load]);

  const selected   = resources.find((r) => r.id === form.resource_id);
  const startISO   = form.date ? toISO(form.date, form.start_time) : "";
  const endISO     = form.date ? toISO(form.date, form.end_time)   : "";
  const hours      = startISO && endISO ? hoursFrom(startISO, endISO) : 0;
  const totalAmt   = selected ? +(hours * selected.hourly_rate).toFixed(2) : 0;
  const canSubmit  = !!form.resource_id && hours > 0 && !!form.guest_name.trim();

  function openForm() {
    setForm({ ...EMPTY, date: todayStr() });
    setShowForm(true);
  }

  async function saveBooking() {
    if (!canSubmit || !selected) return;
    if (!getIsConnected()) {
      showToast({ title: "No Internet", message: "Amenity bookings require an internet connection.", type: "error" });
      return;
    }
    setSaving(true);
    const branchId = selected.branch_id ?? activeBranchId;
    if (!branchId) {
      setSaving(false);
      showToast({ title: "Error", message: "No branch linked to this amenity. Contact your admin.", type: "error" });
      return;
    }
    const notesParts = [form.guest_name.trim(), form.guest_phone.trim(), form.notes.trim()].filter(Boolean);
    const { data: holdData, error: holdErr } = await invokeFn<{ booking: { id: string } }>("bookings-hold", {
      workspace_id: activeWorkspaceId, branch_id: branchId,
      resource_id: form.resource_id, start_time: startISO, end_time: endISO,
      notes: notesParts.join(" · "),
    });
    if (holdErr || !holdData) {
      setSaving(false);
      showToast({ title: "Error", message: holdErr?.message ?? "Failed to hold", type: "error" });
      return;
    }
    const { data: confirmData, error: confirmErr } = await invokeFn("bookings-confirm", {
      workspace_id: activeWorkspaceId, booking_id: holdData.booking.id,
    });
    setSaving(false);
    if (confirmErr || !confirmData) {
      showToast({ title: "Held", message: "Booking held but not confirmed: " + (confirmErr?.message ?? "Unknown error"), type: "error" });
    } else {
      setShowForm(false);
      load();
      showToast({ title: "Confirmed", message: `${selected.name} booked for ${form.guest_name.trim()}`, type: "success" });
    }
  }

  async function cancelBooking(b: Booking) {
    showAlert("Cancel Booking", `Cancel booking for ${b.resource_name ?? "this amenity"}?`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel", style: "destructive",
        onPress: () => { void (async () => {
          const { error } = await invokeFn("bookings-cancel", {
            workspace_id: activeWorkspaceId, booking_id: b.id,
          });
          if (error) showToast({ title: "Error", message: error.message, type: "error" });
          else load();
        })(); },
      },
    ]);
  }

  async function markPaid(b: Booking) {
    const { error } = await invokeFn("bookings-mark-paid", { workspace_id: activeWorkspaceId, booking_id: b.id });
    if (error) showToast({ title: "Error", message: error.message, type: "error" });
    else load();
  }

  const SC: Record<string, string> = {
    hold: C.warn, confirmed: C.good, completed: C.ink3, cancelled: C.bad,
  };

  return (
    <View style={s.root}>
      <PosScreenHeader title="Book Amenity"
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={s.count}>{bookings.length} active</Text>
            <Pressable style={s.newBookingBtn} onPress={openForm}>
              <Feather name="plus" size={14} color="#000000" />
              <Text style={s.newBookingBtnTxt}>New Booking</Text>
            </Pressable>
          </View>
        } />

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.amber} /></View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b.id}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + NAV_BAR_CLEARANCE }]}
          renderItem={({ item: b }) => (
            <Pressable style={s.card} onLongPress={() => cancelBooking(b)}>
              <View style={s.cardTop}>
                <Text style={s.cardRoom}>{b.resource_name ?? "Amenity"}</Text>
                <View style={[s.badge, { backgroundColor: `${SC[b.status]}22`, borderColor: `${SC[b.status]}44` }]}>
                  <Text style={[s.badgeTxt, { color: SC[b.status] }]}>{b.status}</Text>
                </View>
              </View>
              <Text style={s.cardTime}>{fmtDT(b.start_time)} → {fmtDT(b.end_time)}</Text>
              {b.notes ? <Text style={s.cardNotes}>{b.notes}</Text> : null}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={s.cardTotal}>{peso(b.total)}</Text>
                {b.status !== "cancelled" && b.status !== "completed" && b.payment_status !== "paid" && b.total > 0 && (
                  <Pressable style={s.markPaidBtn} onPress={() => markPaid(b)}>
                    <Text style={s.markPaidBtnTxt}>Mark Paid</Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={s.empty}>No active amenity bookings</Text>
              <Text style={s.emptySub}>Tap New Booking to create one</Text>
            </View>
          }
        />
      )}

      <FormSheetModal
        visible={showForm}
        onClose={() => setShowForm(false)}
        title="New Amenity Booking"
        footer={
          <Pressable
            style={[fieldStyles.footerPrimaryBtn, { backgroundColor: C.amber }, (!canSubmit || saving) && { opacity: 0.5 }]}
            onPress={saveBooking} disabled={!canSubmit || saving}>
            <Text style={fieldStyles.footerPrimaryBtnTxt}>{saving ? "Booking…" : "Confirm Booking"}</Text>
          </Pressable>
        }
      >
        <Text style={fieldStyles.fieldLabel}>Amenity</Text>
        <View style={s.chipGrid}>
          {resources.length === 0
            ? <Text style={s.empty}>No amenities configured</Text>
            : resources.map((r) => (
              <Pressable key={r.id}
                style={[s.chip, form.resource_id === r.id && s.chipSel]}
                onPress={() => setForm((f) => ({ ...f, resource_id: r.id }))}>
                <Text style={[s.chipTxt, form.resource_id === r.id && s.chipTxtSel]}>{r.name}</Text>
                <View style={s.chipSubRow}>
                  {!!r.capacity && (
                    <>
                      <Feather name="users" size={10} color={form.resource_id === r.id ? C.amber : C.ink4} />
                      <Text style={[s.chipSub, form.resource_id === r.id && { color: C.amber }]}>{r.capacity}</Text>
                    </>
                  )}
                  <Text style={[s.chipSub, form.resource_id === r.id && { color: C.amber }]}>{peso(r.hourly_rate)}/hr</Text>
                </View>
              </Pressable>
            ))
          }
        </View>

        <Text style={fieldStyles.fieldLabel}>Date</Text>
        <TextInput style={fieldStyles.input} placeholder="YYYY-MM-DD" placeholderTextColor={C.ink4} maxLength={10}
          value={form.date} onChangeText={(v) => setForm((f) => ({ ...f, date: sanitizeDateStr(v) }))} />

        <View style={fieldStyles.row2}>
          <View style={{ flex: 1 }}>
            <Text style={fieldStyles.fieldLabel}>Start Time</Text>
            <TextInput style={fieldStyles.input} placeholder="HH:MM" placeholderTextColor={C.ink4} maxLength={5}
              value={form.start_time} onChangeText={(v) => setForm((f) => ({ ...f, start_time: sanitizeTimeStr(v) }))} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={fieldStyles.fieldLabel}>End Time</Text>
            <TextInput style={fieldStyles.input} placeholder="HH:MM" placeholderTextColor={C.ink4} maxLength={5}
              value={form.end_time} onChangeText={(v) => setForm((f) => ({ ...f, end_time: sanitizeTimeStr(v) }))} />
          </View>
        </View>

        {hours > 0 && selected && (
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>{hours.toFixed(1)} hrs × {peso(selected.hourly_rate)}/hr</Text>
            <Text style={s.totalAmt}>{peso(totalAmt)}</Text>
          </View>
        )}

        <Text style={fieldStyles.fieldLabel}>Guest Name</Text>
        <TextInput style={fieldStyles.input} placeholder="Juan dela Cruz" placeholderTextColor={C.ink4} maxLength={80}
          value={form.guest_name} onChangeText={(v) => setForm((f) => ({ ...f, guest_name: v }))} />

        <Text style={fieldStyles.fieldLabel}>Phone (optional)</Text>
        <TextInput style={fieldStyles.input} placeholder="+63 9XX XXX XXXX" placeholderTextColor={C.ink4}
          keyboardType="phone-pad" maxLength={15}
          value={form.guest_phone} onChangeText={(v) => setForm((f) => ({ ...f, guest_phone: sanitizePhone(v) }))} />

        <Text style={fieldStyles.fieldLabel}>Notes (optional)</Text>
        <TextInput style={[fieldStyles.input, { minHeight: 56, textAlignVertical: "top" }]}
          placeholder="Equipment needed, preferences…" placeholderTextColor={C.ink4} multiline maxLength={300}
          value={form.notes} onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} />
      </FormSheetModal>
    </View>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  count:    { color: C.ink4, fontSize: 12, fontFamily: MONO },
  center:   { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 60 },
  empty:    { color: C.ink4, fontSize: 13 },
  emptySub: { color: C.ink4, fontSize: 11 },
  list:     { padding: 12, paddingBottom: 12 },

  card: {
    backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1,
    borderColor: C.line, padding: 14, marginBottom: 10, gap: 4,
  },
  cardTop:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  cardRoom:  { color: C.ink, fontSize: 15, fontWeight: "700" },
  badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.full, borderWidth: 1 },
  badgeTxt:  { fontSize: 10, fontWeight: "600", fontFamily: MONO, textTransform: "uppercase" },
  cardTime:  { color: C.ink3, fontSize: 12, fontFamily: MONO },
  cardNotes: { color: C.ink4, fontSize: 11, fontStyle: "italic" },
  cardTotal: { color: C.amber, fontSize: 14, fontWeight: "700", fontFamily: MONO, marginTop: 2 },
  markPaidBtn:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.full, borderWidth: 1, borderColor: `${C.good}44`, backgroundColor: `${C.good}18` },
  markPaidBtnTxt: { color: C.good, fontSize: 11, fontWeight: "700" },

  newBookingBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: C.amber, borderRadius: R.md,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  newBookingBtnTxt: { color: "#000000", fontSize: 13, fontWeight: "700" },

  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:     { paddingHorizontal: 12, paddingVertical: 8, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, gap: 2 },
  chipSel:  { backgroundColor: `${C.amber}18`, borderColor: `${C.amber}66` },
  chipTxt:  { color: C.ink3, fontSize: 13, fontWeight: "600" },
  chipTxtSel: { color: C.amber },
  chipSub:  { color: C.ink4, fontSize: 10, fontFamily: MONO },
  chipSubRow: { flexDirection: "row", alignItems: "center", gap: 3 },

  totalRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: `${C.amber}11`, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 10 },
  totalLabel: { color: C.ink3, fontSize: 12, fontFamily: MONO },
  totalAmt:   { color: C.amber, fontSize: 16, fontWeight: "700", fontFamily: MONO },

  primaryBtn:    { backgroundColor: C.amber, borderRadius: R.md, padding: 14, alignItems: "center" },
  primaryBtnTxt: { color: "#000000", fontSize: 15, fontWeight: "700" },
});

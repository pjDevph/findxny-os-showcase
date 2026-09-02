import { useState } from "react";
import { invokeFn } from "../../services/supabase";
import { getIsConnected } from "../offline/networkStatus";
import { formatPersonName, hoursFrom, isValidEmail, isValidName, isValidPHPhone, normalizePHPhone, toISO } from "./bookingsHelpers";
import { EMPTY_BOOKING_FORM, type BookFieldErrors, type Resource, type SuccessInfo } from "./types";

/**
 * Owns the in-file "New Booking" form (room chip picker, dates via
 * RoomCalendar, guest fields, save-as-hold-or-confirm). NOTE: as of this
 * extraction nothing calls `openShowForm()` — the header's "New Booking"
 * button and the Availability tab's "Book" button both navigate to
 * /pos/order?open_tab=room instead, so this flow (and its modal) is
 * currently unreachable in the app. Kept verbatim (not wired up, not
 * removed) per product decision — see book-room.tsx phase notes.
 */
export function useBookingForm(
  activeWorkspaceId: string | null | undefined,
  activeBranchId: string | null | undefined,
  resources: Resource[],
  load: (force?: boolean) => Promise<void>,
  setSuccessInfo: (v: SuccessInfo | null) => void,
  setErrorMsg: (v: string | null) => void,
) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_BOOKING_FORM);
  const [fieldErrors, setFieldErrors] = useState<BookFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [calendarRoom, setCalendarRoom] = useState<Resource | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const selected = resources.find((r) => r.id === form.resource_id);
  const startISO = form.check_in_date ? toISO(form.check_in_date, form.check_in_time) : "";
  const endISO = form.check_out_date ? toISO(form.check_out_date, form.check_out_time) : "";
  const hours = startISO && endISO ? hoursFrom(startISO, endISO) : 0;
  const isRoom = selected?.type === "room";
  const totalAmt = selected
    ? selected.type === "room" && selected.nightly_rate != null
      ? +(Math.max(1, Math.round(hours / 24)) * selected.nightly_rate).toFixed(2)
      : +(hours * (selected.hourly_rate ?? 0)).toFixed(2)
    : 0;
  const canSubmit = !!form.resource_id && hours > 0 && isValidName(form.guest_name)
    && (!isRoom || isValidPHPhone(form.guest_phone));

  function validateBeforeSave(): boolean {
    const errs: BookFieldErrors = {};
    if (!isValidName(form.guest_name)) {
      errs.name = "Enter a valid guest name (letters, hyphens, apostrophes, or periods — min 2 characters).";
    }
    const phone = form.guest_phone.trim();
    if (isRoom && !phone) {
      errs.phone = "Mobile number is required for room bookings.";
    } else if (phone && !isValidPHPhone(phone)) {
      errs.phone = "Enter a valid PH mobile number — Example: 9171234567";
    }
    const email = form.guest_email.trim();
    if (email && !isValidEmail(email)) {
      errs.email = "Enter a valid email address.";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleRoomSelect(r: Resource) { setCalendarRoom(r); setCalendarOpen(true); }
  function handleCalendarConfirm(checkIn: string, checkOut: string) {
    if (!calendarRoom) return;
    setCalendarOpen(false);
    setForm((f) => ({ ...f, resource_id: calendarRoom.id, check_in_date: checkIn, check_out_date: checkOut }));
  }

  function setFormField(field: keyof typeof EMPTY_BOOKING_FORM, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setFieldErrors((e) => ({ ...e, [field === "guest_name" ? "name" : field === "guest_phone" ? "phone" : field === "guest_email" ? "email" : field]: "" }));
  }

  function blurName() {
    if (form.guest_name.trim()) setForm((f) => ({ ...f, guest_name: formatPersonName(f.guest_name) }));
    if (!isValidName(form.guest_name) && form.guest_name.trim()) {
      setFieldErrors((e) => ({ ...e, name: "Enter a valid guest name (letters, hyphens, apostrophes, or periods — min 2 characters)." }));
    }
  }

  function blurPhone() {
    const p = form.guest_phone.trim();
    if (isRoom && !p) {
      setFieldErrors((e) => ({ ...e, phone: "Mobile number is required for room bookings." }));
    } else if (p && !isValidPHPhone(p)) {
      setFieldErrors((e) => ({ ...e, phone: "Enter a valid PH mobile number — Example: 9171234567" }));
    }
  }

  function closeForm() { setShowForm(false); setFieldErrors({}); }

  async function saveBooking(confirmAfterHold: boolean) {
    if (!canSubmit || !selected) return;
    if (!validateBeforeSave()) return;
    if (!getIsConnected()) { setErrorMsg("Room bookings require an internet connection."); return; }
    setSaving(true);
    const branchId = selected.branch_id ?? activeBranchId;
    if (!branchId) { setSaving(false); setErrorMsg("No branch linked to this room. Contact your admin."); return; }
    const rawPhone = form.guest_phone.trim();
    const { data: holdData, error: holdErr } = await invokeFn<{ booking: { id: string } }>("bookings-hold", {
      workspace_id: activeWorkspaceId, branch_id: branchId,
      resource_id: form.resource_id, start_time: startISO, end_time: endISO,
      notes: form.notes.trim() || undefined,
      guest_name: formatPersonName(form.guest_name) || undefined,
      guest_phone: rawPhone ? normalizePHPhone(rawPhone) : undefined,
      guest_email: form.guest_email.trim() || undefined,
    });
    if (holdErr || !holdData) {
      setSaving(false);
      const raw = (holdErr?.message ?? "").toLowerCase();
      if (raw.includes("turnaround_required") || raw.includes("turnaround")) {
        const mins = (holdErr?.message ?? "").match(/(\d+)\s*min/)?.[1] ?? "?";
        setErrorMsg(`Cannot book — ${selected.name}'s ${mins}-minute cleaning buffer hasn't elapsed since the previous booking. Try a later start time.`);
      } else if (raw.includes("booking_overlap") || raw.includes("overlap") || raw.includes("already booked")) {
        setErrorMsg("This room is already booked for the selected dates. Please choose a different date range.");
      } else if (raw.includes("past_booking_time") || raw.includes("past")) {
        setErrorMsg("The check-in date/time has already passed. Please select a future date.");
      } else if (raw.includes("resource_unavailable")) {
        setErrorMsg("This room is blocked for maintenance during the selected period. Please choose different dates.");
      } else if (raw.includes("resource_inactive") || raw.includes("resource_not_found") || raw.includes("inactive") || raw.includes("not found")) {
        setErrorMsg("This room is no longer available. Please select a different room.");
      } else if (raw.includes("invalid_date_range")) {
        setErrorMsg("The check-out time must be after the check-in time. Please review the dates and times.");
      } else {
        setErrorMsg(holdErr?.message ?? "Failed to hold room. It may already be booked.");
      }
      return;
    }

    if (confirmAfterHold) {
      const { error: confirmErr } = await invokeFn("bookings-confirm", { workspace_id: activeWorkspaceId, booking_id: holdData.booking.id });
      setSaving(false);
      if (confirmErr) { setErrorMsg("Room held but not confirmed: " + (confirmErr.message ?? "Unknown error")); return; }
      setShowForm(false); load(true);
      setSuccessInfo({ roomName: selected.name, guestName: form.guest_name.trim(), guestPhone: form.guest_phone.trim(),
        checkIn: `${form.check_in_date} ${form.check_in_time}`, checkOut: `${form.check_out_date} ${form.check_out_time}`,
        startISO, endISO, total: totalAmt, status: "confirmed",
        bookingId: holdData.booking.id, branchId: branchId ?? "" });
    } else {
      setSaving(false); setShowForm(false); load(true);
      setSuccessInfo({ roomName: selected.name, guestName: form.guest_name.trim(), guestPhone: form.guest_phone.trim(),
        checkIn: `${form.check_in_date} ${form.check_in_time}`, checkOut: `${form.check_out_date} ${form.check_out_time}`,
        startISO, endISO, total: totalAmt, status: "reserved" });
    }
  }

  return {
    showForm, setShowForm, form, fieldErrors, saving,
    calendarRoom, calendarOpen, setCalendarOpen,
    selected, startISO, endISO, hours, totalAmt, isRoom, canSubmit,
    handleRoomSelect, handleCalendarConfirm, setFormField, blurName, blurPhone, closeForm,
    saveBooking,
  };
}

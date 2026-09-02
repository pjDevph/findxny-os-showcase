import { useState, type Dispatch } from "react";
import { nowHour, buildISO } from "./dateHelpers";
import { applySelectResource, applyCalendarConfirm, applyAddBooking } from "./orderHelpers";
import type { CartAction } from "./cartReducer";
import type { Resource } from "./types";

/** Room/amenity booking form state within the order screen — selecting a
 *  resource, picking dates via the calendar/time-picker, and adding the
 *  resulting booking to the cart. */
export function useBookingForm(customerName: string, dispatch: Dispatch<CartAction>, showToast: (msg: string) => void) {
  const [selRes, setSelRes] = useState<Resource | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [bCheckIn, setBCheckIn] = useState("");
  const [bCheckOut, setBCheckOut] = useState("");
  const [bStartTime, setBStartTime] = useState(nowHour());
  const [bEndTime, setBEndTime] = useState("11:00");
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bGuest, setBGuest] = useState("");
  const [bPhone, setBPhone] = useState("");
  const [bEmail, setBEmail] = useState("");
  const [bNotes, setBNotes] = useState("");

  const bStartISO = selRes && bCheckIn ? buildISO(bCheckIn, bStartTime) : "";
  const bEndISO = selRes && bCheckIn
    ? (selRes.type === "room" && bCheckOut
        ? buildISO(bCheckOut, bEndTime)
        : buildISO(bCheckIn, bEndTime))
    : "";
  const bHrsActual = bStartISO && bEndISO
    ? Math.max(0, (new Date(bEndISO).getTime() - new Date(bStartISO).getTime()) / 3_600_000)
    : 0;
  const bNights = bHrsActual > 0 ? Math.max(1, Math.round(bHrsActual / 24)) : 0;
  const bIsNightly = selRes?.type === "room" && selRes?.nightly_rate != null;
  const bFormTotal = selRes && bHrsActual > 0
    ? bIsNightly
      ? +(bNights * selRes.nightly_rate!).toFixed(2)
      : +(bHrsActual * selRes.hourly_rate).toFixed(2)
    : 0;
  const bCanAdd = !!selRes && !!bStartISO && !!bEndISO && bHrsActual > 0 && !!bGuest.trim();

  function selectResource(r: Resource) {
    applySelectResource(r, selRes, customerName, {
      setSelRes, setBCheckIn, setBCheckOut, setBStartTime, setBEndTime, setBGuest, setCalendarOpen,
    });
  }

  function handleCalendarConfirm(checkIn: string, checkOut: string) {
    applyCalendarConfirm(checkIn, checkOut, selRes, {
      setBCheckIn, setBCheckOut, setCalendarOpen, setTimePickerOpen, setShowBookingModal,
    });
  }

  function addBooking() {
    applyAddBooking({
      selRes, bCanAdd, bStartISO, bEndISO, bCheckIn, bCheckOut,
      bGuest, bPhone, bEmail, bNotes, bFormTotal,
      dispatch, setShowBookingModal, setSelRes, setBCheckIn, setBCheckOut,
      setBNotes, setBPhone, setBEmail, showToast,
    });
  }

  return {
    selRes, setSelRes, calendarOpen, setCalendarOpen,
    bCheckIn, setBCheckIn, bCheckOut, setBCheckOut,
    bStartTime, setBStartTime, bEndTime, setBEndTime,
    timePickerOpen, setTimePickerOpen, showBookingModal, setShowBookingModal,
    bGuest, setBGuest, bPhone, setBPhone, bEmail, setBEmail, bNotes, setBNotes,
    bStartISO, bEndISO, bHrsActual, bNights, bIsNightly, bFormTotal, bCanAdd,
    selectResource, handleCalendarConfirm, addBooking,
  };
}

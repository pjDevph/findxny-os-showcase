import { useMemo, useState } from "react";
import { bookingRef, parseNotes } from "./bookingsHelpers";
import type { Booking, BookQuickFilter, FilterSort, Resource } from "./types";

const BOOK_PAGE_SIZE = 10;

export function useBookingFilters(bookings: Booking[], resources: Resource[]) {
  const [bookQuickFilter, setBookQuickFilter] = useState<BookQuickFilter>("all");
  const [filterCheckIn, setFilterCheckIn] = useState("");
  const [filterCheckOut, setFilterCheckOut] = useState("");
  const [filterRoom, setFilterRoom] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterSort, setFilterSort] = useState<FilterSort>("newest");
  const [bookPage, setBookPage] = useState(1);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    let list = [...bookings];
    if (bookQuickFilter === "today") {
      list = list.filter(b => b.start_time.slice(0, 10) === todayStr || b.end_time.slice(0, 10) === todayStr);
    } else if (bookQuickFilter === "upcoming") {
      list = list.filter(b => b.start_time.slice(0, 10) > todayStr && b.status !== "cancelled");
    } else if (bookQuickFilter === "pending_pay") {
      list = list.filter(b => b.status === "confirmed" && b.payment_status !== "paid" && b.total > 0);
    } else if (bookQuickFilter === "checked_in") {
      list = list.filter(b => b.status === "checked_in");
    } else if (bookQuickFilter === "cancelled") {
      list = list.filter(b => b.status === "cancelled");
    } else {
      list = list.filter(b => b.status !== "cancelled" && b.status !== "completed");
    }
    if (filterCheckIn) list = list.filter(b => b.start_time.slice(0, 10) >= filterCheckIn);
    if (filterCheckOut) list = list.filter(b => b.end_time.slice(0, 10) <= filterCheckOut);
    if (filterRoom !== "all") list = list.filter(b => b.resource_id === filterRoom);
    if (filterStatus === "hold") list = list.filter(b => b.status === "hold");
    if (filterStatus === "confirmed") list = list.filter(b => b.status === "confirmed");
    if (filterStatus === "checked_in") list = list.filter(b => b.status === "checked_in");
    if (filterStatus === "completed") list = list.filter(b => b.status === "completed");
    if (filterStatus === "cancelled") list = list.filter(b => b.status === "cancelled");
    if (filterPayment === "unpaid") list = list.filter(b => b.payment_status === "unpaid");
    if (filterPayment === "partial") list = list.filter(b => b.payment_status === "partial");
    if (filterPayment === "paid") list = list.filter(b => b.payment_status === "paid");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(b => {
        const { guestName, guestPhone } = parseNotes(b.notes);
        return (b.resource_name ?? "").toLowerCase().includes(q)
          || guestName.toLowerCase().includes(q)
          || guestPhone.toLowerCase().includes(q)
          || bookingRef(b.id).toLowerCase().includes(q);
      });
    }
    list.sort((a, b2) => {
      if (filterSort === "oldest" || filterSort === "checkin_asc")
        return new Date(a.start_time).getTime() - new Date(b2.start_time).getTime();
      return new Date(b2.start_time).getTime() - new Date(a.start_time).getTime();
    });
    return list;
  }, [bookings, bookQuickFilter, filterCheckIn, filterCheckOut, filterRoom, filterStatus, filterPayment, filterSort, search]);

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / BOOK_PAGE_SIZE));
  const paginatedBookings = filtered.slice((bookPage - 1) * BOOK_PAGE_SIZE, bookPage * BOOK_PAGE_SIZE);

  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const dayStart = new Date(todayStr + "T00:00:00");
    const dayEnd = new Date(todayStr + "T23:59:59");
    const available = resources.filter(r => !bookings.some(b =>
      b.resource_id === r.id && b.status !== "cancelled" &&
      new Date(b.start_time) < dayEnd && new Date(b.end_time) > dayStart
    )).length;
    const reserved = bookings.filter(b =>
      b.status === "confirmed" && !b.checked_in_at &&
      new Date(b.start_time) < dayEnd && new Date(b.end_time) > dayStart
    ).length;
    const checkIns = bookings.filter(b =>
      (b.status === "hold" || b.status === "confirmed") &&
      new Date(b.start_time) >= dayStart && new Date(b.start_time) < dayEnd
    ).length;
    const checkedIn = bookings.filter(b => b.status === "checked_in").length;
    const pendingPay = bookings.filter(b => b.status === "confirmed" && b.payment_status === "unpaid").length;
    return { available, reserved, checkIns, checkedIn, pendingPay };
  }, [bookings, resources]);

  function clearFilters() {
    setFilterCheckIn(""); setFilterCheckOut("");
    setFilterRoom("all"); setFilterStatus("all"); setFilterPayment("all");
    setBookPage(1);
  }

  return {
    bookQuickFilter, setBookQuickFilter,
    filterCheckIn, setFilterCheckIn, filterCheckOut, setFilterCheckOut,
    filterRoom, setFilterRoom, filterStatus, setFilterStatus, filterPayment, setFilterPayment,
    filterSort, setFilterSort, bookPage, setBookPage, search, setSearch,
    filtered, totalFiltered, totalPages, paginatedBookings, stats,
    clearFilters, BOOK_PAGE_SIZE,
  };
}

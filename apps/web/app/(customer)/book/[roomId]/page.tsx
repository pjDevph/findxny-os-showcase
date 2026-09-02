"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { WORKSPACE_SLUG, peso } from "@/lib/config";
import { useContentIdempotencyKey } from "@/lib/useButtonCooldown";
import { type Resource, roomRate, AmenityIcon, RoomImage, PhotoPlaceholder } from "../../_shared/roomDisplay";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WDAYS  = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function som(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function shiftM(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function nightsBetween(a: string, b: string) {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}
// True when the URL intent range is valid and free of any booked nights.
function intentRangeIsClean(
  qIn: string, qOut: string, todayStr: string,
  booked: { start: string; end: string }[],
): boolean {
  if (!(qIn && qOut && qIn >= todayStr && qIn < qOut)) return false;
  const end = new Date(qOut);
  for (const cur = new Date(qIn); cur < end; cur.setDate(cur.getDate() + 1)) {
    const day = ymd(cur);
    if (booked.some((r) => r.start <= day && day < r.end)) return false;
  }
  return true;
}

const LBL: React.CSSProperties = {
  fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.16em",
  textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8,
};

type FieldErrors = Record<string, string>;

// Phone state stores only the 10 raw digits (e.g. "9171234567").
// The +63 prefix is shown in the UI as a fixed label and prepended on submit.
function isValidPHPhone(digits: string): boolean {
  return /^9\d{9}$/.test(digits);
}

function isValidName(v: string): boolean {
  const t = v.trim();
  return t.length >= 3 && t.length <= 80 && /^[A-Za-zÀ-ÿÑñ\s'\-.]+$/.test(t);
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function formatPersonName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => word.split("-").map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part).join("-"))
    .join(" ");
}

const MAX_NOTES = 300;

function sanitizeNoteInput(value: string): string {
  return value
    .replace(/[\x00-\x1F\x7F]/g, "")  // strip control/invisible characters
    .replace(/<[^>]*>/g, "")           // strip HTML tags
    .replace(/\s{3,}/g, "  ")         // collapse excessive whitespace
    .slice(0, MAX_NOTES);
}

function validateBookingForm(
  room: Resource | null,
  checkIn: string,
  checkOut: string,
  checkInTime: string,
  nights: number,
  name: string,
  phone: string,
  email: string,
  notes: string,
  partySize: number,
  additionalGuests: { name: string; phone: string }[],
): { topError: string | null; fieldErrors: FieldErrors; firstErrorId: string | null } {
  const fe: FieldErrors = {};
  let firstErrorId: string | null = null;

  function mark(key: string, msg: string, id: string) {
    if (!fe[key]) fe[key] = msg;
    if (!firstErrorId) firstErrorId = id;
  }

  if (!room || !checkIn || !checkOut) {
    return { topError: "Please select your check-in and check-out dates first.", fieldErrors: fe, firstErrorId: null };
  }
  if (nights < 1) {
    return { topError: "Check-out date must be after check-in date.", fieldErrors: fe, firstErrorId: null };
  }

  // Guard against stale selections (left tab open overnight, pre-filled URL, etc.)
  const todayStr = new Date().toISOString().slice(0, 10);
  if (checkIn < todayStr) {
    return { topError: "Check-in date has already passed. Please go back and select a future date.", fieldErrors: fe, firstErrorId: null };
  }
  if (checkIn === todayStr) {
    const [hh, mm] = checkInTime.split(":").map(Number);
    const startDt = new Date(checkIn); startDt.setHours(hh, mm, 0, 0);
    if (startDt.getTime() < Date.now() - 60_000) {
      return { topError: "Your arrival time has already passed for today. Please update the arrival time or select a future date.", fieldErrors: fe, firstErrorId: null };
    }
  }

  // Capacity
  const maxPax = room.max_pax ?? room.capacity;
  if (maxPax && partySize > maxPax) {
    mark("guests", `This room allows up to ${maxPax} guest${maxPax === 1 ? "" : "s"} only.`, "bk-guests");
  }

  // Primary guest — name
  if (!name.trim()) {
    mark("name", "Please enter the guest’s full name.", "bk-name");
  } else if (!isValidName(name)) {
    mark("name", "Name can only contain letters, spaces, hyphens, and apostrophes (min. 3 characters).", "bk-name");
  }

  // Primary guest — phone (stores 10 digits, e.g. 9171234567)
  if (!phone.trim()) {
    mark("phone", "Please enter a valid Philippine mobile number.", "bk-phone");
  } else if (!isValidPHPhone(phone)) {
    mark("phone", "Enter 10 digits starting with 9 (e.g. 9171234567).", "bk-phone");
  }

  // Primary guest — email (required for payment confirmation)
  if (!email.trim()) {
    mark("email", "Please enter a valid email address.", "bk-email");
  } else if (!isValidEmail(email)) {
    mark("email", "Please enter a valid email address.", "bk-email");
  }

  // Special requests length
  if (notes.length > 300) {
    mark("notes", "Special requests must be 300 characters or less.", "bk-notes");
  }

  // Additional guests — name required, mobile optional (validate if filled)
  for (let i = 0; i < partySize - 1; i++) {
    const g = additionalGuests[i] ?? { name: "", phone: "" };
    const nameKey  = `guest${i + 2}_name`;
    const phoneKey = `guest${i + 2}_phone`;
    const nameId   = `bk-g${i + 2}-name`;
    const phoneId  = `bk-g${i + 2}-phone`;

    if (!g.name.trim()) {
      mark(nameKey, `Please enter guest ${i + 2}’s full name.`, nameId);
    } else if (!isValidName(g.name)) {
      mark(nameKey, "Name can only contain letters, spaces, hyphens, and apostrophes.", nameId);
    }
    if (g.phone.trim() && !isValidPHPhone(g.phone)) {
      mark(phoneKey, "Please enter a valid Philippine mobile number.", phoneId);
    }
  }

  const hasErrors = Object.keys(fe).length > 0;
  return {
    topError: hasErrors ? "Please fix the highlighted fields before continuing." : null,
    fieldErrors: fe,
    firstErrorId,
  };
}

function persistBookingToSession(payload: {
  bookingRef: string; roomName: string; checkIn: string | null;
  checkOut: string | null; nights: number; total: number; method: string;
  workspaceName: string; name: string; phone: string; email: string | undefined;
  guests: number; checkInTime: string; roomRate: number; cleaningFee: number | null;
  securityDeposit: number | null; workspacePhone: string | undefined;
  voucherCode?: string; voucherName?: string; discountAmount?: number; originalTotal?: number;
}) {
  sessionStorage.setItem("mtm.lastBooking", JSON.stringify(payload));
}

function buildCalendarRows(calMonth: Date): Array<Array<{ date: string; n: number } | null>> {
  const first = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  const last  = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0);
  const flat: Array<{ date: string; n: number } | null> = [];
  for (let i = 0; i < first.getDay(); i++) flat.push(null);
  const d = new Date(first);
  while (d <= last) { flat.push({ date: ymd(d), n: d.getDate() }); d.setDate(d.getDate() + 1); }
  while (flat.length % 7) flat.push(null);
  const rows: typeof flat[] = [];
  for (let i = 0; i < flat.length; i += 7) rows.push(flat.slice(i, i + 7));
  return rows;
}

function resolveDayState(
  d: string,
  todayStr: string,
  selStart: string | null,
  selEnd: string | null,
  isOccupied: (d: string) => boolean,
  bookedRanges: { start: string; end: string }[],
): string {
  if (d < todayStr) return "past";
  if (selStart && d === selStart) return selEnd ? "start" : "start-only";
  if (selEnd   && d === selEnd)   return "end";
  if (selStart && selEnd && d > selStart && d < selEnd) return "in-range";
  if (isOccupied(d)) return "occupied";
  if (bookedRanges.some((r) => r.end === d)) return "departure";
  if (d === todayStr) return "today";
  return "available";
}

function prefillUserMeta(
  meta: Record<string, unknown>,
  email: string | undefined,
  setName: (v: string) => void,
  setEmail: (v: string) => void,
  setPhone: (v: string) => void,
) {
  if (meta.full_name) setName(meta.full_name as string);
  if (email) setEmail(email);
  if (meta.phone) {
    const raw = (meta.phone as string).replace(/^\+63|^63|^0/, "");
    setPhone(raw.replace(/\D/g, "").slice(0, 10));
  }
}

async function submitBooking(opts: { // NOSONAR
  room: Resource;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  partySize: number;
  name: string;
  phone: string;
  email: string;
  notes: string;
  paymentMethod: "gcash" | "maya" | "card" | "qrph";
  selStart: string | null;
  selEnd: string | null;
  nights: number;
  workspaceName: string;
  workspacePhone: string | null;
  voucherCode?: string;
  idempotencyKey: string;
}): Promise<{ checkout_url?: string; booking: { id: string; total: number; discount: number; voucher_code: string | null } }> {
  const { room, checkIn, checkOut, checkInTime, partySize, name, phone, email, notes, paymentMethod, voucherCode, idempotencyKey } = opts;
  const [hh, mm] = checkInTime.split(":").map(Number);
  const start = new Date(checkIn);  start.setHours(hh, mm, 0, 0);
  const end   = new Date(checkOut); end.setHours(hh, mm, 0, 0);
  return api.guestBooking({
    workspace_slug: WORKSPACE_SLUG,
    resource_id:    room.id,
    customer: { name: name.trim(), phone: `+63${phone.trim()}`, email: email.trim() || undefined },
    start_time: start.toISOString(), end_time: end.toISOString(),
    party_size: partySize, notes: notes || undefined,
    payment_method: paymentMethod,
    voucher_code: voucherCode,
  }, { idempotencyKey });
}

export default function BookRoomPage() {
  const params       = useParams();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const supabase     = supabaseBrowser();
  const roomId       = params.roomId as string;

  // Intent from URL query — pre-fills calendar and guests
  const qIn     = searchParams.get("in")  ?? "";
  const qOut    = searchParams.get("out") ?? "";
  const qGuests = Number(searchParams.get("g") ?? "2") || 2;

  // Resource + workspace
  const [room, setRoom]                     = useState<Resource | null>(null);
  const [workspacePhone, setWorkspacePhone] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName]   = useState("");
  const [loading, setLoading]               = useState(true);
  const [notFound, setNotFound]             = useState(false);

  // Photo gallery
  const [photoIdx, setPhotoIdx] = useState(0);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [showAllInclusions, setShowAllInclusions] = useState(false);

  // Calendar / availability
  const [bookedRanges, setBookedRanges] = useState<{ start: string; end: string }[]>([]);
  const [calMonth, setCalMonth]         = useState(() => som(qIn ? new Date(qIn) : new Date()));
  const [calLoading, setCalLoading]     = useState(true);
  const [selStart, setSelStart]         = useState<string | null>(null);
  const [selEnd, setSelEnd]             = useState<string | null>(null);
  const todayStr                         = useMemo(() => ymd(new Date()), []);

  // Guest form
  const [checkIn, setCheckIn]           = useState("");
  const [checkOut, setCheckOut]         = useState("");
  const [checkInTime, setCheckInTime]   = useState("15:00");
  const [partySize, setPartySize]       = useState(qGuests);
  const [name, setName]                 = useState("");
  const [phone, setPhone]               = useState("");
  const [email, setEmail]               = useState("");
  const [notes, setNotes]               = useState("");
  const [additionalGuests, setAdditionalGuests] = useState<{ name: string; phone: string }[]>([]);
  const [fieldErrors, setFieldErrors]   = useState<FieldErrors>({});
  // Bookings must be paid online — no "pay at counter" option (unlike food orders).
  const [paymentMethod, setPaymentMethod] = useState<"gcash" | "maya" | "card" | "qrph">("gcash");
  const [step, setStep]                 = useState<"form" | "review">("form");
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [success, setSuccess]           = useState<{ bookingId: string; total: number } | null>(null);
  // Guards against confirmAndBook firing twice from a fast double-click/tap —
  // synchronous, so it closes the gap before setSubmitting(true) re-renders.
  const submittingRef = useRef(false);

  // Success screen extras
  const receiptRef                       = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading]   = useState(false);
  const [emailInput, setEmailInput]     = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailMsg, setEmailMsg]         = useState<{ ok: boolean; text: string } | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);

  // Voucher
  const [voucherInput, setVoucherInput]   = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState<{ code: string; name: string; discount: number } | null>(null);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [voucherError, setVoucherError]   = useState<string | null>(null);

  // Sync additional guest slots when partySize changes
  useEffect(() => {
    const needed = Math.max(0, partySize - 1);
    setAdditionalGuests((prev) => {
      if (prev.length === needed) return prev;
      if (prev.length > needed) return prev.slice(0, needed);
      return [...prev, ...Array.from({ length: needed - prev.length }, () => ({ name: "", phone: "" }))];
    });
  }, [partySize]);

  // Prefill user info if signed in
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (u) prefillUserMeta(u.user_metadata ?? {}, u.email, setName, setEmail, setPhone);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the room + availability
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.rooms(WORKSPACE_SLUG);
        if (!alive) return;
        const found = (res.rooms as unknown as Resource[]).find((r) => r.id === roomId);
        if (!found) { setNotFound(true); setLoading(false); return; }
        setRoom(found);
        setWorkspacePhone(res.workspace.phone);
        setWorkspaceName(res.workspace.name);
        setLoading(false);

        const avail = await api.roomAvailability(WORKSPACE_SLUG, roomId);
        if (!alive) return;
        setBookedRanges(avail.booked);
        // Pre-fill from intent if clean
        if (intentRangeIsClean(qIn, qOut, todayStr, avail.booked)) {
          setSelStart(qIn); setSelEnd(qOut);
          setCheckIn(qIn); setCheckOut(qOut);
          setCalMonth(som(new Date(qIn)));
        }
      } catch {
        if (alive) { setNotFound(true); setLoading(false); }
      } finally {
        if (alive) setCalLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    if (selStart) setCheckIn(selStart);
    if (selEnd)   setCheckOut(selEnd);
  }, [selStart, selEnd]);

  // Default arrival time to the room's actual check-in time (e.g. 16:00),
  // so the form matches the "Check-in 16:00" shown in the room details.
  useEffect(() => {
    if (room?.check_in_time) setCheckInTime(room.check_in_time.slice(0, 5));
  }, [room]);

  // Calendar helpers
  const isOccupied = (d: string) => bookedRanges.some((r) => r.start <= d && d < r.end);
  const rangeClean = (a: string, b: string) => {
    const end = new Date(b); let d = new Date(a);
    while (d < end) {
      if (isOccupied(ymd(d))) return false;
      d.setDate(d.getDate() + 1);
    }
    return true;
  };
  function tapDay(dateStr: string) {
    if (dateStr < todayStr || isOccupied(dateStr)) return;
    if (!selStart || selEnd) { setSelStart(dateStr); setSelEnd(null); return; }
    if (dateStr <= selStart) { setSelStart(dateStr); setSelEnd(null); return; }
    if (rangeClean(selStart, dateStr)) setSelEnd(dateStr);
    else { setSelStart(dateStr); setSelEnd(null); }
  }
  function dayState(d: string) {
    return resolveDayState(d, todayStr, selStart, selEnd, isOccupied, bookedRanges);
  }
  const calRows = useMemo(() => buildCalendarRows(calMonth), [calMonth]);
  const canGoBack = som(calMonth) > som(new Date());

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const total  = room ? nights * roomRate(room) : 0;
  const discountedTotal = +(total - (appliedVoucher?.discount ?? 0)).toFixed(2);

  // Reactive date problem — shown inline near the calendar so the user sees it immediately
  const dateProblem = useMemo((): string | null => {
    if (!selStart) return null;
    const todayD = new Date().toISOString().slice(0, 10);
    if (selStart < todayD) return "This date has already passed. Please select a future check-in date.";
    if (selStart === todayD) {
      const [hh, mm] = checkInTime.split(":").map(Number);
      const startDt = new Date(selStart);
      startDt.setHours(hh, mm, 0, 0);
      if (startDt.getTime() < Date.now() - 60_000) {
        return "Your arrival time has already passed for today. Please update the arrival time or pick a future date.";
      }
    }
    return null;
  }, [selStart, checkInTime]);

  const isFormReady = useMemo(() => {
    if (!selStart || !selEnd || dateProblem) return false;
    if (!isValidName(name) || !isValidPHPhone(phone) || !isValidEmail(email)) return false;
    for (let i = 0; i < partySize - 1; i++) {
      const g = additionalGuests[i];
      if (!g || !isValidName(g.name)) return false;
    }
    return true;
  }, [selStart, selEnd, dateProblem, name, phone, email, partySize, additionalGuests]);

  useEffect(() => {
    if (isFormReady) { setError(null); setFieldErrors({}); }
  }, [isFormReady]);

  // Derived from the actual booking content: a refresh-and-retry of the same
  // booking reuses this key (server treats it as the same attempt, not a new
  // hold), while editing the dates/form after a failed attempt gets a fresh
  // key automatically (the server rejects a reused key with a changed body).
  const idemKey = useContentIdempotencyKey({
    room_id: room?.id, checkIn, checkOut, checkInTime, partySize,
    name: name.trim(), phone: phone.trim(), email: email.trim(), notes,
    paymentMethod, voucher_code: appliedVoucher?.code,
  });

  async function applyVoucher() {
    const code = voucherInput.trim().toUpperCase();
    if (!code) return;
    setVoucherLoading(true); setVoucherError(null);
    try {
      const res = await api.validateVoucher({ workspace_slug: WORKSPACE_SLUG, voucher_code: code, subtotal: total });
      if (!res.valid) { setVoucherError(res.reason ?? "Invalid voucher"); return; }
      setAppliedVoucher({ code: res.voucher_code ?? code, name: res.voucher_name ?? code, discount: res.discount_amount });
    } catch (e: any) {
      setVoucherError(e.message || "Could not validate voucher");
    } finally { setVoucherLoading(false); }
  }

  function handleBook(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const { topError, fieldErrors: fe, firstErrorId } = validateBookingForm(
      room, checkIn, checkOut, checkInTime, nights, name, phone, email, notes, partySize, additionalGuests,
    );
    if (topError) {
      setError(topError);
      setFieldErrors(fe);
      requestAnimationFrame(() => {
        const el = firstErrorId ? document.getElementById(firstErrorId) : null;
        if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus(); }
      });
      return;
    }
    setStep("review");
  }

  async function confirmAndBook() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await submitBooking({
        room: room!, checkIn, checkOut, checkInTime, partySize,
        name, phone, email, notes, paymentMethod,
        selStart, selEnd, nights, workspaceName, workspacePhone,
        voucherCode: appliedVoucher?.code,
        idempotencyKey: idemKey,
      });
      if (res.checkout_url) {
        // Use Number() to guard against Supabase returning NUMERIC columns as strings,
        // which would cause "3800.00" + "200.00" = "3800.00200.00" (string concat).
        const bookingDiscount = Number(res.booking.discount ?? 0);
        const bookingTotal    = Number(res.booking.total);
        // Use backend-confirmed voucher_code as source of truth; appliedVoucher?.code
        // is frontend state that can be cleared before this point.
        const confirmedVoucherCode = res.booking.voucher_code ?? appliedVoucher?.code;
        persistBookingToSession({
          bookingRef:      res.booking.id.slice(0, 8).toUpperCase(),
          roomName:        room!.name,
          checkIn:         selStart,
          checkOut:        selEnd,
          nights,
          total:           bookingTotal,
          method:          paymentMethod,
          workspaceName,
          name, phone, email: email || undefined,
          guests:          partySize,
          checkInTime,
          roomRate:        roomRate(room!),
          cleaningFee:     room!.cleaning_fee ?? null,
          securityDeposit: room!.security_deposit ?? null,
          workspacePhone:  workspacePhone ?? undefined,
          voucherCode:     confirmedVoucherCode || undefined,
          voucherName:     appliedVoucher?.name,
          discountAmount:  bookingDiscount > 0 ? bookingDiscount : undefined,
          originalTotal:   Number((bookingTotal + bookingDiscount).toFixed(2)),
        });
        window.location.href = res.checkout_url;
        return;
      }
      setSuccess({ bookingId: res.booking.id, total: res.booking.total });
    } catch (e: any) {
      const raw = (e.message ?? "").toLowerCase();
      if (raw.includes("past")) {
        setError("Your check-in date has already passed. Please go back and select a future date.");
        setStep("form");
      } else if (raw.includes("overlap") || raw.includes("already booked") || raw.includes("time slot")) {
        setError("This room is no longer available for your selected dates. Please go back and choose different dates.");
        setStep("form");
      } else if (raw.includes("capacity")) {
        setError("Guest count exceeds room capacity. Please reduce the number of guests.");
        setStep("form");
      } else if (raw.includes("inactive") || raw.includes("not found")) {
        setError("This room is no longer available. Please go back and try a different room.");
      } else {
        setError(e.message || "Booking failed. Please try again.");
      }
    } finally { setSubmitting(false); submittingRef.current = false; }
  }

  async function downloadReceipt() {
    if (!receiptRef.current || downloading) return;
    setDownloading(true);
    try {
      const h2c = (await import("html2canvas")).default;
      const canvas = await h2c(receiptRef.current, { scale: 2, useCORS: true });
      const link = document.createElement("a");
      link.download = `booking-${success?.bookingId.slice(0, 8).toUpperCase()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally { setDownloading(false); }
  }

  async function emailReceipt(e: React.FormEvent) {
    e.preventDefault();
    if (!success) return;
    const to = email || emailInput;
    if (!to) return;
    setEmailSending(true); setEmailMsg(null);
    try {
      await api.sendBookingReceipt({
        to,
        booking_ref: success.bookingId.slice(0, 8).toUpperCase(),
        phone:       phone ? `+63${phone.trim()}` : undefined,
        method:      paymentMethod,
      });
      setEmailMsg({ ok: true, text: `Receipt sent to ${to}` });
    } catch (err: any) {
      setEmailMsg({ ok: false, text: err.message || "Failed to send" });
    } finally { setEmailSending(false); }
  }

  // ── Success screen ──
  if (success && room) {
    return (
      <div className="succ-wrap">
        <div className="succ">
          <div className="receipt">
            <div ref={receiptRef}>
              <div className="check">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <h1>Booking Held!</h1>
              <p className="sub">Your room is on hold for 10 minutes. Pay at the front desk to confirm.</p>
              <div className="ref-card">
                <div className="lbl">Booking Reference</div>
                <div className="ref">{success.bookingId.slice(0, 8).toUpperCase()}</div>
              </div>
              <div className="det">
                <div className="row-d"><span className="k">Room</span><span className="v">{room.name}</span></div>
                <div className="row-d"><span className="k">Check-in</span><span className="v">{fmtDate(checkIn)}</span></div>
                <div className="row-d"><span className="k">Check-out</span><span className="v">{fmtDate(checkOut)}</span></div>
                <div className="row-d"><span className="k">Nights</span><span className="v">{nights}</span></div>
              </div>
              <div className="total-line">
                <span className="l">Total</span>
                <span className="a">{peso(success.total)}</span>
              </div>
              <div style={{ marginTop: 20, padding: 14, background: "rgba(255,184,77,0.1)", borderRadius: 10, border: "1px solid rgba(255,184,77,0.3)", fontSize: 13, color: "var(--warn)", lineHeight: 1.5 }}>
                ⚡ Hold expires in 10 minutes.{workspacePhone ? <> Call <strong>{workspacePhone}</strong> or</> : null} Visit the front desk to pay and confirm.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1, fontSize: 13 }} onClick={downloadReceipt} disabled={downloading}>
                {downloading ? "Saving…" : "⬇ Download"}
              </button>
              <button className="btn btn-ghost" style={{ flex: 1, fontSize: 13 }} onClick={() => setShowEmailForm((v) => !v)}>
                ✉ Email copy
              </button>
            </div>
            {showEmailForm && (
              <form onSubmit={emailReceipt} style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {!email && (
                  <input className="input" type="email" placeholder="your@email.com" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} required />
                )}
                {email && <p style={{ fontSize: 13, color: "var(--text-3)", margin: 0 }}>Sending to {email}</p>}
                <button className="btn btn-primary" type="submit" disabled={emailSending}>
                  {emailSending ? "Sending…" : "Send receipt"}
                </button>
                {emailMsg && (
                  <p style={{ fontSize: 13, color: emailMsg.ok ? "var(--green, #4ade80)" : "var(--err)", margin: 0 }}>{emailMsg.text}</p>
                )}
              </form>
            )}
            <div className="actions" style={{ marginTop: 24 }}>
              <Link href="/" className="btn btn-ghost btn-lg">← Back to home</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading / not-found ──
  if (loading) {
    return (
      <div className="container" style={{ paddingBlock: "64px 80px", textAlign: "center", color: "var(--text-3)", fontFamily: "var(--f-mono)" }}>
        Loading room…
      </div>
    );
  }
  if (notFound || !room) {
    return (
      <div className="container" style={{ paddingBlock: "64px 80px", textAlign: "center" }}>
        <h1 className="h-display h2" style={{ margin: "0 0 12px" }}>Room not found</h1>
        <p style={{ color: "var(--text-3)", marginBottom: 24 }}>This room may have been removed or the link is incorrect.</p>
        <Link href="/booking-cart" className="btn btn-primary">← Back to all rooms</Link>
      </div>
    );
  }

  // ── Main detail page ──
  const photos     = (room.photos?.length ? room.photos : room.cover_photo ? [room.cover_photo] : []);
  const inclusions = room.inclusions ?? [];
  const capacityNum = room.base_pax ?? room.capacity ?? 2;

  const PAY_LABELS: Record<string, string> = { gcash: "GCash", maya: "Maya", card: "Card", qrph: "QR Ph" };

  // ── Review step ──
  if (step === "review" && room) {
    return (
      <div className="container" style={{ paddingBlock: "40px 80px", maxWidth: 520, margin: "0 auto" }}>
        <button
          type="button"
          onClick={() => setStep("form")}
          style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 13, fontFamily: "var(--f-mono)", cursor: "pointer", padding: 0, letterSpacing: "0.06em", marginBottom: 24 }}
        >
          ← Edit
        </button>

        <h2 style={{ fontFamily: "var(--f-display)", fontSize: 24, margin: "0 0 24px", letterSpacing: "0.01em" }}>Review your booking</h2>

        {/* Room */}
        <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--line)" }}>
          <div style={LBL}>Room</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{room.name}</div>
        </div>

        {/* Dates */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--line)" }}>
          <div>
            <div style={LBL}>Check-in</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDate(checkIn)}</div>
          </div>
          <div>
            <div style={LBL}>Check-out</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDate(checkOut)}</div>
          </div>
          <div>
            <div style={LBL}>Nights</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{nights}</div>
          </div>
        </div>

        {/* Guests + payment */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--line)" }}>
          <div>
            <div style={LBL}>Guests</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{partySize} {partySize === 1 ? "guest" : "guests"}</div>
          </div>
          <div>
            <div style={LBL}>Payment</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{PAY_LABELS[paymentMethod]}</div>
          </div>
        </div>

        {/* Guest info */}
        <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--line)" }}>
          <div style={LBL}>Guest details</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 14 }}><span style={{ color: "var(--text-3)", marginRight: 8 }}>Name</span>{name}</div>
            <div style={{ fontSize: 14 }}><span style={{ color: "var(--text-3)", marginRight: 8 }}>Phone</span>{phone}</div>
            {email && <div style={{ fontSize: 14 }}><span style={{ color: "var(--text-3)", marginRight: 8 }}>Email</span>{email}</div>}
            {notes && <div style={{ fontSize: 14 }}><span style={{ color: "var(--text-3)", marginRight: 8 }}>Notes</span>{notes}</div>}
          </div>
        </div>

        {/* Price breakdown */}
        <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 }}>
            <span>{nights} night{nights !== 1 ? "s" : ""} × {peso(roomRate(room))}</span>
            <span>{peso(total)}</span>
          </div>
          {appliedVoucher && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--green, #4ade80)", marginBottom: 6 }}>
              <span>Voucher ({appliedVoucher.code})</span>
              <span>−{peso(appliedVoucher.discount)}</span>
            </div>
          )}
          {room.cleaning_fee ? (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-3)", marginBottom: 6 }}>
              <span>Cleaning fee · at front desk</span>
              <span>{peso(room.cleaning_fee)}</span>
            </div>
          ) : null}
          {room.security_deposit ? (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-3)", marginBottom: 6 }}>
              <span>Security deposit · refundable</span>
              <span>{peso(room.security_deposit)}</span>
            </div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginTop: 12 }}>
            <span>Total due today</span>
            <span style={{ color: "var(--amber-bright, var(--amber))" }}>{peso(discountedTotal)}</span>
          </div>
          {(room.cleaning_fee || room.security_deposit) ? (
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6, lineHeight: 1.5 }}>
              Cleaning fee and refundable deposit are settled at the front desk — not charged online.
            </div>
          ) : null}
        </div>

        {/* Voucher */}
        <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--line)" }}>
          <div style={LBL}>Voucher / promo code</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              type="text"
              placeholder="Enter code"
              value={voucherInput}
              onChange={(e) => { setVoucherInput(e.target.value.toUpperCase()); setVoucherError(null); }}
              disabled={!!appliedVoucher}
              style={{ flex: 1, textTransform: "uppercase" }}
            />
            {appliedVoucher ? (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 12 }}
                onClick={() => { setAppliedVoucher(null); setVoucherInput(""); setVoucherError(null); }}
              >
                Remove
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: 12 }}
                onClick={applyVoucher}
                disabled={!voucherInput.trim() || voucherLoading}
              >
                {voucherLoading ? "…" : "Apply"}
              </button>
            )}
          </div>
          {voucherError && (
            <p style={{ fontSize: 12, color: "var(--err)", margin: "6px 0 0" }}>{voucherError}</p>
          )}
          {appliedVoucher && (
            <p style={{ fontSize: 12, color: "var(--green, #4ade80)", margin: "6px 0 0" }}>
              {appliedVoucher.name} applied · −{peso(appliedVoucher.discount)}
            </p>
          )}
        </div>

        {/* Cancellation warning */}
        <div style={{ fontSize: 12, color: "var(--err, #ef4444)", marginBottom: 20, lineHeight: 1.5, padding: "10px 12px", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8 }}>
          ⚠ Cancellations are not available within 48 hours of your selected check-in time ({checkInTime}).
        </div>

        {error && (
          <div style={{ padding: "12px 14px", background: "rgba(255,107,94,0.1)", border: "1px solid rgba(255,107,94,0.3)", borderRadius: 10, color: "var(--err)", fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ flex: 1 }}
            onClick={() => setStep("form")}
          >
            ← Edit
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 2, opacity: submitting ? 0.6 : 1 }}
            disabled={submitting}
            onClick={confirmAndBook}
          >
            {submitting ? "Processing…" : "Confirm & Pay →"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center", lineHeight: 1.5, marginTop: 10 }}>
          You&apos;ll be redirected to a secure payment page · Booking confirmed on payment
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="container book-detail" style={{ paddingBlock: "32px 80px" }}>
      {/* Breadcrumb back */}
      <div style={{ marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => router.push("/booking-cart")}
          style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 13, fontFamily: "var(--f-mono)", cursor: "pointer", padding: 0, letterSpacing: "0.06em" }}
        >
          ← Back to all rooms
        </button>
      </div>

      <div className="book-detail-grid">
        {/* ── LEFT: room info + photo gallery ── */}
        <div>
          {/* Photo gallery */}
          <div className="book-photo">
            <PhotoPlaceholder />
            {photos.length > 0 && (
              <RoomImage key={photos[photoIdx]} src={photos[photoIdx]} alt={room.name} />
            )}
            {photos.length > 1 && (
              <>
                <button type="button" className="photo-nav" style={{ left: 12 }}
                  onClick={() => setPhotoIdx((i) => (i - 1 + photos.length) % photos.length)} aria-label="Previous photo">‹</button>
                <button type="button" className="photo-nav" style={{ right: 12 }}
                  onClick={() => setPhotoIdx((i) => (i + 1) % photos.length)} aria-label="Next photo">›</button>
                <div className="photo-dots">
                  {photos.map((_, i) => (
                    <button type="button" key={i} aria-label={`Go to photo ${i + 1}`}
                      className={`photo-dot${i === photoIdx ? " active" : ""}`}
                      onClick={() => setPhotoIdx(i)} />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllPhotos(true)}
                  style={{ position: "absolute", bottom: 14, right: 14, padding: "6px 12px", borderRadius: 999, background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 11, fontFamily: "var(--f-mono)", letterSpacing: "0.08em", cursor: "pointer", zIndex: 3 }}
                >
                  View all {photos.length} photos
                </button>
              </>
            )}
          </div>

          {/* Photo thumbnails — quick row */}
          {photos.length > 1 && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto", paddingBottom: 4 }}>
              {photos.slice(0, 6).map((src, i) => (
                <button
                  key={src + i}
                  type="button"
                  onClick={() => setPhotoIdx(i)}
                  style={{ flex: "0 0 80px", height: 60, borderRadius: 8, overflow: "hidden", border: i === photoIdx ? "2px solid var(--amber)" : "1px solid var(--line)", padding: 0, cursor: "pointer", background: "var(--bg-3)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
              ))}
            </div>
          )}

          {/* Room title block */}
          <div style={{ marginTop: 24 }}>
            <div className="eyebrow">Loft Staycation</div>
            <h1 className="h-display h1" style={{ margin: "8px 0 12px", letterSpacing: "0.01em" }}>{room.name}</h1>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 16 }}>
              For {capacityNum} guests
              {room.min_nights && room.min_nights > 1 ? ` · ${room.min_nights}-night minimum` : ""}
              {room.check_in_time ? ` · Check-in ${room.check_in_time}` : ""}
            </div>
            {room.short_description && (
              <p style={{ color: "var(--text-1)", fontSize: 15, lineHeight: 1.6, margin: "0 0 16px" }}>{room.short_description}</p>
            )}
            {room.description && (
              <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.7, margin: 0 }}>{room.description}</p>
            )}
          </div>

          {/* Amenities — show top highlights first, rest behind a toggle */}
          {inclusions.length > 0 && (
            <div style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--line)" }}>
              <div style={LBL}>What&apos;s included</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {(showAllInclusions ? inclusions : inclusions.slice(0, 6)).map((inc) => (
                  <span key={inc} className="amenity" style={{ fontSize: 13, padding: "7px 12px" }}>
                    <AmenityIcon name={inc} /> {inc}
                  </span>
                ))}
              </div>
              {inclusions.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllInclusions((v) => !v)}
                  style={{ marginTop: 12, background: "none", border: "none", color: "var(--amber-bright)", fontSize: 13, fontFamily: "var(--f-mono)", letterSpacing: "0.04em", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                >
                  {showAllInclusions ? "Show less" : `View all ${inclusions.length} inclusions`}
                </button>
              )}
            </div>
          )}

          {/* House rules + fees */}
          {(room.house_rules || room.security_deposit || room.cleaning_fee) && (
            <div style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--line)" }}>
              {room.house_rules && (
                <>
                  <div style={LBL}>House rules</div>
                  <p style={{ color: "var(--text-2)", fontSize: 13, lineHeight: 1.7, margin: "0 0 16px" }}>{room.house_rules}</p>
                </>
              )}
              {(room.security_deposit || room.cleaning_fee) && (
                <div style={{ display: "flex", gap: 24, fontSize: 12, color: "var(--text-3)", fontFamily: "var(--f-mono)", flexWrap: "wrap" }}>
                  {room.security_deposit && <span>Security deposit: {peso(room.security_deposit)} (refundable)</span>}
                  {room.cleaning_fee    && <span>Cleaning fee: {peso(room.cleaning_fee)}</span>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: booking panel (sticky on desktop) ── */}
        <div className="book-panel">
          <div className="sum">
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: "var(--f-display)", fontSize: 28, color: "var(--amber-bright)", lineHeight: 1 }}>{peso(roomRate(room))}</div>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--text-3)", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 4 }}>per night</div>
            </div>

            <form onSubmit={handleBook} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Calendar */}
              <div className="avail-cal" style={{ marginBottom: 8 }}>
                <div className="avail-hint">
                  {!selStart ? "Tap a check-in date" : !selEnd ? "Now tap a check-out date" : `${fmtDate(selStart)} → ${fmtDate(selEnd)} · ${nights} night${nights !== 1 ? "s" : ""}`}
                  {selStart && selEnd && (
                    <button type="button" onClick={() => { setSelStart(null); setSelEnd(null); setCheckIn(""); setCheckOut(""); }} style={{ marginLeft: 10, background: "none", border: "none", color: "var(--text-3)", fontSize: 11, fontFamily: "var(--f-mono)", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Reset</button>
                  )}
                </div>
                <div className="avail-month-nav">
                  <button type="button" className="avail-month-btn" onClick={() => setCalMonth((m) => shiftM(m, -1))} disabled={!canGoBack}>‹</button>
                  <span>{MONTHS[calMonth.getMonth()]} {calMonth.getFullYear()}</span>
                  <button type="button" className="avail-month-btn" onClick={() => setCalMonth((m) => shiftM(m, 1))}>›</button>
                </div>
                <div className="avail-weekdays">{WDAYS.map((d) => <span key={d}>{d}</span>)}</div>
                {calLoading ? (
                  <div className="avail-loading">Checking availability…</div>
                ) : (
                  <div className="avail-grid">
                    {calRows.map((row, ri) => (
                      <div className="avail-row" key={ri}>
                        {row.map((cell, ci) => {
                          if (!cell) return <div key={ci} className="avail-day avail-empty" />;
                          const st = dayState(cell.date);
                          const isPast     = st === "past";
                          const isOcc      = st === "occupied";
                          const tipText    = isPast ? "This date has already passed" : isOcc ? "Not available — already booked" : undefined;
                          return (
                            <button
                              type="button"
                              key={ci}
                              className={`avail-day ${st}`}
                              onClick={() => tapDay(cell.date)}
                              title={tipText}
                              aria-disabled={isPast || isOcc}
                              style={(isPast || isOcc) ? { cursor: "not-allowed" } : undefined}
                            >
                              {cell.n}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
                <div className="avail-legend">
                  <span className="avail-leg"><span className="avail-leg-dot av" />Available</span>
                  <span className="avail-leg"><span className="avail-leg-dot oc" />Booked</span>
                  <span className="avail-leg"><span className="avail-leg-dot sel" />Selected</span>
                </div>
                {dateProblem && (
                  <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(255,107,94,0.1)", border: "1px solid rgba(255,107,94,0.3)", borderRadius: 10, color: "var(--err)", fontSize: 12, lineHeight: 1.5 }}>
                    {dateProblem}
                  </div>
                )}
              </div>

              {/* Cost summary (only when dates picked).
                  Cleaning fee / deposit are shown for transparency but are
                  settled at the front desk — they're not in the online total. */}
              {selStart && selEnd && (
                <div className="bc-summary">
                  <div className="bc-summary-line">
                    <span>{nights} night{nights !== 1 ? "s" : ""} × {peso(roomRate(room))}</span>
                    <span>{peso(total)}</span>
                  </div>
                  {room.cleaning_fee ? (
                    <div className="bc-summary-line" style={{ color: "var(--text-3)" }}>
                      <span>Cleaning fee · at front desk</span>
                      <span>{peso(room.cleaning_fee)}</span>
                    </div>
                  ) : null}
                  {room.security_deposit ? (
                    <div className="bc-summary-line" style={{ color: "var(--text-3)" }}>
                      <span>Security deposit · refundable</span>
                      <span>{peso(room.security_deposit)}</span>
                    </div>
                  ) : null}
                  <div className="bc-summary-line total">
                    <span>Total due today</span>
                    <span>{peso(total)}</span>
                  </div>
                  {(room.cleaning_fee || room.security_deposit) ? (
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6, lineHeight: 1.5 }}>
                      Cleaning fee and refundable deposit are settled at the front desk — not charged online.
                    </div>
                  ) : null}
                </div>
              )}

              {/* Time + guests */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="field">
                  <label style={LBL} htmlFor="bk-arrival">Arrival time</label>
                  <input id="bk-arrival" className="input" type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} />
                </div>
                <div className="field">
                  <label style={LBL} htmlFor="bk-guests">Guests</label>
                  <select
                    id="bk-guests" className="input" value={partySize}
                    onChange={(e) => { setPartySize(Number(e.target.value)); setFieldErrors((p) => ({ ...p, guests: "" })); }}
                    style={fieldErrors.guests ? { borderColor: "var(--err)" } : undefined}
                  >
                    {[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>{n} {n === 1 ? "guest" : "guests"}</option>)}
                  </select>
                  {fieldErrors.guests && <div style={{ color: "var(--err)", fontSize: 11, marginTop: 4 }}>{fieldErrors.guests}</div>}
                </div>
              </div>

              {/* Confirmation note */}
              <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5, padding: "8px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 8, borderLeft: "2px solid var(--amber)" }}>
                Your booking confirmation will be sent to this mobile number and email. Keep your booking reference — you will need it to manage or cancel your booking.
              </div>

              {/* Primary guest details */}
              <div style={{ fontSize: 11, fontFamily: "var(--f-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 2 }}>
                Guest 1 (You)
              </div>
              <div className="field">
                <label style={LBL} htmlFor="bk-name">Full name *</label>
                <input
                  id="bk-name" className="input" value={name}
                  onChange={(e) => { setName(e.target.value); setFieldErrors((p) => ({ ...p, name: "" })); }}
                  onBlur={() => setName(formatPersonName(name))}
                  autoCapitalize="words"
                  autoComplete="name"
                  placeholder="Juan dela Cruz"
                  style={fieldErrors.name ? { borderColor: "var(--err)" } : undefined}
                />
                {fieldErrors.name && <div style={{ color: "var(--err)", fontSize: 11, marginTop: 4 }}>{fieldErrors.name}</div>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="field">
                  <label style={LBL} htmlFor="bk-phone">Mobile *</label>
                  <div style={{ display: "flex", alignItems: "stretch", borderRadius: 10, overflow: "hidden", border: `1px solid ${fieldErrors.phone ? "var(--err)" : "var(--line-strong)"}`, background: "var(--bg-3)" }}>
                    <span style={{ padding: "0 10px", display: "flex", alignItems: "center", background: "var(--bg-4)", color: "var(--text-3)", fontSize: 13, fontWeight: 600, borderRight: "1px solid var(--line-strong)", flexShrink: 0, userSelect: "none" }}>+63</span>
                    <input
                      id="bk-phone"
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={10}
                      value={phone}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setPhone(digits);
                        setFieldErrors((p) => ({ ...p, phone: "" }));
                      }}
                      placeholder="9171234567"
                      style={{ flex: 1, background: "transparent", border: "none", outline: "none", padding: "10px 12px", color: "var(--text-1)", fontSize: 14 }}
                    />
                  </div>
                  {fieldErrors.phone
                    ? <div style={{ color: "var(--err)", fontSize: 11, marginTop: 4 }}>{fieldErrors.phone}</div>
                    : <div style={{ color: "var(--text-3)", fontSize: 10, marginTop: 3 }}>Enter 10 digits · e.g. 9171234567</div>}
                </div>
                <div className="field">
                  <label style={LBL} htmlFor="bk-email">Email *</label>
                  <input
                    id="bk-email" className="input" type="text" value={email}
                    onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: "" })); }}
                    placeholder="juan@email.com"
                    style={fieldErrors.email ? { borderColor: "var(--err)" } : undefined}
                  />
                  {fieldErrors.email && <div style={{ color: "var(--err)", fontSize: 11, marginTop: 4 }}>{fieldErrors.email}</div>}
                </div>
              </div>

              {/* Additional guest details */}
              {additionalGuests.map((g, i) => (
                <div key={i}>
                  <div style={{ fontSize: 11, fontFamily: "var(--f-mono)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 2, marginTop: 8 }}>
                    Guest {i + 2}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="field">
                      <label style={LBL} htmlFor={`bk-g${i + 2}-name`}>Full name *</label>
                      <input
                        id={`bk-g${i + 2}-name`} className="input" value={g.name}
                        onChange={(e) => {
                          const upd = [...additionalGuests];
                          upd[i] = { ...upd[i], name: e.target.value };
                          setAdditionalGuests(upd);
                          setFieldErrors((p) => ({ ...p, [`guest${i + 2}_name`]: "" }));
                        }}
                        onBlur={() => {
                          const upd = [...additionalGuests];
                          upd[i] = { ...upd[i], name: formatPersonName(upd[i].name) };
                          setAdditionalGuests(upd);
                        }}
                        autoCapitalize="words"
                        autoComplete="name"
                        placeholder="Full name"
                        style={fieldErrors[`guest${i + 2}_name`] ? { borderColor: "var(--err)" } : undefined}
                      />
                      {fieldErrors[`guest${i + 2}_name`] && <div style={{ color: "var(--err)", fontSize: 11, marginTop: 4 }}>{fieldErrors[`guest${i + 2}_name`]}</div>}
                    </div>
                    <div className="field">
                      <label style={LBL} htmlFor={`bk-g${i + 2}-phone`}>Mobile <span style={{ color: "var(--text-3)", fontWeight: 400 }}>(optional)</span></label>
                      <div style={{ display: "flex", alignItems: "stretch", borderRadius: 10, overflow: "hidden", border: `1px solid ${fieldErrors[`guest${i + 2}_phone`] ? "var(--err)" : "var(--line-strong)"}`, background: "var(--bg-3)" }}>
                        <span style={{ padding: "0 10px", display: "flex", alignItems: "center", background: "var(--bg-4)", color: "var(--text-3)", fontSize: 13, fontWeight: 600, borderRight: "1px solid var(--line-strong)", flexShrink: 0, userSelect: "none" }}>+63</span>
                        <input
                          id={`bk-g${i + 2}-phone`}
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={10}
                          value={g.phone}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                            const upd = [...additionalGuests];
                            upd[i] = { ...upd[i], phone: digits };
                            setAdditionalGuests(upd);
                            setFieldErrors((p) => ({ ...p, [`guest${i + 2}_phone`]: "" }));
                          }}
                          placeholder="9171234567"
                          style={{ flex: 1, background: "transparent", border: "none", outline: "none", padding: "10px 12px", color: "var(--text-1)", fontSize: 14 }}
                        />
                      </div>
                      {fieldErrors[`guest${i + 2}_phone`] && <div style={{ color: "var(--err)", fontSize: 11, marginTop: 4 }}>{fieldErrors[`guest${i + 2}_phone`]}</div>}
                    </div>
                  </div>
                </div>
              ))}

              <div className="field">
                <label style={LBL} htmlFor="bk-notes">Special requests</label>
                <textarea
                  id="bk-notes" className="input" rows={2} value={notes}
                  maxLength={MAX_NOTES}
                  onChange={(e) => { setNotes(sanitizeNoteInput(e.target.value)); setFieldErrors((p) => ({ ...p, notes: "" })); }}
                  placeholder="Dietary needs, early check-in, etc."
                  style={{ resize: "vertical", ...(fieldErrors.notes ? { borderColor: "var(--err)" } : {}) }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                  {fieldErrors.notes
                    ? <span style={{ color: "var(--err)", fontSize: 11 }}>{fieldErrors.notes}</span>
                    : <span />}
                  <span style={{ color: notes.length > 280 ? (notes.length > 300 ? "var(--err)" : "var(--amber)") : "var(--text-3)", fontSize: 10 }}>{notes.length}/300</span>
                </div>
              </div>

              {/* Payment method — only once dates are picked, to reduce upfront friction */}
              {selStart && selEnd && (
              <div className="field">
                <div style={{ ...LBL, marginBottom: 8 }}>Pay with</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                  {([
                    { id: "gcash",   label: "GCash" },
                    { id: "maya",    label: "Maya" },
                    { id: "card",    label: "Card" },
                    { id: "qrph",    label: "QR Ph" },
                  ] as const).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id)}
                      style={{
                        padding: "10px 12px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                        cursor: "pointer", border: "1px solid",
                        background: paymentMethod === m.id ? "rgba(var(--tint-rgb), 0.12)" : "var(--bg-3)",
                        borderColor: paymentMethod === m.id ? "var(--amber)" : "var(--line-strong)",
                        color: paymentMethod === m.id ? "var(--amber-bright)" : "var(--text-2)",
                        transition: "0.15s",
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              )}

              {error && (
                <div style={{ padding: "12px 14px", background: "rgba(255,107,94,0.1)", border: "1px solid rgba(255,107,94,0.3)", borderRadius: 10, color: "var(--err)", fontSize: 13 }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                style={{ width: "100%", opacity: submitting ? 0.6 : (!selStart || !selEnd) ? 0.45 : isFormReady ? 1 : 0.75, cursor: (!selStart || !selEnd) ? "not-allowed" : "pointer", transition: "opacity 0.2s" }}
                disabled={submitting || !selStart || !selEnd}
              >
                {!selStart || !selEnd ? "Pick your dates first" : !isFormReady ? "Complete required details" : submitting ? "Processing…" : "Review Booking →"}
              </button>
              <div style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center", lineHeight: 1.5 }}>
                You&apos;ll be redirected to a secure payment page · Booking confirmed on payment
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Full-photo lightbox */}
      {showAllPhotos && photos.length > 1 && (
        <button
          type="button"
          tabIndex={0}
          aria-label="Close gallery"
          onClick={() => setShowAllPhotos(false)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " " || e.key === "Escape") { e.preventDefault(); setShowAllPhotos(false); } }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, cursor: "zoom-out" }}
        >
          <div style={{ maxWidth: 1100, width: "100%", maxHeight: "90vh", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, overflowY: "auto" }}>
            {photos.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src + i} src={src} alt={`${room.name} ${i + 1}`} style={{ width: "100%", height: 240, objectFit: "cover", borderRadius: 12, display: "block" }} />
            ))}
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowAllPhotos(false); }}
            style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 24, width: 40, height: 40, borderRadius: "50%", cursor: "pointer" }}
            aria-label="Close gallery"
          >×</button>
        </button>
      )}
    </div>
    </>
  );
}

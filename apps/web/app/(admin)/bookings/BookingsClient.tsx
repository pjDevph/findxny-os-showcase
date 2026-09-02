"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmBooking, cancelBooking, markBookingPaid, checkInBooking, checkOutBooking, refundBooking } from "../actions";
import { peso } from "@/lib/config";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { SlideOver } from "@/components/ui/SlideOver";
import { RescheduleBookingModal } from "./RescheduleBookingModal";
import { RefundBookingModal } from "./RefundBookingModal";
import { BlockResourceModal } from "./BlockResourceModal";

type View = "operations" | "records" | "calendar" | "availability";

const VIEWS: { id: View; label: string }[] = [
  { id: "operations",   label: "Operations" },
  { id: "records",      label: "Records" },
  { id: "calendar",     label: "Calendar" },
  { id: "availability", label: "Availability" },
];

interface Booking {
  id: string;
  status: string;
  payment_status?: "unpaid" | "partial" | "paid" | "refunded";
  amount_paid?: number;
  start_time: string;
  end_time: string;
  total: number;
  notes?: string | null;
  resource_id: string | null;
  checked_in_at: string | null;
  reschedule_count?: number | null;
  rescheduled_from_booking_id?: string | null;
  rescheduled_to_booking_id?: string | null;
  customers: { name: string; phone: string | null; email: string | null } | null;
  bookable_resources: { name: string; type: string } | null;
  branches: { name: string } | null;
  payment_intents: { id: string; status: string; amount: number; provider?: string | null }[];
}

interface ResourceBlock {
  id: string;
  resource_id: string;
  branch_id: string | null;
  start_date: string;   // YYYY-MM-DD
  end_date: string;     // YYYY-MM-DD (exclusive)
  block_type: "maintenance" | "owner_block" | "cleaning" | "private_event";
  reason: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  bookable_resources: { name: string; type: string } | null;
}

function stayStatus(b: Booking): { label: string; tone: string } {
  if (b.status === "rescheduled") return { label: "Rescheduled", tone: "neutral" };
  if (b.status === "cancelled")   return { label: "Cancelled",   tone: "err" };
  if (b.status === "no_show")     return { label: "No-show",     tone: "err" };
  if (b.status === "expired")     return { label: "Expired",     tone: "neutral" };
  if (b.status === "completed")   return { label: "Completed",   tone: "neutral" };
  if (b.status === "checked_out") return { label: "Checked out", tone: "neutral" };
  if (b.status === "checked_in")  return { label: "Checked in",  tone: "ok" };
  if (b.status === "confirmed")   return { label: "Upcoming",    tone: "ok" };
  return { label: "On hold", tone: "warn" };
}

const STATUS_COLOR: Record<string, string> = {
  hold: "warn", confirmed: "ok", checked_in: "ok", checked_out: "neutral", completed: "neutral",
  cancelled: "err", rescheduled: "neutral", no_show: "err", expired: "neutral",
};
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WDAYS  = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function isPaid(b: Booking) {
  if (b.payment_status === "paid") return true;
  if ((b.payment_intents ?? []).some(p => p.status === "succeeded")) return true;
  return false;
}
function paymentBadge(b: Booking): { label: string; tone: string } {
  if (b.payment_status === "refunded") return { label: "Refunded", tone: "neutral" };
  if (b.payment_status === "paid")    return { label: "Paid",    tone: "ok" };
  if (b.payment_status === "partial") return { label: "Partial", tone: "warn" };
  if (isPaid(b))                      return { label: "Paid",    tone: "ok" };
  return { label: "Unpaid", tone: "neutral" };
}
function parseNotesGuest(notes: string | null | undefined): { name: string; phone: string; email: string } {
  if (!notes) return { name: "", phone: "", email: "" };
  const parts = notes.split(" · ");
  let idx = 1;
  const name = parts[0] ?? "";
  let phone = "", email = "";
  if (parts[idx] && (parts[idx].startsWith("+") || parts[idx].startsWith("09") || /^\d{7,}$/.test(parts[idx]))) phone = parts[idx++];
  if (parts[idx] && parts[idx].includes("@")) email = parts[idx++];
  return { name, phone, email };
}
function overlapsDay(b: Booking, day: Date) {
  const s = b.start_time.slice(0, 10), e = b.end_time.slice(0, 10), d = ymd(day);
  return s <= d && d < e;
}
function blockOverlapsDay(bl: ResourceBlock, day: Date) {
  const d = ymd(day);
  return bl.start_date <= d && d < bl.end_date;
}
function bookingRef(b: Booking) { return b.id.slice(0, 8).toUpperCase(); }

const MONO: React.CSSProperties = {
  fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.14em",
  textTransform: "uppercase", color: "var(--text-3)",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ ...MONO, marginBottom: 10 }}>{children}</div>;
}

function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1px solid rgba(var(--tint-rgb), 0.06)" }}>
      <span style={{ fontSize: 12, color: "var(--text-3)" }}>{k}</span>
      <span style={{ fontSize: 13, color: "var(--text-1)", textAlign: "right" }}>{v}</span>
    </div>
  );
}

function BookingDrawerFooter({ b, onReschedule, onRefund, onAction }: {
  b: Booking;
  onReschedule: () => void;
  onRefund: () => void;
  onAction?: (patch: Partial<Booking>) => void;
}) {
  const paid        = isPaid(b);
  const isRefunded  = b.payment_status === "refunded";
  const isHold      = b.status === "hold";
  const isConfirmed = b.status === "confirmed";
  const isCheckedIn = b.status === "checked_in";
  const balanceAmt  = b.payment_status === "partial"
    ? +(b.total - Number(b.amount_paid ?? 0)).toFixed(2)
    : b.total;

  // checked_out, completed, rescheduled, no_show, and expired are all terminal — no actions allowed.
  if (isRefunded || ["checked_out", "completed", "rescheduled", "no_show", "expired"].includes(b.status)) {
    const msg = isRefunded
      ? "This booking has been refunded."
      : b.status === "rescheduled"
      ? "This booking was rescheduled. See replacement booking below."
      : b.status === "no_show"
      ? "The guest did not show up. This hold was released automatically."
      : b.status === "expired"
      ? "This hold expired before it was confirmed."
      : "This booking is complete. No further actions available.";
    return <div style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>{msg}</div>;
  }

  // Cancelled: backend allows refund only when a payment was recorded.
  if (b.status === "cancelled") {
    if (paid && Number(b.amount_paid ?? 0) > 0) {
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="btn-xs danger" onClick={onRefund}>Refund</button>
        </div>
      );
    }
    return <div style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic" }}>This booking was cancelled.</div>;
  }

  // Active states: hold → confirmed → checked_in
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {/* Pending (hold) — Confirm */}
      {isHold && !paid && (
        <ConfirmActionButton action={() => confirmBooking(b.id)} className="btn-xs primary" tone="neutral"
          title="Confirm this booking?" confirmLabel="Confirm" cancelLabel="Cancel"
          onSuccess={() => onAction?.({ status: "confirmed" })}>Confirm</ConfirmActionButton>
      )}
      {/* Unpaid — Mark Paid */}
      {(isHold || isConfirmed) && !paid && (
        <ConfirmActionButton action={() => markBookingPaid(b.id)} className="btn-xs primary" tone="neutral"
          title={`Mark ${peso(balanceAmt > 0 ? balanceAmt : b.total)} as paid (cash/counter)?`}
          confirmLabel="Mark paid" cancelLabel="Cancel"
          onSuccess={() => onAction?.({ payment_status: "paid", amount_paid: b.total })}>
          {b.payment_status === "partial" ? "Mark Balance Paid" : "Mark Paid"}
        </ConfirmActionButton>
      )}
      {/* Confirmed + Paid — Check In */}
      {isConfirmed && paid && (
        <ConfirmActionButton action={() => checkInBooking(b.id)} className="btn-xs" tone="neutral"
          title="Check in this guest now?" confirmLabel="Check in" cancelLabel="Cancel"
          onSuccess={() => onAction?.({ status: "checked_in", checked_in_at: new Date().toISOString() })}>
          Check in</ConfirmActionButton>
      )}
      {/* Confirmed — Reschedule */}
      {isConfirmed && (
        <button type="button" className="btn-xs" onClick={onReschedule}>Reschedule</button>
      )}
      {/* Checked In — Check Out */}
      {isCheckedIn && (
        <ConfirmActionButton action={() => checkOutBooking(b.id)} className="btn-xs" tone="neutral"
          title="Check out this guest? This completes the booking." confirmLabel="Check out" cancelLabel="Cancel"
          onSuccess={() => onAction?.({ status: "checked_out" })}>Check out</ConfirmActionButton>
      )}
      {/* Hold / Confirmed + Unpaid — Cancel (backend blocks cancel on paid bookings) */}
      {(isHold || isConfirmed) && !paid && (
        <ConfirmActionButton action={() => cancelBooking(b.id)} className="btn-xs danger" tone="danger"
          title="Cancel this booking?" body="This releases the held slot."
          confirmLabel="Cancel booking" cancelLabel="Keep"
          onSuccess={() => onAction?.({ status: "cancelled" })}>Cancel</ConfirmActionButton>
      )}
      {/* Refund: confirmed + paid only. Backend rejects refund for checked_in and later. */}
      {isConfirmed && paid && Number(b.amount_paid ?? 0) > 0 && (
        <button type="button" className="btn-xs danger" onClick={onRefund}>Refund</button>
      )}
    </div>
  );
}

function BookingDrawerBody({ b }: { b: Booking }) {
  const pmBadge  = paymentBadge(b);
  const stay     = stayStatus(b);
  const dt       = (s: string) => new Date(s).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const amtPaid  = Number(b.amount_paid ?? 0);
  const balance  = +(b.total - amtPaid).toFixed(2);
  const daysToCI = (new Date(b.start_time).getTime() - Date.now()) / 86_400_000;
  const urgent   = pmBadge.label !== "Paid" && b.status === "confirmed" && b.total > 0 && daysToCI >= 0 && daysToCI <= 2;
  const ng       = parseNotesGuest(b.notes);
  const gName    = b.customers?.name  || ng.name  || "—";
  const gPhone   = b.customers?.phone || ng.phone || "—";
  const gEmail   = b.customers?.email || ng.email || "—";
  return (
    <div style={{ padding: "4px 4px 8px" }}>
      {urgent && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 10px", borderRadius: 6, background: "rgba(255,152,0,0.12)", border: "1px solid rgba(255,152,0,0.3)", color: "var(--amber-bright)", fontSize: 12, fontWeight: 600 }}>
          ⚠ Full payment required — check-in in {Math.ceil(daysToCI)} day{Math.ceil(daysToCI) !== 1 ? "s" : ""}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <span className={`pill ${STATUS_COLOR[b.status] ?? "neutral"}`}>{b.status}</span>
        <span className={`pill ${pmBadge.tone}`}>{pmBadge.label}</span>
        <span className={`pill ${stay.tone}`}>{stay.label}</span>
        {(b.reschedule_count ?? 0) > 0 && (
          <span className="pill warn">Rescheduled ×{b.reschedule_count}</span>
        )}
      </div>

      {(b.rescheduled_to_booking_id || b.rescheduled_from_booking_id) && (
        <div style={{ marginBottom: 12, padding: "8px 10px", borderRadius: 6, background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)", display: "flex", flexDirection: "column", gap: 4 }}>
          {b.rescheduled_to_booking_id && (
            <div style={{ fontSize: 12, color: "#a78bfa" }}>
              Replaced by:{" "}
              <span style={{ fontFamily: "var(--f-mono)", fontWeight: 700, letterSpacing: "0.08em" }}>
                {b.rescheduled_to_booking_id.slice(0, 8).toUpperCase()}
              </span>
            </div>
          )}
          {b.rescheduled_from_booking_id && (
            <div style={{ fontSize: 12, color: "#a78bfa" }}>
              Rescheduled from:{" "}
              <span style={{ fontFamily: "var(--f-mono)", fontWeight: 700, letterSpacing: "0.08em" }}>
                {b.rescheduled_from_booking_id.slice(0, 8).toUpperCase()}
              </span>
            </div>
          )}
        </div>
      )}

      <div style={{ ...MONO, margin: "8px 0 4px" }}>Guest</div>
      <DetailRow k="Name"   v={gName} />
      <DetailRow k="Mobile" v={gPhone} />
      <DetailRow k="Email"  v={gEmail} />

      <div style={{ ...MONO, margin: "16px 0 4px" }}>Booking</div>
      <DetailRow k="Room"      v={b.bookable_resources?.name ?? "—"} />
      <DetailRow k="Check-in"  v={dt(b.start_time)} />
      <DetailRow k="Check-out" v={dt(b.end_time)} />
      {b.checked_in_at && <DetailRow k="Checked in at" v={dt(b.checked_in_at)} />}
      <DetailRow k="Branch" v={b.branches?.name ?? "—"} />
      <DetailRow k="Total"  v={peso(b.total)} />

      <div style={{ ...MONO, margin: "16px 0 4px" }}>Payments</div>
      {(b.payment_intents ?? []).length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic", padding: "6px 0" }}>No payment records.</div>
      ) : (
        (b.payment_intents ?? []).map(p => {
          const statusLabel: Record<string, string> = { succeeded: "Paid", pending: "Pending", cancelled: "Cancelled", refunded: "Refunded", failed: "Failed" };
          const methodLabel: Record<string, string> = { cash: "Cash", xendit: "Online", stripe: "Card" };
          const label  = statusLabel[p.status] ?? p.status;
          const method = p.provider ? (methodLabel[p.provider] ?? p.provider) : null;
          const tone   = p.status === "succeeded" ? "var(--ok,#22c55e)" : p.status === "pending" ? "var(--amber)" : "var(--text-3)";
          return (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(var(--tint-rgb), 0.06)" }}>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                <span style={{ color: tone, fontWeight: 600 }}>{label}</span>
                {method && <span> · {method}</span>}
              </span>
              <span style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 500 }}>{peso(p.amount)}</span>
            </div>
          );
        })
      )}
      {b.payment_status === "partial" && amtPaid > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(var(--tint-rgb), 0.08)" }}>
          <DetailRow k="Amount paid" v={peso(amtPaid)} />
          <DetailRow k="Balance due" v={peso(balance)} />
        </div>
      )}
    </div>
  );
}

/* ── Small booking card used in Operations tab ── */
function OpsBookingRow({
  b, onClick,
}: { b: Booking; onClick: () => void }) {
  const pmBadge  = paymentBadge(b);
  const dt       = (s: string) => new Date(s).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const daysToCI = (new Date(b.start_time).getTime() - Date.now()) / 86_400_000;
  const urgent   = pmBadge.label !== "Paid" && b.status === "confirmed" && b.total > 0 && daysToCI >= 0 && daysToCI <= 2;
  const gName    = b.customers?.name || parseNotesGuest(b.notes).name || "—";
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
        borderRadius: 8, cursor: "pointer", marginBottom: 6,
        background: urgent ? "rgba(255,152,0,0.06)" : "rgba(var(--tint-rgb), 0.03)",
        border: urgent ? "1px solid rgba(255,152,0,0.35)" : "1px solid rgba(var(--tint-rgb), 0.08)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {gName}
          {urgent && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--amber-bright)", fontWeight: 700 }}>⚠ {Math.ceil(daysToCI)}d to check-in</span>}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
          {b.bookable_resources?.name ?? "—"} · {dt(b.start_time)} → {dt(b.end_time)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <span className={`pill ${STATUS_COLOR[b.status] ?? "neutral"}`} style={{ fontSize: 10 }}>{b.status}</span>
        <span className={`pill ${pmBadge.tone}`} style={{ fontSize: 10 }}>{pmBadge.label}</span>
        {(b.reschedule_count ?? 0) > 0 && (
          <span className="pill warn" style={{ fontSize: 10 }}>Rescheduled</span>
        )}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", whiteSpace: "nowrap" }}>{peso(b.total)}</div>
    </div>
  );
}

function EmptyOps({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 12, color: "var(--text-3)", fontStyle: "italic", padding: "8px 14px" }}>{text}</div>
  );
}

export default function BookingsClient({
  bookings,
  initialBlocks = [],
  wsId = "",
}: {
  bookings: Booking[];
  initialBlocks?: ResourceBlock[];
  wsId?: string;
}) {
  const router = useRouter();
  const [view, setView]                 = useState<View>("operations");
  const [filterRoom, setFilterRoom]     = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [query, setQuery]               = useState("");
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [refundId, setRefundId]         = useState<string | null>(null);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blocks, setBlocks]             = useState<ResourceBlock[]>(initialBlocks);
  const [localBookings, setLocalBookings] = useState<Booking[]>(bookings);

  // Sync when the server component delivers fresh data after router.refresh()
  useEffect(() => { setLocalBookings(bookings); }, [bookings]);

  function patchBooking(id: string, patch: Partial<Booking>) {
    setLocalBookings(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  }

  const selected = useMemo(() => localBookings.find(b => b.id === selectedId) ?? null, [localBookings, selectedId]);
  const rescheduleBooking = useMemo(() => localBookings.find(b => b.id === rescheduleId) ?? null, [localBookings, rescheduleId]);
  const refundTarget = useMemo(() => localBookings.find(b => b.id === refundId) ?? null, [localBookings, refundId]);
  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const exportRef  = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const rooms = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of localBookings)
      if (b.resource_id && b.bookable_resources?.name)
        map.set(b.resource_id, b.bookable_resources.name);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [localBookings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return localBookings.filter(b => {
      if (filterRoom !== "all" && b.resource_id !== filterRoom) return false;
      if (filterStatus !== "all" && b.status !== filterStatus) return false;
      if (q) {
        const hay = [
          bookingRef(b),
          b.customers?.name, b.customers?.phone, b.customers?.email,
          b.bookable_resources?.name,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [localBookings, filterRoom, filterStatus, query]);

  const stats = useMemo(() => {
    const today  = ymd(new Date());
    const mStart = viewMonth;
    const mEnd   = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
    return {
      // Work-queue semantics: only actionable bookings appear.
      // A check-in disappears the moment it transitions to checked_in.
      // A check-out disappears the moment it transitions to checked_out.
      checkInsToday:      localBookings.filter(b => b.status === "confirmed" && b.start_time.slice(0, 10) === today).length,
      checkOutsToday:     localBookings.filter(b => b.status === "checked_in"  && b.end_time.slice(0, 10)   === today).length,
      pendingPayment:     localBookings.filter(b => (b.status === "hold" || b.status === "confirmed") && !isPaid(b)).length,
      activeHolds:        localBookings.filter(b => b.status === "hold").length,
      upcomingThisMonth:  localBookings.filter(b => {
        if (b.status !== "confirmed") return false;
        const s = new Date(b.start_time);
        return s >= mStart && s < mEnd;
      }).length,
      cancelledThisMonth: localBookings.filter(b => {
        if (b.status !== "cancelled") return false;
        const s = new Date(b.start_time);
        return s >= mStart && s < mEnd;
      }).length,
    };
  }, [localBookings, viewMonth]);

  /* Operations-tab derived lists */
  const opsData = useMemo(() => {
    const today    = ymd(new Date());
    const n        = new Date();
    const monthEnd = ymd(new Date(n.getFullYear(), n.getMonth() + 1, 1));
    return {
      pendingPayment: localBookings.filter(b => (b.status === "hold" || b.status === "confirmed") && !isPaid(b)),
      checkInsToday:  localBookings.filter(b => b.status === "confirmed"  && b.start_time.slice(0, 10) === today),
      checkOutsToday: localBookings.filter(b => b.status === "checked_in" && b.end_time.slice(0, 10)   === today),
      upcoming: localBookings.filter(b =>
        b.status === "confirmed" &&
        b.start_time.slice(0, 10) > today &&
        b.start_time.slice(0, 10) < monthEnd
      ).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    };
  }, [localBookings]);

  const calDays = useMemo(() => {
    const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
    const fd = new Date(y, m, 1).getDay();
    const dim = new Date(y, m + 1, 0).getDate();
    const out: (Date | null)[] = Array(fd).fill(null);
    for (let d = 1; d <= dim; d++) out.push(new Date(y, m, d));
    return out;
  }, [viewMonth]);

  const timelineDays = useMemo(() => {
    const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
    const dim = new Date(y, m + 1, 0).getDate();
    return Array.from({ length: dim }, (_, i) => new Date(y, m, i + 1));
  }, [viewMonth]);

  const monthBookings = useMemo(() => {
    const mStart = viewMonth;
    const mEnd   = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
    return localBookings.filter(b => new Date(b.start_time) < mEnd && new Date(b.end_time) > mStart);
  }, [localBookings, viewMonth]);

  const monthBlocks = useMemo(() => {
    const mStart = ymd(viewMonth);
    const mEnd   = ymd(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
    return blocks.filter(bl => bl.start_date < mEnd && bl.end_date > mStart);
  }, [blocks, viewMonth]);

  const exportData = useMemo(() => {
    const today = ymd(new Date());
    return rooms.map(room => {
      const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
      const dim = new Date(y, m + 1, 0).getDate();
      const available: Date[] = [];
      for (let d = 1; d <= dim; d++) {
        const day = new Date(y, m, d);
        if (ymd(day) < today) continue;
        const booked = localBookings.some(b =>
          b.resource_id === room.id &&
          ["hold", "confirmed"].includes(b.status) &&
          overlapsDay(b, day)
        );
        if (!booked) available.push(day);
      }
      return { name: room.name, available };
    });
  }, [rooms, localBookings, viewMonth]);

  async function doExport() {
    if (!exportRef.current || exporting) return;
    setExporting(true);
    try {
      const h2c = (await import("html2canvas")).default;
      const canvas = await h2c(exportRef.current, { scale: 2, useCORS: true, backgroundColor: "#0a0705" });
      const link   = document.createElement("a");
      link.download = `staycation-${MONTHS[viewMonth.getMonth()]}-${viewMonth.getFullYear()}.png`;
      link.href     = canvas.toDataURL("image/png");
      link.click();
    } finally { setExporting(false); }
  }

  const monthLabel = `${MONTHS[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;
  const prevMonth  = () => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const nextMonth  = () => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  const todayStr   = ymd(new Date());

  const openBooking = (id: string) => setSelectedId(id);

  return (
    <>
      {/* ── Header ── */}
      <div className="admin-header">
        <div>
          <h1>Bookings</h1>
          <div className="sub" style={{ lineHeight: 1.4 }}>
            Admin monitoring view · {localBookings.length} records
            <span style={{ display: "block", fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
              New bookings are created from POS &rsaquo; Book Room.
            </span>
          </div>
        </div>
      </div>

      <div className="admin-body">
        {/* ── Tab bar ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid rgba(var(--tint-rgb), 0.1)", paddingBottom: 12 }}>
          {VIEWS.map(v => (
            <button
              key={v.id}
              className="btn-xs"
              onClick={() => setView(v.id)}
              style={view === v.id ? {
                background: "rgba(var(--tint-rgb), 0.12)",
                borderColor: "rgba(var(--tint-rgb), 0.4)",
                color: "var(--amber-bright)",
              } : {}}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* ── Quick stats (always visible) ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
          {([
            { label: "Check-ins today",   value: stats.checkInsToday,      tone: "ok"      as const, onClick: () => setView("operations") },
            { label: "Check-outs today",  value: stats.checkOutsToday,     tone: "neutral" as const, onClick: () => setView("operations") },
            { label: "Pending payment",   value: stats.pendingPayment,     tone: "warn"    as const, onClick: () => { setView("records"); setFilterStatus("all"); } },
            { label: "Active holds",      value: stats.activeHolds,        tone: "warn"    as const, onClick: () => { setView("records"); setFilterStatus("hold"); } },
            { label: "Upcoming (month)",  value: stats.upcomingThisMonth,  tone: "ok"      as const, onClick: () => { setView("records"); setFilterStatus("confirmed"); } },
            { label: "Cancelled (month)", value: stats.cancelledThisMonth, tone: "err"     as const, onClick: () => { setView("records"); setFilterStatus("cancelled"); } },
          ]).map(c => {
            const color = c.tone === "ok" ? "#4ade80" : c.tone === "warn" ? "var(--amber-bright)" : c.tone === "err" ? "var(--err)" : "var(--text-1)";
            return (
              <button key={c.label} onClick={c.onClick} style={{
                textAlign: "left", padding: "12px 14px", borderRadius: 10, cursor: "pointer",
                background: "rgba(var(--tint-rgb), 0.04)", border: "1px solid rgba(var(--tint-rgb), 0.1)",
              }}>
                <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{c.value}</div>
                <div style={{ ...MONO, marginTop: 6 }}>{c.label}</div>
              </button>
            );
          })}
        </div>

        {/* ── Search + filters (Records / Calendar / Availability only) ── */}
        {view !== "operations" && (
          <>
            <input
              className="input"
              placeholder="Search by name, phone, email, or reference…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            <div className="filter-bar" style={{ flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              <select
                className="input"
                style={{ height: 30, fontSize: 12, padding: "0 8px", width: "auto", minWidth: 120 }}
                value={filterRoom}
                onChange={e => setFilterRoom(e.target.value)}
              >
                <option value="all">All Rooms</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              {["all", "hold", "confirmed", "checked_in", "checked_out", "completed", "cancelled", "rescheduled", "no_show", "expired"].map(s => (
                <button key={s} className="btn-xs" onClick={() => setFilterStatus(s)}
                  style={filterStatus === s ? { background: "rgba(var(--tint-rgb), 0.12)", borderColor: "rgba(var(--tint-rgb), 0.4)", color: "var(--amber-bright)" } : {}}>
                  {s === "all" ? "All" : s === "no_show" ? "No-show" : s}
                </button>
              ))}
              {view !== "records" && (
                <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                  <button className="btn-xs" onClick={prevMonth}>‹</button>
                  <span style={{ fontSize: 13, fontFamily: "var(--f-mono)", color: "var(--amber)", minWidth: 130, textAlign: "center" }}>{monthLabel}</span>
                  <button className="btn-xs" onClick={nextMonth}>›</button>
                  <button
                    className="btn-xs"
                    onClick={() => setBlockModalOpen(true)}
                    style={{ marginLeft: 6, borderColor: "rgba(139,92,246,0.4)", color: "#a78bfa" }}
                  >
                    ▪ Block Dates
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══ OPERATIONS VIEW ══ */}
        {view === "operations" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

            {/* Needs Attention */}
            <div>
              <SectionLabel>Needs Attention</SectionLabel>
              {opsData.pendingPayment.length === 0 ? (
                <EmptyOps text="No pending payments — all good." />
              ) : (
                opsData.pendingPayment.map(b => <OpsBookingRow key={b.id} b={b} onClick={() => openBooking(b.id)} />)
              )}
            </div>

            {/* Today's Schedule */}
            <div>
              <SectionLabel>Today&rsquo;s Check-ins</SectionLabel>
              {opsData.checkInsToday.length === 0
                ? <EmptyOps text="No check-ins scheduled for today." />
                : opsData.checkInsToday.map(b => <OpsBookingRow key={b.id} b={b} onClick={() => openBooking(b.id)} />)}
            </div>

            <div>
              <SectionLabel>Today&rsquo;s Check-outs</SectionLabel>
              {opsData.checkOutsToday.length === 0
                ? <EmptyOps text="No check-outs scheduled for today." />
                : opsData.checkOutsToday.map(b => <OpsBookingRow key={b.id} b={b} onClick={() => openBooking(b.id)} />)}
            </div>

            {/* Upcoming (this month) */}
            <div>
              <SectionLabel>Upcoming This Month</SectionLabel>
              {opsData.upcoming.length === 0
                ? <EmptyOps text="No upcoming confirmed bookings this month." />
                : opsData.upcoming.map(b => <OpsBookingRow key={b.id} b={b} onClick={() => openBooking(b.id)} />)}
            </div>
          </div>
        )}

        {/* ══ RECORDS VIEW (was Table) ══ */}
        {view === "records" && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Ref</th><th>Guest</th><th>Room</th><th>Check-in</th><th>Check-out</th>
                  <th>Total</th><th>Status</th><th>Payment</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="empty">No bookings found</td></tr>
                )}
                {filtered.map(b => {
                  const paid    = isPaid(b);
                  const pm      = paymentBadge(b);
                  const payment = b.status === "cancelled"
                    ? (paid ? { label: "Paid · refund", tone: "warn" } : { label: "Not charged", tone: "neutral" })
                    : pm;
                  return (
                    <tr key={b.id} onClick={() => setSelectedId(b.id)} style={{ cursor: "pointer" }}>
                      <td className="dim" style={{ fontFamily: "var(--f-mono)", letterSpacing: "0.04em" }}>{bookingRef(b)}</td>
                      <td>
                        <div className="bold">{b.customers?.name ?? "—"}</div>
                        <div className="dim">{b.customers?.phone ?? b.customers?.email ?? ""}</div>
                      </td>
                      <td>
                        <div className="bold">{b.bookable_resources?.name ?? "—"}</div>
                        <div className="dim">{b.bookable_resources?.type}</div>
                      </td>
                      <td className="dim">{new Date(b.start_time).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="dim">{new Date(b.end_time).toLocaleString("en-PH",   { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="bold">{peso(b.total)}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          <span className={`pill ${STATUS_COLOR[b.status] ?? "neutral"}`}>{b.status}</span>
                          {b.rescheduled_to_booking_id && (
                            <span className="pill neutral" title={`Replaced by ${b.rescheduled_to_booking_id.slice(0, 8).toUpperCase()}`}>
                              → {b.rescheduled_to_booking_id.slice(0, 8).toUpperCase()}
                            </span>
                          )}
                          {b.rescheduled_from_booking_id && b.status !== "rescheduled" && (
                            <span className="pill warn" title={`Rescheduled from ${b.rescheduled_from_booking_id.slice(0, 8).toUpperCase()}`}>Rescheduled</span>
                          )}
                        </div>
                      </td>
                      <td><span className={`pill ${payment.tone}`}>{payment.label}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {b.status === "hold" && !paid && (
                            <ConfirmActionButton action={() => confirmBooking(b.id)} className="btn-xs primary" tone="neutral" title="Confirm this booking?" confirmLabel="Confirm" cancelLabel="Cancel"
                              onSuccess={() => { patchBooking(b.id, { status: "confirmed" }); router.refresh(); }}>Confirm</ConfirmActionButton>
                          )}
                          {["hold", "confirmed"].includes(b.status) && !paid && b.payment_status !== "refunded" && (
                            <ConfirmActionButton action={() => cancelBooking(b.id)} className="btn-xs danger" tone="danger" title="Cancel this booking?" body="This releases the held slot." confirmLabel="Cancel booking" cancelLabel="Keep"
                              onSuccess={() => { patchBooking(b.id, { status: "cancelled" }); router.refresh(); }}>Cancel</ConfirmActionButton>
                          )}
                          {b.status === "confirmed" && b.payment_status !== "refunded" && (
                            <button type="button" className="btn-xs" onClick={() => setRescheduleId(b.id)}>Reschedule</button>
                          )}
                          {["confirmed", "cancelled"].includes(b.status) && paid && Number(b.amount_paid ?? 0) > 0 && b.payment_status !== "refunded" && (
                            <button type="button" className="btn-xs danger" onClick={() => setRefundId(b.id)}>Refund</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ══ CALENDAR VIEW ══ */}
        {view === "calendar" && (
          <div>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1,
              background: "rgba(var(--tint-rgb), 0.06)", border: "1px solid rgba(var(--tint-rgb), 0.1)",
              borderRadius: 10, overflow: "hidden",
            }}>
              {WDAYS.map(d => (
                <div key={d} style={{
                  padding: "8px 4px", textAlign: "center",
                  fontSize: 10, fontFamily: "var(--f-mono)", color: "var(--text-3)",
                  letterSpacing: "0.1em", background: "rgba(0,0,0,0.3)",
                }}>{d}</div>
              ))}
              {calDays.map((day, i) => {
                if (!day) return <div key={`e${i}`} style={{ background: "rgba(0,0,0,0.18)", minHeight: 72 }} />;
                const dayBkgs = monthBookings.filter(b => {
                  if (filterRoom !== "all" && b.resource_id !== filterRoom) return false;
                  if (!overlapsDay(b, day)) return false;
                  if (filterStatus === "all") return b.status === "hold" || b.status === "confirmed";
                  return b.status === filterStatus;
                });
                const dayBlocks = monthBlocks.filter(bl => {
                  if (filterRoom !== "all" && bl.resource_id !== filterRoom) return false;
                  return blockOverlapsDay(bl, day);
                });
                const hasC    = dayBkgs.some(b => b.status === "confirmed");
                const hasH    = dayBkgs.some(b => b.status === "hold");
                const hasBlk  = dayBlocks.length > 0;
                const isToday = ymd(day) === todayStr;
                return (
                  <div
                    key={ymd(day)}
                    onClick={() => { if (dayBkgs.length === 1) openBooking(dayBkgs[0].id); }}
                    role={dayBkgs.length === 1 ? "button" : undefined}
                    tabIndex={dayBkgs.length === 1 ? 0 : undefined}
                    onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && dayBkgs.length === 1) { e.preventDefault(); openBooking(dayBkgs[0].id); } }}
                    style={{
                      padding: "6px 8px", minHeight: 72, position: "relative",
                      background: hasBlk
                        ? "rgba(139,92,246,0.07)"
                        : hasC ? "rgba(74,222,128,0.08)" : hasH ? "rgba(var(--tint-rgb), 0.08)" : "rgba(0,0,0,0.12)",
                      borderTop: `2px solid ${hasBlk ? "rgba(139,92,246,0.5)" : hasC ? "rgba(74,222,128,0.45)" : hasH ? "rgba(var(--tint-rgb), 0.45)" : "transparent"}`,
                      backgroundImage: hasBlk
                        ? "repeating-linear-gradient(45deg, rgba(139,92,246,0.06) 0px, rgba(139,92,246,0.06) 2px, transparent 2px, transparent 8px)"
                        : undefined,
                      cursor: dayBkgs.length > 0 ? "pointer" : "default",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 400, color: isToday ? "var(--amber)" : "var(--text-1)", marginBottom: 3 }}>
                      {day.getDate()}
                    </div>
                    {dayBlocks.slice(0, 1).map(bl => (
                      <div key={bl.id} style={{
                        fontSize: 10, padding: "1px 4px", borderRadius: 3, marginBottom: 2,
                        background: "rgba(139,92,246,0.18)", color: "#a78bfa",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        ▪ {bl.bookable_resources?.name ?? bl.block_type}
                      </div>
                    ))}
                    {dayBkgs.slice(0, dayBlocks.length > 0 ? 1 : 2).map(b => {
                      const chip = b.status === "confirmed" ? { bg: "rgba(74,222,128,0.18)", fg: "#4ade80" }
                        : b.status === "hold"      ? { bg: "rgba(var(--tint-rgb), 0.18)", fg: "var(--amber)" }
                        : b.status === "cancelled" ? { bg: "rgba(239,68,68,0.1)",   fg: "#ef9a9a" }
                        : { bg: "rgba(255,255,255,0.05)", fg: "var(--text-3)" };
                      return (
                        <div key={b.id} style={{
                          fontSize: 10, padding: "1px 4px", borderRadius: 3, marginBottom: 2,
                          background: chip.bg, color: chip.fg,
                          textDecoration: b.status === "cancelled" ? "line-through" : undefined,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {b.bookable_resources?.name ?? "—"}
                        </div>
                      );
                    })}
                    {(dayBkgs.length + dayBlocks.length) > 2 && (
                      <div style={{ fontSize: 9, color: "var(--text-3)" }}>+{dayBkgs.length + dayBlocks.length - 2} more</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
              <span style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 12, color: "var(--text-3)" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(74,222,128,0.45)", display: "inline-block" }} />Confirmed
              </span>
              <span style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 12, color: "var(--text-3)" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(var(--tint-rgb), 0.45)", display: "inline-block" }} />Hold
              </span>
              <span style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 12, color: "var(--text-3)" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(139,92,246,0.45)", display: "inline-block" }} />▪ Blocked
              </span>
              <span style={{ fontSize: 11, color: "var(--text-3)", fontStyle: "italic" }}>Click a date to open booking details.</span>
              <button className="btn-xs primary" style={{ marginLeft: "auto" }} onClick={doExport} disabled={exporting}>
                {exporting ? "Exporting…" : "⬇ Save as Image"}
              </button>
            </div>

            {/* Export / public availability preview */}
            <div style={{ marginTop: 24, padding: "16px 0" }}>
              <div style={{ ...MONO, marginBottom: 6 }}>Public availability preview</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 12, lineHeight: 1.5 }}>
                Only confirmed and active holds block a date. Cancelled, completed, and expired
                bookings are released — guest names are never shown.
              </div>
              <div ref={exportRef} style={{
                background: "#0a0705", padding: "40px 36px",
                border: "1px solid rgba(var(--tint-rgb), 0.15)", borderRadius: 20,
                maxWidth: 500, fontFamily: "'Helvetica Neue', Arial, sans-serif",
              }}>
                <div style={{ textAlign: "center", marginBottom: 28 }}>
                  <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>
                    <span style={{ color: "#fff" }}>Mug</span>
                    <em style={{ color: "var(--amber)", fontStyle: "italic" }}>the</em>
                    <span style={{ color: "#fff" }}>mug</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#6b6053", letterSpacing: "0.22em", textTransform: "uppercase", marginTop: 6 }}>
                    Staycation · Available Dates
                  </div>
                  <div style={{ fontSize: 14, color: "var(--amber)", fontFamily: "monospace", marginTop: 8 }}>{monthLabel}</div>
                </div>
                {exportData.map((row, i) => (
                  <div key={row.name} style={{ marginBottom: i < exportData.length - 1 ? 22 : 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fbf3e6", marginBottom: 8 }}>{row.name}</div>
                    {row.available.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#6b6053", fontStyle: "italic" }}>Fully booked this month</div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {row.available.map(d => (
                          <span key={ymd(d)} style={{
                            fontSize: 12, padding: "3px 12px", borderRadius: 20,
                            background: "rgba(var(--tint-rgb), 0.1)", border: "1px solid rgba(var(--tint-rgb), 0.2)",
                            color: "#e9dcc4",
                          }}>
                            {d.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid rgba(var(--tint-rgb), 0.08)", textAlign: "center", fontSize: 11, color: "#6b6053", letterSpacing: "0.12em" }}>
                  Message us to reserve · Open 24/7
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ AVAILABILITY VIEW (was Timeline) ══ */}
        {view === "availability" && (
          <div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 14, lineHeight: 1.5 }}>
              Room-by-date grid for checking open slots.
              ✓ = Confirmed &nbsp;◐ = Hold &nbsp;·&nbsp; Shaded = Past.
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", minWidth: "max-content" }}>
                <thead>
                  <tr>
                    <th style={{
                      padding: "8px 14px", textAlign: "left",
                      fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--text-3)",
                      position: "sticky", left: 0, background: "var(--admin-bg, #0a0705)", zIndex: 2, minWidth: 130,
                    }}>Room</th>
                    {timelineDays.map(d => (
                      <th key={ymd(d)} style={{
                        padding: "8px 0", width: 34, textAlign: "center",
                        fontFamily: "var(--f-mono)", fontSize: 10,
                        color: ymd(d) === todayStr ? "var(--amber)" : "var(--text-3)",
                      }}>{d.getDate()}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rooms.map(room => (
                    <tr key={room.id}>
                      <td style={{
                        padding: "6px 14px", fontWeight: 600, fontSize: 12, color: "var(--text-1)",
                        position: "sticky", left: 0, background: "var(--admin-bg, #0a0705)", zIndex: 1,
                      }}>{room.name}</td>
                      {timelineDays.map(day => {
                        const bkgs    = localBookings.filter(b => b.resource_id === room.id && overlapsDay(b, day));
                        const blks    = blocks.filter(bl => bl.resource_id === room.id && blockOverlapsDay(bl, day));
                        const hasC    = bkgs.some(b => b.status === "confirmed");
                        const hasH    = bkgs.some(b => b.status === "hold");
                        const hasBlk  = blks.length > 0;
                        const past    = ymd(day) < todayStr;
                        return (
                          <td
                            key={ymd(day)}
                            onClick={() => { const b = bkgs.find(b => b.status === "confirmed" || b.status === "hold"); if (b) openBooking(b.id); }}
                            title={hasBlk ? `Blocked: ${blks.map(bl => bl.block_type.replace(/_/g, " ")).join(", ")}` : undefined}
                            style={{
                              width: 34, height: 30, textAlign: "center", verticalAlign: "middle",
                              border: "1px solid rgba(var(--tint-rgb), 0.06)",
                              background: hasBlk
                                ? "rgba(139,92,246,0.18)"
                                : hasC ? "rgba(74,222,128,0.18)" : hasH ? "rgba(var(--tint-rgb), 0.18)" : past ? "rgba(0,0,0,0.22)" : "transparent",
                              backgroundImage: hasBlk
                                ? "repeating-linear-gradient(45deg, rgba(139,92,246,0.12) 0px, rgba(139,92,246,0.12) 2px, transparent 2px, transparent 7px)"
                                : undefined,
                              cursor: (hasC || hasH) ? "pointer" : "default",
                            }}
                          >
                            {hasBlk ? <span style={{ color: "#a78bfa", fontSize: 11 }}>▪</span>
                              : hasC ? <span style={{ color: "#4ade80", fontSize: 12 }}>✓</span>
                              : hasH ? <span style={{ color: "var(--amber)", fontSize: 10 }}>◐</span>
                              : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12, color: "var(--text-3)", flexWrap: "wrap" }}>
              <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(74,222,128,0.3)", display: "inline-block" }} />✓ Confirmed
              </span>
              <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(var(--tint-rgb), 0.3)", display: "inline-block" }} />◐ Hold
              </span>
              <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(139,92,246,0.3)", display: "inline-block" }} />▪ Blocked
              </span>
              <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(0,0,0,0.25)", display: "inline-block" }} />Past
              </span>
              <span style={{ fontSize: 11, fontStyle: "italic" }}>Click a cell to open booking details. Hover blocked cell for reason.</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Booking detail drawer ── */}
      <SlideOver
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected?.customers?.name || "Booking"}
        subtitle={selected ? `Ref ${bookingRef(selected)}` : undefined}
        footer={selected ? (
          <BookingDrawerFooter
            b={selected}
            onReschedule={() => { setRescheduleId(selected.id); }}
            onRefund={() => setRefundId(selected.id)}
            onAction={(patch) => { patchBooking(selected.id, patch); router.refresh(); }}
          />
        ) : undefined}
      >
        {selected && <BookingDrawerBody b={selected} />}
      </SlideOver>

      {/* ── Reschedule modal ── */}
      {rescheduleBooking && (
        <RescheduleBookingModal
          bookingId={rescheduleBooking.id}
          currentCheckIn={rescheduleBooking.start_time}
          currentCheckOut={rescheduleBooking.end_time}
          roomName={rescheduleBooking.bookable_resources?.name ?? "Room"}
          onClose={() => setRescheduleId(null)}
          onSuccess={() => { setRescheduleId(null); setSelectedId(null); }}
        />
      )}

      {/* ── Refund modal ── */}
      {refundTarget && (
        <RefundBookingModal
          bookingId={refundTarget.id}
          bookingRef={refundTarget.id.slice(0, 8).toUpperCase()}
          roomName={(refundTarget as any).bookable_resources?.name ?? "Room"}
          amountPaid={Number((refundTarget as any).amount_paid ?? 0)}
          onClose={() => setRefundId(null)}
          onSuccess={() => { setRefundId(null); router.refresh(); }}
        />
      )}

      {/* ── Block Dates modal ── */}
      <BlockResourceModal
        open={blockModalOpen}
        wsId={wsId}
        rooms={rooms}
        onClose={() => setBlockModalOpen(false)}
        onSuccess={(newBlock) => {
          setBlocks(prev => [...prev, newBlock as ResourceBlock]);
          setBlockModalOpen(false);
        }}
        onUnblock={(blockId) => {
          setBlocks(prev => prev.filter(bl => bl.id !== blockId));
        }}
        existingBlocks={blocks}
      />
    </>
  );
}

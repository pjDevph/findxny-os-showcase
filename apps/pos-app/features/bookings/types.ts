export interface Resource {
  id: string;
  name: string;
  type: "room" | "amenity";
  capacity: number | null;
  hourly_rate: number | null;
  nightly_rate: number | null;
  branch_id: string | null;
}

export interface Booking {
  id: string;
  resource_id: string;
  branch_id: string | null;
  resource_name: string | null;
  start_time: string;
  end_time: string;
  status: "hold" | "confirmed" | "checked_in" | "checked_out" | "completed" | "cancelled" | "no_show" | "expired";
  payment_status: "unpaid" | "partial" | "paid";
  total: number;
  amount_paid: number;
  notes: string | null;
  hold_expires_at: string | null;
  checked_in_at: string | null;
}

export interface RawResourceRow {
  id: string;
  name: string;
  type?: Resource["type"] | null;
  capacity?: number | null;
  hourly_rate?: number | string | null;
  nightly_rate?: number | string | null;
  branch_id?: string | null;
}

export interface RawBookingRow {
  id: string;
  resource_id: string;
  branch_id?: string | null;
  bookable_resources?: { name?: string | null } | null;
  start_time: string;
  end_time: string;
  status: Booking["status"];
  payment_status?: Booking["payment_status"] | null;
  total: number | string;
  amount_paid?: number | string | null;
  notes?: string | null;
  hold_expires_at?: string | null;
  checked_in_at?: string | null;
}

export interface SuccessInfo {
  roomName: string;
  guestName: string;
  guestPhone: string;
  checkIn: string;
  checkOut: string;
  startISO: string;
  endISO: string;
  total: number;
  status: "reserved" | "confirmed";
  bookingId?: string;
  branchId?: string;
}

export type TabFilter = "all" | "hold" | "confirmed" | "checked_in" | "completed" | "cancelled";
export type ViewMode = "bookings" | "availability";
export type BookQuickFilter = "all" | "today" | "upcoming" | "pending_pay" | "checked_in" | "cancelled";
export type FilterSort = "newest" | "oldest" | "checkin_asc" | "checkin_desc";
export type DatePickTarget = "filterCI" | "filterCO" | "availCI" | "availCO" | null;

export const TAB_LABELS: Record<TabFilter, string> = {
  all: "Active",
  hold: "Hold",
  confirmed: "Confirmed",
  checked_in: "Checked In",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type BookFieldErrors = { name?: string; phone?: string; email?: string; notes?: string };

export const EMPTY_BOOKING_FORM = {
  resource_id: "", check_in_date: "", check_in_time: "14:00",
  check_out_date: "", check_out_time: "11:00",
  guest_name: "", guest_phone: "", guest_email: "", notes: "",
};

export type BlockType = "maintenance" | "owner_block" | "cleaning" | "private_event";
export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  maintenance: "Maintenance", owner_block: "Owner block", cleaning: "Cleaning", private_event: "Private event",
};

export const MAX_NOTES = 300;

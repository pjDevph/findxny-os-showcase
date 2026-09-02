import type { ShiftReportData } from "../receipt/generateShiftReport";

export type EventType = "sale" | "in" | "out";
export type CurrentStatus = "clocked_out" | "clocked_in" | "on_break";

export interface CashEvent {
  id: string;
  type: EventType;
  amount: number;
  reason: string;
  time: string;
}

export interface Shift {
  open: boolean;
  cashier: string;
  openedAt: string | null;
  openingFloat: number;
  registerId: string | null;
  registerName: string | null;
  events: CashEvent[];
  shiftId: string | null;
  currentStatus: CurrentStatus;
  breakStartedAt: string | null;
}

export const EMPTY_SHIFT: Shift = {
  open: false, cashier: "", openedAt: null, openingFloat: 0,
  registerId: null, registerName: null, events: [], shiftId: null, currentStatus: "clocked_out",
  breakStartedAt: null,
};

// A branch can run several concurrent shifts, one per physical register —
// the open-shift guard is scoped per-register server-side, not per-branch.
export interface RegisterInfo {
  id: string;
  name: string;
  openShift: { id: string; cashier_name: string; opened_at: string } | null;
}

// Cashiers close a shift "blind" (they never see expected-vs-actual). A
// manager reviews ended shifts separately here and marks each reconciled.
export interface PendingReconShift {
  id: string;
  cashierName: string;
  registerName: string | null;
  branchName: string | null;
  openedAt: string;
  closedAt: string;
  openingFloat: number;
  closingFloat: number | null;
  expectedFloat: number | null;
  variance: number | null;
  transactionCount: number;
}

export interface ReconDetail extends ShiftReportData {
  cashierName: string;
  registerName: string | null;
  branchName: string | null;
}

export interface ChecklistItem {
  id: string;
  name: string;
  completed: boolean;
}

export interface Checklist {
  id: string;
  name: string;
  items: ChecklistItem[];
}

export const STORAGE_KEY = "pos_shift_native";

export interface ZReportPayload {
  report_no: number;
  report_type: "x" | "z";
  report_date: string;
  already_closed: boolean;
  branch_name: string;
  workspace_name: string;
  tin: string | null;
  gross_sales: number;
  discount_amount: number;
  net_sales: number;
  vatable_sales: number;
  vat_amount: number;
  vat_exempt_sales: number;
  zero_rated_sales: number;
  payment_breakdown: { cash: number; gcash: number; maya: number; card: number; qrph: number; other: number };
  void_count: number;
  void_amount: number;
  refund_count: number;
  refund_amount: number;
  order_count: number;
  cancelled_count: number;
  first_receipt_no: string | null;
  last_receipt_no: string | null;
  opening_float: number;
  cash_in: number;
  cash_out: number;
  expected_cash: number;
  cashier_name: string | null;
  generated_at: string;
}

/**
 * Customer Display — runtime snapshot store
 *
 * A tiny module-level store (no deps) that the cashier screen pushes the live
 * order into, and that both the in-app preview AND the physical second screen
 * subscribe to. Because the native second screen runs in the SAME JS runtime
 * (ReactHost.createSurface), this module's state is automatically shared with
 * it — no bridge round-trips needed for data.
 */
import { useSyncExternalStore } from "react";

export type CdMode = "idle" | "order" | "payment" | "thankyou";

export interface CdLine {
  name: string;
  qty: number;
  price: number;       // unit price
  note?: string | null;
}

export interface CdBooking {
  name: string;
  total: number;
}

export interface CdSnapshot {
  mode: CdMode;
  lines: CdLine[];
  bookings: CdBooking[];
  subtotal: number;
  tax: number;
  service: number;
  discount: number;
  total: number;
  itemCount: number;
  /* payment */
  payMethod?: string | null;
  payQr?: string | null;       // data URI / URL for the active method's QR (optional)
  payInfo?: string | null;     // e.g. "GCash 0917…"
  /* thankyou */
  orderNo?: string | null;
  change?: number | null;
  cashTendered?: number | null;
  customerName?: string | null;
  updatedAt: number;
}

export const IDLE_SNAPSHOT: CdSnapshot = {
  mode: "idle",
  lines: [],
  bookings: [],
  subtotal: 0,
  tax: 0,
  service: 0,
  discount: 0,
  total: 0,
  itemCount: 0,
  payMethod: null,
  payQr: null,
  payInfo: null,
  orderNo: null,
  change: null,
  cashTendered: null,
  customerName: null,
  updatedAt: 0,
};

let current: CdSnapshot = IDLE_SNAPSHOT;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getCustomerDisplay(): CdSnapshot {
  return current;
}

/** Replace the live snapshot. `updatedAt` is stamped automatically. */
export function setCustomerDisplay(next: Omit<CdSnapshot, "updatedAt"> & { updatedAt?: number }) {
  current = { ...next, updatedAt: next.updatedAt ?? current.updatedAt + 1 };
  emit();
}

/** Reset to the idle screen. */
export function resetCustomerDisplay() {
  current = { ...IDLE_SNAPSHOT, updatedAt: current.updatedAt + 1 };
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Reactive hook — re-renders on every snapshot change. */
export function useCustomerDisplay(): CdSnapshot {
  return useSyncExternalStore(subscribe, getCustomerDisplay, getCustomerDisplay);
}

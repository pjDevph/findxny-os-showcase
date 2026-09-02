/**
 * Held-cart (park/resume order) helpers.
 *
 * Extracted from app/pos/order.tsx — pure functions used by the held-cart
 * picker list.
 */
import type { Cart } from "./types";

export const MAX_HELD_CARTS = 10;

export interface HeldCartEntry {
  id: string;
  heldAt: number;
  cart: Cart;
}

/** Approximate item count + total for a held cart — for the picker list only
 *  (no tax/service/discount recompute, just enough to tell entries apart). */
export function heldCartQuickTotal(c: Cart): { itemCount: number; total: number } {
  const itemsSum = c.items.reduce((sum, i) => {
    const addonsSum = (i.addons ?? []).reduce((a, ad) => a + ad.price * ad.qty, 0);
    return sum + (i.product.price + addonsSum) * i.qty;
  }, 0);
  const bookingsSum = c.bookings.reduce((sum, b) => sum + b.total, 0);
  const chargesSum  = c.charges.reduce((sum, ch) => sum + ch.amount, 0);
  const itemCount = c.items.reduce((s, i) => s + i.qty, 0) + c.bookings.length + c.charges.length;
  return { itemCount, total: itemsSum + bookingsSum + chargesSum };
}

export function relativeHeldTime(heldAt: number): string {
  const mins = Math.max(0, Math.round((Date.now() - heldAt) / 60000));
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

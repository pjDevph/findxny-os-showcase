/**
 * POS cart state machine.
 *
 * Extracted verbatim from app/pos/order.tsx — pure reducer, no React, no I/O,
 * so it can be unit-tested and reused by any screen that builds an order.
 */
import type {
  Cart, CartCharge, CartItem, Product, SelectedAddon,
  OrderType, DiscountType, BookingCartItem, AppliedVoucher,
} from "./types";

export type CartAction =
  | { type: "ADD"; product: Product }
  | { type: "ADD_WITH_ADDONS"; product: Product; addons: SelectedAddon[]; effectivePrice: number }
  | { type: "SET_QTY"; id: string; qty: number }
  | { type: "SET_NOTES"; id: string; notes: string }
  | { type: "SET_ITEM_DISCOUNT"; id: string; amount: number; discountType: DiscountType }
  | { type: "SET_TYPE"; orderType: OrderType }
  | { type: "SET_TABLE"; tableNo: string }
  | { type: "SET_CUSTOMER"; name: string }
  | { type: "SET_DISCOUNT"; amount: number }
  | { type: "SET_DISCOUNT_TYPE"; discountType: DiscountType }
  | { type: "SET_SENIOR_PWD"; value: boolean }
  | { type: "SET_DISCOUNT_APPROVAL"; approvalId: string }
  | { type: "SET_INTERNAL_NOTE"; note: string }
  | { type: "SET_FLOOR"; floor: string }
  | { type: "ADD_BOOKING"; booking: BookingCartItem }
  | { type: "REMOVE_BOOKING"; tempId: string }
  | { type: "ADD_CHARGE"; charge: CartCharge }
  | { type: "REMOVE_CHARGE"; tempId: string }
  | { type: "LOAD_ITEMS"; items: CartItem[] }
  | { type: "SET_LOYALTY_REDEEM"; payload: { points: number; peso_value: number } }
  | { type: "CLEAR_LOYALTY" }
  | { type: "SET_VOUCHER"; voucher: AppliedVoucher }
  | { type: "CLEAR_VOUCHER" }
  | { type: "CLEAR" };

export const EMPTY_CART: Cart = {
  items: [], bookings: [], charges: [], orderType: "dine_in", tableNo: "", customerName: "",
  discount: 0, discountType: "amount", is_senior_pwd: false, internalNote: "", floor: "",
  loyalty_points_to_redeem: 0, loyalty_peso_discount: 0,
  applied_voucher: null,
};

export function cartReducer(state: Cart, a: CartAction): Cart {
  switch (a.type) {
    case "ADD": {
      const ex = state.items.find(i => i.product.id === a.product.id && !i.addons?.length);
      if (ex) return { ...state, items: state.items.map(i => i.product.id === a.product.id && !i.addons?.length ? { ...i, qty: i.qty + 1 } : i) };
      // Bundle/platter products carry their inclusions in `description` (e.g.
      // "4 Pork BBQ, 4 Chicken BBQ, 1 Inasal, Rice Platter") — pre-fill the
      // line's notes with it so it prints on the kitchen ticket without the
      // cashier having to type it every time. Plain products have no
      // description, so this is a no-op for them. Still just a starting
      // value — SET_NOTES can edit/append per order same as any other note.
      return { ...state, items: [...state.items, { product: a.product, qty: 1, notes: a.product.description ?? "" }] };
    }
    case "ADD_WITH_ADDONS": {
      // Each add-with-addons always creates a new line (unique combination of addons)
      const productWithPrice = { ...a.product, price: a.effectivePrice };
      return { ...state, items: [...state.items, { product: productWithPrice, qty: 1, notes: a.product.description ?? "", addons: a.addons }] };
    }
    case "SET_QTY":
      if (a.qty <= 0) return { ...state, items: state.items.filter(i => i.product.id !== a.id) };
      return { ...state, items: state.items.map(i => i.product.id === a.id ? { ...i, qty: a.qty } : i) };
    case "SET_NOTES":
      return { ...state, items: state.items.map(i => i.product.id === a.id ? { ...i, notes: a.notes } : i) };
    case "SET_ITEM_DISCOUNT":
      return {
        ...state,
        items: state.items.map(i => i.product.id === a.id
          ? { ...i, discount: Math.max(0, a.amount), discountType: a.discountType }
          : i),
      };
    case "SET_TYPE":
      // Floor/seating-area only applies to dine-in — clear it when switching
      // away so a stale floor from a prior dine-in selection can't leak into
      // a takeout/room-service order.
      return { ...state, orderType: a.orderType, floor: a.orderType === "dine_in" ? state.floor : "" };
    case "SET_TABLE":          return { ...state, tableNo: a.tableNo };
    case "SET_CUSTOMER":       return { ...state, customerName: a.name };
    case "SET_DISCOUNT":       return { ...state, discount: Math.max(0, a.amount), discount_manager_approval_id: undefined };
    case "SET_DISCOUNT_TYPE":  return { ...state, discountType: a.discountType, discount: 0, discount_manager_approval_id: undefined };
    case "SET_SENIOR_PWD":     return { ...state, is_senior_pwd: a.value, discount: 0, discountType: "amount" };
    case "SET_DISCOUNT_APPROVAL": return { ...state, discount_manager_approval_id: a.approvalId };
    case "SET_INTERNAL_NOTE":  return { ...state, internalNote: a.note };
    // Tap the same floor again to deselect — matches how the order-type chips
    // never leave you stuck since exactly one is always selectable there, but
    // floor is optional so it should be possible to clear it back out.
    case "SET_FLOOR":          return { ...state, floor: state.floor === a.floor ? "" : a.floor };
    case "ADD_BOOKING":        return { ...state, bookings: [...state.bookings, a.booking] };
    case "REMOVE_BOOKING":     return { ...state, bookings: state.bookings.filter(b => b.tempId !== a.tempId) };
    case "ADD_CHARGE":         return { ...state, charges: [...state.charges, a.charge] };
    case "REMOVE_CHARGE":      return { ...state, charges: state.charges.filter(c => c.tempId !== a.tempId) };
    case "LOAD_ITEMS": {
      let newItems = [...state.items];
      for (const loaded of a.items) {
        const ex = newItems.find(i => i.product.id === loaded.product.id);
        if (ex) {
          newItems = newItems.map(i =>
            i.product.id === loaded.product.id ? { ...i, qty: i.qty + loaded.qty } : i
          );
        } else {
          newItems.push(loaded);
        }
      }
      return { ...state, items: newItems };
    }
    case "SET_LOYALTY_REDEEM":
      return { ...state, loyalty_points_to_redeem: a.payload.points, loyalty_peso_discount: a.payload.peso_value };
    case "CLEAR_LOYALTY":
      return { ...state, loyalty_points_to_redeem: 0, loyalty_peso_discount: 0 };
    case "SET_VOUCHER":       return { ...state, applied_voucher: a.voucher };
    case "CLEAR_VOUCHER":     return { ...state, applied_voucher: null };
    case "CLEAR":              return { ...EMPTY_CART };
    default:                   return state;
  }
}

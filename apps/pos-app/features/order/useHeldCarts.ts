import { useEffect, useState, type Dispatch } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MAX_HELD_CARTS, type HeldCartEntry } from "./heldCart";
import type { Cart } from "./types";
import type { CartAction } from "./cartReducer";

/**
 * Hold-cart queue (local AsyncStorage array, up to MAX_HELD_CARTS entries).
 * A cashier can park several in-progress carts (e.g. juggling multiple
 * tables) instead of just one — each entry keeps its own id + timestamp so
 * the "Held carts" modal can list and resume/discard them individually.
 */
export function useHeldCarts(cart: Cart, canCheckout: boolean, dispatch: Dispatch<CartAction>, showToast: (msg: string) => void) {
  const [heldCarts, setHeldCarts] = useState<HeldCartEntry[]>([]);
  const [heldCartsModalVisible, setHeldCartsModalVisible] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem("pos_held_carts");
      if (raw) {
        try { setHeldCarts(JSON.parse(raw)); } catch { /* corrupt — ignore, start fresh */ }
        return;
      }
      // One-time migration from the old single-slot key, if present.
      const legacy = await AsyncStorage.getItem("pos_held_cart");
      if (legacy) {
        try {
          const legacyCart = JSON.parse(legacy) as Cart;
          const migrated: HeldCartEntry[] = [{ id: `h_${Date.now()}`, heldAt: Date.now(), cart: legacyCart }];
          setHeldCarts(migrated);
          await AsyncStorage.setItem("pos_held_carts", JSON.stringify(migrated));
        } catch { /* corrupt — drop it */ }
        await AsyncStorage.removeItem("pos_held_cart");
      }
    })();
  }, []);

  async function persistHeldCarts(next: HeldCartEntry[]) {
    setHeldCarts(next);
    await AsyncStorage.setItem("pos_held_carts", JSON.stringify(next));
  }

  async function holdCart() {
    if (!canCheckout) return;
    if (heldCarts.length >= MAX_HELD_CARTS) {
      showToast(`Held cart queue is full (${MAX_HELD_CARTS}/${MAX_HELD_CARTS}) — resume or discard one first`);
      return;
    }
    const entry: HeldCartEntry = { id: `h_${Date.now()}`, heldAt: Date.now(), cart };
    await persistHeldCarts([...heldCarts, entry]);
    dispatch({ type: "CLEAR" });
    showToast("Cart held — tap Resume to reload");
  }

  async function resumeHeldCart(id: string) {
    const entry = heldCarts.find(h => h.id === id);
    if (!entry) return;
    const held = entry.cart;
    dispatch({ type: "CLEAR" });
    if (held.orderType) dispatch({ type: "SET_TYPE", orderType: held.orderType });
    if (held.tableNo) dispatch({ type: "SET_TABLE", tableNo: held.tableNo });
    if (held.customerName) dispatch({ type: "SET_CUSTOMER", name: held.customerName });
    if (held.internalNote) dispatch({ type: "SET_INTERNAL_NOTE", note: held.internalNote });
    // LOAD_ITEMS (not a per-item ADD_WITH_ADDONS loop) — ADD_WITH_ADDONS always
    // hardcodes qty:1 and notes:"" for a fresh line, so resuming this way silently
    // reset every held item's quantity to 1 and dropped its notes. The cart was
    // just cleared above, so LOAD_ITEMS has nothing to merge against and simply
    // restores each held item exactly as it was (qty, notes, addons included).
    if (held.items.length > 0) dispatch({ type: "LOAD_ITEMS", items: held.items });
    await persistHeldCarts(heldCarts.filter(h => h.id !== id));
    setHeldCartsModalVisible(false);
    showToast(`Resumed: ${held.items.length} item(s)`);
  }

  async function discardHeldCart(id: string) {
    await persistHeldCarts(heldCarts.filter(h => h.id !== id));
    showToast("Held cart discarded");
  }

  return { heldCarts, heldCartsModalVisible, setHeldCartsModalVisible, holdCart, resumeHeldCart, discardHeldCart };
}

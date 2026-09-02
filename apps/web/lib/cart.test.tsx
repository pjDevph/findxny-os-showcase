// Integration test for the cart hook. Exercises:
//   • localStorage persistence
//   • the custom "mtm-cart-change" event bridge between cart.* mutators and
//     subscribers (so two components stay in sync)
//   • totals math (subtotal + service + VAT, rounded per receipt rules)
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { cart, useCart } from "./cart";

beforeEach(() => {
  localStorage.clear();
});

describe("cart mutators", () => {
  it("add() inserts a new line at quantity 1", () => {
    cart.add("p1", "Cookie", 50);
    expect(cart.get()).toEqual([{ product_id: "p1", name: "Cookie", price: 50, quantity: 1 }]);
  });

  it("add() on existing line increments quantity (price/name unchanged)", () => {
    cart.add("p1", "Cookie", 50);
    cart.add("p1", "Cookie", 50);
    expect(cart.get()).toEqual([{ product_id: "p1", name: "Cookie", price: 50, quantity: 2 }]);
  });

  it("dec() reduces quantity and removes the line at zero", () => {
    cart.add("p1", "Cookie", 50);
    cart.add("p1", "Cookie", 50);
    cart.dec("p1");
    expect(cart.get()).toEqual([{ product_id: "p1", name: "Cookie", price: 50, quantity: 1 }]);
    cart.dec("p1");
    expect(cart.get()).toEqual([]);
  });

  it("dec() on unknown product is a no-op", () => {
    cart.dec("nope");
    expect(cart.get()).toEqual([]);
  });

  it("setNote() updates an existing line's notes", () => {
    cart.add("p1", "Cookie", 50);
    cart.setNote("p1", "no nuts");
    expect(cart.get()[0].notes).toBe("no nuts");
  });

  it("clear() empties the cart", () => {
    cart.add("p1", "Cookie", 50);
    cart.add("p2", "Latte", 120);
    cart.clear();
    expect(cart.get()).toEqual([]);
  });
});

describe("useCart hook", () => {
  it("reflects current cart on mount", () => {
    cart.add("p1", "Cookie", 50);
    cart.add("p2", "Latte", 120);
    const { result } = renderHook(() => useCart());
    expect(result.current.lines).toHaveLength(2);
    expect(result.current.count).toBe(2);
    expect(result.current.subtotal).toBe(170);
  });

  it("re-renders when cart.add() fires the change event", () => {
    const { result } = renderHook(() => useCart());
    expect(result.current.count).toBe(0);
    act(() => { cart.add("p1", "Cookie", 50); });
    expect(result.current.count).toBe(1);
    expect(result.current.subtotal).toBe(50);
  });

  describe("totals math", () => {
    // Receipt invariant: subtotal × tax / service rounded to centavos (2dp),
    // total = subtotal + svc + vat (no compounding). Must match
    // public-orders-create's computeOrderTotals() exactly — the checkout
    // preview and the actual Xendit charge have to agree to the centavo.
    it("zero rates yield zero svc/vat", () => {
      cart.add("p1", "x", 100);
      const { result } = renderHook(() => useCart());
      expect(result.current.subtotal).toBe(100);
      expect(result.current.svc).toBe(0);
      expect(result.current.vat).toBe(0);
      expect(result.current.total).toBe(100);
    });

    it("applies 12% VAT + 10% service to subtotal independently", () => {
      cart.add("p1", "x", 1000);
      const { result } = renderHook(() => useCart({ taxRate: 0.12, serviceRate: 0.10 }));
      expect(result.current.subtotal).toBe(1000);
      expect(result.current.svc).toBe(100);
      expect(result.current.vat).toBe(120);
      expect(result.current.total).toBe(1220);
    });

    it("rounds vat to 2 decimal places, not a whole peso", () => {
      cart.add("p1", "x", 123); // 123 * 0.12 = 14.76
      const { result } = renderHook(() => useCart({ taxRate: 0.12 }));
      expect(result.current.vat).toBe(14.76);
    });

    it("multiplies by quantity in subtotal", () => {
      cart.add("p1", "x", 50);
      cart.add("p1", "x", 50);
      cart.add("p1", "x", 50);
      const { result } = renderHook(() => useCart());
      expect(result.current.count).toBe(3);
      expect(result.current.subtotal).toBe(150);
    });
  });
});

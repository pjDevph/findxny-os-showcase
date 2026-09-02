"use client";
import { useEffect, useState } from "react";

export interface CartLine {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
}

const KEY = "mtm.cart.v1";

function read(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function write(lines: CartLine[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(lines));
  window.dispatchEvent(new Event("mtm-cart-change"));
}

export const cart = {
  get: read,
  add(product_id: string, name: string, price: number) {
    const lines = read();
    const existing = lines.find((l) => l.product_id === product_id);
    if (existing) existing.quantity++;
    else lines.push({ product_id, name, price, quantity: 1 });
    write(lines);
  },
  inc(product_id: string) { this.add(product_id, "", 0); },
  dec(product_id: string) {
    const lines = read();
    const i = lines.findIndex((l) => l.product_id === product_id);
    if (i < 0) return;
    lines[i].quantity--;
    if (lines[i].quantity <= 0) lines.splice(i, 1);
    write(lines);
  },
  setNote(product_id: string, notes: string) {
    const lines = read();
    const l = lines.find((x) => x.product_id === product_id);
    if (l) { l.notes = notes; write(lines); }
  },
  clear() { write([]); },
};

export interface CartRates {
  /** Decimal fraction, e.g. 0.12 for 12% VAT. */
  taxRate?: number;
  /** Decimal fraction, e.g. 0.10 for 10% service charge. */
  serviceRate?: number;
}

export function useCart(rates: CartRates = {}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  useEffect(() => {
    setLines(read());
    const onChange = () => setLines(read());
    window.addEventListener("mtm-cart-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("mtm-cart-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  // No silent fallbacks — rates come from the workspace via the public-menu
  // API; defaulting to 12%/10% would silently misprice receipts if the
  // caller forgot to pass them.
  const taxRate = rates.taxRate ?? 0;
  const serviceRate = rates.serviceRate ?? 0;
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const svc = +((subtotal * serviceRate).toFixed(2));
  const vat = +((subtotal * taxRate).toFixed(2));
  const total = +(subtotal + svc + vat).toFixed(2);
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  return { lines, subtotal, svc, vat, total, count, taxRate, serviceRate };
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cart, useCart } from "@/lib/cart";
import { peso } from "@/lib/config";

export default function FloatingCart() {
  const { count, subtotal, lines, svc, vat, total } = useCart();
  const prevCount = useRef(count);
  const [bumpAt, setBumpAt] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (count > prevCount.current) setBumpAt(Date.now());
    prevCount.current = count;
  }, [count]);

  useEffect(() => { if (count === 0) setOpen(false); }, [count]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const drawerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    if (!open) {
      el.setAttribute("inert", "");
    } else {
      el.removeAttribute("inert");
    }
  }, [open]);

  function handleClick(e: React.MouseEvent) {
    // Desktop expands a drawer; mobile lets the Link navigate to /food-cart.
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 900px)").matches) {
      e.preventDefault();
      setOpen((v) => !v);
    }
  }

  if (count === 0) return null;
  return (
    <>
      <Link
        href="/food-cart"
        onClick={handleClick}
        className={`cart-fab ${bumpAt ? "is-bump" : ""} ${open ? "is-open" : ""}`}
        key={bumpAt}
        aria-label={`View cart with ${count} items`}
        aria-expanded={open}
      >
        <span className="cart-fab-icon" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1.6" />
            <circle cx="18" cy="21" r="1.6" />
            <path d="M3 4h2l2.4 12.1a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.5L22 8H6" />
          </svg>
          <span className="cart-fab-badge">{count}</span>
        </span>
        <span className="cart-fab-text">
          <span className="cart-fab-lbl">{count} {count === 1 ? "item" : "items"}</span>
          <span className="cart-fab-total">{peso(subtotal)}</span>
        </span>
        <span className="cart-fab-cta">
          View cart
          <svg className="cart-fab-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </Link>

      {open && <div className="cart-drawer-scrim" onClick={() => setOpen(false)} aria-hidden />}
      <aside
        ref={drawerRef}
        className={`cart-drawer ${open ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Your cart"
      >
        <header className="cart-drawer-head">
          <div>
            <div className="cart-drawer-eyebrow">Your cart</div>
            <h3 className="cart-drawer-title">{count} {count === 1 ? "item" : "items"}</h3>
          </div>
          <button className="cart-drawer-close" onClick={() => setOpen(false)} aria-label="Close cart">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <ul className="cart-drawer-list">
          {lines.map((l) => (
            <li key={l.product_id} className="cart-drawer-line">
              <div className="cart-drawer-line-info">
                <div className="cart-drawer-name">{l.name}</div>
                <div className="cart-drawer-unit">{peso(l.price)} each</div>
              </div>
              <div className="cart-drawer-line-end">
                <div className="qty qty-card cart-drawer-qty">
                  <button onClick={() => cart.dec(l.product_id)} aria-label="Decrease">−</button>
                  <span>{l.quantity}</span>
                  <button onClick={() => cart.add(l.product_id, l.name, l.price)} aria-label="Increase">+</button>
                </div>
                <div className="cart-drawer-line-total">{peso(l.price * l.quantity)}</div>
              </div>
            </li>
          ))}
        </ul>

        <div className="cart-drawer-sum">
          <div className="row"><span>Subtotal</span><span>{peso(subtotal)}</span></div>
          <div className="row sub"><span>Service (10%)</span><span>{peso(svc)}</span></div>
          <div className="row sub"><span>VAT (12%)</span><span>{peso(vat)}</span></div>
          <div className="row tot"><span>Total</span><span>{peso(total)}</span></div>
        </div>

        <footer className="cart-drawer-foot">
          <Link href="/food-cart" className="btn btn-primary btn-lg btn-block" onClick={() => setOpen(false)}>
            View full cart →
          </Link>
        </footer>
      </aside>
    </>
  );
}

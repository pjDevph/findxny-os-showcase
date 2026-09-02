"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type MenuResponse } from "@/lib/api";
import { WORKSPACE_SLUG, peso } from "@/lib/config";
import { cart, useCart } from "@/lib/cart";
import { toast } from "@/lib/toast";

export default function FoodCartPage() {
  const [data, setData] = useState<MenuResponse | null>(null);
  const { lines, subtotal, svc, vat, total, count } = useCart();

  useEffect(() => {
    // Load product data so we can show images in cart rows
    api.menu(WORKSPACE_SLUG).then(setData).catch(() => {});
  }, []);

  return (
    <div className="fc-page">
      {/* ── Header ── */}
      <div className="fc-header">
        <Link href="/menu" className="fc-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Menu
        </Link>
        <h1 className="fc-title">Your Order</h1>
        <span className="fc-count">{count} {count === 1 ? "item" : "items"}</span>
      </div>

      {count === 0 ? (
        /* ── Empty state ── */
        <div className="fc-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-3)", marginBottom: 16 }}>
            <circle cx="9" cy="21" r="1.6" /><circle cx="18" cy="21" r="1.6" />
            <path d="M3 4h2l2.4 12.1a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.5L22 8H6" />
          </svg>
          <div className="fc-empty-title">Nothing here yet</div>
          <p className="fc-empty-sub">Add something from the menu first.</p>
          <Link href="/menu" className="btn btn-primary">Browse the menu</Link>
        </div>
      ) : (
        <>
          {/* ── Cart lines ── */}
          <div className="fc-lines">
            {lines.map((l) => {
              const product = data?.products.find((p) => p.id === l.product_id);
              return (
                <div key={l.product_id} className="fc-line">
                  <div className="fc-line-thumb">
                    {product?.image_url
                      ? <img src={product.image_url} alt={l.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div className="art-meal" style={{ width: "100%", height: "100%" }} />}
                  </div>
                  <div className="fc-line-info">
                    <div className="fc-line-name">{l.name}</div>
                    <div className="fc-line-unit">{peso(l.price)} each</div>
                  </div>
                  <div className="fc-line-end">
                    <div className="fc-line-total">{peso(l.price * l.quantity)}</div>
                    <div className="qty qty-card fc-qty">
                      <button
                        onClick={() => {
                          cart.dec(l.product_id);
                          l.quantity === 1
                            ? toast(`Removed ${l.name}`, "remove")
                            : toast(`${l.name} updated`, "info");
                        }}
                        aria-label="Decrease"
                      >−</button>
                      <span>{l.quantity}</span>
                      <button
                        onClick={() => { cart.add(l.product_id, l.name, l.price); toast(`${l.name} +1`); }}
                        aria-label="Increase"
                      >+</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Add more ── */}
          <div className="fc-add-more">
            <Link href="/menu" className="fc-add-more-link">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add more items
            </Link>
          </div>

          {/* ── Totals ── */}
          <div className="fc-totals">
            <div className="fc-row"><span>Subtotal</span><span>{peso(subtotal)}</span></div>
            <div className="fc-row fc-row-sub"><span>Service charge (10%)</span><span>{peso(svc)}</span></div>
            <div className="fc-row fc-row-sub"><span>VAT (12%)</span><span>{peso(vat)}</span></div>
            <div className="fc-row fc-row-grand"><span>Total</span><span>{peso(total)}</span></div>
          </div>

          {/* ── CTA ── */}
          <div className="fc-cta">
            <Link href="/checkout" className="btn btn-primary btn-lg btn-block">
              Continue to checkout →
            </Link>
            <p className="fc-payment-note">GCash · Maya · QRPh · Card · Cash</p>
          </div>
        </>
      )}
    </div>
  );
}

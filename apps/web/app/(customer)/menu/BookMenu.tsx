"use client";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { MenuProduct, MenuResponse } from "@/lib/api";
import { cart } from "@/lib/cart";
import { peso } from "@/lib/config";

// ── Flip-guard ───────────────────────────────────────────────────────────────
// react-pageflip attaches native mousedown/touchstart listeners that the React
// synthetic event system can't stop. Bubble-phase listeners on the hotspot
// itself race with react-pageflip's listener (whichever is attached higher in
// the tree wins). The robust fix: a **capture-phase** guard on the book
// wrapper that intercepts pointer/mouse/touch events headed for any element
// tagged `data-flipguard` and kills them before the flipbook sees them.
//
// Mark interactive zones (hotspots, +Add buttons, qty controls) with
// `data-flipguard="1"`. Empty page areas keep their normal swipe gesture.
const FLIP_GUARD_ATTR = "data-flipguard";
const flipGuardProps = { [FLIP_GUARD_ATTR]: "1" } as Record<string, string>;

// Hotspot hover styling — module-level so they don't add nesting depth when
// used inside the deeply-nested page/hotspot map callbacks.
function svgHotspotEnter(e: React.MouseEvent<SVGElement>) {
  e.currentTarget.setAttribute("fill", "rgba(212,175,55,0.12)");
  e.currentTarget.setAttribute("stroke", "rgba(212,175,55,0.5)");
}
function svgHotspotLeave(e: React.MouseEvent<SVGElement>) {
  e.currentTarget.setAttribute("fill", "transparent");
  e.currentTarget.setAttribute("stroke", "transparent");
}
function divHotspotEnter(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.boxShadow = "inset 0 0 0 2px rgba(212,175,55,0.5)";
}
function divHotspotLeave(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.boxShadow = "none";
}

function useFlipGuard(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const wrap = ref.current;
    if (!wrap) return;
    const guard = (e: Event) => {
      const t = e.target as Element | null;
      if (t?.closest?.(`[${FLIP_GUARD_ATTR}]`)) {
        e.stopImmediatePropagation();
        e.stopPropagation();
      }
    };
    const events: string[] = ["pointerdown", "mousedown", "touchstart"];
    events.forEach((n) => wrap.addEventListener(n, guard, true));
    return () => events.forEach((n) => wrap.removeEventListener(n, guard, true));
  }, [ref]);
}

// ── Add-to-cart confirmation modal ───────────────────────────────────────────
type AddModal = {
  id: string; name: string; price: number;
  image_url?: string | null;
  description?: string | null;
} | null;

function AddToCartModal({ item, onAdd, onClose }: {
  item: NonNullable<AddModal>;
  onAdd: (qty: number) => void;
  onClose: () => void;
}) {
  const [qty, setQty] = useState(1);
  const hasImage = !!item.image_url;
  const total = item.price * qty;

  const handleBackdrop = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <button
      type="button"
      tabIndex={0}
      aria-label="Close"
      onClick={handleBackdrop}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { if (e.target === e.currentTarget) { e.preventDefault(); onClose(); } } }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.72)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 480,
        background: "linear-gradient(180deg, #1e1208 0%, #130d07 100%)",
        borderRadius: "24px 24px 0 0",
        border: "1px solid rgba(212,175,55,0.22)",
        borderBottom: "none",
        boxShadow: "inset 0 1px 0 rgba(212,175,55,0.1), 0 -32px 80px rgba(0,0,0,0.85)",
        display: "flex", flexDirection: "column",
        maxHeight: "82vh", overflow: "hidden",
        position: "relative",
        animation: "slideUp 0.26s cubic-bezier(0.32,0.72,0,1)",
      }}>

        {/* ── Hero image ── */}
        {hasImage ? (
          <div style={{ position: "relative", flexShrink: 0, height: 200, overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.image_url!} alt={item.name}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            {/* bottom fade so content reads over image */}
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(to bottom, rgba(0,0,0,0.15) 40%, rgba(19,13,7,0.92) 100%)",
            }} />
            {/* Name + price overlay on image */}
            <div style={{ position: "absolute", bottom: 16, left: 20, right: 52 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#f5ead2", lineHeight: 1.2, textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>
                {item.name}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#d4af57", marginTop: 2 }}>
                {peso(item.price)}
              </div>
            </div>
          </div>
        ) : (
          /* No image — icon + name side by side in a warm header strip */
          <div style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "20px 52px 18px 20px",  /* right: 52px clears the close button */
            borderBottom: "1px solid rgba(212,175,55,0.1)",
          }}>
            <div style={{
              flexShrink: 0, width: 52, height: 52, borderRadius: 14,
              background: "radial-gradient(circle at 35% 35%, #2a1d10, #0e0905)",
              border: "1px solid rgba(212,175,55,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26, boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            }}>☕</div>
            <div>
              <div style={{ fontSize: 19, fontWeight: 800, color: "#f5ead2", lineHeight: 1.2 }}>
                {item.name}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#d4af57", marginTop: 3 }}>
                {peso(item.price)}
              </div>
            </div>
          </div>
        )}

        {/* Close button */}
        <button onClick={onClose} aria-label="Close" style={{
          position: "absolute", top: 14, right: 14, zIndex: 4,
          width: 30, height: 30, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          color: "rgba(255,255,255,0.65)", fontSize: 12,
        }}>✕</button>

        {/* ── Description (scrollable) ── */}
        {item.description && (
          <div style={{ padding: "14px 20px 2px", overflowY: "auto" }}>
            <p style={{ margin: 0, fontSize: 13, color: "rgba(245,234,210,0.38)", lineHeight: 1.6 }}>
              {item.description}
            </p>
          </div>
        )}

        {/* ── Footer: qty + CTA ── */}
        <div style={{
          flexShrink: 0,
          padding: "18px 20px 32px",
          borderTop: item.description ? "1px solid rgba(212,175,55,0.08)" : "none",
          marginTop: "auto",
        }}>
          {/* Qty row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase",
              color: "rgba(212,175,55,0.5)",
            }}>Quantity</span>

            {/* Pill qty selector */}
            <div style={{
              display: "flex", alignItems: "center",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(212,175,55,0.2)",
              borderRadius: 999, overflow: "hidden",
            }}>
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                style={{
                  width: 44, height: 40, border: "none", background: "transparent",
                  color: qty === 1 ? "rgba(212,175,55,0.2)" : "#d4af57",
                  fontSize: 22, cursor: "pointer", lineHeight: 1,
                }}
              >−</button>
              <span style={{
                minWidth: 32, textAlign: "center",
                fontSize: 16, fontWeight: 700, color: "#f5ead2",
              }}>{qty}</span>
              <button
                onClick={() => setQty(q => q + 1)}
                style={{
                  width: 44, height: 40, border: "none", background: "transparent",
                  color: "#d4af57", fontSize: 22, cursor: "pointer", lineHeight: 1,
                }}
              >+</button>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={() => onAdd(qty)}
            style={{
              width: "100%", padding: "15px 20px",
              borderRadius: 14, border: "none",
              background: "linear-gradient(135deg, #c8961e 0%, #d4af57 55%, #b07c2a 100%)",
              color: "#1a0c04", fontWeight: 800, fontSize: 15,
              cursor: "pointer", letterSpacing: 0.3,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
              boxShadow: "0 6px 24px rgba(212,175,55,0.3), inset 0 1px 0 rgba(255,255,255,0.25)",
              fontFamily: "inherit",
            }}
          >
            <span>Add to Order</span>
            <span style={{
              background: "rgba(0,0,0,0.18)", borderRadius: 8,
              padding: "3px 12px", fontSize: 14, fontWeight: 700,
            }}>{peso(total)}</span>
          </button>
        </div>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(80px); opacity: 0; } to { transform: none; opacity: 1; } }`}</style>
    </button>
  );
}

// ── Admin-config types (mirrors MenuBookMapper) ───────────────────────────────
type ShapeType = "rect" | "square" | "ellipse" | "circle" | "freehand";
type AdminHotspot = {
  x: number; y: number; w: number; h: number;
  shape?: ShapeType;
  points?: Array<{ x: number; y: number }>;
  blendColor?: string;
  name: string; price: number; cat: string;
  productId?: string;
};
type AdminPage = {
  id: number;
  label: string;
  imageDataUrl?: string;
};
type AdminCfg = {
  pages: AdminPage[];
  hotspots: Record<number, AdminHotspot[]>;
};

type ResolvedHotspot = { id: string; name: string; price: number; image_url?: string | null; description?: string | null };
type OpenModalFn = (id: string, name: string, price: number, image_url?: string | null, description?: string | null) => void;

// Clickable hotspot overlays for an admin image page. Extracted to module level
// so the per-hotspot handlers don't exceed the max function-nesting depth.
function HotspotLayers({
  spots, resolveHotspot, openModal,
}: {
  spots: AdminHotspot[];
  resolveHotspot: (h: AdminHotspot) => ResolvedHotspot | null;
  openModal: OpenModalFn;
}) {
  return (
    <>
      {/* SVG layer — ellipse, circle, freehand */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}
      >
        {spots.map((h, i) => {
          const sh = h.shape ?? "rect";
          if (sh !== "ellipse" && sh !== "circle" && sh !== "freehand") return null;
          const resolved = resolveHotspot(h);
          if (!resolved) return null;
          const svgProps = {
            ...flipGuardProps,
            fill: "transparent" as const, stroke: "transparent" as const, strokeWidth: "0.6",
            style: { pointerEvents: "all" as const, cursor: "pointer" },
            onClick: (e: React.MouseEvent) => { e.stopPropagation(); openModal(resolved.id, resolved.name, resolved.price, resolved.image_url, resolved.description); },
            onMouseEnter: svgHotspotEnter,
            onMouseLeave: svgHotspotLeave,
          };
          if (sh === "freehand" && h.points) {
            return <polygon key={i} points={h.points.map(p => `${p.x},${p.y}`).join(" ")} {...svgProps} />;
          }
          const cx = h.x + h.w/2, cy = h.y + h.h/2;
          return <ellipse key={i} cx={cx} cy={cy} rx={h.w/2} ry={h.h/2} {...svgProps} />;
        })}
      </svg>

      {/* Div overlays — rect + square */}
      {spots.map((h, i) => {
        const sh = h.shape ?? "rect";
        if (sh === "ellipse" || sh === "circle" || sh === "freehand") return null;
        const resolved = resolveHotspot(h);
        if (!resolved) return null;
        return (
          <button
            key={i}
            {...flipGuardProps}
            onClick={(e) => { e.stopPropagation(); openModal(resolved.id, resolved.name, resolved.price, resolved.image_url, resolved.description); }}
            title={`${resolved.name} — ${peso(resolved.price)}`}
            style={{
              position: "absolute",
              left: `${h.x}%`, top: `${h.y}%`, width: `${h.w}%`, height: `${h.h}%`,
              background: "transparent", border: "none",
              borderRadius: sh === "square" ? 2 : 4,
              cursor: "pointer", outline: "none", transition: "box-shadow 0.15s",
            }}
            onMouseEnter={divHotspotEnter}
            onMouseLeave={divHotspotLeave}
          />
        );
      })}
    </>
  );
}

const FlipBook = dynamic(() => import("./FlipBookRef"), {
  ssr: false,
  loading: () => <div className="book-loading">Loading menu…</div>,
});

const ITEMS_PER_PAGE = 5;
const FLIP_INTERVAL_MS = 420; // slightly more than flippingTime

const Page = forwardRef<HTMLDivElement, { children?: React.ReactNode }>(
  ({ children }, ref) => <div ref={ref} className="book-page">{children}</div>,
);
Page.displayName = "Page";

export default function BookMenu({
  data,
  qtyByProduct,
  targetCatId,
  isMobile = false,
  readOnly = false,
}: {
  data: MenuResponse;
  qtyByProduct: Map<string, number>;
  targetCatId: string | null;
  isMobile?: boolean;
  /** Online ordering off — the book becomes a browse-only menu: no add
   *  buttons, no qty steppers, tapping a dish doesn't open the add sheet. */
  readOnly?: boolean;
}) {
  const bookRef = useRef<any>(null);
  const bookWrapRef = useRef<HTMLDivElement>(null);
  const catPageMap = useRef<Map<string, number>>(new Map());
  const [curPage, setCurPage] = useState(0);
  useFlipGuard(bookWrapRef);

  // ── Mobile tips popup (shown once, dismissed to localStorage) ────────────
  const [showMobileTips, setShowMobileTips] = useState(false);
  useEffect(() => {
    if (!isMobile) return;
    if (!localStorage.getItem("mtm_tips_seen")) setShowMobileTips(true);
  }, [isMobile]);
  const dismissTips = useCallback(() => {
    localStorage.setItem("mtm_tips_seen", "1");
    setShowMobileTips(false);
  }, []);

  // ── Responsive book dimensions (fits the viewport on mobile) ─────────────
  const [bookDims, setBookDims] = useState({ w: 360, h: 560 });
  useEffect(() => {
    const update = () => {
      if (!isMobile) { setBookDims({ w: 360, h: 560 }); return; }
      // Leave room for: search bar ~60px, hint ~70px, controls ~56px, padding ~40px
      const maxH = window.innerHeight - 226;
      const maxW = window.innerWidth - 32;
      // Keep the page's natural aspect ratio (portrait page ≈ 9:14)
      const byWidth  = { w: maxW, h: Math.round(maxW * 14 / 9) };
      const byHeight = { w: Math.round(maxH * 9 / 14), h: maxH };
      setBookDims(byWidth.h <= maxH ? byWidth : byHeight);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [isMobile]);

  // ── Add-to-cart modal state ───────────────────────────────────────────────
  const [addModal, setAddModal] = useState<AddModal>(null);
  const openModal  = useCallback((id: string, name: string, price: number, image_url?: string | null, description?: string | null) => {
    if (readOnly) return;
    setAddModal({ id, name, price, image_url, description });
  }, [readOnly]);
  const closeModal = useCallback(() => setAddModal(null), []);
  const confirmAdd = useCallback((qty: number) => {
    if (addModal) {
      for (let i = 0; i < qty; i++) cart.add(addModal.id, addModal.name, addModal.price);
    }
    setAddModal(null);
  }, [addModal]);

  // ── Admin image config now comes from the server (data.menu_book) ──
  const adminCfg = useMemo<AdminCfg | null>(() => {
    const mb = data.menu_book;
    if (!mb?.pages?.length) return null;
    const pages: AdminPage[] = mb.pages.map((p) => ({
      id: p.page_no,
      label: p.label,
      imageDataUrl: p.image_url ?? undefined,
    }));
    const hotspots: Record<number, AdminHotspot[]> = {};
    for (const pageNo in mb.hotspots) {
      hotspots[Number(pageNo)] = mb.hotspots[Number(pageNo)].map((h) => ({
        x: h.x, y: h.y, w: h.w, h: h.h,
        shape: h.shape,
        points: h.points ?? undefined,
        blendColor: h.blend_color ?? undefined,
        name: h.name,
        price: h.price,
        cat: h.cat ?? "",
        productId: h.product_id ?? undefined,
      }));
    }
    return { pages, hotspots };
  }, [data.menu_book]);
  // Image mode = admin has uploaded page images; text mode = Supabase-driven fallback
  const isImageMode = !!adminCfg?.pages.some((p) => p.imageDataUrl);

  const cats = useMemo(() => {
    const map = new Map<string, { id: string; name: string; sort_order: number }>();
    for (const p of data.products) {
      if (p.category) map.set(p.category.id, p.category);
    }
    return [...map.values()].sort((a, b) => a.sort_order - b.sort_order);
  }, [data]);

  const productsByCat = useMemo(() => {
    const map = new Map<string, MenuProduct[]>();
    for (const cat of cats) {
      map.set(cat.id, data.products.filter((p) => p.category?.id === cat.id));
    }
    return map;
  }, [data, cats]);

  // Build pages + record each category's page index
  const pages = useMemo(() => {
    // ── IMAGE MODE — admin has uploaded page images ───────────────────────────
    if (adminCfg?.pages.some((p) => p.imageDataUrl)) {
      // Name-based fallback map: handles re-imported products whose UUIDs changed
      const activeByName = new Map(data.products.map((p) => [p.name.toLowerCase().trim(), p]));

      /** Resolve a hotspot to a live product (UUID match → name match → null) */
      function resolveHotspot(h: AdminHotspot): { id: string; name: string; price: number; image_url?: string | null; description?: string | null } | null {
        // UUID match (live ID)
        if (h.productId) {
          const byId = data.products.find((p) => p.id === h.productId);
          if (byId) return { id: byId.id, name: byId.name, price: byId.price, image_url: byId.image_url, description: byId.featured_blurb ?? null };
        }
        // Name-based fallback (covers re-import with new UUIDs)
        const byName = activeByName.get(h.name.toLowerCase().trim());
        if (byName) return { id: byName.id, name: byName.name, price: byName.price, image_url: byName.image_url, description: byName.featured_blurb ?? null };
        return null;
      }

      // Shared base styles for branded pages
      const brandBase: React.CSSProperties = {
        width: "100%", height: "100%",
        background: "linear-gradient(160deg, #1c1108 0%, #2d1a0c 60%, #1a0f07 100%)",
        display: "flex", flexDirection: "column",
        alignItems: "center",
        boxShadow: "inset 0 0 80px rgba(0,0,0,0.5)",
        padding: "28px 24px",
        overflow: "hidden",
      };
      const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

      // Inside-cover (index 0): logo + location + how-to instructions
      const InsideCoverPage = (
        <Page key="inside-cover-left">
          <div style={{ ...brandBase, justifyContent: "center", gap: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo1.png" alt="Mugthemug" style={{ width: 90, height: "auto", objectFit: "contain", opacity: 0.88, marginBottom: 10 }} />
            <div style={{ width: 32, height: 1, background: "rgba(var(--tint-rgb), 0.4)", marginBottom: 8 }} />
            <div style={{ ...mono, fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(var(--tint-rgb), 0.6)", marginBottom: 3 }}>
              Menu &amp; Drink List
            </div>
            <div style={{ ...mono, fontSize: 8, color: "rgba(255,220,150,0.3)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 22 }}>
              {data.workspace.name}
            </div>

            {/* Instructions */}
            <div style={{ width: "100%", borderTop: "1px solid rgba(var(--tint-rgb), 0.12)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 13 }}>
              <div style={{ ...mono, fontSize: 8, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(var(--tint-rgb), 0.45)", marginBottom: 2 }}>
                How to order
              </div>
              {[
                { path: "M9 18l6-6-6-6", label: "Swipe or tap Prev / Next to browse" },
                { path: "M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z", label: "Tap any dish to add to your cart" },
                { path: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z", label: "Switch to Grid for faster browsing" },
                { path: "M3 4h2l2.4 12.1a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.5L22 8H6M9 21a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM18 21a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z", label: "Cart saves your items as you browse" },
              ].map(({ path, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    flexShrink: 0, width: 24, height: 24, borderRadius: 6,
                    background: "rgba(var(--tint-rgb), 0.08)",
                    border: "1px solid rgba(var(--tint-rgb), 0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(var(--tint-rgb), 0.7)" strokeWidth="2" strokeLinecap="round">
                      <path d={path} />
                    </svg>
                  </div>
                  <span style={{ fontSize: 9.5, color: "rgba(255,220,150,0.5)", lineHeight: 1.45, fontFamily: "Georgia, serif" }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: "auto", paddingTop: 18, ...mono, fontSize: 8, color: "rgba(255,220,150,0.18)", letterSpacing: "0.1em", textAlign: "center" }}>
              OPEN 24 HRS · 7 DAYS A WEEK
            </div>
          </div>
        </Page>
      );

      // End-of-menu page (appended when needed to keep even count)
      const EndPage = (
        <Page key="end-of-menu">
          <div style={{ ...brandBase, justifyContent: "center", gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo1.png" alt="Mugthemug" style={{ width: 80, height: "auto", objectFit: "contain", opacity: 0.7 }} />
            <div style={{ width: 28, height: 1, background: "rgba(var(--tint-rgb), 0.3)" }} />
            <div style={{ fontFamily: "Georgia, serif", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(var(--tint-rgb), 0.45)", textAlign: "center" }}>
              End of Menu
            </div>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 10, color: "rgba(255,220,150,0.25)", letterSpacing: "0.08em", textAlign: "center", lineHeight: 1.7 }}>
              Thank you for dining with us.
            </div>
          </div>
        </Page>
      );

      const contentNodes: React.ReactNode[] = adminCfg.pages.map((pg) => {
        const spots: AdminHotspot[] = adminCfg.hotspots[pg.id] ?? [];
        return (
          <Page key={`admin-${pg.id}`}>
            <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
              {pg.imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pg.imageDataUrl}
                  alt={pg.label}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{
                  width: "100%", height: "100%", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  background: "#f5f0e8", color: "#bbb", fontSize: 13,
                }}>
                  {pg.label}
                </div>
              )}

              <HotspotLayers spots={spots} resolveHotspot={resolveHotspot} openModal={openModal} />
            </div>
          </Page>
        );
      });

      // Build final page array:
      // [inside-cover-left] + [all content pages] + [end-page if needed to keep count even]
      // showCover=false so every pair fills both sides — no blank halves.
      const nodes: React.ReactNode[] = [InsideCoverPage, ...contentNodes];
      // Ensure even count so all spreads are fully paired
      if (nodes.length % 2 !== 0) nodes.push(EndPage);

      catPageMap.current = new Map();
      return nodes;
    }

    // ── TEXT MODE — standard Supabase-driven flipbook (fallback) ─────────────
    const newCatPageMap = new Map<string, number>();
    const nodes: React.ReactNode[] = [];
    let idx = 0;

    nodes.push(
      <Page key="cover">
        <div className="book-cover-inner">
          <Image
            src="/logo1.png"
            alt="Mugthemug"
            width={220}
            height={88}
            priority
            style={{ objectFit: "contain", width: "auto", height: "auto", marginBottom: 8 }}
          />
          <div className="book-cover-rule" />
          <div className="book-cover-sub">Menu &amp; Drink List</div>
          <div className="book-cover-location">{data.workspace.name}</div>
        </div>
      </Page>,
    );
    idx++;

    nodes.push(
      <Page key="intro">
        <div className="book-page-inner">
          <div className="book-chapter-head">Welcome</div>
          <p className="book-intro">
            Specialty coffee roasted in-house. Chef-driven comfort food plated at any hour.
            A cafe that never closes. Order right here or at the counter.
          </p>
          <div className="book-toc">
            <div className="book-toc-head">Contents</div>
            {cats.map((c) => (
              <div key={c.id} className="book-toc-row">
                <span>{c.name}</span>
                <span className="book-toc-dots" />
                <span>{productsByCat.get(c.id)?.length ?? 0} items</span>
              </div>
            ))}
          </div>
        </div>
      </Page>,
    );
    idx++;

    for (const cat of cats) {
      const items = productsByCat.get(cat.id) ?? [];
      newCatPageMap.set(cat.id, idx);

      nodes.push(
        <Page key={`cat-${cat.id}-div`}>
          <div className="book-cat-divider">
            <div className="book-cat-divider-rule" />
            <div className="book-cat-divider-name">{cat.name}</div>
            <div className="book-cat-divider-count">{items.length} items</div>
            <div className="book-cat-divider-rule" />
          </div>
        </Page>,
      );
      idx++;

      for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
        const chunk = items.slice(i, i + ITEMS_PER_PAGE);
        nodes.push(
          <Page key={`cat-${cat.id}-${i}`}>
            <div className="book-page-inner">
              <div className="book-page-cat">{cat.name}</div>
              <div className="book-items">
                {chunk.map((item) => (
                  <BookItem key={item.id} item={item} qty={qtyByProduct.get(item.id) ?? 0} readOnly={readOnly} />
                ))}
              </div>
            </div>
          </Page>,
        );
        idx++;
      }
    }

    nodes.push(
      <Page key="back">
        <div className="book-cover-inner book-back">
          <Image
            src="/logo1.png"
            alt="Mugthemug"
            width={160}
            height={64}
            style={{ objectFit: "contain", width: "auto", height: "auto" }}
          />
          <div className="book-cover-location">{data.workspace.name}</div>
        </div>
      </Page>,
    );

    catPageMap.current = newCatPageMap;
    return nodes;
  }, [adminCfg, cats, productsByCat, qtyByProduct, openModal, readOnly]);

  // Sequential page-by-page flip to target category
  useEffect(() => {
    if (!targetCatId || !bookRef.current) return;
    const targetPage = targetCatId === "all" ? 0 : catPageMap.current.get(targetCatId);
    if (targetPage === undefined) return;

    const flipBook = bookRef.current.pageFlip();
    const current: number = flipBook.getCurrentPageIndex();
    const diff = targetPage - current;
    if (Math.abs(diff) < 1) return;

    const dir = diff > 0 ? 1 : -1;
    // Each flipNext/Prev advances 2 page indices (one leaf = 2 pages)
    const flipsNeeded = Math.ceil(Math.abs(diff) / 2);
    let count = 0;

    const iv = setInterval(() => {
      count++;
      if (dir > 0) flipBook.flipNext();
      else flipBook.flipPrev();
      if (count >= flipsNeeded) clearInterval(iv);
    }, FLIP_INTERVAL_MS);

    return () => clearInterval(iv);
  }, [targetCatId]);

  // Page indicator text — "Page X of Y" normally, "End of menu" on last spread
  const isAtEnd = isMobile ? curPage >= pages.length - 1 : curPage >= pages.length - 2;
  const pageLabel = isAtEnd
    ? "End of menu · Thank you for dining with us"
    : `Page ${curPage + 1} of ${pages.length}`;

  return (
    <>
    {addModal && (
      <AddToCartModal item={addModal} onAdd={confirmAdd} onClose={closeModal} />
    )}

    {/* ── Mobile: one-time tips popup ── */}
    {isMobile && showMobileTips && (
      <button
        type="button"
        tabIndex={0}
        aria-label="Dismiss tips"
        onClick={dismissTips}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " " || e.key === "Escape") { e.preventDefault(); dismissTips(); } }}
        style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "rgba(0,0,0,0.72)",
          display: "flex", alignItems: "flex-end",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          style={{
            width: "100%", background: "#1a130d",
            borderRadius: "20px 20px 0 0",
            padding: "24px 20px 36px",
            borderTop: "1px solid rgba(var(--tint-rgb), 0.15)",
            animation: "slideUp 0.25s ease",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--amber)" }}>
              How to use the menu
            </span>
            <button onClick={dismissTips} style={{
              background: "rgba(255,255,255,0.06)", border: "none", borderRadius: "50%",
              width: 28, height: 28, cursor: "pointer", color: "var(--text-2)",
              fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
            }}>✕</button>
          </div>
          {/* Mobile popup tips list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {(readOnly
              ? [
                  { title: "Browse pages", body: "Swipe or tap Prev / Next to flip through the menu." },
                  { title: "Switch to Grid", body: "Use the toggle at the top for faster category browsing." },
                  { title: "To order", body: "Online ordering is paused — order at the counter or give us a call." },
                ]
              : [
                  { title: "Browse pages", body: "Swipe or tap Prev / Next to flip through the menu." },
                  { title: "Tap to order", body: "Tap any dish on the page to add it to your cart." },
                  { title: "Switch to Grid", body: "Use the toggle at the top for faster category browsing." },
                  { title: "Your cart", body: "Items save as you browse — check out anytime." },
                ]
            ).map(({ title, body }) => (
              <div key={title} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-0)" }}>{title}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.5 }}>{body}</div>
              </div>
            ))}
          </div>
          <button
            onClick={dismissTips}
            style={{
              marginTop: 24, width: "100%", padding: "14px 0",
              borderRadius: 12, border: "none",
              background: "linear-gradient(135deg,#d4af57,#b8963e)",
              color: "#fff", fontWeight: 700, fontSize: 15,
              cursor: "pointer", letterSpacing: 0.3,
            }}
          >
            Got it — start browsing →
          </button>
        </div>
        <style>{`@keyframes slideUp { from { transform: translateY(60px); opacity: 0; } to { transform: none; opacity: 1; } }`}</style>
      </button>
    )}

    {/* ── Book (centered, full-width, no side panel) ── */}
    <div className="book-wrap" ref={bookWrapRef}>
      <div className="book-main">
        <FlipBook
          forwardedRef={bookRef}
          width={bookDims.w}
          height={bookDims.h}
          size="fixed"
          showCover={!isImageMode}
          drawShadow
          flippingTime={380}
          usePortrait={isMobile}
          mobileScrollSupport={isMobile}
          maxShadowOpacity={0.35}
          className="book-flip"
          onFlip={(e: any) => setCurPage(e.data)}
        >
          {pages}
        </FlipBook>

        <div className="book-controls">
          <button
            className="book-btn"
            disabled={curPage === 0}
            onPointerDown={(e) => {
              e.stopPropagation();
              const pf = bookRef.current?.pageFlip();
              if (pf) { const p = Math.max(0, curPage - 1); pf.turnToPage(p); setCurPage(p); }
            }}
          >← Prev</button>
          <button
            className="book-btn"
            disabled={curPage >= pages.length - 1}
            onPointerDown={(e) => {
              e.stopPropagation();
              const pf = bookRef.current?.pageFlip();
              if (pf) { const p = Math.min(pages.length - 1, curPage + 1); pf.turnToPage(p); setCurPage(p); }
            }}
          >Next →</button>
        </div>

        {/* Page indicator — only shown when not at the end (end-of-menu page is self-explanatory) */}
        {!isAtEnd && <p className="book-page-indicator">{pageLabel}</p>}
      </div>
    </div>
    </>
  );
}

function BookItem({ item, qty, readOnly = false }: { item: MenuProduct; qty: number; readOnly?: boolean }) {
  return (
    <div className="book-item">
      <div className="book-item-row">
        <span className="book-item-name">{item.name}</span>
        <span className="book-item-dots" />
        <span className="book-item-price">{peso(item.price)}</span>
      </div>
      {readOnly ? null : (
      <div className="book-item-actions" {...flipGuardProps}>
        {qty === 0 ? (
          <button className="book-add" onClick={(e) => { e.stopPropagation(); cart.add(item.id, item.name, item.price); }}>
            + Add
          </button>
        ) : (
          <div className="book-qty">
            <button onClick={(e) => { e.stopPropagation(); cart.dec(item.id); }}>−</button>
            <span>{qty}</span>
            <button onClick={(e) => { e.stopPropagation(); cart.add(item.id, item.name, item.price); }}>+</button>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

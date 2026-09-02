"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, MenuProduct, MenuResponse } from "@/lib/api";
import { WORKSPACE_SLUG, peso, ONLINE_ORDERING_ENABLED } from "@/lib/config";
import { cart, useCart } from "@/lib/cart";
import { toast } from "@/lib/toast";
import FloatingCart from "./FloatingCart";
import BookMenu from "./BookMenu";

const ART_BY_CAT: Record<string, string> = {
  Drinks: "art-coffee",
  Coffee: "art-coffee",
  Food: "art-meal",
  Breakfast: "art-bf",
  Meals: "art-meal",
  Snacks: "art-snack",
  Desserts: "art-dessert",
};

export default function MenuPage() {
  const [data, setData] = useState<MenuResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState("all");
  // Always null today — kept as a typed constant so BookMenu's targetCatId
  // contract is preserved while no UI currently sets a target category.
  const bookCat: string | null = null;
  const [q, setQ] = useState("");
  // Menu Book is always the primary/default — matches brand identity.
  // Must be a static value so SSR and client hydrate identically (no window access at init).
  const [view, setView] = useState<"grid" | "book">("book");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 900);
      // Don't auto-switch view — Menu Book is always the default;
      // let the user choose via the toggle if they want Grid.
    };
    check(); // run once on mount before any resize
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const { lines } = useCart();
  const qtyByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) m.set(l.product_id, l.quantity);
    return m;
  }, [lines]);

  useEffect(() => {
    api.menu(WORKSPACE_SLUG)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const cats = useMemo(() => {
    if (!data) return [];
    const set = new Map<string, { id: string; name: string; sort_order: number }>();
    for (const p of data.products) {
      if (p.category) set.set(p.category.id, p.category);
    }
    return [...set.values()].sort((a, b) => a.sort_order - b.sort_order);
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const ql = q.toLowerCase();
    return data.products.filter((p) => {
      if (activeCat !== "all" && p.category?.id !== activeCat) return false;
      if (ql && !p.name.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [data, activeCat, q]);

  const groups = useMemo(() => {
    if (activeCat !== "all") {
      const cat = cats.find((c) => c.id === activeCat);
      return cat ? [{ cat, items: filtered }] : [];
    }
    return cats
      .map((c) => ({ cat: c, items: filtered.filter((p) => p.category?.id === c.id) }))
      .filter((g) => g.items.length);
  }, [filtered, cats, activeCat]);

  return (
    <>
      <section className="container menu-hero">
        <div className="eyebrow">All-day · Late-night menu</div>
        <h1 className="h-display h1">Menu.</h1>
        <p className="lead">Roasted in-house, plated by chefs who believe a 3am tapsilog is sacred.</p>
      </section>

      <div className="container">
        {!ONLINE_ORDERING_ENABLED && (
          <div style={{
            padding: "12px 18px", marginBottom: 16,
            background: "rgba(var(--tint-rgb), 0.06)",
            border: "1px solid rgba(var(--tint-rgb), 0.18)",
            borderRadius: 12, fontSize: 13, color: "var(--text-2)",
          }}>
            Online ordering is paused — browse the full menu here, then order at the
            counter or by phone. We&apos;re open 24/7.
          </div>
        )}

        {/* ── Mobile Book mode: immersive — just toggle + book, nothing else ── */}
        {isMobile && view === "book" && (
          <>
            {/* Compact centered toggle — the only chrome in book mode */}
            <div className="menu-view-switcher menu-view-switcher--top">
              <div className="mvs-pill">
                <button className={`mvs-btn ${(view as string) === "grid" ? "active" : ""}`} onClick={() => setView("grid")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                  Grid
                </button>
                <button className={`mvs-btn ${(view as string) === "book" ? "active" : ""}`} onClick={() => setView("book")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                  Menu Book
                </button>
              </div>
            </div>
            {!loading && !error && data && (
              <BookMenu data={data} qtyByProduct={qtyByProduct} targetCatId={bookCat} isMobile={isMobile} readOnly={!ONLINE_ORDERING_ENABLED} />
            )}
          </>
        )}

        {/* ── Grid mode (all sizes) + Desktop book mode ── */}
        {(!isMobile || view === "grid") && (
          <>
            {/* Toolbar: search + cats + desktop toggle */}
            <div className="menu-toolbar">
              {view === "grid" && (
                <div className="search">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
                  </svg>
                  <input placeholder="Search the menu…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
              )}
              {view === "grid" && (
                <CatBar cats={cats} activeCat={activeCat} onSelect={setActiveCat} />
              )}
              {/* Desktop icon toggle inside toolbar */}
              <div className="view-toggle view-toggle-desktop">
                <button className={`view-btn ${view === "grid" ? "active" : ""}`} onClick={() => setView("grid")} title="Grid view">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                </button>
                <button className={`view-btn ${view === "book" ? "active" : ""}`} onClick={() => setView("book")} title="Book view">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                </button>
              </div>
            </div>

            {/* Mobile grid mode: centered pill toggle below toolbar */}
            {isMobile && view === "grid" && (
              <div className="menu-view-switcher">
                <div className="mvs-pill">
                  <button className={`mvs-btn ${(view as string) === "grid" ? "active" : ""}`} onClick={() => setView("grid")}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                    Grid
                  </button>
                  <button className={`mvs-btn ${(view as string) === "book" ? "active" : ""}`} onClick={() => setView("book")}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                    Menu Book
                  </button>
                </div>
              </div>
            )}

            {/* Desktop book mode */}
            {!isMobile && view === "book" && !loading && !error && data && (
              <BookMenu data={data} qtyByProduct={qtyByProduct} targetCatId={bookCat} isMobile={false} readOnly={!ONLINE_ORDERING_ENABLED} />
            )}
          </>
        )}


        {view === "grid" && loading && (
          <section className="cat-section" aria-busy="true" aria-label="Loading menu">
            <div className="product-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="product product-skel" aria-hidden>
                  <div className="img"><div className="skel-shimmer" /></div>
                  <div className="body">
                    <div className="skel-line skel-line-lg" />
                    <div className="skel-line skel-line-md" />
                    <div className="skel-line skel-line-sm" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {error && <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--err)" }}>Couldn&apos;t load menu: {error}</div>}

        {view === "grid" && !loading && !error && groups.length === 0 && (
          <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--text-2)" }}>
            No items match &quot;{q}&quot;
          </div>
        )}

        {view === "grid" && groups.map((g) => (
          <section className="cat-section" key={g.cat.id}>
            <h2 className="h-display h3">
              {g.cat.name}<span className="ct">{g.items.length} items</span>
            </h2>
            <div className="product-grid">
              {g.items.map((it) => (
                <ProductCard key={it.id} item={it} qty={qtyByProduct.get(it.id) ?? 0} />
              ))}
            </div>
          </section>
        ))}
      </div>
      {ONLINE_ORDERING_ENABLED && <FloatingCart />}
    </>
  );
}

// ── Category scroll bar with fade + chevron hints ───────────────────────────
function CatBar({ cats, activeCat, onSelect }: {
  cats: { id: string; name: string }[];
  activeCat: string;
  onSelect: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft]   = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateFades = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateFades();
    el.addEventListener("scroll", updateFades, { passive: true });
    window.addEventListener("resize", updateFades);
    return () => {
      el.removeEventListener("scroll", updateFades);
      window.removeEventListener("resize", updateFades);
    };
  }, [updateFades, cats]);

  const scroll = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: dir * 120, behavior: "smooth" });
  };

  return (
    <div className="cats-wrap">
      {canLeft && (
        <>
          <div className="cats-fade cats-fade--left" />
          <button className="cats-chevron cats-chevron--left" onClick={() => scroll(-1)} aria-label="Scroll left">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
        </>
      )}
      <div className="cats" ref={scrollRef}>
        <button className={`chip ${activeCat === "all" ? "active" : ""}`} onClick={() => onSelect("all")}>All</button>
        {cats.map((c) => (
          <button key={c.id} className={`chip ${activeCat === c.id ? "active" : ""}`} onClick={() => onSelect(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
      {canRight && (
        <>
          <div className="cats-fade cats-fade--right" />
          <button className="cats-chevron cats-chevron--right" onClick={() => scroll(1)} aria-label="Scroll right">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </>
      )}
    </div>
  );
}

function ProductCard({ item, qty }: { item: MenuProduct; qty: number }) {
  const art = ART_BY_CAT[item.category?.name || ""] || "art-meal";
  return (
    <article className={`product ${qty > 0 ? "is-in-cart" : ""}`}>
      <div className="img">
        {item.image_url
          ? <img src={item.image_url} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <div className={art} />}
      </div>
      <div className="body">
        <div className="ttl-row">
          <span className="ttl">{item.name}</span>
          <span className="price">{peso(item.price)}</span>
        </div>
        <p className="desc">
          {item.featured_blurb || (item.kitchen_required ? "Kitchen-prepared · made to order." : "Bar-prepared · ready in minutes.")}
        </p>
        {/* Online ordering off → prices and descriptions only, no cart controls. */}
        <div className="actions">
          {!ONLINE_ORDERING_ENABLED ? null : qty === 0 ? (
            <button className="add" onClick={() => { cart.add(item.id, item.name, item.price); toast(`Added ${item.name}`); }} aria-label={`Add ${item.name} to cart`}>+ Add to cart</button>
          ) : (
            <div className="qty qty-card" role="group" aria-label={`${item.name} quantity`}>
              <button onClick={() => { cart.dec(item.id); qty === 1 ? toast(`Removed ${item.name}`, "remove") : toast(`${item.name} updated`, "info"); }} aria-label="Decrease quantity">−</button>
              <span aria-live="polite">{qty}</span>
              <button onClick={() => { cart.add(item.id, item.name, item.price); toast(`${item.name} +1`); }} aria-label="Increase quantity">+</button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

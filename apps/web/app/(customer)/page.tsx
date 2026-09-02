import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { api, type MenuProduct } from "@/lib/api";
import { WORKSPACE_SLUG, peso, ONLINE_ORDERING_ENABLED, ONLINE_BOOKING_ENABLED } from "@/lib/config";
import { parseHomeContent, type HomeContent } from "@/lib/home-content";

// Shared inline styles for the homepage action cards (top-left icon + chip row).
const iconWrap: CSSProperties = {
  position: "absolute", top: 22, left: 22,
  width: 52, height: 52, borderRadius: 14,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(var(--tint-rgb), 0.12)", border: "1px solid rgba(var(--tint-rgb), 0.32)",
  zIndex: 2,
};
const iconWrapSm: CSSProperties = {
  position: "absolute", top: 18, left: 18,
  width: 42, height: 42, borderRadius: 12,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(var(--tint-rgb), 0.12)", border: "1px solid rgba(var(--tint-rgb), 0.32)",
  zIndex: 2,
};
const ART_BY_NAME: Record<string, string> = {
  coffee: "art-coffee", drink: "art-coffee", latte: "art-coffee", espresso: "art-coffee",
  dessert: "art-dessert", cake: "art-dessert", basque: "art-dessert",
  room: "art-room", loft: "art-room", suite: "art-room",
  bar: "art-bar", whiskey: "art-bar", cocktail: "art-bar",
};

function pickArt(p: MenuProduct & { featured_tag?: string | null }): string {
  const lc = `${p.name} ${p.featured_tag ?? ""} ${p.category?.name ?? ""}`.toLowerCase();
  for (const [key, art] of Object.entries(ART_BY_NAME)) {
    if (lc.includes(key)) return art;
  }
  return "art-chef";
}

export default async function HomePage() {
  let featured: Array<MenuProduct & { featured_tag?: string | null; featured_blurb?: string | null }> = [];
  let home: HomeContent = {};
  try {
    const m = await api.menu(WORKSPACE_SLUG);
    featured = (m as any).featured ?? [];
    home = parseHomeContent(m.workspace?.home_content);
  } catch { /* leave empty → fallback */ }

  const customTitle = home.hero?.title?.trim();
  const customLead = home.hero?.lead?.trim();
  const promos = home.promos ?? [];

  // While a flow is switched off its CTA still leads somewhere useful — the
  // menu stays fully browsable, and the stay CTA lands on the notice page that
  // explains how to reserve by phone/message.
  // `href` is cast at the call sites — typedRoutes can't narrow a route that
  // carries a query string, same as the admin-editable promo links below.
  const orderCta = ONLINE_ORDERING_ENABLED
    ? { href: "/menu", label: "Order Now" }
    : { href: "/menu", label: "View Menu" };
  const stayCta = ONLINE_BOOKING_ENABLED
    ? { href: "/booking-cart", label: "Book a Stay" }
    : { href: "/unavailable?f=booking", label: "Enquire About a Stay" };

  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────── */}
      {/* Pinned dark: fixed near-black background by design (moody hero photo
          treatment), independent of the site's light/dark toggle. */}
      <section className="hero" data-theme="dark">
        {/* Left content panel */}
        <div className="hero-left">
          <h1 className="hero-title">
            {customTitle
              ? customTitle.split("\n").map((line, i) => (
                  <span key={i}>{line}{i < customTitle.split("\n").length - 1 && <br />}</span>
                ))
              : (
                <>
                  COFFEE.<br />
                  CITY LIGHTS.<br />
                  <span className="amber">STAY AWHILE.</span>
                </>
              )}
          </h1>
          <p className="hero-lead">
            {customLead
              || "A 24/7 café, restaurant, and staycation lounge — built for late nights, slow mornings, and everything in between."}
          </p>
          <div className="hero-cta-row">
            <Link className="btn btn-primary btn-lg" href={orderCta.href as any}>{orderCta.label}</Link>
            {/* Book a Table — hidden until table-reservation flow is ready. To restore, uncomment. */}
            {/* <Link className="btn btn-ghost btn-lg" href="/booking">Book a Table</Link> */}
            <Link className="btn btn-ghost btn-lg" href={stayCta.href as any}>{stayCta.label}</Link>
          </div>
          <div className="hero-stats">
            <div className="stat-card">
              <span className="stat-num">24/7 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
              <span className="stat-label">Coffee, Food &amp; Stays</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">3 Floors <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg></span>
              <span className="stat-label">Cafe · Bar · Staycation</span>
            </div>
            <div className="stat-card">
              <span className="stat-num">Night Views <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></span>
              <span className="stat-label">Overlooking Angono</span>
            </div>
          </div>
        </div>

        {/* Right photo panel */}
        <div className="hero-right">
          <Image
            src="/storefront.png"
            alt="Mug the Mug — 24/7 cafe and staycation lounge"
            fill
            priority
            sizes="45vw"
            style={{ objectFit: "cover", objectPosition: "center top" }}
          />
        </div>
      </section>

      {/* ── ACTIONS — primary user paths (Order / Stay / Track) ─ */}
      <section className="section section-tight">
        <div className="container">
          <div className="feat-head">
            <div>
              <div className="eyebrow">Get Started</div>
              <h2 className="h-display h2">Start with what you need.</h2>
              <p style={{ color: "var(--text-3)", fontSize: 14, margin: "8px 0 0", maxWidth: 560 }}>
                {ONLINE_ORDERING_ENABLED && ONLINE_BOOKING_ENABLED
                  ? "Order food, book a staycation, or check your status anytime — we're open 24/7."
                  : "Browse the menu, ask us about a staycation, or check your status anytime — we're open 24/7."}
              </p>
            </div>
          </div>
          <div className="actions-grid">
            {/* ── Big left card: Order Food & Coffee ──────────── */}
            {/* feat-card pinned dark: photo + .glaze scrim is always-dark by design */}
            <Link className="feat-card span-rows" href="/menu" data-theme="dark">
              <div className="ph art-coffee" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="cover" src="/orderfodd%26coffee.png" alt="Order food and coffee" />
              <div className="glaze" />
              <div style={iconWrap}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--amber-bright)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                  <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                  <line x1="6" y1="1" x2="6" y2="4" />
                  <line x1="10" y1="1" x2="10" y2="4" />
                  <line x1="14" y1="1" x2="14" y2="4" />
                </svg>
              </div>
              <div className="body">
                <span className="tag-mono" style={{ color: "var(--amber)" }}>Most Popular</span>
                <span className="ttl">{ONLINE_ORDERING_ENABLED ? "Order Food & Coffee" : "Food & Coffee Menu"}</span>
                <span className="sub">Explore our 24/7 menu — coffee, meals, snacks, and comfort food made for any time of day.</span>
                <span style={{
                  fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: "0.08em",
                  color: "var(--text-3)", marginTop: 6,
                }}>
                  Coffee · Rice Meals · Snacks · Pizza
                </span>
                <span className="tag-mono" style={{ color: "var(--amber)", marginTop: 8 }}>View Menu →</span>
              </div>
            </Link>

            {/* ── Top right: Book a Staycation ─────────────────── */}
            <Link className="feat-card" href={stayCta.href as any} data-theme="dark">
              <div className="ph art-room" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="cover" src="/bookstaycation.png" alt="Book a staycation" />
              <div className="glaze" />
              <div style={iconWrapSm}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--amber-bright)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 4v16" />
                  <path d="M2 8h18a2 2 0 0 1 2 2v10" />
                  <path d="M2 17h20" />
                  <path d="M6 8v9" />
                </svg>
              </div>
              <div className="body">
                <span className="ttl">{ONLINE_BOOKING_ENABLED ? "Book a Staycation" : "Staycation Lofts"}</span>
                <span className="sub">
                  {ONLINE_BOOKING_ENABLED
                    ? "See room photos, rates, inclusions, and available dates before you reserve."
                    : "Loft stays overlooking Angono. Message or call us with your dates and we'll set it up."}
                </span>
                <span className="tag-mono" style={{ color: "var(--amber)", marginTop: 8 }}>
                  {ONLINE_BOOKING_ENABLED ? "Check Availability →" : "How to Book →"}
                </span>
              </div>
            </Link>

            {/* ── Bottom right: Track Order or Booking ─────────── */}
            <Link className="feat-card" href="/booking-checker" data-theme="dark">
              <div className="ph art-chef" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="cover" src="/trackorder%26booking.png" alt="Track order or booking" />
              <div className="glaze" />
              <div style={iconWrapSm}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--amber-bright)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </div>
              <div className="body">
                <span className="ttl">Track Order or Booking</span>
                <span className="sub">Use your reference number to check your order or booking status.</span>
                <span className="tag-mono" style={{ color: "var(--amber)", marginTop: 8 }}>Track Now →</span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ── PROMOS / EVENTS (admin-editable) ─────────────────── */}
      {promos.length > 0 && (
        <section className="section section-tight">
          <div className="container">
            <div className="feat-head">
              <div>
                <div className="eyebrow">What&apos;s On</div>
                <h2 className="h-display h2">Promos &amp; events.</h2>
              </div>
            </div>
            <div className="feat-grid">
              {promos.map((p, i) => {
                const inner = (
                  <>
                    {p.image_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.image_url} alt={p.title} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div className="ph art-chef" />}
                    <div className="glaze" />
                    <div className="body">
                      <span className="ttl">{p.title}</span>
                      {p.blurb && <span className="sub">{p.blurb}</span>}
                      {p.cta_label && <span className="tag-mono" style={{ color: "var(--amber)", marginTop: 8 }}>{p.cta_label} →</span>}
                    </div>
                  </>
                );
                return p.cta_href
                  ? <Link key={i} className="feat-card" href={p.cta_href as any} data-theme="dark">{inner}</Link>
                  : <div key={i} className="feat-card" data-theme="dark">{inner}</div>;
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── FEATURED ─────────────────────────────────────────── */}
      <section className="section section-tight">
        <div className="container">
          <div className="feat-head">
            <div>
              <div className="eyebrow">House Favourites</div>
              <h2 className="h-display h2">Brewed, plated &amp; poured tonight.</h2>
            </div>
            <Link className="btn btn-ghost" href="/menu">See full menu →</Link>
          </div>
          <div className="feat-grid">
            {featured.length > 0
              ? featured.map((p, i) => (
                  <Link key={p.id} className={`feat-card${i === 0 ? " span-rows" : ""}`} href="/menu" data-theme="dark">
                    <div className={`ph ${pickArt(p)}`} />
                    <div className="glaze" />
                    <span className="price">{peso(p.price)}</span>
                    <div className="body">
                      <span className="tag-mono" style={{ color: "var(--amber)" }}>{p.featured_tag ?? p.category?.name ?? "Featured"}</span>
                      <span className="ttl">{p.name}</span>
                      {p.featured_blurb && <span className="sub">{p.featured_blurb}</span>}
                    </div>
                  </Link>
                ))
              : (
                <div style={{ gridColumn: "1 / -1", padding: "48px 24px", textAlign: "center", border: "1px dashed rgba(var(--tint-rgb), 0.2)", borderRadius: 16 }}>
                  <div style={{ fontFamily: "var(--f-display)", fontSize: 22, color: "var(--text-2)", marginBottom: 8 }}>Menu coming soon</div>
                  <p style={{ color: "var(--text-3)", fontSize: 14, margin: "0 0 20px" }}>Check back soon for our house favourites.</p>
                  <Link href="/menu" className="btn btn-ghost">Browse full menu →</Link>
                </div>
              )}
          </div>
        </div>
      </section>

      {/* ── CLOSING CTA ──────────────────────────────────────── */}
      <section className="section section-tight">
        <div className="container" style={{ textAlign: "center" }}>
          <div className="eyebrow" style={{ justifySelf: "center" }}>We&apos;re Open 24/7</div>
          <h2 className="h-display h2">Ready for your next Mugthemug moment?</h2>
          <p className="lead" style={{ margin: "12px auto 0" }}>
            {ONLINE_ORDERING_ENABLED && ONLINE_BOOKING_ENABLED
              ? "Order your favorites, book your staycation, or track your booking anytime."
              : "Browse the menu, message us about a staycation, or track your booking anytime."}
          </p>
          <div className="hero-cta-row" style={{ justifyContent: "center", marginTop: 28 }}>
            <Link className="btn btn-primary btn-lg" href={orderCta.href as any}>{orderCta.label}</Link>
            <Link className="btn btn-ghost btn-lg" href={stayCta.href as any}>{stayCta.label}</Link>
          </div>
        </div>
      </section>
    </>
  );
}

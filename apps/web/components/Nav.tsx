"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { ONLINE_ORDERING_ENABLED, ONLINE_BOOKING_ENABLED } from "@/lib/config";

export function Nav() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Home" },
    { href: "/menu", label: "Menu" },
    // Reserve (table booking) — hidden until table-reservation flow is ready. To restore, uncomment.
    // { href: "/booking", label: "Reserve" },
    // With booking off, the tab still points at the stay info — /unavailable
    // explains it and offers call/message, rather than dead-ending.
    ONLINE_BOOKING_ENABLED
      ? { href: "/booking-cart", label: "Bookings" }
      : { href: "/unavailable?f=booking", label: "Stay" },
    { href: "/booking-checker", label: "Track" },
  ];

  // Hide order CTA when user is already in the ordering/checkout flow, or on
  // the menu itself — and always while online ordering is switched off.
  const onMenuPage  = pathname === "/menu";
  const inOrderFlow = pathname === "/food-cart" || pathname?.startsWith("/checkout");
  const hideOrderNow = inOrderFlow || onMenuPage || !ONLINE_ORDERING_ENABLED;

  return (
    // Pinned to dark regardless of site theme — this is the signage strip
    // (logo1.png is cream-on-transparent, styled for a dark board like the
    // real building's sign), not page content that should flip with theme.
    <nav className="nav" data-theme="dark">
      <div className="nav-inner">
        <Link href="/" className="logo-img">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo1.png" alt="Mugthemug" fetchPriority="high" style={{ height: 44, width: "auto", display: "block" }} />
        </Link>
        <div className="nav-links">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href as any}
              className={`nav-link ${pathname === l.href.split("?")[0] ? "active" : ""}`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="nav-cta">
          {/* Always-visible on desktop; also shown on mobile when on the menu page */}
          <span className={`badge-247 ${onMenuPage ? "badge-247--menu" : ""}`}>Open 24/7</span>
          <ThemeToggle />
          {!hideOrderNow && (
            <Link href="/menu" className="btn btn-primary">Order Now</Link>
          )}
        </div>
      </div>
    </nav>
  );
}

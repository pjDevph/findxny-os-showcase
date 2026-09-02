// Shown in place of the online ordering / booking flows while no customer
// payment gateway is wired (see ONLINE_ORDERING_ENABLED / ONLINE_BOOKING_ENABLED
// in lib/env.ts). Renders inside the normal customer layout — nav and footer
// stay, so the menu and booking tracking remain one click away.
import Link from "next/link";
import { formatPhoneDisplay } from "./Footer";

const FACEBOOK_URL = "https://www.facebook.com/share/1H2zFvWsXL/?mibextid=wwXIfr";

const COPY = {
  order: {
    eyebrow: "Online ordering is paused",
    title: "Order by phone or in person.",
    body: "We're not taking online orders right now. Browse the full menu here, then call us to order for pickup or delivery — or just drop by, we're open 24/7.",
    primary: { href: "/menu", label: "Browse the menu →" },
  },
  booking: {
    eyebrow: "Online booking is paused",
    title: "Reserve your stay by message.",
    body: "We're not taking online reservations right now. Message or call us with your dates and number of guests and we'll confirm your loft — rates, photos, and inclusions are the same as always.",
    primary: { href: "/booking-checker", label: "Track an existing booking →" },
  },
} as const;

export function CommerceDisabled({
  kind,
  phone,
}: {
  kind: "order" | "booking";
  phone?: string | null;
}) {
  const c = COPY[kind];
  const tel = phone?.replace(/\s+/g, "");

  return (
    <section className="container" style={{ paddingBlock: "72px 96px" }}>
      <div
        style={{
          maxWidth: 620,
          margin: "0 auto",
          padding: "40px 32px",
          border: "1px solid rgba(var(--tint-rgb), 0.18)",
          background: "rgba(var(--tint-rgb), 0.05)",
          borderRadius: 20,
          textAlign: "center",
        }}
      >
        <div className="eyebrow" style={{ justifySelf: "center", marginBottom: 12 }}>
          {c.eyebrow}
        </div>
        <h1 className="h-display h2" style={{ margin: "0 0 14px" }}>{c.title}</h1>
        <p style={{ color: "var(--text-2)", fontSize: 15, lineHeight: 1.7, margin: "0 auto", maxWidth: 460 }}>
          {c.body}
        </p>

        <div
          className="hero-cta-row"
          style={{ justifyContent: "center", flexWrap: "wrap", marginTop: 28 }}
        >
          {tel && (
            <a className="btn btn-primary btn-lg" href={`tel:${tel}`}>
              Call {formatPhoneDisplay(phone!)}
            </a>
          )}
          <a className="btn btn-ghost btn-lg" href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer">
            Message us on Facebook
          </a>
        </div>

        <div style={{ marginTop: 28, fontSize: 13, color: "var(--text-3)" }}>
          <Link href={c.primary.href as any} style={{ color: "var(--amber)", textDecoration: "underline" }}>
            {c.primary.label}
          </Link>
        </div>
      </div>
    </section>
  );
}

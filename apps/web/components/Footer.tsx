import Link from "next/link";
import { ONLINE_BOOKING_ENABLED } from "@/lib/config";

const FACEBOOK_URL = "https://www.facebook.com/share/1H2zFvWsXL/?mibextid=wwXIfr";
const INSTAGRAM_URL = "https://www.instagram.com/mugthemug_cafe?igsh=YW0zdnI2YmJjOHd6";

function IconFacebook() {
  return (
    <svg width="15" height="15" viewBox="0 0 320 512" fill="currentColor" aria-hidden="true">
      <path d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z" />
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg width="15" height="15" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true">
      <path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z" />
    </svg>
  );
}

export type FooterWorkspace = {
  name: string;
  phone: string | null;
};

// "09171234567" -> "0917 123 4567" (PH mobile grouping); anything that
// doesn't match an 11-digit local number is shown as-is rather than guessed at.
export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return phone;
}

export function Footer({ workspace }: { workspace: FooterWorkspace | null }) {
  const year = new Date().getFullYear();
  const name = workspace?.name ?? "";
  const phone = workspace?.phone ?? null;

  return (
    <footer className="footer">
      <div className="footer-grid">
        <div>
          <Link href="/" className="logo-img" style={{ marginBottom: 12, display: "inline-block" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo1.png" alt={name || "Logo"} style={{ height: 60, width: "auto", display: "block", opacity: 0.9 }} />
          </Link>
          {name && (
            <p style={{ color: "var(--text-0)", fontSize: 16, fontWeight: 600, margin: "4px 0 2px" }}>
              {name}
            </p>
          )}
          <p style={{ color: "var(--text-2)", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px" }}>
            Restaurant &bull; Coffee &bull; Staycation
          </p>
          <p style={{ color: "var(--text-2)", fontSize: 14, maxWidth: 300, lineHeight: 1.6 }}>
            Good food, coffee, city lights, and cozy stays in Angono.
          </p>
        </div>
        <div>
          <h4>Visit</h4>
          <ul>
            <li><Link href="/menu">Menu</Link></li>
            {/* Reserve a table — hidden until table-reservation flow is ready. To restore, uncomment. */}
            {/* <li><Link href="/booking">Reserve a table</Link></li> */}
            <li>
              <Link href={(ONLINE_BOOKING_ENABLED ? "/booking-cart" : "/unavailable?f=booking") as any}>
                Staycation
              </Link>
            </li>
            <li><Link href="/booking-checker">Track Booking</Link></li>
          </ul>
        </div>
        <div>
          <h4>Contact</h4>
          <ul>
            {phone && <li><a href={`tel:${phone.replace(/\s+/g, "")}`}>{formatPhoneDisplay(phone)}</a></li>}
            <li style={{ color: "var(--text-2)" }}>Angono, Rizal</li>
            <li style={{ color: "var(--text-2)" }}>Open 24/7</li>
          </ul>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="social-btn">
              <IconFacebook />
            </a>
            <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="social-btn">
              <IconInstagram />
            </a>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {year}{name ? ` ${name}` : ""}</span>
        <span>Powered by FINDXNY</span>
      </div>
    </footer>
  );
}

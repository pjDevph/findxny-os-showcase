/** @type {import('next').NextConfig} */

// CSP — enforced. If a legit resource gets blocked, add its origin to the
// matching directive below (don't revert to Report-Only).
//
// Sources allowed:
//   • self                — own origin (HTML, JS, CSS, images)
//   • Supabase            — REST/Realtime over https + wss (Realtime websockets)
//   • Xendit              — hosted invoice redirect after checkout
//   • data:/blob:         — generated QR codes, image previews, file uploads
//   • inline styles       — Next.js inlines critical CSS
//   • unsafe-eval (script)— Next.js dev/runtime; revisit when removing typed routes
const SUPABASE_HOST = "https://*.supabase.co";
const SUPABASE_WS   = "wss://*.supabase.co";
const XENDIT_HOST   = "https://*.xendit.co";

const GFONTS_CSS  = "https://fonts.googleapis.com";
const GFONTS_FILE = "https://fonts.gstatic.com";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
  `style-src 'self' 'unsafe-inline' ${GFONTS_CSS}`,
  `img-src 'self' data: blob: ${SUPABASE_HOST}`,
  `font-src 'self' data: ${GFONTS_FILE}`,
  `connect-src 'self' ${SUPABASE_HOST} ${SUPABASE_WS} ${XENDIT_HOST}`,
  `frame-src 'self' ${XENDIT_HOST}`,
  "frame-ancestors 'none'",   // clickjacking protection (enforced; complements X-Frame-Options)
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options",           value: "DENY" },
  { key: "X-Content-Type-Options",    value: "nosniff" },
  { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "X-DNS-Prefetch-Control",    value: "on" },
  { key: "Content-Security-Policy",   value: csp },
];

const nextConfig = {
  poweredByHeader: false,          // drop the "X-Powered-By: Next.js" tech-disclosure header
  experimental: { typedRoutes: true },
  transpilePackages: ["@aio/api-client"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
export default nextConfig;

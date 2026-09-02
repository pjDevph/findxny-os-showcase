// Central place to read + validate env vars. Import from here instead of
// `process.env.X!` directly so a missing var fails loudly at startup with a
// clear message, instead of surfacing as an opaque error deep in a client SDK.
//
// NEXT_PUBLIC_* vars must be accessed as a literal `process.env.NEXT_PUBLIC_X`
// — Next.js inlines them into the browser bundle via static text replacement
// at build time, so `process.env[name]` with a dynamic name always reads as
// undefined client-side even when the var is set.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Copy apps/web/.env.example to apps/web/.env and fill it in.`,
    );
  }
  return value;
}

export const SUPABASE_URL = required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const WORKSPACE_SLUG = process.env.NEXT_PUBLIC_WORKSPACE_SLUG || "demo-cafe";

// "development" | "staging" | "production" — set explicitly per environment
// (Render dashboard for staging/production, apps/web/.env for local). Falls
// back to NODE_ENV so unset local dev still reads as "development".
export const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || "development";

// Customer-facing transactional flows. Both are OFF until a customer payment
// gateway is live — the site can take an order or a booking but has no way to
// collect money for it, so the flows are hidden and their routes redirect to
// /unavailable. Set the env var to "on" per environment to restore. Kept as
// two flags because ordering and booking will most likely come back at
// different times (whichever gateway lands first).
export const ONLINE_ORDERING_ENABLED = process.env.NEXT_PUBLIC_ONLINE_ORDERING === "on";
export const ONLINE_BOOKING_ENABLED = process.env.NEXT_PUBLIC_ONLINE_BOOKING === "on";

// Non-production deploys share a device/browser with real customers and
// staff often enough that they need a visible "this isn't the real thing"
// marker — see components/EnvBanner.tsx.
export const ENV_BANNER_LABEL =
  APP_ENV === "staging" ? "PREVIEW MODE" :
  APP_ENV === "production" ? null :
  "DEMO MODE";

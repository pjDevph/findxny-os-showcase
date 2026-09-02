/**
 * Runtime-visible build variant. Mirrors app.config.ts's APP_VARIANT, but
 * that one is build-config-only (read by Expo's config resolver, never
 * bundled into JS) — this EXPO_PUBLIC_ counterpart is what code running on
 * the device can actually read. Set alongside APP_VARIANT in package.json
 * scripts and eas.json build profiles; unset (undefined) in production.
 */
export type AppVariant = "development" | "preview";

export const APP_VARIANT = process.env.EXPO_PUBLIC_APP_VARIANT as AppVariant | undefined;

/** True for demo/preview builds — anything that isn't the production install. */
export const IS_DEMO_BUILD = APP_VARIANT !== undefined;

export const ENV_BANNER_LABEL =
  APP_VARIANT === "development" ? "DEMO MODE" :
  APP_VARIANT === "preview" ? "PREVIEW MODE" :
  null;

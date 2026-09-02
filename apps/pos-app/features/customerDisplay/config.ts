/**
 * Customer Display — configuration store
 *
 * Holds the operator-tunable look & content of the customer-facing screen.
 * Persisted to AsyncStorage (no secrets). Slide/QR/promo IMAGES are NOT stored
 * here — they live in ./images (one AsyncStorage key each) to stay clear of the
 * per-item size limit. This config only holds slide metadata + image keys.
 *
 * Reactive: Settings edits flow live into the in-app preview and the second
 * screen via the same module-store pattern as ./store.
 */
import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MediaKind } from "./media";

export type IdleMode = "logo" | "image" | "slideshow" | "qr";
export type LogoMode = "letter" | "image";
export type LogoSize = "s" | "m" | "l";
/** How a slide's image fills its frame — crop-to-fill, or show the whole image letterboxed. */
export type SlideFit = "cover" | "contain";
/** "single" — one image filling the slide. "split" — two images side by side (1 row x 2 columns). */
export type SlideLayout = "single" | "split";

/**
 * One idle slideshow slide. The primary media is stored in ./images under
 * `slide.id`; a "split" layout's second image lives under `secondSlideImageKey(slide.id)`.
 */
export interface Slide {
  id: string;
  title: string;
  subtitle: string;
  duration: number;   // seconds on screen
  enabled: boolean;
  kind: MediaKind;    // "image" | "video"
  /** Defaults to "cover" (crop-to-fill) when unset — matches pre-existing slides. */
  fit?: SlideFit;
  /** Defaults to "single" when unset — matches pre-existing slides. */
  layout?: SlideLayout;
}

/** Image-store key for a "split" layout slide's second (right-column) image. */
export function secondSlideImageKey(slideId: string): string {
  return `${slideId}__2`;
}

export interface CustomerDisplayConfig {
  /** Master switch — drive the physical second screen when one is present. */
  enabled: boolean;
  businessName: string;
  tagline: string;
  /** Accent color (hex). Falls back to the app amber when empty. */
  accent: string;
  /** Brand mark: a letter tile (from business name) or an uploaded logo image. */
  logoMode: LogoMode;
  /** Idle-screen logo size. */
  logoSize: LogoSize;
  idleMode: IdleMode;
  /** Whether the single promo (idleMode === "image") is an image or a video. */
  idleMediaKind: MediaKind;
  /** Slideshow content (idleMode === "slideshow"). Media lives in ./images. */
  slides: Slide[];
  showSlideIndicators: boolean;
  /** Headline/caption for the QR-ordering idle screen (idleMode === "qr"). */
  qrCaption: string;
  showItems: boolean;
  showTotals: boolean;
  showTaxBreakdown: boolean;
  showPaymentQr: boolean;
  thankYouMessage: string;
}

/** Image-store keys used by the idle screens (see ./images). */
export const IDLE_IMAGE_KEY = "idle"; // single promo banner (idleMode === "image")
export const QR_IMAGE_KEY = "qr";     // QR-ordering screen image (idleMode === "qr")
export const LOGO_IMAGE_KEY = "logo"; // uploaded brand logo (logoMode === "image")

export const MAX_SLIDES = 6;

export const DEFAULT_CONFIG: CustomerDisplayConfig = {
  enabled: false,
  businessName: "FINDXNY",
  tagline: "Welcome",
  accent: "",
  logoMode: "letter",
  logoSize: "m",
  idleMode: "logo",
  idleMediaKind: "image",
  slides: [],
  showSlideIndicators: true,
  qrCaption: "Scan to order",
  showItems: true,
  showTotals: true,
  showTaxBreakdown: true,
  showPaymentQr: true,
  thankYouMessage: "Thank you! Please come again.",
};

const STORAGE_KEY = "cd_config_v1";

let current: CustomerDisplayConfig = DEFAULT_CONFIG;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getCustomerDisplayConfig(): CustomerDisplayConfig {
  return current;
}

/** Load persisted config once (idempotent). Safe to call from multiple screens. */
export async function hydrateCustomerDisplayConfig(): Promise<CustomerDisplayConfig> {
  if (hydrated) return current;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      current = {
        ...DEFAULT_CONFIG,
        ...parsed,
        slides: Array.isArray(parsed.slides) ? parsed.slides : [],
      };
      emit();
    }
  } catch {
    /* keep defaults */
  }
  return current;
}

/** Merge a partial update, persist, and notify subscribers. */
export async function updateCustomerDisplayConfig(patch: Partial<CustomerDisplayConfig>) {
  current = { ...current, ...patch };
  emit();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* best effort */
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useCustomerDisplayConfig(): CustomerDisplayConfig {
  return useSyncExternalStore(subscribe, getCustomerDisplayConfig, getCustomerDisplayConfig);
}

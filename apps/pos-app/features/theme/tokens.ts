/**
 * FINDXNY OS — Design Tokens (React Native)
 * Neutrals stay a strict monochrome ladder (Pure Black #000000, Charcoal
 * Black #111111, Graphite Gray #2B2B2B, Medium Gray #8A8A8A, Light Gray
 * #E5E5E5, White #FFFFFF); bg/surface/line/ink slots below map directly
 * onto those anchors. The accent ("Amber Roast") is the one deliberately
 * hued token set — see features/theme/themes.ts.
 */

export type Mode = "light" | "dark";

// Status colors stay real hues (green/amber/red/blue) — they carry meaning
// (paid/preparing/failed/info) that staff scan for at a glance. Accent is
// constant across light/dark — staff pick an accent shade separately
// (features/theme/themes.ts); surface mode only changes bg/surface/ink.
const SHARED = {
  // Accent — matches THEMES[DEFAULT_THEME_ID] ("smoke") for legacy `C` import sites
  rust:  '#8b5e34',      // Roast brown
  amber: '#e8a33d',      // Amber

  // Status
  good: '#48a86e',
  warn: '#d0a828',
  bad:  '#c03838',
  info: '#4890b0',

  // Transparent accents
  rustBg:  'rgba(139,94,52,0.14)',
  amberBg: 'rgba(232,163,61,0.14)',
  goodBg:  'rgba(72,168,110,0.14)',
  badBg:   'rgba(192,56,56,0.14)',
  infoBg:  'rgba(72,144,176,0.14)',
};

const DARK_BASE = {
  // Backgrounds
  bg:       '#000000',   // Pure Black — darkest
  bg2:      '#111111',   // Charcoal Black — card bg
  surface:  '#1a1a1a',   // interpolated — surface
  surface2: '#2b2b2b',   // Graphite Gray — raised

  // Ink / text
  ink:  '#ffffff',       // White
  ink2: '#e5e5e5',       // Light Gray
  ink3: '#8a8a8a',       // Medium Gray
  ink4: '#5c5c5c',       // interpolated

  // Lines
  line:     '#333333',   // interpolated
  lineSoft: 'rgba(51,51,51,0.6)',
};

const LIGHT_BASE = {
  // Backgrounds
  bg:       '#ffffff',   // White
  bg2:      '#eeeeee',   // interpolated — card bg
  surface:  '#e5e5e5',   // Light Gray
  surface2: '#d4d4d4',   // interpolated — raised

  // Ink / text
  ink:  '#000000',       // Pure Black
  ink2: '#1a1a1a',       // interpolated (near Charcoal Black)
  ink3: '#757575',       // interpolated
  ink4: '#8f8f8f',       // interpolated — bumped from #a3a3a3, which read as ~invisible (contrast ~1.7:1) against surface/bg2

  // Lines
  line:     '#cccccc',   // interpolated
  lineSoft: 'rgba(204,204,204,0.6)',
};

export const BASE_BY_MODE: Record<Mode, typeof DARK_BASE> = { dark: DARK_BASE, light: LIGHT_BASE };

export function makeBaseTokens(mode: Mode) {
  return { ...BASE_BY_MODE[mode], ...SHARED };
}

// Default export — dark, matching the app's historical always-dark look —
// kept for any legacy import sites that use `C` directly instead of useTheme().
export const C = makeBaseTokens("dark");

export const R = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
  // Buttons/CTAs deliberately break from the rounded scale above — matches
  // apps/web's .btn/.btn-lg classes (globals.css), which hardcode a near-square
  // 3px radius for actions while cards/modals/chips keep the normal R.md/lg/xl
  // rounding. Circular elements (avatars, dots, toggle tracks) keep R.full.
  cta: 3,
};

export const F = {
  mono: 'Courier' as const,
  body: undefined,
};

export const BASE_FS = { xs: 10, sm: 11, md: 13, lg: 15, xl: 18, xxl: 22 } as const;

export function makeFontSizes(scale: number) {
  const r = (n: number) => Math.round(n * scale);
  return { xs: r(10), sm: r(11), md: r(13), lg: r(15), xl: r(18), xxl: r(22) };
}
export type FontSizes = ReturnType<typeof makeFontSizes>;

export const RAIL_W = 72;

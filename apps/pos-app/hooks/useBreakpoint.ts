import { useWindowDimensions } from "react-native";

/**
 * Single source of truth for layout breakpoints across the POS app.
 * Mirrors the web app's mobile-first scale where it makes sense.
 *
 *   phone:    < 600  (compact phones in portrait)
 *   tablet:   >= 600 (most tablets, large phones in landscape)
 *   desktop:  >= 1024 (web build, large iPads in landscape)
 *
 * Rules of thumb:
 *   - Sidebar rail: tablet+ only
 *   - Multi-column grids: tablet+
 *   - Bottom sheets / drawers: phone only
 */
export type Breakpoint = "phone" | "tablet" | "desktop";

export interface BreakpointInfo {
  width:       number;
  height:      number;
  isPhone:     boolean;   // < 600
  isTablet:    boolean;   // >= 600
  isDesktop:   boolean;   // >= 1024
  isLandscape: boolean;
  bp:          Breakpoint;
}

export const BP_PHONE  = 600;
export const BP_DESKTOP = 1024;

export function useBreakpoint(): BreakpointInfo {
  const { width, height } = useWindowDimensions();
  const isPhone   = width < BP_PHONE;
  const isDesktop = width >= BP_DESKTOP;
  const isTablet  = !isPhone;
  const bp: Breakpoint = isDesktop ? "desktop" : isTablet ? "tablet" : "phone";
  return {
    width,
    height,
    isPhone,
    isTablet,
    isDesktop,
    isLandscape: width > height,
    bp,
  };
}

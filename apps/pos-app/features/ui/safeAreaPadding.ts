import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Extra breathing room below the last scrollable item, on top of the
 * device's own safe-area inset, so content never sits flush against
 * Android's gesture/nav bar.
 */
export const NAV_BAR_CLEARANCE = 24;

/** contentContainerStyle paddingBottom for a scroll view/list: `base` (the
 *  screen's own bottom padding) + the device's safe-area inset + a fixed
 *  clearance so scrolled-to-bottom content clears Android's nav bar. */
export function useBottomScrollPadding(base = 0) {
  const insets = useSafeAreaInsets();
  return base + insets.bottom + NAV_BAR_CLEARANCE;
}

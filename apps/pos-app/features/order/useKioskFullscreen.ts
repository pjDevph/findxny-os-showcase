import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as NavigationBar from "expo-navigation-bar";
import { setStatusBarHidden } from "expo-status-bar";

/**
 * Fullscreen (kiosk) mode — hides the status bar and, on Android, the
 * on-screen navigation bar. Always restored on unmount so leaving this
 * screen never leaves the rest of the app stuck fullscreen.
 * Edge-to-edge is enforced on Android here, so the (deprecated under
 * edge-to-edge) core RN StatusBar imperative API and NavigationBar's
 * setBehaviorAsync are skipped — setStatusBarHidden/setVisibilityAsync are
 * the still-supported edge-to-edge-safe calls.
 */
export function useKioskFullscreen(setSidebarHidden: (hidden: boolean) => void) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    return () => {
      setStatusBarHidden(false, "fade");
      setSidebarHidden(false);
      if (Platform.OS === "android") NavigationBar.setVisibilityAsync("visible").catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleFullscreen() {
    const next = !fullscreen;
    setFullscreen(next);
    setStatusBarHidden(next, "fade");
    setSidebarHidden(next);
    if (Platform.OS === "android") {
      NavigationBar.setVisibilityAsync(next ? "hidden" : "visible").catch(() => {});
    }
  }

  return { fullscreen, toggleFullscreen };
}

import { Redirect, Stack, useSegments } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRef, useMemo, useEffect, useState } from "react";
import { useAuth } from "../../features/auth/AuthContext";
import { useTheme } from "../../features/theme/ThemeContext";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { AdminSidebar, AdminSidebarHandle } from "../../features/admin/AdminSidebar";
import { SidebarContext } from "../../features/admin/SidebarContext";
import { canAccessPosRoute } from "../../features/auth/rolePermissions";
import { setReconnectCallback } from "../../features/offline/offlineQueue";
import { startPresence } from "../../features/offline/posPresence";

export default function PosLayout() {
  const { role, activeWorkspaceId, memberships, loading } = useAuth();
  const segments = useSegments() as readonly string[];
  const activeSegment = segments[1] as string | undefined;
  const { C } = useTheme();
  const sidebarRef = useRef<AdminSidebarHandle>(null);
  // Tablet+ (web, iPad, Android tablet) gets the inline sidebar; phones use the overlay.
  // Reactive to window resize/rotation, unlike a static Platform.isPad check.
  const { isPhone: IS_PHONE } = useBreakpoint();
  // Kiosk/fullscreen mode (e.g. the POS terminal screen) can reclaim the
  // rail entirely — reset whenever the screen size mode flips so leaving a
  // tablet-only fullscreen and rotating into phone mode doesn't strand it hidden.
  const [sidebarHidden, setSidebarHidden] = useState(false);
  useEffect(() => { setSidebarHidden(false); }, [IS_PHONE]);
  useEffect(() => {
    // Auto-flush the moment the device reconnects — no confirmation needed.
    // A "Later" cancel previously left orders stuck until the next reconnect
    // event; the periodic retry in startSyncService is a safety net but
    // immediate flush is better UX. The offline banner count drops to 0 when done.
    setReconnectCallback((_count, doFlush) => { void doFlush(); });
    return () => { setReconnectCallback(null); };
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    return startPresence(activeWorkspaceId);
  }, [activeWorkspaceId]);

  // All roles share one sidebar — permissions filter what items are visible.
  const ctxValue = useMemo(() => ({
    openSidebar: () => sidebarRef.current?.open(),
    isPhoneMode: IS_PHONE,
    sidebarHidden,
    setSidebarHidden,
  }), [IS_PHONE, sidebarHidden]);

  // Don't evaluate permissions until memberships have loaded — role is null
  // during the brief window between session restore and the membership fetch.
  if (!loading && memberships.length > 0 && !canAccessPosRoute(role, activeSegment)) {
    const fallback = role === "kitchen" ? "/pos/kitchen" : "/pos/order";
    return <Redirect href={fallback as any} />;
  }

  // Phone: sidebar slides in as overlay for every role
  if (IS_PHONE) {
    return (
      <SidebarContext.Provider value={ctxValue}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={[]}>
          <Stack screenOptions={{
            headerShown: false,
            animation: "fade",
            contentStyle: { backgroundColor: C.bg },
          }} />
          {!sidebarHidden && <AdminSidebar ref={sidebarRef} phoneMode />}
        </SafeAreaView>
      </SidebarContext.Provider>
    );
  }

  // Tablet: inline sidebar for every role
  return (
    <SidebarContext.Provider value={ctxValue}>
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: C.bg }}>
        {!sidebarHidden && <AdminSidebar />}
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{
            headerShown: false,
            animation: "fade",
            contentStyle: { backgroundColor: C.bg },
          }} />
        </View>
      </View>
    </SidebarContext.Provider>
  );
}

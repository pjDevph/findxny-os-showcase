import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../features/auth/AuthContext";
import { ThemeProvider, useTheme } from "../features/theme/ThemeContext";
import { AppAlertProvider } from "../features/ui/AppAlertProvider";
import { ToastProvider } from "../features/ui/ToastProvider";
import { registerCustomerDisplaySurface } from "../features/customerDisplay/CustomerDisplayRoot";
import { hydrateCustomerDisplayConfig } from "../features/customerDisplay/config";
import { hydrateImages } from "../features/customerDisplay/images";
import { hydratePrinterConfig } from "../features/receipt/printerConfig";
import { ReceiptImageCaptureHost } from "../features/receipt/ReceiptImageCaptureHost";
import { CustomerDisplayNative } from "../modules/customer-display";
import { startSyncService } from "../features/offline/offlineQueue";
import { IS_DEMO_BUILD, ENV_BANNER_LABEL } from "../features/env";

// Register the second-screen surface + warm the caches once at startup.
registerCustomerDisplaySurface();
hydrateCustomerDisplayConfig();
// Only auto-claim the physical customer-facing screen on production installs.
// Demo/preview builds are routinely installed on the SAME device as prod (same
// physical second screen) — auto-enabling here would steal the display away
// from whichever app the cashier is actually running. Passing false explicitly
// (not just skipping the call) matters: the native module defaults to enabled
// and will still auto-show on hotplug/reconnect otherwise.
try { CustomerDisplayNative?.setEnabled?.(!IS_DEMO_BUILD); } catch { /* no-op if module absent */ }
void hydrateImages();
void hydratePrinterConfig();
startSyncService();

function EnvBanner() {
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  if (!ENV_BANNER_LABEL) return null;
  return (
    <View style={{
      paddingTop: insets.top, paddingBottom: 4,
      backgroundColor: C.badBg, borderBottomWidth: 1, borderBottomColor: C.bad,
      alignItems: "center",
    }}>
      <Text style={{ color: C.bad, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>
        {ENV_BANNER_LABEL} — not the live POS
      </Text>
    </View>
  );
}

function AuthGate({ children }: Readonly<{ children: React.ReactNode }>) {
  const { loading, session } = useAuth();
  const { C } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const onLogin = segments[0] === "login";
    if (!session && !onLogin) router.replace("/login");
    if (session && onLogin) router.replace("/pos");
  }, [loading, session, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg }}>
        <ActivityIndicator color={C.amber} />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ToastProvider>
          <AppAlertProvider>
            <AuthProvider>
              <EnvBanner />
              <AuthGate>
                <Stack screenOptions={{ headerShown: false }} />
              </AuthGate>
              <ReceiptImageCaptureHost />
            </AuthProvider>
          </AppAlertProvider>
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../features/auth/AuthContext";
import { useTheme } from "../features/theme/ThemeContext";

// Decides the final destination directly (rather than bouncing through
// `/pos`, which itself immediately redirects again) — two `<Redirect>`s
// firing back-to-back on cold start raced expo-router's initial-URL
// resolution and logged a spurious "state update on unmounted component"
// warning. `/pos` still exists as a one-hop fallback for anything that
// navigates there directly (see app/pos/index.tsx).
export default function Index() {
  const { session, role, loading } = useAuth();
  const { C } = useTheme();

  if (!session) return <Redirect href="/login" />;

  if (loading || !role) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg }}>
        <ActivityIndicator color={C.amber} />
      </View>
    );
  }

  return <Redirect href={(role === "kitchen" ? "/pos/kitchen" : "/pos/dashboard") as any} />;
}

import { ActivityIndicator, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../features/auth/AuthContext";
import { useTheme } from "../../features/theme/ThemeContext";

/**
 * `/pos` is a pure redirect target, not a screen — every role lands on the
 * real home (`/pos/dashboard`, or `/pos/kitchen` for kitchen accounts), or
 * on `/pos/order` when opened with edit-order params (e.g. from a
 * notification deep link). There is no fallback UI to accidentally show.
 */
export default function PosIndexRedirect() {
  const { role, loading } = useAuth();
  const { C } = useTheme();
  const {
    edit_order_id, edit_items, edit_order_type, edit_table_no, edit_notes,
  } = useLocalSearchParams<{
    edit_order_id?: string; edit_items?: string; edit_order_type?: string;
    edit_table_no?: string; edit_notes?: string;
  }>();

  if (edit_order_id) {
    return (
      <Redirect
        href={{
          pathname: "/pos/order" as any,
          params: { edit_order_id, edit_items, edit_order_type, edit_table_no, edit_notes },
        }}
      />
    );
  }

  if (loading || !role) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg }}>
        <ActivityIndicator color={C.amber} />
      </View>
    );
  }

  return <Redirect href={(role === "kitchen" ? "/pos/kitchen" : "/pos/dashboard") as any} />;
}

import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { useSidebar } from "../admin/SidebarContext";
import { useTheme } from "../theme/ThemeContext";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });

interface Props {
  title: string;
  /** Label next to the back chevron. Default: "POS" */
  backLabel?: string;
  /** Whether to render the back button at all. Default: true */
  showBack?: boolean;
  /** Optional content rendered at the right end of the header */
  right?: React.ReactNode;
}

export function PosScreenHeader({ title, backLabel = "POS", showBack = true, right }: Props) {
  const { C } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { openSidebar, isPhoneMode } = useSidebar();
  const s = useMemo(() => makeStyles(C), [C]);

  return (
    <View style={[
      s.header,
      {
        paddingTop: insets.top > 0 ? insets.top : 12,
        paddingLeft: Math.max(insets.left, 16),
        paddingRight: Math.max(insets.right, 16),
      },
    ]}>
      {isPhoneMode && (
        <Pressable style={s.menuBtn} onPress={openSidebar} hitSlop={8}>
          <Feather name="menu" size={18} color={C.amber} />
        </Pressable>
      )}
      {showBack && (
        <Pressable style={s.back} onPress={() => router.back()} hitSlop={8}>
          <Feather name="chevron-left" size={20} color={C.amber} />
          <Text style={s.backLabel}>{backLabel}</Text>
        </Pressable>
      )}
      <Text style={s.title} numberOfLines={1}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingBottom: 12,
    backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  menuBtn:   { paddingVertical: 4, paddingRight: 4 },
  back:      { flexDirection: "row", alignItems: "center", gap: 2, paddingRight: 2 },
  backLabel: { color: C.amber, fontSize: 14, fontWeight: "600" },
  title:     { color: C.ink, fontSize: 17, fontWeight: "700", flexShrink: 1 },
});

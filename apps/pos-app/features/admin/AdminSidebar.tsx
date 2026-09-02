import {
  View, Text, Pressable, ScrollView, StyleSheet,
  Animated, LayoutAnimation, useWindowDimensions, Image, ActivityIndicator,
} from "react-native";
import { useRouter, useSegments } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useMemo, useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface AdminSidebarHandle { open: () => void; }
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { canAccessPosRoute } from "../auth/rolePermissions";
import { useToast } from "../ui/ToastProvider";
import { R } from "../theme/tokens";

// Temporary operational lockout (see docs/temp-offline-mode-changes.md) —
// re-enabled 2026-07-26. Flip back to true if this device goes back to a
// single shared account for an extended no-internet stretch.
const SIGN_OUT_DISABLED = false;

type FName = React.ComponentProps<typeof Feather>["name"];

const NAV: { section: string; items: { label: string; icon: FName; segment: string }[] }[] = [
  {
    section: "OVERVIEW",
    items: [
      { label: "Dashboard", icon: "grid", segment: "dashboard" },
    ],
  },
  {
    section: "OPERATIONS",
    items: [
      { label: "Orders",           icon: "shopping-bag", segment: "order"        },
      { label: "Counter",          icon: "monitor",      segment: "counter"      },
      { label: "Prep Display",     icon: "cpu",          segment: "kitchen"      },
      { label: "Room Bookings",    icon: "home",         segment: "book-room"    },
      { label: "Amenity Bookings", icon: "anchor",       segment: "book-amenity" },
    ],
  },
  {
    section: "SALES & CASH",
    items: [
      { label: "Order History",        icon: "file-text",   segment: "transactions" },
      { label: "Receipts",            icon: "file",        segment: "receipts"     },
      { label: "Shift & Cash",        icon: "dollar-sign", segment: "shift"        },
      { label: "Vouchers & Discounts", icon: "tag",        segment: "vouchers"     },
      { label: "Reports",             icon: "trending-up", segment: "reports"      },
      { label: "Z Reports",           icon: "file-minus",  segment: "z-reports"    },
      { label: "Costing",             icon: "bar-chart-2", segment: "costing"      },
      { label: "Expenses",            icon: "credit-card", segment: "expenses"     },
    ],
  },
  {
    section: "CATALOG",
    items: [
      { label: "Products",  icon: "box",    segment: "products"  },
      { label: "Inventory", icon: "layers", segment: "inventory" },
      { label: "Suppliers", icon: "truck",  segment: "suppliers" },
    ],
  },
  {
    section: "PEOPLE",
    items: [
      { label: "Staff",     icon: "users",          segment: "staff"     },
      { label: "Customers", icon: "user",           segment: "customers" },
      { label: "Tasks",     icon: "check-square",   segment: "tasks"     },
    ],
  },
  {
    section: "DEVICE",
    items: [
      { label: "Printers", icon: "printer", segment: "printers" },
    ],
  },
  {
    section: "SYSTEM",
    items: [
      { label: "Audit Logs",    icon: "activity", segment: "audit"    },
      { label: "Access Matrix", icon: "shield",   segment: "access"   },
      { label: "Settings",      icon: "settings", segment: "settings" },
    ],
  },
];

const EXPANDED_W = 216;
const COLLAPSED_W = 58;

export const AdminSidebar = forwardRef<AdminSidebarHandle, { phoneMode?: boolean; forceExpanded?: boolean }>(
function AdminSidebar({ phoneMode = false, forceExpanded = false }, ref) {
  const { user, role, memberships, activeWorkspaceId, signOut, loading: authLoading } = useAuth();
  const { C } = useTheme();
  const { showToast } = useToast();
  const router = useRouter();

  const handleSignOut = SIGN_OUT_DISABLED
    ? () => showToast({ title: "Sign out disabled", message: "This device is shared for now — ask an admin before signing out.", type: "info" })
    : signOut;
  const segments = useSegments() as readonly string[];
  const s = useMemo(() => makeStyles(C), [C]);
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // ── Phone overlay state ──────────────────────────────────────────────────
  const [phoneOpen, setPhoneOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(-EXPANDED_W)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const openPhone = useCallback(() => {
    setPhoneOpen(true);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 0 }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [slideAnim, backdropAnim]);

  const closePhone = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -EXPANDED_W, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setPhoneOpen(false));
  }, [slideAnim, backdropAnim]);

  useImperativeHandle(ref, () => ({ open: openPhone }), [openPhone]);

  // ── Tablet inline state ──────────────────────────────────────────────────
  const isSmallScreen = !forceExpanded && screenWidth < 600;
  const [collapsed, setCollapsed] = useState(() => isSmallScreen);
  const widthAnim = useRef(new Animated.Value(isSmallScreen ? COLLAPSED_W : EXPANDED_W)).current;
  const chevronAnim = useRef(new Animated.Value(isSmallScreen ? 1 : 0)).current;

  useEffect(() => {
    if (forceExpanded) return;
    const shouldCollapse = screenWidth < 600;
    if (shouldCollapse === collapsed) return;
    setCollapsed(shouldCollapse);
    Animated.parallel([
      Animated.spring(widthAnim, { toValue: shouldCollapse ? COLLAPSED_W : EXPANDED_W, useNativeDriver: false, bounciness: 0 }),
      Animated.timing(chevronAnim, { toValue: shouldCollapse ? 1 : 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [isSmallScreen]); // eslint-disable-line react-hooks/exhaustive-deps

  const ws = memberships.find((m) => m.workspace_id === activeWorkspaceId);
  const activeSegment = segments[1] as string | undefined;

  function toggle() {
    const toCollapsed = !collapsed;
    setCollapsed(toCollapsed);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Animated.parallel([
      Animated.spring(widthAnim, { toValue: toCollapsed ? COLLAPSED_W : EXPANDED_W, useNativeDriver: false, bounciness: 0 }),
      Animated.timing(chevronAnim, { toValue: toCollapsed ? 1 : 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }

  function go(segment: string) {
    router.push(`/pos/${segment}` as any);
    if (phoneMode) closePhone();
  }

  // Staff emails are synthetic: {workspace_id}_{username}@staff.pos
  // Extract the username portion for display; fall back to the email prefix for regular accounts.
  const displayName = (() => {
    const email = user?.email ?? "";
    if (email.endsWith("@staff.pos")) return email.slice(37).split("@")[0]; // skip 36-char UUID + "_"
    return email.split("@")[0];
  })();
  const initial = (displayName?.[0] ?? "?").toUpperCase();
  const chevronRotate = chevronAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  // ── Shared nav content ───────────────────────────────────────────────────
  function renderNavItem(item: { label: string; icon: FName; segment: string }, isCollapsed: boolean) {
    const active = activeSegment === item.segment;
    return (
      <Pressable
        key={item.segment}
        style={[s.navItem, isCollapsed && s.navItemCollapsed, active && s.navItemActive]}
        onPress={() => go(item.segment)}
      >
        <Feather name={item.icon} size={16} color={active ? C.amber : C.ink3} />
        {!isCollapsed && (
          <Text style={[s.navLabel, active && s.navLabelActive]}>{item.label}</Text>
        )}
        {active && !isCollapsed && <View style={s.activePip} />}
        {active && isCollapsed && <View style={s.activePipCollapsed} />}
      </Pressable>
    );
  }

  function renderNav(isCollapsed: boolean) {
    // While the account role is still resolving (right after launch/login),
    // every item is role-gated and filters out — show a spinner instead of a
    // blank scroll area that reads as broken.
    if (authLoading) {
      return (
        <>
          <View style={[s.loadingWrap, isCollapsed && s.collapsedNav]}>
            <ActivityIndicator size="small" color={C.ink4} />
          </View>
          <View style={[s.footer, { paddingBottom: 12 + insets.bottom }, isCollapsed && s.footerCollapsed]}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initial}</Text>
            </View>
            {!isCollapsed && (
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.email} numberOfLines={1}>{displayName || "—"}</Text>
                <Text style={s.roleTag}>…</Text>
              </View>
            )}
          </View>
        </>
      );
    }
    return (
      <>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
          contentContainerStyle={isCollapsed ? s.collapsedNav : undefined}>
          {NAV
            .map(section => ({ ...section, items: section.items.filter(item => canAccessPosRoute(role, item.segment)) }))
            .filter(section => section.items.length > 0)
            .map((section) => (
              <View key={section.section} style={s.section}>
                {!isCollapsed && <Text style={s.sectionLabel}>{section.section}</Text>}
                {isCollapsed && <View style={s.sectionDivider} />}
                {section.items.map((item) => renderNavItem(item, isCollapsed))}
              </View>
            ))}
          <View style={{ height: 12 }} />
        </ScrollView>

        <View style={[s.footer, { paddingBottom: 12 + insets.bottom }, isCollapsed && s.footerCollapsed]}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initial}</Text>
          </View>
          {!isCollapsed && (
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.email} numberOfLines={1}>{displayName || "—"}</Text>
              <Text style={s.roleTag}>{role ?? "staff"}</Text>
            </View>
          )}
          {!isCollapsed && (
            <Pressable onPress={handleSignOut} style={[s.signOutBtn, SIGN_OUT_DISABLED && { opacity: 0.4 }]} hitSlop={8}>
              <Feather name={SIGN_OUT_DISABLED ? "lock" : "log-out"} size={15} color={C.ink3} />
            </Pressable>
          )}
          {isCollapsed && (
            <Pressable onPress={handleSignOut} style={[s.signOutBtnCollapsed, SIGN_OUT_DISABLED && { opacity: 0.4 }]} hitSlop={8}>
              <Feather name={SIGN_OUT_DISABLED ? "lock" : "log-out"} size={14} color={C.ink3} />
            </Pressable>
          )}
        </View>
      </>
    );
  }

  // ── Phone overlay mode ───────────────────────────────────────────────────
  if (phoneMode) {
    return (
      <>
        {/* Backdrop */}
        {phoneOpen && (
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)", zIndex: 50, opacity: backdropAnim }]}
            pointerEvents={phoneOpen ? "auto" : "none"}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={closePhone} />
          </Animated.View>
        )}

        {/* Slide-in sidebar */}
        <Animated.View style={[
          s.sidebar,
          {
            position: "absolute", top: 0, bottom: 0, left: 0,
            width: EXPANDED_W, zIndex: 60,
            transform: [{ translateX: slideAnim }],
          },
        ]}>
          <View style={[s.brand, { paddingTop: insets.top + 10 }]}>
            <View style={s.logoMark}>
              <Image
                source={require("../../assets/logo/FindXnY_logo_transparent_white.png")}
                style={s.logoIcon}
                resizeMode="contain"
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.brandName} numberOfLines={1}>{ws?.workspace_name ?? "FINDXNY"}</Text>
              <Text style={s.brandSub}>{role ? role.toUpperCase() : authLoading ? "…" : "STAFF"}</Text>
            </View>
            <Pressable onPress={closePhone} style={s.toggleBtn} hitSlop={8}>
              <Feather name="x" size={15} color={C.ink3} />
            </Pressable>
          </View>
          {renderNav(false)}
        </Animated.View>

      </>
    );
  }

  // ── Tablet inline mode ───────────────────────────────────────────────────
  return (
    <Animated.View style={[s.sidebar, { width: widthAnim }]}>
      <View style={s.brand}>
        <View style={s.logoMark}>
          <Image
            source={require("../../assets/logo/FindXnY_logo_transparent_white.png")}
            style={s.logoIcon}
            resizeMode="contain"
          />
        </View>
        {!collapsed && (
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.brandName} numberOfLines={1}>{ws?.workspace_name ?? "FINDXNY"}</Text>
            <Text style={s.brandSub}>{role ? role.toUpperCase() : authLoading ? "…" : "STAFF"}</Text>
          </View>
        )}
        <Pressable onPress={toggle} style={s.toggleBtn} hitSlop={8}>
          <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
            <Feather name="chevrons-left" size={15} color={C.ink3} />
          </Animated.View>
        </Pressable>
      </View>
      {renderNav(collapsed)}
    </Animated.View>
  );
});

type C = ReturnType<typeof useTheme>["C"];
const makeStyles = (C: C) => StyleSheet.create({
  sidebar: {
    backgroundColor: C.bg2,
    borderRightWidth: 1,
    borderRightColor: C.line,
    flexDirection: "column",
    overflow: "hidden",
  },
  hamburger: {
    position: "absolute", left: 12, zIndex: 40,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.bg2,
    borderWidth: 1, borderColor: `${C.amber}55`,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
  },

  brand: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  logoMark: {
    // Fixed neutral mark — matches login.tsx's logo box exactly, independent
    // of the accent theme (same "brand mark stays black/white" rule as web).
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: "#111111",
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  logoIcon:  { width: 20, height: 20 },
  brandName: { color: C.ink, fontSize: 12, fontWeight: "700", letterSpacing: 0.2 },
  brandSub:  { color: C.ink3, fontSize: 9, letterSpacing: 0.8, marginTop: 2 },
  toggleBtn: {
    width: 26, height: 26, borderRadius: R.md,
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.surface, flexShrink: 0,
  },

  collapsedNav: { alignItems: "center" },
  loadingWrap:  { flex: 1, alignItems: "center", justifyContent: "center" },

  section: { paddingTop: 6 },
  sectionLabel: {
    color: C.ink4, fontSize: 9, letterSpacing: 1.2,
    fontWeight: "700", paddingHorizontal: 14, paddingBottom: 2, marginTop: 4,
  },
  sectionDivider: {
    height: 1, backgroundColor: C.line,
    marginHorizontal: 10, marginTop: 6, marginBottom: 2,
  },

  navItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, paddingVertical: 9,
    marginHorizontal: 6, borderRadius: R.md,
    position: "relative",
  },
  navItemCollapsed: {
    justifyContent: "center",
    paddingHorizontal: 0,
    marginHorizontal: 6,
    width: 40,
  },
  navItemActive:  { backgroundColor: "rgba(208,144,48,0.10)" },
  navLabel:       { color: C.ink3, fontSize: 13, fontWeight: "500", flex: 1 },
  navLabelActive: { color: C.amber, fontWeight: "600" },
  activePip: {
    position: "absolute", right: 8,
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: C.amber,
  },
  activePipCollapsed: {
    position: "absolute", bottom: 4, left: "50%",
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: C.amber, marginLeft: -2,
  },

  footer: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderTopWidth: 1, borderTopColor: C.line,
  },
  footerCollapsed: { flexDirection: "column", alignItems: "center", gap: 10 },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "rgba(208,144,48,0.15)",
    borderWidth: 1, borderColor: "rgba(208,144,48,0.3)",
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  avatarText:    { color: C.amber, fontSize: 11, fontWeight: "700" },
  email:         { color: C.ink3, fontSize: 11, fontWeight: "500" },
  roleTag:       { color: C.ink4, fontSize: 9, letterSpacing: 0.6, textTransform: "uppercase", marginTop: 1 },
  signOutBtn: {
    width: 26, height: 26, borderRadius: R.md,
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.surface,
  },
  signOutBtnCollapsed: {
    width: 32, height: 32, borderRadius: R.md,
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.surface,
  },
});

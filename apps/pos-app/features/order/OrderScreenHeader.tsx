import { View, Text, Pressable } from "react-native";
import type { Router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { RefreshButton } from "../ui/RefreshButton";
import { OfflineToggleButton } from "../offline/OfflineToggleButton";
import type { useTheme } from "../theme/ThemeContext";
import type { makeStyles } from "./orderScreenStyles";

type C = ReturnType<typeof useTheme>["C"];
type S = ReturnType<typeof makeStyles>;

interface Props {
  readonly isPhoneMode: boolean;
  readonly openSidebar: () => void;
  readonly router: Pick<Router, "canGoBack" | "back" | "replace">;
  readonly editOrderId: string | null;
  readonly shiftCashier: string | null;
  readonly onLoadTicket: () => void;
  readonly onRefreshProducts: () => void;
  readonly productsRefreshing: boolean;
  readonly fullscreen: boolean;
  readonly onToggleFullscreen: () => void;
  readonly isTablet: boolean;
  readonly itemCount: number;
  readonly onOpenCart: () => void;
  readonly paddingTop: number;
  readonly paddingLeft: number;
  readonly paddingRight: number;
  readonly C: C;
  readonly s: S;
}

export function OrderScreenHeader({
  isPhoneMode, openSidebar, router, editOrderId, shiftCashier,
  onLoadTicket, onRefreshProducts, productsRefreshing, fullscreen, onToggleFullscreen,
  isTablet, itemCount, onOpenCart, paddingTop, paddingLeft, paddingRight, C, s,
}: Props) {
  return (
    <View style={[s.header, { paddingTop, paddingLeft, paddingRight }]}>
      {isPhoneMode && (
        <Pressable style={s.menuBtn} onPress={openSidebar} hitSlop={8}>
          <Feather name="menu" size={18} color={C.amber} />
        </Pressable>
      )}
      <Pressable style={s.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace("/pos/dashboard")} hitSlop={8}>
        <Feather name="chevron-left" size={20} color={C.amber} />
        <Text style={s.backText}>POS</Text>
      </Pressable>
      <Text style={s.headerTitle}>{editOrderId ? "Edit Order" : "New Order"}</Text>
      {shiftCashier && (
        <View style={s.shiftPill}>
          <View style={s.shiftDot} />
          <Text style={s.shiftPillText}>{shiftCashier}</Text>
        </View>
      )}
      <Pressable style={s.loadTicketBtn} onPress={onLoadTicket}>
        <Feather name="hash" size={12} color={C.amber} />
        <Text style={s.loadTicketBtnText}>Load Ticket</Text>
      </Pressable>
      <RefreshButton onPress={onRefreshProducts} refreshing={productsRefreshing} compact />
      <Pressable style={s.fullscreenBtn} onPress={onToggleFullscreen} hitSlop={8}>
        <Feather name={fullscreen ? "minimize" : "maximize"} size={16} color={C.ink3} />
      </Pressable>
      <OfflineToggleButton />
      <View style={{ flex: 1 }} />
      {!isTablet && (
        <Pressable style={s.cartBadge} onPress={onOpenCart}>
          <Feather name="shopping-cart" size={22} color={C.ink} />
          {itemCount > 0 && (
            <View style={s.badge}><Text style={s.badgeText}>{itemCount}</Text></View>
          )}
        </Pressable>
      )}
    </View>
  );
}

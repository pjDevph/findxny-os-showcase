/**
 * Held-carts (parked orders) picker — resume or discard a parked cart.
 *
 * Extracted from app/pos/order.tsx.
 */
import { View, Text, Pressable, ScrollView, Modal, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { KeyboardSheet } from "../ui/KeyboardSheet";
import { useTheme } from "../theme/ThemeContext";
import { MAX_HELD_CARTS, type HeldCartEntry, heldCartQuickTotal, relativeHeldTime } from "./heldCart";
import { ORDER_TYPES } from "./types";
import { peso } from "./format";
import type { OrderScreenStyles } from "./orderScreenStyles";

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly heldCarts: HeldCartEntry[];
  readonly onResume: (id: string) => void;
  readonly onDiscard: (id: string) => void;
  readonly s: OrderScreenStyles;
  readonly C: ReturnType<typeof useTheme>["C"];
}

export function HeldCartsModal({ visible, onClose, heldCarts, onResume, onDiscard, s, C }: Props) {
  return (
      <Modal visible={visible} animationType="fade" transparent onRequestClose={() => onClose()}>
        <KeyboardSheet style={s.ticketModalBd}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => onClose()} />
          <View style={s.ticketSheet}>
            <View style={s.ticketHeader}>
              <Text style={s.ticketSheetTitle}>Held Carts ({heldCarts.length}/{MAX_HELD_CARTS})</Text>
              <Pressable style={s.ticketCloseBtn} onPress={() => onClose()} hitSlop={8}>
                <Feather name="x" size={18} color={C.ink3} />
              </Pressable>
            </View>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={s.ticketContent}>
              {heldCarts.length === 0 && (
                <Text style={s.ticketSheetSub}>No carts on hold.</Text>
              )}
              {[...heldCarts].sort((a, b) => b.heldAt - a.heldAt).map(entry => {
                const { itemCount, total: entryTotal } = heldCartQuickTotal(entry.cart);
                const label = ORDER_TYPES.find(t => t.id === entry.cart.orderType)?.label ?? "Order";
                const meta = [
                  label,
                  entry.cart.tableNo ? `Table ${entry.cart.tableNo}` : null,
                  relativeHeldTime(entry.heldAt),
                ].filter(Boolean).join(" · ");
                return (
                  <Pressable
                    key={entry.id}
                    style={s.ticketResultCard}
                    onPress={() => onResume(entry.id)}
                  >
                    <View style={s.ticketResultHeader}>
                      <Text style={s.ticketResultMeta}>{meta}</Text>
                      <View style={{ flex: 1 }} />
                      <Text style={s.ticketResultPrice}>{peso(entryTotal)}</Text>
                      <Pressable
                        hitSlop={8}
                        onPress={() => onDiscard(entry.id)}
                      >
                        <Feather name="trash-2" size={15} color={C.bad} />
                      </Pressable>
                    </View>
                    <Text style={s.ticketResultMeta}>
                      {itemCount} item{itemCount !== 1 ? "s" : ""} — tap to resume
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </KeyboardSheet>
      </Modal>
  );
}

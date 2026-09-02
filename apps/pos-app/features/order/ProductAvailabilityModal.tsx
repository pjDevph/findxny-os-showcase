/**
 * Long-press "mark unavailable" / "mark available" confirm for a product tile.
 *
 * Toggling `active` off no longer removes the tile from the grid — order-
 * product-list returns inactive-but-not-archived products too, greyed out
 * via ProductTile's isUnavailable check — so the same long-press action
 * works in both directions from the same tile, no separate browse panel.
 */
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import type { OrderScreenStyles } from "./orderScreenStyles";
import type { Product } from "./types";

interface Props {
  readonly product: Product | null;
  readonly onClose: () => void;
  readonly saving: boolean;
  readonly onConfirm: () => void;
  readonly s: OrderScreenStyles;
  readonly C: ReturnType<typeof useTheme>["C"];
}

export function ProductAvailabilityModal({ product, onClose, saving, onConfirm, s, C }: Props) {
  const makeAvailable = product?.active === false;
  const actionLabel = makeAvailable ? "Mark Available" : "Mark Unavailable";
  let buttonLabel = actionLabel;
  if (saving) buttonLabel = "Saving…";
  return (
    <Modal visible={!!product} animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.ticketModalBd}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.ticketSheet, { maxWidth: 380 }]}>
          <View style={s.ticketHeader}>
            <Text style={s.ticketSheetTitle}>{actionLabel}</Text>
            <Pressable style={s.ticketCloseBtn} onPress={onClose} hitSlop={8}>
              <Feather name="x" size={18} color={C.ink3} />
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: 20, paddingBottom: 24, gap: 12 }}>
            <Text style={s.ticketSheetSub}>
              {product ? `"${product.name}"` : "This item"} {makeAvailable
                ? "will be orderable again."
                : "will show greyed out and can't be added to an order until you mark it available again — long-press it again anytime."}
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable style={[s.bookingModalCancelBtn, { flex: 1 }]} onPress={onClose}>
                <Text style={s.bookingModalCancelBtnTxt}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.bookingModalAddBtn, { flex: 1, backgroundColor: makeAvailable ? C.good : C.bad }, saving && { opacity: 0.5 }]}
                onPress={onConfirm}
                disabled={saving}
              >
                <Text style={s.bookingModalAddBtnTxt}>{buttonLabel}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

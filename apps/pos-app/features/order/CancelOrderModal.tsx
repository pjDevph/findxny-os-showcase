/**
 * Cancel-order confirmation with optional reason.
 *
 * Extracted from app/pos/order.tsx.
 */
import { View, Text, Pressable, TextInput, Modal, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { KeyboardSheet } from "../ui/KeyboardSheet";
import { useTheme } from "../theme/ThemeContext";
import type { OrderScreenStyles } from "./orderScreenStyles";

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly reason: string;
  readonly onReasonChange: (v: string) => void;
  readonly cancelling: boolean;
  readonly onConfirm: () => void;
  readonly bottomInset: number;
  readonly s: OrderScreenStyles;
  readonly C: ReturnType<typeof useTheme>["C"];
}

export function CancelOrderModal({
  visible, onClose, reason, onReasonChange, cancelling, onConfirm, bottomInset, s, C,
}: Props) {
  return (
      <Modal visible={visible} animationType="fade" transparent onRequestClose={() => onClose()}>
        <KeyboardSheet style={[s.ticketModalBd, { paddingBottom: 24 + bottomInset }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => onClose()} />
          <View style={[s.ticketSheet, { maxWidth: 420 }]}>
            <View style={s.ticketHeader}>
              <Text style={[s.ticketSheetTitle, { color: C.bad }]}>Cancel Order</Text>
              <Pressable style={s.ticketCloseBtn} onPress={() => onClose()} hitSlop={8}>
                <Feather name="x" size={18} color={C.ink3} />
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: 20, paddingBottom: 24, gap: 12 }}>
              <Text style={{ color: C.ink3, fontSize: 13, lineHeight: 19 }}>
                This will cancel the order. Any pending payments will be voided.
              </Text>
              <TextInput
                placeholder="Reason (optional)"
                placeholderTextColor={C.ink4}
                value={reason}
                onChangeText={onReasonChange}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
                style={[s.bInput, { minHeight: 64, textAlignVertical: "top" }]}
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  style={[s.bookingModalCancelBtn, { flex: 1 }]}
                  onPress={() => onClose()}
                >
                  <Text style={s.bookingModalCancelBtnTxt}>Keep Order</Text>
                </Pressable>
                <Pressable
                  style={[s.bookingModalAddBtn, { flex: 1, backgroundColor: C.bad }, cancelling && { opacity: 0.5 }]}
                  onPress={() => onConfirm()}
                  disabled={cancelling}
                >
                  <Text style={s.bookingModalAddBtnTxt}>{cancelling ? "Cancelling…" : "Cancel Order"}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardSheet>
      </Modal>
  );
}

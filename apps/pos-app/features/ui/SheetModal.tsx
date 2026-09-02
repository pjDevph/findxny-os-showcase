/**
 * Generic bottom/centre sheet modal.
 *
 * Wraps the backdrop-dismiss pattern repeated across the POS: a full-bleed
 * transparent Modal, a tap-anywhere-to-close backdrop, and an inner sheet whose
 * own taps are swallowed so they don't bubble up and dismiss it.
 *
 * Callers supply the backdrop/sheet styles so each screen keeps its own look:
 *
 *   <SheetModal visible={open} onClose={close} backdropStyle={s.modalBd} sheetStyle={s.cartSheet}>
 *     <CartPanel … />
 *   </SheetModal>
 */
import { Modal, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import type { ReactNode } from "react";
import { KeyboardSheet } from "./KeyboardSheet";

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** Style for the dimmed backdrop area (usually centres/anchors the sheet). */
  readonly backdropStyle?: StyleProp<ViewStyle>;
  /** Style for the sheet surface itself. */
  readonly sheetStyle?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}

export function SheetModal({ visible, onClose, backdropStyle, sheetStyle, children }: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardSheet style={backdropStyle}>
        {/* Backdrop — tap outside to dismiss */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {/* Sheet — swallows taps so they don't reach the backdrop */}
        <Pressable style={sheetStyle} onPress={() => {}}>
          {children}
        </Pressable>
      </KeyboardSheet>
    </Modal>
  );
}

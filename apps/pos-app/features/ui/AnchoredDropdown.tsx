/**
 * AnchoredDropdown — backdrop-dismiss dropdown menu positioned under a
 * trigger button. Pair with useAnchoredDropdown.ts for the measure/position
 * state.
 *
 * Replaces printers.tsx's two near-identical dropdown modals (category
 * picker, printer picker) and reports.tsx's filter dropdown — same
 * backdrop+positioned-menu+ScrollView-of-items shell, three times over.
 */
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { ReactNode } from "react";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import type { AnchoredPosition } from "./useAnchoredDropdown";

interface Props {
  readonly visible: boolean;
  readonly position: AnchoredPosition;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly maxHeight?: number;
}

export function AnchoredDropdown({ visible, position, onClose, children, maxHeight = 280 }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[s.menu, { top: position.top, left: position.left, minWidth: position.width, maxHeight }]}>
        <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  menu: {
    position: "absolute", backgroundColor: C.bg2, borderRadius: R.md,
    borderWidth: 1, borderColor: C.line, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
  },
});

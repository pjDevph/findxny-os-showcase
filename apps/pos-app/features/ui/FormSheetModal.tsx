/**
 * FormSheetModal — shared centered form-sheet chrome (backdrop, header with a
 * close-X, scrollable body, optional bordered footer) used by the POS admin
 * screens' add/edit dialogs (Suppliers, Resources, Tasks, Expenses, etc).
 *
 * Built on KeyboardSheet so Android keyboard handling matches the app's
 * established pattern instead of each screen re-implementing its own
 * Platform.select KeyboardAvoidingView logic.
 */
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from "react-native";
import { useMemo, type ReactNode } from "react";
import { Feather } from "@expo/vector-icons";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { KeyboardSheet } from "./KeyboardSheet";
import { useScrollOverflowHint } from "./useScrollOverflowHint";

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Footer content (e.g. the primary submit button). Omit or pass null/undefined to render no footer. */
  footer?: ReactNode | null;
  /** Sheet max-height. Default: "92%" */
  maxHeightPct?: `${number}%`;
}

export function FormSheetModal({ visible, onClose, title, children, footer, maxHeightPct = "92%" }: Readonly<Props>) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C, maxHeightPct), [C, maxHeightPct]);

  // "More below" hint while the body overflows and hasn't been scrolled to
  // the bottom yet — the sheet has no visible scrollbar.
  const { showHint: showScrollHint, onLayout, onContentSizeChange, onScroll } = useScrollOverflowHint();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardSheet style={s.modalBd}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        {/* Plain View, not Pressable — a Pressable here would compete with the
            nested ScrollView for touch-gesture arbitration, making swipes feel
            sluggish/unresponsive. It already blocks the backdrop tap-to-close
            just by being drawn on top; no press handler needed. */}
        <View style={s.sheetWrap}>
          <View style={s.header}>
            <Text style={[s.sheetTitle, { flex: 1 }]} numberOfLines={1}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
              <Feather name="x" size={20} color={C.ink3} />
            </Pressable>
          </View>

          <View style={{ flexShrink: 1 }}>
            <ScrollView
              style={{ flexShrink: 1 }} contentContainerStyle={s.sheetContent} keyboardShouldPersistTaps="handled"
              onLayout={onLayout}
              onContentSizeChange={onContentSizeChange}
              onScroll={onScroll}
              scrollEventThrottle={32}
            >
              {children}
            </ScrollView>
            {showScrollHint && (
              <View style={s.scrollHint} pointerEvents="none">
                <View style={s.scrollHintPill}>
                  <Feather name="chevrons-down" size={14} color={C.ink3} />
                </View>
              </View>
            )}
          </View>

          {footer != null && <View style={s.footer}>{footer}</View>}
        </View>
      </KeyboardSheet>
    </Modal>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"], maxHeightPct: `${number}%`) => StyleSheet.create({
  modalBd:      { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 16 },
  sheetWrap:    { backgroundColor: C.bg2, borderRadius: R.xl, maxHeight: maxHeightPct, overflow: "hidden", width: "100%", maxWidth: 640 },
  header:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  sheetTitle:   { color: C.ink, fontSize: 17, fontWeight: "700", paddingTop: 4, paddingBottom: 2 },
  // Generous bottom padding — Android's window-resize keyboard mode shrinks
  // the whole sheet, so fields near the end need room to scroll clear above
  // the keyboard instead of staying pinned behind it.
  sheetContent: { padding: 20, gap: 16, paddingBottom: 220 },
  footer:       { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10, paddingHorizontal: 20, paddingBottom: 20 },
  scrollHint: {
    position: "absolute", bottom: 4, left: 0, right: 0,
    alignItems: "center",
  },
  scrollHintPill: {
    backgroundColor: C.surface, borderRadius: R.full,
    borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 8, paddingVertical: 3,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 2,
  },
});

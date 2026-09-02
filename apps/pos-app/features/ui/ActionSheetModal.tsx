/**
 * ActionSheetModal — bottom-sheet list of tappable actions (icon + label rows).
 *
 * Replaces products.tsx's per-row "⋯" action menu (edit / hide-from-POS /
 * hide-from-web / archive / restore) — generic enough for any row-level
 * action menu elsewhere in the app.
 */
import { Modal, Pressable, Text, View, StyleSheet } from "react-native";
import type { ReactNode } from "react";
import { Feather } from "@expo/vector-icons";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

export interface ActionSheetItem {
  readonly key: string;
  readonly label: string;
  readonly sub?: string;
  readonly icon?: keyof typeof Feather.glyphMap;
  readonly iconBg?: string;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  /** Renders a divider above this item — for grouping related actions. */
  readonly dividerBefore?: boolean;
  readonly onPress: () => void;
}

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** Plain text title. Ignored if `header` is passed. */
  readonly title?: string;
  /** Custom header content (e.g. item name + status), replacing the plain title. */
  readonly header?: ReactNode;
  readonly actions: readonly ActionSheetItem[];
  readonly cancelLabel?: string;
}

export function ActionSheetModal({ visible, onClose, title, header, actions, cancelLabel = "Cancel" }: Props) {
  const { C } = useTheme();
  const s = styles(C);

  function handlePress(action: ActionSheetItem) {
    onClose();
    action.onPress();
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          {header ?? (!!title && <Text style={s.title}>{title}</Text>)}
          {actions.map((action) => (
            <View key={action.key}>
              {action.dividerBefore && <View style={s.divider} />}
              <Pressable
                style={[s.row, action.disabled && { opacity: 0.4 }]}
                onPress={() => handlePress(action)}
                disabled={action.disabled}
              >
                {!!action.icon && (
                  <View style={[s.iconWrap, { backgroundColor: action.iconBg ?? (action.destructive ? `${C.bad}18` : `${C.ink3}18`) }]}>
                    <Feather name={action.icon} size={15} color={action.destructive ? C.bad : C.ink2} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, action.destructive && { color: C.bad }]}>{action.label}</Text>
                  {!!action.sub && <Text style={s.sub}>{action.sub}</Text>}
                </View>
              </Pressable>
            </View>
          ))}
          <View style={s.divider} />
          <Pressable style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelTxt}>{cancelLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.bg2, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingBottom: 24 },
  title: { color: C.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", paddingHorizontal: 20, paddingVertical: 10 },
  divider: { height: 1, backgroundColor: C.lineSoft, marginHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
  iconWrap: { width: 30, height: 30, borderRadius: R.md, alignItems: "center", justifyContent: "center" },
  label: { color: C.ink, fontSize: 14.5, fontWeight: "600" },
  sub: { color: C.ink4, fontSize: 11, marginTop: 1 },
  cancelBtn: { paddingVertical: 14, alignItems: "center" },
  cancelTxt: { color: C.ink3, fontSize: 14, fontWeight: "600" },
});

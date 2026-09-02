/**
 * ConfirmActionModal — icon + title + body + Cancel/Confirm action sheet.
 *
 * Replaces book-room.tsx's CancelModal/NoShowModal/CompleteModal/ErrorModal
 * quartet, which were ~95% identical JSX differing only in icon, color,
 * title, body copy and the confirm button's label.
 *
 * Omit onConfirm/confirmLabel for a single full-width "OK" dismiss button
 * (the ErrorModal shape); pass them for the two-button Cancel/Confirm shape.
 */
import { ActivityIndicator, Modal, Pressable, Text, View, StyleSheet } from "react-native";
import type { ReactNode } from "react";
import { Feather } from "@expo/vector-icons";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  readonly visible: boolean;
  readonly icon: keyof typeof Feather.glyphMap;
  /** Icon + accent color for the confirm button (e.g. C.bad, C.warn, C.good, C.info, C.ink2). */
  readonly iconColor: string;
  readonly title: string;
  readonly body: ReactNode;
  readonly onCancel: () => void;
  readonly onConfirm?: () => void;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly busy?: boolean;
}

export function ConfirmActionModal({
  visible, icon, iconColor, title, body, onCancel, onConfirm, confirmLabel, cancelLabel, busy,
}: Props) {
  const { C } = useTheme();
  const s = styles(C);
  const singleButton = !onConfirm || !confirmLabel;
  const dismissLabel = cancelLabel ?? (singleButton ? "OK" : "Cancel");

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <Pressable style={s.overlay} onPress={onCancel}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={[s.iconWrap, { backgroundColor: `${iconColor}18` }]}>
            <Feather name={icon} size={28} color={iconColor} />
          </View>
          <Text style={s.title}>{title}</Text>
          {typeof body === "string" ? <Text style={s.body}>{body}</Text> : body}
          {singleButton ? (
            <Pressable style={[s.keepBtn, { alignSelf: "stretch" }]} onPress={onCancel}>
              <Text style={[s.keepTxt, { textAlign: "center" }]}>{dismissLabel}</Text>
            </Pressable>
          ) : (
            <View style={s.actions}>
              <Pressable style={s.keepBtn} onPress={onCancel} disabled={busy}>
                <Text style={s.keepTxt}>{dismissLabel}</Text>
              </Pressable>
              <Pressable
                style={[s.confirmBtn, { borderColor: `${iconColor}44`, backgroundColor: `${iconColor}18` }, busy && { opacity: 0.5 }]}
                onPress={onConfirm}
                disabled={busy}
              >
                {busy
                  ? <ActivityIndicator size="small" color={iconColor} />
                  : <Text style={[s.confirmTxt, { color: iconColor }]}>{confirmLabel}</Text>
                }
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 20 },
  sheet: { backgroundColor: C.bg2, borderRadius: R.xl, width: "100%", maxWidth: 400, padding: 22, alignItems: "center", gap: 10 },
  iconWrap: { width: 56, height: 56, borderRadius: R.full, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  title: { color: C.ink, fontSize: 16, fontWeight: "700", textAlign: "center" },
  body: { color: C.ink3, fontSize: 13.5, lineHeight: 19, textAlign: "center" },
  actions: { flexDirection: "row", gap: 10, marginTop: 8, alignSelf: "stretch" },
  keepBtn: { flex: 1, borderRadius: R.cta, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, paddingVertical: 12, alignItems: "center" },
  keepTxt: { color: C.ink2, fontSize: 13, fontWeight: "700" },
  confirmBtn: { flex: 1, borderRadius: R.cta, borderWidth: 1, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  confirmTxt: { fontSize: 13, fontWeight: "700" },
});

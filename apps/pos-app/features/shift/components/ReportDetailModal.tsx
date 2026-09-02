/**
 * ReportDetailModal — generic bottom-sheet report viewer: header (title +
 * subtitle + close), scrollable section content, and a 1-2 button action row.
 *
 * Consolidates shift.tsx's three near-identical report sheets — the X/Z
 * report modal, the shift-close report preview, and the manager
 * reconciliation detail modal — which shared this exact shell and differed
 * only in their section content and action buttons.
 */
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../theme/ThemeContext";
import { R } from "../../theme/tokens";

export interface ReportModalAction {
  readonly label: string;
  readonly onPress: () => void;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly kind?: "info" | "amber";
}

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly closeLabel?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
  readonly primaryAction?: ReportModalAction;
  readonly secondaryAction?: ReportModalAction;
  readonly loading?: boolean;
}

export function ReportDetailModal({ visible, onClose, closeLabel = "Close", title, subtitle, children, primaryAction, secondaryAction, loading }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, { paddingBottom: 24 + insets.bottom }]}>
          <View style={s.header}>
            <View>
              <Text style={s.title}>{title}</Text>
              {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
            </View>
            <Pressable onPress={onClose} style={s.closeBtn}>
              <Text style={s.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator color={C.amber} />
            </View>
          ) : (
            <>
              <ScrollView showsVerticalScrollIndicator={false} style={s.scroll}>
                {children}
              </ScrollView>

              <View style={s.actions}>
                {secondaryAction && (
                  <Pressable
                    style={[s.btn, secondaryAction.kind === "amber" ? s.amberBtn : s.infoBtn, { flex: 1 }, (secondaryAction.busy || secondaryAction.disabled) && { opacity: 0.6 }]}
                    onPress={secondaryAction.onPress}
                    disabled={secondaryAction.busy || secondaryAction.disabled}
                  >
                    {secondaryAction.busy
                      ? <ActivityIndicator size="small" color={secondaryAction.kind === "amber" ? "#000000" : C.info} />
                      : <Text style={[s.btnText, { color: secondaryAction.kind === "amber" ? "#000000" : C.info }]}>{secondaryAction.label}</Text>}
                  </Pressable>
                )}
                {primaryAction && (
                  <Pressable
                    style={[s.btn, primaryAction.kind === "amber" ? s.amberBtn : s.infoBtn, { flex: 1 }, (primaryAction.busy || primaryAction.disabled) && { opacity: 0.6 }]}
                    onPress={primaryAction.onPress}
                    disabled={primaryAction.busy || primaryAction.disabled}
                  >
                    {primaryAction.busy
                      ? <ActivityIndicator size="small" color={primaryAction.kind === "amber" ? "#000000" : C.info} />
                      : <Text style={[s.btnText, { color: primaryAction.kind === "amber" ? "#000000" : C.info }]}>{primaryAction.label}</Text>}
                  </Pressable>
                )}
                <Pressable style={[s.btn, s.neutralBtn, { flex: 1 }]} onPress={onClose}>
                  <Text style={[s.btnText, { color: C.ink2 }]}>{closeLabel}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: "88%", paddingBottom: 24 },
  header: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  title: { color: C.ink, fontSize: 17, fontWeight: "700" },
  subtitle: { color: C.ink3, fontSize: 12, marginTop: 2 },
  closeBtn: { padding: 6 },
  closeBtnText: { color: C.ink3, fontSize: 16, fontWeight: "600" },
  scroll: { flexShrink: 1, paddingHorizontal: 20, paddingTop: 12 },
  actions: { flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line },
  btn: { paddingVertical: 13, borderRadius: R.md, alignItems: "center", justifyContent: "center" },
  infoBtn: { borderWidth: 1, borderColor: C.info, backgroundColor: C.infoBg },
  amberBtn: { backgroundColor: C.amber },
  neutralBtn: { backgroundColor: C.bg2, borderColor: C.line, borderWidth: 1 },
  btnText: { fontSize: 13, fontWeight: "700", textAlign: "center" },
});

export const reportSectionStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  rSection: {
    color: C.ink3, fontSize: 10, letterSpacing: 1,
    textTransform: "uppercase", fontWeight: "600",
    marginTop: 14, marginBottom: 4,
  },
  rCard: {
    backgroundColor: C.bg2, borderRadius: R.md,
    borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 12, paddingVertical: 8,
  },
});

/**
 * AppAlertProvider — drop-in replacement for React Native's Alert.alert().
 *
 * Renders an actual in-app Modal (styled to match the rest of FINDXNY)
 * instead of the native OS dialog, so required-action confirmations look
 * consistent across iOS/Android and match the app's theme.
 *
 * Usage (signature matches Alert.alert exactly, so replacement is 1:1):
 *   const { showAlert } = useAppAlert();
 *   showAlert("Delete item?", "This cannot be undone.", [
 *     { text: "Cancel", style: "cancel" },
 *     { text: "Delete", style: "destructive", onPress: () => doDelete() },
 *   ]);
 *
 * Omitting `buttons` shows a single "OK" button, same as Alert.alert.
 * Calling showAlert() again while one is open queues it — shown after the
 * current one is dismissed, same as native Alert.alert's behavior.
 */
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";

export interface AppAlertButton {
  text:     string;
  style?:   "default" | "cancel" | "destructive";
  onPress?: () => void;
}

interface QueuedAlert {
  id:      number;
  title:   string;
  message?: string;
  buttons: AppAlertButton[];
}

interface AppAlertContextValue {
  showAlert: (title: string, message?: string, buttons?: AppAlertButton[]) => void;
}

const AppAlertContext = createContext<AppAlertContextValue | null>(null);

export function AppAlertProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const { C } = useTheme();
  const [current, setCurrent] = useState<QueuedAlert | null>(null);
  const queueRef = useRef<QueuedAlert[]>([]);
  const idRef = useRef(0);

  const advance = useCallback(() => {
    const next = queueRef.current.shift();
    setCurrent(next ?? null);
  }, []);

  const showAlert = useCallback((title: string, message?: string, buttons?: AppAlertButton[]) => {
    const entry: QueuedAlert = {
      id: ++idRef.current, title, message,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: "OK" }],
    };
    setCurrent(prev => {
      if (prev) { queueRef.current.push(entry); return prev; }
      return entry;
    });
  }, []);

  function handlePress(btn: AppAlertButton) {
    advance();
    btn.onPress?.();
  }

  const s = styles(C);

  return (
    <AppAlertContext.Provider value={{ showAlert }}>
      {children}
      <Modal visible={!!current} animationType="fade" transparent onRequestClose={advance}>
        <View style={s.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={advance} />
          {current && (
            <View style={s.sheet}>
              <View style={s.header}>
                <Text style={s.title}>{current.title}</Text>
                <Pressable onPress={advance} hitSlop={8}>
                  <Feather name="x" size={18} color={C.ink3} />
                </Pressable>
              </View>
              {current.message && <Text style={s.message}>{current.message}</Text>}
              <View style={s.buttonRow}>
                {current.buttons.map((btn, i) => (
                  <Pressable
                    key={`${btn.text}-${i}`}
                    style={[
                      s.btn,
                      btn.style === "cancel" && s.btnCancel,
                      btn.style === "destructive" && s.btnDestructive,
                      btn.style !== "cancel" && btn.style !== "destructive" && s.btnDefault,
                    ]}
                    onPress={() => handlePress(btn)}
                  >
                    <Text style={[
                      s.btnTxt,
                      btn.style === "cancel" && s.btnTxtCancel,
                      btn.style === "destructive" && s.btnTxtDestructive,
                      btn.style !== "cancel" && btn.style !== "destructive" && s.btnTxtDefault,
                    ]}>
                      {btn.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
      </Modal>
    </AppAlertContext.Provider>
  );
}

export function useAppAlert(): AppAlertContextValue {
  const ctx = useContext(AppAlertContext);
  if (!ctx) throw new Error("useAppAlert() must be used within AppAlertProvider");
  return ctx;
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center", alignItems: "center", padding: 24,
  },
  sheet: {
    backgroundColor: C.bg2, borderRadius: R.xl,
    width: "100%", maxWidth: 400, padding: 20, gap: 10,
  },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  title:   { color: C.ink, fontSize: 16, fontWeight: "700", flex: 1 },
  message: { color: C.ink3, fontSize: 13.5, lineHeight: 19 },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" },
  btn: {
    flex: 1, minWidth: 90, paddingVertical: 12, borderRadius: R.cta,
    alignItems: "center", justifyContent: "center",
  },
  btnDefault:     { backgroundColor: C.amber },
  btnCancel:      { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  btnDestructive: { backgroundColor: C.badBg, borderWidth: 1, borderColor: C.bad },
  btnTxt:            { fontSize: 14, fontWeight: "700" },
  btnTxtDefault:     { color: "#000000" },
  btnTxtCancel:      { color: C.ink3 },
  btnTxtDestructive: { color: C.bad },
});

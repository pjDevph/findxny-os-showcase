/**
 * ToastProvider — lightweight, auto-dismissing notification banner.
 *
 * Replaces single-button (info-only) Alert.alert() calls across the app —
 * "Saved", "Something went wrong", "Copied to clipboard", etc. Anything that
 * requires the user to make a decision belongs in AppAlertProvider instead.
 *
 * Usage:
 *   const { showToast } = useToast();
 *   showToast({ message: "Product saved" });
 *   showToast({ title: "Order failed", message: err.message, type: "error" });
 */
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";

export type ToastType = "success" | "error" | "info";

export interface ToastOptions {
  title?:    string;
  message:   string;
  type?:     ToastType;
  /** ms before auto-dismiss. Defaults: error 4200, success/info 2800. */
  duration?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  showToast: (opts: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastType, keyof typeof Feather.glyphMap> = {
  success: "check-circle",
  error:   "alert-circle",
  info:    "info",
};

export function ToastProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setToast(null);
    });
  }, [opacity]);

  const showToast = useCallback((opts: ToastOptions) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const id = ++idRef.current;
    setToast({ id, ...opts });
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const duration = opts.duration ?? (opts.type === "error" ? 4200 : 2800);
    timerRef.current = setTimeout(() => {
      if (idRef.current === id) dismiss();
    }, duration);
  }, [opacity, dismiss]);

  const type = toast?.type ?? "info";
  const tint = type === "error" ? C.bad : type === "success" ? C.good : C.info;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* A plain absolutely-positioned overlay would render behind any open
          RN <Modal> — Modals mount in their own native window, so sibling
          Views in the JS tree can't stack above them. Rendering the toast
          inside its own transparent Modal lets it appear above other modals
          (e.g. a validation-error toast fired while a create/edit form is open). */}
      <Modal
        visible={!!toast}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={dismiss}
      >
        <Animated.View
          pointerEvents="box-none"
          style={[styles.wrap, { top: insets.top + 8, opacity }]}
        >
          {toast && (
            <View style={[styles.toast, { backgroundColor: C.bg2, borderColor: tint }]}>
              <Feather name={ICONS[type]} size={16} color={tint} />
              <View style={styles.textWrap}>
                {toast.title && <Text style={[styles.title, { color: C.ink }]}>{toast.title}</Text>}
                <Text style={[styles.message, { color: C.ink3 }]}>{toast.message}</Text>
              </View>
              <Pressable onPress={dismiss} hitSlop={8}>
                <Feather name="x" size={16} color={C.ink4} />
              </Pressable>
            </View>
          )}
        </Animated.View>
      </Modal>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() must be used within ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute", left: 0, right: 0,
    alignItems: "center", zIndex: 1000, paddingHorizontal: 16,
  },
  toast: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    maxWidth: 480, width: "100%",
    borderRadius: R.lg, borderWidth: 1,
    paddingVertical: 12, paddingHorizontal: 14,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  textWrap: { flex: 1, gap: 2 },
  title:    { fontSize: 13, fontWeight: "700" },
  message:  { fontSize: 12.5, fontWeight: "500", lineHeight: 17 },
});

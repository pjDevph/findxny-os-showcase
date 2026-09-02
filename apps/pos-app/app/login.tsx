import { useState, useMemo, useEffect, useRef } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  Platform, Modal, Image, ScrollView, Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { useAuth, DEVICE_WORKSPACE_KEY } from "../features/auth/AuthContext";
import { R } from "../features/theme/tokens";
import { useTheme } from "../features/theme/ThemeContext";
import { authAttempt, formatLockoutMessage } from "../services/authAttempts";
import { KeyboardAwareScrollView, KeyboardAwareScrollViewHandle } from "../features/ui/KeyboardAwareScrollView";
import { PinInput } from "../features/ui/PinInput";

const MONO           = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
const SUPABASE_URL   = process.env.EXPO_PUBLIC_SUPABASE_URL   ?? "";
const SUPABASE_ANON  = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

interface StaffItem { username: string; full_name: string; role: string; }

async function posResolve(body: object): Promise<{ staff?: StaffItem[]; email?: string } | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/staff-login-resolve`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch { return null; }
}

function EyeIcon({ visible }: Readonly<{ visible: boolean }>) {
  const { C } = useTheme();
  return (
    <View style={{ alignItems: "center", justifyContent: "center", width: 40, height: 40 }}>
      {/* Outer ring */}
      <View style={{
        width: 20, height: 13, borderRadius: 10,
        borderWidth: 1.5, borderColor: C.ink3,
        alignItems: "center", justifyContent: "center",
      }}>
        {/* Pupil */}
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.ink3 }} />
      </View>
      {visible ? null : (
        /* Slash for "hidden" state */
        <View style={{
          position: "absolute", width: 1.5, height: 21,
          backgroundColor: C.ink3,
          transform: [{ rotate: "-45deg" }],
        }} />
      )}
    </View>
  );
}

// Quick visual confirmation of exactly what's running on a device — app
// version, the OTA channel it's tracking, and either "embedded" (shipped in
// the native build, no OTA applied yet) or the short id of the applied OTA
// update — without needing adb logcat to check whether an update landed.
function buildLabel(): string {
  const version = Constants.expoConfig?.version ?? "?";
  const channel = Updates.channel || "embedded";
  return channel === "production" ? `Version ${version}` : `Version ${version} · Development`;
}

function ErrorModal({ message, onClose }: Readonly<{ message: string; onClose: () => void }>) {
  const { C } = useTheme();
  const s = useMemo(() => makeModalStyles(C), [C]);
  return (
    <Modal transparent animationType="fade" visible={!!message} onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.iconWrap}>
            <Text style={s.iconText}>!</Text>
          </View>
          <Text style={s.title}>Sign In Failed</Text>
          <Text style={s.body}>{message}</Text>
          <Pressable style={s.okBtn} onPress={onClose}>
            <Text style={s.okText}>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function Login() {
  const { signIn } = useAuth();
  const { C, mode } = useTheme();
  const s = useMemo(() => makeStyles(C, mode), [C, mode]);
  const insets = useSafeAreaInsets();
  const [credential, setCredential] = useState("");
  const [password, setPassword]     = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [busy, setBusy]             = useState(false);
  const [errModal, setErrModal]     = useState("");
  const [deviceWorkspace, setDeviceWorkspace] = useState<string | null>(null);
  const [staffList, setStaffList]   = useState<StaffItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusedField, setFocusedField] = useState<"credential" | "password" | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const credentialRef = useRef<TextInput>(null);
  const pinRowRef = useRef<View>(null);
  const kbScrollRef = useRef<KeyboardAwareScrollViewHandle>(null);

  useEffect(() => {
    AsyncStorage.getItem(DEVICE_WORKSPACE_KEY).then((v) => setDeviceWorkspace(v)).catch(() => {});
  }, []);

  // Drives the compact keyboard-open layout (smaller card padding, hidden
  // footer) — separate from KeyboardAwareScrollView's own listener, which
  // only cares about scroll offset, not layout.
  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Load POS staff list for suggestions once workspace is known
  useEffect(() => {
    if (!deviceWorkspace) return;
    posResolve({ workspace_id: deviceWorkspace })
      .then(d => { if (Array.isArray(d?.staff)) setStaffList(d.staff); })
      .catch(() => {});
  }, [deviceWorkspace]);

  const isUsername = credential.length > 0 && !credential.includes("@");
  const isStaffLogin = isUsername && !!deviceWorkspace;

  const filteredStaff = staffList.filter(s => {
    if (!credential) return true;
    const q = credential.toLowerCase();
    return s.username.startsWith(q) || s.full_name.toLowerCase().includes(q);
  });

  async function resolveEmail(username: string, workspaceId: string): Promise<string> {
    const data = await posResolve({ workspace_id: workspaceId, username });
    if (data?.email) return data.email;
    // Fallback for POS-only staff if resolve fails (network down)
    return `${workspaceId}_${username}@staff.pos`;
  }

  async function onSubmit() {
    if (!credential || !password) return;
    setBusy(true);
    try {
      const email = isStaffLogin
        ? await resolveEmail(credential.toLowerCase().trim(), deviceWorkspace!)
        : credential.trim();

      // Brute-force lockout pre-check.
      const pre = await authAttempt(email, "check");
      if (pre.locked) {
        setErrModal(formatLockoutMessage(pre));
        return;
      }
      try {
        await signIn(email, password);
        await authAttempt(email, "success");
      } catch (e: any) {
        const post = await authAttempt(email, "failure");
        if (post.locked) {
          setErrModal(formatLockoutMessage(post));
          return;
        }
        const msg: string = e?.message ?? "Sign in failed";
        const lower = msg.toLowerCase();
        let friendly = "We couldn't sign you in. Check your username and password and try again.";
        if (lower.includes("invalid") || lower.includes("credentials")) {
          friendly = isStaffLogin
            ? "Incorrect username or PIN. Please try again."
            : "Incorrect email or password. Please try again.";
        } else if (lower.includes("not found") || lower.includes("no user")) {
          friendly = "No account found. Check your username and try again.";
        } else if (lower.includes("network") || lower.includes("fetch")) {
          friendly = "Can't reach the server. Check your connection and try again.";
        }
        setErrModal(friendly);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[s.root, s.split]}>
      {/* Left: branding panel */}
      <View style={[s.brandPanel, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingLeft: insets.left + 40, paddingRight: 24 }]}>
        <View style={s.brandContent}>
          <View style={s.logoMark}>
            <Image
              source={require("../assets/logo/FindXnY_logo_transparent_white.png")}
              style={s.logoIcon}
              resizeMode="contain"
            />
          </View>
          <Text style={s.brandName}>FINDXNY</Text>
          <Text style={s.brandSub}>Staff Point of Sale</Text>
          <Text style={s.brandDesc}>Secure access for authorized staff.</Text>
        </View>
        {!keyboardVisible && <Text style={s.brandBuildTag}>{buildLabel()}</Text>}
      </View>

      {/* Right: sign-in form */}
      <KeyboardAwareScrollView ref={kbScrollRef} style={s.formPanel} contentContainerStyle={[s.center, { justifyContent: keyboardVisible ? "flex-start" : "center", paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24, paddingRight: insets.right + 24 }]}>
      <View style={[s.formGroup, !keyboardVisible && s.formGroupCentered]}>
        <View style={[s.card, keyboardVisible && s.cardCompact]}>
          <View style={s.cardHeader}>
            <Text style={s.cardHeading}>Welcome back</Text>
            <Text style={s.cardSubheading}>Sign in to your staff account</Text>
          </View>

          {/* Email or Username */}
          <View style={[s.fieldWrap, s.credentialWrap]}>
            <Text style={s.label}>Email or Username</Text>
            <TextInput
              ref={credentialRef}
              style={[s.input, focusedField === "credential" && s.inputFocused]}
              placeholder={deviceWorkspace ? "email or username" : "staff@example.com"}
              placeholderTextColor={C.ink4}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              value={credential}
              onChangeText={v => { setCredential(v); setShowSuggestions(true); }}
              onFocus={() => { setFocusedField("credential"); setShowSuggestions(true); kbScrollRef.current?.scrollToFocusedInput(credentialRef); }}
              onBlur={() => { setFocusedField(f => f === "credential" ? null : f); setTimeout(() => setShowSuggestions(false), 150); }}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />

            {/* Staff suggestions — floats over the fields below instead of
                pushing them down, so the layout stays put with 10+ staff. */}
            {showSuggestions && deviceWorkspace && filteredStaff.length > 0 && (
              <View style={s.suggestBox}>
                <ScrollView style={{ maxHeight: 264 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {filteredStaff.map(item => (
                    <Pressable
                      key={item.username}
                      style={({ pressed }) => [s.suggestRow, pressed && { opacity: 0.7 }]}
                      onPress={() => {
                        setCredential(item.username);
                        setShowSuggestions(false);
                        setTimeout(() => passwordRef.current?.focus(), 50);
                      }}
                    >
                      <View style={s.suggestAvatar}>
                        <Text style={s.suggestAvatarText}>
                          {(item.full_name || item.username)[0].toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.suggestName}>{item.full_name || item.username}</Text>
                        <Text style={s.suggestMeta}>@{item.username} · {item.role}</Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Password / PIN */}
          <View style={s.fieldWrap}>
            <Text style={s.label}>{isStaffLogin ? "PIN" : "Password"}</Text>
            {isStaffLogin ? (
              <View style={s.pinRow} ref={pinRowRef}>
                <PinInput
                  length={6}
                  value={password}
                  onChange={setPassword}
                  secure={!showPw}
                  onSubmitEditing={onSubmit}
                  onFocus={() => kbScrollRef.current?.scrollToFocusedInput(pinRowRef)}
                />
                <Pressable style={s.pinEyeBtn} onPress={() => setShowPw(v => !v)} hitSlop={12}>
                  <EyeIcon visible={showPw} />
                </Pressable>
              </View>
            ) : (
              <View style={s.inputWrap}>
                <TextInput
                  ref={passwordRef}
                  style={[s.input, s.inputWithEye, focusedField === "password" && s.inputFocused]}
                  placeholder="••••••••"
                  placeholderTextColor={C.ink4}
                  secureTextEntry={!showPw}
                  autoComplete="current-password"
                  value={password}
                  onChangeText={setPassword}
                  returnKeyType="done"
                  onSubmitEditing={onSubmit}
                  onFocus={() => { setFocusedField("password"); kbScrollRef.current?.scrollToFocusedInput(passwordRef); }}
                  onBlur={() => setFocusedField(f => f === "password" ? null : f)}
                />
                <Pressable
                  style={s.eyeBtn}
                  onPress={() => setShowPw(v => !v)}
                  hitSlop={12}
                >
                  <EyeIcon visible={showPw} />
                </Pressable>
              </View>
            )}
          </View>

          <Pressable
            style={({ pressed }) => [
              s.btn,
              pressed && s.btnPressed,
              (busy || !credential || !password) && s.btnDisabled,
            ]}
            onPress={onSubmit}
            disabled={busy || !credential || !password}
          >
            <Text style={[s.btnText, (busy || !credential || !password) && s.btnTextDisabled]}>
              {busy ? "Signing in…" : "Sign in"}
            </Text>
          </Pressable>
        </View>

        {!keyboardVisible && (
          <Text style={s.footer}>FINDXNY Staff POS · Authorized personnel only</Text>
        )}
      </View>
      </KeyboardAwareScrollView>

      <ErrorModal message={errModal} onClose={() => setErrModal("")} />
    </View>
  );
}

type C = ReturnType<typeof useTheme>["C"];
type Mode = ReturnType<typeof useTheme>["mode"];

const makeStyles = (C: C, mode: Mode) => {
  // Light mode: a plainly white card reads cleanest on an off-white page, so
  // inputs match the card (bordered, not filled) instead of looking disabled.
  // Dark mode: keep the pre-existing convention of a lighter, recessed card
  // on a pure-black page, with inputs sunk back to page-black.
  const pageBg  = mode === "dark" ? C.bg : C.bg2;
  const cardBg  = mode === "dark" ? C.surface : C.bg;
  const inputBg = C.bg;

  return StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  split:  { flexDirection: "row" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 24 },

  brandPanel: {
    width: "40%", minWidth: 280,
    backgroundColor: "#111111",
    alignItems: "flex-start", justifyContent: "space-between",
  },
  brandContent: { flex: 1, justifyContent: "center", alignItems: "flex-start", paddingBottom: 50 },
  formPanel: { width: "60%", backgroundColor: pageBg },
  formGroup: { width: "100%", alignItems: "center", gap: 24 },
  formGroupCentered: { marginTop: 70 },
  logoMark: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 18,
  },
  logoIcon:  { width: 40, height: 40 },
  brandName: { color: "#fff", fontSize: 26, fontWeight: "700", letterSpacing: 0.3 },
  brandSub:  { color: "rgba(255,255,255,0.72)", fontSize: 14, letterSpacing: 0.4, marginTop: 9 },
  brandDesc: { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 15, maxWidth: 240 },
  brandBuildTag: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11, fontFamily: MONO,
    marginBottom: 4,
  },

  card: {
    width: "100%", maxWidth: 440,
    backgroundColor: cardBg, borderRadius: R.xl,
    borderWidth: 1, borderColor: C.line,
    padding: 26, gap: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 30,
    elevation: 6,
  },
  cardCompact: { padding: 20, gap: 12 },
  cardHeader:     { gap: 4 },
  cardHeading:    { color: C.ink, fontSize: 24, fontWeight: "600" },
  cardSubheading: { color: C.ink3, fontSize: 14 },

  fieldWrap: { gap: 6 },
  credentialWrap: { position: "relative", zIndex: 20 },
  label: { color: mode === "dark" ? C.ink3 : "#555555", fontSize: 13, letterSpacing: 0.2, fontWeight: "500" },
  input: {
    backgroundColor: inputBg, borderRadius: R.md,
    borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 16, paddingVertical: 17,
    color: C.ink, fontSize: 16,
  },
  inputFocused: {
    borderColor: mode === "dark" ? "#e5e5e5" : "#181818", borderWidth: 1.5,
    shadowColor: "#000", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.06, shadowRadius: 4,
  },
  inputWrap: { position: "relative" },
  inputWithEye: { paddingRight: 54 },
  eyeBtn: {
    position: "absolute", right: 6, top: 0, bottom: 0,
    justifyContent: "center", alignItems: "center",
  },
  pinRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pinEyeBtn: { padding: 8 },

  suggestBox: {
    position: "absolute", top: "100%", left: 0, right: 0, marginTop: 6,
    borderWidth: 1, borderColor: C.line, borderRadius: R.md,
    backgroundColor: C.surface, overflow: "hidden",
    maxHeight: 264,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10,
    elevation: 8,
    zIndex: 20,
  },
  suggestRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  suggestAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.rust,
    alignItems: "center", justifyContent: "center",
  },
  suggestAvatarText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  suggestName: { color: C.ink, fontSize: 14, fontWeight: "600" },
  suggestMeta: { color: C.ink3, fontSize: 11, marginTop: 1 },

  btn: {
    padding: 17, borderRadius: R.md, alignItems: "center",
    backgroundColor: "#111111", marginTop: 2,
    borderWidth: 1, borderColor: "transparent",
  },
  btnPressed:  { backgroundColor: "#2b2b2b" },
  btnDisabled: { backgroundColor: mode === "dark" ? "#2b2b2b" : "#e2e2e2", borderColor: "transparent" },
  btnText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  btnTextDisabled: { color: mode === "dark" ? "#8a8a8a" : "#888888" },

  footer: {
    textAlign: "center", color: mode === "dark" ? C.ink3 : "#777777",
    fontSize: 12, letterSpacing: 0.2,
  },
  });
};

const makeModalStyles = (C: C) => StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center",
    padding: 32,
  },
  sheet: {
    width: "100%", maxWidth: 340,
    backgroundColor: C.surface, borderRadius: R.xl,
    borderWidth: 1, borderColor: "rgba(192,56,56,0.3)",
    padding: 28, alignItems: "center", gap: 12,
  },
  iconWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: C.badBg,
    borderWidth: 1, borderColor: "rgba(192,56,56,0.4)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 4,
  },
  iconText:  { color: C.bad, fontSize: 26, fontWeight: "800" },
  title:     { color: C.ink, fontSize: 17, fontWeight: "700" },
  body:      { color: C.ink2, fontSize: 14, textAlign: "center", lineHeight: 20 },
  okBtn: {
    marginTop: 6, width: "100%",
    padding: 13, borderRadius: R.md, alignItems: "center",
    backgroundColor: C.bad,
  },
  okText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});

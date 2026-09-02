/**
 * ManagerApprovalModal — shared-code sign-off for protected POS actions
 * (large discounts, void order, cancel in-prep order, cancel item).
 *
 * Flow:
 *  1. Caller invokes `createApproval()` (manager-approval-create) and gets an approval_id.
 *  2. This modal collects the workspace's shared approval code and calls
 *     `verifyApproval()` (manager-approval-verify) in one shot — no separate
 *     "request" step visible to UI. The code itself is the authority (set by
 *     an owner/admin in Settings), so there's no specific person to look up.
 *  3. On success the caller receives the approval_id to attach to the next action.
 *  4. 3 consecutive failures → 30-second lockout countdown before retrying.
 *  5. Code is cleared from state immediately after the verify call resolves.
 *
 * Props:
 *  visible       — controls Modal visibility
 *  approvalId    — the approval record ID returned by manager-approval-create
 *  actionLabel   — short description shown in the header ("Void Order", "Refund", …)
 *  onApproved    — called with approvalId when the code is accepted
 *  onRejected    — called with a human-readable reason when the code is wrong
 *  onClose       — called when the user taps Cancel or the backdrop
 */
import {
  Modal, View, Text, Pressable, StyleSheet, TextInput,
  ActivityIndicator,
} from "react-native";
import { useState, useEffect, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { R } from "../../theme/tokens";
import { invokeFn } from "../../../services/supabase";
import { useAuth } from "../../auth/AuthContext";
import { KeyboardSheet } from "../../ui/KeyboardSheet";
import { ApprovalCodeField } from "./ApprovalCodeField";

const MAX_FAILURES   = 3;
const LOCKOUT_SECS   = 30;

interface Props {
  readonly visible:     boolean;
  readonly approvalId:  string | null;
  readonly actionLabel: string;
  readonly onApproved:  (approvalId: string) => void;
  readonly onRejected:  (reason: string) => void;
  readonly onClose:     () => void;
}

export function ManagerApprovalModal({
  visible, approvalId, actionLabel, onApproved, onRejected, onClose,
}: Props) {
  const { C } = useTheme();
  const { activeWorkspaceId } = useAuth();
  const s = makeStyles(C);
  const insets = useSafeAreaInsets();

  const [code,      setCode]      = useState("");
  const [loading,   setLoading]   = useState(false);
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);
  const [failures,  setFailures]  = useState(0);
  const [lockout,   setLockout]   = useState(0); // seconds remaining
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const codeRef  = useRef<TextInput>(null);

  // Reset form each time modal opens
  useEffect(() => {
    if (visible) {
      setCode("");
      setLoading(false);
      setErrorMsg(null);
      setFailures(0);
      setLockout(0);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  }, [visible]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function startLockout() {
    setLockout(LOCKOUT_SECS);
    timerRef.current = setInterval(() => {
      setLockout(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          setFailures(0);
          setErrorMsg(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleVerify() {
    if (!approvalId || !activeWorkspaceId || lockout > 0) return;
    const trimCode = code.trim();
    if (!trimCode) {
      setErrorMsg("Enter the approval code.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    // Clear the code from state immediately — don't leave it in memory after submit
    setCode("");

    try {
      const { data, error } = await invokeFn<{
        approval: { id: string } | null;
        status:   string;
        message?: string;
      }>("manager-approval-verify", {
        workspace_id:  activeWorkspaceId,
        approval_id:   approvalId,
        action:        "approve",
        override_code: trimCode,
      });

      if (error) {
        // Network / server error (5xx etc.) — count as a failure
        const nextFails = failures + 1;
        setFailures(nextFails);
        if (nextFails >= MAX_FAILURES) {
          startLockout();
          setErrorMsg(`Too many failed attempts. Wait ${LOCKOUT_SECS}s.`);
        } else {
          setErrorMsg(error.message ?? "Verification failed. Try again.");
        }
        return;
      }

      if (data?.status === "approved" && data.approval?.id) {
        onApproved(data.approval.id);
      } else {
        // Wrong code / no code configured
        const reason = data?.message ?? "Approval rejected.";
        const nextFails = failures + 1;
        setFailures(nextFails);
        if (nextFails >= MAX_FAILURES) {
          startLockout();
          setErrorMsg(`Too many failed attempts. Wait ${LOCKOUT_SECS}s.`);
        } else {
          setErrorMsg(`${reason} (${MAX_FAILURES - nextFails} attempt${MAX_FAILURES - nextFails === 1 ? "" : "s"} left)`);
          onRejected(reason);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  const isLocked  = lockout > 0;
  const canSubmit = !isLocked && !loading && code.trim().length > 0;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardSheet style={s.backdrop} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.sheet}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <Feather name="shield" size={16} color={C.amber} />
              <Text style={s.title}>Manager Approval</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} disabled={loading}>
              <Feather name="x" size={18} color={C.ink3} />
            </Pressable>
          </View>

          {/* Body */}
          <View style={s.body}>
            <Text style={s.actionLabel}>{actionLabel}</Text>
            <Text style={s.hint}>
              Enter the shared approval code to authorise this action.
            </Text>

            <ApprovalCodeField
              code={code}
              onCodeChange={setCode}
              disabled={isLocked || loading}
              codeRef={codeRef}
              onSubmitCode={() => { if (canSubmit) handleVerify().catch(console.error); }}
            />

            {/* Error / lockout */}
            {isLocked && (
              <View style={s.lockoutBox}>
                <Feather name="lock" size={13} color={C.bad} />
                <Text style={s.lockoutText}>
                  Too many failures — retry in {lockout}s
                </Text>
              </View>
            )}
            {!isLocked && errorMsg && (
              <Text style={s.errorText}>{errorMsg}</Text>
            )}
          </View>

          {/* Footer */}
          <View style={[s.footer, { paddingBottom: 16 + insets.bottom }]}>
            <Pressable style={s.cancelBtn} onPress={onClose} disabled={loading}>
              <Text style={s.cancelBtnTxt}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[s.approveBtn, !canSubmit && s.approveBtnDisabled]}
              onPress={() => { handleVerify().catch(console.error); }}
              disabled={!canSubmit}
            >
              {loading
                ? <ActivityIndicator size="small" color="#000000" />
                : <Text style={s.approveBtnTxt}>Approve</Text>
              }
            </Pressable>
          </View>
        </View>
      </KeyboardSheet>
    </Modal>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center", alignItems: "center", padding: 24,
  },
  sheet: {
    backgroundColor: C.bg2, borderRadius: R.xl,
    width: "100%", maxWidth: 400, overflow: "hidden",
  },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  title:      { color: C.ink, fontSize: 15, fontWeight: "700" },

  body: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4, gap: 10 },

  actionLabel: {
    color: C.amber, fontSize: 13, fontWeight: "700",
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  hint: { color: C.ink3, fontSize: 12, lineHeight: 17, marginBottom: 4 },

  lockoutBox: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: C.badBg, borderRadius: R.md, padding: 10,
  },
  lockoutText: { color: C.bad, fontSize: 12, fontWeight: "600", flex: 1 },
  errorText:   { color: C.bad, fontSize: 12, fontWeight: "500" },

  footer: {
    flexDirection: "row", gap: 10,
    padding: 16, borderTopWidth: 1, borderTopColor: C.line, marginTop: 10,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: R.lg, alignItems: "center",
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
  },
  cancelBtnTxt: { color: C.ink3, fontSize: 14, fontWeight: "600" },

  approveBtn: {
    flex: 2, paddingVertical: 13, borderRadius: R.lg, alignItems: "center",
    backgroundColor: C.amber,
  },
  approveBtnDisabled: { opacity: 0.4 },
  approveBtnTxt: { color: "#000000", fontSize: 15, fontWeight: "700" },
});

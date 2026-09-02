/**
 * RefundModal — refund amount, reason, and (when the current user isn't
 * admin/owner) the shared workspace approval code, all in one sheet.
 * Previously this was two modals (RefundAmountModal → ManagerApprovalModal)
 * chained together; this collapses that into a single submit that runs
 * manager-approval-create → manager-approval-verify → refunds-create back to
 * back, closing only once the refund itself has actually gone through.
 *
 * Admin/owner self-approve on their own session (no code section shown at
 * all); everyone else (manager, cashier) must supply the shared approval
 * code set by an owner/admin in Settings — 3-strike / 30s lockout.
 */
import {
  Modal, View, Text, TextInput, Pressable, StyleSheet, Platform, ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useEffect, useRef } from "react";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { R } from "../../theme/tokens";
import { invokeFn } from "../../../services/supabase";
import { KeyboardSheet } from "../../ui/KeyboardSheet";
import { ApprovalCodeField } from "./ApprovalCodeField";
import { sanitizeMoney } from "../../utils/inputSanitizers";

const MAX_FAILURES = 3;
const LOCKOUT_SECS = 30;

interface Props {
  readonly visible:        boolean;
  readonly workspaceId:    string | null;
  readonly branchId:       string | null;
  readonly orderId:        string;
  readonly orderNo:        string;
  readonly paymentId:      string;
  readonly paidAmount:     number;
  readonly isSelfApprover: boolean;
  readonly onClose:        () => void;
  readonly onSuccess:      (amountRefunded: number) => void;
}

const MONO = Platform.select({ ios: "Courier New", android: "monospace", default: "monospace" });
const peso = (n: number) => `₱${n.toFixed(2)}`;

export function RefundModal({
  visible, workspaceId, branchId, orderId, orderNo, paymentId, paidAmount,
  isSelfApprover, onClose, onSuccess,
}: Props) {
  const { C } = useTheme();
  const s = makeStyles(C);
  const insets = useSafeAreaInsets();

  const [amount,   setAmount]   = useState("");
  const [reason,   setReason]   = useState("");
  const [code,     setCode]     = useState("");
  const [loading,  setLoading]  = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const [lockout,  setLockout]  = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const codeRef   = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setAmount(paidAmount > 0 ? paidAmount.toFixed(2) : "");
      setReason("");
      setCode("");
      setLoading(false);
      setErrorMsg(null);
      setFailures(0);
      setLockout(0);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  }, [visible, paidAmount]);

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

  const isLocked = lockout > 0;
  const parsedAmount = parseFloat(amount);
  const amountValid = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= paidAmount;
  const reasonValid = reason.trim().length >= 3;
  const credentialsValid = isSelfApprover || code.trim().length > 0;
  const canSubmit = !isLocked && !loading && amountValid && reasonValid && credentialsValid;

  async function handleSubmit() {
    if (!canSubmit) return;
    if (!workspaceId || !branchId) {
      // Real gap: silently doing nothing here left the modal looking
      // "stuck" with no loading state, no error, nothing — this must
      // always give visible feedback instead of a silent no-op.
      setErrorMsg("Missing workspace/branch context — close this and reopen the order.");
      return;
    }
    const finalAmount = +parsedAmount.toFixed(2);
    const finalReason = reason.trim();
    const trimCode = code.trim();

    setLoading(true);
    setErrorMsg(null);
    setCode(""); // don't leave the code in state any longer than needed

    function fail(message: string) {
      if (isSelfApprover) {
        // Not a brute-forceable code attempt — just surface the error, no lockout.
        setErrorMsg(message);
        return;
      }
      const nextFails = failures + 1;
      setFailures(nextFails);
      if (nextFails >= MAX_FAILURES) {
        startLockout();
        setErrorMsg(`Too many failed attempts. Wait ${LOCKOUT_SECS}s.`);
      } else {
        setErrorMsg(`${message} (${MAX_FAILURES - nextFails} attempt${MAX_FAILURES - nextFails === 1 ? "" : "s"} left)`);
      }
    }

    try {
      const { data: apData, error: apErr } = await invokeFn<{ approval: { id: string } }>("manager-approval-create", {
        workspace_id: workspaceId, branch_id: branchId,
        action_type: "refund", target_type: "order", target_id: orderId,
        reason: finalReason || "Manager-initiated refund",
      });
      if (apErr || !apData?.approval?.id) {
        setErrorMsg(apErr?.message ?? "Could not start the approval.");
        return;
      }
      const approvalId = apData.approval.id;

      const { data: vData, error: vErr } = await invokeFn<{
        approval: { id: string; status: string } | null;
        status?: string;
        message?: string;
      }>("manager-approval-verify", {
        workspace_id: workspaceId,
        approval_id:  approvalId,
        action:       "approve",
        ...(isSelfApprover ? {} : { override_code: trimCode }),
      });
      if (vErr) { fail(vErr.message ?? "Verification failed. Try again."); return; }
      if (vData?.status !== "approved" || !vData.approval?.id) {
        fail(vData?.message ?? "Approval rejected.");
        return;
      }

      const { error: rErr } = await invokeFn("refunds-create", {
        workspace_id: workspaceId, branch_id: branchId,
        payment_id: paymentId, amount: finalAmount,
        reason: finalReason || "Manager-approved refund",
        manager_approval_id: vData.approval.id,
      });
      if (rErr) { setErrorMsg(rErr.message ?? "Refund failed. Try again."); return; }

      onSuccess(finalAmount);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardSheet style={s.backdrop} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.sheet}>
          {/* Header */}
          <View style={s.header}>
            <Text style={s.title}>Refund {orderNo ? `#${orderNo}` : "Order"}</Text>
            <Pressable onPress={onClose} hitSlop={8} disabled={loading}>
              <Feather name="x" size={18} color={C.ink3} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            <Text style={s.paidLine}>Amount paid: <Text style={{ color: C.ink }}>{peso(paidAmount)}</Text></Text>

            {/* Amount */}
            <Text style={s.label}>REFUND AMOUNT <Text style={{ color: C.bad }}>*</Text></Text>
            <TextInput
              style={[s.input, s.amountInput]}
              placeholder="0.00"
              placeholderTextColor={C.ink4}
              value={amount}
              onChangeText={v => setAmount(sanitizeMoney(v))}
              keyboardType="decimal-pad"
              maxLength={12}
              editable={!loading}
            />
            {!amountValid && amount.length > 0 && (
              <Text style={s.errText}>Enter an amount between ₱0.01 and {peso(paidAmount)}.</Text>
            )}

            {/* Reason */}
            <Text style={s.label}>REASON <Text style={{ color: C.bad }}>*</Text></Text>
            <TextInput
              style={[s.input, s.reasonInput]}
              placeholder="Why is this being refunded?"
              placeholderTextColor={C.ink4}
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={200}
              editable={!loading}
            />

            {/* Approval — skipped entirely for self-approvers (admin/owner),
                who authorize via their own session. */}
            {!isSelfApprover && (
              <>
                <View style={s.divider} />
                <Text style={s.approvalHint}>
                  Enter the shared approval code to authorise this refund.
                </Text>
                <ApprovalCodeField
                  code={code}
                  onCodeChange={setCode}
                  disabled={isLocked || loading}
                  codeRef={codeRef}
                  onSubmitCode={() => { if (canSubmit) handleSubmit().catch(console.error); }}
                />
              </>
            )}
          </ScrollView>

          {/* Error / lockout — deliberately OUTSIDE the ScrollView, not after
              the approval field inside it. A message down in scrollable
              content that's already pushed below the fold reads as "nothing
              happened" when it's actually sitting there unseen. */}
          {isLocked && (
            <View style={[s.lockoutBox, { marginHorizontal: 20 }]}>
              <Feather name="lock" size={13} color={C.bad} />
              <Text style={s.lockoutText}>Too many failures — retry in {lockout}s</Text>
            </View>
          )}
          {!isLocked && errorMsg && (
            <Text style={[s.errText, { marginHorizontal: 20, marginTop: 8 }]}>{errorMsg}</Text>
          )}

          {/* Footer */}
          <View style={[s.footer, { paddingBottom: 16 + insets.bottom }]}>
            <Pressable style={s.cancelBtn} onPress={onClose} disabled={loading}>
              <Text style={s.cancelBtnTxt}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[s.confirmBtn, !canSubmit && { opacity: 0.6 }]}
              onPress={() => { handleSubmit().catch(console.error); }}
              disabled={!canSubmit}
            >
              {loading
                ? <ActivityIndicator size="small" color="#000000" />
                : <Text style={s.confirmBtnTxt}>
                    {isSelfApprover ? "Refund" : "Approve & Refund"}{amountValid ? `  ·  ${peso(parsedAmount)}` : ""}
                  </Text>
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
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center", alignItems: "center", padding: 24,
  },
  sheet: {
    backgroundColor: C.bg2, borderRadius: R.xl,
    width: "100%", maxWidth: 480, maxHeight: "88%", overflow: "hidden",
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  title: { color: C.ink, fontSize: 16, fontWeight: "700" },
  body:  { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 10 },

  paidLine: { color: C.ink3, fontSize: 13, marginBottom: 4 },

  label: {
    color: C.ink4, fontSize: 9, fontFamily: MONO,
    letterSpacing: 1, textTransform: "uppercase",
  },
  input: {
    backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 14, paddingVertical: 12, color: C.ink, fontSize: 14,
  },
  amountInput: {
    fontSize: 24, fontWeight: "700", fontFamily: MONO, textAlign: "right", color: C.amber,
  },
  reasonInput: { minHeight: 64, textAlignVertical: "top" },
  errText: { color: C.bad, fontSize: 11, marginTop: -4 },

  divider: { height: 1, backgroundColor: C.line, marginVertical: 4 },
  approvalHint: { color: C.ink3, fontSize: 12, lineHeight: 17, marginTop: -4 },

  lockoutBox: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: C.badBg, borderRadius: R.md, padding: 10,
  },
  lockoutText: { color: C.bad, fontSize: 12, fontWeight: "600", flex: 1 },

  footer: {
    flexDirection: "row", gap: 10,
    padding: 16, borderTopWidth: 1, borderTopColor: C.line,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: R.lg, alignItems: "center",
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
  },
  cancelBtnTxt: { color: C.ink3, fontSize: 14, fontWeight: "600" },
  confirmBtn: {
    flex: 2, paddingVertical: 13, borderRadius: R.lg, alignItems: "center",
    backgroundColor: C.amber,
  },
  confirmBtnTxt: { color: "#000000", fontSize: 15, fontWeight: "700" },
});

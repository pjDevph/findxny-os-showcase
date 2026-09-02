/**
 * ApprovalCodeField — single shared-code input for manager-approval-gated
 * actions (refund, void order, cancel item). Replaces the old
 * username+PIN flow (ManagerCredentialFields): the workspace's shared
 * "manager override code" (set by an owner/admin in Settings) IS the
 * authority now, so there's no specific person to look up or autocomplete —
 * just one field.
 */
import { View, Text, TextInput, StyleSheet, Platform } from "react-native";
import type { RefObject } from "react";
import { useTheme } from "../../theme/ThemeContext";
import { R } from "../../theme/tokens";

interface Props {
  readonly code:         string;
  readonly onCodeChange: (v: string) => void;
  readonly disabled:     boolean;
  readonly codeRef:      RefObject<TextInput | null>;
  readonly onSubmitCode: () => void;
}

export function ApprovalCodeField({ code, onCodeChange, disabled, codeRef, onSubmitCode }: Props) {
  const { C } = useTheme();
  const s = makeStyles(C);

  return (
    <>
      <Text style={s.fieldLabel}>APPROVAL CODE <Text style={s.required}>*</Text></Text>
      <TextInput
        ref={codeRef}
        style={[s.input, disabled && s.inputDisabled]}
        placeholder="Enter the shared approval code"
        placeholderTextColor={C.ink4}
        value={code}
        onChangeText={t => onCodeChange(t.replace(/\s/g, "").slice(0, 32))}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        returnKeyType="done"
        onSubmitEditing={onSubmitCode}
        editable={!disabled}
      />
    </>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  fieldLabel: {
    color: C.ink4, fontSize: 9,
    fontFamily: Platform.select({ ios: "Courier", android: "monospace", default: "monospace" }),
    letterSpacing: 1, textTransform: "uppercase",
  },
  required: { color: C.bad },
  input: {
    backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 14, paddingVertical: 12, color: C.ink, fontSize: 16, letterSpacing: 2,
  },
  inputDisabled: { opacity: 0.6 },
});

import { View, Text, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { SectionLabel, Card, Field } from "../SettingsCard";
import type { makeStyles } from "../settingsScreenStyles";
import type { useApprovalCode } from "../useApprovalCode";

interface Props {
  readonly approvalApi: ReturnType<typeof useApprovalCode>;
  readonly s: ReturnType<typeof makeStyles>;
}

export function ApprovalSection({ approvalApi, s }: Props) {
  const { C } = useTheme();
  const {
    hasApprovalCode, approvalCodeLoading, newApprovalCode, setNewApprovalCode,
    savingApprovalCode, saveApprovalCode, clearApprovalCode,
  } = approvalApi;

  return (
    <>
      <SectionLabel label="Approval Code" />
      <Card>
        <Text style={s.helpNote}>
          Shared code managers and cashiers enter to authorise refunds, void orders, and
          item cancellations — replaces needing a second named manager account on hand.
          Owners and admins never need it; they approve with their own login.
        </Text>

        {approvalCodeLoading ? (
          <ActivityIndicator color={C.amber} />
        ) : (
          <>
            <View style={[
              s.noEditBanner,
              hasApprovalCode
                ? { borderColor: `${C.good}55`, backgroundColor: `${C.good}10` }
                : { borderColor: `${C.amber}55`, backgroundColor: `${C.amber}10` },
            ]}>
              <Feather name={hasApprovalCode ? "check-circle" : "alert-circle"} size={13} color={hasApprovalCode ? C.good : C.amber} />
              <Text style={[s.noEditTxt, { color: hasApprovalCode ? C.good : C.amber }]}>
                {hasApprovalCode ? "A code is set." : "No code set yet — approvals will fail until one is set."}
              </Text>
            </View>

            <Field label={hasApprovalCode ? "New Code (replaces the current one)" : "Set Code"}>
              <TextInput
                style={s.input}
                value={newApprovalCode}
                onChangeText={setNewApprovalCode}
                placeholder="4-12 letters or numbers"
                placeholderTextColor={C.ink4}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={12}
              />
              <Text style={s.fieldDesc}>Share this verbally with on-duty staff. It's never shown again once saved.</Text>
            </Field>

            <Pressable
              style={[s.printerNavBtn, (!newApprovalCode.trim() || savingApprovalCode) && { opacity: 0.5 }]}
              onPress={saveApprovalCode}
              disabled={!newApprovalCode.trim() || savingApprovalCode}
            >
              {savingApprovalCode
                ? <ActivityIndicator size="small" color={C.amber} />
                : <>
                  <Feather name="check" size={16} color={C.amber} />
                  <Text style={s.printerNavBtnTxt}>{hasApprovalCode ? "Update Code" : "Set Code"}</Text>
                </>
              }
            </Pressable>

            {hasApprovalCode && (
              <Pressable
                style={[s.printerNavBtn, { borderColor: `${C.bad}55`, backgroundColor: `${C.bad}14` }, savingApprovalCode && { opacity: 0.5 }]}
                onPress={clearApprovalCode}
                disabled={savingApprovalCode}
              >
                <Feather name="x-circle" size={16} color={C.bad} />
                <Text style={[s.printerNavBtnTxt, { color: C.bad }]}>Clear Code</Text>
              </Pressable>
            )}
          </>
        )}
      </Card>
    </>
  );
}

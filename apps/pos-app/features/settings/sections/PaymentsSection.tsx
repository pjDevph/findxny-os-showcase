import { View, TextInput } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { sanitizePhone } from "../../utils/inputSanitizers";
import { SectionLabel } from "../SettingsCard";
import { PayAccordion } from "../PayAccordion";
import { QrInput } from "../QrInput";
import type { makeStyles } from "../settingsScreenStyles";
import type { useWorkspaceSettings } from "../useWorkspaceSettings";

interface Props {
  readonly settings: ReturnType<typeof useWorkspaceSettings>;
  readonly s: ReturnType<typeof makeStyles>;
}

export function PaymentsSection({ settings, s }: Props) {
  const { C } = useTheme();
  const { payConfig, updatePay, expandedPay, setExpandedPay } = settings;

  return (
    <>
      <SectionLabel label="Payment Methods" />
      <PayAccordion
        id="gcash" title="GCash" logo={require("../../../assets/payments/gcash.png")}
        ready={!!payConfig.gcashNumber?.trim()} expanded={expandedPay === "gcash"}
        onToggle={() => setExpandedPay((e) => (e === "gcash" ? null : "gcash"))} C={C} s={s}
      >
        <View style={s.payRow}>
          <TextInput style={[s.input, s.payInput]} placeholder="Account name" placeholderTextColor={C.ink4}
            value={payConfig.gcashName} onChangeText={(v) => updatePay("gcashName", v)} maxLength={60} />
          <TextInput style={[s.input, s.payInput]} placeholder="09XX XXX XXXX" placeholderTextColor={C.ink4}
            value={payConfig.gcashNumber} onChangeText={(v) => updatePay("gcashNumber", sanitizePhone(v))} keyboardType="phone-pad" maxLength={15} />
        </View>
        <QrInput label="GCash QR Code" value={payConfig.gcashQr} onChange={(v) => updatePay("gcashQr", v)} C={C} s={s} />
      </PayAccordion>
      <PayAccordion
        id="maya" title="Maya" logo={require("../../../assets/payments/maya.png")}
        ready={!!payConfig.mayaNumber?.trim()} expanded={expandedPay === "maya"}
        onToggle={() => setExpandedPay((e) => (e === "maya" ? null : "maya"))} C={C} s={s}
      >
        <View style={s.payRow}>
          <TextInput style={[s.input, s.payInput]} placeholder="Account name" placeholderTextColor={C.ink4}
            value={payConfig.mayaName} onChangeText={(v) => updatePay("mayaName", v)} maxLength={60} />
          <TextInput style={[s.input, s.payInput]} placeholder="09XX XXX XXXX" placeholderTextColor={C.ink4}
            value={payConfig.mayaNumber} onChangeText={(v) => updatePay("mayaNumber", sanitizePhone(v))} keyboardType="phone-pad" maxLength={15} />
        </View>
        <QrInput label="Maya QR Code" value={payConfig.mayaQr} onChange={(v) => updatePay("mayaQr", v)} C={C} s={s} />
      </PayAccordion>
      <PayAccordion
        id="qrph" title="QR Ph" logo={require("../../../assets/payments/qrph.png")}
        ready={!!payConfig.qrphInfo?.trim()} expanded={expandedPay === "qrph"}
        onToggle={() => setExpandedPay((e) => (e === "qrph" ? null : "qrph"))} C={C} s={s}
      >
        <TextInput style={s.input} placeholder="Bank name · account info shown to customer" placeholderTextColor={C.ink4}
          value={payConfig.qrphInfo} onChangeText={(v) => updatePay("qrphInfo", v)} maxLength={80} />
        <QrInput label="QR Ph Code" value={payConfig.qrphQr} onChange={(v) => updatePay("qrphQr", v)} C={C} s={s} />
      </PayAccordion>
      <PayAccordion
        id="bank_transfer" title="Bank Transfer" icon={{ name: "repeat", bg: "#1E3A8A" }}
        ready={!!payConfig.bankAccountNumber?.trim()} expanded={expandedPay === "bank_transfer"}
        onToggle={() => setExpandedPay((e) => (e === "bank_transfer" ? null : "bank_transfer"))} C={C} s={s}
      >
        <TextInput style={s.input} placeholder="Bank name (e.g. BDO, BPI)" placeholderTextColor={C.ink4}
          value={payConfig.bankName} onChangeText={(v) => updatePay("bankName", v)} maxLength={60} />
        <View style={s.payRow}>
          <TextInput style={[s.input, s.payInput]} placeholder="Account name" placeholderTextColor={C.ink4}
            value={payConfig.bankAccountName} onChangeText={(v) => updatePay("bankAccountName", v)} maxLength={60} />
          <TextInput style={[s.input, s.payInput]} placeholder="Account number" placeholderTextColor={C.ink4}
            value={payConfig.bankAccountNumber} onChangeText={(v) => updatePay("bankAccountNumber", v)} keyboardType="number-pad" maxLength={34} />
        </View>
      </PayAccordion>
    </>
  );
}

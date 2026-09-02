import { View, Text, Pressable, TextInput, Switch } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { sanitizeDateStr } from "../../utils/inputSanitizers";
import { updatePrinterConfig, type PaperWidth, type ReceiptMode, type usePrinterConfig } from "../../receipt/printerConfig";
import { ReceiptPreview } from "../../receipt/ReceiptPreview";
import { SectionLabel, Card, Field } from "../SettingsCard";
import { QrInput } from "../QrInput";
import type { makeStyles } from "../settingsScreenStyles";
import type { useWorkspaceSettings } from "../useWorkspaceSettings";

interface Props {
  readonly settings: ReturnType<typeof useWorkspaceSettings>;
  readonly printerCfg: ReturnType<typeof usePrinterConfig>;
  readonly canEdit: boolean;
  readonly s: ReturnType<typeof makeStyles>;
}

export function ReceiptSection({ settings, printerCfg, canEdit, s }: Props) {
  const { C } = useTheme();
  const { form, receiptConfig, updateReceipt, saveAccredField, accredComplete, handleReceiptModeChange, vatPct, svcPct } = settings;

  return (
    <>
      <SectionLabel label="Receipt Content" />
      <Card>
        <Text style={s.helpNote}>Business name, address &amp; TIN are edited in Store Profile.</Text>
        <Field label="Receipt Logo">
          <QrInput label="" value={receiptConfig.receiptLogo} onChange={(v) => updateReceipt("receiptLogo", v)} C={C} s={s} />
        </Field>
        <Field label="Order No. Prefix">
          <TextInput
            style={[s.input, !canEdit && s.inputDisabled]}
            value={receiptConfig.orderNoPrefix}
            onChangeText={(v) => updateReceipt("orderNoPrefix", v)}
            editable={canEdit}
            placeholder="M2M-"
            placeholderTextColor={C.ink4}
            autoCapitalize="characters"
            maxLength={8}
          />
        </Field>
        <Field label="Promo Line">
          <TextInput style={[s.input, !canEdit && s.inputDisabled]} value={receiptConfig.promoLine}
            onChangeText={(v) => updateReceipt("promoLine", v)} editable={canEdit} maxLength={60}
            placeholder="e.g. Free WiFi · Open 7am–10pm" placeholderTextColor={C.ink4} />
        </Field>
        <Field label="WiFi Network (SSID)">
          <TextInput style={[s.input, !canEdit && s.inputDisabled]} value={receiptConfig.wifiSsid}
            onChangeText={(v) => updateReceipt("wifiSsid", v)} editable={canEdit} maxLength={40}
            placeholder="MyShop_WiFi" placeholderTextColor={C.ink4} autoCapitalize="none" />
        </Field>
        <Field label="WiFi Credential">
          <TextInput style={[s.input, !canEdit && s.inputDisabled]} value={receiptConfig.wifiCred}
            onChangeText={(v) => updateReceipt("wifiCred", v)} editable={canEdit} maxLength={60}
            placeholder="guest1234" placeholderTextColor={C.ink4} autoCapitalize="none" />
        </Field>
        <Field label="Receipt Footer">
          <TextInput style={[s.input, s.inputMultiline, !canEdit && s.inputDisabled]} value={receiptConfig.footer}
            onChangeText={(v) => updateReceipt("footer", v)} editable={canEdit} maxLength={200}
            placeholder={"No returns / exchanges\nAll prices inclusive of VAT"} placeholderTextColor={C.ink4}
            multiline numberOfLines={2} textAlignVertical="top" />
        </Field>
      </Card>

      <SectionLabel label="Printer (This Device)" />
      <Card>
        <Text style={s.helpNote}>Printer settings are device-local and save automatically.</Text>
        <Field label="Receipt Mode">
          <View style={s.segRow}>
            {(["simple", "official"] as ReceiptMode[]).map((m) => {
              const isOfficial = m === "official";
              const disabled = isOfficial && !accredComplete;
              const active = printerCfg.receiptMode === m;
              return (
                <Pressable
                  key={m}
                  style={[
                    s.segChip,
                    active && { borderColor: C.amber, backgroundColor: `${C.amber}18` },
                    disabled && s.segChipDisabled,
                  ]}
                  onPress={() => !disabled && handleReceiptModeChange(m)}
                  disabled={disabled}
                >
                  <Text style={[s.segChipTxt, { color: active ? C.amber : disabled ? C.ink4 : C.ink3 }]}>
                    {m === "simple" ? "Simple\n(Acknowledgement)" : "Official\n(BIR / TIN)"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>
        {!accredComplete && (
          <View style={s.accredWarning}>
            <Feather name="alert-circle" size={13} color={C.amber} />
            <Text style={[s.noEditTxt, { color: C.amber, flex: 1 }]}>
              Complete BIR Accreditation fields below to enable Official Invoice Mode.
            </Text>
          </View>
        )}
        {printerCfg.receiptMode === "official" && (
          <View style={s.rateToggleRow}>
            <View style={s.rateLabelGroup}>
              <View style={s.rateIconWrap}><Feather name="hash" size={14} color={printerCfg.showTin ? C.amber : C.ink4} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[s.rateTitle, !printerCfg.showTin && s.rateTitleOff]}>Show TIN on Receipt</Text>
                <Text style={s.rateSub}>{printerCfg.showTin ? "TIN printed on receipt" : "TIN row hidden"}</Text>
              </View>
            </View>
            <Switch value={printerCfg.showTin} onValueChange={(v) => { updatePrinterConfig({ showTin: v }).catch(console.error); }}
              trackColor={{ false: C.line, true: `${C.amber}66` }} thumbColor={printerCfg.showTin ? C.amber : C.ink3} />
          </View>
        )}
        <Field label="Paper Width">
          <View style={s.segRow}>
            {(["58", "80"] as PaperWidth[]).map((w) => (
              <Pressable
                key={w}
                style={[s.segChip, printerCfg.paperWidth === w && { borderColor: C.amber, backgroundColor: `${C.amber}18` }]}
                onPress={() => { updatePrinterConfig({ paperWidth: w }).catch(console.error); }}
              >
                <Text style={[s.segChipTxt, { color: printerCfg.paperWidth === w ? C.amber : C.ink3 }]}>
                  {w} mm
                </Text>
              </Pressable>
            ))}
          </View>
        </Field>
        <Field label="Copies">
          <View style={s.segRow}>
            {[1, 2].map((n) => (
              <Pressable
                key={n}
                style={[s.segChip, printerCfg.copies === n && { borderColor: C.amber, backgroundColor: `${C.amber}18` }]}
                onPress={() => { updatePrinterConfig({ copies: n }).catch(console.error); }}
              >
                <Text style={[s.segChipTxt, { color: printerCfg.copies === n ? C.amber : C.ink3 }]}>
                  {n === 1 ? "1 Copy" : "2 Copies\n(Cust + Merchant)"}
                </Text>
              </Pressable>
            ))}
          </View>
        </Field>
        <View style={s.rateToggleRow}>
          <View style={s.rateLabelGroup}>
            <View style={s.rateIconWrap}><Feather name="printer" size={14} color={printerCfg.autoPrint ? C.amber : C.ink4} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rateTitle, !printerCfg.autoPrint && s.rateTitleOff]}>Auto-Print</Text>
              <Text style={s.rateSub}>Requires native printer (iMin / INSA).</Text>
            </View>
          </View>
          <Switch value={printerCfg.autoPrint} onValueChange={(v) => { updatePrinterConfig({ autoPrint: v }).catch(console.error); }}
            trackColor={{ false: C.line, true: `${C.amber}66` }} thumbColor={printerCfg.autoPrint ? C.amber : C.ink3} />
        </View>
      </Card>

      {canEdit && (
        <>
          <SectionLabel label="BIR Accreditation" />
          <Card>
            <Text style={s.helpNote}>Required to enable Official Invoice Mode. Saved locally on this device.</Text>
            <Field label="PTU / Permit No.">
              <TextInput style={s.input} value={receiptConfig.ptu_no}
                onChangeText={(v) => saveAccredField("ptu_no", v)} maxLength={40}
                placeholder="e.g. PTU-123456" placeholderTextColor={C.ink4} autoCapitalize="characters" />
            </Field>
            <Field label="Machine ID (MIN)">
              <TextInput style={s.input} value={receiptConfig.min_no}
                onChangeText={(v) => saveAccredField("min_no", v)} maxLength={40}
                placeholder="e.g. MIN-00001" placeholderTextColor={C.ink4} autoCapitalize="characters" />
            </Field>
            <Field label="Serial Series">
              <TextInput style={s.input} value={receiptConfig.serial_series}
                onChangeText={(v) => saveAccredField("serial_series", v)} maxLength={40}
                placeholder="e.g. INV-0000001" placeholderTextColor={C.ink4} autoCapitalize="characters" />
            </Field>
            <Field label="Accreditation Date (YYYY-MM-DD)">
              <TextInput style={s.input} value={receiptConfig.accred_date}
                onChangeText={(v) => saveAccredField("accred_date", sanitizeDateStr(v))} maxLength={10}
                placeholder="e.g. 2024-01-15" placeholderTextColor={C.ink4} keyboardType="numbers-and-punctuation" />
            </Field>
            <Field label="Software Accred. No.">
              <TextInput style={s.input} value={receiptConfig.accred_no}
                onChangeText={(v) => saveAccredField("accred_no", v)} maxLength={40}
                placeholder="e.g. 2024-01-00001-M" placeholderTextColor={C.ink4} autoCapitalize="characters" />
            </Field>
            {accredComplete && (
              <View style={[s.noEditBanner, { borderColor: `${C.good}55`, backgroundColor: `${C.good}10` }]}>
                <Feather name="check-circle" size={13} color={C.good} />
                <Text style={[s.noEditTxt, { color: C.good }]}>Accreditation complete — Official Mode available.</Text>
              </View>
            )}
          </Card>
        </>
      )}

      <SectionLabel label="Live Preview" />
      <ReceiptPreview
        name={form.name} address={receiptConfig.address} tin={receiptConfig.tin}
        footer={receiptConfig.footer} promoLine={receiptConfig.promoLine}
        wifiSsid={receiptConfig.wifiSsid} wifiCred={receiptConfig.wifiCred}
        vatPct={vatPct} svcPct={svcPct} paperWidth={printerCfg.paperWidth}
      />
    </>
  );
}

import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { CardSection } from "../CardSection";
import type { makeStyles } from "../printersScreenStyles";
import type { useLabelTemplateConfig } from "../useLabelTemplateConfig";
import type { LabelTemplate } from "../types";

const TEMPLATE_FIELDS: Array<[keyof LabelTemplate, string, string]> = [
  ["showProductName", "Product Name", "Main item name — always recommended"],
  ["showModifiers", "Modifiers / Options", "Extra shot, size, temperature, etc."],
  ["showOrderNo", "Order Number", "Short ID for cross-reference"],
  ["showTable", "Table / Order Type", "Table name, Takeout, Delivery"],
  ["showQtyCount", "Quantity Count", '"1/2", "2/2" for multiple of same item'],
  ["showTime", "Time", "Order time for queue management"],
];

interface Props {
  readonly template: LabelTemplate;
  readonly setTemplate: (updater: (t: LabelTemplate) => LabelTemplate) => void;
  readonly canEdit: boolean;
  readonly templateApi: ReturnType<typeof useLabelTemplateConfig>;
  readonly s: ReturnType<typeof makeStyles>;
}

export function TemplatesTab({ template, setTemplate, canEdit, templateApi, s }: Props) {
  const { C } = useTheme();
  const { savingTemplate, saveTemplate } = templateApi;

  return (
    <ScrollView contentContainerStyle={s.scrollPad}>
      <Text style={s.helpNote}>
        Configure what appears on each drink label. Changes take effect on the next print job.
      </Text>

      <Text style={s.sectionTitle}>Label Preview</Text>
      <View style={s.labelPreviewWrap}>
        <View style={s.labelPreview}>
          {(template.showOrderNo || template.showTable || template.showTime || template.showQtyCount) && (
            <Text style={s.lpInfo} numberOfLines={1}>
              {[
                template.showOrderNo && "#0042",
                template.showTable && "T3",
                template.showTime && "14:32",
                template.showQtyCount && "1/2",
              ].filter(Boolean).join(" ")}
            </Text>
          )}

          {template.showProductName && (
            <Text style={[s.lpProduct, template.fontSize === "large" && { fontSize: 22 }]}>
              ICED LATTE
            </Text>
          )}

          {template.showModifiers && (
            <Text style={[s.lpMod, template.fontSize === "large" && { fontSize: 13 }]}>
              {"HOT  EXTRA SHOT\nNO SUGAR"}
            </Text>
          )}
        </View>
      </View>

      <CardSection icon="sliders" title="Label Fields">
        {TEMPLATE_FIELDS.map(([key, lbl, sub]) => (
          <View key={key} style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>{lbl}</Text>
              <Text style={s.toggleSub}>{sub}</Text>
            </View>
            <Switch
              value={template[key] as boolean}
              onValueChange={v => setTemplate(t => ({ ...t, [key]: v }))}
              trackColor={{ false: C.line, true: `${C.amber}66` }}
              thumbColor={(template[key] as boolean) ? C.amber : C.ink3}
              disabled={!canEdit}
            />
          </View>
        ))}
      </CardSection>

      <CardSection icon="type" title="Font Size">
        <View style={{ flexDirection: "row", gap: 10 }}>
          {(["normal", "large"] as const).map(sz => (
            <Pressable
              key={sz}
              style={[s.chip, { flex: 1 }, template.fontSize === sz && s.chipActive]}
              onPress={() => setTemplate(t => ({ ...t, fontSize: sz }))}
              disabled={!canEdit}
            >
              <Text style={[s.chipTxt, template.fontSize === sz && s.chipTxtActive, { textAlign: "center" }]}>
                {sz === "normal" ? "Normal" : "Large"}
              </Text>
            </Pressable>
          ))}
        </View>
      </CardSection>

      {canEdit && (
        <Pressable
          style={[s.saveBtn, savingTemplate && { opacity: 0.6 }]}
          onPress={() => saveTemplate().catch(console.error)}
          disabled={savingTemplate}
        >
          {savingTemplate ? <ActivityIndicator size="small" color="#000000" /> : <Feather name="save" size={16} color="#000000" />}
          <Text style={s.saveBtnTxt}>{savingTemplate ? "Saving…" : "Save Label Template"}</Text>
        </Pressable>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

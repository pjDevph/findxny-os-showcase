import { View } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { SectionLabel, Card } from "../SettingsCard";
import { RatePctBlock } from "../RatePctBlock";
import type { makeStyles } from "../settingsScreenStyles";
import type { useWorkspaceSettings } from "../useWorkspaceSettings";

interface Props {
  readonly settings: ReturnType<typeof useWorkspaceSettings>;
  readonly canEdit: boolean;
  readonly s: ReturnType<typeof makeStyles>;
}

export function TaxesSection({ settings, canEdit, s }: Props) {
  const { C } = useTheme();
  const { form, vatEnabled, svcEnabled, enableVat, disableVat, enableSvc, disableSvc, asPct, updatePct } = settings;

  return (
    <>
      <SectionLabel label="Taxes & Charges" />
      <Card>
        <RatePctBlock
          title="VAT / Tax" icon="percent" accent={C.amber} enabled={vatEnabled} canEdit={canEdit}
          pct={asPct(form.tax_rate)} onToggle={(v) => v ? enableVat() : disableVat()} onChange={(v) => updatePct("tax_rate", v)}
          hint="Applied on the food subtotal." C={C} s={s}
        />
        <View style={s.rateDivider} />
        <RatePctBlock
          title="Service Charge" icon="coffee" accent={C.rust} enabled={svcEnabled} canEdit={canEdit}
          pct={asPct(form.service_rate)} onToggle={(v) => v ? enableSvc() : disableSvc()} onChange={(v) => updatePct("service_rate", v)}
          hint="Applied on the food subtotal before discounts." C={C} s={s}
        />
      </Card>
    </>
  );
}

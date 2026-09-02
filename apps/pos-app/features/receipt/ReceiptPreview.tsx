/**
 * ReceiptPreview — live mock receipt preview, used by the Settings receipt
 * section. Self-contained (own theme/styles) so it can be reused by any
 * future receipt-template or printer-management screen without dragging in
 * settings.tsx's screen stylesheet.
 */
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";
import { MONO } from "../theme/mono";
import { peso } from "../order/format";
import type { PaperWidth } from "./printerConfig";

interface Props {
  readonly name: string;
  readonly address: string;
  readonly tin: string;
  readonly footer: string;
  readonly promoLine: string;
  readonly wifiSsid: string;
  readonly wifiCred: string;
  readonly vatPct: number;
  readonly svcPct: number;
  readonly paperWidth: PaperWidth;
}

export function ReceiptPreview({ name, address, tin, footer, promoLine, wifiSsid, wifiCred, vatPct, svcPct, paperWidth }: Props) {
  const { C } = useTheme();
  const s = styles();
  const sub = 250;
  const vat = +(sub * (vatPct / 100)).toFixed(2);
  const svc = +(sub * (svcPct / 100)).toFixed(2);
  const total = +(sub + vat + svc).toFixed(2);
  // Scale 58mm→210px, 80mm→290px (proportional: 80/58 ≈ 1.38)
  const previewW = paperWidth === "58" ? 210 : 290;

  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <View style={[s.receipt, { width: previewW }]}>
        <Text style={s.name}>{(name || "STORE NAME").toUpperCase()}</Text>
        {!!address && <Text style={s.line}>{address}</Text>}
        <Text style={s.line}>TIN: {tin || "—"}</Text>
        <View style={s.rule} />
        <Text style={s.line}>Receipt No: POS-000123</Text>
        <Text style={s.line}>Cashier: Juan</Text>
        <View style={s.rule} />
        <View style={s.item}><Text style={s.line}>1x Cappuccino</Text><Text style={s.line}>{peso(sub)}</Text></View>
        <View style={s.rule} />
        <View style={s.item}><Text style={s.line}>Subtotal</Text><Text style={s.line}>{peso(sub)}</Text></View>
        {vatPct > 0 && <View style={s.item}><Text style={s.line}>VAT ({vatPct}%)</Text><Text style={s.line}>{peso(vat)}</Text></View>}
        {svcPct > 0 && <View style={s.item}><Text style={s.line}>Service ({svcPct}%)</Text><Text style={s.line}>{peso(svc)}</Text></View>}
        <View style={s.item}><Text style={s.total}>TOTAL</Text><Text style={s.total}>{peso(total)}</Text></View>
        {!!promoLine && <><View style={s.rule} /><Text style={[s.total, { textAlign: "center", fontSize: 11 }]}>{promoLine}</Text></>}
        {!!footer && <><View style={s.rule} /><Text style={[s.line, { textAlign: "center" }]}>{footer}</Text></>}
        {!!wifiSsid && (
          <Text style={[s.line, { textAlign: "center", marginTop: 4 }]}>
            WiFi: {wifiSsid}{wifiCred ? `  |  ${wifiCred}` : ""}
          </Text>
        )}
      </View>
      <Text style={{ color: C.ink4, fontSize: 10, fontFamily: MONO, letterSpacing: 0.5 }}>
        {paperWidth}mm thermal paper
      </Text>
    </View>
  );
}

const styles = () => StyleSheet.create({
  receipt: { backgroundColor: "#ffffff", borderRadius: R.md, padding: 16, gap: 3 },
  name: { color: "#000000", fontSize: 15, fontWeight: "800", textAlign: "center", fontFamily: MONO, marginBottom: 2 },
  line: { color: "#333333", fontSize: 11, fontFamily: MONO },
  rule: { height: 1, backgroundColor: "#c9bfae", marginVertical: 5 },
  item: { flexDirection: "row", justifyContent: "space-between" },
  total: { color: "#000000", fontSize: 13, fontWeight: "800", fontFamily: MONO },
});

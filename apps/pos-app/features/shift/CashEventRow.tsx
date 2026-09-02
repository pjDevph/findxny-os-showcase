import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";
import { MONO } from "../theme/mono";
import { peso } from "../order/format";
import { fmtTime } from "./shiftHelpers";
import type { CashEvent } from "./types";

interface Props {
  readonly evt: CashEvent;
}

export function CashEventRow({ evt }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  const badgeBg = evt.type === "in" ? C.infoBg : evt.type === "out" ? C.badBg : C.goodBg;
  const badgeColor = evt.type === "in" ? C.info : evt.type === "out" ? C.bad : C.good;
  const badgeLabel = evt.type === "in" ? "IN" : evt.type === "out" ? "OUT" : "SALE";
  const amtColor = evt.type === "out" ? C.bad : C.good;
  const amtPrefix = evt.type === "out" ? "−" : "+";

  return (
    <View style={s.row}>
      <View style={[s.badge, { backgroundColor: badgeBg }]}>
        <Text style={[s.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
      </View>
      <Text style={s.reason} numberOfLines={1}>{evt.reason}</Text>
      <Text style={[s.amt, { color: amtColor }]}>{amtPrefix}{peso(evt.amount)}</Text>
      <Text style={s.time}>{fmtTime(evt.time)}</Text>
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.bg2, padding: 10 },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: R.full },
  badgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, fontFamily: MONO },
  reason: { flex: 1, color: C.ink2, fontSize: 12 },
  amt: { fontSize: 13, fontWeight: "700", fontFamily: MONO },
  time: { color: C.ink4, fontSize: 10, fontFamily: MONO },
});

import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { peso } from "../order/format";
import { PAYMENT_METHOD_LABELS } from "./types";
import { fmtDateTime, guestName, shortNo, sourceColor, statusColor } from "./transactionsHelpers";
import type { Order } from "./types";

type C = ReturnType<typeof useTheme>["C"];

interface Props {
  order: Order; selected: boolean; C: C;
  s: ReturnType<typeof import("./transactionsScreenStyles").makeStyles>;
  onPress(): void;
}

export function TxRow({ order, selected, C, s, onPress }: Props) {
  const sc = statusColor(order.status, C);
  const src = order.source ?? "pos";
  const srcClr = sourceColor(src);
  const guest = guestName(order);
  const isCompleted = order.status === "completed";
  const isPending = order.status === "pending" && !order.pending_sync;

  return (
    <Pressable style={[s.row, selected && s.rowSelected]} onPress={onPress}>
      {selected && <View style={[s.rowAccent, { backgroundColor: C.amber }]} />}

      <View style={s.rowMain}>
        <View style={s.rowTop}>
          <Text style={s.rowNo}>{shortNo(order.order_no)}</Text>
          <View style={s.rowTopRight}>
            <Text style={s.rowAmt}>{peso(order.total ?? 0)}</Text>
          </View>
        </View>

        <View style={s.rowBot}>
          <Text style={s.rowMeta} numberOfLines={1}>
            {(order.order_type ?? "").replace(/_/g, " ")}
            {order.table_no ? ` · Table ${order.table_no}` : ""}
            {guest ? ` · ${guest}` : ""}
          </Text>
          <View style={s.rowBotRight}>
            <Text style={s.rowTime}>{fmtDateTime(order.created_at)}</Text>
          </View>
        </View>

        <View style={s.rowBadges}>
          <View style={[s.pill, { backgroundColor: `${srcClr}18`, borderColor: `${srcClr}40` }]}>
            <Text style={[s.pillTxt, { color: srcClr }]}>{src.toUpperCase()}</Text>
          </View>
          {order.pending_sync ? (
            <View style={[s.pill, { backgroundColor: `${C.warn}18`, borderColor: `${C.warn}40` }]}>
              <Feather name="cloud-off" size={9} color={C.warn} />
              <Text style={[s.pillTxt, { color: C.warn }]}>PENDING SYNC</Text>
            </View>
          ) : (
            <View style={[s.pill, { backgroundColor: `${sc}18`, borderColor: `${sc}40` }]}>
              <View style={[s.pillDot, { backgroundColor: sc }]} />
              <Text style={[s.pillTxt, { color: sc }]}>{order.status}</Text>
            </View>
          )}
          {order.payment_methods?.length ? (
            <View style={[s.pill, { backgroundColor: `${C.info}18`, borderColor: `${C.info}40` }]}>
              <Feather name="credit-card" size={9} color={C.info} />
              <Text style={[s.pillTxt, { color: C.info }]}>
                {order.payment_methods.map(m => (PAYMENT_METHOD_LABELS[m.method] ?? m.method).toUpperCase()).join("+")}
              </Text>
            </View>
          ) : order.status !== "cancelled" ? (
            <View style={[s.pill, { backgroundColor: `${C.ink4}18`, borderColor: `${C.ink4}40` }]}>
              <Feather name="credit-card" size={9} color={C.ink3} />
              <Text style={[s.pillTxt, { color: C.ink3 }]}>UNPAID</Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          {(isCompleted || order.pending_sync) && (
            <View style={[s.actionPill, { borderColor: `${C.good}50`, backgroundColor: `${C.good}12` }]}>
              <Feather name="printer" size={9} color={C.good} />
              <Text style={[s.actionPillTxt, { color: C.good }]}>Reprint</Text>
            </View>
          )}
          {isPending && (
            <View style={[s.actionPill, { borderColor: `${C.bad}50`, backgroundColor: `${C.bad}12` }]}>
              <Feather name="x" size={9} color={C.bad} />
              <Text style={[s.actionPillTxt, { color: C.bad }]}>Cancel</Text>
            </View>
          )}
        </View>
      </View>
      <Feather name="chevron-right" size={14} color={selected ? C.amber : C.ink4} />
    </Pressable>
  );
}

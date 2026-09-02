import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { MONO } from "../../theme/mono";
import { fmtTime, peso, shortNo } from "../reportsHelpers";
import type { makeStyles } from "../reportsScreenStyles";
import { STATUS_COLOR, type OrderItem, type OrderRow } from "../types";

interface Props {
  readonly order: OrderRow | null;
  readonly items: OrderItem[];
  readonly loading: boolean;
  readonly onClose: () => void;
  readonly onReprint: () => void;
  readonly s: ReturnType<typeof makeStyles>;
}

export function OrderDetailModal({ order, items, loading, onClose, onReprint, s }: Props) {
  const { C } = useTheme();
  return (
    <Modal visible={!!order} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={s.modalBd} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          {order && (
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={s.detailContent} showsVerticalScrollIndicator={false}>
              <View style={s.detailHead}>
                <Text style={s.detailOrderNo}>{shortNo(order.order_no)}</Text>
                <View style={[s.badge, { backgroundColor: `${STATUS_COLOR[order.status] ?? C.ink4}22` }]}>
                  <Text style={[s.badgeTxt, { color: STATUS_COLOR[order.status] ?? C.ink4 }]}>
                    {order.status.toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={s.infoGrid}>
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Date</Text>
                  <Text style={s.infoValue}>{fmtTime(order.created_at)}</Text>
                </View>
              </View>
              <Text style={s.sectionLabel}>Items</Text>
              {loading ? (
                <ActivityIndicator color={C.amber} style={{ marginVertical: 12 }} />
              ) : items.length === 0 ? (
                <Text style={s.noItems}>No items found</Text>
              ) : items.map(item => (
                <View key={item.id} style={s.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemName}>{item.products?.sku ? <Text style={s.itemSku}>{item.products.sku} </Text> : null}{item.products?.name ?? "—"}</Text>
                    {item.notes ? <Text style={s.itemNote}>↳ {item.notes}</Text> : null}
                  </View>
                  <Text style={s.itemQty}>×{item.quantity}</Text>
                  <Text style={[s.itemTotal, { fontFamily: MONO }]}>{peso(Number(item.unit_price) * item.quantity)}</Text>
                </View>
              ))}
              <View style={s.totalsBox}>
                <View style={[s.totalRow, s.grandRow]}>
                  <Text style={s.grandLabel}>Total</Text>
                  <Text style={[s.grandValue, { fontFamily: MONO }]}>{peso(order.total ?? 0)}</Text>
                </View>
              </View>
              <Pressable style={s.reprintBtn} onPress={onReprint}>
                <Text style={s.reprintBtnTxt}>Reprint Receipt</Text>
              </Pressable>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

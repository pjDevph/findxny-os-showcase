/**
 * Load-existing-order dialog — look up an order/kiosk ticket and pull its
 * items into the current cart, or cancel/edit that order.
 *
 * Extracted from app/pos/order.tsx.
 */
import { View, Text, Pressable, ScrollView, TextInput, Modal, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { KeyboardSheet } from "../ui/KeyboardSheet";
import { useTheme } from "../theme/ThemeContext";
import { peso } from "./format";
import type { TicketResult } from "./types";
import type { OrderScreenStyles } from "./orderScreenStyles";

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly query: string;
  readonly onQueryChange: (v: string) => void;
  readonly loading: boolean;
  readonly error: string | null;
  readonly result: TicketResult | null;
  readonly onLookup: () => void;
  readonly onAddToCart: () => void;
  readonly onCancelOrder: () => void;
  readonly onEditOrder: () => void;
  readonly bottomInset: number;
  readonly s: OrderScreenStyles;
  readonly C: ReturnType<typeof useTheme>["C"];
}

export function LoadTicketModal({
  visible, onClose, query, onQueryChange, loading, error, result,
  onLookup, onAddToCart, onCancelOrder, onEditOrder, bottomInset, s, C,
}: Props) {
  return (
      <Modal visible={visible} animationType="fade" transparent onRequestClose={() => onClose()}>
        <KeyboardSheet style={[s.ticketModalBd, { paddingBottom: 24 + bottomInset }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => onClose()} />
          <View style={s.ticketSheet}>
            <View style={s.ticketHeader}>
              <Text style={s.ticketSheetTitle}>Load existing order</Text>
              <Pressable style={s.ticketCloseBtn} onPress={() => onClose()} hitSlop={8}>
                <Feather name="x" size={18} color={C.ink3} />
              </Pressable>
            </View>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={s.ticketContent} keyboardShouldPersistTaps="handled">
              <Text style={s.ticketSheetSub}>Enter an order number (e.g. 042) or kiosk ticket (e.g. K-1042) to pull items into this cart.</Text>

              <View style={s.ticketInputRow}>
                <TextInput
                  style={s.ticketQueryInput}
                  placeholder="042 or K-1042"
                  placeholderTextColor={C.ink4}
                  value={query}
                  onChangeText={onQueryChange}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={onLookup}
                  autoFocus
                />
                <Pressable
                  style={[s.ticketLookupBtn, (loading || !query.trim()) && { opacity: 0.5 }]}
                  onPress={onLookup}
                  disabled={loading || !query.trim()}
                >
                  {loading
                    ? <ActivityIndicator size="small" color="#000000" />
                    : <Text style={s.ticketLookupBtnText}>Search</Text>}
                </Pressable>
              </View>

              {error && (
                <View style={s.ticketErrBox}>
                  <Feather name="alert-circle" size={14} color={C.bad} />
                  <Text style={s.ticketErrText}>{error}</Text>
                </View>
              )}

              {result && (
                <View style={s.ticketResultCard}>
                  <View style={s.ticketResultHeader}>
                    <View style={s.ticketResultPill}>
                      <Text style={s.ticketResultPillText}>#{result.orderNo}</Text>
                    </View>
                    {result.tableNo ? (
                      <Text style={s.ticketResultMeta}>Table {result.tableNo}</Text>
                    ) : null}
                    <Text style={s.ticketResultMeta}>{result.items.length} item{result.items.length !== 1 ? "s" : ""}</Text>
                  </View>

                  {result.items.map((it, i) => (
                    <View key={`${it.productId}-${i}`} style={s.ticketResultItem}>
                      <Text style={s.ticketResultQty}>×{it.qty}</Text>
                      <Text style={s.ticketResultName} numberOfLines={1}>{it.name}</Text>
                      <Text style={s.ticketResultPrice}>{peso(it.price * it.qty)}</Text>
                    </View>
                  ))}

                  <Pressable style={s.ticketAddBtn} onPress={onAddToCart}>
                    <Feather name="shopping-cart" size={15} color="#000000" />
                    <Text style={s.ticketAddBtnText}>Add to Cart</Text>
                  </Pressable>

                  {/* Cancel / Edit actions for the loaded order */}
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                    <Pressable
                      style={[s.ticketActionBtn, { borderColor: `${C.bad}60`, backgroundColor: `${C.bad}10` }]}
                      onPress={onCancelOrder}
                    >
                      <Feather name="x-circle" size={13} color={C.bad} />
                      <Text style={[s.ticketActionBtnText, { color: C.bad }]}>Cancel Order</Text>
                    </Pressable>
                    <Pressable
                      style={[s.ticketActionBtn, { borderColor: `${C.amber}60`, backgroundColor: `${C.amber}10` }]}
                      onPress={onEditOrder}
                    >
                      <Feather name="edit-2" size={13} color={C.amber} />
                      <Text style={[s.ticketActionBtnText, { color: C.amber }]}>Edit Order</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardSheet>
      </Modal>
  );
}

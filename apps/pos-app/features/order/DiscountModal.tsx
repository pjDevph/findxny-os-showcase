/**
 * Discount entry modal — amount/percent toggle, quick presets, SC/PWD switch.
 *
 * Extracted from app/pos/order.tsx. Dispatches cart actions directly; the
 * parent supplies the shared cart-panel stylesheet.
 */
import { View, Text, Pressable, ScrollView, TextInput, Modal, StyleSheet, Platform } from "react-native";
import { type Dispatch } from "react";
import { sanitizeMoney, sanitizePercent } from "../utils/inputSanitizers";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { KeyboardSheet } from "../ui/KeyboardSheet";
import { peso } from "./format";
import type { CartAction } from "./cartReducer";
import type { makeCpStyles } from "./cartPanelStyles";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });

export function DiscountModal({
  cp, C, visible, onClose, isPercent, discount,
  discountInput, setDiscountInput, dispatch, onApply,
  voucherInput, setVoucherInput, voucherLoading, onApplyVoucher,
  appliedVoucher, voucherDiscount, onClearVoucher,
}: {
  cp: ReturnType<typeof makeCpStyles>;
  C: ReturnType<typeof useTheme>["C"];
  visible: boolean; onClose: () => void;
  isPercent: boolean; discount: number;
  discountInput: string;
  setDiscountInput: (v: string) => void;
  dispatch: Dispatch<CartAction>;
  onApply?: (amount: number, type: "amount" | "percent") => void;
  voucherInput: string;
  setVoucherInput: (v: string) => void;
  voucherLoading: boolean;
  onApplyVoucher: () => void;
  appliedVoucher: { code: string; name: string } | null;
  voucherDiscount: number;
  onClearVoucher: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardSheet style={cp.discModalBd}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={cp.discSheet}>
          <View style={cp.discHeader}>
            <Text style={cp.discTitle}>Discount & Voucher</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={18} color={C.ink3} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flexShrink: 1 }}
            contentContainerStyle={[cp.discContent, { paddingBottom: 180 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          {/* ── Discount section ── */}
          <View style={cp.discTypeRow}>
            <Pressable
              style={[cp.discTypeBtn, !isPercent && cp.discTypeBtnActive]}
              onPress={() => { dispatch({ type: "SET_DISCOUNT_TYPE", discountType: "amount" }); setDiscountInput(""); }}
            >
              <Text style={[cp.discTypeBtnTxt, !isPercent && cp.discTypeBtnTxtActive]}>₱ Amount</Text>
            </Pressable>
            <Pressable
              style={[cp.discTypeBtn, isPercent && cp.discTypeBtnActiveGreen]}
              onPress={() => { dispatch({ type: "SET_DISCOUNT_TYPE", discountType: "percent" }); setDiscountInput(""); }}
            >
              <Text style={[cp.discTypeBtnTxt, isPercent && cp.discTypeBtnTxtActiveGreen]}>% Percent</Text>
            </Pressable>
          </View>
          <TextInput
            style={cp.discInput}
            keyboardType="decimal-pad"
            placeholder="0"
            maxLength={8}
            placeholderTextColor={C.ink4}
            value={discountInput}
            onChangeText={v => {
              const sv = isPercent ? sanitizePercent(v) : sanitizeMoney(v);
              setDiscountInput(sv);
              dispatch({ type: "SET_DISCOUNT", amount: parseFloat(sv) || 0 });
            }}
            autoFocus
          />
          <View style={cp.discPresets}>
            {isPercent
              ? [5, 10, 15, 20].map(p => (
                  <Pressable key={p} style={cp.discPreset}
                    onPress={() => { const v = String(p); setDiscountInput(v); dispatch({ type: "SET_DISCOUNT", amount: p }); }}>
                    <Text style={cp.discPresetTxt}>{p}%</Text>
                  </Pressable>
                ))
              : [50, 100, 200, 500].map(a => (
                  <Pressable key={a} style={cp.discPreset}
                    onPress={() => { const v = String(a); setDiscountInput(v); dispatch({ type: "SET_DISCOUNT", amount: a }); }}>
                    <Text style={cp.discPresetTxt}>₱{a}</Text>
                  </Pressable>
                ))
            }
          </View>
          {discount > 0 && (
            <View style={cp.discPreview}>
              <Text style={cp.discPreviewTxt}>Discount applied: -{peso(discount)}</Text>
            </View>
          )}

          {/* ── Divider ── */}
          <View style={{ borderTopWidth: 1, borderTopColor: C.line, marginVertical: 12 }} />

          {/* ── Voucher section ── */}
          <Text style={{ color: C.ink4, fontSize: 11, fontWeight: "600", letterSpacing: 0.8, marginBottom: 8 }}>
            VOUCHER CODE
          </Text>
          {appliedVoucher ? (
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.goodBg, borderRadius: 8, padding: 10, gap: 8 }}>
              <Feather name="tag" size={14} color={C.good} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.good, fontSize: 13, fontWeight: "700" }}>{appliedVoucher.code}</Text>
                <Text style={{ color: C.ink3, fontSize: 11 }}>{appliedVoucher.name}</Text>
              </View>
              <Text style={{ color: C.good, fontSize: 14, fontWeight: "700", fontFamily: MONO }}>-{peso(voucherDiscount)}</Text>
              <Pressable onPress={onClearVoucher} hitSlop={8}>
                <Feather name="x" size={16} color={C.ink4} />
              </Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, gap: 8 }}>
              <Feather name="tag" size={14} color={C.ink4} />
              <TextInput
                style={{ flex: 1, color: C.ink, fontSize: 14, paddingVertical: 4 }}
                placeholder="Enter voucher code…"
                placeholderTextColor={C.ink4}
                value={voucherInput}
                onChangeText={v => setVoucherInput(v.toUpperCase())}
                autoCapitalize="characters"
                returnKeyType="search"
                onSubmitEditing={onApplyVoucher}
              />
              {voucherInput.trim() ? (
                <Pressable
                  onPress={onApplyVoucher}
                  disabled={voucherLoading || !voucherInput.trim()}
                  style={{ backgroundColor: C.amber, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 }}
                >
                  <Text style={{ color: "#000000", fontSize: 13, fontWeight: "700" }}>
                    {voucherLoading ? "…" : "Apply"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
          </ScrollView>

          {/* ── Discount actions — sticky footer, always reachable regardless
              of scroll position or keyboard state ── */}
          <View style={[cp.discActions, { paddingBottom: 16 + insets.bottom }]}>
            <Pressable style={cp.discClear} onPress={() => {
              dispatch({ type: "SET_DISCOUNT", amount: 0 });
              setDiscountInput("");
              onClose();
            }}>
              <Text style={cp.discClearTxt}>Remove Discount</Text>
            </Pressable>
            <Pressable style={cp.discApply} onPress={() => {
              const amount = parseFloat(discountInput) || 0;
              const type = isPercent ? "percent" as const : "amount" as const;
              if (onApply) {
                dispatch({ type: "SET_DISCOUNT", amount: 0 });
                onApply(amount, type);
              }
              onClose();
            }}>
              <Text style={cp.discApplyTxt}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardSheet>
    </Modal>
  );
}


/**
 * POS cart panel — order type/table/customer controls, line items with
 * quantity + note editing, loyalty/voucher rows, totals and checkout.
 *
 * Extracted from app/pos/order.tsx. Renders as a fixed side panel on wide
 * layouts and as a bottom sheet (`sheetMode`) on narrow ones.
 */
import { View, Text, Pressable, ScrollView, TextInput, Modal, StyleSheet, Platform } from "react-native";
import { useState, useMemo, useEffect, type Dispatch } from "react";
import { invokeFn } from "../../services/supabase";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { useToast } from "../ui/ToastProvider";
import { KeyboardSheet } from "../ui/KeyboardSheet";
import { NAV_BAR_CLEARANCE } from "../ui/safeAreaPadding";
import { CustomerSelector, type Customer } from "../customers/CustomerSelector";
import { CartTotals } from "./CartTotals";
import { DiscountModal } from "./DiscountModal";
import { makeCpStyles } from "./cartPanelStyles";
import { peso } from "./format";
import { ORDER_TYPES, FLOOR_OPTIONS } from "./types";
import { itemDiscountPeso } from "./orderHelpers";
import { sanitizeInteger, sanitizeMoney, sanitizePercent } from "../utils/inputSanitizers";
import type { Cart, CartItem, LoyaltyRules, ApiVoucher } from "./types";
import type { CartAction } from "./cartReducer";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });

// Built-in quick-note chips for drinks (free prep instructions, not priced
// add-ons). Auto-shown in the note modal for any item whose prep_station is
// "drinks", on top of that product's own configured add-on groups.
// `single: true` groups are mutually exclusive (picking one clears its siblings).
const DRINK_NOTE_GROUPS: { groupName: string; options: string[]; single: boolean }[] = [
  { groupName: "Temperature", options: ["Hot", "Iced"], single: true },
  { groupName: "Ice",         options: ["No Ice", "Less Ice", "More Ice"], single: true },
  { groupName: "Sugar",       options: ["Sugar 0%", "Sugar 25%", "Sugar 50%", "Sugar 75%", "Sugar 100%"], single: true },
  { groupName: "Extras",      options: ["Extra Shot", "Decaf", "Less Sweet", "No Whip"], single: false },
];


export function CartPanel({
  cart, dispatch, total, subtotal, foodSubtotal, bookingTotal,
  tax, serviceFee, discount, taxRatePct, svcRatePct, canCheckout, onCheckout,
  onAddCharge, onDiscountApply,
  sheetMode = false,
  selectedCustomer, onCustomerChange, workspaceId,
  customerLoyalty, onRedeemPoints, onClearLoyalty,
  onHold, heldCartsCount, onOpenHeldCarts,
}: {
  cart: Cart; dispatch: Dispatch<CartAction>;
  total: number; subtotal: number; foodSubtotal: number; bookingTotal: number;
  tax: number; serviceFee: number; discount: number; taxRatePct: number; svcRatePct: number;
  canCheckout: boolean; onCheckout: () => void;
  onAddCharge: () => void;
  onDiscountApply?: (amount: number, type: "amount" | "percent") => void;
  sheetMode?: boolean;
  selectedCustomer: Customer | null;
  onCustomerChange: (c: Customer | null) => void;
  workspaceId: string | null;
  customerLoyalty?: { balance: number; peso_value: number; rules: LoyaltyRules | undefined } | null;
  onRedeemPoints?: () => void;
  onClearLoyalty?: () => void;
  onHold?: () => void;
  heldCartsCount?: number;
  onOpenHeldCarts?: () => void;
}) {
  const { C } = useTheme();
  const { showToast } = useToast();
  const cp = useMemo(() => makeCpStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const panelBottomPad = insets.bottom + NAV_BAR_CLEARANCE;
  const [discountInput, setDiscountInput] = useState(cart.discount > 0 ? String(cart.discount) : "");
  const isPercent = cart.discountType === "percent";
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  // Collapses the order type/table/customer/note controls to make room for
  // the items list — the cashier usually sets these once per order, then
  // wants to see items, not re-look at the type picker on every add.
  const [orderInfoExpanded, setOrderInfoExpanded] = useState(true);
  const itemCount = cart.items.reduce((s, i) => s + i.qty, 0) + cart.bookings.length + cart.charges.length;
  const [noteModal, setNoteModal] = useState<{
    id: string; name: string; unitPrice: number; qty: number;
    groups: { groupName: string; options: string[]; single?: boolean }[];
    chips: string[]; freeText: string;
    tab: "notes" | "discount";
    discount: number; discountType: "amount" | "percent";
  } | null>(null);
  const [itemDiscountInput, setItemDiscountInput] = useState("");

  function openNoteModal(item: CartItem) {
    const addonGroups = (item.product.addon_groups ?? []).map(g => ({
      groupName: g.name,
      options: g.addons.map(a => a.name),
    }));
    // Drinks also get the built-in prep chips (Hot/Iced, ice, sugar, extras).
    const isDrink = item.product.prep_station === "drinks";
    const groups = [...addonGroups, ...(isDrink ? DRINK_NOTE_GROUPS : [])];
    const allOptions = groups.flatMap(g => g.options.map(o => o.toLowerCase()));
    const existing = (item.notes ?? "").split(/\s*[·•,]\s*/).map(s => s.trim()).filter(Boolean);
    const chips = existing.filter(s => allOptions.includes(s.toLowerCase()));
    const freeText = existing.filter(s => !allOptions.includes(s.toLowerCase())).join(", ");
    const discount = item.discount ?? 0;
    const discountType = item.discountType ?? "amount";
    setNoteModal({
      id: item.product.id, name: item.product.name, unitPrice: item.product.price, qty: item.qty,
      groups, chips, freeText, tab: "notes", discount, discountType,
    });
    setItemDiscountInput(discount > 0 ? String(discount) : "");
  }

  function toggleChip(chip: string, group?: { options: string[]; single?: boolean }) {
    setNoteModal(m => {
      if (!m) return m;
      const has = m.chips.some(c => c.toLowerCase() === chip.toLowerCase());
      if (has) return { ...m, chips: m.chips.filter(c => c.toLowerCase() !== chip.toLowerCase()) };
      // Single-select group: picking an option clears its siblings first.
      let chips = m.chips;
      if (group?.single) {
        const sibs = group.options.map(o => o.toLowerCase());
        chips = chips.filter(c => !sibs.includes(c.toLowerCase()));
      }
      return { ...m, chips: [...chips, chip] };
    });
  }

  function saveNote() {
    if (!noteModal) return;
    const parts = [...noteModal.chips, ...(noteModal.freeText.trim() ? [noteModal.freeText.trim()] : [])];
    dispatch({ type: "SET_NOTES", id: noteModal.id, notes: parts.join(" · ") });
    dispatch({ type: "SET_ITEM_DISCOUNT", id: noteModal.id, amount: noteModal.discount, discountType: noteModal.discountType });
    setNoteModal(null);
  }

  const [voucherInput, setVoucherInput]   = useState("");
  const [voucherLoading, setVoucherLoading] = useState(false);

  // Voucher discount for display (mirrors server formula)
  const voucherDiscount = (() => {
    const v = cart.applied_voucher;
    if (!v) return 0;
    const raw = v.discount_type === "percentage"
      ? subtotal * (v.discount_value / 100)
      : v.discount_value;
    const capped = v.max_cap != null ? Math.min(raw, v.max_cap) : raw;
    return +Math.max(0, capped).toFixed(2);
  })();

  // Auto-remove voucher if subtotal drops below min_spend
  useEffect(() => {
    const v = cart.applied_voucher;
    if (v && subtotal < v.min_spend) {
      dispatch({ type: "CLEAR_VOUCHER" });
      showToast({ title: "Voucher removed", message: `Minimum spend of ₱${v.min_spend.toFixed(2)} no longer met.`, type: "info" });
    }
  }, [subtotal, cart.applied_voucher]);

  async function applyVoucher() {
    const code = voucherInput.trim().toUpperCase();
    if (!code || !workspaceId) return;
    setVoucherLoading(true);
    try {
      const { data } = await invokeFn<{ "vouchers-check": ApiVoucher | null }>(
        "pos-data", { workspace_id: workspaceId, resource: "vouchers-check", params: { code } },
      );
      const v = data?.["vouchers-check"];
      if (!v) { showToast({ title: "Not found", message: `"${code}" is not a valid voucher code.`, type: "error" }); return; }

      const now = new Date();
      if (v.status === "disabled") { showToast({ title: "Invalid", message: "This voucher is disabled.", type: "error" }); return; }
      if (v.valid_until && new Date(v.valid_until) < now) { showToast({ title: "Invalid", message: "This voucher has expired.", type: "error" }); return; }
      if (v.valid_from && new Date(v.valid_from) > now) { showToast({ title: "Invalid", message: "This voucher is not yet active.", type: "error" }); return; }
      if (v.usage_limit !== null && v.usage_count >= v.usage_limit) { showToast({ title: "Invalid", message: "Usage limit reached.", type: "error" }); return; }
      if (Number(v.min_spend) > 0 && subtotal < Number(v.min_spend)) {
        showToast({ title: "Min spend not met", message: `Minimum spend of ₱${Number(v.min_spend).toFixed(2)} required.`, type: "error" }); return;
      }

      dispatch({ type: "SET_VOUCHER", voucher: {
        id: v.id, code: v.code, name: v.name,
        discount_type: v.discount_type, discount_value: Number(v.discount_value),
        max_cap: v.max_cap != null ? Number(v.max_cap) : null,
        min_spend: Number(v.min_spend), applies_to: v.applies_to,
      }});
      setVoucherInput("");
    } catch (e: any) {
      showToast({ title: "Error", message: e?.message ?? "Failed to check voucher", type: "error" });
    } finally {
      setVoucherLoading(false);
    }
  }

  function fmtRange(startISO: string, endISO: string) {
    const fmt = (iso: string) => new Date(iso).toLocaleString("en-PH", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
    return `${fmt(startISO)} → ${fmt(endISO)}`;
  }

  // Tablet mode renders the panel inline (not inside a Modal's own KeyboardSheet),
  // so it needs its own keyboard-avoidance for the Table #/Note fields above the
  // footer buttons. Sheet mode is already wrapped by the mobile cart sheet's
  // KeyboardSheet, so a plain View avoids double-applying the iOS padding offset.
  const Panel = sheetMode ? View : KeyboardSheet;

  const orderTypeLabel = ORDER_TYPES.find(t => t.id === cart.orderType)?.label ?? "Order";
  const orderInfoSummary = [
    orderTypeLabel,
    cart.tableNo ? `${cart.orderType === "room_service" ? "Room" : "Table"} ${cart.tableNo}` : null,
    selectedCustomer?.name ?? null,
  ].filter(Boolean).join(" · ");

  return (
    <Panel style={[cp.panel, sheetMode && cp.panelSheet, { paddingBottom: panelBottomPad }]}>
      {/* Collapse toggle — order type/table/customer/note take real estate
          away from the items list below; the cashier sets these once per
          order, so let them tuck it away and still see a summary + item count. */}
      <Pressable style={cp.orderInfoHeader} onPress={() => setOrderInfoExpanded(v => !v)}>
        <Text style={cp.orderInfoHeaderText} numberOfLines={1}>{orderInfoSummary}</Text>
        {itemCount > 0 && (
          <View style={cp.itemCountPill}>
            <Text style={cp.itemCountPillText}>{itemCount} item{itemCount !== 1 ? "s" : ""}</Text>
          </View>
        )}
        <Feather name={orderInfoExpanded ? "chevron-up" : "chevron-down"} size={16} color={C.ink3}/>
      </Pressable>

      {orderInfoExpanded && (
        <>
          {/* Order type */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cp.typeScroll} contentContainerStyle={cp.typeRow}>
            {ORDER_TYPES.map(t => (
              <Pressable
                key={t.id}
                style={[cp.typeBtn, cart.orderType === t.id && cp.typeBtnActive]}
                onPress={() => dispatch({ type: "SET_TYPE", orderType: t.id })}
              >
                <Text style={[cp.typeBtnText, cart.orderType === t.id && cp.typeBtnTextActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Table + customer — table field is conditional on order type */}
          <View style={cp.inputRow}>
            {(cart.orderType === "dine_in" || cart.orderType === "room_service") && (
              <TextInput
                style={[cp.input, { width: 88 }]}
                placeholder={cart.orderType === "room_service" ? "Room #" : "Table #"}
                placeholderTextColor={C.ink4}
                value={cart.tableNo}
                onChangeText={v => dispatch({ type: "SET_TABLE", tableNo: sanitizeInteger(v, { maxLen: 20 }) })}
                keyboardType="number-pad"
              />
            )}
            <CustomerSelector
              workspaceId={workspaceId}
              selected={selectedCustomer}
              onSelect={onCustomerChange}
              guestName={selectedCustomer ? undefined : cart.customerName}
              onGuestNameChange={(name) => dispatch({ type: "SET_CUSTOMER", name })}
            />
          </View>

          {/* Floor/seating-area quick-select — dine-in only, tells the server where to serve */}
          {cart.orderType === "dine_in" && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cp.typeScroll} contentContainerStyle={cp.typeRow}>
              {FLOOR_OPTIONS.map(f => (
                <Pressable
                  key={f}
                  style={[cp.typeBtn, cart.floor === f && cp.typeBtnActive]}
                  onPress={() => dispatch({ type: "SET_FLOOR", floor: f })}
                >
                  <Text style={[cp.typeBtnText, cart.floor === f && cp.typeBtnTextActive]}>{f}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* Held carts banner — opens the picker when more than one is parked */}
          {!!heldCartsCount && onOpenHeldCarts && (
            <Pressable style={cp.heldBanner} onPress={onOpenHeldCarts}>
              <Feather name="bookmark" size={12} color={C.amber}/>
              <Text style={cp.heldBannerTxt}>
                {heldCartsCount} held cart{heldCartsCount !== 1 ? "s" : ""} waiting — tap to view
              </Text>
              <Feather name="chevron-right" size={12} color={C.amber}/>
            </Pressable>
          )}

          {/* Internal note */}
          <View style={{ marginTop: 1 }}>
            <TextInput
              style={[cp.input, { fontSize: 12, minHeight: 36 }]}
              placeholder="Internal Note (optional)"
              placeholderTextColor={C.ink4}
              value={cart.internalNote}
              onChangeText={v => dispatch({ type: "SET_INTERNAL_NOTE", note: v })}
              multiline
              maxLength={200}
            />
            {cart.internalNote.length > 0 && (
              <Text style={{ color: C.ink4, fontSize: 10, textAlign: "right", marginTop: 2 }}>
                {cart.internalNote.length}/200
              </Text>
            )}
          </View>
        </>
      )}

      <ScrollView style={[cp.items, sheetMode && cp.itemsSheet]} showsVerticalScrollIndicator={false}>
        {/* Empty state */}
        {cart.items.length === 0 && cart.bookings.length === 0 && cart.charges.length === 0 ? (
          <View style={cp.empty}>
            <Feather name="shopping-bag" size={22} color={C.ink4}/>
            <Text style={cp.emptyText}>Cart is empty</Text>
            <Text style={cp.emptySubText}>Tap a product on the left{"\n"}to start the order</Text>
          </View>
        ) : null}

        {cart.items.map((item, idx) => (
          <View key={`${item.product.id}-${idx}`} style={cp.item}>
            <Pressable style={{ flex: 1 }} onPress={() => openNoteModal(item)}>
              <Text style={cp.itemName} numberOfLines={1}>{item.product.sku ? <Text style={cp.itemSku}>{item.product.sku} </Text> : null}{item.product.name}</Text>
              {item.addons && item.addons.length > 0 && (
                <View style={{ marginTop: 2, gap: 1 }}>
                  {item.addons.map(a => (
                    <Text key={a.addon_id} style={cp.itemAddon} numberOfLines={1}>
                      + {a.name}{a.price > 0 ? `  ${peso(a.price)}` : ""}
                    </Text>
                  ))}
                </View>
              )}
              {item.notes
                ? <Text style={cp.itemNote} numberOfLines={2}>{item.notes}</Text>
                : <Text style={cp.itemNoteAdd}>＋ Customize</Text>}
              {(() => {
                const lineDiscount = itemDiscountPeso(item);
                const lineGross = item.product.price * item.qty;
                return lineDiscount > 0 ? (
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 2 }}>
                    <Text style={[cp.itemPrice, { color: C.ink4, textDecorationLine: "line-through" }]}>{peso(lineGross)}</Text>
                    <Text style={cp.itemPrice}>{peso(lineGross - lineDiscount)}</Text>
                    <Text style={{ color: C.good, fontSize: 10, fontWeight: "700" }}>−{peso(lineDiscount)}</Text>
                  </View>
                ) : (
                  <Text style={cp.itemPrice}>{peso(lineGross)}</Text>
                );
              })()}
            </Pressable>
            <View style={cp.qtyRow}>
              <Pressable style={cp.qtyBtn} onPress={() => dispatch({ type: "SET_QTY", id: item.product.id, qty: item.qty - 1 })}>
                <Text style={cp.qtyBtnText}>−</Text>
              </Pressable>
              <Text style={cp.qty}>{item.qty}</Text>
              <Pressable style={cp.qtyBtn} onPress={() => dispatch({ type: "SET_QTY", id: item.product.id, qty: item.qty + 1 })}>
                <Text style={cp.qtyBtnText}>+</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {/* Per-item customization modal */}
        {noteModal && (
          <Modal transparent animationType="fade" visible onRequestClose={() => setNoteModal(null)}>
            <KeyboardSheet style={cp.noteBackdrop}>
              <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setNoteModal(null)} />
              <View style={cp.noteSheet}>
                {/* Header */}
                <View style={cp.noteHeader}>
                  <Text style={cp.noteTitle}>{noteModal.name}</Text>
                  <Pressable onPress={() => setNoteModal(null)} hitSlop={12}>
                    <Feather name="x" size={18} color={C.ink3} />
                  </Pressable>
                </View>

                {/* Tabs — Notes vs. per-item Discount */}
                <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 20, marginBottom: 4 }}>
                  {(["notes", "discount"] as const).map(t => {
                    const active = noteModal.tab === t;
                    return (
                      <Pressable
                        key={t}
                        onPress={() => setNoteModal(m => m ? { ...m, tab: t } : m)}
                        style={[cp.discTypeBtn, active && cp.discTypeBtnActive, { paddingVertical: 8 }]}
                      >
                        <Text style={[cp.discTypeBtnTxt, active && cp.discTypeBtnTxtActive]}>
                          {t === "notes" ? "Notes" : "Discount"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <ScrollView
                  style={{ flexShrink: 1 }}
                  contentContainerStyle={[cp.noteContent, { paddingBottom: 180 }]}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                {noteModal.tab === "notes" ? (
                  <>
                    {/* Quick chips — product's own add-on groups + built-in drink prep chips */}
                    {noteModal.groups.length > 0 ? (
                      noteModal.groups.map(group => (
                        <View key={group.groupName} style={{ gap: 6 }}>
                          <Text style={cp.noteGroupLabel}>{group.groupName}</Text>
                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                            {group.options.map(opt => {
                              const active = noteModal.chips.some(c => c.toLowerCase() === opt.toLowerCase());
                              return (
                                <Pressable
                                  key={opt}
                                  onPress={() => toggleChip(opt, group)}
                                  style={[cp.noteChip, active && cp.noteChipActive]}
                                >
                                  <Text style={[cp.noteChipTxt, active && cp.noteChipTxtActive]}>{opt}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      ))
                    ) : null}

                    {/* Free text for unusual requests */}
                    <TextInput
                      style={cp.noteInput}
                      value={noteModal.freeText}
                      onChangeText={t => setNoteModal(m => m ? { ...m, freeText: t } : m)}
                      placeholder="Special request (optional)…"
                      placeholderTextColor={C.ink4}
                      maxLength={80}
                    />
                  </>
                ) : (
                  <>
                    <View style={cp.discTypeRow}>
                      <Pressable
                        style={[cp.discTypeBtn, noteModal.discountType === "amount" && cp.discTypeBtnActive]}
                        onPress={() => { setNoteModal(m => m ? { ...m, discountType: "amount" } : m); setItemDiscountInput(""); }}
                      >
                        <Text style={[cp.discTypeBtnTxt, noteModal.discountType === "amount" && cp.discTypeBtnTxtActive]}>₱ Amount</Text>
                      </Pressable>
                      <Pressable
                        style={[cp.discTypeBtn, noteModal.discountType === "percent" && cp.discTypeBtnActiveGreen]}
                        onPress={() => { setNoteModal(m => m ? { ...m, discountType: "percent" } : m); setItemDiscountInput(""); }}
                      >
                        <Text style={[cp.discTypeBtnTxt, noteModal.discountType === "percent" && cp.discTypeBtnTxtActiveGreen]}>% Percent</Text>
                      </Pressable>
                    </View>
                    <TextInput
                      style={cp.discInput}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      maxLength={8}
                      placeholderTextColor={C.ink4}
                      value={itemDiscountInput}
                      onChangeText={v => {
                        const isPct = noteModal.discountType === "percent";
                        const sv = isPct ? sanitizePercent(v) : sanitizeMoney(v);
                        setItemDiscountInput(sv);
                        setNoteModal(m => m ? { ...m, discount: parseFloat(sv) || 0 } : m);
                      }}
                    />
                    <View style={cp.discPresets}>
                      {noteModal.discountType === "percent"
                        ? [5, 10, 15, 20].map(p => (
                            <Pressable key={p} style={cp.discPreset}
                              onPress={() => { setItemDiscountInput(String(p)); setNoteModal(m => m ? { ...m, discount: p } : m); }}>
                              <Text style={cp.discPresetTxt}>{p}%</Text>
                            </Pressable>
                          ))
                        : [20, 50, 100].map(a => (
                            <Pressable key={a} style={cp.discPreset}
                              onPress={() => { setItemDiscountInput(String(a)); setNoteModal(m => m ? { ...m, discount: a } : m); }}>
                              <Text style={cp.discPresetTxt}>₱{a}</Text>
                            </Pressable>
                          ))
                      }
                    </View>
                    {(() => {
                      const previewPeso = itemDiscountPeso({
                        product: { id: "", name: "", price: noteModal.unitPrice, category: "" },
                        qty: noteModal.qty, notes: "",
                        discount: noteModal.discount, discountType: noteModal.discountType,
                      });
                      return previewPeso > 0 ? (
                        <View style={cp.discPreview}>
                          <Text style={cp.discPreviewTxt}>Item discount: -{peso(previewPeso)}</Text>
                        </View>
                      ) : null;
                    })()}
                  </>
                )}
                </ScrollView>

                {/* Actions — sticky footer, always reachable regardless of
                    scroll position or keyboard state */}
                <View style={[cp.noteActions, { paddingBottom: 16 + insets.bottom }]}>
                  <Pressable style={cp.noteClear} onPress={() => {
                    if (noteModal.tab === "notes") {
                      dispatch({ type: "SET_NOTES", id: noteModal.id, notes: "" });
                    } else {
                      dispatch({ type: "SET_ITEM_DISCOUNT", id: noteModal.id, amount: 0, discountType: noteModal.discountType });
                    }
                    setNoteModal(null);
                  }}>
                    <Text style={cp.noteClearTxt}>{noteModal.tab === "notes" ? "Clear all" : "Remove discount"}</Text>
                  </Pressable>
                  <Pressable style={cp.noteSave} onPress={saveNote}>
                    <Text style={cp.noteSaveTxt}>Save</Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardSheet>
          </Modal>
        )}

        {/* Booking items */}
        {cart.bookings.length > 0 && (
          <View style={cp.bookingSection}>
            <Text style={cp.bookingSectionLabel}>BOOKINGS</Text>
            {cart.bookings.map(b => (
              <View key={b.tempId} style={cp.bookingItem}>
                <View style={{ flex: 1 }}>
                  <Text style={cp.bookingName}>{b.resourceName}</Text>
                  <Text style={cp.bookingTime} numberOfLines={1}>{fmtRange(b.startISO, b.endISO)}</Text>
                  <Text style={cp.bookingPrice}>{peso(b.total)}</Text>
                </View>
                <Pressable
                  style={cp.bookingRemove}
                  onPress={() => dispatch({ type: "REMOVE_BOOKING", tempId: b.tempId })}
                >
                  <Text style={cp.bookingRemoveTxt}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Custom charges — list only, Add button moved below totals */}
        {cart.charges.length > 0 && (
          <View style={cp.chargeSection}>
            <Text style={cp.chargeSectionLabel}>CHARGES</Text>
            {cart.charges.map(ch => (
              <View key={ch.tempId} style={cp.chargeItem}>
                <View style={{ flex: 1 }}>
                  <Text style={cp.chargeName}>{ch.name}</Text>
                  <Text style={cp.chargePrice}>{peso(ch.amount)}</Text>
                </View>
                <Pressable
                  style={cp.bookingRemove}
                  onPress={() => dispatch({ type: "REMOVE_CHARGE", tempId: ch.tempId })}
                >
                  <Text style={cp.bookingRemoveTxt}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* SC/PWD Discount toggle */}
      <Pressable
        style={[cp.discountRow, { borderTopWidth: 1, borderTopColor: C.line }]}
        onPress={() => dispatch({ type: "SET_SENIOR_PWD", value: !cart.is_senior_pwd })}
      >
        <View style={[cp.scPwdCheckbox, cart.is_senior_pwd && { backgroundColor: C.info, borderColor: C.info }]}>
          {cart.is_senior_pwd && <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>✓</Text>}
        </View>
        <Text style={[cp.discountLabel, { flex: 1 }]}>SC/PWD Discount (20%)</Text>
        {cart.is_senior_pwd && discount > 0 && (
          <Text style={[cp.discountValue, { color: C.good }]}>-{peso(discount)}</Text>
        )}
      </Pressable>

      {/* Discount & Voucher row — tappable, opens combined modal (disabled when SC/PWD active) */}
      <Pressable
        style={[cp.discountRow, cart.is_senior_pwd && { opacity: 0.4 }]}
        onPress={cart.is_senior_pwd ? undefined : () => setShowDiscountModal(true)}
      >
        <Text style={cp.discountLabel}>Discount & Voucher</Text>
        <View style={{ flex: 1 }} />
        {!cart.is_senior_pwd && (discount > 0 || cart.applied_voucher) ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {discount > 0 && (
              <Text style={cp.discountValue}>
                {cart.discountType === "percent" ? `${cart.discount.toFixed(0)}%` : peso(cart.discount)}
                {"  "}
                <Text style={cp.discountValueSub}>(-{peso(discount)})</Text>
              </Text>
            )}
            {cart.applied_voucher && (
              <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.goodBg, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, gap: 4 }}>
                <Feather name="tag" size={11} color={C.good} />
                <Text style={{ color: C.good, fontSize: 11, fontWeight: "700" }}>{cart.applied_voucher.code}</Text>
              </View>
            )}
          </View>
        ) : (
          <Text style={cp.discountNone}>{cart.is_senior_pwd ? "—" : "Tap to add"}</Text>
        )}
        {!cart.is_senior_pwd && <Feather name="chevron-right" size={14} color={C.ink4} />}
      </Pressable>

      {/* Combined Discount & Voucher modal */}
      <DiscountModal
        cp={cp} C={C}
        visible={showDiscountModal}
        onClose={() => setShowDiscountModal(false)}
        isPercent={isPercent}
        discount={discount}
        discountInput={discountInput}
        setDiscountInput={setDiscountInput}
        dispatch={dispatch}
        onApply={onDiscountApply}
        voucherInput={voucherInput}
        setVoucherInput={setVoucherInput}
        voucherLoading={voucherLoading}
        onApplyVoucher={applyVoucher}
        appliedVoucher={cart.applied_voucher ?? null}
        voucherDiscount={voucherDiscount}
        onClearVoucher={() => dispatch({ type: "CLEAR_VOUCHER" })}
      />

      {/* Loyalty points redemption row */}
      {selectedCustomer && customerLoyalty && customerLoyalty.balance > 0 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.line }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: C.ink3 }}>
              Points: {customerLoyalty.balance} (≈₱{customerLoyalty.peso_value.toFixed(2)})
            </Text>
            {cart.loyalty_points_to_redeem > 0 ? (
              <Pressable onPress={onClearLoyalty} hitSlop={6}>
                <Text style={{ fontSize: 11, color: "#ef4444" }}>Remove (-₱{cart.loyalty_peso_discount.toFixed(2)})</Text>
              </Pressable>
            ) : (
              <Pressable onPress={onRedeemPoints} hitSlop={6}>
                <Text style={{ fontSize: 11, color: "#6366f1" }}>Redeem all points</Text>
              </Pressable>
            )}
          </View>
          {cart.loyalty_points_to_redeem > 0 && (
            <Text style={{ fontSize: 13, color: "#10b981", fontWeight: "600", fontFamily: MONO }}>-₱{cart.loyalty_peso_discount.toFixed(2)}</Text>
          )}
        </View>
      )}

      {/* Totals */}
      <CartTotals
        cp={cp} C={C}
        foodSubtotal={foodSubtotal} bookingTotal={bookingTotal}
        taxRatePct={taxRatePct} svcRatePct={svcRatePct}
        tax={tax} serviceFee={serviceFee}
        discount={discount} total={total}
        cart={cart}
        loyaltyDiscount={cart.loyalty_peso_discount > 0 ? cart.loyalty_peso_discount : undefined}
        voucherDiscount={voucherDiscount > 0 ? voucherDiscount : undefined}
      />

      {/* Footer quick actions: Add Charge + Hold */}
      <View style={cp.footerActions}>
        <Pressable style={cp.footerActionBtn} onPress={onAddCharge}>
          <Feather name="plus-circle" size={12} color={C.ink3}/>
          <Text style={cp.footerActionTxt}>Add Charge</Text>
        </Pressable>
        {canCheckout && onHold && (
          <Pressable style={cp.footerActionBtn} onPress={onHold}>
            <Feather name="bookmark" size={12} color={C.ink3}/>
            <Text style={cp.footerActionTxt}>Hold</Text>
          </Pressable>
        )}
      </View>

      <Pressable
        style={[cp.checkoutBtn, !canCheckout && cp.checkoutBtnDisabled]}
        onPress={onCheckout}
        disabled={!canCheckout}
      >
        <Text style={cp.checkoutBtnText}>Checkout · {peso(total)}</Text>
      </Pressable>

      {canCheckout && (
        <Pressable style={cp.clearBtn} onPress={() => dispatch({ type: "CLEAR" })}>
          <Text style={cp.clearBtnText}>Clear cart</Text>
        </Pressable>
      )}
    </Panel>
  );
}

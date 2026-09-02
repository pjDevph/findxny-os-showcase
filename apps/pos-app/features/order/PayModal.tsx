/**
 * Full-screen payment modal — method picker, split payments, partial/unpaid
 * tabs, booking deposit modes, and the confirm action.
 *
 * Extracted from app/pos/order.tsx. State lives in the screen and is passed in,
 * so this stays a presentational shell around the checkout decision.
 */
import { View, Text, Pressable, ScrollView, TextInput, Modal, StyleSheet, Platform, ActivityIndicator } from "react-native";
import type React from "react";
import { Feather } from "@expo/vector-icons";
import { KeyboardSheet } from "../ui/KeyboardSheet";
import { useTheme } from "../theme/ThemeContext";
import { CustomerSelector, type Customer } from "../customers/CustomerSelector";
import { PayMethodIcon } from "./PayMethodIcon";
import { ORDER_TYPES, PAY_METHODS } from "./types";
import type { Cart, PayMethod, SplitMethod } from "./types";
import { peso } from "./format";
import { resolveBankDisplay } from "./orderHelpers";
import { sanitizeMoney } from "../utils/inputSanitizers";
import type { PaymentConfig } from "../payments/paymentConfig";
import type { OrderScreenStyles } from "./orderScreenStyles";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });

type BookPayMode = "unpaid" | "full" | "deposit";

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly payMethod: PayMethod;        readonly setPayMethod: (v: PayMethod) => void;
  readonly refNumber: string;           readonly setRefNumber: (v: string) => void;
  readonly cashInput: string;           readonly setCashInput: (v: string) => void;
  readonly splitM1: SplitMethod;        readonly setSplitM1: (v: SplitMethod) => void;
  readonly splitM2: SplitMethod;        readonly setSplitM2: (v: SplitMethod) => void;
  readonly splitA1: string;             readonly setSplitA1: (v: string) => void;
  readonly splitA2: string;             readonly setSplitA2: (v: string) => void;
  readonly splitR1: string;             readonly setSplitR1: (v: string) => void;
  readonly splitR2: string;             readonly setSplitR2: (v: string) => void;
  readonly payPartial: boolean;         readonly setPayPartial: (v: boolean) => void;
  readonly payUnpaid: boolean;          readonly setPayUnpaid: (v: boolean) => void;
  readonly partialAmtInput: string;     readonly setPartialAmtInput: (v: string) => void;
  readonly depositAmt: string;          readonly setDepositAmt: (v: string) => void;
  readonly bookPayMode: BookPayMode;    readonly setBookPayMode: (v: BookPayMode) => void;
  readonly applyTax: boolean;           readonly setApplyTax: (v: boolean) => void;
  readonly applySvc: boolean;           readonly setApplySvc: (v: boolean) => void;
  readonly payScrollRef: React.RefObject<ScrollView | null>;
  readonly cart: Cart;
  readonly total: number;
  readonly discount: number;
  readonly tax: number;
  readonly serviceFee: number;
  readonly change: number;
  readonly taxRatePct: number;
  readonly svcRatePct: number;         readonly setSvcRatePct: (v: number) => void;
  readonly submitting: boolean;
  readonly payConfig: PaymentConfig;
  readonly gcashNameLine: string;
  readonly mayaNameLine: string;
  readonly selectedCustomer: Customer | null;
  readonly onCustomerChange: (c: Customer | null) => void;
  readonly workspaceId: string | null;
  readonly onSplitConfirm: (legs: {
    method1: { method: SplitMethod; amount: number; reference?: string };
    method2: { method: SplitMethod; amount: number; reference?: string };
  }) => void;
  readonly onSubmit: () => void;
  readonly bottomInset: number;
  readonly s: OrderScreenStyles;
  readonly C: ReturnType<typeof useTheme>["C"];
}

export function PayModal(p: Props) {
  const {
    visible, onClose, payMethod, setPayMethod, refNumber, setRefNumber,
    cashInput, setCashInput, splitM1, setSplitM1, splitM2, setSplitM2,
    splitA1, setSplitA1, splitA2, setSplitA2, splitR1, setSplitR1, splitR2, setSplitR2,
    payPartial, setPayPartial, payUnpaid, setPayUnpaid,
    partialAmtInput, setPartialAmtInput, depositAmt, setDepositAmt,
    bookPayMode, setBookPayMode, applyTax, setApplyTax, applySvc, setApplySvc,
    payScrollRef, cart, total, discount, tax, serviceFee, change, taxRatePct, svcRatePct, setSvcRatePct, submitting,
    payConfig, gcashNameLine, mayaNameLine, selectedCustomer,
    onCustomerChange, workspaceId, onSplitConfirm, onSubmit, bottomInset, s, C,
  } = p;
  return (
      <Modal visible={visible} animationType="fade" transparent onRequestClose={() => onClose()}>
        <KeyboardSheet style={[StyleSheet.absoluteFill, { backgroundColor: C.bg2 }]}>

            {/* ── Header ── */}
            <View style={s.payHeader}>
              <View>
                <Text style={s.payTitle}>Payment</Text>
                <Text style={s.payTotal}>{peso(total)}</Text>
              </View>
              <Pressable style={s.payCloseBtn} onPress={() => onClose()} hitSlop={8}>
                <Feather name="x" size={22} color={C.ink3} />
              </Pressable>
            </View>

            {/* ── Two-column body ── */}
            {(() => {
              const isBookingOnly   = cart.items.length === 0 && cart.bookings.length > 0;
              const depositAmtNum   = parseFloat(depositAmt) || 0;
              const collectAmt      = isBookingOnly && bookPayMode === "deposit" ? depositAmtNum : total;
              const bkCashAmt       = parseFloat(cashInput) || 0;
              const bkChange        = bkCashAmt - collectAmt;
              const partialAmtNum   = parseFloat(partialAmtInput) || 0;
              const isPartialActive = !isBookingOnly && payMethod === "cash" && payPartial;
              // Unpaid "open tab": regular (non-booking) orders only. Created owing the
              // full total; no payment recorded now. Collected later in Transactions.
              const canUnpaidTab    = !isBookingOnly && cart.bookings.length === 0;
              const isUnpaidTab     = canUnpaidTab && payUnpaid;
              // Partial and unpaid orders leave a balance owed, so they must be tied to a
              // customer we can chase for it — a bare name at minimum, phone strongly preferred.
              const needsCustomer   = isPartialActive || isUnpaidTab;
              const custPhoneOk     = !!(selectedCustomer?.phone && selectedCustomer.phone.trim());
              const customerBlocks  = needsCustomer && !selectedCustomer;
              const effectiveCash   = parseFloat(cashInput) || 0;
              const effectiveChange = isPartialActive
                ? (partialAmtNum > 0 ? effectiveCash - partialAmtNum : -1)
                : change;
              const needRef         = payMethod !== "cash" && payMethod !== "split" && bookPayMode !== "unpaid";
              const cashInsufficient = payMethod === "cash" && !isBookingOnly && (
                isPartialActive
                  ? (partialAmtNum <= 0 || partialAmtNum >= total || effectiveCash <= 0 || effectiveChange < 0)
                  : (bkCashAmt <= 0 || bkChange < 0)
              );
              const splitA1Num  = parseFloat(splitA1) || 0;
              const splitA2Num  = parseFloat(splitA2) || 0;
              const splitSum    = +(splitA1Num + splitA2Num).toFixed(2);
              const splitSumErr = splitA1Num > 0 && splitA2Num > 0 && Math.abs(splitSum - total) >= 0.01;
              const splitValid  = splitA1Num > 0 && splitA2Num > 0 && !splitSumErr
                && (splitM1 === "cash" || splitR1.trim().length > 0)
                && (splitM2 === "cash" || splitR2.trim().length > 0);
              const confirmDisabled = submitting
                || customerBlocks
                || (isUnpaidTab ? false
                    : payMethod === "split" ? !splitValid
                    : (isBookingOnly && bookPayMode === "unpaid" ? false
                       : needRef && !refNumber.trim()
                       || cashInsufficient
                       || (isBookingOnly && bookPayMode === "deposit" && depositAmtNum <= 0)
                       || (!isBookingOnly && payMethod !== "cash" && !refNumber.trim())
                       || (!isBookingOnly && payMethod === "cash" && !isPartialActive && change < 0)));
              const confirmLabel = submitting ? "Processing…"
                : customerBlocks ? "Select a customer first"
                : isUnpaidTab ? "Create Tab — Pay Later"
                : payMethod === "split" ? `Confirm Split · ${peso(total)}`
                : isBookingOnly && bookPayMode === "unpaid" ? "Book Now — Pay Later"
                : isBookingOnly && bookPayMode === "deposit" ? `Confirm Deposit · ${peso(collectAmt)}`
                : isPartialActive && partialAmtNum > 0 ? `Confirm Partial · ${peso(partialAmtNum)}`
                : `Confirm · ${peso(total)}`;

              return (
                <View style={s.payColumns}>

                {/* ── LEFT: Order summary ── */}
                <View style={s.payLeft}>
                  {/* Order details — read-only reflection of what's set in the
                      cart panel (order type/table/customer/notes/discount are
                      edited there, since they need to be locked in before/while
                      building the order for kitchen routing). Shown here as a
                      last-look summary since the checkout modal has the room. */}
                  <Text style={s.paySectionLabel}>Order Details</Text>
                  <View style={s.payDetailsCard}>
                    <View style={s.payDetailRow}>
                      <Text style={s.payDetailLabel}>Type</Text>
                      <Text style={s.payDetailValue} numberOfLines={1}>
                        {ORDER_TYPES.find(t => t.id === cart.orderType)?.label ?? cart.orderType}
                        {cart.tableNo ? `  ·  ${cart.orderType === "room_service" ? "Room" : "Table"} ${cart.tableNo}` : ""}
                      </Text>
                    </View>
                    {selectedCustomer && (
                      <View style={s.payDetailRow}>
                        <Text style={s.payDetailLabel}>Customer</Text>
                        <Text style={s.payDetailValue} numberOfLines={1}>{selectedCustomer.name}</Text>
                      </View>
                    )}
                    {discount > 0 && (
                      <View style={s.payDetailRow}>
                        <Text style={s.payDetailLabel}>Discount</Text>
                        <Text style={[s.payDetailValue, { color: C.good }]}>−{peso(discount)}</Text>
                      </View>
                    )}
                    {cart.internalNote ? (
                      <View style={s.payDetailRow}>
                        <Text style={s.payDetailLabel}>Note</Text>
                        <Text style={s.payDetailValue} numberOfLines={2}>{cart.internalNote}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginVertical: 10 }} />

                  {!isBookingOnly && (
                    <>
                      <Text style={s.paySectionLabel}>Adjustments</Text>
                      <View style={s.adjustRow}>
                        {taxRatePct > 0 && (
                          <Pressable style={[s.adjustToggle, applyTax && s.adjustToggleActive]} onPress={() => setApplyTax(!applyTax)}>
                            <View style={[s.checkbox, applyTax && { backgroundColor: C.info, borderColor: C.info }]}>
                              {applyTax && <Text style={s.checkmark}>✓</Text>}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.adjustLabel}>VAT {(taxRatePct * 100).toFixed(0)}%</Text>
                              <Text style={s.adjustAmount}>{peso(tax)}</Text>
                            </View>
                          </Pressable>
                        )}
                        {svcRatePct > 0 ? (
                          <Pressable style={[s.adjustToggle, applySvc && s.adjustToggleActive]} onPress={() => setApplySvc(!applySvc)}>
                            <View style={[s.checkbox, applySvc && { backgroundColor: C.info, borderColor: C.info }]}>
                              {applySvc && <Text style={s.checkmark}>✓</Text>}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.adjustLabel}>Service {(svcRatePct * 100).toFixed(0)}%</Text>
                              <Text style={s.adjustAmount}>{peso(serviceFee)}</Text>
                            </View>
                          </Pressable>
                        ) : (
                          // No workspace-configured service rate — never silently
                          // assume one. This is a manual, explicit, one-tap opt-in
                          // for this checkout only (Settings → Taxes is where an
                          // owner sets a rate that applies to every order).
                          <Pressable
                            style={s.adjustToggle}
                            onPress={() => { setSvcRatePct(0.05); setApplySvc(true); }}
                          >
                            <Feather name="plus-circle" size={16} color={C.amber} />
                            <View style={{ flex: 1 }}>
                              <Text style={s.adjustLabel}>Add Service 5%</Text>
                              <Text style={s.adjustAmount}>Not configured — one-time add</Text>
                            </View>
                          </Pressable>
                        )}
                      </View>
                      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginVertical: 10 }} />
                    </>
                  )}
                  <Text style={[s.paySectionLabel, { marginBottom: 6 }]}>Order Items</Text>
                  <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                    {cart.items.map((item, idx) => (
                      <View key={idx} style={s.payOrderRow}>
                        <Text style={s.payOrderQty}>×{item.qty}</Text>
                        <Text style={s.payOrderName} numberOfLines={2}>{item.product.sku ? <Text style={{ fontFamily: MONO, fontWeight: "700", color: C.ink4 }}>{item.product.sku} </Text> : null}{item.product.name}</Text>
                        <Text style={s.payOrderPrice}>{peso(item.product.price * item.qty)}</Text>
                      </View>
                    ))}
                    {cart.bookings.map(b => (
                      <View key={b.tempId} style={s.payOrderRow}>
                        <Text style={s.payOrderQty}>×1</Text>
                        <Text style={s.payOrderName} numberOfLines={2}>{b.resourceName}</Text>
                        <Text style={s.payOrderPrice}>{peso(b.total)}</Text>
                      </View>
                    ))}
                    {cart.charges.map((c, idx) => (
                      <View key={idx} style={s.payOrderRow}>
                        <Text style={s.payOrderQty}>×1</Text>
                        <Text style={s.payOrderName} numberOfLines={2}>{c.name}</Text>
                        <Text style={s.payOrderPrice}>{peso(c.amount)}</Text>
                      </View>
                    ))}
                    {discount > 0 && (
                      <View style={s.payOrderRow}>
                        <Text style={[s.payOrderQty, { color: C.good }]}>−</Text>
                        <Text style={[s.payOrderName, { color: C.good }]}>Discount</Text>
                        <Text style={[s.payOrderPrice, { color: C.good }]}>−{peso(discount)}</Text>
                      </View>
                    )}
                  </ScrollView>
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginTop: 8 }} />
                  <View style={[s.payOrderRow, { paddingTop: 8, paddingBottom: 8 + bottomInset, borderBottomWidth: 0 }]}>
                    <Text style={[s.payOrderName, { color: C.ink3, fontSize: 12 }]}>Total</Text>
                    <Text style={[s.payOrderPrice, { color: C.amber, fontWeight: "700", fontSize: 18 }]}>{peso(total)}</Text>
                  </View>
                </View>

                {/* ── RIGHT: Payment input ── */}
                <View style={s.payRight}>
                <ScrollView ref={payScrollRef} style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">

                  {/* Booking-only mode selector */}
                  {isBookingOnly && (
                    <>
                      <Text style={s.paySectionLabel}>Booking Payment</Text>
                      <View style={s.bookPayModeRow}>
                        {(["unpaid", "full", "deposit"] as const).map(mode => {
                          const labels = { unpaid: "Unpaid", full: "Full Payment", deposit: "Deposit" };
                          const active = bookPayMode === mode;
                          return (
                            <Pressable
                              key={mode}
                              style={[s.bookPayModeBtn, active && s.bookPayModeBtnActive]}
                              onPress={() => { setBookPayMode(mode); setCashInput(""); setRefNumber(""); setDepositAmt(""); }}
                            >
                              <Text style={[s.bookPayModeTxt, active && s.bookPayModeTxtActive]}>{labels[mode]}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      {bookPayMode === "unpaid" && (
                        <View style={[s.payInfo, { borderColor: `${C.amber}44` }]}>
                          <Text style={[s.payInfoText, { color: C.amber }]}>
                            Booking will be confirmed with no payment recorded.{"\n"}Collect payment later via the Bookings tab.
                          </Text>
                        </View>
                      )}
                    </>
                  )}

                  {/* Customer — required for partial/unpaid orders so the balance
                      is attributable. Reuses the cart's CustomerSelector so the
                      cashier can attach one without leaving checkout. */}
                  {!isBookingOnly && needsCustomer && (
                    <View style={{ zIndex: 50 }}>
                      <Text style={s.paySectionLabel}>
                        Customer <Text style={{ color: C.bad }}>*</Text>
                      </Text>
                      <View style={{ flexDirection: "row", marginTop: 6 }}>
                        <CustomerSelector
                          workspaceId={workspaceId}
                          selected={selectedCustomer}
                          onSelect={onCustomerChange}
                        />
                      </View>
                      {!selectedCustomer ? (
                        <Text style={[s.refHint, { color: C.bad }]}>
                          {isUnpaidTab ? "An unpaid tab" : "A partial payment"} must be tied to a customer.
                        </Text>
                      ) : !custPhoneOk ? (
                        <Text style={[s.refHint, { color: C.amber }]}>
                          No phone on file — add one under Customers so you can follow up on the balance.
                        </Text>
                      ) : null}
                    </View>
                  )}

                  {/* Unpaid tab banner — no payment collected now */}
                  {isUnpaidTab && (
                    <View style={[s.payInfo, { borderColor: `${C.amber}44` }]}>
                      <Text style={[s.payInfoText, { color: C.amber }]}>
                        Order will be created as an unpaid tab owing {peso(total)}.{"\n"}Collect payment later via Transactions → Collect Balance.
                      </Text>
                    </View>
                  )}

                  {/* Payment methods — hidden when booking-only unpaid or an unpaid tab */}
                  {(!isBookingOnly || bookPayMode !== "unpaid") && (
                    <>
                      {/* Deposit amount input */}
                      {isBookingOnly && bookPayMode === "deposit" && (
                        <View style={s.cashWrap}>
                          <Text style={s.cashLabel}>
                            Deposit Amount <Text style={{ color: C.bad }}>*</Text>
                            <Text style={{ color: C.ink4, fontWeight: "400" }}> (of {peso(total)})</Text>
                          </Text>
                          <TextInput
                            style={s.cashInput}
                            keyboardType="decimal-pad" placeholder="0.00" maxLength={12}
                            placeholderTextColor={C.ink4}
                            value={depositAmt} onChangeText={v => setDepositAmt(sanitizeMoney(v))}
                          />
                          <View style={s.quickAmounts}>
                            {[total * 0.5, total * 0.3, total * 0.2].filter(a => a > 0).map(amt => (
                              <Pressable key={amt} style={s.quickAmt} onPress={() => setDepositAmt(amt.toFixed(2))}>
                                <Text style={s.quickAmtText}>{peso(amt)}</Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      )}

                      {!isUnpaidTab && (
                        <>
                          <Text style={s.paySectionLabel}>Payment Method</Text>
                          <View style={s.payMethods}>
                            {PAY_METHODS.map(m => (
                              <Pressable
                                key={m.id}
                                style={[s.payMethod, payMethod === m.id && s.payMethodActive]}
                                onPress={() => { setPayMethod(m.id); setRefNumber(""); setCashInput(""); }}
                              >
                                <PayMethodIcon id={m.id} size={28} />
                                <Text style={[s.payMethodLabel, payMethod === m.id && { color: C.amber }]}>{m.label}</Text>
                              </Pressable>
                            ))}
                          </View>
                        </>
                      )}

                      {/* Payment flow row — Pay in Full / Pay Partial (cash only),
                          Split, and Unpaid (open tab). All "how will this order be
                          paid" choices the cashier picks from together. */}
                      {!isBookingOnly && (
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          {!isUnpaidTab && payMethod === "cash" && (
                            <>
                              <Pressable
                                style={[s.payFlowBtn, !payPartial && s.payFlowBtnActive]}
                                onPress={() => { setPayPartial(false); setPartialAmtInput(""); }}
                              >
                                <Text style={[s.payFlowBtnTxt, !payPartial && s.payFlowBtnTxtActive]}>Pay in Full</Text>
                              </Pressable>
                              <Pressable
                                style={[s.payFlowBtn, payPartial && s.payFlowBtnActive]}
                                onPress={() => { setPayPartial(true); setPartialAmtInput(""); }}
                              >
                                <Text style={[s.payFlowBtnTxt, payPartial && s.payFlowBtnTxtActive]}>Pay Partial</Text>
                              </Pressable>
                            </>
                          )}
                          {!isUnpaidTab && (
                            <Pressable
                              style={[s.payFlowBtn, payMethod === "split" && s.payFlowBtnActive, { flexDirection: "row", gap: 4 }]}
                              onPress={() => {
                                setPayMethod(payMethod === "split" ? "cash" : "split");
                                setRefNumber(""); setSplitA1(""); setSplitA2(""); setSplitR1(""); setSplitR2("");
                              }}
                            >
                              <Feather name="git-branch" size={13} color={payMethod === "split" ? "#fff" : C.amber} />
                              <Text style={[s.payFlowBtnTxt, payMethod === "split" && s.payFlowBtnTxtActive]}>Split</Text>
                            </Pressable>
                          )}
                          {canUnpaidTab && (
                            <Pressable
                              style={[s.payFlowBtn, payUnpaid && s.payFlowBtnActive, { flexDirection: "row", gap: 4 }]}
                              onPress={() => {
                                const next = !payUnpaid;
                                setPayUnpaid(next);
                                if (next) {
                                  setPayPartial(false); setPartialAmtInput("");
                                  setPayMethod("cash"); setCashInput("");
                                  setRefNumber(""); setSplitA1(""); setSplitA2(""); setSplitR1(""); setSplitR2("");
                                }
                              }}
                            >
                              <Feather name="clock" size={13} color={payUnpaid ? "#fff" : C.amber} />
                              <Text style={[s.payFlowBtnTxt, payUnpaid && s.payFlowBtnTxtActive]}>Unpaid</Text>
                            </Pressable>
                          )}
                        </View>
                      )}

                      {/* Inline split payment input */}
                      {payMethod === "split" && (() => {
                        const SPLIT_OPTS = [
                          { id: "cash"  as const, label: "Cash"  },
                          { id: "gcash" as const, label: "GCash" },
                          { id: "maya"  as const, label: "Maya"  },
                          { id: "card"  as const, label: "Card"  },
                          { id: "qrph"  as const, label: "QR PH" },
                          { id: "bank_transfer" as const, label: "Bank" },
                        ];
                        return (
                          <View style={{ gap: 10 }}>
                            <Text style={s.paySectionLabel}>Payment 1</Text>
                            <View style={s.bookPayModeRow}>
                              {SPLIT_OPTS.filter(m => m.id !== splitM2).map(m => (
                                <Pressable key={m.id}
                                  style={[s.bookPayModeBtn, splitM1 === m.id && s.bookPayModeBtnActive]}
                                  onPress={() => setSplitM1(m.id)}>
                                  <Text style={[s.bookPayModeTxt, splitM1 === m.id && s.bookPayModeTxtActive]}>{m.label}</Text>
                                </Pressable>
                              ))}
                            </View>
                            <TextInput
                              style={s.cashInput} keyboardType="decimal-pad" placeholder="0.00" maxLength={12}
                              placeholderTextColor={C.ink4} value={splitA1}
                              onChangeText={v => {
                                const sv = sanitizeMoney(v);
                                setSplitA1(sv);
                                const rem = +(total - (parseFloat(sv) || 0)).toFixed(2);
                                setSplitA2(rem > 0 ? rem.toFixed(2) : "");
                              }}
                            />
                            {splitM1 !== "cash" && (
                              <TextInput style={s.refInput} placeholder="Reference No." placeholderTextColor={C.ink4}
                                value={splitR1} onChangeText={setSplitR1} autoCapitalize="characters" />
                            )}

                            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginVertical: 2 }} />

                            <Text style={s.paySectionLabel}>Payment 2</Text>
                            <View style={s.bookPayModeRow}>
                              {SPLIT_OPTS.filter(m => m.id !== splitM1).map(m => (
                                <Pressable key={m.id}
                                  style={[s.bookPayModeBtn, splitM2 === m.id && s.bookPayModeBtnActive]}
                                  onPress={() => setSplitM2(m.id)}>
                                  <Text style={[s.bookPayModeTxt, splitM2 === m.id && s.bookPayModeTxtActive]}>{m.label}</Text>
                                </Pressable>
                              ))}
                            </View>
                            <TextInput
                              style={s.cashInput} keyboardType="decimal-pad" placeholder="0.00" maxLength={12}
                              placeholderTextColor={C.ink4} value={splitA2}
                              onChangeText={v => {
                                const sv = sanitizeMoney(v);
                                setSplitA2(sv);
                                const rem = +(total - (parseFloat(sv) || 0)).toFixed(2);
                                setSplitA1(rem > 0 ? rem.toFixed(2) : "");
                              }}
                            />
                            {splitM2 !== "cash" && (
                              <TextInput style={s.refInput} placeholder="Reference No." placeholderTextColor={C.ink4}
                                value={splitR2} onChangeText={setSplitR2} autoCapitalize="characters" />
                            )}

                            {(splitA1Num > 0 || splitA2Num > 0) && (
                              <View style={[s.changeRow, { backgroundColor: splitSumErr ? C.badBg : splitValid ? C.goodBg : C.surface }]}>
                                <Text style={[s.changeLabel, { color: splitSumErr ? C.bad : splitValid ? C.good : C.ink3 }]}>
                                  {peso(splitA1Num)} + {peso(splitA2Num)} = {peso(splitSum)}
                                  {splitSumErr ? `  ⚠ must be ${peso(total)}` : splitValid ? "  ✓" : ""}
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })()}

                      {/* Cash input — shown for all order types when cash selected
                          (but never for an unpaid tab, which collects nothing now) */}
                      {payMethod === "cash" && !isUnpaidTab && (
                        <View style={s.cashWrap}>
                          {/* Amount Paying Now — only in partial mode */}
                          {isPartialActive && (
                            <>
                              <Text style={s.cashLabel}>
                                Amount Paying Now <Text style={{ color: C.bad }}>*</Text>
                                <Text style={{ color: C.ink4, fontWeight: "400" }}> (of {peso(total)})</Text>
                              </Text>
                              <TextInput
                                style={s.cashInput}
                                keyboardType="decimal-pad" placeholder="0.00" maxLength={12}
                                placeholderTextColor={C.ink4}
                                value={partialAmtInput} onChangeText={v => setPartialAmtInput(sanitizeMoney(v))}
                              />
                              {partialAmtNum > 0 && partialAmtNum < total && (
                                <View style={[s.changeRow, { backgroundColor: C.infoBg }]}>
                                  <Text style={[s.changeLabel, { color: C.ink2 }]}>
                                    Balance due: {peso(+(total - partialAmtNum).toFixed(2))}
                                  </Text>
                                </View>
                              )}
                              {partialAmtNum >= total && (
                                <View style={[s.changeRow, { backgroundColor: C.badBg }]}>
                                  <Text style={[s.changeLabel, { color: C.bad }]}>
                                    Partial amount must be less than total
                                  </Text>
                                </View>
                              )}
                            </>
                          )}

                          <Text style={s.cashLabel}>Cash Received</Text>
                          <TextInput
                            style={s.cashInput}
                            keyboardType="decimal-pad" placeholder="0.00" maxLength={12}
                            placeholderTextColor={C.ink4}
                            value={cashInput}
                            onFocus={() => payScrollRef.current?.scrollToEnd({ animated: true })}
                            onChangeText={v => {
                              const sv = sanitizeMoney(v);
                              setCashInput(sv);
                              const n = parseFloat(sv) || 0;
                              if (n > 0 && n >= (isPartialActive ? partialAmtNum : collectAmt)) {
                                setTimeout(() => payScrollRef.current?.scrollToEnd({ animated: true }), 150);
                              }
                            }}
                          />
                          <View style={s.quickAmounts}>
                            {[isPartialActive ? partialAmtNum : collectAmt,
                              Math.ceil((isPartialActive ? partialAmtNum : collectAmt) / 100) * 100, 500, 1000]
                              .filter(a => a > 0)
                              .filter((a, i, arr) => arr.indexOf(a) === i)
                              .map(amt => (
                                <Pressable key={amt} style={s.quickAmt} onPress={() => setCashInput(amt.toFixed(2))}>
                                  <Text style={s.quickAmtText}>{peso(amt)}</Text>
                                </Pressable>
                              ))}
                          </View>
                          {effectiveCash > 0 && (
                            <View style={[s.changeRow, { backgroundColor: effectiveChange >= 0 ? C.goodBg : C.badBg }]}>
                              <Text style={[s.changeLabel, { color: effectiveChange >= 0 ? C.good : C.bad }]}>
                                Change: {peso(Math.abs(effectiveChange))} {effectiveChange < 0 ? "⚠ insufficient" : ""}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Digital payment info + reference */}
                      {payMethod !== "cash" && payMethod !== "split" && (
                        <>
                          <View style={s.payInfo}>
                            <Text style={s.payInfoText}>
                              {payMethod === "gcash"
                                ? (payConfig.gcashNumber
                                    ? `GCash  ${payConfig.gcashNumber}${gcashNameLine}`
                                    : "Show GCash QR to customer\nSet your number in Settings → Payment Methods")
                                : payMethod === "maya"
                                ? (payConfig.mayaNumber
                                    ? `Maya  ${payConfig.mayaNumber}${mayaNameLine}`
                                    : "Show Maya QR to customer\nSet your number in Settings → Payment Methods")
                                : payMethod === "card"
                                ? "Swipe or tap card on terminal"
                                : payMethod === "bank_transfer"
                                ? (resolveBankDisplay(payConfig) || "Ask customer to transfer\nSet account details in Settings → Payment Methods")
                                : (payConfig.qrphInfo || "Show QR PH code to customer\nSet details in Settings → Payment Methods")}
                            </Text>
                          </View>
                          <View style={s.refWrap}>
                            <Text style={s.cashLabel}>
                              {payMethod === "card" ? "Terminal Reference No." : "Transaction Reference No."}
                              <Text style={{ color: C.bad }}> *</Text>
                            </Text>
                            <TextInput
                              style={s.refInput}
                              // Any non-empty value is accepted (no length/format
                              // requirement client or server side) — the old
                              // "GC123456789" example implied a long number was
                              // required, when some banks/providers only ever
                              // show a short 3-4 character reference.
                              placeholder="e.g. 1234"
                              placeholderTextColor={C.ink4}
                              value={refNumber}
                              onChangeText={setRefNumber}
                              autoCapitalize="characters"
                              autoCorrect={false}
                            />
                            {!refNumber.trim() && (
                              <Text style={s.refHint}>Enter the reference number before confirming</Text>
                            )}
                          </View>
                        </>
                      )}
                    </>
                  )}

                </ScrollView>

                {/* ── Footer ── */}
                <View style={[s.payFooter, { paddingBottom: bottomInset + 14 }]}>
                  <Pressable style={s.cancelPayBtn} onPress={() => onClose()}>
                    <Text style={s.cancelPayBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[s.confirmBtn, confirmDisabled && { opacity: 0.6 }]}
                    onPress={() => {
                      if (payMethod === "split") {
                        void onSplitConfirm({
                          method1: { method: splitM1, amount: splitA1Num, reference: splitR1.trim() || undefined },
                          method2: { method: splitM2, amount: splitA2Num, reference: splitR2.trim() || undefined },
                        });
                      } else {
                        onSubmit();
                      }
                    }}
                    disabled={confirmDisabled}
                  >
                    {submitting ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <ActivityIndicator size="small" color="#000000" />
                        <Text style={s.confirmBtnText}>{confirmLabel}</Text>
                      </View>
                    ) : (
                      <Text style={s.confirmBtnText}>{confirmLabel}</Text>
                    )}
                  </Pressable>
                </View>
                </View>
                </View>
              );
            })()}

            {/* Full-screen processing overlay — the "Processing…" button-label
                swap alone was too easy to miss (small text, no full-screen
                cue), so a cashier tapping Confirm during a slow network round
                trip (order create + payment settle calls) saw no visible
                change and assumed the tap didn't register, then tapped other
                controls. This sits on top of everything, blocks all touches
                underneath (default pointerEvents, no "none"/"box-none"), and
                is impossible to miss. */}
            {submitting && (
              <View style={localS.processingOverlay}>
                <ActivityIndicator size="large" color={C.amber} />
                <Text style={localS.processingText}>Processing order…</Text>
              </View>
            )}

        </KeyboardSheet>
      </Modal>
  );
}

const localS = StyleSheet.create({
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  processingText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
});

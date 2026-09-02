import {
  Modal, View, Text, Pressable, ScrollView, StyleSheet, Platform, ToastAndroid, Image, TextInput, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useState, useEffect, useRef } from "react";
import {
  loadReceiptConfig, ReceiptConfig, EMPTY_RECEIPT_CONFIG, ReceiptPayload, ReceiptCharge, formatCashierName,
} from "./receiptConfig";
import { generateReceiptHtml } from "./generateReceiptHtml";
import { printReceipt } from "./receiptPrintUtils";
import { printDrinkLabels } from "./labelPrintUtils";
import { printStationTickets } from "./stationTicketPrintUtils";
import type { StationTicketStation } from "./generateStationTicketEscPos";
import { usePrinterConfig } from "./printerConfig";
import { invokeFn } from "../../services/supabase";
import { useAuth } from "../auth/AuthContext";
import { EscPrinterNative, isIminPrinterAvailable } from "../../modules/esc-printer";
import { useToast } from "../ui/ToastProvider";
import { KeyboardSheet } from "../ui/KeyboardSheet";
import { isValidEmail } from "../utils/inputSanitizers";

const MONO  = Platform.select({ ios: "Courier New", android: "monospace", default: "monospace" });
const INK   = "#000000";
const INK2  = "#555048";
const INK3  = "#9a948c";
const PAPER = "#fffef9";

function openCashDrawer() {
  if (EscPrinterNative) {
    EscPrinterNative.openCashDrawer().catch(() => {
      ToastAndroid.show("Cash drawer: check printer connection", ToastAndroid.SHORT);
    });
  } else {
    ToastAndroid.show("Cash drawer (ESC/POS not available in this build)", ToastAndroid.SHORT);
  }
}

const PAY_LABEL: Record<string, string> = {
  cash: "Cash", gcash: "GCash", maya: "Maya", qrph: "QR Ph", card: "Card",
  bank_transfer: "Bank Transfer", other: "Other",
};

const peso = (n: number) => `₱${n.toFixed(2)}`;

interface Props {
  readonly visible:   boolean;
  readonly payload:   ReceiptPayload | null;
  readonly storeName: string;
  readonly onClose:   () => void;
  readonly onReprint?: () => Promise<void>;
  readonly isReprint?: boolean;
}

export function ReceiptModal({ visible, payload, storeName, onClose, onReprint, isReprint }: Props) {
  const insets = useSafeAreaInsets();
  const [config, setConfig]         = useState<ReceiptConfig>(EMPTY_RECEIPT_CONFIG);
  const [printing, setPrinting]         = useState(false);
  const [labelPrinting, setLabelPrinting] = useState(false);
  const [ticketPrinting, setTicketPrinting] = useState(false);
  const [claimedVoucher, setClaimedVoucher] = useState<string | null>(null);
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [emailInput, setEmailInput]               = useState("");
  const [emailSending, setEmailSending]           = useState(false);
  const [emailStatus, setEmailStatus]             = useState<"idle" | "success" | "error">("idle");
  const [emailStatusMsg, setEmailStatusMsg]       = useState("");
  const claimedOrderId    = useRef<string | null>(null);
  const printer = usePrinterConfig();
  const { activeWorkspaceId } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    if (!visible) return;
    loadReceiptConfig().then((cfg) => {
      setConfig(cfg);

      // Voucher claim
      if (
        cfg.wifiSsid &&
        payload?.orderId &&
        payload.orderId !== claimedOrderId.current &&
        activeWorkspaceId
      ) {
        claimedOrderId.current = payload.orderId;
        invokeFn<{ code?: string }>("vouchers-claim", {
          workspace_id: activeWorkspaceId,
          order_id:     payload.orderId,
        }).then(({ data }) => {
          if (data?.code) setClaimedVoucher(data.code as string);
        });
      }

      // Auto-print used to happen here (on the modal becoming visible) — removed:
      // order.tsx now fires printOrderReceipt() itself immediately on checkout
      // success, independent of whether this modal ever opens. This effect only
      // ever ran for that one non-reprint usage (every other ReceiptModal call
      // site passes isReprint), so once checkout prints on its own, opening
      // "View Receipt" right after just re-triggered a second physical print of
      // the same receipt. Passing isReprint=true here instead (to reuse the
      // existing skip) isn't right either — it also hides the "Open Cash
      // Drawer" button below, which a cashier legitimately wants right after a
      // cash sale.

      // Labels are NOT auto-printed — cashier clicks "Print Label Sticker" manually.
    });
  }, [visible, payload?.orderId, activeWorkspaceId]);

  const effectiveVoucher = claimedVoucher ?? payload?.voucherCode ?? null;

  async function handlePrint() {
    if (!payload) return;
    setPrinting(true);
    const printPayload = effectiveVoucher
      ? { ...payload, voucherCode: effectiveVoucher }
      : payload;
    // Receipt, kitchen/drinks tickets, and drink labels are each attempted
    // independently (own try/catch) — a failure in ANY one of them must
    // never prevent the others from being attempted. This used to be a
    // single try block where the receipt print ran first: if the receipt
    // printer jammed or ran out of paper, an exception there skipped the
    // kitchen/drinks ticket code entirely, even though that's normally a
    // SEPARATE physical printer and is operationally more critical — the
    // kitchen needs to know what to cook regardless of what happened to the
    // customer's receipt.
    const failures: string[] = [];
    let receiptOk = false;
    try {
      if (EscPrinterNative) {
        try {
          // Silent print — no system dialog. Routes to IMIN's structured
          // print SDK on built-in-printer terminals, raw ESC/POS otherwise.
          await printReceipt(printPayload, config, storeName, printer);
          receiptOk = true;
        } catch (e: any) {
          failures.push(`Receipt: ${e?.message ?? "failed"}`);
        }

        // Bundled here (not just the auto-print path) so the single "Print"
        // button covers receipt + tickets + labels in one go instead of
        // requiring 3 separate manual taps — and now runs unconditionally,
        // not gated on the receipt print above having succeeded.
        if (!isBookingReceipt) {
          // The receipt print above just SUBMITTED its job (IMIN's
          // commitPrinterBuffer resolves on submission, not on the physical
          // head finishing) — the printer can still be mid-way through the
          // 2-copy receipt when the very next enterPrinterBuffer(true) for
          // the kitchen ticket fires, and that isClean=true flag can discard
          // the receipt job that's still printing, or corrupt the kitchen
          // job that follows it. This reliably dropped the kitchen ticket
          // (the first ticket in the sequence) while drinks/checklist —
          // already spaced 2s apart from each other — came through fine.
          // Same fixed wait used between every other station below.
          if (await isIminPrinterAvailable()) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          try { await printStationTickets(printPayload, printer); }
          catch (e: any) { failures.push(`Kitchen/Drinks/Server tickets: ${e?.message ?? "failed"}`); }

          if (printer.labelPrinterId) {
            try { await printDrinkLabels(printPayload, printer); }
            catch (e: any) {
              const msg: string = e?.message ?? "";
              // "No drink items in this order" is expected for a food-only
              // order, not a failure — don't alarm the cashier over it.
              if (!msg.includes("No drink items")) failures.push(`Drink labels: ${msg || "failed"}`);
            }
          }
        }
      } else {
        // Fallback: system print dialog (non-INSA devices) — no separate
        // station-ticket/label path exists here.
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const Print = require("expo-print");
          const html = generateReceiptHtml(printPayload, config, storeName, {
            paperWidth:  printer.paperWidth === "80" ? "80" : "58",
            copies:      printer.copies,
            receiptMode: printer.receiptMode,
            showTin:     printer.showTin,
          });
          await Print.printAsync({ html });
          receiptOk = true;
        } catch (e: any) {
          const msg: string = e?.message ?? "";
          failures.push(msg.includes("Cannot find module") || msg.includes("Unable to resolve")
            ? "Print not available — run: npx expo install expo-print"
            : `Receipt: ${msg || "failed"}`);
        }
      }
      if (failures.length > 0) {
        showToast({
          title: receiptOk ? "Receipt printed — check kitchen/drinks" : "Print failed",
          message: failures.join("  •  "),
          type: "error",
        });
      }
    } finally {
      setPrinting(false);
    }
  }

  async function handlePrintLabels() {
    if (!payload) return;
    if (!printer.labelPrinterId) {
      showToast({
        title: "No label printer configured",
        message: "Pair your XP-365B first: go to POS → Settings → Printers → Label Printer and select your device.",
        type: "error",
      });
      return;
    }
    setLabelPrinting(true);
    try {
      await printDrinkLabels(payload, printer);
      ToastAndroid.show("Labels sent to printer", ToastAndroid.SHORT);
    } catch (e: any) {
      showToast({ title: "Label print failed", message: e?.message || "Could not send labels to printer.", type: "error" });
    } finally {
      setLabelPrinting(false);
    }
  }

  async function handlePrintTickets() {
    if (!payload) return;
    setTicketPrinting(true);
    try {
      await printStationTickets(payload, printer);
      ToastAndroid.show("Tickets sent to printer", ToastAndroid.SHORT);
    } catch (e: any) {
      showToast({ title: "Ticket print failed", message: e?.message || "Could not send tickets to printer.", type: "error" });
    } finally {
      setTicketPrinting(false);
    }
  }

  function openEmailModal() {
    // Pre-fill with guest email if available from bookings
    const guestEmail = payload?.bookings?.[0]?.guestEmail ?? "";
    setEmailInput(guestEmail);
    setEmailStatus("idle");
    setEmailStatusMsg("");
    setEmailModalVisible(true);
  }

  async function handleSendEmail() {
    if (!payload?.orderId || !activeWorkspaceId || !emailInput.trim()) return;
    setEmailSending(true);
    setEmailStatus("idle");
    setEmailStatusMsg("");
    try {
      const { data, error } = await invokeFn<{ sent: boolean; email: string }>(
        "receipts-email",
        {
          workspace_id: activeWorkspaceId,
          order_id:     payload.orderId,
          email:        emailInput.trim(),
          customer_name: payload.customerName || undefined,
        },
      );
      const docLabel = isBookingReceipt ? "Booking confirmation" : "Receipt";
      if (error) {
        setEmailStatus("error");
        setEmailStatusMsg(error.message || `Failed to send ${docLabel.toLowerCase()}.`);
      } else if (data?.sent) {
        setEmailStatus("success");
        setEmailStatusMsg(`${docLabel} sent to ${data.email}`);
      } else {
        setEmailStatus("error");
        setEmailStatusMsg(`${docLabel} could not be sent.`);
      }
    } catch (e: any) {
      setEmailStatus("error");
      setEmailStatusMsg(e?.message || "Unexpected error.");
    } finally {
      setEmailSending(false);
    }
  }

  if (!payload) return null;

  const {
    orderNo, items, bookings, charges, subtotal, tax, taxRatePct, serviceFee, svcRatePct,
    discount, total, cashAmt, change, payMethod, refNumber, splitPayments, orderType, tableNo,
    customerName, internalNote, cashierName, timestamp, bookPayMode, depositPaid, amountPaid, balanceDue: orderBalanceDue,
  } = payload;
  const isBookingReceipt = bookings.length > 0 && items.length === 0;
  const balanceDue = depositPaid != null ? total - depositPaid : 0;
  const hasPartialBalance = orderBalanceDue != null && orderBalanceDue > 0;

  // Kitchen/drinks ticket preview — mirrors what generateStationTicketEscPos
  // routes to the station printers. Only shown when the order actually has
  // items for a station (same filter the real ticket uses).
  const kitchenCount = items.filter((i) => i.prep_station === "kitchen").length;
  const drinksCount  = items.filter((i) => i.prep_station === "drinks").length;
  const hasStationTickets = !isBookingReceipt && (kitchenCount > 0 || drinksCount > 0);

  const vatPct = (taxRatePct * 100).toFixed(0);
  const svcPct = (svcRatePct * 100).toFixed(0);
  const dateStr = new Date(timestamp).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });

  let printLabel = isBookingReceipt
    ? (isReprint ? "Reprint Confirmation" : (printer.copies >= 2 ? "Print Confirmation (×2)" : "Print Confirmation"))
    : (isReprint ? "Reprint Receipt" : (printer.copies >= 2 ? "Print 2 Copies" : "Print Receipt"));
  if (printing) printLabel = "Opening…";

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>

          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.paper}
            showsVerticalScrollIndicator={false}
          >
            {/* Top perforation */}
            <View style={s.perf} />

            {/* Store header */}
            {!!config.receiptLogo && (
              <Image
                source={{ uri: config.receiptLogo }}
                style={s.logo}
                resizeMode="contain"
              />
            )}
            <Text style={[s.storeName, s.c]}>{storeName || "—"}</Text>
            {!!config.address && (
              <Text style={[s.meta, s.c]}>{config.address}</Text>
            )}
            {printer.receiptMode === "official" && printer.showTin && !!config.tin && (
              <Text style={[s.meta, s.c]}>TIN NO: {config.tin}</Text>
            )}
            <Text style={[s.orBadge, s.c]}>
              {isBookingReceipt
                ? "BOOKING CONFIRMATION"
                : printer.receiptMode === "official" ? "SALES INVOICE" : "SALES ORDER"}
            </Text>

            <Dash />

            <Row label="Order No." value={`${config.orderNoPrefix}${orderNo}`} />
            <Row label="Date"     value={dateStr} />
            {!!tableNo      && <Row label="Table"    value={tableNo} />}
            <Row label="Customer" value={customerName || "Walk-in"} />
            {!!cashierName  && <Row label="Cashier"  value={formatCashierName(cashierName) ?? cashierName} />}
            {!isBookingReceipt && <Row label="Type" value={orderType.replaceAll("_", " ").toUpperCase()} />}
            {!!internalNote && <Row label="Note" value={internalNote} />}

            <Dash />

            {/* Items header */}
            <View style={s.colHead}>
              <Text style={[s.colItem, s.colLbl]}>ITEM</Text>
              <Text style={[s.colQty,  s.colLbl]}>QTY</Text>
              <Text style={[s.colAmt,  s.colLbl]}>AMOUNT</Text>
            </View>

            {items.map((it) => (
              <View key={`item-${it.name}-${it.qty}`} style={s.lineItem}>
                <View style={s.colItem}>
                  <Text style={s.itemName}>{it.sku ? `${it.sku} ${it.name}` : it.name}</Text>
                  {!!it.notes && <Text style={s.itemNote}>{it.notes}</Text>}
                  {!!it.discount && <Text style={s.itemNote}>{`Discount -${peso(it.discount)}`}</Text>}
                </View>
                <Text style={s.colQty}>×{it.qty}</Text>
                <Text style={s.colAmt}>{peso(it.price * it.qty)}</Text>
              </View>
            ))}
            {bookings.map((b) => (
              <View key={`booking-${b.name}`} style={s.lineItem}>
                <View style={s.colItem}>
                  <Text style={s.itemName}>{b.name}</Text>
                  {!!b.checkIn && (
                    <Text style={s.itemNote}>{b.checkIn}{b.checkOut ? ` → ${b.checkOut}` : ""}</Text>
                  )}
                  {!!b.guestName  && <Text style={s.itemNote}>Guest: {b.guestName}</Text>}
                  {!!b.guestPhone && (
                    <View style={s.itemNoteRow}>
                      <Feather name="phone" size={9} color={INK3} />
                      <Text style={s.itemNote}>{b.guestPhone}</Text>
                    </View>
                  )}
                  {!!b.guestEmail && (
                    <View style={s.itemNoteRow}>
                      <Feather name="mail" size={9} color={INK3} />
                      <Text style={s.itemNote}>{b.guestEmail}</Text>
                    </View>
                  )}
                  {!!b.bookingRef && <Text style={s.itemNote}>Ref: {b.bookingRef}</Text>}
                </View>
                <Text style={s.colQty}>×1</Text>
                <Text style={s.colAmt}>{peso(b.total)}</Text>
              </View>
            ))}

            {/* Custom charges (corkage, delivery, etc.) */}
            {charges && charges.length > 0 && charges.map((ch: ReceiptCharge, idx: number) => (
              <View key={`charge-${idx}`} style={s.lineItem}>
                <View style={s.colItem}>
                  <Text style={s.itemName}>{ch.name}</Text>
                </View>
                <Text style={s.colQty}>—</Text>
                <Text style={s.colAmt}>{peso(ch.amount)}</Text>
              </View>
            ))}

            <Dash />

            <Row label="Subtotal" value={peso(subtotal)} />
            {printer.receiptMode === "official" && tax > 0        && <Row label={`VAT (${vatPct}%)`}     value={peso(tax)} />}
            {serviceFee > 0 && <Row label={`Svc Chg (${svcPct}%)`} value={peso(serviceFee)} />}
            {discount > 0 && <Row label={payload.is_senior_pwd ? "SC/PWD Discount (20%)" : "Discount"} value={`-${peso(discount)}`} />}

            {/* Total */}
            <View style={s.totalBlock}>
              <Text style={s.totalLabel}>TOTAL</Text>
              <Text style={s.totalValue}>{peso(total)}</Text>
            </View>

            <Dash />

            {/* Partial payment (non-booking orders) */}
            {!isBookingReceipt && orderBalanceDue != null && orderBalanceDue > 0 && (
              <>
                <Row label="Amount Paid" value={peso(amountPaid ?? 0)} />
                <View style={s.balanceRow}>
                  <Text style={s.balanceLbl}>BALANCE DUE</Text>
                  <Text style={s.balanceAmt}>{peso(orderBalanceDue)}</Text>
                </View>
              </>
            )}

            {/* Booking payment status */}
            {isBookingReceipt && bookPayMode === "unpaid" && (
              <View style={s.balanceRow}>
                <Text style={s.balanceLbl}>BALANCE DUE</Text>
                <Text style={s.balanceAmt}>{peso(total)}</Text>
              </View>
            )}
            {isBookingReceipt && bookPayMode === "deposit" && depositPaid != null && (
              <>
                <Row label="Deposit Paid"  value={peso(depositPaid)} />
                <Row label="Balance Due"   value={peso(balanceDue)} />
              </>
            )}

            {/* Payment method — hide for unpaid booking. Matches the printed
                receipt: method name is the label, "PAID" only shows when
                there's no outstanding balance (the Amount Paid/Balance Due
                rows above already cover partial payments). */}
            {(!isBookingReceipt || bookPayMode !== "unpaid") && (
              <>
                {splitPayments && splitPayments.length > 0 ? (
                  splitPayments.map((leg, idx) => (
                    <View key={`split-${idx}`}>
                      <Row label={(PAY_LABEL[leg.method] ?? leg.method).toUpperCase()} value={hasPartialBalance ? "" : "PAID"} />
                      <Row label="Amount" value={peso(leg.amount)} />
                      {!!leg.refNumber && <Row label="Reference" value={leg.refNumber} />}
                    </View>
                  ))
                ) : (
                  <>
                    <Row label={(PAY_LABEL[payMethod] ?? payMethod).toUpperCase()} value={hasPartialBalance ? "" : "PAID"} />
                    {payMethod === "cash" && cashAmt > 0 && <Row label="Cash"   value={peso(cashAmt)} />}
                    {payMethod === "cash" && cashAmt > 0 && change >= 0 && <Row label="Change" value={peso(change)} />}
                    {!!refNumber && <Row label="Reference" value={refNumber} />}
                  </>
                )}
              </>
            )}
            {!!effectiveVoucher && <Row label="WiFi Voucher" value={effectiveVoucher} />}

            {/* Non-refundable note for deposits */}
            {isBookingReceipt && (bookPayMode === "deposit" || bookPayMode === "full") && (
              <>
                <Dash />
                <Text style={[s.footer, s.c, { color: "#8b5c00", fontWeight: "700" }]}>
                  ⚠ Reservation fee is non-refundable.
                </Text>
                {bookPayMode === "deposit" && balanceDue > 0 && (
                  <Text style={[s.footer, s.c]}>
                    Full payment of {peso(total)} required before check-in.
                  </Text>
                )}
              </>
            )}

            {!!config.promoLine && (
              <>
                <Dash />
                <Text style={[s.promo, s.c]}>{config.promoLine}</Text>
              </>
            )}

            {!!config.footer && (
              <>
                <Dash />
                <Text style={[s.footer, s.c]}>{config.footer}</Text>
              </>
            )}

            {!!config.wifiSsid && (
              <>
                <Dash />
                <Text style={[s.footer, s.c]}>
                  WiFi: {config.wifiSsid}
                  {config.wifiCred ? `  |  ${config.wifiCred}` : ""}
                </Text>
              </>
            )}

            <Text style={[s.footer, s.c, { marginTop: 6 }]}>
              ** Thank you for your business! **
            </Text>

            {printer.receiptMode === "official" && Boolean(config.ptu_no || config.min_no || config.accred_no || config.serial_series) && (
              <View style={{ marginTop: 6 }}>
                {!!config.ptu_no        && <Text style={[s.footer, s.c]}>{`PTU No.: ${config.ptu_no}`}</Text>}
                {!!config.min_no        && <Text style={[s.footer, s.c]}>{`MIN: ${config.min_no}`}</Text>}
                {!!config.accred_no     && (
                  <Text style={[s.footer, s.c]}>
                    {config.accred_date
                      ? `Accred No.: ${config.accred_no} (${config.accred_date})`
                      : `Accred No.: ${config.accred_no}`}
                  </Text>
                )}
                {!!config.serial_series && <Text style={[s.footer, s.c]}>{`Series: ${config.serial_series}`}</Text>}
              </View>
            )}

            {/* Copy count hint */}
            {printer.copies >= 2 && (
              <Text style={[s.copyHint, s.c]}>
                Will print Customer Copy + Merchant Copy
              </Text>
            )}

            {/* Bottom perforation */}
            <View style={s.perf} />

            {/* Kitchen/drinks ticket preview — prep dockets, no prices */}
            {hasStationTickets && (
              <View style={s.ticketSection}>
                <Text style={[s.ticketSectionCaption, s.c]}>
                  KITCHEN / DRINKS TICKET PREVIEW
                </Text>
                <StationTicketPreview payload={payload} station="kitchen" />
                <StationTicketPreview payload={payload} station="drinks" />
              </View>
            )}
          </ScrollView>

          {/* Buttons */}
          <View style={[s.actions, { paddingBottom: 14 + insets.bottom }]}>
            <Pressable
              style={[s.printBtn, printing && { opacity: 0.6 }]}
              onPress={isReprint && onReprint ? onReprint : handlePrint}
              disabled={printing}
            >
              <Text style={s.printBtnTxt}>{printLabel}</Text>
            </Pressable>
            {!isBookingReceipt && items.length > 0 && (
              <Pressable
                style={[s.drawerBtn, labelPrinting && { opacity: 0.6 }]}
                onPress={handlePrintLabels}
                disabled={labelPrinting}
              >
                {labelPrinting ? (
                  <Text style={s.drawerBtnTxt}>Printing labels…</Text>
                ) : (
                  <View style={s.btnRow}>
                    <Feather name="tag" size={13} color={INK2} />
                    <Text style={s.drawerBtnTxt}>Print Label Sticker</Text>
                  </View>
                )}
              </Pressable>
            )}
            {!isBookingReceipt && items.length > 0 && (
              <Pressable
                style={[s.drawerBtn, ticketPrinting && { opacity: 0.6 }]}
                onPress={handlePrintTickets}
                disabled={ticketPrinting}
              >
                {ticketPrinting ? (
                  <Text style={s.drawerBtnTxt}>Printing tickets…</Text>
                ) : (
                  <View style={s.btnRow}>
                    <Feather name="thermometer" size={13} color={INK2} />
                    <Text style={s.drawerBtnTxt}>Print Kitchen/Drinks/Server Tickets</Text>
                  </View>
                )}
              </Pressable>
            )}
            {!!payload.orderId && (
              <Pressable style={s.emailBtn} onPress={openEmailModal}>
                <View style={s.btnRow}>
                  <Feather name="mail" size={13} color="#2d4fa0" />
                  <Text style={s.emailBtnTxt}>{isBookingReceipt ? "Email Confirmation" : "Email Receipt"}</Text>
                </View>
              </Pressable>
            )}
            {!isReprint && payMethod === "cash" && (
              <Pressable style={s.drawerBtn} onPress={openCashDrawer}>
                <Text style={s.drawerBtnTxt}>Open Cash Drawer</Text>
              </Pressable>
            )}
            <Pressable style={s.closeBtn} onPress={onClose}>
              <Text style={s.closeBtnTxt}>Close</Text>
            </Pressable>
          </View>

          {/* Email Receipt Modal */}
          <Modal
            transparent
            animationType="fade"
            visible={emailModalVisible}
            onRequestClose={() => setEmailModalVisible(false)}
          >
            <KeyboardSheet style={StyleSheet.absoluteFill}>
            <View style={[s.emailOverlay, { paddingBottom: 32 + insets.bottom }]}>
              <View style={s.emailBox}>
                <Text style={s.emailTitle}>{isBookingReceipt ? "Email Booking Confirmation" : "Email Receipt"}</Text>
                <TextInput
                  style={s.emailInput}
                  placeholder="customer@example.com"
                  placeholderTextColor="#9a948c"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={254}
                  value={emailInput}
                  onChangeText={setEmailInput}
                  editable={!emailSending}
                />
                {emailStatus === "success" && (
                  <Text style={s.emailSuccess}>{emailStatusMsg}</Text>
                )}
                {emailStatus === "error" && (
                  <Text style={s.emailError}>{emailStatusMsg}</Text>
                )}
                <View style={s.emailActions}>
                  {emailStatus === "success" ? (
                    <Pressable
                      style={[s.emailSendBtn, { flex: 1 }]}
                      onPress={() => setEmailModalVisible(false)}
                    >
                      <Text style={s.emailSendTxt}>Close</Text>
                    </Pressable>
                  ) : (
                    <>
                      <Pressable
                        style={s.emailCancelBtn}
                        onPress={() => setEmailModalVisible(false)}
                        disabled={emailSending}
                      >
                        <Text style={s.emailCancelTxt}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        style={[s.emailSendBtn, (!isValidEmail(emailInput) || emailSending) && { opacity: 0.5 }]}
                        onPress={handleSendEmail}
                        disabled={!isValidEmail(emailInput) || emailSending}
                      >
                        {emailSending
                          ? <ActivityIndicator size="small" color={PAPER} />
                          : <Text style={s.emailSendTxt}>Send</Text>
                        }
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            </View>
            </KeyboardSheet>
          </Modal>

        </View>
      </View>
    </Modal>
  );
}

function Dash() {
  return (
    <Text style={s.dash}>{"- - - - - - - - - - - - - - - - - - - -"}</Text>
  );
}

function StationTicketPreview({
  payload, station,
}: Readonly<{ payload: ReceiptPayload; station: StationTicketStation }>) {
  const items = (payload.items ?? []).filter((i) => i.prep_station === station);
  if (items.length === 0) return null;

  const label = station === "kitchen" ? "KITCHEN" : "DRINKS";
  const timeStr = new Date(payload.timestamp).toLocaleString("en-PH", {
    hour: "2-digit", minute: "2-digit",
  });
  const typeAndTable = [
    payload.orderType ? payload.orderType.replaceAll("_", " ").toUpperCase() : null,
    payload.tableNo ? `Table ${payload.tableNo}` : null,
  ].filter(Boolean).join("   ");

  return (
    <View style={s.ticket}>
      <Text style={[s.ticketStation, s.c]}>{`*** ${label} ***`}</Text>
      <Dash />
      <View style={s.row}>
        <Text style={s.ticketOrderLbl}>Order No.</Text>
        <Text style={s.ticketOrderVal}>{`#${payload.orderNo}`}</Text>
      </View>
      <View style={s.row}>
        <Text style={s.ticketMeta} numberOfLines={1}>{typeAndTable}</Text>
        <Text style={s.ticketMeta}>{timeStr}</Text>
      </View>
      <Dash />
      {items.map((it, idx) => (
        <View key={`${station}-${it.name}-${idx}`} style={s.ticketItem}>
          <Text style={s.ticketItemName}>{`${it.qty}×  ${it.sku ? `${it.sku} ` : ""}${it.name}`}</Text>
          {!!it.notes && <Text style={s.ticketItemNote}>{it.notes}</Text>}
          {(it.addons ?? []).map((ad, j) => (
            <Text key={`addon-${j}`} style={s.ticketItemNote}>
              {`+ ${ad.name}${ad.qty > 1 ? ` (${ad.qty}×)` : ""}`}
            </Text>
          ))}
        </View>
      ))}
      <Dash />
    </View>
  );
}

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    maxHeight: "88%",
    backgroundColor: PAPER,
    borderRadius: 3,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 24,
  },

  scroll: { flexShrink: 1 },
  paper:  { paddingHorizontal: 22 },

  perf: {
    height: 14,
    marginHorizontal: -22,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d8d2c4",
    backgroundColor: "#f5f0e8",
    marginVertical: 10,
  },

  logo:     { width: 120, height: 56, alignSelf: "center", marginBottom: 6 },
  c:        { textAlign: "center" },
  storeName:{ fontFamily: MONO, fontSize: 14, fontWeight: "700", color: INK, marginBottom: 2, letterSpacing: 0.3 },
  orBadge:  { fontFamily: MONO, fontSize: 10, fontWeight: "700", color: INK, letterSpacing: 3, marginTop: 5 },
  meta:     { fontFamily: MONO, fontSize: 10, color: INK2, lineHeight: 15 },

  dash:     { fontFamily: MONO, fontSize: 9, color: INK3, textAlign: "center", marginVertical: 7, letterSpacing: 0 },

  row:      { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginVertical: 2 },
  rowLabel: { fontFamily: MONO, fontSize: 11, color: INK2 },
  rowValue: { fontFamily: MONO, fontSize: 11, color: INK, flexShrink: 1, textAlign: "right", marginLeft: 10 },

  colHead:  { flexDirection: "row", marginTop: 2, marginBottom: 4 },
  colLbl:   { fontFamily: MONO, fontSize: 9, color: INK3, letterSpacing: 0.6, textTransform: "uppercase" },
  colItem:  { flex: 1 },
  colQty:   { width: 34, textAlign: "center", fontFamily: MONO, fontSize: 11, color: INK2 },
  colAmt:   { width: 80, textAlign: "right",  fontFamily: MONO, fontSize: 11, color: INK },
  lineItem: { flexDirection: "row", alignItems: "flex-start", marginVertical: 2 },
  itemName: { fontFamily: MONO, fontSize: 11, color: INK },
  itemNote: { fontFamily: MONO, fontSize: 9,  color: INK3 },
  itemNoteRow: { flexDirection: "row", alignItems: "center", gap: 3 },

  totalBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginVertical: 8,
    paddingVertical: 10,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: INK,
  },
  totalLabel: { fontFamily: MONO, fontSize: 16, fontWeight: "700", color: INK, letterSpacing: 1 },
  totalValue: { fontFamily: MONO, fontSize: 16, fontWeight: "700", color: INK },

  balanceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 6, paddingVertical: 6, borderTopWidth: 1, borderBottomWidth: 1, borderColor: INK },
  balanceLbl: { fontFamily: MONO, fontSize: 12, fontWeight: "700", color: INK, letterSpacing: 0.8 },
  balanceAmt: { fontFamily: MONO, fontSize: 14, fontWeight: "700", color: INK },

  promo:    { fontFamily: MONO, fontSize: 11, fontWeight: "700", color: INK, lineHeight: 16 },
  footer:   { fontFamily: MONO, fontSize: 10, color: INK3, lineHeight: 16 },
  copyHint: { fontFamily: MONO, fontSize: 9, color: INK3, marginTop: 8, letterSpacing: 0.3 },

  // Kitchen/drinks ticket preview
  ticketSection:        { marginTop: 2, marginBottom: 10 },
  ticketSectionCaption: { fontFamily: MONO, fontSize: 9, color: INK3, letterSpacing: 1.5, marginBottom: 10 },
  ticket: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cfc8b8",
    borderRadius: 3,
    backgroundColor: "#fffdf6",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  ticketStation:  { fontFamily: MONO, fontSize: 15, fontWeight: "700", color: INK, letterSpacing: 2 },
  ticketOrderLbl: { fontFamily: MONO, fontSize: 12, fontWeight: "700", color: INK },
  ticketOrderVal: { fontFamily: MONO, fontSize: 12, fontWeight: "700", color: INK },
  ticketMeta:     { fontFamily: MONO, fontSize: 10, color: INK2, flexShrink: 1 },
  ticketItem:     { marginVertical: 3 },
  ticketItemName: { fontFamily: MONO, fontSize: 13, fontWeight: "700", color: INK },
  ticketItemNote: { fontFamily: MONO, fontSize: 10, color: INK2, marginLeft: 16 },

  actions: {
    backgroundColor: PAPER,
    borderTopWidth: 1,
    borderTopColor: "#e4dfd4",
    padding: 14,
    gap: 8,
  },
  printBtn: {
    backgroundColor: INK,
    borderRadius: 5,
    padding: 14,
    alignItems: "center",
  },
  printBtnTxt: { color: PAPER, fontSize: 14, fontWeight: "700", fontFamily: MONO, letterSpacing: 0.5 },
  drawerBtn: {
    borderRadius: 5,
    padding: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#b8a98c",
    backgroundColor: "#f5f0e4",
  },
  drawerBtnTxt: { color: INK2, fontSize: 13, fontWeight: "600", fontFamily: MONO },
  btnRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  closeBtn: {
    padding: 12,
    alignItems: "center",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#ccc7bc",
  },
  closeBtnTxt: { color: INK2, fontSize: 13, fontFamily: MONO },

  emailBtn: {
    borderRadius: 5,
    padding: 13,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#4f72c0",
    backgroundColor: "#eef1fb",
  },
  emailBtnTxt: { color: "#2d4fa0", fontSize: 13, fontWeight: "600", fontFamily: MONO },

  // Email modal styles
  // Top-anchored, same rationale as Load Ticket's ticketModalBd — a centered
  // dialog's Send button ends up hidden behind the keyboard once the email
  // field is focused.
  emailOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 60,
    paddingHorizontal: 32,
    paddingBottom: 32,
  },
  emailBox: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: PAPER,
    borderRadius: 8,
    padding: 20,
    gap: 12,
  },
  emailTitle: { fontFamily: MONO, fontSize: 15, fontWeight: "700", color: INK, marginBottom: 2 },
  emailInput: {
    borderWidth: 1,
    borderColor: "#c8c4bc",
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: MONO,
    fontSize: 13,
    color: INK,
    backgroundColor: "#faf9f5",
  },
  emailSuccess: { fontFamily: MONO, fontSize: 12, color: "#2a7a46" },
  emailError:   { fontFamily: MONO, fontSize: 12, color: "#c03030" },
  emailActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  emailCancelBtn: {
    flex: 1, padding: 12, alignItems: "center", borderRadius: 5,
    borderWidth: 1, borderColor: "#ccc7bc",
  },
  emailCancelTxt: { color: INK2, fontSize: 13, fontFamily: MONO },
  emailSendBtn: {
    flex: 1, padding: 12, alignItems: "center", borderRadius: 5,
    backgroundColor: "#2d4fa0",
  },
  emailSendTxt: { color: PAPER, fontSize: 13, fontWeight: "700", fontFamily: MONO },
});

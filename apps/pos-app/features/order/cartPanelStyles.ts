/**
 * Cart-panel style factory.
 *
 * Extracted from app/pos/order.tsx so CartPanel, CartTotals and DiscountModal
 * can share one stylesheet without the screen file owning ~200 lines of styles.
 * Theme-aware: call with the active colour tokens.
 */
import { StyleSheet, Platform } from "react-native";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
type C = ReturnType<typeof useTheme>["C"];

export const makeCpStyles = (C: C) => StyleSheet.create({
  panel: { width: 320, maxWidth: "38%", borderLeftWidth: 1, borderLeftColor: C.line, backgroundColor: C.bg2, flexGrow: 0, flexShrink: 0, padding: 14, gap: 10 },
  panelSheet: { width: "100%", maxWidth: "100%", borderLeftWidth: 0, flexGrow: 0, flexShrink: 0 },
  itemsSheet: { flex: 0, maxHeight: 240 },
  typeScroll: { flexGrow: 0, marginBottom: 4 },
  typeRow:    { gap: 6, flexDirection: "row" },
  typeBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  typeBtnActive:     { borderColor: C.amber, backgroundColor: C.amberBg },
  typeBtnText:       { color: C.ink3, fontSize: 12 },
  typeBtnTextActive: { color: C.amber, fontWeight: "600" },
  orderInfoHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 6,
  },
  orderInfoHeaderText: { flex: 1, color: C.ink2, fontSize: 12, fontWeight: "600" },
  itemCountPill: {
    backgroundColor: C.amberBg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
  },
  itemCountPillText: { color: C.amber, fontSize: 11, fontWeight: "700" },
  inputRow: { flexDirection: "row", gap: 8 },
  input: { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 9, color: C.ink, fontSize: 13 },
  items:     { flex: 1 },
  empty:      { paddingVertical: 40, alignItems: "center", gap: 6 },
  emptyText:  { color: C.ink4, fontSize: 13 },
  emptySubText: { color: C.ink4, fontSize: 11, textAlign: "center", lineHeight: 16 },
  item:      { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  itemName:    { color: C.ink, fontSize: 13, fontWeight: "500" },
  itemSku:     { color: C.ink4, fontSize: 10, fontWeight: "700", fontFamily: MONO, letterSpacing: 0.5 },
  itemAddon:   { color: C.ink4, fontSize: 11, fontFamily: MONO },
  itemNote:    { color: C.ink3, fontSize: 11, fontStyle: "italic", marginTop: 3 },
  itemNoteAdd: { color: C.ink4, fontSize: 11, marginTop: 3 },
  itemPrice:   { color: C.amber, fontSize: 12, fontFamily: MONO, marginTop: 2 },
  // Top-anchored + scrollable, same rationale as ticketModalBd/discModalBd —
  // a centered sheet's Save button ends up hidden behind the keyboard when
  // the free-text field is focused.
  noteBackdrop:    {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-start", alignItems: "center",
    paddingTop: 60, paddingHorizontal: 24, paddingBottom: 24,
  },
  noteSheet:       { width: "100%", maxWidth: 480, maxHeight: "80%", backgroundColor: C.bg, borderRadius: 14, overflow: "hidden" },
  noteHeader:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
  noteContent:     { paddingHorizontal: 20, gap: 14 },
  noteGroupLabel:  { color: C.ink4, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  noteChip:        { borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  noteChipActive:  { backgroundColor: C.amber, borderColor: C.amber },
  noteChipTxt:     { color: C.ink3, fontSize: 13 },
  noteChipTxtActive: { color: "#fff", fontWeight: "600" },
  noteTitle:   { color: C.ink, fontSize: 15, fontWeight: "600" },
  noteInput:   { backgroundColor: C.bg2, borderRadius: 8, borderWidth: 1, borderColor: C.line, color: C.ink, fontSize: 14, padding: 10, minHeight: 80, textAlignVertical: "top" },
  noteActions: {
    flexDirection: "row", gap: 10,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
    borderTopWidth: 1, borderTopColor: C.lineSoft,
  },
  noteClear:   { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: C.line, alignItems: "center", paddingVertical: 10 },
  noteClearTxt:{ color: C.ink3, fontSize: 14 },
  noteSave:    { flex: 2, borderRadius: 8, backgroundColor: C.amber, alignItems: "center", paddingVertical: 10 },
  noteSaveTxt: { color: "#fff", fontSize: 14, fontWeight: "600" },
  qtyRow:    { flexDirection: "row", alignItems: "center", gap: 6 },
  qtyBtn:    { width: 28, height: 28, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" },
  qtyBtnText:{ color: C.ink, fontSize: 16, lineHeight: 22 },
  qty:       { color: C.ink, fontSize: 14, fontFamily: MONO, minWidth: 20, textAlign: "center" },

  // Bookings section in cart
  bookingSection:     { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line },
  bookingSectionLabel:{ color: C.ink4, fontSize: 9, letterSpacing: 1, fontFamily: MONO, marginBottom: 6 },
  bookingItem: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.lineSoft,
  },
  bookingName:   { color: C.info, fontSize: 13, fontWeight: "600" },
  bookingTime:   { color: C.ink4, fontSize: 10, fontFamily: MONO, marginTop: 2 },
  bookingPrice:  { color: C.amber, fontSize: 12, fontFamily: MONO, marginTop: 3 },
  bookingRemove: { width: 24, height: 24, borderRadius: R.md, alignItems: "center", justifyContent: "center", backgroundColor: C.badBg },
  bookingRemoveTxt: { color: C.bad, fontSize: 12 },

  // Custom charges section
  chargeSection:     { marginTop: 8, paddingTop: 4 },
  chargeSectionLabel:{ color: C.ink4, fontSize: 9, letterSpacing: 1, fontFamily: MONO, marginBottom: 6 },
  chargeItem: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.lineSoft,
  },
  chargeName:  { color: C.ink2, fontSize: 13, fontWeight: "500" },
  chargePrice: { color: C.amber, fontSize: 12, fontFamily: MONO, marginTop: 2 },
  addChargeBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    marginTop: 6, paddingVertical: 7, paddingHorizontal: 10,
    borderRadius: R.md, borderWidth: 1, borderColor: C.lineSoft,
    backgroundColor: C.surface, alignSelf: "flex-start",
  },
  addChargeBtnTxt: { color: C.ink3, fontSize: 12 },

  // Discount row (tappable)
  discountRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 10, gap: 6,
  },
  discountLabel:    { color: C.ink3, fontSize: 12 },
  discountValue:    { color: C.amber, fontSize: 13, fontWeight: "700", fontFamily: MONO },
  discountValueSub: { color: C.ink4, fontSize: 11 },
  discountNone:     { color: C.ink4, fontSize: 12, fontStyle: "italic" },
  scPwdCheckbox: {
    width: 17, height: 17, borderRadius: 4, borderWidth: 2, borderColor: C.line,
    alignItems: "center", justifyContent: "center",
  },

  // Discount modal — top-anchored + scrollable, same rationale as
  // ticketModalBd/ticketSheet: a centered sheet's Apply/Remove buttons end
  // up hidden behind the keyboard when the voucher input is focused.
  discModalBd: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-start", alignItems: "center",
    paddingTop: 60, paddingHorizontal: 24, paddingBottom: 24,
  },
  discSheet: {
    backgroundColor: C.bg2, borderRadius: R.xl,
    width: "100%", maxWidth: 480, maxHeight: "80%", overflow: "hidden",
  },
  discContent: { paddingHorizontal: 20, gap: 14 },
  discHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10,
  },
  discTitle:  { color: C.ink, fontSize: 16, fontWeight: "700" },
  discTypeRow:{ flexDirection: "row", gap: 8 },
  discTypeBtn: {
    flex: 1, paddingVertical: 12, borderRadius: R.lg,
    alignItems: "center", backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
  },
  discTypeBtnActive:      { backgroundColor: C.amberBg, borderColor: `${C.amber}60` },
  discTypeBtnActiveGreen: { backgroundColor: C.goodBg,  borderColor: `${C.good}60` },
  discTypeBtnTxt:            { color: C.ink3, fontSize: 13, fontWeight: "600" },
  discTypeBtnTxtActive:      { color: C.amber, fontWeight: "700" },
  discTypeBtnTxtActiveGreen: { color: C.good,  fontWeight: "700" },
  discInput: {
    backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: `${C.amber}60`,
    paddingHorizontal: 16, paddingVertical: 16,
    color: C.amber, fontSize: 36, fontWeight: "700", fontFamily: MONO, textAlign: "center",
  },
  discPresets:   { flexDirection: "row", gap: 8 },
  discPreset: {
    flex: 1, paddingVertical: 11, alignItems: "center",
    backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line,
  },
  discPresetTxt: { color: C.ink2, fontSize: 13, fontWeight: "600", fontFamily: MONO },
  discPreview: {
    backgroundColor: `${C.good}18`, borderRadius: R.md, padding: 10, alignItems: "center",
  },
  discPreviewTxt: { color: C.good, fontSize: 14, fontWeight: "700", fontFamily: MONO },
  discActions: {
    flexDirection: "row", gap: 10,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
    borderTopWidth: 1, borderTopColor: C.lineSoft,
  },
  discClear: {
    flex: 1, paddingVertical: 13, borderRadius: R.lg,
    alignItems: "center", backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
  },
  discClearTxt:  { color: C.ink3, fontSize: 14, fontWeight: "600" },
  discApply: {
    flex: 2, paddingVertical: 13, borderRadius: R.lg,
    alignItems: "center", backgroundColor: C.good,
  },
  discApplyTxt: { color: "#000000", fontSize: 15, fontWeight: "700" },

  // Totals
  totals:     { paddingTop: 8, gap: 4 },
  totalRow:   { flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { color: C.ink3, fontSize: 12 },
  totalValue: { color: C.ink2, fontSize: 12, fontFamily: MONO },
  totalGrand: { paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line, marginTop: 4 },
  grandLabel: { color: C.ink, fontSize: 15, fontWeight: "600" },
  grandValue: { color: C.amber, fontSize: 18, fontWeight: "700", fontFamily: MONO },
  checkoutBtn:         { padding: 14, borderRadius: R.lg, alignItems: "center", backgroundColor: C.amber },
  checkoutBtnDisabled: { backgroundColor: C.surface2, opacity: 0.5 },
  checkoutBtnText:     { color: "#000000", fontSize: 15, fontWeight: "700" },
  clearBtn:    { alignItems: "center", paddingVertical: 6 },
  clearBtnText:{ color: C.ink4, fontSize: 12 },

  // Held cart banner
  heldBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: C.amberBg, borderRadius: R.md, borderWidth: 1, borderColor: `${C.amber}40`,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  heldBannerTxt: { color: C.amber, fontSize: 11, flex: 1, fontWeight: "600" },

  // Footer actions row (Add Charge + Hold)
  footerActions: { flexDirection: "row", gap: 6 },
  footerActionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 8, borderRadius: R.md,
    borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.surface,
  },
  footerActionTxt: { color: C.ink3, fontSize: 11, fontWeight: "600" },
});

/** Style object shared by the cart panel and its child components. */
export type CartPanelStyles = ReturnType<typeof makeCpStyles>;

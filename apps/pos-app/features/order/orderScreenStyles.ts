/**
 * Order-screen style factory.
 *
 * Extracted from app/pos/order.tsx — ~460 lines of StyleSheet kept out of the
 * screen file. Theme-aware: call with the active colour tokens.
 */
import { StyleSheet, Platform } from "react-native";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
type C = ReturnType<typeof useTheme>["C"];

export const makeStyles = (C: C) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.line, gap: 10,
  },
  menuBtn:      { paddingVertical: 4, paddingRight: 4 },
  fullscreenBtn: {
    width: 30, height: 30, borderRadius: R.md,
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
  },
  backBtn:      { flexDirection: "row", alignItems: "center", gap: 2, paddingRight: 6 },
  backText:     { color: C.amber, fontSize: 14, fontWeight: "600" },
  headerTitle:  { color: C.ink, fontSize: 16, fontWeight: "700" },
  shiftPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: R.full, borderWidth: 1,
    borderColor: `${C.good}50`, backgroundColor: `${C.good}18`,
  },
  shiftDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.good },
  shiftPillText: { color: C.good, fontSize: 11, fontWeight: "600", maxWidth: 80 },
  loadTicketBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: R.md, borderWidth: 1,
    borderColor: `${C.amber}50`, backgroundColor: C.amberBg,
  },
  loadTicketBtnText: { color: C.amber, fontSize: 12, fontWeight: "600" },
  cartBadge:    { position: "relative", padding: 4 },
  badge: {
    position: "absolute", top: 0, right: 0,
    backgroundColor: C.amber, borderRadius: 9, minWidth: 18, height: 18,
    alignItems: "center", justifyContent: "center",
  },
  badgeText: { color: "#000000", fontSize: 10, fontWeight: "700" },

  body: { flex: 1, flexDirection: "row" },
  bodyTablet: { flexDirection: "row" },
  productArea: { flex: 1, backgroundColor: C.bg },
  productAreaTablet: { flex: 1 },

  // Tab bar
  tabBar: {
    flexDirection: "row", backgroundColor: C.bg2,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  tabBtn: {
    flex: 1, paddingVertical: 11, alignItems: "center",
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabBtnActive: { borderBottomColor: C.amber },
  tabBtnText:   { color: C.ink3, fontSize: 13, fontWeight: "500" },
  tabBtnTextActive: { color: C.amber, fontWeight: "700" },

  // Products
  searchWrap: {
    flexDirection: "row", alignItems: "center",
    margin: 12, paddingHorizontal: 12,
    backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line,
  },
  searchIcon:  { fontSize: 16, color: C.ink3, marginRight: 6 },
  searchInput: { flex: 1, paddingVertical: 10, color: C.ink, fontSize: 14 },
  zoomGroup: {
    flexDirection: "row", alignItems: "center", gap: 2,
    marginLeft: 4, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: C.line,
  },
  zoomBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 6 },
  catBar:      { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: C.line },
  catScroll:   { flex: 1, flexShrink: 1, flexGrow: 1 },
  // paddingRight leaves room for the absolutely-positioned scroll-hint pill
  // (catScrollHint below) so it never overlaps the last real chip's text.
  catRow:      { paddingLeft: 12, paddingRight: 32, paddingVertical: 8, gap: 8, flexDirection: "row", alignItems: "center" },
  catScrollHint: {
    position: "absolute", top: 0, bottom: 0, right: 0,
    justifyContent: "center", paddingRight: 2,
  },
  catScrollHintPill: {
    backgroundColor: C.surface, borderRadius: R.full,
    borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 4, paddingVertical: 3,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 2,
  },
  oosToggle:   { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 8 },
  oosCheck:    { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: C.line, alignItems: "center", justifyContent: "center" },
  oosTxt:      { color: C.ink4, fontSize: 10.5, fontWeight: "500" },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: R.full, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
  },
  chipActive:     { backgroundColor: C.ink, borderColor: C.ink },
  chipText:       { color: C.ink3, fontSize: 13, fontWeight: "500" },
  chipTextActive: { color: C.bg },
  productGrid: { padding: 10, gap: 10 },
  productTile: {
    margin: 4,
    // Width AND height are set inline per-tile (ProductTile.tsx), derived from
    // the zoom-controlled card size — no flex:1 here, since a flexed tile
    // would stretch to fill its FlatList row and defeat a fixed physical
    // size that's consistent across screen widths and only changes on zoom.
    backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, overflow: "hidden",
  },
  productTileInCart:   { borderColor: `${C.amber}99` },
  productTilePressed:  { opacity: 0.75, transform: [{ scale: 0.97 }] },
  productImg: {
    // height set inline per-tile — see productTile comment above.
    backgroundColor: "#2a2318",
    alignItems: "center", justifyContent: "center",
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  productImgLabel:     { fontFamily: MONO, fontSize: 9, color: C.ink4, letterSpacing: 1 },
  productImgSku: {
    position: "absolute", top: 6, left: 6,
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1,
  },
  productImgSkuText:   { color: "#ffffff", fontSize: 10, fontWeight: "700", fontFamily: MONO, letterSpacing: 0.5 },
  productImgBadge: {
    position: "absolute", top: 6, right: 6,
    backgroundColor: C.amber, borderRadius: R.full, paddingHorizontal: 6, paddingVertical: 2,
  },
  productImgBadgeText: { color: "#000000", fontSize: 10, fontWeight: "700", fontFamily: MONO },
  // overflow hidden — body height is fixed inline per-tile, so content that
  // would otherwise grow the box (long name, low-stock line, etc.) is
  // clipped instead of stretching this card taller than its siblings.
  productBody:    { padding: 10, overflow: "hidden" },
  productName:    { color: C.ink, fontSize: 13, fontWeight: "500", marginBottom: 4, lineHeight: 17 },
  productPrice:   { color: C.amber, fontSize: 13, fontWeight: "700", fontFamily: MONO },
  productInCart:  { color: C.amber, fontSize: 10, fontWeight: "600", marginTop: 2, fontFamily: MONO, letterSpacing: 0.4 },
  productQtyStepper: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  productQtyBtn: {
    width: 24, height: 24, borderRadius: 6,
    backgroundColor: C.bg2, borderWidth: 1, borderColor: C.line,
    alignItems: "center", justifyContent: "center",
  },
  productQtyBtnIcon: { color: C.ink2 },
  productQtyNum: { flex: 1, textAlign: "center", color: C.ink, fontSize: 13, fontWeight: "700", fontFamily: MONO },
  productTileOutOfStock: { opacity: 0.6 },
  productOutOfStockOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  productOutOfStockText: { color: "#fff", fontSize: 10, fontWeight: "700", fontFamily: MONO, letterSpacing: 0.6, textTransform: "uppercase" },
  productLowStock: { color: C.warn ?? "#e8a020", fontSize: 10, fontWeight: "600", marginTop: 2, fontFamily: MONO, letterSpacing: 0.4 },
  loadingWrap:    { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 60 },
  loadingText:    { color: C.ink3, fontSize: 13 },
  emptyWrap:      { padding: 40, alignItems: "center" },
  emptyText:      { color: C.ink4, fontSize: 13 },

  // Resource tab
  resourceContent: { padding: 12, gap: 12 },
  resourceHint:    { color: C.ink4, fontSize: 12, textAlign: "center", paddingVertical: 4 },
  resourceGrid:    { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  resourceTile: {
    width: "47%", padding: 14,
    backgroundColor: C.surface, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line, gap: 4,
  },
  resourceTileActive: { borderColor: C.amber, backgroundColor: C.amberBg },
  resourceName: { color: C.ink, fontSize: 14, fontWeight: "700" },
  resourceCap:  { color: C.ink4, fontSize: 11 },
  resourceRate: { color: C.ink3, fontSize: 12, fontFamily: MONO, marginTop: 4 },

  // Booking form (amenity inline)
  bForm: {
    padding: 16, backgroundColor: C.surface, borderRadius: R.lg,
    borderWidth: 1, borderColor: `${C.amber}44`, gap: 10,
  },

  // Room compact summary card (left panel)
  bRoomCard: {
    padding: 16, backgroundColor: C.surface, borderRadius: R.lg,
    borderWidth: 1, borderColor: `${C.amber}44`, gap: 10,
  },
  bRoomCardMeta:  { gap: 3 },
  bRoomCardTime:  { color: C.ink3, fontSize: 12, fontFamily: MONO },
  bRoomCardGuest: { color: C.ink2, fontSize: 12 },
  bRoomCardActions: { flexDirection: "row", gap: 8 },
  bRoomEditBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: R.md,
    borderWidth: 1, borderColor: `${C.amber}50`, backgroundColor: `${C.amber}0d`,
  },
  bRoomEditBtnTxt: { color: C.amber, fontSize: 12, fontWeight: "600" },

  // Room Booking Modal — maximized full-screen, generous scroll headroom so
  // the long form (dates, times, guest, contact, notes) can always be
  // scrolled clear of the keyboard instead of the last fields getting stuck
  // behind it.
  bookingModalHead: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.lineSoft,
  },
  bookingModalTitle: { color: C.ink, fontSize: 17, fontWeight: "700" },
  bookingModalSub:   { color: C.ink3, fontSize: 12, marginTop: 2 },
  bookingModalBody:  { padding: 20, flex: 1, minHeight: 0 },
  bookingModalForm:  { gap: 10, paddingBottom: 180 },

  // Summary column (tablet)
  bookingModalSummary: {
    width: 200, backgroundColor: C.surface, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line, padding: 16, gap: 12, alignSelf: "flex-start",
  },
  bookingModalSummaryTitle: {
    color: C.ink3, fontSize: 10, letterSpacing: 0.8, fontFamily: MONO,
    textTransform: "uppercase", marginBottom: 4,
  },
  bookingModalSummaryRow: { gap: 2 },
  bookingModalSummaryLbl: { color: C.ink4, fontSize: 9, fontFamily: MONO, letterSpacing: 0.6 },
  bookingModalSummaryVal: { color: C.ink2, fontSize: 13, fontWeight: "500" },
  bookingModalSummaryTotalRow: {
    paddingTop: 10, borderTopWidth: 1, borderTopColor: C.lineSoft, gap: 2,
  },
  bookingModalSummaryTotalLbl: { color: C.ink3, fontSize: 10, fontFamily: MONO },
  bookingModalSummaryTotalVal: { color: C.amber, fontSize: 20, fontWeight: "700", fontFamily: MONO },

  // Modal footer
  bookingModalFooter: {
    flexDirection: "row", gap: 10,
    padding: 16, borderTopWidth: 1, borderTopColor: C.line,
  },
  bookingModalCancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: R.lg,
    alignItems: "center", backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
  },
  bookingModalCancelBtnTxt: { color: C.ink3, fontSize: 14, fontWeight: "600" },
  bookingModalAddBtn: {
    flex: 2, paddingVertical: 13, borderRadius: R.lg, alignItems: "center", backgroundColor: C.amber,
  },
  bookingModalAddBtnTxt: { color: "#000000", fontSize: 15, fontWeight: "700" },
  bFormHead:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bFormTitle: { color: C.amber, fontSize: 15, fontWeight: "700" },
  bDatePickerBtn: {
    padding: 14, borderRadius: R.md, alignItems: "center",
    borderWidth: 1, borderColor: `${C.amber}44`, borderStyle: "dashed",
    backgroundColor: `${C.amber}08`,
  },
  bDatePickerTxt: { color: C.ink3, fontSize: 13, fontStyle: "italic" },
  bDateBar: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: `${C.amber}11`, borderRadius: R.md,
    borderWidth: 1, borderColor: `${C.amber}33`,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  bDateBarLabel: { color: C.ink4, fontSize: 9, fontFamily: MONO, letterSpacing: 0.8, textTransform: "uppercase" },
  bDateBarValue: { color: C.amber, fontSize: 13, fontWeight: "600", fontFamily: MONO, marginTop: 2 },
  bDateBarEdit:  { color: C.ink3, fontSize: 11, fontFamily: MONO },
  bRow:       { flexDirection: "row", gap: 10 },
  bLabel: { color: C.ink4, fontSize: 9, letterSpacing: 1, fontFamily: MONO, marginBottom: 4 },
  bInput: {
    backgroundColor: C.bg2, borderRadius: R.md, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 14,
  },
  bDurationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bDurationCtrl:{ flexDirection: "row", alignItems: "center", gap: 12 },
  bDurBtn: {
    width: 34, height: 34, borderRadius: R.md, alignItems: "center", justifyContent: "center",
    backgroundColor: C.bg2, borderWidth: 1, borderColor: C.line,
  },
  bDurBtnTxt: { color: C.ink, fontSize: 18, lineHeight: 22 },
  bDurVal:    { color: C.amber, fontSize: 22, fontWeight: "700", fontFamily: MONO, minWidth: 32, textAlign: "center" },
  bTotalRow:  { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingTop: 4, borderTopWidth: 1, borderTopColor: C.line },
  bTotalLabel:{ color: C.ink3, fontSize: 12 },
  bTotalAmt:  { color: C.amber, fontSize: 18, fontWeight: "700", fontFamily: MONO },
  bAddBtn: {
    padding: 14, borderRadius: R.lg, alignItems: "center",
    backgroundColor: C.amber,
  },
  bAddBtnTxt: { color: "#000000", fontSize: 14, fontWeight: "700" },

  // Toast
  toast: {
    position: "absolute", bottom: 16, alignSelf: "center",
    backgroundColor: C.bg2, borderWidth: 1, borderColor: `${C.amber}55`,
    borderRadius: R.full, paddingHorizontal: 18, paddingVertical: 9,
    zIndex: 50, elevation: 10,
  },
  toastText: { color: C.ink, fontSize: 13, fontWeight: "500" },

  // Mobile cart
  mobileCartBar: { paddingTop: 10, paddingHorizontal: 10, backgroundColor: C.bg2, borderTopWidth: 1, borderTopColor: C.line },
  mobileCartBtn: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.rust, borderRadius: R.lg, padding: 14 },
  mobileCartBtnLeft:  { color: "#000000", fontSize: 13, fontWeight: "600" },
  mobileCartBtnMid:   { color: "#000000", fontSize: 15, fontWeight: "700" },
  mobileCartBtnRight: { color: "#000000", fontSize: 13, fontWeight: "600", fontFamily: MONO },

  // Modals
  modalBd:  { flex: 1, backgroundColor: "transparent", justifyContent: "center", alignItems: "center", padding: 16 },
  cartSheet: { backgroundColor: C.bg2, borderRadius: R.xl, maxHeight: "85%", overflow: "hidden", width: "100%", maxWidth: 640 },
  paySheet:  { backgroundColor: C.bg2, borderRadius: R.xl, maxHeight: "90%", width: "100%", maxWidth: 600, overflow: "hidden" },
  payColumns:    { flex: 1, flexDirection: "row" },
  payLeft:       { flex: 4, padding: 18, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: C.line },
  payRight:      { flex: 6, padding: 18 },
  payOrderRow:   { flexDirection: "row", alignItems: "flex-start", paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  payOrderQty:   { color: C.ink4, fontSize: 12, fontFamily: MONO, width: 26 },
  payOrderName:  { flex: 1, color: C.ink, fontSize: 13, marginRight: 8 },
  payOrderPrice: { color: C.ink3, fontSize: 12, fontFamily: MONO },

  // Pay modal — header
  payHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  payCloseBtn: { padding: 4, marginTop: 2 },
  payTitle:   { color: C.ink4, fontSize: 10, fontFamily: MONO, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3 },
  payTotal:   { color: C.amber, fontSize: 34, fontWeight: "700", fontFamily: MONO },

  // Pay modal — body
  payContent: { padding: 16, gap: 12, paddingBottom: 4 },
  paySectionLabel: { color: C.ink4, fontSize: 10, fontFamily: MONO, letterSpacing: 1.2, textTransform: "uppercase" },
  payDetailsCard: { gap: 6, marginTop: 6 },
  payDetailRow:   { flexDirection: "row", gap: 10 },
  payDetailLabel: { color: C.ink4, fontSize: 12, width: 68, flexShrink: 0 },
  payDetailValue: { color: C.ink2, fontSize: 13, fontWeight: "500", flex: 1 },

  // Adjustments — side by side
  adjustRow: { flexDirection: "row", gap: 8 },
  adjustToggle: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    padding: 10, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
  },
  adjustToggleActive: { backgroundColor: `${C.info}18`, borderColor: C.info },
  adjustLabel:  { color: C.ink, fontSize: 12, fontWeight: "600" },
  adjustAmount: { color: C.ink3, fontSize: 11, fontFamily: MONO, marginTop: 1 },

  checkbox: {
    width: 17, height: 17, borderRadius: 4, borderWidth: 2, borderColor: C.line,
    alignItems: "center", justifyContent: "center",
  },
  checkmark: { color: "#fff", fontSize: 11, fontWeight: "700" },

  // Payment tiles — compact, always a single row
  payMethods: { flexDirection: "row", gap: 8 },
  payMethod: {
    flex: 1, alignItems: "center", gap: 3,
    paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
  },
  payMethodActive: { borderColor: `${C.amber}99`, backgroundColor: C.amberBg },
  payMethodLabel:  { color: C.ink3, fontSize: 11, fontWeight: "500" },

  // Cash section
  cashWrap:  { gap: 8 },
  cashLabel: { color: C.ink4, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: MONO },
  cashInput: {
    backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 22, fontWeight: "700", color: C.ink, fontFamily: MONO, textAlign: "right",
  },
  quickAmounts: { flexDirection: "row", gap: 6 },
  quickAmt: { flex: 1, paddingVertical: 9, alignItems: "center", backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line },
  quickAmtText: { color: C.ink2, fontSize: 11, fontFamily: MONO },
  changeRow:  { padding: 10, borderRadius: R.md },
  changeLabel:{ fontSize: 13, fontWeight: "600", fontFamily: MONO, textAlign: "center" },

  // Digital payment
  payInfo:    { padding: 14, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderStyle: "dashed" },
  payInfoText:{ color: C.ink3, fontSize: 13, textAlign: "center", lineHeight: 20 },
  refWrap:   { gap: 5 },
  refInput: {
    backgroundColor: C.surface, borderRadius: R.md,
    borderWidth: 1, borderColor: `${C.amber}66`,
    paddingHorizontal: 14, paddingVertical: 12,
    color: C.ink, fontSize: 15, fontWeight: "600", fontFamily: MONO, letterSpacing: 1,
  },
  refHint: { color: C.ink4, fontSize: 11, fontStyle: "italic" },

  // Split payment button
  splitPayBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center",
    paddingVertical: 10, borderRadius: R.md,
    borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.surface,
  },
  splitPayBtnTxt: { color: C.ink3, fontSize: 13, fontWeight: "600" },

  // Payment flow row — Pay in Full / Pay Partial / Split, one compressed row
  payFlowBtn: {
    flex: 1, paddingVertical: 10, borderRadius: R.md,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: C.amber, backgroundColor: "transparent",
  },
  payFlowBtnActive:   { backgroundColor: C.amber },
  payFlowBtnTxt:      { fontSize: 12, fontWeight: "700", color: C.amber },
  payFlowBtnTxtActive:{ color: "#fff" },

  // Booking-only payment mode selector
  bookPayModeRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  bookPayModeBtn: {
    flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: R.md,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
  },
  bookPayModeBtnActive: { backgroundColor: `${C.amber}22`, borderColor: C.amber },
  bookPayModeTxt:       { color: C.ink3, fontSize: 12, fontWeight: "600" },
  bookPayModeTxtActive: { color: C.amber },

  // Pay modal — sticky footer
  payFooter: { flexDirection: "row", gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: C.line },
  cancelPayBtn: { flex: 1, paddingVertical: 13, borderRadius: R.lg, alignItems: "center", backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  cancelPayBtnText: { color: C.ink3, fontSize: 14, fontWeight: "600" },
  confirmBtn: { flex: 2, paddingVertical: 13, paddingHorizontal: 16, borderRadius: R.lg, alignItems: "center", backgroundColor: C.good },
  confirmBtnText: { color: "#000000", fontSize: 15, fontWeight: "700" },

  // Load ticket modal — centered dialog
  ticketModalBd: {
    // Anchored near the top instead of centered — on Android the Modal's
    // own dialog window doesn't reliably resize with the keyboard, so a
    // centered sheet ends up with its input row hidden behind it.
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-start", alignItems: "center",
    paddingTop: 60, paddingHorizontal: 24, paddingBottom: 24,
  },
  ticketSheet: {
    backgroundColor: C.bg2, borderRadius: R.xl,
    width: "100%", maxWidth: 480, maxHeight: "80%", overflow: "hidden",
  },
  ticketHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4,
  },
  ticketSheetTitle: { color: C.ink, fontSize: 17, fontWeight: "700" },
  ticketCloseBtn: { padding: 4 },
  ticketContent: { paddingHorizontal: 20, paddingBottom: 28, gap: 14 },
  ticketSheetSub:   { color: C.ink3, fontSize: 13, lineHeight: 19 },
  ticketInputRow: { flexDirection: "row", gap: 10 },
  ticketQueryInput: {
    flex: 1, backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 14, paddingVertical: 13,
    color: C.ink, fontSize: 20, fontWeight: "700", fontFamily: MONO, letterSpacing: 2,
  },
  ticketLookupBtn: {
    paddingHorizontal: 18, paddingVertical: 13,
    backgroundColor: C.amber, borderRadius: R.md,
    alignItems: "center", justifyContent: "center", minWidth: 90,
  },
  ticketLookupBtnText: { color: "#000000", fontSize: 14, fontWeight: "700" },
  ticketErrBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: R.md,
    backgroundColor: C.badBg, borderWidth: 1, borderColor: `${C.bad}40`,
  },
  ticketErrText: { color: C.bad, fontSize: 13, flex: 1 },
  ticketResultCard: {
    backgroundColor: C.surface, borderRadius: R.lg,
    borderWidth: 1, borderColor: `${C.amber}44`, padding: 16, gap: 10,
  },
  ticketResultHeader: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  ticketResultPill: {
    paddingHorizontal: 12, paddingVertical: 5,
    backgroundColor: C.amberBg, borderRadius: R.full,
    borderWidth: 1, borderColor: `${C.amber}50`,
  },
  ticketResultPillText: { color: C.amber, fontSize: 14, fontFamily: MONO, fontWeight: "700", letterSpacing: 1 },
  ticketResultMeta:     { color: C.ink3, fontSize: 12 },
  ticketResultItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.lineSoft,
  },
  ticketResultQty:   { color: C.ink4, fontSize: 13, fontFamily: MONO, minWidth: 28 },
  ticketResultName:  { flex: 1, color: C.ink, fontSize: 13 },
  ticketResultPrice: { color: C.ink2, fontSize: 13, fontFamily: MONO },
  ticketAddBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    padding: 14, borderRadius: R.lg, backgroundColor: C.amber, marginTop: 4,
  },
  ticketAddBtnText: { color: "#000000", fontSize: 15, fontWeight: "700" },
  ticketActionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 10, borderRadius: R.md, borderWidth: 1,
  },
  ticketActionBtnText: { fontSize: 12, fontWeight: "600" },
});


/** Style object shared by the order screen and its extracted sub-components. */
export type OrderScreenStyles = ReturnType<typeof makeStyles>;

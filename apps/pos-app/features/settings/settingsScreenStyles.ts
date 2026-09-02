import { StyleSheet } from "react-native";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { MONO } from "../theme/mono";

type C = ReturnType<typeof useTheme>["C"];

export const makeStyles = (C: C) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 14, paddingBottom: 40 },

  wideBody: { flex: 1, flexDirection: "row" },

  /* nav rail (wide) */
  rail: { width: 230, borderRightWidth: 1, borderRightColor: C.line, paddingVertical: 10, gap: 2, backgroundColor: C.bg2 },
  railItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, marginHorizontal: 8, borderRadius: R.md },
  railItemActive: { backgroundColor: C.surface },
  navIcon: { width: 30, height: 30, borderRadius: R.md, alignItems: "center", justifyContent: "center", backgroundColor: C.bg, borderWidth: 1, borderColor: C.line },
  navLabel: { color: C.ink2, fontSize: 13, fontWeight: "600" },
  navStatus: { color: C.ink4, fontSize: 10, marginTop: 1, fontFamily: MONO },

  /* nav cards (narrow list) */
  listCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 14 },
  backToList: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingVertical: 2 },
  backToListTxt: { color: C.amber, fontSize: 13, fontWeight: "600" },

  /* sticky save bar */
  stickyBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: C.bg2, borderTopWidth: 1, borderTopColor: C.line,
  },
  unsavedWrap: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  unsavedDot: { width: 8, height: 8, borderRadius: R.full, backgroundColor: C.amber },
  unsavedTxt: { color: C.ink3, fontSize: 12, fontWeight: "600" },
  discardBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: R.md, borderWidth: 1, borderColor: C.line },
  discardTxt: { color: C.ink2, fontSize: 13, fontWeight: "600" },
  saveBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.good, borderRadius: R.md, paddingHorizontal: 18, paddingVertical: 10 },
  saveTxt: { color: "#000000", fontSize: 14, fontWeight: "700" },

  /* inputs */
  input: { backgroundColor: C.bg, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 11, color: C.ink, fontSize: 14 },
  inputDisabled: { color: C.ink3, borderColor: C.lineSoft },
  inputMultiline: { minHeight: 64, paddingTop: 11 },
  helpNote: { color: C.ink4, fontSize: 12 },

  /* theme */
  themeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: "47%", backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 12, gap: 6, position: "relative" },
  swatchDot: { width: 24, height: 24, borderRadius: R.full },
  swatchDot2: { width: 14, height: 14, borderRadius: R.full, marginTop: -18, marginLeft: 16 },
  swatchName: { color: C.ink3, fontSize: 12, fontWeight: "600", marginTop: 4 },
  swatchCheck: { position: "absolute", top: 8, right: 8, width: 18, height: 18, borderRadius: R.full, alignItems: "center", justifyContent: "center" },

  /* rates */
  rateBlock: { gap: 10 },
  rateToggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rateLabelGroup: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  rateIconWrap: { width: 36, height: 36, borderRadius: R.md, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line },
  rateTitle: { color: C.ink, fontSize: 14, fontWeight: "700" },
  rateTitleOff: { color: C.ink3 },
  rateSub: { color: C.ink4, fontSize: 11, marginTop: 2 },
  rateDivider: { height: 1, backgroundColor: C.lineSoft },
  pctRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 48 },
  pctLabel: { color: C.ink3, fontSize: 12 },
  pctInputWrap: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.bg, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 7 },
  pctInput: { color: C.ink, fontSize: 16, fontWeight: "700", fontFamily: MONO, minWidth: 52, textAlign: "right" },
  pctSuffix: { color: C.ink3, fontSize: 15, fontWeight: "700" },

  /* payment accordion */
  payCard: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, overflow: "hidden" },
  payHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  payBadge: { width: 32, height: 32, borderRadius: 9 },
  payMethodTitle: { color: C.ink, fontSize: 14, fontWeight: "700" },
  readyChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: R.full },
  readyTxt: { fontSize: 10, fontWeight: "700", fontFamily: MONO, textTransform: "uppercase" },
  payBody: { padding: 14, paddingTop: 0, gap: 12, borderTopWidth: 1, borderTopColor: C.lineSoft },
  payRow: { flexDirection: "row", gap: 10 },
  payInput: { flex: 1 },

  /* qr input */
  qrWrap: { gap: 8 },
  qrLabel: { color: C.ink4, fontSize: 10, fontFamily: MONO, letterSpacing: 0.5, textTransform: "uppercase" },
  qrModeBar: { flexDirection: "row", gap: 8 },
  qrModeBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.full, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg },
  qrModeBtnActive: { borderColor: C.amber, backgroundColor: `${C.amber}14` },
  qrModeBtnTxt: { fontSize: 12, fontWeight: "600" },
  qrPickBtn: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 20, borderRadius: R.md, borderWidth: 1, borderColor: C.line, borderStyle: "dashed", backgroundColor: C.bg },
  qrPickTxt: { color: C.ink4, fontSize: 12 },
  qrPreviewRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  qrPreview: { width: 80, height: 80, borderRadius: R.md, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line },
  qrPreviewTxt: { color: C.ink3, fontSize: 12 },
  qrRemoveBtn: { flexDirection: "row", alignItems: "center", gap: 5 },

  /* font */
  fontRow: { flexDirection: "row", gap: 10 },
  fontChip: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 12, borderRadius: R.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  fontChipA: { fontWeight: "700", lineHeight: 24 },
  fontChipLabel: { fontSize: 10, fontFamily: MONO },

  /* segmented control */
  segRow: { flexDirection: "row", gap: 10 },
  segChip: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg },
  segChipDisabled: { opacity: 0.6 },
  segChipTxt: { fontSize: 12, fontWeight: "600", textAlign: "center", fontFamily: MONO },

  /* accreditation */
  accredWarning: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: `${C.amber}0e`, borderRadius: R.md,
    borderWidth: 1, borderColor: `${C.amber}33`, padding: 10,
  },

  /* meta */
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  metaLabel: { color: C.ink3, fontSize: 12 },
  metaValue: { color: C.ink4, fontSize: 11, fontFamily: MONO, flex: 1, textAlign: "right" },
  rolePill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: R.full },
  roleText: { fontSize: 11, fontWeight: "700", fontFamily: MONO, textTransform: "uppercase" },
  noEditBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, padding: 12 },
  noEditTxt: { color: C.ink4, fontSize: 12 },
  fieldDesc: { color: C.ink4, fontSize: 11, marginTop: 4 },

  /* branch */
  branchBlock: { gap: 10 },
  branchName: { color: C.ink, fontSize: 14, fontWeight: "700", marginBottom: 2 },
  branchToggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  branchToggleLabel: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  branchToggleTitle: { color: C.ink, fontSize: 13, fontWeight: "600" },
  branchToggleTitleOff: { color: C.ink3 },
  branchToggleSub: { color: C.ink4, fontSize: 11, marginTop: 1 },

  registerBlock: { gap: 8, marginTop: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line },
  registerBlockLabel: { color: C.ink4, fontSize: 9, fontFamily: MONO, letterSpacing: 1, textTransform: "uppercase" },
  registerRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  registerDot: { width: 7, height: 7, borderRadius: 4 },
  registerName: { color: C.ink, fontSize: 13, flex: 1 },
  registerToggleBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.sm, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  registerToggleBtnTxt: { color: C.ink3, fontSize: 11, fontWeight: "600" },
  registerAddRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  registerAddBtn: { width: 42, alignItems: "center", justifyContent: "center", borderRadius: R.md, backgroundColor: C.amber },

  /* printers */
  printerSummaryRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  printerSummaryIcon: { width: 40, height: 40, borderRadius: R.md, backgroundColor: `${C.amber}14`, alignItems: "center", justifyContent: "center" },
  printerSummaryTitle: { color: C.ink, fontSize: 13, fontWeight: "700" },
  printerSummarySub: { color: C.ink4, fontSize: 11, marginTop: 1 },
  printerSummaryBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.full },
  printerSummaryBadgeTxt: { fontSize: 10, fontWeight: "700" },
  printerSummaryDivider: { height: 1, marginBottom: 12 },
  printerNavBtn: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, paddingHorizontal: 16, borderRadius: R.md, backgroundColor: `${C.amber}14`, borderWidth: 1, borderColor: `${C.amber}55`, marginTop: 10 },
  printerNavBtnTxt: { color: C.amber, fontSize: 13, fontWeight: "600", flex: 1 },
});

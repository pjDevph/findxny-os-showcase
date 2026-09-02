import { StyleSheet } from "react-native";
import { R } from "../theme/tokens";
import { MONO } from "../theme/mono";
import type { useTheme } from "../theme/ThemeContext";

type CC = ReturnType<typeof useTheme>["C"];

export const makeStyles = (C: CC) => StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  noEditBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.surface,
    borderBottomWidth: 1, borderBottomColor: C.line,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  noEditTxt: { color: C.ink4, fontSize: 12, flex: 1 },

  tabBar: {
    flexDirection: "row",
    backgroundColor: C.bg2,
    borderBottomWidth: 1, borderBottomColor: C.line,
    paddingHorizontal: 8,
  },
  tabItem: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabItemActive: { borderBottomColor: C.amber },
  tabTxt:        { color: C.ink4, fontSize: 13, fontWeight: "600" },
  tabTxtActive:  { color: C.amber },

  scrollPad: { padding: 16, paddingBottom: 100 },

  builtinCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.surface, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line,
    padding: 14, marginBottom: 16,
  },
  builtinIconWrap: {
    width: 44, height: 44, borderRadius: R.lg,
    backgroundColor: `${C.amber}14`,
    alignItems: "center", justifyContent: "center",
  },
  builtinName: { color: C.ink, fontSize: 14, fontWeight: "700" },
  builtinSub:  { color: C.ink4, fontSize: 11, fontFamily: MONO },

  sectionHead: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 10,
  },
  sectionTitle: {
    color: C.ink, fontSize: 12, fontWeight: "700",
    textTransform: "uppercase", letterSpacing: 0.6,
    marginBottom: 10,
  },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: C.good, borderRadius: R.md,
  },
  addBtnTxt: { color: "#000000", fontSize: 12, fontWeight: "700" },

  emptyState: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyTxt:   { color: C.ink, fontSize: 15, fontWeight: "600" },
  emptySub:   { color: C.ink4, fontSize: 12, textAlign: "center", lineHeight: 18 },

  printerCard: {
    backgroundColor: C.surface, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line,
    padding: 14, gap: 10,
  },
  printerRow:   { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  typeIconWrap: {
    width: 36, height: 36, borderRadius: R.md,
    alignItems: "center", justifyContent: "center",
  },
  printerName:  { color: C.ink, fontSize: 14, fontWeight: "700", flex: 1 },
  printerMeta:  { color: C.ink4, fontSize: 11, fontFamily: MONO },
  badge:        { paddingHorizontal: 7, paddingVertical: 2, borderRadius: R.full },
  badgeTxt:     { fontSize: 9, fontWeight: "700", fontFamily: MONO, letterSpacing: 0.5 },

  printerActions: {
    flexDirection: "row", gap: 6, flexWrap: "wrap",
    paddingTop: 8, borderTopWidth: 1, borderTopColor: C.line,
  },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 7, paddingHorizontal: 10,
    backgroundColor: C.bg, borderRadius: R.md,
    borderWidth: 1, borderColor: C.line,
  },
  actionBtnTxt: { fontSize: 11, fontWeight: "600", fontFamily: MONO },

  formCard: {
    backgroundColor: C.surface, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line,
    padding: 16, marginTop: 12,
  },
  formHead:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  formTitle:  { color: C.ink, fontSize: 15, fontWeight: "700" },
  input: {
    backgroundColor: C.bg, borderRadius: R.md,
    borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 14, paddingVertical: 11,
    color: C.ink, fontSize: 14,
  },
  chipRow:    { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 9, paddingHorizontal: 14,
    borderRadius: R.md, borderWidth: 1,
    borderColor: C.line, backgroundColor: C.bg,
  },
  chipActive:    { borderColor: C.amber, backgroundColor: `${C.amber}18` },
  chipTxt:       { fontSize: 12, fontWeight: "600", color: C.ink3 },
  chipTxtActive: { color: C.amber },
  formActions:   { flexDirection: "row", gap: 10, marginTop: 8 },
  formBtn:       { paddingVertical: 12, borderRadius: R.md, alignItems: "center", justifyContent: "center" },
  formBtnTxt:    { fontSize: 14, fontWeight: "700" },

  helpNote: { color: C.ink4, fontSize: 12, lineHeight: 18, marginBottom: 14 },

  toggleRow:   { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 2 },
  toggleLabel: { color: C.ink, fontSize: 13, fontWeight: "600" },
  toggleSub:   { color: C.ink4, fontSize: 11, marginTop: 2 },

  routeChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: R.md, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.bg,
  },
  routeChipTxt: { color: C.ink, fontSize: 12, fontWeight: "600" },

  infoNote: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: `${C.amber}12`, borderRadius: R.md,
  },
  infoNoteTxt: { color: C.amber, fontSize: 11, flex: 1 },

  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.good, borderRadius: R.lg, paddingVertical: 13, marginTop: 4,
  },
  saveBtnTxt: { color: "#000000", fontSize: 14, fontWeight: "700" },

  ddBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.25)" }, // NOSONAR
  ddMenu: {
    position: "absolute",
    backgroundColor: C.surface, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line,
    minWidth: 200, maxWidth: 320,
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  ddItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 11, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  ddItemActive: { backgroundColor: `${C.amber}15` },
  ddItemTxt:    { color: C.ink, fontSize: 13 },

  labelPreviewWrap: { alignItems: "center", marginBottom: 20, marginTop: 6 },
  labelPreview: {
    backgroundColor: "#fff",
    borderRadius: R.lg, borderWidth: 1, borderColor: "#e0e0e0",
    padding: 16, gap: 6, width: 220,
    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  lpInfo:     { color: "#888", fontSize: 10, fontFamily: MONO, letterSpacing: 0.3, marginBottom: 4 },
  lpProduct:  { color: "#1a1a1a", fontSize: 17, fontWeight: "800", letterSpacing: -0.3, flex: 1, marginRight: 8 },
  lpQty:      { color: "#1a1a1a", fontSize: 13, fontWeight: "700", fontFamily: MONO },
  lpMod:      { color: "#1a1a1a", fontSize: 11, fontWeight: "700", fontFamily: MONO, letterSpacing: 0.3 },
  lpTag: {
    paddingHorizontal: 7, paddingVertical: 3,
    backgroundColor: "#f0f0f0", borderRadius: R.sm,
    borderWidth: 1, borderColor: "#ddd",
  },
  lpTagTxt: { color: "#333", fontSize: 10, fontFamily: MONO, fontWeight: "600" },

  tsRow:    { flexDirection: "row", alignItems: "center", gap: 12 },
  testBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: `${C.amber}18`, borderRadius: R.md,
    borderWidth: 1, borderColor: `${C.amber}55`,
  },
  testBtnTxt: { color: C.amber, fontSize: 13, fontWeight: "700" },
});

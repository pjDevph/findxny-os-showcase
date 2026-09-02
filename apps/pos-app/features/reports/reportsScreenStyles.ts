import { StyleSheet } from "react-native";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { MONO } from "../theme/mono";

export const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Header
  hdr: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  backBtn: { paddingRight: 4 },
  backTxt: { color: C.amber, fontSize: 16, fontWeight: "600" },
  hdrTitle: { color: C.ink, fontSize: 18, fontWeight: "700" },
  hdrBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: C.surface, borderRadius: R.md,
    borderWidth: 1, borderColor: C.line,
  },
  hdrBtnTxt: { color: C.ink3, fontSize: 13, fontWeight: "600" },

  // Tab bar
  tabBar: { flexGrow: 0, flexShrink: 0, backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.line },
  tabItem: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 18, paddingVertical: 10,
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabItemActive: { borderBottomColor: C.amber },
  tabTxt: { color: C.ink4, fontSize: 14, fontWeight: "600" },
  tabTxtActive: { color: C.amber },

  // Body layout
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  kpiRow: { flexDirection: "row", gap: 10, padding: 12 },
  body: { flex: 1, flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingBottom: 12 },
  leftCol: { flex: 1, gap: 10 },

  // Cards
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, overflow: "hidden" },
  cardHead: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  cardTitle: { color: C.ink, fontSize: 14, fontWeight: "700", flex: 1 },
  cardBody: { paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  cardFoot: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: C.line,
  },

  // Bar helpers
  barTrack: { height: 6, backgroundColor: C.bg2, borderRadius: R.full, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: R.full },

  // Rows
  prodRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 11, gap: 10, minHeight: 44 },
  orderRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 11, gap: 10, minHeight: 44 },
  rowAlt: { backgroundColor: "rgba(255,255,255,0.02)" },

  rankBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: `${C.amber}20`, alignItems: "center", justifyContent: "center" },
  rankTxt: { color: C.amber, fontSize: 11, fontWeight: "700", fontFamily: MONO },

  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.full },
  statusTxt: { fontSize: 11, fontWeight: "600", letterSpacing: 0.3, textTransform: "capitalize" },

  // View all / load more
  viewAllBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4,
    paddingHorizontal: 16, paddingVertical: 11,
    borderTopWidth: 1, borderTopColor: C.line,
  },
  viewAllTxt: { color: C.amber, fontSize: 13, fontWeight: "600" },
  loadMoreBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 14, marginHorizontal: 14, marginBottom: 6,
    borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
  },
  loadMoreTxt: { color: C.ink3, fontSize: 13, fontWeight: "500" },

  // Search
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.bg2, borderRadius: R.md,
    borderWidth: 1, borderColor: C.line, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontSize: 13, color: C.ink, paddingVertical: 9 },

  // Empty
  empty: { color: C.ink4, fontSize: 13, textAlign: "center" },
  emptySection: { alignItems: "center", paddingVertical: 40, gap: 10 },

  // Order detail modal
  modalBd: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 16 },
  sheet: { backgroundColor: C.bg2, borderRadius: R.xl, maxHeight: "88%", width: "100%", maxWidth: 640 },
  detailContent: { padding: 20, gap: 14, paddingBottom: 40 },
  detailHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  detailOrderNo: { color: C.ink, fontSize: 22, fontWeight: "700", fontFamily: MONO },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: R.full },
  badgeTxt: { fontSize: 10, fontWeight: "600" },
  infoGrid: { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, overflow: "hidden" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  infoLabel: { color: C.ink4, fontSize: 13 },
  infoValue: { color: C.ink2, fontSize: 13, fontWeight: "500" },
  sectionLabel: { color: C.ink3, fontSize: 11, fontFamily: MONO, letterSpacing: 0.8, textTransform: "uppercase" },
  noItems: { color: C.ink4, fontSize: 13, textAlign: "center", paddingVertical: 12 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  itemName: { color: C.ink, fontSize: 14, fontWeight: "500" },
  itemSku: { color: C.ink4, fontSize: 11, fontWeight: "700", fontFamily: MONO, letterSpacing: 0.5 },
  itemNote: { color: C.ink4, fontSize: 11, fontStyle: "italic", marginTop: 2 },
  itemQty: { color: C.ink3, fontSize: 13, fontFamily: MONO, minWidth: 32, textAlign: "right" },
  itemTotal: { color: C.amber, fontSize: 14, fontWeight: "600", minWidth: 80, textAlign: "right" },
  totalsBox: { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  grandRow: { paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line, marginTop: 4 },
  grandLabel: { color: C.ink, fontSize: 16, fontWeight: "700" },
  grandValue: { color: C.amber, fontSize: 18, fontWeight: "700" },
  reprintBtn: { backgroundColor: C.amber, borderRadius: R.md, paddingVertical: 13, paddingHorizontal: 16, alignItems: "center", marginTop: 12 },
  reprintBtnTxt: { color: C.bg, fontSize: 14, fontWeight: "700" },
});

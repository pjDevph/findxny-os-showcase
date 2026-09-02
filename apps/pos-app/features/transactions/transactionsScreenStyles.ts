import { StyleSheet } from "react-native";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { MONO } from "../theme/mono";

export const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  exportBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  exportBtnTxt: { color: C.amber, fontSize: 12, fontWeight: "600" },

  summaryBarWrap: { backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.line, padding: 10 },

  wideBody: { flex: 1, flexDirection: "row" },
  wideList: { flex: 1, borderRightWidth: 1, borderRightColor: C.line },
  wideDetail: { width: 360, backgroundColor: C.bg2 },

  noSelection: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
  noSelectionTxt: { color: C.ink3, fontSize: 15, fontWeight: "600", textAlign: "center" },
  noSelectionSub: { color: C.ink4, fontSize: 12, textAlign: "center", lineHeight: 18 },

  // Transaction row
  row: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.bg,
    borderBottomWidth: 1, borderBottomColor: C.line,
    paddingVertical: 0, paddingLeft: 0, paddingRight: 12,
  },
  rowSelected: { backgroundColor: C.bg2 },
  rowAccent: { width: 3, alignSelf: "stretch", borderRadius: 0 },
  rowMain: { flex: 1, padding: 12, paddingLeft: 10, gap: 4 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowNo: { color: C.ink, fontSize: 14, fontWeight: "700", fontFamily: MONO },
  rowAmt: { color: C.amber, fontSize: 15, fontWeight: "700", fontFamily: MONO },
  rowTopRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowBot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowMeta: { flex: 1, color: C.ink3, fontSize: 11, textTransform: "capitalize" },
  rowBotRight: { flexDirection: "row", alignItems: "center" },
  rowTime: { color: C.ink4, fontSize: 10, fontFamily: MONO },
  rowBadges: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },

  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: R.full, borderWidth: 1 },
  pillDot: { width: 5, height: 5, borderRadius: 2.5 },
  pillTxt: { fontSize: 9, fontWeight: "700", textTransform: "capitalize" },
  actionPill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: R.full, borderWidth: 1 },
  actionPillTxt: { fontSize: 9, fontWeight: "700" },

  empty: { alignItems: "center", gap: 8, padding: 48 },
  emptyTxt: { color: C.ink3, fontSize: 14, fontWeight: "600" },
  emptySubTxt: { color: C.ink4, fontSize: 11, fontFamily: MONO },

  loadMoreBtn: { padding: 16, alignItems: "center" },
  loadMoreTxt: { color: C.amber, fontSize: 13 },
  endTxt: { color: C.ink4, fontSize: 10, textAlign: "center", padding: 16, fontFamily: MONO },

  modalBd: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
});

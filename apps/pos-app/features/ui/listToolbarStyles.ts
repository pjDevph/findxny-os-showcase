/**
 * Shared style keys for the search/filter toolbar + empty-state + "+ Add"
 * button used at the top of the POS admin list screens (Suppliers,
 * Resources, Tasks, etc). Each screen's own makeStyles(C) can spread these
 * in and add its own row/card styles on top.
 */
import { Platform, StyleSheet } from "react-native";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });

export const makeListToolbarStyles = (C: ReturnType<typeof useTheme>["C"], bottomInset = 0) => StyleSheet.create({
  root:     { flex: 1, backgroundColor: C.bg },
  center:   { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 60 },
  empty:    { color: C.ink4, fontSize: 13 },
  emptySub: { color: C.ink4, fontSize: 11 },
  list:     { padding: 10, paddingBottom: 100 + bottomInset },
  count:    { color: C.ink4, fontSize: 12, fontFamily: MONO },

  toolbar:     { backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.lineSoft, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, gap: 8 },
  searchWrap:  { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10 },
  searchIcon:  { color: C.ink3, fontSize: 16, marginRight: 6 },
  searchInput: { flex: 1, paddingVertical: 9, color: C.ink, fontSize: 14 },
  clearX:      { color: C.ink4, paddingHorizontal: 6 },
  filterRow:   { flexDirection: "row", gap: 6 },
  filterChip:  { paddingHorizontal: 12, paddingVertical: 5, borderRadius: R.full, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  filterChipActive:    { backgroundColor: `${C.amber}22`, borderColor: `${C.amber}66` },
  filterChipTxt:       { color: C.ink3, fontSize: 12, fontWeight: "500" },
  filterChipTxtActive: { color: C.amber, fontWeight: "700" },

  addBtn:    { backgroundColor: C.amber, borderRadius: R.full, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnTxt: { color: "#000000", fontSize: 12, fontWeight: "700" },
});

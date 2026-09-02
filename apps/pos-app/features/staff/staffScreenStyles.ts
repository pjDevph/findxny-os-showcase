import { StyleSheet } from "react-native";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { MONO } from "../theme/mono";

export const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  headerCount: { color: C.ink4, fontSize: 12, fontFamily: MONO },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: C.amber, borderRadius: R.full,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  addBtnText: { color: "#000000", fontSize: 12, fontWeight: "700" },
  rightPanel: { flex: 1, backgroundColor: C.bg },
  modalBd: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 16 },
  modalCard: { backgroundColor: C.bg2, borderRadius: R.xl, overflow: "hidden", width: "100%", maxWidth: 560, maxHeight: "90%" },
  phoneDetailHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  sheetTitle: { color: C.ink, fontSize: 17, fontWeight: "700" },
});

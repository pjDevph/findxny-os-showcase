import { StyleSheet } from "react-native";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { MONO } from "../theme/mono";

export const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  count: { color: C.ink4, fontSize: 12, fontFamily: MONO },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 60 },
  toolbar: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 12,
    backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.lineSoft,
  },
  list: { paddingBottom: 100 },
  tableHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.lineSoft,
  },
  thTxt: { color: C.ink4, fontSize: 9, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", fontFamily: MONO },
  summaryRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  addBtn: { backgroundColor: C.amber, borderRadius: R.full, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnTxt: { color: "#000000", fontSize: 12, fontWeight: "700" },
});

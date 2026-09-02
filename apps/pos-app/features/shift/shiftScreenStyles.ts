import { StyleSheet } from "react-native";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

export const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 14 },
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 16, gap: 12 },
  cardTitle: { color: C.ink, fontSize: 16, fontWeight: "600" },
  fieldLabel: { color: C.ink3, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 },
  reportBtnRow: { flexDirection: "row", gap: 10 },
  reportBtn: { flex: 1, paddingVertical: 13, borderRadius: R.md, alignItems: "center", justifyContent: "center" },
  xReportBtn: { borderWidth: 1, borderColor: C.info, backgroundColor: C.infoBg },
  zReportBtn: { backgroundColor: C.amber },
  reportBtnText: { fontSize: 13, fontWeight: "700", textAlign: "center" },
});

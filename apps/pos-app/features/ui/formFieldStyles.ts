/**
 * Shared style keys for form fields/footer buttons inside a FormSheetModal —
 * used by the POS admin add/edit screens (Suppliers, Resources, Tasks, etc).
 * Each screen's own makeStyles(C) can spread these in and add its own
 * screen-specific keys on top.
 */
import { Platform, StyleSheet } from "react-native";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });

export const makeFormFieldStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  fieldGroup:     { gap: 6 },
  fieldLabel:     { color: C.ink3, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontFamily: MONO },
  input:          { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 10, color: C.ink, fontSize: 14 },
  row2:           { flexDirection: "row", gap: 10 },
  fieldGroupHalf: { flex: 1, minWidth: 0, gap: 6 },
  toggleRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  deleteBtn:      { alignItems: "center", paddingVertical: 12, borderRadius: R.md, borderWidth: 1, borderColor: `${C.bad}44`, backgroundColor: `${C.bad}12` },
  deleteBtnTxt:   { color: C.bad, fontSize: 13, fontWeight: "700" },
  footerPrimaryBtn:    { backgroundColor: C.good, borderRadius: R.cta, padding: 14, alignItems: "center" },
  footerPrimaryBtnTxt: { color: "#000000", fontSize: 13, fontWeight: "700" },
});

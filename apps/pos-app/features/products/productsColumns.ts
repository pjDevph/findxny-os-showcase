import { StyleSheet } from "react-native";

/** Column widths shared by the table header row and each ProductRow, so they always line up. */
export const productColumns = StyleSheet.create({
  colName: { flex: 3, paddingRight: 8 },
  colCat: { flex: 1.5, paddingRight: 8 },
  colPrice: { width: 88, textAlign: "right", paddingRight: 8 },
  colType: { width: 96, paddingRight: 4 },
  colStatus: { width: 100 },
  colAction: { width: 32, alignItems: "center" },
});

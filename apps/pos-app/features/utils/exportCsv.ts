/**
 * Shared CSV-file export used by Order History and Reports. Produces a real
 * .csv file (opens in Excel / Google Sheets / Numbers) rather than sharing raw
 * text, and routes it through the OS share sheet.
 */
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Share } from "react-native";

type Cell = string | number | null | undefined;

/**
 * Builds a CSV string from a header row + data rows. Every cell is stringified
 * and quoted (embedded quotes doubled), so commas, quotes and newlines inside
 * values can't corrupt the columns. Prepends a UTF-8 BOM and uses CRLF line
 * endings so Excel opens it cleanly — the BOM makes it render the ₱ sign and
 * other non-ASCII correctly instead of mojibake.
 */
export function buildCsv(header: readonly string[], rows: readonly Cell[][]): string {
  const esc = (v: Cell) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))];
  return "﻿" + lines.join("\r\n");
}

export interface CsvSection {
  /** Optional label row printed above the header, e.g. "SUMMARY". */
  title?: string;
  header: readonly string[];
  rows: readonly Cell[][];
}

/**
 * Builds a CSV with multiple header/row blocks, each separated by a blank
 * line (e.g. a detail table followed by a "SUMMARY" totals block). Since CSV
 * has no concept of separate sheets/pages, sections stack vertically in the
 * same file — Excel/Sheets render the blank line as a visual break.
 */
export function buildCsvSections(sections: readonly CsvSection[]): string {
  const esc = (v: Cell) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const blocks = sections.map(({ title, header, rows }) => {
    const lines: string[] = [
      ...(title ? [esc(title)] : []),
      header.map(esc).join(","),
      ...rows.map(r => r.map(esc).join(",")),
    ];
    return lines.join("\r\n");
  });
  return "﻿" + blocks.join("\r\n\r\n");
}

/**
 * Writes the CSV to a cache file and opens the share sheet so the user can open
 * it in a spreadsheet app or save it to Drive/Files. Falls back to a raw text
 * share on the rare device where the native share module is unavailable.
 * Throws on write failure so callers can surface a toast.
 */
export async function shareCsv(fileName: string, csv: string): Promise<void> {
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "text/csv",
      UTI: "public.comma-separated-values-text",
      dialogTitle: fileName.replace(/\.csv$/i, ""),
    });
  } else {
    await Share.share({ message: csv, title: fileName });
  }
}

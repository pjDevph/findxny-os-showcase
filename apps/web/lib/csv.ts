// Tiny CSV builder. Quotes only when needed (commas / quotes / newlines) and
// escapes embedded quotes per RFC 4180.

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return columns?.join(",") ?? "";
  const keys = columns ?? Object.keys(rows[0]);
  const head = keys.map(esc).join(",");
  const body = rows.map((r) => keys.map((k) => esc(stringify(r[k]))).join(",")).join("\n");
  return head + "\n" + body;
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function esc(s: string): string {
  // Prefix cells that would otherwise be interpreted as formulas by Excel/Sheets.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

/** Trigger a CSV download from a row set. Browser-only. */
export function downloadCsv(filename: string, rows: Record<string, unknown>[], columns?: string[]): void {
  const csv = toCsv(rows, columns);
  // BOM helps Excel pick up UTF-8 on Windows.
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

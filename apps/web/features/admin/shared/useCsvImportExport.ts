"use client";

import { useRef, useState } from "react";

/**
 * Shared scaffolding behind the admin "Import / Export CSV" panels
 * (inventory, ingredients, products, recipes). Each entity keeps its own
 * column list, per-row parsing/validation, and any derived preview stats —
 * this hook only owns the parts that were byte-for-byte identical across
 * those components: the tiny CSV dialect (parse/escape/serialize), the
 * file-read → row-loop → error-collection pipeline, the download-as-file
 * helper, and the open/loading/result/preview state machine.
 *
 * Intentionally NOT unified (kept as callbacks/options instead, because the
 * originals genuinely differed):
 *  - per-row field mapping & validation messages       -> `parseRow`
 *  - whether an all-errors parse still shows a preview  -> `isEmptyResult`
 *  - extra derived preview stats (e.g. "missing cost")  -> `deriveExtras`
 *  - whether the template/example row gets CSV-escaped  -> `escapeCsv`
 *  - any row transform applied right before import      -> `confirmImport`'s
 *    optional `transformRows` argument
 */

export type CsvImportResult = { imported: number; errors: string[] };

export type CsvRowOutcome<TRow> = { row: TRow; error?: undefined } | { row?: undefined; error: string };

export type CsvPreview<TRow, TExtra extends object> = { rows: TRow[]; raw: string } & TExtra;

export interface CsvRowParseContext {
  /** Raw cell values for this data row, in file column order. */
  cells: string[];
  /** Trimmed, lower-cased header row. */
  hdrs: string[];
  /** 1-based data-row index matching the original loop (`Row ${rowIndex + 1}` = the line as seen in a spreadsheet, header = row 1). */
  rowIndex: number;
  /** Look up a cell by (lower-case) column name, trimmed; "" if absent. */
  get: (col: string) => string;
  /** Same as `get`, but returns `Number(value)` or `undefined` when blank. */
  num: (col: string) => number | undefined;
}

export interface UseCsvImportExportOptions<TRow, TExtra extends object = Record<string, never>> {
  /** Column headers, in export/template order. */
  headers: readonly string[];
  /** One example row shown in the downloadable template. */
  exampleRow: readonly string[];
  /** Filename used for the downloadable blank template. */
  templateFilename: string;
  /** CSV-escape header/example values when building the template. Default true. */
  escapeCsv?: boolean;
  /** Parse one non-blank CSV row into a valid row, or an error string to record. */
  parseRow: (ctx: CsvRowParseContext) => CsvRowOutcome<TRow>;
  /** Compute any entity-specific derived stats to attach to the preview object. */
  deriveExtras?: (rows: TRow[]) => TExtra;
  /**
   * Decide whether the parsed result should skip the preview step and go
   * straight to an error-only result banner. Defaults to `rows.length === 0`.
   */
  isEmptyResult?: (rows: TRow[], errors: string[]) => boolean;
}

/* ─── Tiny CSV dialect shared by every importer/exporter ─────────────── */
export function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCSV(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}
export function parseCSV(text: string): string[][] {
  return text.trim().split(/\r?\n/).map((line) => {
    const cells: string[] = [];
    let cur = "", inQ = false, i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 2; }
        else if (ch === '"') { inQ = false; i++; }
        else { cur += ch; i++; }
      } else if (ch === '"') { inQ = true; i++; }
      else if (ch === ',') { cells.push(cur); cur = ""; i++; }
      else { cur += ch; i++; }
    }
    cells.push(cur);
    return cells;
  });
}
export function download(content: string, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8;" }));
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

export function useCsvImportExport<TRow, TExtra extends object = Record<string, never>>(
  options: UseCsvImportExportOptions<TRow, TExtra>,
) {
  const { headers, exampleRow, templateFilename, escapeCsv, parseRow, deriveExtras, isEmptyResult } = options;

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [preview, setPreview] = useState<CsvPreview<TRow, TExtra> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const rows = [[...headers], [...exampleRow]];
    const csv = escapeCsv === false ? rows.map((r) => r.join(",")).join("\n") : toCSV(rows);
    download(csv, templateFilename);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    const parsed = parseCSV(await file.text());
    if (parsed.length < 2) {
      setResult({ imported: 0, errors: ["File is empty or has no data rows."] });
      e.target.value = "";
      return;
    }
    const hdrs = parsed[0].map((h) => h.trim().toLowerCase());
    const rows: TRow[] = [];
    const errors: string[] = [];
    for (let i = 1; i < parsed.length; i++) {
      const cells = parsed[i];
      if (cells.every((c) => !c.trim())) continue;
      const get = (col: string) => cells[hdrs.indexOf(col)]?.trim() ?? "";
      const num = (col: string) => { const v = get(col); return v ? Number(v) : undefined; };
      const outcome = parseRow({ cells, hdrs, rowIndex: i, get, num });
      if (outcome.error !== undefined) { errors.push(outcome.error); continue; }
      rows.push(outcome.row);
    }
    const empty = isEmptyResult ? isEmptyResult(rows, errors) : rows.length === 0;
    if (empty) {
      setResult({ imported: 0, errors });
      e.target.value = "";
      return;
    }
    const extras = (deriveExtras ? deriveExtras(rows) : ({} as TExtra));
    setPreview({ rows, raw: errors.join("\n"), ...extras });
    e.target.value = "";
  }

  async function confirmImport(
    importAction: (rows: TRow[]) => Promise<CsvImportResult>,
    transformRows?: (rows: TRow[], preview: CsvPreview<TRow, TExtra>) => TRow[],
  ) {
    if (!preview) return;
    setLoading(true);
    setResult(null);
    try {
      const toImport = transformRows ? transformRows(preview.rows, preview) : preview.rows;
      const res = await importAction(toImport);
      if (preview.raw) res.errors = [preview.raw, ...res.errors];
      setResult(res);
      setPreview(null);
    } catch (err: any) {
      setResult({ imported: 0, errors: [err?.message ?? "Import failed"] });
    } finally {
      setLoading(false);
    }
  }

  return {
    open, setOpen,
    loading,
    result, setResult,
    preview, setPreview,
    fileRef,
    downloadTemplate,
    onFile,
    confirmImport,
    // Exposed so components can build their own entity-specific export (e.g. "export all products") on the same dialect.
    toCSV, download, parseCSV, csvEscape,
  };
}

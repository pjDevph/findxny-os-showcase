"use client";

import { useState } from "react";
import { downloadCsv } from "@/lib/csv";
import { extractErrMsg } from "@/lib/errors";

/**
 * Streams ALL pages from a paginated endpoint and downloads the result as CSV.
 *
 *  - `fetchPage(offset, limit)` should return `{ rows, total }`. Called until
 *    we've accumulated `total` rows (or pages return empty).
 *  - `flatten` converts each row into the flat shape CSV wants.
 *  - `columns` (optional) locks header order.
 *
 * Used by Audit Logs / Transactions / Bookings export buttons. Shows a small
 * status pill while downloading and surfaces errors with extractErrMsg.
 */
export function ExportCsvButton<T>({
  label = "Export CSV",
  filename,
  pageSize = 200,
  fetchPage,
  flatten,
  columns,
  className = "btn-xs",
}: {
  label?: string;
  filename: string;
  pageSize?: number;
  fetchPage: (offset: number, limit: number) => Promise<{ rows: T[]; total: number }>;
  flatten: (row: T) => Record<string, unknown>;
  columns?: string[];
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const all: T[] = [];
      let offset = 0;
      // Cap total iterations so a bad endpoint can't loop forever.
      for (let i = 0; i < 200; i++) {
        const { rows, total } = await fetchPage(offset, pageSize);
        all.push(...rows);
        if (rows.length < pageSize || all.length >= total) break;
        offset += pageSize;
      }
      downloadCsv(filename, all.map(flatten), columns);
    } catch (e: any) {
      setErr(extractErrMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button type="button" className={className} onClick={run} disabled={busy}>
        {busy ? "Exporting…" : label}
      </button>
      {err && (
        <span style={{ color: "var(--err, #ef4444)", fontSize: 12 }}>{err}</span>
      )}
    </span>
  );
}

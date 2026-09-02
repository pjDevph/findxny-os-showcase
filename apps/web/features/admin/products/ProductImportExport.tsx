"use client";

import { useState } from "react";
import { useCsvImportExport, toCSV, download } from "../shared/useCsvImportExport";

/* ─── Types ─────────────────────────────────────────────────────────── */
export type ImportRow = {
  name: string;
  sku?: string;
  barcode?: string;
  category?: string;
  price?: number;
  cost?: number;
  purchase_unit?: string;
  selling_unit?: string;
  description?: string;
  for_sale?: boolean;
  kitchen_required?: boolean;
  active?: boolean;
  featured?: boolean;
  featured_tag?: string;
  track_inventory?: boolean;
};

export type ExportProduct = {
  name: string;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  price?: number | null;
  cost?: number | null;
  purchase_unit?: string | null;
  selling_unit?: string | null;
  featured_blurb?: string | null;
  for_sale?: boolean;
  kitchen_required?: boolean;
  active?: boolean;
  featured?: boolean;
  featured_tag?: string | null;
  track_inventory?: boolean;
};

/* ─── CSV columns ────────────────────────────────────────────────────── */
const HEADERS = [
  "name", "sku", "barcode", "category",
  "price", "cost", "purchase_unit", "selling_unit",
  "description", "for_sale", "kitchen_required",
  "active", "featured", "featured_tag", "track_inventory",
] as const;

const EXAMPLE_ROW = [
  "Caramel Frappe", "CF-001", "", "Frappes",
  "175", "45", "pcs", "cup",
  "Smooth caramel blend with espresso", "TRUE", "TRUE",
  "TRUE", "FALSE", "", "FALSE",
];

/* ─── onFile helpers ─────────────────────────────────────────────────── */
function buildImportRow(get: (col: string) => string, num: (col: string) => number | undefined): ImportRow {
  const boolVal = (col: string) => get(col).toUpperCase() === "TRUE";
  return {
    name:             get("name"),
    sku:              get("sku")           || undefined,
    barcode:          get("barcode")       || undefined,
    category:         get("category")      || undefined,
    price:            num("price"),
    cost:             num("cost"),
    purchase_unit:    get("purchase_unit") || undefined,
    selling_unit:     get("selling_unit")  || undefined,
    description:      get("description")   || undefined,
    for_sale:         boolVal("for_sale"),
    kitchen_required: boolVal("kitchen_required"),
    active:           boolVal("active"),
    featured:         boolVal("featured"),
    featured_tag:     get("featured_tag")  || undefined,
    track_inventory:    boolVal("track_inventory"),
  };
}

function collectDupSkus(rows: ImportRow[]): string[] {
  const skuCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.sku) { const k = r.sku.toLowerCase(); skuCounts.set(k, (skuCounts.get(k) ?? 0) + 1); }
  }
  return [...skuCounts.entries()].filter(([, c]) => c > 1).map(([s]) => s.toUpperCase());
}

/* ═══ Main Component ═══════════════════════════════════════════════════ */
export function ProductImportExport({
  products,
  importAction,
}: {
  products: ExportProduct[];
  importAction: (rows: ImportRow[]) => Promise<{ imported: number; errors: string[] }>;
}) {
  const [markDraft, setMarkDraft] = useState(true);

  const {
    open, setOpen, loading, result, setResult, preview, setPreview, fileRef,
    downloadTemplate, onFile, confirmImport: runImport,
  } = useCsvImportExport<ImportRow, { missingPrice: number; dupSkus: string[] }>({
    headers: HEADERS,
    exampleRow: EXAMPLE_ROW,
    templateFilename: "products-template.csv",
    parseRow: ({ rowIndex, get, num }) => {
      const row = buildImportRow(get, num);
      if (!row.name) return { error: `Row ${rowIndex + 1}: missing name — skipped` };
      return { row };
    },
    isEmptyResult: (rows, errors) => rows.length === 0 && errors.length > 0,
    deriveExtras: (rows) => ({
      missingPrice: rows.filter((r) => r.for_sale !== false && r.price == null).length,
      dupSkus: collectDupSkus(rows),
    }),
  });

  /* ── Export existing products ── */
  function exportProducts() {
    const rows = products.map((p) => [
      p.name,
      p.sku ?? "",
      p.barcode ?? "",
      p.category ?? "",
      p.price ?? "",
      p.cost ?? "",
      p.purchase_unit ?? "",
      p.selling_unit ?? "",
      p.featured_blurb ?? "",
      p.for_sale !== false ? "TRUE" : "FALSE",
      p.kitchen_required ? "TRUE" : "FALSE",
      p.active !== false ? "TRUE" : "FALSE",
      p.featured ? "TRUE" : "FALSE",
      p.featured_tag ?? "",
      p.track_inventory ? "TRUE" : "FALSE",
    ]);
    const csv = toCSV([[...HEADERS], ...rows]);
    const date = new Date().toISOString().slice(0, 10);
    download(csv, `products-export-${date}.csv`);
  }

  /* ── Confirm import ── */
  async function confirmImport() {
    // Optionally hide price-less rows from the menu until a price is set.
    await runImport(importAction, (rows) =>
      markDraft
        ? rows.map((r) => (r.for_sale !== false && r.price == null ? { ...r, active: false } : r))
        : rows,
    );
  }

  return (
    <>
      {/* Trigger */}
      <button
        className="btn-xs"
        onClick={() => { setOpen((o) => !o); setPreview(null); setResult(null); }}
        style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v14M5 10l7 7 7-7"/><path d="M5 21h14"/>
        </svg>
        Import / Export
      </button>

      {/* Click-outside backdrop */}
      {open && <button type="button" aria-label="Close" style={{ position: "fixed", inset: 0, zIndex: 298, border: "none", background: "transparent", padding: 0, cursor: "default" }} onClick={() => setOpen(false)} />}

      {/* Panel */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 299,
          background: "var(--surface-2,#1a1a1a)", border: "1px solid var(--border-2,#333)",
          borderRadius: 16, padding: 22, width: 360,
          boxShadow: "0 20px 60px rgba(0,0,0,.7)",
        }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Bulk Import / Export</div>
              <div style={{ fontSize: 11, color: "var(--text-3,#666)", marginTop: 2 }}>Skip manual entry — use a spreadsheet</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "var(--text-3,#666)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 4px" }}>×</button>
          </div>

          {/* Step 1 — Template */}
          <PanelSection n={1} label="Get the template">
            <p style={descSt}>
              Open in Excel, Google Sheets, or Numbers. Each row = one product.
              Only <strong>name</strong> is required — leave other columns blank if unsure.
            </p>
            <button className="btn-xs primary" onClick={downloadTemplate} style={fullBtnSt}>
              ↓ Download products-template.csv
            </button>
          </PanelSection>

          {/* Step 2 — Import */}
          <PanelSection n={2} label="Import your CSV">
            <p style={descSt}>
              We&apos;ll preview the rows before saving. Existing products matched by name will be updated.
            </p>
            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onFile} />

            {!preview ? (
              <button className="btn-xs" onClick={() => fileRef.current?.click()} style={fullBtnSt} disabled={loading}>
                ↑ Choose CSV file…
              </button>
            ) : (
              <div style={{ background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.25)", borderRadius: 10, padding: "12px 14px", marginBottom: 2 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--amber,#f59e0b)", marginBottom: 4 }}>
                  Preview — {preview.rows.length} product{preview.rows.length !== 1 ? "s" : ""} ready to import
                </div>
                <div style={{ maxHeight: 120, overflowY: "auto", marginBottom: 10 }}>
                  {preview.rows.slice(0, 8).map((r, i) => (
                    <div key={i} style={{ fontSize: 11, color: "var(--text-2,#ccc)", padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,.04)", display: "flex", gap: 8 }}>
                      <span style={{ fontWeight: 700, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                      {r.category && <span style={{ color: "var(--text-3,#666)", flexShrink: 0 }}>{r.category}</span>}
                      {r.price != null && <span style={{ color: "var(--amber,#f59e0b)", flexShrink: 0 }}>₱{r.price}</span>}
                    </div>
                  ))}
                  {preview.rows.length > 8 && (
                    <div style={{ fontSize: 11, color: "var(--text-3,#555)", padding: "4px 0" }}>…and {preview.rows.length - 8} more</div>
                  )}
                </div>
                {preview.raw && (
                  <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 8 }}>{preview.raw}</div>
                )}

                {/* Validation summary */}
                {(preview.missingPrice > 0 || preview.dupSkus.length > 0) && (
                  <div style={{ fontSize: 11, color: "#fca5a5", marginBottom: 8, lineHeight: 1.6 }}>
                    {preview.missingPrice > 0 && (
                      <div>⚠ {preview.missingPrice} sellable row{preview.missingPrice !== 1 ? "s" : ""} missing a price.</div>
                    )}
                    {preview.dupSkus.length > 0 && (
                      <div>⚠ Duplicate SKU{preview.dupSkus.length !== 1 ? "s" : ""}: {preview.dupSkus.slice(0, 5).join(", ")}{preview.dupSkus.length > 5 ? " …" : ""}</div>
                    )}
                  </div>
                )}
                {preview.missingPrice > 0 && (
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11, color: "var(--text-2,#ccc)", marginBottom: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={markDraft} onChange={(e) => setMarkDraft(e.target.checked)} style={{ marginTop: 2 }} />
                    <span>Hide price-less items from the menu (import as inactive) until a price is set.</span>
                  </label>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-xs danger" onClick={() => setPreview(null)} style={{ flex: 1, justifyContent: "center" }}>Cancel</button>
                  <button className="btn-xs primary" onClick={confirmImport} disabled={loading} style={{ flex: 2, justifyContent: "center", fontWeight: 800 }}>
                    {loading ? "Importing…" : `✓ Import ${preview.rows.length} products`}
                  </button>
                </div>
              </div>
            )}

            {/* Result banner */}
            {result && <ImportResult result={result} />}
          </PanelSection>

          {/* Step 3 — Export */}
          <PanelSection n={3} label={`Export all ${products.length} products`} last>
            <p style={descSt}>
              Download your full catalog as CSV — great for bulk edits or backups.
              Re-import the edited file to update everything at once.
            </p>
            <button className="btn-xs" onClick={exportProducts} disabled={products.length === 0} style={fullBtnSt}>
              ↓ Export products-export.csv
            </button>
          </PanelSection>

          {/* Column reference */}
          <div style={{ marginTop: 4, padding: "10px 12px", background: "rgba(255,255,255,.025)", borderRadius: 8, border: "1px solid var(--border-1,#222)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3,#555)", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".05em" }}>CSV columns</div>
            <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 10, color: "var(--text-3,#444)", lineHeight: 2 }}>
              {HEADERS.join(" · ")}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Import result — grouped, collapsible errors ────────────────────── */
function groupErrorsByReason(errors: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const e of errors) {
    const m = /^"([^"]+)":\s*(.+)$/.exec(e); // NOSONAR - applied to controlled internal data
    const name   = m ? m[1] : e;
    const reason = m ? m[2] : "Unknown error";
    const short = reason.length > 80 ? reason.slice(0, 80).replace(/\s\S+$/, "") + "…" : reason;
    if (!groups.has(short)) groups.set(short, []);
    groups.get(short)!.push(name);
  }
  return groups;
}

function resolveResultStyle(allOk: boolean, hasErrors: boolean, imported: number): { bg: string; border: string } {
  if (allOk) return { bg: "rgba(56,211,159,.08)", border: "rgba(56,211,159,.3)" };
  if (hasErrors && imported === 0) return { bg: "rgba(239,68,68,.08)", border: "rgba(239,68,68,.3)" };
  return { bg: "rgba(245,158,11,.07)", border: "rgba(245,158,11,.3)" };
}

function ImportResult({ result }: { result: { imported: number; errors: string[] } }) {
  const [showDetails, setShowDetails] = useState(false);
  const hasErrors = result.errors.length > 0;
  const allOk = result.imported > 0 && !hasErrors;
  const groups = groupErrorsByReason(result.errors);
  const { bg, border } = resolveResultStyle(allOk, hasErrors, result.imported);

  return (
    <div style={{
      marginTop: 10, padding: "10px 12px", borderRadius: 8, fontSize: 12,
      background: bg, border: `1px solid ${border}`,
    }}>
      {/* Success line */}
      {result.imported > 0 && (
        <div style={{ color: "#38d39f", fontWeight: 700, marginBottom: hasErrors ? 6 : 0 }}>
          ✓ {result.imported} product{result.imported !== 1 ? "s" : ""} imported
        </div>
      )}

      {/* Error summary */}
      {hasErrors && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ color: "#fca5a5", fontWeight: 600 }}>
              ⚠ {result.errors.length} row{result.errors.length !== 1 ? "s" : ""} skipped
            </div>
            <button
              onClick={() => setShowDetails((v) => !v)}
              style={{ background: "none", border: "none", color: "var(--text-3,#666)", cursor: "pointer", fontSize: 11, padding: 0 }}
            >
              {showDetails ? "Hide details ▲" : "Show details ▼"}
            </button>
          </div>

          {showDetails && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {[...groups.entries()].map(([reason, names], gi) => (
                <div key={gi} style={{ background: "rgba(239,68,68,.06)", borderRadius: 6, padding: "7px 9px" }}>
                  <div style={{ color: "#fca5a5", fontWeight: 600, marginBottom: 3, fontSize: 11 }}>{reason}</div>
                  <div style={{ color: "var(--text-3,#777)", fontSize: 11, lineHeight: 1.6 }}>
                    {names.slice(0, 5).join(", ")}
                    {names.length > 5 && <span style={{ color: "var(--text-3,#555)" }}> +{names.length - 5} more</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!showDetails && result.imported === 0 && (
            <div style={{ color: "var(--text-3,#666)", fontSize: 11, marginTop: 3 }}>
              Tap &quot;Show details&quot; to see which rows failed and why.
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────────────── */
function PanelSection({ n, label, children, last }: { n: number; label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 14 : 18, paddingBottom: last ? 0 : 18, borderBottom: last ? "none" : "1px solid var(--border-1,#222)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
          background: "rgba(245,158,11,.15)", border: "1.5px solid rgba(245,158,11,.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 800, color: "var(--amber,#f59e0b)",
        }}>{n}</div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div>
      </div>
      {children}
    </div>
  );
}

/* ─── Shared styles ────────────────────────────────────────────────────── */
const descSt: React.CSSProperties = {
  fontSize: 12, color: "var(--text-3,#666)", marginBottom: 10, lineHeight: 1.65,
};
const fullBtnSt: React.CSSProperties = {
  width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: 6,
};

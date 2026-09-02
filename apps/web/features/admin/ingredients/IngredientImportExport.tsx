"use client";

import { useCsvImportExport, toCSV, download } from "../shared/useCsvImportExport";

/* ─── Types ─────────────────────────────────────────────────────────── */
export type IngredientImportRow = {
  name: string;
  unit: string;
  cost?: number;
  stock?: number;
  threshold?: number;
};

export type IngredientExportRow = {
  name: string;
  unit: string;
  cost_per_unit?: number | null;
  stock_qty?: number | null;
  low_stock_threshold?: number | null;
};

/* ─── CSV columns ────────────────────────────────────────────────────── */
const HEADERS = ["name", "unit", "cost", "stock", "threshold"] as const;
const EXAMPLE_ROW = ["Fresh Milk", "ml", "0.08", "5000", "1000"];

/* ═══ Component ════════════════════════════════════════════════════════ */
export function IngredientImportExport({
  ingredients,
  importAction,
}: {
  ingredients: IngredientExportRow[];
  importAction: (rows: IngredientImportRow[]) => Promise<{ imported: number; errors: string[] }>;
}) {
  const {
    open, setOpen, loading, result, setResult, preview, setPreview, fileRef,
    downloadTemplate, onFile, confirmImport: runImport,
  } = useCsvImportExport<IngredientImportRow, { missingCost: number }>({
    headers: HEADERS,
    exampleRow: EXAMPLE_ROW,
    templateFilename: "ingredients-template.csv",
    parseRow: ({ rowIndex, get, num }) => {
      const name = get("name");
      const unit = get("unit");
      if (!name) return { error: `Row ${rowIndex + 1}: missing name — skipped` };
      if (!unit) return { error: `Row ${rowIndex + 1} ("${name}"): missing unit — skipped` };
      return { row: { name, unit, cost: num("cost"), stock: num("stock"), threshold: num("threshold") } };
    },
    deriveExtras: (rows) => ({ missingCost: rows.filter((r) => r.cost == null || r.cost === 0).length }),
  });

  function exportIngredients() {
    const rows = ingredients.map((i) => [
      i.name, i.unit, i.cost_per_unit ?? "", i.stock_qty ?? "", i.low_stock_threshold ?? "",
    ]);
    download(toCSV([[...HEADERS], ...rows]), `ingredients-export-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  async function confirmImport() {
    await runImport(importAction);
  }

  return (
    <>
      <button className="btn-xs" onClick={() => { setOpen((o) => !o); setPreview(null); setResult(null); }}
        style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v14M5 10l7 7 7-7" /><path d="M5 21h14" />
        </svg>
        Import / Export
      </button>

      {open && <button type="button" aria-label="Close" style={{ position: "fixed", inset: 0, zIndex: 298, border: "none", background: "transparent", padding: 0, cursor: "default" }} onClick={() => setOpen(false)} />}

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 299,
          background: "var(--surface-2,#1a1a1a)", border: "1px solid var(--border-2,#333)",
          borderRadius: 16, padding: 22, width: 360, boxShadow: "0 20px 60px rgba(0,0,0,.7)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Bulk Import / Export</div>
              <div style={{ fontSize: 11, color: "var(--text-3,#666)", marginTop: 2 }}>Ingredients — skip manual entry</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "var(--text-3,#666)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "2px 4px" }}>×</button>
          </div>

          <Section n={1} label="Get the template">
            <p style={descSt}>Each row = one ingredient. <strong>name</strong> and <strong>unit</strong> are required. Cost is per stock unit (e.g. ₱ per ml/gram).</p>
            <button className="btn-xs primary" onClick={downloadTemplate} style={fullBtnSt}>↓ Download ingredients-template.csv</button>
          </Section>

          <Section n={2} label="Import your CSV">
            <p style={descSt}>Existing ingredients matched by name are updated. Others are created.</p>
            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onFile} />
            {!preview ? (
              <button className="btn-xs" onClick={() => fileRef.current?.click()} style={fullBtnSt} disabled={loading}>↑ Choose CSV file…</button>
            ) : (
              <div style={{ background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.25)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--amber,#f59e0b)", marginBottom: 6 }}>
                  Preview — {preview.rows.length} ingredient{preview.rows.length !== 1 ? "s" : ""} ready
                </div>
                <div style={{ maxHeight: 120, overflowY: "auto", marginBottom: 10 }}>
                  {preview.rows.slice(0, 8).map((r, i) => (
                    <div key={i} style={{ fontSize: 11, color: "var(--text-2,#ccc)", padding: "2px 0", display: "flex", gap: 8 }}>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                      <span style={{ color: "var(--text-3,#666)" }}>{r.unit}</span>
                      {r.cost != null && <span style={{ color: "var(--amber,#f59e0b)" }}>₱{r.cost}</span>}
                    </div>
                  ))}
                  {preview.rows.length > 8 && <div style={{ fontSize: 11, color: "var(--text-3,#555)" }}>…and {preview.rows.length - 8} more</div>}
                </div>
                {preview.raw && <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 8 }}>{preview.raw}</div>}
                {preview.missingCost > 0 && (
                  <div style={{ fontSize: 11, color: "#fca5a5", marginBottom: 8 }}>
                    ⚠ {preview.missingCost} ingredient{preview.missingCost !== 1 ? "s" : ""} have no cost — food-cost % will be inaccurate until set.
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-xs danger" onClick={() => setPreview(null)} style={{ flex: 1, justifyContent: "center" }}>Cancel</button>
                  <button className="btn-xs primary" onClick={confirmImport} disabled={loading} style={{ flex: 2, justifyContent: "center", fontWeight: 800 }}>
                    {loading ? "Importing…" : `✓ Import ${preview.rows.length}`}
                  </button>
                </div>
              </div>
            )}
            {result && (
              <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, fontSize: 12,
                background: result.errors.length === 0 ? "rgba(56,211,159,.08)" : "rgba(245,158,11,.07)",
                border: `1px solid ${result.errors.length === 0 ? "rgba(56,211,159,.3)" : "rgba(245,158,11,.3)"}` }}>
                {result.imported > 0 && <div style={{ color: "#38d39f", fontWeight: 700 }}>✓ {result.imported} ingredient{result.imported !== 1 ? "s" : ""} imported</div>}
                {result.errors.length > 0 && (
                  <div style={{ color: "#fca5a5", marginTop: result.imported > 0 ? 6 : 0, maxHeight: 120, overflowY: "auto" }}>
                    {result.errors.slice(0, 10).map((e, i) => <div key={i} style={{ fontSize: 11 }}>{e}</div>)}
                    {result.errors.length > 10 && <div style={{ fontSize: 11, color: "var(--text-3,#666)" }}>+{result.errors.length - 10} more</div>}
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section n={3} label={`Export all ${ingredients.length} ingredients`} last>
            <p style={descSt}>Download the full list as CSV — edit in a spreadsheet and re-import to update.</p>
            <button className="btn-xs" onClick={exportIngredients} disabled={ingredients.length === 0} style={fullBtnSt}>↓ Export ingredients-export.csv</button>
          </Section>
        </div>
      )}
    </>
  );
}

function Section({ n, label, children, last }: { n: number; label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ marginBottom: last ? 4 : 18, paddingBottom: last ? 0 : 18, borderBottom: last ? "none" : "1px solid var(--border-1,#222)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, background: "rgba(245,158,11,.15)", border: "1.5px solid rgba(245,158,11,.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "var(--amber,#f59e0b)" }}>{n}</div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div>
      </div>
      {children}
    </div>
  );
}

const descSt: React.CSSProperties = { fontSize: 12, color: "var(--text-3,#666)", marginBottom: 10, lineHeight: 1.65 };
const fullBtnSt: React.CSSProperties = { width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: 6 };

"use client";

import { useCsvImportExport } from "../shared/useCsvImportExport";

export type InventoryImportRow = { branch: string; product: string; qty: number; unit?: string; threshold?: number; cost?: number };

const HEADERS = ["branch", "product", "qty", "unit", "threshold", "cost"] as const;
const EXAMPLE_ROW = ["Angono, Rizal", "Caramel Frappe", "0", "cup", "0", "0"];

export function InventoryImportExport({
  importAction,
}: {
  importAction: (rows: InventoryImportRow[]) => Promise<{ imported: number; errors: string[] }>;
}) {
  const {
    open, setOpen, loading, result, setResult, preview, setPreview, fileRef,
    downloadTemplate, onFile, confirmImport: runImport,
  } = useCsvImportExport<InventoryImportRow>({
    headers: HEADERS,
    exampleRow: EXAMPLE_ROW,
    templateFilename: "inventory-template.csv",
    escapeCsv: false,
    parseRow: ({ rowIndex, get, num }) => {
      const branch = get("branch"), product = get("product");
      const qty = Number(get("qty") || "0");
      if (!branch || !product) return { error: `Row ${rowIndex + 1}: missing branch or product — skipped` };
      if (!Number.isFinite(qty)) return { error: `Row ${rowIndex + 1} (${product}): invalid qty — skipped` };
      return { row: { branch, product, qty, unit: get("unit") || undefined, threshold: num("threshold"), cost: num("cost") } };
    },
  });

  async function confirmImport() {
    await runImport(importAction);
  }

  return (
    <>
      <button className="btn-xs" onClick={() => { setOpen((o) => !o); setPreview(null); setResult(null); }}
        style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
        Import CSV
      </button>
      {open && <button type="button" aria-label="Close" style={{ position: "fixed", inset: 0, zIndex: 298, border: "none", background: "transparent", padding: 0, cursor: "default" }} onClick={() => setOpen(false)} />}
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 299,
          background: "var(--surface-2,#1a1a1a)", border: "1px solid var(--border-2,#333)",
          borderRadius: 16, padding: 22, width: 360, boxShadow: "0 20px 60px rgba(0,0,0,.7)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>Import Branch Inventory</div>
              <div style={{ fontSize: 11, color: "var(--text-3,#666)", marginTop: 2 }}>Products must exist first</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "var(--text-3,#666)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
          </div>

          <p style={descSt}>One row per product per branch: <strong>branch, product, qty, unit, threshold, cost</strong>. Branch and product are matched by name. Creates the tracking row with opening stock.</p>
          <button className="btn-xs primary" onClick={downloadTemplate} style={{ ...fullBtnSt, marginBottom: 12 }}>↓ Download inventory-template.csv</button>

          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={onFile} />
          {!preview ? (
            <button className="btn-xs" onClick={() => fileRef.current?.click()} style={fullBtnSt} disabled={loading}>↑ Choose CSV file…</button>
          ) : (
            <div style={{ background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.25)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--amber,#f59e0b)", marginBottom: 6 }}>
                Preview — {preview.rows.length} row{preview.rows.length !== 1 ? "s" : ""}
              </div>
              <div style={{ maxHeight: 120, overflowY: "auto", marginBottom: 10 }}>
                {preview.rows.slice(0, 8).map((r, i) => (
                  <div key={i} style={{ fontSize: 11, color: "var(--text-2,#ccc)", padding: "2px 0", display: "flex", gap: 8 }}>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.product}</span>
                    <span style={{ color: "var(--text-3,#666)" }}>{r.branch}</span>
                    <span style={{ color: "var(--amber,#f59e0b)" }}>{r.qty}{r.unit ?? ""}</span>
                  </div>
                ))}
                {preview.rows.length > 8 && <div style={{ fontSize: 11, color: "var(--text-3,#555)" }}>…and {preview.rows.length - 8} more</div>}
              </div>
              {preview.raw && <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 8 }}>{preview.raw}</div>}
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
              {result.imported > 0 && <div style={{ color: "#38d39f", fontWeight: 700 }}>✓ {result.imported} row{result.imported !== 1 ? "s" : ""} imported</div>}
              {result.errors.length > 0 && (
                <div style={{ color: "#fca5a5", marginTop: result.imported > 0 ? 6 : 0, maxHeight: 120, overflowY: "auto" }}>
                  {result.errors.slice(0, 10).map((e, i) => <div key={i} style={{ fontSize: 11 }}>{e}</div>)}
                  {result.errors.length > 10 && <div style={{ fontSize: 11, color: "var(--text-3,#666)" }}>+{result.errors.length - 10} more</div>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

const descSt: React.CSSProperties = { fontSize: 12, color: "var(--text-3,#666)", marginBottom: 10, lineHeight: 1.65 };
const fullBtnSt: React.CSSProperties = { width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: 6 };

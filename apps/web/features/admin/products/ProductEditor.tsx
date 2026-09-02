"use client";

import { useEffect, useMemo, useState } from "react";
import { SlideOver, type Tab } from "@/components/ui/SlideOver";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "@/lib/toast";
import { supabaseBrowser } from "@/lib/supabase/client";
import { UnitPicker, PURCHASE_UNIT_GROUPS, SELLING_UNIT_GROUPS } from "./UnitPicker";
import { RecipeUnitSelect } from "./RecipeUnitSelect";
import { IngredientPicker } from "./IngredientPicker";
import { AddonsPanel } from "./AddonsPanel";
import {
  compatibleUnits, convertQty, foodCostPct, foodCostTier,
  isUnderpriced, suggestedPrice, type Unit,
} from "@/features/costing/units";

type Category = { id: string; name: string };

// A choosable row in the unified inventory catalog — a raw material, or
// another product that tracks its own stock (product_id set), which is what
// lets a recipe consume a standalone-sellable item's stock.
export type IngredientChoice = {
  id: string;
  name: string;
  sku?: string | null;
  purchase_unit: string;
  cost: number;
};

// One editable row in the "what this consumes" grid. Quantity is held as a
// string so the input can be empty/partial; it's coerced to a number on
// save. Blank rows (nothing picked yet) are allowed in the UI and filtered
// out when submitting.
type EditRow = {
  id?: string;        // present if loaded from server (existing line)
  catalog_id: string;
  qty: string;
  unit: string;
};

// Always show at least this many rows so the grid reads as a table.
const MIN_RECIPE_ROWS = 1;
const blankRow = (): EditRow => ({ catalog_id: "", qty: "", unit: "" });
function padRows(rows: EditRow[]): EditRow[] {
  const out = [...rows];
  while (out.length < MIN_RECIPE_ROWS) out.push(blankRow());
  return out;
}

// Shared column template for the recipe grid header + rows.
const RECIPE_GRID_COLS = "minmax(0, 1.8fr) 0.8fr 1.1fr 1fr 0.8fr 28px";

/** Amber asterisk marking a required column. */
function Req() {
  return <span style={{ color: "var(--amber-bright, var(--amber))" }}>*</span>;
}

/** Read-only, input-styled cell for auto-calculated values. */
function ReadonlyField({ value, color }: { value: string; color?: string }) {
  return (
    <div
      style={{
        height: 40, display: "flex", alignItems: "center", padding: "0 12px",
        borderRadius: 6, border: "1px solid var(--line)", background: "rgba(0,0,0,0.2)",
        color: color ?? "var(--text-2)", fontSize: 13, fontWeight: color ? 700 : 400,
      }}
    >
      {value}
    </div>
  );
}

/** Map a food-cost percentage to its tier colour (green / amber / red). */
function foodCostColor(pct: number | null): string | undefined {
  if (pct == null || !Number.isFinite(pct)) return undefined;
  const t = foodCostTier(pct);
  return t === "ok"   ? "var(--ok, #38d39f)"
       : t === "warn" ? "var(--amber-bright, var(--amber))"
       :                "var(--err, #ff5050)";
}

type Product = {
  id?: string;
  name?: string;
  sku?: string | null;
  barcode?: string | null;
  price?: number | string;
  category_id?: string | null;
  kitchen_required?: boolean;
  prep_station?: "none" | "kitchen" | "drinks" | "counter" | null;
  active?: boolean;
  featured?: boolean;
  featured_tag?: string | null;
  featured_blurb?: string | null;
  image_url?: string | null;
  purchase_unit?: string;
  selling_unit?: string;
  cost?: number;
  for_sale?: boolean;
  is_pinned?: boolean;
  track_inventory?: boolean;
};

const TABS: Tab[] = [
  { id: "basic",    label: "Basic" },
  { id: "pricing",  label: "Pricing" },
  { id: "recipe",   label: "Recipe" },
  { id: "advanced", label: "Advanced" },
];

function loadRecipeLines(
  loadRecipeItems: () => Promise<{
    lines: Array<{ id: string; catalog_id: string; qty: number; unit: string; section?: string }>;
    alreadyActivated: boolean;
  }>,
  onLoaded: (rows: EditRow[], alreadyActivated: boolean) => void,
  onDone: () => void,
): () => void {
  let cancelled = false;
  loadRecipeItems()
    .then(({ lines, alreadyActivated }) => {
      if (cancelled) return;
      onLoaded(padRows(lines.map((it) => ({
        id: it.id, catalog_id: it.catalog_id, qty: String(it.qty), unit: it.unit,
      }))), alreadyActivated);
    })
    .finally(() => { if (!cancelled) onDone(); });
  return () => { cancelled = true; };
}

function calcRowCost(
  r: EditRow,
  ingredientById: Map<string, IngredientChoice>,
  sellingPrice: number,
): { lineCost: number | null; fcPct: number | null } {
  const ing = ingredientById.get(r.catalog_id);
  const q = Number(r.qty);
  if (!ing || !Number.isFinite(q) || q <= 0 || !r.unit) return { lineCost: null, fcPct: null };
  const inPurchase = convertQty(q, r.unit, ing.purchase_unit);
  if (inPurchase == null) return { lineCost: null, fcPct: null };
  const lineCost = inPurchase * Number(ing.cost ?? 0);
  const fc = sellingPrice > 0 ? (lineCost / sellingPrice) * 100 : null;
  return { lineCost, fcPct: fc };
}

function patchRowWithIngredientDefault(
  row: EditRow,
  patch: Partial<EditRow>,
  ingredientById: Map<string, IngredientChoice>,
): EditRow {
  const next = { ...row, ...patch };
  if (patch.catalog_id !== undefined && patch.catalog_id !== row.catalog_id) {
    const ing = ingredientById.get(patch.catalog_id);
    next.unit = ing ? ing.purchase_unit : "";
  }
  return next;
}

export function ProductEditor({
  categories,
  ingredients,
  branches = [],
  initial,
  saveAction,
  loadRecipeItems,
  triggerLabel,
  triggerClass = "btn btn-primary",
  workspaceId,
}: {
  categories: Category[];
  /** Other workspace products available as recipe components. */
  ingredients?: IngredientChoice[];
  /** Needed for the Simple-quantity opening-stock branch picker. */
  branches?: { id: string; name: string }[];
  initial?: Product;
  /** Server action: receives FormData with product fields + a hidden `recipe_items` JSON blob. */
  saveAction: (formData: FormData) => Promise<void>;
  /** Optional: load existing recipe lines for edit mode. */
  loadRecipeItems?: () => Promise<{
    lines: Array<{ id: string; catalog_id: string; qty: number; unit: string; section?: string }>;
    alreadyActivated: boolean;
  }>;
  triggerLabel: string;
  triggerClass?: string;
  /** Workspace ID — required for the Add-ons panel to make client-side API calls. */
  workspaceId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<string>("basic");
  const [imageUrl, setImageUrl] = useState<string>(initial?.image_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Controlled name/price so the Create/Save button can disable until the
  // required fields are actually filled in (name+price mirror the `required`
  // attributes below — keep both in sync if those change).
  const [name, setName] = useState<string>(initial?.name ?? "");
  const [price, setPrice] = useState<string>(
    initial?.price !== undefined ? String(initial.price) : "",
  );

  // Editable target food-cost % driving the suggested selling price.
  const [targetPct, setTargetPct] = useState<string>("30");

  // Editable recipe rows (no server writes until Submit).
  const [rows, setRows] = useState<EditRow[]>(() => padRows([]));
  const [linesLoading, setLinesLoading] = useState(false);
  const [removeIdx, setRemoveIdx] = useState<number | null>(null);

  // Stock-tracking mode — decided right here, same as the POS app, instead
  // of a separate trip to Inventory. "simple" = physically-counted stock
  // (bottled drinks, packaged goods); "recipe" = made-to-order, consumes
  // other catalog entries (built in the Recipe tab).
  const [trackInventory, setTrackInventory] = useState(!!initial?.track_inventory);
  const [stockMode, setStockMode] = useState<"simple" | "recipe">("simple");
  const [stockBranchId, setStockBranchId] = useState(branches[0]?.id ?? "");
  const [stockUnit, setStockUnit] = useState("pcs");
  const [stockQty, setStockQty] = useState("0");
  const [stockThreshold, setStockThreshold] = useState("0");
  // True once this product already has a real inventory_items row (activated
  // via a prior save) — the one-time activation fields no longer apply, stock
  // changes from here on belong in Inventory's Adjust flow.
  const [alreadyActivated, setAlreadyActivated] = useState(false);

  const isEdit = !!initial?.id;
  const formId = "product-editor-form";

  // Load existing recipe lines when opening edit.
  useEffect(() => {
    if (!open || !isEdit || !loadRecipeItems) return;
    setLinesLoading(true);
    return loadRecipeLines(
      loadRecipeItems,
      (loadedRows, activated) => {
        setRows(loadedRows);
        setAlreadyActivated(activated);
        setStockMode(loadedRows.some((r) => r.catalog_id) ? "recipe" : "simple");
      },
      () => setLinesLoading(false),
    );
  }, [open, isEdit, loadRecipeItems]);

  // Reset on close.
  useEffect(() => {
    if (open) return;
    if (!isEdit) {
      setRows(padRows([])); setPrice("");
      setImageUrl("");
      setTrackInventory(false);
      setStockMode("simple");
      setStockBranchId(branches[0]?.id ?? "");
      setStockUnit("pcs"); setStockQty("0"); setStockThreshold("0");
      setAlreadyActivated(false);
    }
  }, [open, isEdit, branches]);

  const ingredientById = useMemo(
    () => new Map((ingredients ?? []).map((i) => [i.id, i])),
    [ingredients],
  );

  const sellingPrice = Number(price) || 0;

  // Per-row cost + this ingredient's share of the selling price.
  function rowCalc(r: EditRow): { lineCost: number | null; fcPct: number | null } {
    return calcRowCost(r, ingredientById, sellingPrice);
  }

  // Aggregate cost across all valid rows.
  const ingredientCost = useMemo(
    () => rows.reduce((sum, r) => sum + (calcRowCost(r, ingredientById, 0).lineCost ?? 0), 0),
    [rows, ingredientById],
  );

  // Valid rows serialised for the hidden form field (section is always "ingredient").
  const recipeBlob = useMemo(
    () => JSON.stringify(
      rows
        .filter((r) => r.catalog_id && Number(r.qty) > 0 && r.unit)
        .map((r) => ({ id: r.id, catalog_id: r.catalog_id, qty: Number(r.qty), unit: r.unit, section: "ingredient" })),
    ),
    [rows],
  );

  const fcPct = foodCostPct(ingredientCost, sellingPrice);
  const tier  = foodCostTier(fcPct);
  const tierColor =
    tier === "ok"   ? "var(--ok, #38d39f)" :
    tier === "warn" ? "var(--amber-bright, var(--amber))" :
    "var(--err, #ff5050)";
  const pctNum = Number(targetPct);
  const validPct = Number.isFinite(pctNum) && pctNum > 0;
  const suggested = suggestedPrice(ingredientCost, validPct ? pctNum : 30);
  const hasLines = rows.some((r) => r.catalog_id && Number(r.qty) > 0);

  function updateRow(idx: number, patch: Partial<EditRow>) {
    setRows((prev) => prev.map((r, i) =>
      i !== idx ? r : patchRowWithIngredientDefault(r, patch, ingredientById),
    ));
  }
  function addRow() { setRows((prev) => [...prev, blankRow()]); }
  function doRemoveRow(idx: number) {
    setRows((prev) => padRows(prev.filter((_, i) => i !== idx)));
  }
  // Populated rows ask for confirmation; blank rows clear immediately.
  function removeRow(idx: number) {
    if (rows[idx]?.catalog_id) setRemoveIdx(idx);
    else doRemoveRow(idx);
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (file.size > 5 * 1024 * 1024) { setUploadError("Max 5 MB."); return; }
    setUploading(true);
    try {
      const supabase = supabaseBrowser();
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const key = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("product-images")
        .upload(key, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("product-images").getPublicUrl(key);
      setImageUrl(data.publicUrl);
    } catch (err: any) {
      setUploadError(err?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <button type="button" className={triggerClass} onClick={() => { setTab("basic"); setOpen(true); }}>
        {triggerLabel}
      </button>

      <SlideOver
        open={open}
        onClose={() => setOpen(false)}
        title={isEdit ? "Edit product" : "New product"}
        subtitle={isEdit ? initial?.name ?? undefined : "Add an item to the catalog"}
        tabs={TABS}
        activeTab={tab}
        onTabChange={setTab}
        width={760}
        centered
        footer={
          <>
            <span style={{ fontSize: 12, color: "var(--text-3)", marginRight: "auto" }}>* Required</span>
            <button type="button" className="btn-xs" onClick={() => setOpen(false)}>Cancel</button>
            <ConfirmSubmitButton
              formId={formId}
              disabled={!name.trim() || !price}
              title={isEdit ? "Save changes to this product?" : "Create this product?"}
              confirmLabel={isEdit ? "Save changes" : "Create product"}
            >
              {isEdit ? "Save changes" : "Create product"}
            </ConfirmSubmitButton>
          </>
        }
      >
        <form
          id={formId}
          action={async (fd) => {
            await saveAction(fd);
            setOpen(false);
            toast(isEdit ? "Product updated" : "Product created", "add");
          }}
          style={{ display: "grid", gap: 14 }}
        >
          {isEdit && <input type="hidden" name="id" value={initial?.id ?? ""} />}
          {/* Staged recipe lines travel as a JSON blob. */}
          <input type="hidden" name="recipe_items" value={recipeBlob} />

          {/* ---------- BASIC ---------- */}
          <div style={{ display: tab === "basic" ? "grid" : "none", gap: 14 }}>
            <div className="admin-field">
              <label htmlFor="pe-name">Name *</label>
              <input id="pe-name" className="input" name="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="admin-field">
                <label htmlFor="pe-sku">SKU</label>
                <input id="pe-sku" className="input" name="sku" defaultValue={initial?.sku ?? ""} />
              </div>
              <div className="admin-field">
                <label htmlFor="pe-barcode">Barcode</label>
                <input id="pe-barcode" className="input" name="barcode" defaultValue={initial?.barcode ?? ""} />
              </div>
            </div>
            <div className="admin-field">
              <label htmlFor="pe-category">Category</label>
              <select id="pe-category" className="input" name="category_id" defaultValue={initial?.category_id ?? ""}>
                <option value="">Uncategorised</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="admin-field">
              <label htmlFor="pe-blurb">Description</label>
              <textarea
                id="pe-blurb" className="input" name="featured_blurb" rows={2}
                defaultValue={initial?.featured_blurb ?? ""}
                placeholder="Short description — shown on the menu and landing page featured cards"
                style={{ resize: "vertical" }}
              />
            </div>
            <div className="admin-field">
              <label htmlFor="pe-image">Image</label>
              <input type="hidden" name="image_url" value={imageUrl} />
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                {imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt=""
                    style={{ width: 84, height: 84, objectFit: "cover", border: "1px solid var(--line)", borderRadius: 8 }} />
                )}
                <div style={{ display: "grid", gap: 6, flex: 1 }}>
                  <input id="pe-image" type="file" accept="image/*" onChange={onPickImage} disabled={uploading}
                    style={{ fontSize: 12, color: "var(--text-2)" }} />
                  {uploading && <span className="dim" style={{ fontSize: 11 }}>Uploading…</span>}
                  {uploadError && <span style={{ fontSize: 11, color: "var(--err)" }}>{uploadError}</span>}
                  {imageUrl && !uploading && (
                    <button type="button" className="btn-xs" onClick={() => setImageUrl("")} style={{ width: "fit-content" }}>
                      Remove
                    </button>
                  )}
                  <span className="dim" style={{ fontSize: 11 }}>JPG/PNG/WebP, max 5 MB.</span>
                </div>
              </div>
            </div>
          </div>

          {/* ---------- PRICING ---------- */}
          <div style={{ display: tab === "pricing" ? "grid" : "none", gap: 14 }}>
            <div className="admin-field">
              <label htmlFor="pe-price">Selling Price *</label>
              <input
                id="pe-price" className="input" name="price" type="number" step="0.01" min="0.01"
                value={price} onChange={(e) => setPrice(e.target.value)} required
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="admin-field">
                <label htmlFor="pe-cost">Cost (per purchase unit)</label>
                <input id="pe-cost" className="input" name="cost" type="number" step="0.0001" min="0"
                  defaultValue={initial?.cost !== undefined ? String(initial.cost) : ""}
                  placeholder="manual for ingredients; auto for recipes" />
              </div>
              <div className="admin-field">
                <label htmlFor="pe-purchase-unit">Purchase unit</label>
                <UnitPicker id="pe-purchase-unit" name="purchase_unit" groups={PURCHASE_UNIT_GROUPS} defaultValue={initial?.purchase_unit ?? "pcs"} />
              </div>
            </div>
            <div className="admin-field">
              <label htmlFor="pe-selling-unit">Selling unit</label>
              <UnitPicker id="pe-selling-unit" name="selling_unit" groups={SELLING_UNIT_GROUPS} defaultValue={initial?.selling_unit ?? "pcs"} />
            </div>
            <CostingSummary
              ingredientCost={ingredientCost}
              sellingPrice={sellingPrice}
              fcPct={fcPct}
              tierColor={tierColor}
              suggested={suggested}
              targetPct={validPct ? pctNum : 30}
              hasLines={hasLines}
            />
          </div>

          {/* ---------- RECIPE (ingredients) ---------- */}
          <div style={{ display: tab === "recipe" ? "grid" : "none", gap: 14 }}>
            {(!ingredients || ingredients.length === 0) && (
              <div
                style={{
                  display: "flex", gap: 12, alignItems: "flex-start",
                  padding: "12px 14px", borderRadius: 8,
                  background: "rgba(var(--tint-rgb), 0.06)", border: "1px solid rgba(var(--tint-rgb), 0.35)",
                  color: "var(--text-2)", fontSize: 13,
                }}
              >
                <span style={{ color: "var(--amber-bright, var(--amber))", fontWeight: 700 }}>ⓘ</span>
                <span>
                  Nothing in Inventory yet.<br />
                  Add a raw material under Inventory first, then add it here.
                </span>
              </div>
            )}

            {linesLoading && <div className="dim">Loading…</div>}

            {/* Recipe grid */}
            <div style={{ display: "grid", gap: 8 }}>
              {/* Column headers */}
              <div
                style={{
                  display: "grid", gridTemplateColumns: RECIPE_GRID_COLS, gap: 10,
                  fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase",
                  color: "var(--text-3)", padding: "0 2px",
                }}
              >
                <div>Ingredient <Req /></div>
                <div>Quantity <Req /></div>
                <div>Unit <Req /></div>
                <div>Ingredients Cost</div>
                <div>Food Cost %</div>
                <div />
              </div>

              {rows.map((r, idx) => {
                const { lineCost, fcPct: rowFc } = rowCalc(r);
                const options = (ingredients ?? [])
                  .filter((i) => i.id !== initial?.id)
                  .filter((i) => i.id === r.catalog_id || !rows.some((o, j) => j !== idx && o.catalog_id === i.id));
                const filled = !!r.catalog_id;
                return (
                  <div
                    key={r.id ?? idx}
                    style={{ display: "grid", gridTemplateColumns: RECIPE_GRID_COLS, gap: 10, alignItems: "start" }}
                  >
                    <IngredientPicker
                      value={r.catalog_id}
                      onChange={(id) => updateRow(idx, { catalog_id: id })}
                      options={options}
                    />
                    <input
                      className="input" type="number" step="0.0001" min="0" placeholder="0"
                      value={r.qty}
                      onChange={(e) => updateRow(idx, { qty: e.target.value })}
                    />
                    <RecipeUnitSelect
                      value={r.unit}
                      onChange={(u) => updateRow(idx, { unit: u })}
                      disabled={!filled}
                    />
                    <ReadonlyField value={lineCost != null ? `₱${lineCost.toFixed(2)}` : "—"} />
                    <ReadonlyField value={rowFc != null ? `${rowFc.toFixed(1)} %` : "— %"} color={foodCostColor(rowFc)} />
                    <button
                      type="button"
                      aria-label="Remove ingredient row"
                      onClick={() => removeRow(idx)}
                      title="Remove row"
                      style={{
                        height: 40, width: 40, display: "flex", alignItems: "center", justifyContent: "center",
                        border: "1px solid var(--line)", borderRadius: 8,
                        background: "rgba(255,255,255,0.04)",
                        color: "var(--text-1)", cursor: "pointer", fontSize: 18, lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Add row */}
            <button
              type="button"
              onClick={addRow}
              style={{
                width: "fit-content", padding: "8px 14px", borderRadius: 6,
                border: "1px dashed var(--amber-bright, var(--amber))", background: "transparent",
                color: "var(--amber-bright, var(--amber))", fontSize: 13, cursor: "pointer",
              }}
            >
              + Add ingredient row
            </button>

            {/* Totals */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginTop: 4 }}>
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)" }}>
                  Total recipe cost
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1)" }}>
                  ₱{ingredientCost.toFixed(2)}
                </div>
              </div>
              <div style={{ display: "grid", gap: 6, minWidth: 240 }}>
                <div style={{ fontSize: 13, color: "var(--text-2)", textAlign: "right" }}>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                    <span>Suggested @</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={targetPct}
                      onChange={(e) => setTargetPct(e.target.value)}
                      aria-label="Target food cost percentage"
                      style={{
                        width: 56, padding: "4px 6px", textAlign: "right",
                        fontSize: 13, fontWeight: 700,
                        color: "var(--amber-bright, var(--amber))",
                        background: "rgba(var(--tint-rgb), 0.06)",
                        border: "1px solid rgba(var(--tint-rgb), 0.35)", borderRadius: 6,
                      }}
                    />
                    <span>%</span>
                  </span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--text-3)" }}>
                    recommended selling price
                  </span>
                </div>
                <div
                  style={{
                    padding: "12px 16px", borderRadius: 8, textAlign: "center",
                    fontSize: 18, fontWeight: 700,
                    color: hasLines && validPct ? "var(--amber-bright, var(--amber))" : "var(--text-3)",
                    background: "rgba(var(--tint-rgb), 0.06)",
                    border: `1px solid ${hasLines && validPct ? "var(--amber-bright, var(--amber))" : "rgba(var(--tint-rgb), 0.35)"}`,
                  }}
                >
                  {hasLines && validPct ? `₱${suggested.toFixed(2)}` : "₱—"}
                </div>
              </div>
            </div>

            {/* How it works */}
            <div
              style={{
                display: "flex", gap: 12, alignItems: "flex-start", marginTop: 4,
                padding: "12px 14px", borderRadius: 8,
                background: "rgba(56,211,159,0.06)", border: "1px solid rgba(56,211,159,0.3)",
              }}
            >
              <span style={{ color: "var(--ok, #38d39f)", fontWeight: 700 }}>✓</span>
              <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.6 }}>
                <div style={{ fontWeight: 700, color: "var(--text-1)", letterSpacing: "0.04em", marginBottom: 2 }}>
                  HOW IT WORKS
                </div>
                Search and select an ingredient → enter quantity and unit → costs and
                percentages update automatically → add more rows if needed → the suggested
                food cost appears at the bottom.
              </div>
            </div>
          </div>

          {/* ---------- ADVANCED ---------- */}
          <div style={{ display: tab === "advanced" ? "grid" : "none", gap: 14 }}>

            {/* Track inventory */}
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox" name="track_inventory"
                checked={trackInventory}
                onChange={(e) => setTrackInventory(e.target.checked)}
              />
              <span>Track inventory</span>
            </label>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: -8, paddingLeft: 24 }}>
              Off for services, rooms, or delivery fees. On for anything with real stock — choose
              below whether it&apos;s counted directly or made from a recipe.
            </div>

            {trackInventory && (
              <div style={{ paddingLeft: 24, display: "grid", gap: 12 }}>
                <input type="hidden" name="stock_mode" value={stockMode} />
                {alreadyActivated && <input type="hidden" name="already_activated" value="1" />}
                <div style={{ display: "flex", gap: 8 }}>
                  {([
                    { id: "simple" as const, label: "Simple quantity" },
                    { id: "recipe" as const, label: "Recipe" },
                  ]).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={alreadyActivated}
                      onClick={() => { setStockMode(opt.id); if (opt.id === "recipe") setTab("recipe"); }}
                      style={{
                        padding: "7px 14px", borderRadius: 20,
                        border: `1px solid ${stockMode === opt.id ? "var(--amber-bright, var(--amber))" : "var(--line)"}`,
                        background: stockMode === opt.id ? "rgba(var(--tint-rgb), 0.12)" : "var(--surface, #161616)",
                        color: stockMode === opt.id ? "var(--amber-bright, var(--amber))" : "var(--text-3)",
                        cursor: alreadyActivated ? "default" : "pointer",
                        opacity: alreadyActivated ? 0.6 : 1,
                        fontSize: 12, fontWeight: 600,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {stockMode === "simple" ? (
                  alreadyActivated ? (
                    <div
                      style={{
                        display: "flex", gap: 10, alignItems: "flex-start",
                        padding: "10px 14px", borderRadius: 8,
                        background: "rgba(56,211,159,0.06)", border: "1px solid rgba(56,211,159,0.3)",
                        color: "var(--text-2)", fontSize: 12.5,
                      }}
                    >
                      <span style={{ color: "var(--ok, #38d39f)", fontWeight: 700 }}>✓</span>
                      <span>
                        Stock tracking is active for this product. Adjust its quantity from the
                        Inventory screen — mode can&apos;t be changed once activated.
                      </span>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                        For items you physically count — bottled drinks, packaged goods, consumables.
                      </div>
                      <div className="admin-field">
                        <label htmlFor="pe-stock-branch">Branch</label>
                        <select
                          id="pe-stock-branch" className="input" name="stock_branch_id"
                          value={stockBranchId} onChange={(e) => setStockBranchId(e.target.value)}
                        >
                          {branches.length === 0 && <option value="">No branches</option>}
                          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                      <div className="admin-field">
                        <label htmlFor="pe-stock-unit">Unit *</label>
                        <UnitPicker id="pe-stock-unit" name="stock_unit" groups={PURCHASE_UNIT_GROUPS}
                          defaultValue={stockUnit} onChange={setStockUnit} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                        <div className="admin-field">
                          <label htmlFor="pe-stock-qty">Starting Quantity *</label>
                          <input id="pe-stock-qty" className="input" name="stock_qty" type="number" step="0.001" min="0"
                            value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
                        </div>
                        <div className="admin-field">
                          <label htmlFor="pe-stock-threshold">Low Stock Alert At</label>
                          <input id="pe-stock-threshold" className="input" name="stock_threshold" type="number" step="0.001" min="0"
                            placeholder="0 = disabled" value={stockThreshold} onChange={(e) => setStockThreshold(e.target.value)} />
                        </div>
                      </div>
                    </>
                  )
                ) : (
                  <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                    Build what this consumes in the <strong>Recipe</strong> tab (a dish consumes its raw materials).
                  </div>
                )}
              </div>
            )}

            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="for_sale" defaultChecked={initial?.for_sale !== false} />
              <span>Show on public web menu</span>
            </label>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: -8, paddingLeft: 24 }}>
              Uncheck to mark as an internal supply — tracked in inventory but never shown to customers.
            </div>
            <div className="admin-field">
              <label htmlFor="pe-prep-station">Preparation Station</label>
              <select id="pe-prep-station" name="prep_station" className="input"
                defaultValue={initial?.prep_station ?? (initial?.kitchen_required ? "kitchen" : "none")}>
                <option value="none">None — no prep ticket, goes straight to counter</option>
                <option value="kitchen">Kitchen — grilled, cooked, plated meals</option>
                <option value="drinks">Drinks — coffee, milk tea, juice</option>
                <option value="counter">Counter — packaged, grab-and-go items</option>
              </select>
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="active" defaultChecked={initial?.active !== false} />
              <span>Active (visible on POS) — independent of the web menu toggle above</span>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="featured" defaultChecked={!!initial?.featured} />
              <span>Featured on landing page</span>
            </label>
            <div className="admin-field">
              <label htmlFor="pe-featured-tag">Featured tag</label>
              <input id="pe-featured-tag" className="input" name="featured_tag" defaultValue={initial?.featured_tag ?? ""} placeholder="House Favourite" />
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: -6 }}>
              The description / blurb is set in the <strong>Basic</strong> tab.
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="is_pinned" defaultChecked={!!initial?.is_pinned} />
              <span>Pin to top of POS grid</span>
            </label>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: -8, paddingLeft: 24 }}>
              Pinned products appear first in the cashier&apos;s product list.
            </div>
          </div>
        </form>

        {/* Add-ons section — lives outside the main form; saves independently via client-side API */}
        {workspaceId && (
          <div style={{ marginTop: 24 }}>
            <AddonsPanel workspaceId={workspaceId} productId={initial?.id} />
          </div>
        )}
      </SlideOver>

      <ConfirmDialog
        open={removeIdx !== null}
        onClose={() => setRemoveIdx(null)}
        title="Remove this ingredient?"
        body={
          removeIdx !== null && rows[removeIdx]
            ? `"${ingredientById.get(rows[removeIdx].catalog_id)?.name ?? "This ingredient"}" will be removed from the recipe.`
            : undefined
        }
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => { if (removeIdx !== null) doRemoveRow(removeIdx); setRemoveIdx(null); }}
      />
    </>
  );
}

function CostingSummary({
  ingredientCost, sellingPrice, fcPct, tierColor, suggested, targetPct, hasLines,
}: {
  ingredientCost: number;
  sellingPrice: number;
  fcPct: number;
  tierColor: string;
  suggested: number;
  targetPct: number;
  hasLines: boolean;
}) {
  if (!hasLines) return null;
  return (
    <div
      style={{
        marginTop: 6, padding: 14, borderRadius: 8,
        background: "rgba(0,0,0,0.25)", border: "1px solid var(--line)",
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12,
      }}
    >
      <Metric label="Ingredient Cost" value={`₱${ingredientCost.toFixed(2)}`} />
      <Metric
        label="Food Cost %"
        value={Number.isFinite(fcPct) ? `${fcPct.toFixed(1)}%` : "—"}
        color={tierColor}
      />
      <Metric label={`Suggested @ ${targetPct}%`} value={`₱${suggested.toFixed(2)}`} />
      {Number.isFinite(fcPct) && isUnderpriced(fcPct) && (
        <div
          style={{
            gridColumn: "1 / -1", padding: "8px 12px",
            background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.4)",
            borderRadius: 6, fontSize: 12, color: "var(--err)",
          }}
        >
          ⚠ Underpriced — food cost is {fcPct.toFixed(1)}%. Consider ₱{suggested.toFixed(2)}.
        </div>
      )}
      {sellingPrice <= 0 && (
        <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "var(--text-3)" }}>
          Set a selling price to see Food Cost %.
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--f-display)", fontSize: 18, color: color ?? "var(--text-0)" }}>{value}</div>
    </div>
  );
}

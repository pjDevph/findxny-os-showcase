import { adminApi, resolveWorkspaceId } from "@/lib/admin-api";
import { revalidatePath } from "next/cache";
import { peso } from "@/lib/config";
import { InventoryRowActions } from "@/features/admin/inventory/InventoryDrawers";
import { InventoryImportExport, type InventoryImportRow } from "@/features/admin/inventory/InventoryImportExport";
import { IngredientEditor, type Ingredient } from "@/features/admin/ingredients/IngredientEditor";
import { IngredientImportExport, type IngredientImportRow } from "@/features/admin/ingredients/IngredientImportExport";
import { InventorySearch } from "@/features/admin/inventory/InventorySearch";
import { Pagination } from "@/components/ui/Pagination";

const PAGE_SIZE = 50;

function num(fd: FormData, key: string): number {
  const v = fd.get(key);
  if (typeof v !== "string" || v === "") return NaN;
  return Number(v);
}
function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

/* ---------- Stock actions (work for both raw materials and self-stocked products) ---------- */
async function stockInAction(workspaceId: string, formData: FormData) {
  "use server";
  const branch_id  = str(formData, "branch_id");
  const product_id = str(formData, "product_id");
  const quantity   = num(formData, "quantity");
  if (!branch_id || !Number.isFinite(quantity)) return;
  if (product_id) {
    // Product-linked: stock-in activates/creates the catalog entry as needed.
    await adminApi.stockIn({
      workspace_id: workspaceId, branch_id, product_id, quantity,
      unit_cost: Number.isFinite(num(formData, "unit_cost")) ? num(formData, "unit_cost") : undefined,
      supplier: str(formData, "supplier") || undefined,
      reason:   str(formData, "reason")   || undefined,
    });
  } else {
    // Raw material: restock its existing per-branch row directly.
    const inventory_item_id = str(formData, "inventory_item_id");
    if (!inventory_item_id) return;
    await adminApi.inventoryAdjust({
      workspace_id: workspaceId, branch_id, inventory_item_id,
      type: "in", quantity, reason: str(formData, "reason") || undefined,
    });
  }
  revalidatePath("/inventory");
}

async function stockOutAction(workspaceId: string, formData: FormData) {
  "use server";
  const inventory_item_id = str(formData, "inventory_item_id");
  const quantity = num(formData, "quantity");
  const reason_type = str(formData, "reason_type") as "damaged" | "expired" | "lost" | "other";
  if (!inventory_item_id || !Number.isFinite(quantity) || !reason_type) return;
  await adminApi.stockOut({
    workspace_id: workspaceId, inventory_item_id, quantity, reason_type,
    note: str(formData, "note") || undefined,
  });
  revalidatePath("/inventory");
}

async function adjustAction(workspaceId: string, formData: FormData) {
  "use server";
  const inventory_item_id = str(formData, "inventory_item_id");
  const branch_id = str(formData, "branch_id");
  const quantity  = num(formData, "quantity");
  const reason    = str(formData, "reason");
  if (!inventory_item_id || !branch_id || !Number.isFinite(quantity) || !reason) return;
  await adminApi.inventoryAdjust({
    workspace_id: workspaceId, branch_id, inventory_item_id,
    type: "adjustment", quantity, reason,
  });
  revalidatePath("/inventory");
}

async function loadMovements(workspaceId: string, inventoryItemId: string) {
  "use server";
  const { movements } = await adminApi.stockMovements(workspaceId, { inventory_item_id: inventoryItemId });
  return movements;
}

async function importInventoryAction(
  workspaceId: string,
  rows: InventoryImportRow[],
): Promise<{ imported: number; errors: string[] }> {
  "use server";
  const [productsRes, branchesRes] = await Promise.all([
    adminApi.products(workspaceId),
    adminApi.branches(workspaceId),
  ]);
  const prodMap   = new Map<string, string>(productsRes.products.map((p: any) => [String(p.name).toLowerCase(), p.id]));
  const branchMap = new Map<string, string>(branchesRes.branches.map((b: any) => [String(b.name).toLowerCase(), b.id]));

  let imported = 0;
  const errors: string[] = [];
  for (const r of rows) {
    const product_id = prodMap.get(r.product.toLowerCase());
    const branch_id  = branchMap.get(r.branch.toLowerCase());
    if (!branch_id)  { errors.push(`"${r.branch}": branch not found`); continue; }
    if (!product_id) { errors.push(`"${r.product}": product not found — import products first`); continue; }
    try {
      await adminApi.stockIn({
        workspace_id: workspaceId, branch_id, product_id, quantity: r.qty,
        unit: r.unit, low_stock_threshold: r.threshold, unit_cost: r.cost,
        reason: "Opening stock (import)",
      });
      imported++;
    } catch (e: any) {
      errors.push(`"${r.product}" @ "${r.branch}": ${e?.message ?? "failed"}`);
    }
  }
  revalidatePath("/inventory");
  return { imported, errors };
}

/* ---------- Raw-material (catalog) actions ---------- */
async function catalogSaveAction(workspaceId: string, formData: FormData) {
  "use server";
  const id       = str(formData, "id") || undefined;
  const name     = str(formData, "name").trim();
  const unit     = str(formData, "unit").trim();
  const category = str(formData, "category") || "food";
  const cost     = num(formData, "cost_per_unit");
  if (!name || !unit || !Number.isFinite(cost)) return;
  const low        = num(formData, "low_stock_threshold");
  const expiryRaw  = str(formData, "expiry_date").trim();
  const batchRaw   = str(formData, "batch_number").trim();
  // Opening stock only accepted on creation — adjustments must go through Adjust.
  const branchId     = id ? undefined : (str(formData, "branch_id") || undefined);
  const initialStock = id ? undefined : num(formData, "initial_stock");
  await adminApi.catalogUpsert({
    workspace_id: workspaceId, id, name, unit, category, cost_per_unit: cost,
    branch_id: branchId,
    initial_stock: !id && Number.isFinite(initialStock) ? (initialStock as number) : undefined,
    low_stock_threshold: Number.isFinite(low) ? low : undefined,
    expiry_date:  expiryRaw  || null,
    batch_number: batchRaw   || null,
  });
  revalidatePath("/inventory");
  revalidatePath("/products");
}

async function catalogDeleteAction(workspaceId: string, formData: FormData) {
  "use server";
  const id = str(formData, "id");
  if (!id) return;
  await adminApi.catalogDelete({ workspace_id: workspaceId, catalog_id: id });
  revalidatePath("/inventory");
}

async function importIngredientsAction(
  workspaceId: string,
  rows: IngredientImportRow[],
): Promise<{ imported: number; errors: string[] }> {
  "use server";
  const errors: string[] = [];
  let imported = 0;
  const [{ items: catalogItems }, { branches }] = await Promise.all([
    adminApi.inventory(workspaceId),
    adminApi.branches(workspaceId),
  ]);
  // Resolve existing catalog entries by name so re-imports update instead of duplicate.
  const byName = new Map<string, string>();
  for (const i of catalogItems) byName.set(String(i.name).toLowerCase(), i.id);
  const defaultBranchId = branches[0]?.id;
  for (const r of rows) {
    try {
      const existingId = byName.get(r.name.toLowerCase());
      await adminApi.catalogUpsert({
        workspace_id:        workspaceId,
        id:                  existingId,
        name:                r.name,
        unit:                r.unit,
        cost_per_unit:       r.cost ?? 0,
        low_stock_threshold: r.threshold,
        // Opening stock (if any) lands at the workspace's first branch —
        // move it with Adjust afterward for a multi-branch split.
        branch_id:           !existingId ? defaultBranchId : undefined,
        initial_stock:       !existingId ? r.stock : undefined,
      });
      imported++;
    } catch (e: any) {
      errors.push(`"${r.name}": ${e?.message ?? "failed"}`);
    }
  }
  revalidatePath("/inventory");
  revalidatePath("/products");
  return { imported, errors };
}

function stockLevel(qty: number, threshold: number): "ok" | "warn" | "err" {
  if (qty <= 0) return "err";
  if (threshold > 0 && qty <= threshold) return "warn";
  return "ok";
}

type FlatRow = {
  catalogId: string;
  name: string;
  category: string;
  unit: string;
  costPerUnit: number;
  archived: boolean;
  expiryDate: string | null;
  batchNumber: string | null;
  productId: string | null;
  productName: string | null;
  productSku: string | null;
  forSale: boolean | null;
  branchId: string;
  branchName: string;
  inventoryItemId: string;
  quantity: number;
  lowStockThreshold: number;
};

function flattenCatalog(items: any[]): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const c of items) {
    for (const ii of c.inventory_items ?? []) {
      rows.push({
        catalogId: c.id, name: c.name, category: c.category ?? "food", unit: c.unit,
        costPerUnit: Number(c.cost_per_unit ?? 0), archived: !!c.archived,
        expiryDate: c.expiry_date ?? null, batchNumber: c.batch_number ?? null,
        productId: c.product_id ?? null,
        productName: c.products?.name ?? null, productSku: c.products?.sku ?? null,
        forSale: c.products?.for_sale ?? null,
        branchId: ii.branch_id, branchName: ii.branches?.name ?? "—",
        inventoryItemId: ii.id, quantity: Number(ii.quantity),
        lowStockThreshold: Number(ii.low_stock_threshold ?? c.low_stock_threshold ?? 0),
      });
    }
  }
  return rows;
}

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams?: { q?: string; offset?: string };
}) {
  const q      = (searchParams?.q ?? "").toLowerCase().trim();
  const offset = Math.max(0, Number(searchParams?.offset ?? 0) || 0);
  const wsId   = await resolveWorkspaceId();

  const [{ items: catalogItems }, branchesRes] = wsId
    ? await Promise.all([adminApi.inventory(wsId), adminApi.branches(wsId)])
    : [{ items: [] as any[] }, { branches: [] as any[] }];
  const branches = branchesRes.branches;

  const allRows = flattenCatalog(catalogItems);

  const filteredRows = q
    ? allRows.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        (r.productSku ?? "").toLowerCase().includes(q) ||
        r.branchName.toLowerCase().includes(q)
      )
    : allRows;

  const pagedRows = filteredRows.slice(offset, offset + PAGE_SIZE);

  const groups = new Map<string, FlatRow[]>();
  for (const r of pagedRows) {
    const cat = r.productId ? "Products" : "Raw Materials";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(r);
  }

  const lowCount = allRows.filter((r) => stockLevel(r.quantity, r.lowStockThreshold) !== "ok").length;

  // Expiry banners — dedupe by catalog entry so a raw material tracked at
  // multiple branches isn't counted more than once.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sevenDaysOut = new Date(today); sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
  const seenCatalogIds = new Set<string>();
  let expiredCount = 0, expiringCount = 0;
  for (const r of allRows) {
    if (!r.expiryDate || seenCatalogIds.has(r.catalogId)) continue;
    seenCatalogIds.add(r.catalogId);
    const d = new Date(r.expiryDate); d.setHours(0, 0, 0, 0);
    if (d < today) expiredCount++;
    else if (d <= sevenDaysOut) expiringCount++;
  }

  const hrefFor = (o: number) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(o ? { offset: String(o) } : {}) });
    const qs = p.toString();
    return `/inventory${qs ? `?${qs}` : ""}`;
  };

  const ingredientExportRows = allRows
    .filter((r) => !r.productId)
    .filter((r, i, arr) => arr.findIndex((x) => x.catalogId === r.catalogId) === i)
    .map((r) => ({ name: r.name, unit: r.unit, cost_per_unit: r.costPerUnit, low_stock_threshold: r.lowStockThreshold }));

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Inventory</h1>
          <div className="sub">{allRows.length} row{allRows.length === 1 ? "" : "s"} · {lowCount} low or out</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
          <InventoryImportExport importAction={importInventoryAction.bind(null, wsId ?? "")} />
          <IngredientImportExport
            ingredients={ingredientExportRows}
            importAction={importIngredientsAction.bind(null, wsId ?? "")}
          />
          <IngredientEditor branches={branches} saveAction={catalogSaveAction.bind(null, wsId ?? "")} />
        </div>
      </div>

      <div className="admin-body">
        {(expiredCount > 0 || expiringCount > 0) && (
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            {expiredCount > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
                borderRadius: 8, background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.4)",
                color: "var(--err, #ff5050)", fontSize: 13, fontWeight: 600,
              }}>
                <span style={{ fontSize: 16 }}>⚠</span>
                <span>{expiredCount} expired item{expiredCount !== 1 ? "s" : ""}</span>
              </div>
            )}
            {expiringCount > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
                borderRadius: 8, background: "rgba(var(--tint-rgb), 0.08)", border: "1px solid rgba(var(--tint-rgb), 0.4)",
                color: "var(--amber-bright, var(--amber))", fontSize: 13, fontWeight: 600,
              }}>
                <span style={{ fontSize: 16 }}>⏰</span>
                <span>{expiringCount} expiring within 7 days</span>
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <InventorySearch total={allRows.length} filtered={filteredRows.length} placeholder="Search by name, SKU, or branch…" />
        </div>

        {filteredRows.length === 0 && (
          <div className="admin-card" style={{ textAlign: "center", color: "var(--text-3)", padding: 48 }}>
            {q
              ? `No items match "${q}".`
              : <>Nothing tracked yet. Turn on <strong>Track inventory</strong> when adding a product, or use <strong>+ Add inventory</strong> for raw materials.</>}
          </div>
        )}

        {[...groups.entries()].map(([cat, rows]) => (
          <div key={cat} className="admin-table-wrap" style={{ marginBottom: 20 }}>
            <div className="admin-table-head">
              <h2>{cat}</h2>
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>
                {rows.length} row{rows.length === 1 ? "" : "s"}
              </span>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  {cat === "Products" && <th>SKU</th>}
                  <th>Branch</th>
                  <th>On hand</th>
                  <th>Min</th>
                  <th>Cost/unit</th>
                  <th>Total value</th>
                  {cat === "Raw Materials" && <th>Expiry</th>}
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const level = stockLevel(r.quantity, r.lowStockThreshold);
                  const expired = r.expiryDate ? new Date(r.expiryDate) < today : false;
                  const expiring = r.expiryDate && !expired ? new Date(r.expiryDate) <= sevenDaysOut : false;
                  return (
                    <tr key={r.inventoryItemId}>
                      <td className="bold">
                        {r.name}
                        {r.forSale === false && <span className="pill neutral" style={{ marginLeft: 6, fontSize: 10 }}>Supply</span>}
                      </td>
                      {cat === "Products" && <td><span className="mono">{r.productSku ?? "—"}</span></td>}
                      <td className="dim">{r.branchName}</td>
                      <td className="bold" style={level === "err" ? { color: "var(--err)" } : level === "warn" ? { color: "var(--warn)" } : {}}>
                        {r.quantity} <span className="dim">{r.unit}</span>
                      </td>
                      <td className="dim">{r.lowStockThreshold}</td>
                      <td className="dim">{r.costPerUnit > 0 ? peso(r.costPerUnit) : "—"}</td>
                      <td className="bold">{r.costPerUnit > 0 && r.quantity > 0 ? peso(r.quantity * r.costPerUnit) : "—"}</td>
                      {cat === "Raw Materials" && (
                        <td>
                          {r.expiryDate ? (
                            <span style={{ color: expired ? "var(--err, #ff5050)" : expiring ? "var(--amber-bright, var(--amber))" : undefined, fontWeight: expired || expiring ? 600 : undefined }}>
                              {new Date(r.expiryDate).toLocaleDateString()}
                              {expired && <span style={{ marginLeft: 4, fontSize: 11 }}>EXPIRED</span>}
                              {expiring && <span style={{ marginLeft: 4, fontSize: 11 }}>SOON</span>}
                            </span>
                          ) : <span className="dim">—</span>}
                        </td>
                      )}
                      <td>
                        <span className={`pill ${level}`}>{level === "err" ? "Out" : level === "warn" ? "Low" : "OK"}</span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <InventoryRowActions
                            item={{
                              id: r.inventoryItemId, branch_id: r.branchId, workspace_id: wsId ?? "",
                              quantity: r.quantity, unit: r.unit, low_stock_threshold: r.lowStockThreshold,
                              product_id: r.productId ?? undefined,
                              products: r.productId ? { name: r.productName ?? r.name, sku: r.productSku } : null,
                              branches: { name: r.branchName },
                            }}
                            stockInAction={stockInAction.bind(null, wsId ?? "")}
                            stockOutAction={stockOutAction.bind(null, wsId ?? "")}
                            adjustAction={adjustAction.bind(null, wsId ?? "")}
                            loadMovements={loadMovements.bind(null, wsId ?? "", r.inventoryItemId)}
                          />
                          {!r.productId && (
                            <IngredientEditor
                              ingredient={{
                                id: r.catalogId, name: r.name, unit: r.unit,
                                category: r.category as Ingredient["category"],
                                cost_per_unit: r.costPerUnit, low_stock_threshold: r.lowStockThreshold,
                                archived: r.archived, expiry_date: r.expiryDate, batch_number: r.batchNumber,
                              }}
                              saveAction={catalogSaveAction.bind(null, wsId ?? "")}
                              deleteAction={catalogDeleteAction.bind(null, wsId ?? "")}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        {filteredRows.length > PAGE_SIZE && (
          <Pagination total={filteredRows.length} limit={PAGE_SIZE} offset={offset} hrefFor={hrefFor} />
        )}
      </div>
    </>
  );
}

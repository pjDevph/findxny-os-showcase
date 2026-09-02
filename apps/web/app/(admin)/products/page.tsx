import { adminApi, resolveWorkspaceId } from "@/lib/admin-api";
import { revalidatePath } from "next/cache";
import { Suspense } from "react";
import { ProductEditor } from "@/features/admin/products/ProductEditor";
import { ProductImportExport, type ImportRow } from "@/features/admin/products/ProductImportExport";
import { RecipeImportExport } from "@/features/admin/products/RecipeImportExport";
import { DeleteAllButton } from "@/features/admin/products/DeleteAllButton";
import { ProductsBulkTable } from "@/features/admin/products/ProductsBulkTable";
import { ProductSearch } from "@/features/admin/products/ProductSearch";
import { Pagination } from "@/components/ui/Pagination";

const PAGE_SIZE = 50;

async function toggleProduct(workspaceId: string, id: string, active: boolean, _: FormData) {
  "use server";
  await adminApi.productsToggle({ workspace_id: workspaceId, product_id: id, active: !active });
  revalidatePath("/products");
  revalidatePath("/", "layout"); // active/inactive controls public menu + homepage visibility
}

async function bulkToggleProducts(workspaceId: string, productIds: string[], active: boolean) {
  "use server";
  await adminApi.productsBulkToggle({ workspace_id: workspaceId, product_ids: productIds, active });
  revalidatePath("/products");
  revalidatePath("/", "layout");
}

async function deleteProduct(workspaceId: string, id: string) {
  "use server";
  try {
    await adminApi.productsDelete({ workspace_id: workspaceId, product_id: id, hard: true });
  } catch (err: any) {
    // Product has order history — soft-delete instead (hides it, keeps records intact)
    const msg = extractErrMsg(err);
    if (msg.toLowerCase().includes("order history") || msg.toLowerCase().includes("conflict")) {
      await adminApi.productsDelete({ workspace_id: workspaceId, product_id: id, hard: false });
    } else {
      throw err;
    }
  }
  revalidatePath("/products");
  revalidatePath("/inventory");
}

function parseEditorForm(workspaceId: string, formData: FormData) {
  const idRaw = formData.get("id");
  const id = typeof idRaw === "string" && idRaw ? idRaw : undefined;
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : "";
  };
  const optStr = (k: string): string | null => {
    const v = str(k).trim();
    return v || null;
  };
  const num = (k: string): number | undefined => {
    const v = str(k);
    if (!v) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const bool = (k: string) => formData.get(k) != null;

  return {
    workspace_id: workspaceId,
    id,
    name: str("name") || undefined,
    sku: optStr("sku"),
    price: num("price"),
    category_id: optStr("category_id"),
    image_url: optStr("image_url"),
    for_sale: bool("for_sale"),
    prep_station: (optStr("prep_station") ?? "none") as "none" | "kitchen" | "drinks" | "counter",
    active: bool("active"),
    featured: bool("featured"),
    featured_tag: optStr("featured_tag"),
    featured_blurb: optStr("featured_blurb"),
    purchase_unit: str("purchase_unit") || undefined,
    selling_unit:  str("selling_unit")  || undefined,
    cost: num("cost"),
    barcode: optStr("barcode"),
    is_pinned: bool("is_pinned"),
    track_inventory: bool("track_inventory"),
  };
}

type StagedLine = { id?: string; catalog_id: string; qty: number; unit: string; section: "ingredient" | "topping" };

function parseRecipeItems(formData: FormData): StagedLine[] {
  const raw = formData.get("recipe_items");
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.catalog_id === "string" && typeof x.unit === "string")
      .map((x) => ({
        id: typeof x.id === "string" ? x.id : undefined,
        catalog_id: x.catalog_id,
        qty: Number(x.qty),
        unit: x.unit,
        section: x.section === "topping" ? "topping" as const : "ingredient" as const,
      }))
      .filter((x) => Number.isFinite(x.qty) && x.qty > 0);
  } catch {
    return [];
  }
}

async function saveProduct(workspaceId: string, formData: FormData) {
  "use server";
  const input = parseEditorForm(workspaceId, formData);
  const desired = parseRecipeItems(formData);
  const stockMode = formData.get("stock_mode");
  const alreadyActivated = formData.get("already_activated") != null;

  if (input.price !== undefined && input.price <= 0) {
    throw new Error("Selling price must be greater than ₱0.00.");
  }

  // Step 1: upsert the product itself.
  const { product } = await adminApi.productsUpsert(input);
  const productId = product.id as string;

  // Step 2: reconcile the product's "what this consumes" lines — only
  // relevant in Recipe mode; simple-quantity products carry no recipe rows.
  if (input.track_inventory && stockMode === "recipe") {
    const { items: existing } = await adminApi.recipeItems(workspaceId, { product_id: productId });
    const existingByCatalog = new Map<string, any>(
      existing.map((e: any) => [e.catalog_id as string, e]),
    );
    const desiredCatalogIds = new Set(desired.map((d) => d.catalog_id));

    // Removals: in existing but not in desired.
    for (const e of existing) {
      if (!desiredCatalogIds.has(e.catalog_id)) {
        await adminApi.recipeItemsDelete({ workspace_id: workspaceId, recipe_item_id: e.id });
      }
    }
    // Additions / updates.
    for (const d of desired) {
      const prev = existingByCatalog.get(d.catalog_id);
      if (!prev) {
        await adminApi.recipeItemsUpsert({
          workspace_id: workspaceId, product_id: productId,
          catalog_id: d.catalog_id, qty: d.qty, unit: d.unit, section: d.section,
        });
      } else if (Number(prev.qty) !== d.qty || prev.unit !== d.unit || (prev.section ?? "ingredient") !== d.section) {
        await adminApi.recipeItemsUpsert({
          workspace_id: workspaceId, id: prev.id, product_id: productId,
          catalog_id: d.catalog_id, qty: d.qty, unit: d.unit, section: d.section,
        });
      }
    }
  } else if (input.track_inventory && stockMode === "simple" && !alreadyActivated) {
    // First-time activation for simple-quantity tracking — same call
    // Inventory's "+ Add inventory" used to make, just made right here so
    // the whole stock decision happens in one place, at product creation.
    const branchId = String(formData.get("stock_branch_id") ?? "");
    const qty = Number(formData.get("stock_qty"));
    if (branchId && Number.isFinite(qty) && qty >= 0) {
      await adminApi.stockIn({
        workspace_id: workspaceId, branch_id: branchId, product_id: productId,
        quantity: qty, unit: String(formData.get("stock_unit") ?? "pcs") || "pcs",
        low_stock_threshold: Number(formData.get("stock_threshold")) || 0,
      });
    }
  }

  revalidatePath("/products");
  revalidatePath("/inventory");
  revalidatePath("/", "layout"); // may change name/price/featured status shown publicly
}

// Build a category name → id map, auto-creating any names from the CSV that
// don't exist yet.
async function resolveImportCategories(
  workspaceId: string,
  rows: ImportRow[],
): Promise<Map<string, string>> {
  const { categories } = await adminApi.productCategories(workspaceId);
  const catMap = new Map<string, string>(
    categories.map((c: any) => [String(c.name).toLowerCase(), c.id as string]),
  );

  const uniqueCatNames = [...new Set(
    rows.map((r) => r.category?.trim()).filter(Boolean) as string[]
  )];
  let nextSort = categories.length;
  for (const catName of uniqueCatNames) {
    if (catMap.has(catName.toLowerCase())) continue;
    try {
      const { category } = await adminApi.productCategoriesUpsert({
        workspace_id: workspaceId,
        name:         catName,
        sort_order:   nextSort++,
      });
      if (category?.id) catMap.set(catName.toLowerCase(), category.id);
    } catch { /* skip — row mapping falls back to null category */ }
  }
  return catMap;
}

async function importProductRow(
  workspaceId: string,
  row: ImportRow,
  catMap: Map<string, string>,
): Promise<string | null> {
  const category_id = row.category
    ? (catMap.get(row.category.toLowerCase()) ?? null)
    : null;
  await adminApi.productsUpsert({
    workspace_id:     workspaceId,
    name:             row.name.trim(),
    sku:              row.sku              ?? null,
    barcode:          row.barcode          ?? null,
    category_id,
    price:            row.price && row.price > 0 ? row.price : undefined,
    cost:             row.cost,
    purchase_unit:    row.purchase_unit    ?? "pcs",
    selling_unit:     row.selling_unit     ?? "pcs",
    featured_blurb:   row.description      ?? null,
    for_sale:         row.for_sale         ?? true,
    kitchen_required: row.kitchen_required ?? false,
    active:           row.active           ?? true,
    featured:         row.featured         ?? false,
    featured_tag:     row.featured_tag     ?? null,
    track_inventory:  row.track_inventory  ?? false,
  });
  return null;
}

async function importProducts(
  workspaceId: string,
  rows: ImportRow[],
): Promise<{ imported: number; errors: string[] }> {
  "use server";

  const catMap = await resolveImportCategories(workspaceId, rows);

  let imported = 0;
  const errors: string[] = [];

  for (const row of rows) {
    if (!row.name?.trim()) { errors.push("Skipped a row with no name"); continue; }
    try {
      await importProductRow(workspaceId, row, catMap);
      imported++;
    } catch (err: any) {
      errors.push(`"${row.name}": ${extractErrMsg(err)}`);
    }
  }

  revalidatePath("/products");
  revalidatePath("/inventory");
  return { imported, errors };
}

async function importRecipes(
  workspaceId: string,
  rows: { product: string; ingredient: string; qty: number; unit: string }[],
): Promise<{ imported: number; errors: string[] }> {
  "use server";
  const [{ products }, { items: catalogItems }] = await Promise.all([
    adminApi.products(workspaceId),
    adminApi.inventory(workspaceId),
  ]);
  const prodMap = new Map<string, string>(products.map((p: any) => [String(p.name).toLowerCase(), p.id]));
  const catalogMap = new Map<string, string>(catalogItems.map((i: any) => [String(i.name).toLowerCase(), i.id]));

  let imported = 0;
  const errors: string[] = [];
  for (const r of rows) {
    const product_id = prodMap.get(r.product.toLowerCase());
    const catalog_id = catalogMap.get(r.ingredient.toLowerCase());
    if (!product_id)  { errors.push(`"${r.product}": product not found — import products first`); continue; }
    if (!catalog_id)  { errors.push(`"${r.product}" → "${r.ingredient}": not found in Inventory — add it there first`); continue; }
    try {
      await adminApi.recipeItemsUpsert({
        workspace_id: workspaceId, product_id, catalog_id, qty: r.qty, unit: r.unit,
      });
      imported++;
    } catch (e: any) {
      errors.push(`"${r.product}" → "${r.ingredient}": ${e?.message ?? "failed"}`);
    }
  }
  revalidatePath("/products");
  return { imported, errors };
}

function extractErrMsg(err: any): string {
  let msg: string = err?.message ?? "failed";
  try {
    const m = /\{[\s\S]*\}/.exec(msg); // NOSONAR - applied to controlled internal data
    if (m) { const j = JSON.parse(m[0]); msg = j?.error?.message ?? j?.message ?? msg; }
  } catch {}
  return msg;
}

async function deleteAllProducts(workspaceId: string): Promise<{ deleted: number; softDeleted: number; errors: string[] }> {
  "use server";
  const { products } = await adminApi.products(workspaceId);
  let deleted = 0;
  let softDeleted = 0;
  const errors: string[] = [];
  for (const p of products) {
    try {
      // Try hard-delete first; products with order history need a soft-delete instead
      await adminApi.productsDelete({ workspace_id: workspaceId, product_id: p.id, hard: true });
      deleted++;
    } catch (hardErr: any) {
      const msg = extractErrMsg(hardErr);
      if (msg.toLowerCase().includes("order history") || msg.toLowerCase().includes("conflict")) {
        // Soft-delete: hides the product but keeps it for historical records
        try {
          await adminApi.productsDelete({ workspace_id: workspaceId, product_id: p.id, hard: false });
          softDeleted++;
        } catch (softErr: any) {
          errors.push(`"${p.name}": ${extractErrMsg(softErr)}`);
        }
      } else {
        errors.push(`"${p.name}": ${msg}`);
      }
    }
  }
  revalidatePath("/products");
  revalidatePath("/inventory");
  return { deleted, softDeleted, errors };
}

async function loadRecipeItems(workspaceId: string, productId: string) {
  "use server";
  const { items } = await adminApi.recipeItems(workspaceId, { product_id: productId });
  // A row whose catalog entry points back at this same product is the
  // "consumes 1x itself" trick stock-in creates for simple-quantity
  // tracking — it's plumbing, not a real recipe ingredient, so it's kept
  // out of the visible recipe list and used only to detect activation.
  const alreadyActivated = items.some((r: any) => r.inventory_catalog?.product_id === productId);
  const lines = items.filter((r: any) => r.inventory_catalog?.product_id !== productId);
  return { lines, alreadyActivated };
}

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams?: { q?: string; offset?: string };
}) {
  const wsId   = await resolveWorkspaceId();
  const offset = Math.max(0, Number(searchParams?.offset ?? 0) || 0);
  const [{ products }, { categories }, { items: catalogItems }, { branches }] = wsId
    ? await Promise.all([adminApi.products(wsId), adminApi.productCategories(wsId), adminApi.inventory(wsId), adminApi.branches(wsId)])
    : [{ products: [] as any[] }, { categories: [] as any[] }, { items: [] as any[] }, { branches: [] as any[] }];

  // Server-side search filter
  const q = searchParams?.q?.toLowerCase().trim() ?? "";
  const filteredProducts = q
    ? products.filter((p: any) =>
        (p.name ?? "").toLowerCase().includes(q) ||
        (p.sku  ?? "").toLowerCase().includes(q) ||
        (p.product_categories?.name ?? "").toLowerCase().includes(q)
      )
    : products;

  const pagedProducts = filteredProducts.slice(offset, offset + PAGE_SIZE);

  const groups = new Map<string, any[]>();
  for (const p of pagedProducts) {
    const cat = p.product_categories?.name ?? "Uncategorised";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(p);
  }

  const hrefFor = (o: number) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(o ? { offset: String(o) } : {}) });
    const qs = p.toString();
    const suffix = qs ? `?${qs}` : "";
    return `/products${suffix}`;
  };

  const save      = saveProduct.bind(null, wsId ?? "");
  const doImport  = importProducts.bind(null, wsId ?? "");

  // Recipe lines reference rows in the unified inventory catalog — raw
  // materials AND other products that track their own stock (product_id
  // set), which is what lets a recipe consume a standalone-sellable item.
  const ingredientList = catalogItems.map((i: any) => ({
    id: i.id, name: i.name, sku: null,
    purchase_unit: i.unit ?? "pcs",
    cost: Number(i.cost_per_unit ?? 0),
    product_id: i.product_id ?? null,
  }));

  // Flat list for CSV export (includes category name)
  const exportList = products.map((p: any) => ({
    name:           p.name,
    sku:            p.sku          ?? null,
    barcode:        p.barcode      ?? null,
    category:       p.product_categories?.name ?? null,
    price:          p.price        ?? null,
    cost:           p.cost         ?? null,
    purchase_unit:  p.purchase_unit ?? null,
    selling_unit:   p.selling_unit  ?? null,
    featured_blurb: p.featured_blurb ?? null,
    for_sale:       p.for_sale !== false,
    kitchen_required: !!p.kitchen_required,
    active:         p.active !== false,
    featured:       !!p.featured,
    featured_tag:   p.featured_tag ?? null,
    track_inventory: !!p.track_inventory,
  }));

  return (
    <>
      <div className="admin-header">
        <div style={{ flexShrink: 0 }}>
          <h1>Products</h1>
          <div className="sub">
            {products.length} total · {products.filter((p: any) => p.active).length} active
            {q && ` · ${filteredProducts.length} match${filteredProducts.length !== 1 ? "es" : ""} for "${q}"`}
            {filteredProducts.length > PAGE_SIZE && ` · page ${Math.floor(offset / PAGE_SIZE) + 1} of ${Math.ceil(filteredProducts.length / PAGE_SIZE)}`}
          </div>
        </div>
        {/* Search — grows to fill space between title and buttons */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 20px" }}>
          <Suspense fallback={<div style={{ flex: 1 }} />}>
            <ProductSearch total={products.length} filtered={filteredProducts.length} />
          </Suspense>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", flexShrink: 0 }}>
          <DeleteAllButton deleteAllAction={deleteAllProducts.bind(null, wsId ?? "")} count={products.length} />
          <ProductImportExport products={exportList} importAction={doImport} />
          <RecipeImportExport importAction={importRecipes.bind(null, wsId ?? "")} />
          <ProductEditor
            categories={categories}
            ingredients={ingredientList}
            branches={branches}
            saveAction={save}
            triggerLabel="+ New product"
            workspaceId={wsId ?? undefined}
          />
        </div>
      </div>
      <div className="admin-body">
        <ProductsBulkTable
          groups={[...groups.entries()]}
          wsId={wsId ?? ""}
          categories={categories}
          ingredientList={ingredientList}
          branches={branches}
          saveAction={save}
          toggleAction={toggleProduct.bind(null, wsId ?? "")}
          deleteAction={deleteProduct.bind(null, wsId ?? "")}
          bulkToggleAction={bulkToggleProducts.bind(null, wsId ?? "")}
          loadRecipeItems={loadRecipeItems}
        />
        {filteredProducts.length === 0 && (
          <div className="admin-card" style={{ textAlign: "center", color: "var(--text-3)", padding: 48 }}>
            {q ? `No products match "${q}".` : <>No products yet. Click <strong>+ New product</strong> to add your first item.</>}
          </div>
        )}
        {filteredProducts.length > PAGE_SIZE && (
          <Pagination total={filteredProducts.length} limit={PAGE_SIZE} offset={offset} hrefFor={hrefFor} />
        )}
      </div>
    </>
  );
}

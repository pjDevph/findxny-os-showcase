"use client";

import { useMemo, useState } from "react";
import { peso } from "@/lib/config";
import { foodCostPct, foodCostTier, grossProfit, isUnderpriced } from "@/features/costing/units";
import { ProductEditor } from "@/features/admin/products/ProductEditor";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { DeleteProductButton } from "@/features/admin/products/DeleteProductButton";

type LoadRecipeItems = (productId: string) => Promise<{
  lines: Array<{ id: string; catalog_id: string; qty: number; unit: string; section?: string }>;
  alreadyActivated: boolean;
}>;

function productToggleTitle(p: any): string {
  if (p.active) return `Hide ${p.name} from the catalog?`;
  if (p.stock_auto_deactivated) return `Override: show ${p.name} even though ingredients are low?`;
  return `Show ${p.name} in the catalog?`;
}

function ProductStatusPill({ p }: { p: any }) {
  if (p.active) return <span className="pill ok">Active</span>;
  if (p.stock_auto_deactivated) return <span className="pill err">Out of stock</span>;
  return <span className="pill neutral">Hidden</span>;
}

function productTierColor(tier: string): string {
  if (tier === "ok")   return "var(--ok, #38d39f)";
  if (tier === "warn") return "var(--amber-bright, var(--amber))";
  return "var(--err, #ff5050)";
}

function ProductNameCell({ p, fc }: { p: any; fc: number }) {
  return (
    <td className="bold">
      {p.is_pinned && (
        <span title="Pinned to top of POS grid" style={{ marginRight: 5, color: "var(--amber-bright, var(--amber))", fontSize: 13 }}>
          📌
        </span>
      )}
      {p.name}
      {isUnderpriced(fc) && <span className="pill err" style={{ marginLeft: 6, fontSize: 10 }}>Underpriced</span>}
      {p.stock_auto_deactivated && <span className="pill err" style={{ marginLeft: 6, fontSize: 10 }}>Low stock</span>}
    </td>
  );
}

function ProductFoodCostCell({ fc, cost, tierColor }: { fc: number; cost: number; tierColor: string }) {
  if (Number.isFinite(fc) && cost > 0) {
    return <td><span style={{ color: tierColor, fontWeight: 600 }}>{fc.toFixed(1)}%</span></td>;
  }
  return <td><span className="dim">—</span></td>;
}

function ProductActionsCell({ p, wsId, categories, ingredientChoices, branches, saveAction, toggleAction, deleteAction, loadRecipeItems }: {
  p: any;
  wsId: string;
  categories: any;
  ingredientChoices: any[];
  branches: { id: string; name: string }[];
  saveAction: (formData: FormData) => Promise<void>;
  toggleAction: (id: string, active: boolean, formData: FormData) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
  loadRecipeItems: LoadRecipeItems;
}) {
  return (
    <td style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <ProductEditor
        categories={categories}
        ingredients={ingredientChoices}
        branches={branches}
        initial={p}
        saveAction={saveAction}
        loadRecipeItems={() => loadRecipeItems(p.id)}
        triggerLabel="Edit"
        triggerClass="btn-xs"
        workspaceId={wsId}
      />
      <form action={toggleAction.bind(null, p.id, p.active)}>
        <ConfirmSubmitButton
          className={`btn-xs ${p.active ? "danger" : "primary"}`}
          tone={p.active ? "warning" : "neutral"}
          title={productToggleTitle(p)}
          confirmLabel={p.active ? "Hide" : "Show"}
        >
          {p.active ? "Hide" : "Show"}
        </ConfirmSubmitButton>
      </form>
      <DeleteProductButton
        productName={p.name}
        deleteAction={deleteAction.bind(null, p.id)}
      />
    </td>
  );
}

function ProductRow({ p, wsId, categories, ingredientList, branches, saveAction, toggleAction, deleteAction, loadRecipeItems, selected, onToggleSelect }: {
  p: any;
  wsId: string;
  categories: any;
  ingredientList: { id: string; name: string; sku: null; purchase_unit: string; cost: number; product_id: string | null }[];
  branches: { id: string; name: string }[];
  saveAction: (formData: FormData) => Promise<void>;
  toggleAction: (id: string, active: boolean, formData: FormData) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
  loadRecipeItems: LoadRecipeItems;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const cost = Number(p.cost ?? 0);
  const price = Number(p.price ?? 0);
  const fc = foodCostPct(cost, price);
  const tier = foodCostTier(fc);
  const gp = grossProfit(cost, price);
  const tierColor = productTierColor(tier);
  const ingredientChoices = ingredientList.filter((i) => i.product_id !== p.id);
  return (
    <tr style={{ opacity: p.active ? 1 : 0.5 }}>
      <td style={{ width: 32 }}>
        <input type="checkbox" checked={selected} onChange={() => onToggleSelect(p.id)} aria-label={`Select ${p.name}`} />
      </td>
      <ProductNameCell p={p} fc={fc} />
      <td><span className="mono">{p.sku ?? "—"}</span></td>
      <td className="bold">{peso(price)}</td>
      <td className="dim">{cost > 0 ? `₱${cost.toFixed(2)}/${p.purchase_unit ?? "pcs"}` : "—"}</td>
      <ProductFoodCostCell fc={fc} cost={cost} tierColor={tierColor} />
      <td className="dim">{cost > 0 ? `₱${gp.toFixed(2)}` : "—"}</td>
      <td>
        {p.for_sale !== false
          ? <span className="pill ok">For Sale</span>
          : <span className="pill neutral">Supply</span>}
      </td>
      <td>
        {p.kitchen_required
          ? <span className="pill warn">Kitchen</span>
          : <span className="pill neutral">Bar</span>}
      </td>
      <td>
        {p.featured
          ? <span className="pill amber">★ {p.featured_tag ?? "Featured"}</span>
          : <span className="dim">—</span>}
      </td>
      <td>
        <ProductStatusPill p={p} />
      </td>
      <ProductActionsCell
        p={p}
        wsId={wsId}
        categories={categories}
        ingredientChoices={ingredientChoices}
        branches={branches}
        saveAction={saveAction}
        toggleAction={toggleAction}
        deleteAction={deleteAction}
        loadRecipeItems={loadRecipeItems}
      />
    </tr>
  );
}

export function ProductsBulkTable({
  groups, wsId, categories, ingredientList, branches,
  saveAction, toggleAction, deleteAction, bulkToggleAction, loadRecipeItems,
}: {
  groups: [string, any[]][];
  wsId: string;
  categories: any;
  ingredientList: { id: string; name: string; sku: null; purchase_unit: string; cost: number; product_id: string | null }[];
  branches: { id: string; name: string }[];
  saveAction: (formData: FormData) => Promise<void>;
  toggleAction: (id: string, active: boolean, formData: FormData) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
  bulkToggleAction: (productIds: string[], active: boolean) => Promise<void>;
  loadRecipeItems: (workspaceId: string, productId: string) => Promise<{
    lines: Array<{ id: string; catalog_id: string; qty: number; unit: string; section?: string }>;
    alreadyActivated: boolean;
  }>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);

  const allIds = useMemo(() => groups.flatMap(([, items]) => items.map((p: any) => p.id as string)), [groups]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleGroup(items: any[]) {
    const ids = items.map((p) => p.id as string);
    const allIn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allIn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  async function runBulk(active: boolean) {
    if (selected.size === 0 || pending) return;
    setPending(true);
    try {
      await bulkToggleAction([...selected], active);
      setSelected(new Set());
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {selected.size > 0 && (
        <div
          style={{
            position: "sticky", top: 0, zIndex: 5,
            display: "flex", alignItems: "center", gap: 10,
            background: "var(--amber-bright, var(--amber))", color: "#000",
            padding: "10px 16px", borderRadius: 10, marginBottom: 14,
            boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
          }}
        >
          <strong>{selected.size} selected</strong>
          <button type="button" className="btn-xs" disabled={pending} onClick={() => runBulk(true)}>
            {pending ? "Working…" : "Set Active"}
          </button>
          <button type="button" className="btn-xs" disabled={pending} onClick={() => runBulk(false)}>
            {pending ? "Working…" : "Set Inactive"}
          </button>
          <button type="button" className="btn-xs" style={{ marginLeft: "auto" }} disabled={pending} onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}

      {allIds.length > 0 && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: 12, color: "var(--text-3)" }}>
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          Select all {allIds.length} products
        </label>
      )}

      {groups.map(([cat, items]) => (
        <div key={cat} className="admin-table-wrap" style={{ marginBottom: 20 }}>
          <div className="admin-table-head">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={items.every((p: any) => selected.has(p.id))}
                onChange={() => toggleGroup(items)}
              />
              <h2 style={{ margin: 0 }}>{cat}</h2>
            </label>
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--text-3)" }}>{items.length} items</span>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>SKU</th>
                <th>Price</th>
                <th>Cost</th>
                <th>FC %</th>
                <th>GP</th>
                <th>Type</th>
                <th>Kitchen</th>
                <th>Featured</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((p: any) => (
                <ProductRow
                  key={p.id}
                  p={p}
                  wsId={wsId}
                  categories={categories}
                  ingredientList={ingredientList}
                  branches={branches}
                  saveAction={saveAction}
                  toggleAction={toggleAction}
                  deleteAction={deleteAction}
                  loadRecipeItems={(productId) => loadRecipeItems(wsId, productId)}
                  selected={selected.has(p.id)}
                  onToggleSelect={toggleOne}
                />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

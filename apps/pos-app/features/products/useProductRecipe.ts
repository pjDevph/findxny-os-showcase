import { useMemo, useState } from "react";
import { invokeFn } from "../../services/supabase";
import type { Ingredient, IngredientPickerRow, RecipeEditRow, RecipeLine } from "./types";

export function useProductRecipe(activeWorkspaceId: string | null | undefined) {
  const [recipe, setRecipe] = useState<RecipeLine[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [addIngOpen, setAddIngOpen] = useState(false);
  const [ingSearch, setIngSearch] = useState("");
  const [ingQty, setIngQty] = useState("");
  const [selIng, setSelIng] = useState<Ingredient | null>(null);
  const [recipeSaving, setRecipeSaving] = useState(false);

  // Stock-tracking mode — decided right here instead of a separate trip to
  // Inventory. "simple" = physically-counted stock (bottled drinks, packaged
  // goods); "recipe" = made-to-order, consumes other catalog entries.
  const [stockMode, setStockMode] = useState<"simple" | "recipe">("simple");
  const [stockUnit, setStockUnit] = useState("pcs");
  const [stockQty, setStockQty] = useState("0");
  const [stockThreshold, setStockThreshold] = useState("0");
  // True once this product already has a real inventory_items row (activated
  // via a prior save) — the one-time activation fields no longer apply, stock
  // changes from here on belong in Inventory's Adjust flow.
  const [alreadyActivated, setAlreadyActivated] = useState(false);

  function resetForNewProduct() {
    setRecipe([]);
    setStockMode("simple");
    setStockUnit("pcs");
    setStockQty("0");
    setStockThreshold("0");
    setAlreadyActivated(false);
  }

  function resetForEdit() {
    setStockUnit("pcs");
    setStockQty("0");
    setStockThreshold("0");
  }

  async function loadIngredients() {
    if (!activeWorkspaceId) return;
    const { data: res } = await invokeFn<{ "products-ingredient-picker": IngredientPickerRow[] }>("pos-data", { workspace_id: activeWorkspaceId, resource: "products-ingredient-picker", params: {} });
    const data = res?.["products-ingredient-picker"] ?? [];
    setIngredients(
      data.map(r => ({
        id: r.id, name: r.name, unit: r.unit,
        cost_per_unit: Number(r.cost_per_unit), category: r.category, product_id: r.product_id ?? null,
      })),
    );
  }

  async function loadRecipe(productId: string) {
    const { data: res } = await invokeFn<{ "products-recipe-edit": RecipeEditRow[] }>("pos-data", { workspace_id: activeWorkspaceId, resource: "products-recipe-edit", params: { product_id: productId } });
    const data = res?.["products-recipe-edit"] ?? [];
    // A row whose catalog entry points back at this same product is the
    // "consumes 1x itself" trick stock-in creates for simple-quantity
    // tracking — it's plumbing, not a real recipe ingredient, so it's kept
    // out of the visible recipe list and used only to detect activation.
    const selfRow = data.find(r => r.inventory_catalog?.product_id === productId);
    const realLines = data.filter(r => r.inventory_catalog?.product_id !== productId);
    setRecipe(
      realLines.map(r => ({
        id: r.id,
        catalog_id: r.catalog_id,
        ingredient_name: r.inventory_catalog?.name ?? "—",
        unit: r.inventory_catalog?.unit ?? "pcs",
        cost_per_unit: Number(r.inventory_catalog?.cost_per_unit ?? 0),
        quantity: Number(r.qty_used),
      })),
    );
    setAlreadyActivated(!!selfRow);
    setStockMode(realLines.length > 0 ? "recipe" : "simple");
  }

  async function saveRecipe(productId: string) {
    setRecipeSaving(true);
    const lines = recipe.filter(r => r.catalog_id && r.quantity > 0);
    for (const line of lines) {
      await invokeFn("recipe-items-upsert", {
        workspace_id: activeWorkspaceId,
        product_id: productId,
        catalog_id: line.catalog_id,
        qty: line.quantity,
        ...(line.id ? { id: line.id } : {}),
      });
    }
    setRecipeSaving(false);
  }

  async function removeRecipeLine(line: RecipeLine) {
    if (line.id) {
      await invokeFn("recipe-items-delete", {
        workspace_id: activeWorkspaceId,
        recipe_item_id: line.id,
      });
    }
    setRecipe(r => r.filter(x => x.catalog_id !== line.catalog_id));
  }

  function addIngredientToRecipe() {
    if (!selIng || !ingQty) return;
    const qty = parseFloat(ingQty);
    if (!qty || qty <= 0) return;
    setRecipe(r => {
      const existing = r.find(x => x.catalog_id === selIng.id);
      if (existing) {
        return r.map(x => x.catalog_id === selIng.id ? { ...x, quantity: qty } : x);
      }
      return [...r, {
        id: "",
        catalog_id: selIng.id,
        ingredient_name: selIng.name,
        unit: selIng.unit,
        cost_per_unit: selIng.cost_per_unit,
        quantity: qty,
      }];
    });
    setSelIng(null);
    setIngQty("");
    setAddIngOpen(false);
  }

  const filtIngredients = useMemo(() => ingredients.filter(
    i => !recipe.find(r => r.catalog_id === i.id) &&
      (!ingSearch || i.name.toLowerCase().includes(ingSearch.toLowerCase())),
  ), [ingredients, recipe, ingSearch]);

  const recipeCogs = useMemo(() => recipe.reduce((sum, r) => sum + r.quantity * r.cost_per_unit, 0), [recipe]);

  return {
    recipe, ingredients, recipeSaving,
    addIngOpen, setAddIngOpen, ingSearch, setIngSearch, ingQty, setIngQty, selIng, setSelIng,
    stockMode, setStockMode, stockUnit, setStockUnit, stockQty, setStockQty, stockThreshold, setStockThreshold,
    alreadyActivated, resetForNewProduct, resetForEdit,
    loadIngredients, loadRecipe, saveRecipe, removeRecipeLine, addIngredientToRecipe,
    filtIngredients, recipeCogs,
  };
}

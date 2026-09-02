import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, invokeFn } from "../../services/supabase";
import { PAGE_SIZES } from "../constants";
import { useAppAlert } from "../ui/AppAlertProvider";
import { useToast } from "../ui/ToastProvider";
import { getProductStatus } from "./productsHelpers";
import type { Category, Product, ProductListRow, ProductStats, RecipeCogsRow, StatusFilter } from "./types";

function mapRow(p: ProductListRow, cogs: number): Product {
  return {
    id: p.id,
    name: p.name,
    category_id: p.category_id ?? null,
    category_name: p.product_categories?.name ?? null,
    price: Number(p.price),
    prep_station: (p.prep_station ?? (p.kitchen_required ? "kitchen" : "none")),
    active: p.active ?? true,
    for_sale: p.for_sale ?? true,
    archived: p.archived ?? false,
    is_pinned: p.is_pinned ?? false,
    featured: p.featured ?? false,
    sku: p.sku ?? null,
    barcode: p.barcode ?? null,
    description: p.featured_blurb ?? null,
    image_url: p.image_url ?? null,
    cogs,
    track_inventory: p.track_inventory ?? false,
    stock_status: p.stock_status ?? "not_tracked",
    available_quantity: p.available_quantity ?? null,
  };
}

export function useProductsCatalog(activeWorkspaceId: string | null | undefined) {
  const { showAlert } = useAppAlert();
  const { showToast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [catalogTotal, setCatalogTotal] = useState<number | null>(null);
  const [stats, setStats] = useState<ProductStats | null>(null);
  const [archivedProducts, setArchivedProducts] = useState<Product[]>([]);
  const [archivedLoaded, setArchivedLoaded] = useState(false);
  const [archivedLoading, setArchivedLoading] = useState(false);

  // Dedupes concurrent fetches of the same page — the eager background
  // auto-continuation below and the FlatList's onEndReached can both reach
  // for the same next page before either has finished, which without this
  // guard appends the same rows twice (duplicate React keys).
  const fetchedPagesRef = useRef<Set<number>>(new Set());
  const fetchPage = useCallback(async (pageNum: number) => {
    if (!activeWorkspaceId) return;
    if (pageNum === 0) fetchedPagesRef.current.clear();
    else if (fetchedPagesRef.current.has(pageNum)) return;
    fetchedPagesRef.current.add(pageNum);
    const isFirst = pageNum === 0;
    if (isFirst) setLoading(true); else setLoadingMore(true);
    try {
      const from = pageNum * PAGE_SIZES.productsList, to = from + PAGE_SIZES.productsList - 1;

      const [{ data: prodsRes }, { data: catsRes }, { data: statsRes }] = await Promise.all([
        invokeFn<{ "products-list": ProductListRow[]; total?: number }>("pos-data", { workspace_id: activeWorkspaceId, resource: "products-list", params: { from, to } }),
        isFirst
          ? invokeFn<{ "products-categories": Category[] }>("pos-data", { workspace_id: activeWorkspaceId, resource: "products-categories", params: {} })
          : Promise.resolve({ data: null }),
        isFirst
          ? invokeFn<{ "products-stats": ProductStats }>("pos-data", { workspace_id: activeWorkspaceId, resource: "products-stats", params: {} })
          : Promise.resolve({ data: null }),
      ]);

      const prods = prodsRes?.["products-list"] ?? null;
      const cats = catsRes?.["products-categories"] ?? null;
      const statsData = statsRes?.["products-stats"] ?? null;

      const prodIds = (prods ?? []).map(p => p.id);
      const { data: recipeRes } = prodIds.length > 0
        ? await invokeFn<{ "products-recipe-cogs": RecipeCogsRow[] }>("pos-data", { workspace_id: activeWorkspaceId, resource: "products-recipe-cogs", params: { product_ids: prodIds } })
        : { data: null };
      const recipeRows = recipeRes?.["products-recipe-cogs"] ?? [];

      const cogsByProduct: Record<string, number> = {};
      for (const r of recipeRows) {
        const ing = r.inventory_catalog;
        if (!ing) continue;
        cogsByProduct[r.product_id] = (cogsByProduct[r.product_id] ?? 0) +
          Number(r.qty_used) * Number(ing.cost_per_unit);
      }

      const rows = (prods ?? []).map(p => mapRow(p, cogsByProduct[p.id] ?? 0));

      setProducts(prev => isFirst ? rows : [...prev, ...rows]);
      if (isFirst && cats) setCategories(cats);
      if (isFirst) setCatalogTotal(prodsRes?.total ?? rows.length);
      if (isFirst && statsData) setStats(statsData);
      const more = rows.length === PAGE_SIZES.productsList;
      setHasMore(more);
      setPage(pageNum);
      // This is an admin catalog screen (realistically a few hundred products,
      // not a customer-facing infinite feed) — eagerly finish loading every
      // page in the background right away, so the status-tab counts
      // (All/Complete/Needs Review/Inactive) are correct immediately instead
      // of only growing as the user manually scrolls.
      if (more) fetchPage(pageNum + 1);
    } catch (e: any) {
      fetchedPagesRef.current.delete(pageNum);
      showToast({ title: "Error", message: "Failed to load products: " + (e?.message ?? "Check your connection and try again."), type: "error" });
    } finally {
      if (isFirst) setLoading(false); else setLoadingMore(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => { fetchPage(0); }, [fetchPage]);

  async function manualRefresh() {
    setRefreshing(true);
    try { await fetchPage(0); } finally { setRefreshing(false); }
  }

  // Archived products are excluded from the main products-list query
  // entirely, so this is the only place they can be found and restored —
  // fetched lazily (once) the first time the Archived tab is opened.
  const fetchArchived = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setArchivedLoading(true);
    const all: Product[] = [];
    let from = 0;
    for (;;) {
      const to = from + PAGE_SIZES.productsList - 1;
      const { data: res } = await invokeFn<{ "products-list": ProductListRow[]; total?: number }>("pos-data", {
        workspace_id: activeWorkspaceId, resource: "products-list", params: { from, to, archived: true },
      });
      const rows = res?.["products-list"] ?? [];
      all.push(...rows.map(p => mapRow({ ...p, active: p.active ?? false, for_sale: p.for_sale ?? false }, 0)));
      if (rows.length < PAGE_SIZES.productsList) break;
      from += PAGE_SIZES.productsList;
    }
    setArchivedProducts(all.map(p => ({ ...p, archived: true })));
    setArchivedLoaded(true);
    setArchivedLoading(false);
  }, [activeWorkspaceId]);

  async function restoreProduct(p: Product) {
    const { data, error } = await supabase.functions.invoke("products-toggle", {
      body: { workspace_id: activeWorkspaceId, product_id: p.id, restore: true },
    });
    if (error || data?.error) {
      showToast({ title: "Error", message: data?.error ?? error?.message ?? "Failed", type: "error" });
      return;
    }
    setArchivedProducts(prev => prev.filter(x => x.id !== p.id));
    setStats(prev => prev ? { ...prev, archived: Math.max(0, prev.archived - 1) } : prev);
    showToast({ title: "Restored", message: `${p.name} is back in your catalog`, type: "success" });
  }

  // `active` gates POS visibility, `for_sale` gates the public web menu —
  // the two are fully independent, so either or both can be passed.
  async function toggleVisibility(p: Product, patch: { active?: boolean; for_sale?: boolean }) {
    const { data, error } = await supabase.functions.invoke("products-toggle", {
      body: { workspace_id: activeWorkspaceId, product_id: p.id, ...patch },
    });
    if (error || data?.error) {
      showToast({ title: "Error", message: data?.error ?? error?.message ?? "Failed", type: "error" });
      return;
    }
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, ...patch } : x));
  }

  async function deleteProduct(p: Product) {
    const { data, error } = await supabase.functions.invoke("products-delete", {
      body: { workspace_id: activeWorkspaceId, product_id: p.id },
    });
    if (error || data?.error) {
      showToast({ title: "Error", message: data?.error ?? error?.message ?? "Failed", type: "error" });
      return;
    }
    setProducts(prev => prev.filter(x => x.id !== p.id));
  }

  function confirmDelete(p: Product) {
    showAlert(
      "Archive product?",
      `${p.name} will be hidden from POS and menus. Existing order history is preserved.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Archive", style: "destructive", onPress: () => { deleteProduct(p).catch(console.error); } },
      ],
    );
  }

  const activeCount = products.filter(p => getProductStatus(p).status === "complete").length;
  const hiddenCount = products.filter(p => !p.active).length;
  const setupCount = products.filter(p => {
    const st = getProductStatus(p).status;
    return st === "needs_price" || st === "needs_category" || st === "needs_image" || st === "draft";
  }).length;
  const posCount = products.filter(p => p.active).length;
  const webCount = products.filter(p => p.for_sale).length;
  const kitchenCount = products.filter(p => p.prep_station === "kitchen").length;
  const drinksCount = products.filter(p => p.prep_station === "drinks").length;

  // At-a-glance availability + stock, independent of the setup-status tabs
  // above — "available" means a customer can actually order it right now.
  // Computed the same way as activeCount/hiddenCount above (from the loaded
  // `products` array), not from the separate products-stats fetch — mixing a
  // whole-catalog aggregate with page-local tab counts let the two disagree
  // (e.g. "Inactive 3" on one tab next to "0 Unavailable" on this row).
  const availableCount = products.filter(p => p.active && p.for_sale).length;
  const unavailableCount = products.length - availableCount;
  const lowOrOutCount = products.filter(p => p.stock_status === "low_stock" || p.stock_status === "out_of_stock").length;
  const categoryCount = useCallback((categoryId: string) => {
    if (stats?.by_category) return stats.by_category[categoryId] ?? 0;
    return products.filter(p => p.category_id === categoryId).length;
  }, [stats, products]);

  const filtered = useMemo(() => (statusFilter === "archived" ? archivedProducts : products).filter(p => {
    if (statusFilter !== "archived") {
      const st = getProductStatus(p).status;
      if (statusFilter === "active" && st !== "complete") return false;
      if (statusFilter === "hidden" && st !== "inactive") return false;
      if (statusFilter === "setup" && st !== "needs_price" && st !== "needs_category" && st !== "needs_image" && st !== "draft") return false;
      if (statusFilter === "pos" && !p.active) return false;
      if (statusFilter === "web" && !p.for_sale) return false;
      if (statusFilter === "kitchen" && p.prep_station !== "kitchen") return false;
      if (statusFilter === "drinks" && p.prep_station !== "drinks") return false;
      if (categoryFilter !== "all" && p.category_id !== categoryFilter) return false;
    }
    return !search
      || p.name.toLowerCase().includes(search.toLowerCase())
      || (p.category_name ?? "").toLowerCase().includes(search.toLowerCase());
  }), [statusFilter, archivedProducts, products, categoryFilter, search]);

  return {
    products, setProducts, categories, loading, refreshing, manualRefresh,
    search, setSearch, page, hasMore, loadingMore, fetchPage,
    statusFilter, setStatusFilter, categoryFilter, setCategoryFilter,
    catalogTotal, stats,
    archivedProducts, archivedLoaded, archivedLoading, fetchArchived,
    restoreProduct, toggleVisibility, confirmDelete,
    activeCount, hiddenCount, setupCount, posCount, webCount, kitchenCount, drinksCount,
    availableCount, unavailableCount, lowOrOutCount, categoryCount,
    filtered,
  };
}

import { useMemo, useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase, invokeFn } from "../../services/supabase";
import { useAuth } from "../../features/auth/AuthContext";
import { useTheme } from "../../features/theme/ThemeContext";
import { WRITE_ROLES } from "../../features/constants";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { RefreshButton } from "../../features/ui/RefreshButton";
import { useToast } from "../../features/ui/ToastProvider";
import { SearchInput } from "../../features/ui/SearchInput";
import { StatTileRow } from "../../features/ui/StatTileRow";
import { EmptyState } from "../../features/ui/EmptyState";
import { makeStyles } from "../../features/products/productsScreenStyles";
import { productColumns } from "../../features/products/productsColumns";
import { useProductsCatalog } from "../../features/products/useProductsCatalog";
import { useProductRecipe } from "../../features/products/useProductRecipe";
import { ProductRow } from "../../features/products/ProductRow";
import { StatusTabsRow } from "../../features/products/StatusTabsRow";
import { CategoryFilterRow } from "../../features/products/CategoryFilterRow";
import { ProductFormModal } from "../../features/products/components/ProductFormModal";
import { IngredientPickerModal } from "../../features/products/components/IngredientPickerModal";
import { ProductActionMenu } from "../../features/products/components/ProductActionMenu";
import { EMPTY_FORM, type Product, type ProductForm, type StatusFilter } from "../../features/products/types";

export default function ProductsScreen() {
  const { activeWorkspaceId, activeBranchId, role } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const canWrite = role != null && (WRITE_ROLES as readonly string[]).includes(role);
  const { showToast } = useToast();

  const catalog = useProductsCatalog(activeWorkspaceId);
  const recipeApi = useProductRecipe(activeWorkspaceId);

  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [menuProduct, setMenuProduct] = useState<Product | null>(null);

  function patchForm(patch: Partial<ProductForm>) {
    setForm(f => ({ ...f, ...patch }));
  }

  function openAdd() {
    setEditProduct(null);
    setForm(EMPTY_FORM);
    recipeApi.resetForNewProduct();
    setShowAdvanced(false);
    setShowForm(true);
    recipeApi.loadIngredients();
  }

  function openEdit(p: Product) {
    setEditProduct(p);
    setForm({
      name: p.name, category_id: p.category_id ?? "", price: String(p.price),
      sku: p.sku ?? "", barcode: p.barcode ?? "",
      description: p.description ?? "", image_url: p.image_url ?? "",
      prep_station: p.prep_station, for_sale: p.for_sale,
      active: p.active, is_pinned: p.is_pinned, featured: p.featured,
      track_inventory: p.track_inventory,
    });
    setShowAdvanced(!!(p.sku || p.barcode || p.description || p.image_url));
    recipeApi.resetForEdit();
    recipeApi.loadRecipe(p.id);
    recipeApi.loadIngredients();
    setShowForm(true);
  }

  async function saveProduct() {
    if (!form.name.trim() || !form.price) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("products-upsert", {
        body: {
          workspace_id: activeWorkspaceId,
          ...(editProduct ? { id: editProduct.id } : {}),
          name: form.name.trim(),
          category_id: form.category_id || null,
          price: parseFloat(form.price) || 0,
          sku: form.sku.trim() || null,
          barcode: form.barcode.trim() || null,
          featured_blurb: form.description.trim() || null,
          image_url: form.image_url.trim() || null,
          prep_station: form.prep_station,
          for_sale: form.for_sale,
          active: form.active,
          is_pinned: form.is_pinned,
          featured: form.featured,
          track_inventory: form.track_inventory,
        },
      });
      if (error || data?.error) { showToast({ title: "Error", message: data?.error ?? error?.message ?? "Failed", type: "error" }); return; }
      const productId = data?.product?.id ?? editProduct?.id;
      if (productId && form.track_inventory) {
        if (recipeApi.stockMode === "recipe") {
          await recipeApi.saveRecipe(productId);
        } else if (!recipeApi.alreadyActivated) {
          // First-time activation for simple-quantity tracking — same call
          // Inventory's "Track item" used to make, just made right here instead
          // of sending the cashier to a second screen for it.
          const { error: stockErr } = await invokeFn("stock-in", {
            workspace_id: activeWorkspaceId, branch_id: activeBranchId, product_id: productId,
            quantity: parseFloat(recipeApi.stockQty) || 0, unit: recipeApi.stockUnit.trim() || "pcs",
            low_stock_threshold: parseFloat(recipeApi.stockThreshold) || 0,
          });
          if (stockErr) {
            showToast({ title: "Saved, but stock setup failed", message: stockErr.message, type: "error" });
          }
        }
      }
      setShowForm(false);
      catalog.fetchPage(0);
    } catch (e: any) {
      showToast({ title: "Error", message: e?.message ?? "Failed to save product. Check your connection and try again.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { id: "all" as StatusFilter, label: "All", count: catalog.products.length, warn: false },
    { id: "active" as StatusFilter, label: "Complete", count: catalog.activeCount, warn: false },
    { id: "setup" as StatusFilter, label: "Needs Review", count: catalog.setupCount, warn: catalog.setupCount > 0 },
    { id: "hidden" as StatusFilter, label: "Inactive", count: catalog.hiddenCount, warn: false },
    { id: "archived" as StatusFilter, label: "Archived", count: catalog.stats?.archived ?? 0, warn: false },
    { id: "pos" as StatusFilter, label: "On POS", count: catalog.posCount, warn: false },
    { id: "web" as StatusFilter, label: "On Web", count: catalog.webCount, warn: false },
    { id: "kitchen" as StatusFilter, label: "Kitchen Prep", count: catalog.kitchenCount, warn: false },
    { id: "drinks" as StatusFilter, label: "Drinks Prep", count: catalog.drinksCount, warn: false },
  ];

  const isLoadingCurrentTab = catalog.statusFilter === "archived"
    ? (catalog.archivedLoading && !catalog.archivedLoaded)
    : catalog.loading;

  return (
    <View style={s.root}>
      <PosScreenHeader title="Products"
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={s.count}>
              {catalog.catalogTotal !== null && catalog.filtered.length !== catalog.catalogTotal
                ? `${catalog.filtered.length} of ${catalog.catalogTotal}`
                : `${catalog.catalogTotal ?? catalog.filtered.length} item${(catalog.catalogTotal ?? catalog.filtered.length) !== 1 ? "s" : ""}`}
            </Text>
            <RefreshButton onPress={catalog.manualRefresh} refreshing={catalog.refreshing} compact />
            {canWrite && (
              <Pressable style={s.addBtn} onPress={openAdd}>
                <Text style={s.addBtnTxt}>+ Add</Text>
              </Pressable>
            )}
          </View>
        } />

      <View style={s.toolbar}>
        <View style={{ flex: 1 }}>
          <SearchInput value={catalog.search} onChangeText={catalog.setSearch} placeholder="Search products…" />
        </View>
      </View>

      <StatusTabsRow
        statusFilter={catalog.statusFilter}
        tabs={tabs}
        onSelect={(id) => { catalog.setStatusFilter(id); if (id === "archived" && !catalog.archivedLoaded) catalog.fetchArchived(); }}
      />

      <CategoryFilterRow
        categories={catalog.categories}
        categoryFilter={catalog.categoryFilter}
        onSelect={catalog.setCategoryFilter}
        totalCount={catalog.stats?.total ?? catalog.catalogTotal ?? catalog.products.length}
        categoryCount={catalog.categoryCount}
      />

      {!catalog.loading && catalog.statusFilter !== "archived" && catalog.products.length > 0 && (
        <View style={s.summaryRow}>
          <StatTileRow tiles={[
            { key: "available", label: "Available", value: catalog.availableCount, color: C.good },
            { key: "unavailable", label: "Unavailable", value: catalog.unavailableCount, color: C.ink3 },
            { key: "low_or_out", label: "Low / Out of Stock", value: catalog.lowOrOutCount, color: C.warn },
          ]} />
        </View>
      )}

      {isLoadingCurrentTab ? (
        <View style={s.center}><ActivityIndicator color={C.amber} /></View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={s.tableHeader}>
            <Text style={[s.thTxt, productColumns.colName]}>PRODUCT</Text>
            <Text style={[s.thTxt, productColumns.colCat]}>CATEGORY</Text>
            <Text style={[s.thTxt, productColumns.colPrice]}>PRICE</Text>
            <Text style={[s.thTxt, productColumns.colType]}>STOCK TYPE</Text>
            <Text style={[s.thTxt, productColumns.colStatus]}>STATUS</Text>
            <View style={productColumns.colAction} />
          </View>
          <FlatList
            data={catalog.filtered}
            keyExtractor={p => p.id}
            contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 100 }]}
            renderItem={({ item }) => (
              <ProductRow product={item} canWrite={canWrite} onEdit={openEdit} onMenu={setMenuProduct} />
            )}
            ListEmptyComponent={
              <EmptyState
                icon="package"
                title={catalog.statusFilter === "archived" ? "No archived products" : "No products found"}
                subtitle={canWrite && catalog.statusFilter !== "archived" ? "Tap + Add to create your first product" : undefined}
              />
            }
            onEndReached={() => { if (catalog.statusFilter !== "archived" && catalog.hasMore && !catalog.loadingMore) catalog.fetchPage(catalog.page + 1); }}
            onEndReachedThreshold={0.4}
            ListFooterComponent={catalog.statusFilter !== "archived" && catalog.loadingMore ? <ActivityIndicator color={C.amber} style={{ padding: 16 }} /> : null}
          />
        </View>
      )}

      <ProductFormModal
        visible={showForm}
        editProduct={editProduct}
        categories={catalog.categories}
        form={form}
        onFormChange={patchForm}
        saving={saving}
        recipeSaving={recipeApi.recipeSaving}
        canWrite={canWrite}
        showAdvanced={showAdvanced}
        onShowAdvancedChange={setShowAdvanced}
        stockMode={recipeApi.stockMode}
        onStockModeChange={recipeApi.setStockMode}
        stockUnit={recipeApi.stockUnit}
        onStockUnitChange={recipeApi.setStockUnit}
        stockQty={recipeApi.stockQty}
        onStockQtyChange={recipeApi.setStockQty}
        stockThreshold={recipeApi.stockThreshold}
        onStockThresholdChange={recipeApi.setStockThreshold}
        alreadyActivated={recipeApi.alreadyActivated}
        recipe={recipeApi.recipe}
        recipeCogs={recipeApi.recipeCogs}
        onAddIngredient={() => { recipeApi.setIngSearch(""); recipeApi.setIngQty(""); recipeApi.setSelIng(null); recipeApi.setAddIngOpen(true); }}
        onRemoveRecipeLine={recipeApi.removeRecipeLine}
        onClose={() => setShowForm(false)}
        onSave={() => { saveProduct().catch(console.error); }}
      />

      <ProductActionMenu
        product={menuProduct}
        onClose={() => setMenuProduct(null)}
        onEdit={(p) => { openEdit(p); setMenuProduct(null); }}
        onRestore={(p) => { catalog.restoreProduct(p); setMenuProduct(null); }}
        onToggleVisibility={(p, patch) => { catalog.toggleVisibility(p, patch); setMenuProduct(null); }}
        onArchive={(p) => { catalog.confirmDelete(p); setMenuProduct(null); }}
      />

      <IngredientPickerModal
        visible={recipeApi.addIngOpen}
        onClose={() => recipeApi.setAddIngOpen(false)}
        ingredients={recipeApi.filtIngredients}
        ingSearch={recipeApi.ingSearch}
        onIngSearchChange={recipeApi.setIngSearch}
        selIng={recipeApi.selIng}
        onSelectIng={recipeApi.setSelIng}
        ingQty={recipeApi.ingQty}
        onIngQtyChange={recipeApi.setIngQty}
        onAdd={recipeApi.addIngredientToRecipe}
      />
    </View>
  );
}

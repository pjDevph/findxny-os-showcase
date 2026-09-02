export type PrepStation = "none" | "kitchen" | "drinks" | "counter";

export interface Product {
  id: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  price: number;
  prep_station: PrepStation;
  active: boolean;
  for_sale: boolean;
  archived: boolean;
  is_pinned: boolean;
  featured: boolean;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  image_url: string | null;
  cogs: number;
  track_inventory: boolean;
  stock_status: "not_tracked" | "out_of_stock" | "low_stock" | "in_stock";
  available_quantity: number | null;
}

export interface Category { id: string; name: string }

export type SetupStatus =
  | "inactive"       // active = false
  | "draft"          // for_sale = false but active
  | "needs_price"    // price = 0
  | "needs_category" // no category
  | "needs_image"    // has price + category but no image
  | "complete";      // all essentials present

// A choosable row in the unified inventory catalog — a raw material, or
// another product that tracks its own stock (product_id set), which is what
// lets a recipe consume a standalone-sellable item's stock.
export interface Ingredient {
  id: string; name: string; unit: string;
  cost_per_unit: number; category: string; product_id: string | null;
}

export interface RecipeLine {
  id: string;           // recipe_items.id (empty string = unsaved)
  catalog_id: string;
  ingredient_name: string;
  unit: string;
  cost_per_unit: number;
  quantity: number;
}

export type StatusFilter = "all" | "active" | "setup" | "hidden" | "archived" | "pos" | "web" | "kitchen" | "drinks";

export interface ProductStats {
  total: number; available: number; unavailable: number;
  low_or_out_of_stock: number; archived: number;
  by_category: Record<string, number>;
}

// Raw row shapes returned by the "pos-data" edge function for each resource.
export interface ProductListRow {
  id: string;
  name: string;
  category_id: string | null;
  product_categories?: { name: string | null } | null;
  price: number | string;
  prep_station?: PrepStation | null;
  kitchen_required?: boolean | null;
  active?: boolean | null;
  for_sale?: boolean | null;
  archived?: boolean | null;
  is_pinned?: boolean | null;
  featured?: boolean | null;
  sku?: string | null;
  barcode?: string | null;
  featured_blurb?: string | null;
  image_url?: string | null;
  track_inventory?: boolean | null;
  stock_status?: "not_tracked" | "out_of_stock" | "low_stock" | "in_stock" | null;
  available_quantity?: number | null;
}

export interface RecipeCogsRow {
  product_id: string;
  qty_used: number | string;
  inventory_catalog: { cost_per_unit: number | string } | null;
}

export interface IngredientPickerRow {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number | string;
  category: string;
  product_id: string | null;
}

export interface RecipeEditRow {
  id: string;
  catalog_id: string;
  qty_used: number | string;
  inventory_catalog?: { name: string; unit: string; cost_per_unit: number | string; product_id: string | null } | null;
}

export const EMPTY_FORM = {
  name: "", category_id: "", price: "",
  sku: "", barcode: "", description: "", image_url: "",
  prep_station: "none" as PrepStation, for_sale: true, active: true, is_pinned: false, featured: false,
  track_inventory: false,
};

export type ProductForm = typeof EMPTY_FORM;

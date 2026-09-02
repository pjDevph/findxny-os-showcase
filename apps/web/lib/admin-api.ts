// Authenticated edge-function calls for admin/server actions.
// Uses the SSR Supabase client so the caller's JWT is forwarded automatically.
// Every read in the admin area goes through `admin-data` (single discriminated
// endpoint) so the FE never queries Postgres directly.
import { createSupabaseServerClient } from "./supabase/server";

async function invoke<T>(name: string, body: unknown): Promise<T> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.functions.invoke<T>(name, { body: body as any });
  if (error) {
    // FunctionsHttpError swallows the response body in `error.message`.
    // Read it so the actual edge-function error reaches the user/logs.
    let detail = "";
    try {
      const ctx = (error as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } }).context;
      if (ctx?.json) detail = JSON.stringify(await ctx.json());
      else if (ctx?.text) detail = await ctx.text();
    } catch { /* ignore */ }
    const detailSuffix = detail ? ` — ${detail}` : "";
    throw new Error(`${name}: ${(error as { message?: string }).message || "failed"}${detailSuffix}`);
  }
  return data as T;
}

/** Resolve which workspace this user belongs to. Used to scope every admin read. */
export async function resolveWorkspaceId(): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // Membership lookup is the one direct read still needed — auth context, not data.
  // Same pattern the middleware uses (see middleware.ts).
  const { data } = await supabase
    .from("workspace_members").select("workspace_id").eq("user_id", user.id).limit(1).maybeSingle();
  return data?.workspace_id ?? null;
}

type ReadResource =
  | "context" | "dashboard" | "orders" | "kitchen" | "kitchen-history" | "bookings"
  | "branches" | "employees" | "transactions" | "reports"
  | "audit-logs" | "products" | "product-categories" | "inventory" | "stock-movements" | "recipe-items"
  | "resources" | "resource-blocks" | "costs" | "menu-book" | "customers" | "online-customers" | "refunds"
  | "attendance" | "role-permissions";

async function read<T>(workspace_id: string, resource: ReadResource, params: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>("admin-data", { workspace_id, resource, params });
}

export const adminApi = {
  // Reads
  context:       (wsId: string) => read<{ workspace: any; role: string }>(wsId, "context"),
  dashboard:     (wsId: string) => read<{
    recent_orders: any[]; today_orders: any[]; kitchen_tickets: any[];
    transactions: any[]; active_bookings: any[];
  }>(wsId, "dashboard"),
  orders:        (wsId: string, params: { status?: string; branch?: string; source?: string; limit?: number; offset?: number } = {}) =>
                 read<{ orders: any[]; total: number; limit: number; offset: number }>(wsId, "orders", params),
  kitchen:       (wsId: string) => read<{ tickets: any[] }>(wsId, "kitchen"),
  bookings:      (wsId: string, params: { status?: string; limit?: number; offset?: number } = {}) =>
                 read<{ bookings: any[]; total: number; limit: number; offset: number }>(wsId, "bookings", params),
  branches:      (wsId: string) => read<{ branches: any[] }>(wsId, "branches"),
  employees:     (wsId: string) => read<{ members: any[] }>(wsId, "employees"),
  transactions:  (wsId: string, params: { type?: string; status?: string; from?: string; to?: string; limit?: number; offset?: number } = {}) =>
                 read<{ transactions: any[]; total: number; limit: number; offset: number }>(wsId, "transactions", params),
  reports:       (wsId: string, params: { days?: number } = {}) =>
                 read<{ orders: any[]; transactions: any[]; order_items: any[] }>(wsId, "reports", params),
  auditLogs:     (wsId: string, params: { limit?: number; offset?: number; entity_type?: string; since?: string } = {}) =>
                 read<{ logs: any[]; total: number; limit: number; offset: number }>(wsId, "audit-logs", params),
  products:           (wsId: string) => read<{ products: any[] }>(wsId, "products"),
  productCategories:  (wsId: string) => read<{ categories: any[] }>(wsId, "product-categories"),
  inventory:          (wsId: string) => read<{ items: any[] }>(wsId, "inventory"),
  stockMovements:     (wsId: string, params: { inventory_item_id?: string; type?: string } = {}) =>
                      read<{ movements: any[] }>(wsId, "stock-movements", params),
  recipeItems:        (wsId: string, params: { product_id?: string } = {}) =>
                      read<{ items: any[] }>(wsId, "recipe-items", params),
  resources:          (wsId: string) => read<{ resources: any[] }>(wsId, "resources"),
  resourceBlocks:     (wsId: string, params: { resource_id?: string } = {}) =>
                      read<{ blocks: any[] }>(wsId, "resource-blocks", params),
  costs:              (wsId: string) => read<{ costs: any[] }>(wsId, "costs"),
  kitchenHistory:     (wsId: string, params: { limit?: number } = {}) =>
                      read<{ tickets: any[] }>(wsId, "kitchen-history", params),
  customers:          (wsId: string, params: { limit?: number; offset?: number } = {}) =>
                      read<{ customers: any[]; total: number; limit: number; offset: number }>(wsId, "customers", params),
  onlineCustomers:    (wsId: string) =>
                      read<{ orders: any[] }>(wsId, "online-customers"),
  refunds:            (wsId: string, params: { date_from?: string; date_to?: string; refund_type?: "cash" | "xendit" | "all"; page?: number; per_page?: number } = {}) =>
                      read<{ refunds: any[]; total_count: number; total_amount: number }>(wsId, "refunds", params),
  attendance:         (wsId: string) =>
                      read<{ records: { id: string; user_id: string; staff_name: string; branch_id: string | null; clock_in: string; clock_out: string | null }[] }>(wsId, "attendance"),
  rolePermissions:    (wsId: string) =>
                      read<{ overrides: { role: string; feature: string; granted: boolean }[] }>(wsId, "role-permissions"),
  menuBook:           (wsId: string) => read<{
    pages: { page_no: number; label: string; file_name: string | null; image_path: string | null; image_url: string | null }[];
    hotspots: {
      page_no: number;
      shape: "rect" | "square" | "ellipse" | "circle" | "freehand";
      x: number; y: number; w: number; h: number;
      points: { x: number; y: number }[] | null;
      blend_color: string | null;
      name: string; price: number; cat: string | null;
      product_id: string | null;
      sort_order: number;
    }[];
  }>(wsId, "menu-book"),

  // Writes
  productsToggle: (input: { workspace_id: string; product_id: string; active: boolean }) =>
    invoke<{ product: { id: string; active: boolean } }>("products-toggle", input),

  productsBulkToggle: (input: { workspace_id: string; product_ids: string[]; active: boolean }) =>
    invoke<{ updated: number }>("products-bulk-toggle", input),

  productsUpsert: (input: {
    workspace_id: string;
    id?: string;
    name?: string;
    sku?: string | null;
    price?: number;
    category_id?: string | null;
    kitchen_required?: boolean;
    active?: boolean;
    image_url?: string | null;
    featured?: boolean;
    featured_tag?: string | null;
    featured_blurb?: string | null;
    featured_sort?: number | null;
    purchase_unit?: string;
    selling_unit?: string;
    cost?: number;
    barcode?: string | null;
    for_sale?: boolean;
    is_pinned?: boolean;
    prep_station?: "none" | "kitchen" | "drinks" | "counter";
    track_inventory?: boolean;
  }) => invoke<{ product: any }>("products-upsert", input),

  menuBookUpsert: (input: {
    workspace_id: string;
    pages: { page_no: number; label: string; file_name?: string | null; image_path?: string | null }[];
    hotspots: {
      page_no: number;
      shape: "rect" | "square" | "ellipse" | "circle" | "freehand";
      x: number; y: number; w: number; h: number;
      points?: { x: number; y: number }[] | null;
      blend_color?: string | null;
      name: string;
      price: number;
      cat?: string | null;
      product_id?: string | null;
    }[];
  }) => invoke<{ ok: true; pages: number; hotspots: number }>("menu-book-upsert", input),

  recipeItemsUpsert: (input: {
    workspace_id: string;
    id?: string;
    product_id: string;
    catalog_id: string;
    qty: number;
    unit: string;
    section?: "ingredient" | "topping";
  }) => invoke<{ recipe_item: any; cost: number; warnings: string[] }>("recipe-items-upsert", input),

  recipeItemsDelete: (input: { workspace_id: string; recipe_item_id: string }) =>
    invoke<{ deleted: true; cost: number }>("recipe-items-delete", input),

  productsDelete: (input: { workspace_id: string; product_id: string; hard?: boolean }) =>
    invoke<{ deleted?: boolean; archived?: boolean; product?: any }>("products-delete", input),

  productCategoriesUpsert: (input: { workspace_id: string; name: string; sort_order?: number }) =>
    invoke<{ category: { id: string }; created: boolean }>("product-categories-upsert", input),

  catalogUpsert: (input: {
    workspace_id: string;
    id?: string;
    name: string;
    unit: string;
    category?: string;
    cost_per_unit: number;
    low_stock_threshold?: number;
    expiry_date?: string | null;
    batch_number?: string | null;
    branch_id?: string;
    initial_stock?: number;
  }) => invoke<{ catalog_item: any }>("catalog-upsert", input),

  catalogDelete: (input: { workspace_id: string; catalog_id: string; hard?: boolean }) =>
    invoke<{ deleted?: boolean; archived?: boolean; catalog_item?: any }>("catalog-delete", input),

  employeesInvite: (input: {
    workspace_id: string;
    email: string;
    role: "owner" | "admin" | "manager" | "cashier" | "kitchen";
    branch_id?: string | null;
    full_name?: string;
  }) => invoke<{ member: any; user_id: string; invited: boolean }>("employees-invite", input),

  employeesUpdate: (input: {
    workspace_id: string;
    user_id: string;
    role?: "owner" | "admin" | "manager" | "cashier" | "kitchen";
    branch_id?: string | null;
    is_suspended?: boolean;
    is_archived?: boolean;
  }) => invoke<{ member: any }>("employees-update", input),

  employeesRemove: (input: { workspace_id: string; user_id: string }) =>
    invoke<{ removed: true }>("employees-remove", input),

  stockIn: (input: {
    workspace_id: string;
    branch_id: string;
    product_id: string;
    quantity: number;
    unit_cost?: number;
    supplier?: string;
    reason?: string;
    unit?: string;
    low_stock_threshold?: number;
  }) => invoke<{ item: any; movement: any }>("stock-in", input),

  stockOut: (input: {
    workspace_id: string;
    inventory_item_id: string;
    quantity: number;
    reason_type: "damaged" | "expired" | "lost" | "other";
    note?: string;
  }) => invoke<{ item: any; movement: any }>("stock-out", input),

  inventoryAdjust: (input: {
    workspace_id: string;
    branch_id: string;
    inventory_item_id: string;
    type: "in" | "out" | "adjustment";
    quantity: number;
    reason?: string;
  }) => invoke<{ item: any; movement: any }>("inventory-adjust", input),

  branchesToggle: (input: {
    workspace_id: string;
    branch_id: string;
    accepting_orders?: boolean;
    accepting_bookings?: boolean;
  }) => invoke<{ branch: { id: string; accepting_orders: boolean; accepting_bookings: boolean } }>("branches-toggle", input),

  workspacesUpdate: (input: {
    workspace_id: string;
    name?: string;
    phone?: string;
    tax_rate?: number;
    service_rate?: number;
    hold_minutes?: number;
    slot_minutes?: number;
    receipt_address?: string;
    receipt_tin?: string;
    receipt_footer?: string;
    receipt_logo?: string;
    receipt_order_prefix?: string;
    receipt_promo_line?: string;
    receipt_wifi_ssid?: string;
    receipt_wifi_cred?: string;
    payment_config?: Record<string, string>;
    maintenance_mode?: boolean;
    maintenance_message?: string;
    home_content?: unknown;
  }) => invoke<{ workspace: { id: string; name: string } }>("workspaces-update", input),

  resourcesUpsert: (input: {
    workspace_id: string;
    id?: string;
    name: string;
    type: "room" | "amenity";
    capacity?: number;
    hourly_rate: number;
    branch_id?: string;
  }) => invoke<{ resource: any }>("resources-upsert", input),

  resourcesToggle: (input: {
    workspace_id: string;
    resource_id: string;
    active: boolean;
  }) => invoke<{ resource: any }>("resources-toggle", input),

  costsUpsert: (input: {
    workspace_id: string;
    id?: string;
    category: string;
    name: string;
    amount: number;
    frequency: string;
    notes?: string;
  }) => invoke<{ item: any }>("costs-upsert", input),

  ordersCancel: (input: { workspace_id: string; order_id: string; reason?: string }) =>
    invoke<{ order: any }>("orders-cancel", input),

  bookingsCancel: (input: { workspace_id: string; booking_id: string; reason?: string }) =>
    invoke<{ booking: any }>("bookings-cancel", input),

  costsDelete: (input: {
    workspace_id: string;
    cost_item_id: string;
  }) => invoke<{ deleted: boolean }>("costs-delete", input),

  bookingsBlockResource: (input: {
    workspace_id: string;
    resource_id: string;
    start_date: string;
    end_date: string;
    block_type: "maintenance" | "owner_block" | "cleaning" | "private_event";
    reason?: string;
    branch_id?: string;
  }) => invoke<{ block: any }>("bookings-block-resource", input),

  bookingsUnblockResource: (input: {
    workspace_id: string;
    block_id: string;
  }) => invoke<{ success: true; block_id: string }>("bookings-unblock-resource", input),

  cashDrawerGetDay: (input: { workspace_id: string; branch_id?: string | null; date: string }) =>
    invoke<{ day: any; entries: any[] }>("cash-drawer", { ...input, action: "get_day" }),

  cashDrawerSetStartingCash: (input: {
    workspace_id: string; branch_id?: string | null; date: string; starting_cash: number;
  }) => invoke<{ day: any }>("cash-drawer", { ...input, action: "set_starting_cash" }),

  cashDrawerAddEntry: (input: {
    workspace_id: string; branch_id?: string | null; date: string;
    kind: "cash_in" | "expense"; label: string; amount: number;
    remarks?: string | null; expense_type?: "Cash" | "Non-Cash" | null;
  }) => invoke<{ entry: any }>("cash-drawer", { ...input, action: "add_entry" }),

  cashDrawerRemoveEntry: (input: { workspace_id: string; entry_id: string }) =>
    invoke<{ deleted: true }>("cash-drawer", { ...input, action: "remove_entry" }),

  cashDrawerSetManualOverride: (input: {
    workspace_id: string; branch_id?: string | null; date: string; net_cash_manual: number | null;
  }) => invoke<{ day: any }>("cash-drawer", { ...input, action: "set_manual_override" }),

  rolePermissionsUpsert: (input: {
    workspace_id: string; role: string; feature: string; granted: boolean;
  }) => invoke<{ override: any }>("role-permissions-upsert", input),
};

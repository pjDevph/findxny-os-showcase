"use client";
// Browser-side wrapper for admin-area edge function calls. Mirrors the server-
// side `adminApi` in [admin-api.ts](./admin-api.ts) but uses the browser
// Supabase client (so the user's JWT is forwarded). All admin reads/writes
// from client components MUST go through this — never `supabase.from(...)`.
import { supabaseBrowser } from "./supabase/client";

async function invoke<T>(name: string, body: unknown): Promise<T> {
  const sb = supabaseBrowser();
  const { data, error } = await sb.functions.invoke<T>(name, { body: body as any });
  if (error) {
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

type ReadResource =
  | "context" | "dashboard" | "orders" | "kitchen" | "kitchen-history" | "bookings"
  | "branches" | "employees" | "transactions" | "reports"
  | "audit-logs" | "products" | "product-categories" | "inventory" | "stock-movements"
  | "recipe-items" | "ingredients" | "resources" | "resource-blocks" | "costs" | "menu-book";

async function read<T>(workspace_id: string, resource: ReadResource, params: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>("admin-data", { workspace_id, resource, params });
}

export type Membership = {
  workspace_id: string;
  role: "owner" | "admin" | "manager" | "cashier" | "kitchen";
  branch_id: string | null;
  workspace: { name: string; slug: string } | null;
};

export const adminClient = {
  me: () => invoke<{ user_id: string; memberships: Membership[] }>("me", {}),

  kitchenHistory: (wsId: string, params: { limit?: number } = {}) =>
    read<{ tickets: any[] }>(wsId, "kitchen-history", params),

  costs: (wsId: string) => read<{ costs: any[] }>(wsId, "costs"),

  transactions: (wsId: string, params: { type?: string; status?: string; limit?: number; offset?: number } = {}) =>
    read<{ transactions: any[]; total: number; limit: number; offset: number }>(wsId, "transactions", params),

  bookings: (wsId: string, params: { status?: string; limit?: number; offset?: number } = {}) =>
    read<{ bookings: any[]; total: number; limit: number; offset: number }>(wsId, "bookings", params),

  auditLogs: (wsId: string, params: { days?: number; entity_type?: string; limit?: number; offset?: number } = {}) => {
    const q: Record<string, unknown> = {};
    if (params.entity_type && params.entity_type !== "all") q.entity_type = params.entity_type;
    if (params.days && params.days > 0) {
      const since = new Date();
      since.setDate(since.getDate() - params.days);
      q.since = since.toISOString();
    }
    if (params.limit  !== undefined) q.limit  = params.limit;
    if (params.offset !== undefined) q.offset = params.offset;
    return read<{ logs: any[]; total: number; limit: number; offset: number }>(wsId, "audit-logs", q);
  },

  costsUpsert: (input: {
    workspace_id: string;
    id?: string;
    category: string;
    name: string;
    amount: number;
    frequency: string;
    notes?: string | null;
  }) => invoke<{ item: any }>("costs-upsert", input),

  costsDelete: (input: { workspace_id: string; cost_item_id: string }) =>
    invoke<{ deleted: true }>("costs-delete", input),

  productCategoriesUpsert: (input: { workspace_id: string; name: string; sort_order?: number }) =>
    invoke<{ category: { id: string }; created: boolean }>("product-categories-upsert", input),

  resourceBlocks: (wsId: string, params: { resource_id?: string } = {}) =>
    read<{ blocks: any[] }>(wsId, "resource-blocks", params),

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

  productAddonsList: (input: { workspace_id: string; product_id: string }) =>
    invoke<{ groups: AddonGroup[] }>("product-addons-list", input),

  productAddonsUpsert: (input: {
    workspace_id: string;
    product_id: string;
    id?: string;
    name: string;
    required: boolean;
    max_selections: number;
    options: { id?: string; name: string; price: number }[];
  }) => invoke<{ group: AddonGroup }>("product-addons-upsert", input),

  productAddonsDelete: (input: { workspace_id: string; group_id: string }) =>
    invoke<{ deleted: true }>("product-addons-delete", input),

  suppliersList: (input: { workspace_id: string; include_inactive?: boolean }) =>
    invoke<{ suppliers: any[] }>("suppliers-list", input),

  suppliersUpsert: (input: { workspace_id: string; supplier_id?: string; name: string; contact_name?: string; phone?: string; email?: string; address?: string; notes?: string; is_active?: boolean }) =>
    invoke<{ supplier: any }>("suppliers-upsert", input),

  suppliersDelete: (input: { workspace_id: string; supplier_id: string }) =>
    invoke<{ deleted: boolean }>("suppliers-delete", input),

  loyaltyBalance: (input: { workspace_id: string; customer_id: string; limit?: number }) =>
    invoke<{ balance: number; peso_value: number; rules: any; transactions: any[] }>("loyalty-balance", input),

  loyaltyEarn: (input: { workspace_id: string; customer_id: string; order_id: string; order_total: number }) =>
    invoke<{ points_earned: number; new_balance: number; transaction: any }>("loyalty-earn", input),

  loyaltyRedeem: (input: { workspace_id: string; customer_id: string; order_id: string; points_to_redeem: number }) =>
    invoke<{ points_redeemed: number; peso_value: number; new_balance: number; transaction: any }>("loyalty-redeem", input),

  loyaltyRulesUpsert: (input: { workspace_id: string; points_per_peso: number; peso_per_point: number; min_redeem_points: number; max_redeem_pct: number; is_active: boolean }) =>
    invoke<{ rules: any }>("loyalty-rules-upsert", input),

  tasksList: (input: { workspace_id: string; branch_id?: string; schedule?: string; date?: string; shift_id?: string }) =>
    invoke<{ checklists: any[] }>("tasks-list", input),

  tasksCompleteItem: (input: { workspace_id: string; checklist_id: string; item_id: string; shift_id?: string; notes?: string; date?: string }) =>
    invoke<{ completion: any; already_done?: boolean }>("tasks-complete-item", input),

  tasksUpsertChecklist: (input: { workspace_id: string; checklist_id?: string; name: string; schedule: string; assigned_role?: string | null; is_active?: boolean; sort_order?: number; branch_id?: string; items: any[] }) =>
    invoke<{ checklist: any }>("tasks-upsert-checklist", input),

  tasksDeleteChecklist: (input: { workspace_id: string; checklist_id: string }) =>
    invoke<{ deleted: boolean }>("tasks-delete-checklist", input),

  receiptsEmail: (input: { workspace_id: string; order_id?: string; booking_id?: string; email: string; customer_name?: string }) =>
    invoke<{ sent: boolean; email: string }>("receipts-email", input),
};

export type AddonOption = { id: string; name: string; price: number };
export type AddonGroup = {
  id: string;
  name: string;
  required: boolean;
  max_selections: number;
  options: AddonOption[];
};

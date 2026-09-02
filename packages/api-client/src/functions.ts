import { supabase } from "./supabase";
import type { AddChargeResponse, RemoveChargeResponse, ChargePresetsResponse } from "./order-charges";
import type { CustomersSearchResponse, CustomerCreateResponse } from "./customers";

async function invoke<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase().functions.invoke<T>(name, { body });
  if (error) throw error;
  return data as T;
}

export const fn = {
  createWorkspace:    (b: any) => invoke("auth-create-workspace", b),
  ordersCreate:       (b: any) => invoke("orders-create", b),
  ordersCancel:       (b: any) => invoke("orders-cancel", b),
  bookingsHold:       (b: any) => invoke("bookings-hold", b),
  bookingsConfirm:    (b: any) => invoke("bookings-confirm", b),
  bookingsCancel:     (b: any) => invoke("bookings-cancel", b),
  paymentsCreateIntent: (b: any) => invoke("payments-create-intent", b),
  paymentsCashConfirm:  (b: any) => invoke("payments-cash-confirm", b),
  kitchenUpdateStatus:  (b: any) => invoke("kitchen-update-status", b),
  transactionsVoid:   (b: any) => invoke("transactions-void", b),
  refundsCreate:      (b: any) => invoke("refunds-create", b),
  inventoryAdjust:    (b: any) => invoke("inventory-adjust", b),
  ordersAddCharge:         (b: any) => invoke<AddChargeResponse>("orders-add-charge", b),
  ordersRemoveCharge:      (b: any) => invoke<RemoveChargeResponse>("orders-remove-charge", b),
  customChargePresetsList: (b: any) => invoke<ChargePresetsResponse>("custom-charge-presets-list", b),
  customersSearch:         (b: any) => invoke<CustomersSearchResponse>("customers-search", b),
  customersCreate:         (b: any) => invoke<CustomerCreateResponse>("customers-create", b),
  bookingsBlockResource:   (b: any) => invoke("bookings-block-resource", b),
  bookingsUnblockResource: (b: any) => invoke("bookings-unblock-resource", b),
  refundReport: (b: { workspace_id: string; date_from?: string; date_to?: string; refund_type?: "cash" | "xendit" | "all"; page?: number; per_page?: number }) =>
    invoke<{ refunds: any[]; total_count: number; total_amount: number }>("admin-data", { ...b, resource: "refunds", params: { date_from: b.date_from, date_to: b.date_to, refund_type: b.refund_type, page: b.page, per_page: b.per_page } }),
  productAddonsList:   (b: any) => invoke("product-addons-list", b),
  productAddonsUpsert: (b: any) => invoke("product-addons-upsert", b),
  productAddonsDelete: (b: any) => invoke("product-addons-delete", b),

  // Suppliers
  suppliersList: (b: { workspace_id: string; include_inactive?: boolean }) =>
    invoke<{ suppliers: any[] }>('suppliers-list', b),
  suppliersUpsert: (b: { workspace_id: string; supplier_id?: string; name: string; contact_name?: string; phone?: string; email?: string; address?: string; notes?: string; is_active?: boolean }) =>
    invoke<{ supplier: any }>('suppliers-upsert', b),
  suppliersDelete: (b: { workspace_id: string; supplier_id: string }) =>
    invoke<{ deleted: boolean }>('suppliers-delete', b),

  // Loyalty points
  loyaltyBalance: (b: { workspace_id: string; customer_id: string; limit?: number }) =>
    invoke<{ balance: number; peso_value: number; rules: any; transactions: any[] }>('loyalty-balance', b),
  loyaltyEarn: (b: { workspace_id: string; customer_id: string; order_id: string; order_total: number }) =>
    invoke<{ points_earned: number; new_balance: number; transaction: any }>('loyalty-earn', b),
  loyaltyRedeem: (b: { workspace_id: string; customer_id: string; order_id: string; points_to_redeem: number }) =>
    invoke<{ points_redeemed: number; peso_value: number; new_balance: number; transaction: any }>('loyalty-redeem', b),
  loyaltyRulesUpsert: (b: { workspace_id: string; points_per_peso: number; peso_per_point: number; min_redeem_points: number; max_redeem_pct: number; is_active: boolean }) =>
    invoke<{ rules: any }>('loyalty-rules-upsert', b),

  // Tasks & Checklists
  tasksList: (b: { workspace_id: string; branch_id?: string; schedule?: string; date?: string; shift_id?: string }) =>
    invoke<{ checklists: any[] }>('tasks-list', b),
  tasksCompleteItem: (b: { workspace_id: string; checklist_id: string; item_id: string; shift_id?: string; notes?: string; date?: string }) =>
    invoke<{ completion: any; already_done?: boolean }>('tasks-complete-item', b),
  tasksUpsertChecklist: (b: { workspace_id: string; checklist_id?: string; name: string; schedule: string; assigned_role?: string | null; is_active?: boolean; sort_order?: number; branch_id?: string; items: any[] }) =>
    invoke<{ checklist: any }>('tasks-upsert-checklist', b),
  tasksDeleteChecklist: (b: { workspace_id: string; checklist_id: string }) =>
    invoke<{ deleted: boolean }>('tasks-delete-checklist', b),

  // Email receipt
  receiptsEmail: (b: { workspace_id: string; order_id?: string; booking_id?: string; email: string; customer_name?: string }) =>
    invoke<{ sent: boolean; email: string }>('receipts-email', b),
};

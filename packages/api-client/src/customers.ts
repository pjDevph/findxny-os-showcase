import { z } from "zod";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  workspace_id: string;
  branch_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CustomerSearchResult {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  last_order_at: string | null;
  total_orders: number;
}

export interface CustomersSearchResponse {
  customers: CustomerSearchResult[];
}

export interface CustomerCreateResponse {
  customer: Customer;
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const CustomerSearchBody = z.object({
  workspace_id: z.string().uuid(),
  query:        z.string().min(2),
  branch_id:    z.string().uuid().optional(),
  limit:        z.number().int().positive().optional(),
});

export const CustomerCreateBody = z.object({
  workspace_id: z.string().uuid(),
  branch_id:    z.string().uuid().optional(),
  name:         z.string().min(1),
  phone:        z.string().optional(),
  email:        z.string().email().optional(),
  notes:        z.string().optional(),
});

export type CustomerSearchBodyInput = z.infer<typeof CustomerSearchBody>;
export type CustomerCreateBodyInput = z.infer<typeof CustomerCreateBody>;

export interface OrderCharge {
  id: string;
  workspace_id: string;
  branch_id: string | null;
  order_id: string;
  name: string;
  amount: number;
  taxable: boolean;
  preset_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CustomChargePreset {
  id: string;
  workspace_id: string;
  branch_id: string | null;
  name: string;
  default_amount: number | null;
  taxable: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface OrderTotals {
  subtotal: number;
  charges_total: number;
  vat_amount: number;
  service_fee: number;
  total: number;
}

export interface AddChargeResponse {
  charge: OrderCharge;
  charges: OrderCharge[];
  totals: OrderTotals;
}

export interface RemoveChargeResponse {
  charges: OrderCharge[];
  totals: OrderTotals;
}

export interface ChargePresetsResponse {
  presets: CustomChargePreset[];
}

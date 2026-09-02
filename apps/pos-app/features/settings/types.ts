import { Feather } from "@expo/vector-icons";

export type SectionId = "profile" | "taxes" | "payments" | "receipt" | "printers" | "branch" | "approval" | "booking" | "display" | "appearance" | "about";

export interface SectionDef { id: SectionId; label: string; icon: keyof typeof Feather.glyphMap }

export interface WorkspaceInfo {
  id: string;
  name: string;
  phone: string | null;
  tax_rate: number | null;
  service_rate: number | null;
  receipt_address: string | null;
  receipt_tin: string | null;
  receipt_footer: string | null;
  receipt_wifi_ssid: string | null;
  receipt_wifi_cred: string | null;
  receipt_promo_line: string | null;
  receipt_logo: string | null;
  receipt_order_prefix: string | null;
  payment_config: Record<string, string> | null;
  hold_minutes: number | null;
  slot_minutes: number | null;
}

export interface Branch {
  id: string;
  name: string;
  accepting_orders: boolean;
  accepting_bookings: boolean;
}

export interface BranchRow {
  id: string;
  name: string;
  accepting_orders: boolean | null;
  accepting_bookings: boolean | null;
}

export interface RegisterRow {
  id: string;
  name: string;
  is_active: boolean;
}

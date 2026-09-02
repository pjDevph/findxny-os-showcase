import type { Feather } from "@expo/vector-icons";

export type Tab = "devices" | "routing" | "templates" | "troubleshoot";

export interface Printer {
  id: string;
  workspace_id: string;
  name: string;
  type: "receipt" | "label" | "kitchen" | "customer-display";
  connection: "builtin" | "ethernet" | "bluetooth" | "usb" | "network";
  mac_address?: string | null;
  ip_address?: string | null;
  is_default: boolean;
  is_enabled: boolean;
  last_test: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrinterForm {
  name: string;
  type: "receipt" | "label" | "kitchen" | "customer-display";
  connection: "builtin" | "ethernet" | "bluetooth" | "usb" | "network";
  mac_address: string;
  ip_address: string;
}

export interface RoutingConfig {
  receiptEnabled: boolean;
  receiptCopies: 1 | 2;
  drinkLabelEnabled: boolean;
  drinkLabelCategory: string;
  drinkLabelPrinterId: string;
  drinkLabelMode: "per_item_qty" | "per_order";
  drinkLabelFireOn: "confirmed" | "paid";
  drinkLabelPaperWidth: "40" | "58" | "80";
  kitchenTicketEnabled: boolean;
  kitchenTicketPrinterId: string;
  drinksTicketEnabled: boolean;
  drinksTicketPrinterId: string;
  ticketPaperWidth: "58" | "80";
}

export interface LabelTemplate {
  showProductName: boolean;
  showModifiers: boolean;
  showOrderNo: boolean;
  showTable: boolean;
  showQtyCount: boolean;
  showTime: boolean;
  fontSize: "normal" | "large";
}

export interface Category {
  id: string;
  name: string;
  color: string | null;
}

export interface LoadedPrintersPayload {
  printers: Printer[];
  printer_config: {
    routing?: Partial<RoutingConfig>;
    labelTemplate?: Partial<LabelTemplate>;
  };
  categories: Category[];
}

export const TYPE_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  receipt: "printer", label: "tag", kitchen: "monitor", "customer-display": "tv",
};

export const EMPTY_FORM: PrinterForm = {
  name: "",
  type: "label",
  connection: "network",
  mac_address: "",
  ip_address: "",
};

export const DEFAULT_ROUTING: RoutingConfig = {
  receiptEnabled: true,
  receiptCopies: 1,
  drinkLabelEnabled: false,
  drinkLabelCategory: "",
  drinkLabelPrinterId: "",
  drinkLabelMode: "per_item_qty",
  drinkLabelFireOn: "confirmed",
  drinkLabelPaperWidth: "40",
  kitchenTicketEnabled: false,
  kitchenTicketPrinterId: "",
  drinksTicketEnabled: false,
  drinksTicketPrinterId: "",
  ticketPaperWidth: "58",
};

export const DEFAULT_TEMPLATE: LabelTemplate = {
  showProductName: true,
  showModifiers: true,
  showOrderNo: true,
  showTable: true,
  showQtyCount: true,
  showTime: true,
  fontSize: "normal",
};

// NOSONAR - configurable default, not a real network endpoint
export const DEFAULT_PRINTER_IP = "192.168.1.100";

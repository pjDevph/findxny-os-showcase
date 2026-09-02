import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

const FN = (name: string) => `${SUPABASE_URL}/functions/v1/${name}`;

// Read-through cache for public reads: in the browser, hit the same-origin Next
// route handler (served from Next's shared Data Cache → ~1 upstream call/60s for
// all visitors). On the server, call the edge function directly (route handlers
// aren't reachable by relative URL during SSR, and server renders are fewer).
// The direct server-side fetch is given the same 60s revalidate window as the
// route handler's unstable_cache — without it, Next's Data Cache would cache
// this fetch indefinitely (until an explicit revalidatePath/tag call), so admin
// edits to workspace profile/tax rates/featured products could go unreflected
// on the public site for an unbounded time between deploys.
async function callCachedRead<T>(localPath: string, name: string, body: unknown): Promise<T> {
  if (globalThis.window === undefined) return call<T>(name, body, { revalidate: 60 });
  const res = await fetch(localPath, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json as T;
}

async function call<T>(name: string, body: unknown, opts: { idempotencyKey?: string; revalidate?: number } = {}): Promise<T> {
  // Supabase's function gateway rejects requests without `Authorization` even
  // for public endpoints, so always send the anon key as a Bearer token.
  // Authenticated users get a real JWT via supabase.functions.invoke() instead.
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "content-type": "application/json",
  };
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const res = await fetch(FN(name), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    ...(opts.revalidate !== undefined ? { next: { revalidate: opts.revalidate, tags: [name] } } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 429) {
      const retry = res.headers.get("Retry-After");
      const retrySuffix = retry ? ` (retry in ${retry}s)` : "";
      throw new Error(`${json?.error?.message || "Too many requests"}${retrySuffix}`);
    }
    throw new Error(json?.error?.message || `HTTP ${res.status}`);
  }
  return json as T;
}

export interface MenuProduct {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  kitchen_required: boolean;
  image_url: string | null;
  featured_blurb: string | null;
  active?: boolean;
  category: { id: string; name: string; sort_order: number } | null;
}
export interface MenuBookHotspot {
  shape: "rect" | "square" | "ellipse" | "circle" | "freehand";
  x: number; y: number; w: number; h: number;
  points: { x: number; y: number }[] | null;
  blend_color: string | null;
  name: string;
  price: number;
  cat: string | null;
  product_id: string | null;
}
export interface MenuBookPage {
  page_no: number;
  label: string;
  file_name: string | null;
  image_url: string | null;
}
export interface MenuBook {
  pages: MenuBookPage[];
  hotspots: Record<number, MenuBookHotspot[]>;
}
export interface MenuResponse {
  workspace: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    tax_rate: number;
    service_rate: number;
    phone: string | null;
    hold_minutes: number;
    slot_minutes: number;
    maintenance_mode?: boolean;
    maintenance_message?: string | null;
    home_content?: unknown;
  };
  branches: { id: string; name: string }[];
  products: MenuProduct[];
  menu_book?: MenuBook;
}

export const api = {
  menu: (slug: string) => callCachedRead<MenuResponse>("/api/public-menu", "public-menu", { slug }),

  guestOrder: (input: {
    workspace_slug: string;
    branch_id?: string;
    customer: { name: string; phone: string; email?: string };
    table_no?: string;
    notes?: string;
    items: { product_id: string; quantity: number; notes?: string }[];
    payment_method?: "cash" | "gcash" | "maya" | "card" | "qrph" | "pay_at_counter";
    cash_received?: number;
    voucher_code?: string;
  }, opts: { idempotencyKey?: string } = {}) => call<{
    order: { id: string; order_no: string; total: number; status: string; ticket_no?: string };
    checkout_url?: string;
    payment?: { id: string };
    transaction?: { id: string };
    receipt?: { id: string; receipt_no: string };
  }>("public-orders-create", input, opts),

  validateVoucher: (input: {
    workspace_slug: string;
    voucher_code: string;
    subtotal: number;
  }) => call<{
    valid: boolean;
    reason: string | null;
    discount_amount: number;
    voucher_code?: string;
    voucher_name?: string;
  }>("public-voucher-validate", input),

  trackOrder: (input: { order_no: string; phone?: string }) =>
    call<{
      order: {
        id: string;
        order_no: string;
        status: string;
        total: number;
        subtotal: number;
        tax: number;
        service_fee: number;
        discount: number;
        voucher_code: string | null;
        created_at: string;
        table_no: string | null;
        kitchen_ticket?: { status: string; started_at: string | null; ready_at: string | null; completed_at: string | null } | null;
      };
      workspace: { name: string; tax_rate: number; service_rate: number; currency: string };
      items: { name: string; quantity: number; total: number }[];
    }>("public-track-order", input),

  rooms: (slug: string) => callCachedRead<{
    workspace: { id: string; name: string; phone: string | null };
    rooms: Array<{
      id: string; name: string; type: string; capacity: number;
      hourly_rate: number; active: boolean;
      branch_id: string; workspace_id: string;
      branches: { name: string } | null;
    }>;
  }>("/api/public-rooms", "public-rooms", { slug }),

  roomAvailability: (slug: string, resource_id: string) =>
    call<{ booked: Array<{ start: string; end: string }> }>(
      "public-rooms", { slug, resource_id }
    ).then((r) => ({ booked: (r as any).booked ?? [] })),

  // Financial figures are looked up server-side from the real, paid order —
  // only the destination email + order reference are sent from the client.
  sendReceipt: (input: {
    to:       string;
    order_no: string;
    phone?:   string;
    method?:  string;
  }) => call<{ ok: boolean }>("public-send-receipt", input),

  // Financial figures are looked up server-side from the real, paid booking —
  // only the destination email + booking reference are sent from the client.
  sendBookingReceipt: (input: {
    to:          string;
    booking_ref: string;
    phone?:      string;
    method?:     string;
  }) => call<{ ok: boolean }>("public-send-booking-receipt", input),

  guestBooking: (input: {
    workspace_slug: string;
    branch_id?: string;
    resource_id?: string;
    customer: { name: string; phone: string; email?: string };
    start_time: string;
    end_time?: string;
    party_size?: number;
    notes?: string;
    payment_method?: "gcash" | "maya" | "card" | "qrph" | "counter";
    voucher_code?: string;
  }, opts: { idempotencyKey?: string } = {}) => call<{
    booking: {
      id: string; start_time: string; end_time: string; status: string;
      total: number; discount: number; voucher_code: string | null;
    };
    hold_expires_at: string;
    checkout_url?: string;
  }>("public-bookings-create", input, opts),

  cancelOrder: (input: { order_no: string; phone?: string; reason?: string }) =>
    call<{ order: { id: string; status: string }; message: string }>("public-orders-cancel", input),

  trackBooking: (input: { booking_ref: string; phone?: string }) =>
    call<{
      booking: {
        id: string; ref: string; status: string;
        start_time: string; end_time: string;
        total: number; created_at: string;
        hold_expires_at: string | null; notes: string | null;
        resource_id: string | null;
      };
      resource: { name: string; type: string } | null;
      customer: { name: string; phone: string; email?: string } | null;
    }>("public-track-booking", input),

  cancelBooking: (input: { booking_ref: string; phone: string; reason?: string }) =>
    call<{ booking: { id: string; status: string }; message: string }>("public-bookings-cancel", input),
};

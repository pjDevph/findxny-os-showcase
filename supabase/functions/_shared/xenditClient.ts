// Xendit payment gateway client — Deno edge runtime.
// Uses Xendit Invoice API so all payment methods (GCash, Maya, QRPh, card)
// share a single hosted checkout page and one webhook format.

const SECRET_KEY    = Deno.env.get("XENDIT_SECRET_KEY")    ?? "";
const WEBHOOK_TOKEN = Deno.env.get("XENDIT_WEBHOOK_TOKEN") ?? "";
const APP_URL       = Deno.env.get("APP_URL")              ?? "";

// Our method IDs → Xendit payment_methods filter
const CHANNEL_MAP: Record<string, string[]> = {
  gcash: ["GCASH"],
  maya:  ["PAYMAYA"],
  card:  ["CREDIT_CARD", "DEBIT_CARD"],
  qrph:  ["QR_CODE"],
};

const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

async function attemptXenditFetch(
  path: string,
  url: string,
  init: RequestInit,
  attempt: number,
): Promise<{ done: true; data: Record<string, unknown> } | { done: false; lastErr: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { done: true, data: data as Record<string, unknown> };
    if (res.status >= 500 || res.status === 429) {
      return { done: false, lastErr: new Error(`Xendit ${path}: ${res.status} ${(data as any).message ?? res.statusText}`) };
    }
    throw new Error(`Xendit ${path}: ${(data as any).message ?? res.statusText}`);
  } catch (err) {
    const aborted = (err as { name?: string })?.name === "AbortError";
    const isLast = attempt === MAX_ATTEMPTS;
    if (isLast) throw aborted ? new Error(`Xendit ${path}: timeout after ${TIMEOUT_MS}ms`) : err;
    return { done: false, lastErr: err };
  } finally {
    clearTimeout(timer);
  }
}

async function xenditPost(path: string, body: unknown, idempotencyKey?: string): Promise<Record<string, unknown>> {
  if (!SECRET_KEY) throw new Error("XENDIT_SECRET_KEY not configured");
  const url = `https://api.xendit.co${path}`;
  const init: RequestInit = {
    method:  "POST",
    headers: {
      "Authorization": `Basic ${btoa(SECRET_KEY + ":")}`,
      "Content-Type":  "application/json",
      // Reused verbatim across our own retry attempts below, so a request that
      // times out but actually succeeded at Xendit returns the original result
      // on retry instead of creating a second invoice/refund.
      ...(idempotencyKey ? { "Idempotency-key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  };

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await attemptXenditFetch(path, url, init, attempt);
    if (result.done) return result.data;
    lastErr = result.lastErr;
    await new Promise((r) => setTimeout(r, 250 * attempt));
  }
  throw lastErr ?? new Error(`Xendit ${path}: failed`);
}

async function xenditGet(path: string): Promise<Record<string, unknown>> {
  if (!SECRET_KEY) throw new Error("XENDIT_SECRET_KEY not configured");
  const url = `https://api.xendit.co${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method:  "GET",
      headers: { "Authorization": `Basic ${btoa(SECRET_KEY + ":")}` },
      signal:  ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Xendit GET ${path}: ${(data as any).message ?? res.statusText}`);
    return data as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

export interface XenditInvoice {
  id:          string;
  invoice_url: string;
  status:      string;
}

/**
 * Look up an invoice's actual current status at Xendit. Used to reconcile a
 * local payment_intent stuck "pending" (e.g. its confirmation webhook was
 * lost) before acting on it — a timeout only means we didn't get the
 * response, never that the payment didn't happen.
 */
export async function getInvoice(invoiceId: string): Promise<{ id: string; status: string }> {
  const data = await xenditGet(`/v2/invoices/${encodeURIComponent(invoiceId)}`);
  return { id: String(data.id ?? invoiceId), status: String(data.status ?? "") };
}

export async function createInvoice(params: {
  orderId:       string;
  orderNo:       string;
  amount:        number;
  currency:      string;
  paymentMethod: string;
  customer:      { name: string; phone: string; email?: string };
}): Promise<XenditInvoice> {
  const channels = CHANNEL_MAP[params.paymentMethod];
  const base = APP_URL ? APP_URL : "";
  const invoice = await xenditPost("/v2/invoices", {
    external_id:  `order_${params.orderId}`,
    amount:       params.amount,
    currency:     params.currency,
    description:  `Order ${params.orderNo}`,
    customer: {
      given_names:   params.customer.name,
      mobile_number: params.customer.phone,
      ...(params.customer.email ? { email: params.customer.email } : {}),
    },
    ...(channels ? { payment_methods: channels } : {}),
    success_redirect_url: `${base}/payment/callback?status=success&order_no=${encodeURIComponent(params.orderNo)}`,
    failure_redirect_url: `${base}/payment/callback?status=failed&order_no=${encodeURIComponent(params.orderNo)}`,
  }, `invoice_order_${params.orderId}`);
  return invoice as unknown as XenditInvoice;
}

export async function createBookingInvoice(params: {
  bookingId:     string;
  bookingRef:    string;
  amount:        number;
  currency:      string;
  paymentMethod: string;
  customer:      { name: string; phone: string; email?: string };
}): Promise<XenditInvoice> {
  const channels = CHANNEL_MAP[params.paymentMethod];
  const base = APP_URL ? APP_URL : "";
  const invoice = await xenditPost("/v2/invoices", {
    external_id:  `booking_${params.bookingId}`,
    amount:       params.amount,
    currency:     params.currency,
    description:  `Room Booking ${params.bookingRef}`,
    customer: {
      given_names:   params.customer.name,
      mobile_number: params.customer.phone,
      ...(params.customer.email ? { email: params.customer.email } : {}),
    },
    ...(channels ? { payment_methods: channels } : {}),
    success_redirect_url: `${base}/booking-callback?status=success&booking_ref=${encodeURIComponent(params.bookingRef)}`,
    failure_redirect_url: `${base}/booking-callback?status=failed&booking_ref=${encodeURIComponent(params.bookingRef)}`,
  }, `invoice_booking_${params.bookingId}`);
  return invoice as unknown as XenditInvoice;
}

/** Returns true when the webhook callback token matches. */
export function verifyWebhookToken(req: Request): boolean {
  if (!WEBHOOK_TOKEN) return false;
  return req.headers.get("x-callback-token") === WEBHOOK_TOKEN;
}

export interface ParsedInvoiceEvent {
  invoiceId:  string;
  orderId?:   string;
  bookingId?: string;
  status:     string;
  amount:     number;
  method:     string;
}

/**
 * Parse a Xendit invoice webhook body.
 * Handles both order_ and booking_ external IDs.
 */
export function parseInvoiceWebhook(raw: unknown): ParsedInvoiceEvent | null {
  const obj = raw as Record<string, any>;
  if (typeof obj.external_id !== "string") return null;
  const ext = obj.external_id;
  let orderId: string | undefined;
  let bookingId: string | undefined;
  if (ext.startsWith("order_"))   orderId   = ext.slice("order_".length);
  else if (ext.startsWith("booking_")) bookingId = ext.slice("booking_".length);
  else return null;
  return {
    invoiceId: String(obj.id),
    orderId,
    bookingId,
    status:    String(obj.status ?? ""),
    amount:    Number(obj.amount ?? 0),
    method:    String(obj.payment_method ?? "unknown"),
  };
}


export async function expireInvoice(invoiceId: string): Promise<Record<string, unknown>> {
  if (!invoiceId) throw new Error("Missing Xendit invoice id");
  return xenditPost(`/v2/invoices/${encodeURIComponent(invoiceId)}/expire`, {}, `expire_${invoiceId}`);
}

export async function createRefund(params: {
  invoiceId: string; amount: number; currency: string; reason?: string;
  /** Caller-supplied dedup key (e.g. the local refund row id) — required so
   *  two calls for what's logically the same refund attempt (a timed-out
   *  retry, or a cron re-processing the same order) collapse into one refund
   *  at Xendit instead of two. */
  idempotencyKey: string;
}): Promise<Record<string, unknown>> {
  return xenditPost("/v2/refunds", {
    invoice_id: params.invoiceId,
    amount: params.amount,
    reason: params.reason ?? "REQUESTED_BY_CUSTOMER",
    currency: params.currency,
  }, params.idempotencyKey);
}

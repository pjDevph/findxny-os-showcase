// Payment provider stub — Stripe-compatible interface.
// Real implementation should call Stripe SDK; for now we mock IDs so flows are testable end-to-end.

export interface ProviderIntent {
  id: string;
  client_secret: string;
  status: "requires_payment_method" | "succeeded";
}

export const paymentProvider = {
  async createIntent(amount: number, currency: string, metadata: Record<string, string>): Promise<ProviderIntent> {
    const id = `pi_mock_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    return {
      id,
      client_secret: `${id}_secret_${crypto.randomUUID().slice(0, 8)}`,
      status: "requires_payment_method",
    };
  },

  /** Verify webhook signature — returns parsed event or throws. */
  verifyWebhook(rawBody: string, signature: string | null, secret: string): unknown {
    if (!signature || !secret) throw new Error("Missing webhook signature");
    // TODO: real Stripe.webhooks.constructEvent(rawBody, signature, secret)
    return JSON.parse(rawBody);
  },
};

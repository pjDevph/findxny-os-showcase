import { useEffect } from "react";
import { setCustomerDisplay, resetCustomerDisplay } from "../customerDisplay/store";
import type { ReceiptPayload } from "../receipt/receiptConfig";
import type { PaymentConfig } from "../payments/paymentConfig";
import { resolvePayDisplayInfo, deriveCustomerDisplayMode } from "./orderHelpers";
import type { Cart, PayMethod } from "./types";

interface Args {
  cart: Cart;
  subtotal: number; tax: number; serviceFee: number; discount: number; total: number; itemCount: number;
  canCheckout: boolean;
  showPay: boolean;
  payMethod: PayMethod;
  successOrder: ReceiptPayload | null;
  payConfig: PaymentConfig;
  cashAmt: number;
}

/** Mirrors the live order onto the customer-facing screen (idle/order/payment/thank-you). */
export function useCustomerDisplayMirror({
  cart, subtotal, tax, serviceFee, discount, total, itemCount,
  canCheckout, showPay, payMethod, successOrder, payConfig, cashAmt,
}: Args) {
  useEffect(() => {
    const { payInfo, payQr } = resolvePayDisplayInfo(payMethod, payConfig);
    const mode = deriveCustomerDisplayMode(!!successOrder, showPay, canCheckout);

    setCustomerDisplay({
      mode,
      lines: cart.items.map(i => ({ name: i.product.name, qty: i.qty, price: i.product.price, note: i.notes || null })),
      bookings: cart.bookings.map(b => ({ name: b.resourceName, total: b.total })),
      subtotal, tax, service: serviceFee, discount, total, itemCount,
      payMethod, payInfo, payQr,
      orderNo: successOrder?.orderNo ?? null,
      change: successOrder ? successOrder.change : null,
      cashTendered: successOrder && payMethod === "cash" ? cashAmt : null,
      customerName: cart.customerName || null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cart, subtotal, tax, serviceFee, discount, total, itemCount,
    canCheckout, showPay, payMethod, successOrder, payConfig,
  ]);

  // Blank the customer screen back to idle when leaving the order screen.
  useEffect(() => () => resetCustomerDisplay(), []);
}

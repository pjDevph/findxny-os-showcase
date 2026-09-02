/**
 * Cart totals breakdown (subtotals, VAT, service, discounts, grand total).
 *
 * Extracted from app/pos/order.tsx. Presentational only — receives the shared
 * cart-panel stylesheet and computed figures from CartPanel.
 */
import { View, Text } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { peso } from "./format";
import type { Cart } from "./types";
import type { makeCpStyles } from "./cartPanelStyles";

export function CartTotals({
  cp, C, foodSubtotal, bookingTotal, taxRatePct, svcRatePct,
  tax, serviceFee, discount, total, cart, loyaltyDiscount, voucherDiscount,
}: {
  cp: ReturnType<typeof makeCpStyles>;
  C: ReturnType<typeof useTheme>["C"];
  foodSubtotal: number; bookingTotal: number;
  taxRatePct: number; svcRatePct: number;
  tax: number; serviceFee: number;
  discount: number; total: number;
  cart: Cart;
  loyaltyDiscount?: number;
  voucherDiscount?: number;
}) {
  return (
    <View style={cp.totals}>
      {foodSubtotal > 0 && bookingTotal > 0 && (
        <>
          <View style={cp.totalRow}>
            <Text style={cp.totalLabel}>Food</Text>
            <Text style={cp.totalValue}>{peso(foodSubtotal)}</Text>
          </View>
          <View style={cp.totalRow}>
            <Text style={cp.totalLabel}>Bookings</Text>
            <Text style={cp.totalValue}>{peso(bookingTotal)}</Text>
          </View>
        </>
      )}
      {/* VAT/Service are shown independently — each only appears when its own
          toggle is actually on (tax/serviceFee compute to 0 otherwise), so a
          workspace with e.g. service charge off never shows a misleading
          "Service 10% · ₱0.00" row. */}
      {tax > 0 && (
        <View style={cp.totalRow}>
          <Text style={cp.totalLabel}>VAT {(taxRatePct * 100).toFixed(0)}%</Text>
          <Text style={cp.totalValue}>{peso(tax)}</Text>
        </View>
      )}
      {serviceFee > 0 && (
        <View style={cp.totalRow}>
          <Text style={cp.totalLabel}>Service {(svcRatePct * 100).toFixed(0)}%</Text>
          <Text style={cp.totalValue}>{peso(serviceFee)}</Text>
        </View>
      )}
      {discount > 0 && (
        <View style={cp.totalRow}>
          <Text style={[cp.totalLabel, { color: C.good }]}>
            {cart.is_senior_pwd
              ? "SC/PWD Discount (20%)"
              : cart.discountType === "percent"
                ? `Discount (${Math.min(cart.discount, 100).toFixed(0)}%)`
                : "Discount"}
          </Text>
          <Text style={[cp.totalValue, { color: C.good }]}>-{peso(discount)}</Text>
        </View>
      )}
      {loyaltyDiscount != null && loyaltyDiscount > 0 && (
        <View style={cp.totalRow}>
          <Text style={[cp.totalLabel, { color: "#10b981" }]}>Points Redeemed</Text>
          <Text style={[cp.totalValue, { color: "#10b981" }]}>-{peso(loyaltyDiscount)}</Text>
        </View>
      )}
      {voucherDiscount != null && voucherDiscount > 0 && (
        <View style={cp.totalRow}>
          <Text style={[cp.totalLabel, { color: "#f59e0b" }]}>
            Voucher{cart.applied_voucher?.code ? ` (${cart.applied_voucher.code})` : ""}
          </Text>
          <Text style={[cp.totalValue, { color: "#f59e0b" }]}>-{peso(voucherDiscount)}</Text>
        </View>
      )}
      <View style={[cp.totalRow, cp.totalGrand]}>
        <Text style={cp.grandLabel}>Total</Text>
        <Text style={cp.grandValue}>{peso(total)}</Text>
      </View>
    </View>
  );
}

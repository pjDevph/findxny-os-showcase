/**
 * Payment-method glyph used by the checkout method picker.
 *
 * Extracted from app/pos/order.tsx — owns its own logo assets.
 */
import { View, Text, Image } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { PayMethod } from "./types";

const PAY_LOGOS: Partial<Record<PayMethod, ReturnType<typeof require>>> = {
  gcash: require("../../assets/payments/gcash.png"),
  maya:  require("../../assets/payments/maya.png"),
  qrph:  require("../../assets/payments/qrph.png"),
};

export function PayMethodIcon({ id, size = 38 }: { id: PayMethod; size?: number }) {
  const r = Math.round(size * 0.22);
  if (id === "cash") return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: "#1C6B38", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontSize: size * 0.52, fontWeight: "700", lineHeight: size * 0.64 }}>₱</Text>
    </View>
  );
  if (id === "card") return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: "#374151", alignItems: "center", justifyContent: "center" }}>
      <Feather name="credit-card" size={Math.round(size * 0.5)} color="#fff" />
    </View>
  );
  if (id === "bank_transfer") return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: "#1E3A8A", alignItems: "center", justifyContent: "center" }}>
      <Feather name="repeat" size={Math.round(size * 0.5)} color="#fff" />
    </View>
  );
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: "#111", overflow: "hidden" }}>
      <Image
        source={PAY_LOGOS[id]}
        style={{ width: "100%", height: "100%" }}
        resizeMode={id === "qrph" ? "contain" : "cover"}
      />
    </View>
  );
}

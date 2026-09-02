import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";
import type { ShiftGateState } from "./useShiftGate";

/** Full-screen block shown instead of an order-taking screen when the
 * cashier hasn't opened a shift / isn't clocked in / is on break. */
export function ShiftGateBlock({ gate }: { readonly gate: ShiftGateState }) {
  const { C } = useTheme();
  const router = useRouter();
  const s = makeStyles(C);

  const { title, body } = !gate.shiftOpen
    ? { title: "No shift open", body: "Open your shift in Shift & Cash before taking orders." }
    : gate.onBreak
    ? { title: "You're on break", body: "End your break in Shift & Cash to start taking orders again." }
    : { title: "Clock in first", body: "Clock in on Shift & Cash before taking orders." };

  return (
    <View style={s.wrap}>
      <View style={s.iconWrap}>
        <Feather name="lock" size={22} color={C.ink4} />
      </View>
      <Text style={s.title}>{title}</Text>
      <Text style={s.body}>{body}</Text>
      <Pressable style={s.btn} onPress={() => router.push("/pos/shift" as any)}>
        <Text style={s.btnTxt}>Go to Shift &amp; Cash</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8, backgroundColor: C.bg },
  iconWrap: {
    width: 48, height: 48, borderRadius: 24, marginBottom: 8,
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
  },
  title: { color: C.ink, fontSize: 16, fontWeight: "700" },
  body:  { color: C.ink3, fontSize: 13, textAlign: "center", maxWidth: 280, lineHeight: 18 },
  btn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 12, borderRadius: R.md, backgroundColor: C.amber },
  btnTxt: { color: "#000000", fontSize: 14, fontWeight: "700" },
});

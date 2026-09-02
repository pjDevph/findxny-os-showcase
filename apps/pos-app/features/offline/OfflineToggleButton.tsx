/**
 * Compact header icon button for the offline-simulation override — see
 * networkStatus.ts's forcedOffline. Deliberately icon-only with no label,
 * matching every other button in the header row (fullscreen, refresh):
 * a "Simulate Offline" text pill read as a real, permanent feature toggle
 * sitting in the middle of the screen. As a small wifi/wifi-off icon next to
 * the other utility buttons, it reads the same way they do — a quick
 * control, not a setting — and the icon alone is self-explanatory (wifi-off
 * = go offline) without needing a caption.
 */
import { Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useIsForcedOffline, setForcedOffline } from "./networkStatus";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

export function OfflineToggleButton() {
  const forced = useIsForcedOffline();
  const { C } = useTheme();
  const s = makeStyles(C, forced);

  return (
    <Pressable
      style={s.btn}
      onPress={() => setForcedOffline(!forced)}
      hitSlop={8}
      accessibilityLabel={forced ? "Testing: offline simulation on — tap to go back online" : "Testing: simulate offline"}
    >
      <Feather name={forced ? "wifi-off" : "wifi"} size={15} color={forced ? "#fff" : C.ink3} />
    </Pressable>
  );
}

type C = ReturnType<typeof useTheme>["C"];
const makeStyles = (C: C, forced: boolean) => StyleSheet.create({
  btn: {
    width: 30, height: 30, borderRadius: R.md,
    alignItems: "center", justifyContent: "center",
    backgroundColor: forced ? C.bad : C.surface,
    borderWidth: 1, borderColor: forced ? C.bad : C.line,
  },
});

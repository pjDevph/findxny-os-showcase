import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";
import type { CurrentStatus } from "./types";

interface Props {
  readonly currentStatus: CurrentStatus;
  readonly onClockIn: () => void;
  readonly onClockOut: () => void;
  readonly onBreakIn: () => void;
  readonly onBreakOut: () => void;
}

export function ClockButtonRow({ currentStatus, onClockIn, onClockOut, onBreakIn, onBreakOut }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  return (
    <View style={s.row}>
      {currentStatus === "clocked_out" && (
        <Pressable style={[s.btn, { backgroundColor: C.good }]} onPress={onClockIn}>
          <Text style={s.btnText}>Clock In</Text>
        </Pressable>
      )}
      {currentStatus === "clocked_in" && (
        <>
          <Pressable style={[s.btn, { backgroundColor: C.amber }]} onPress={onBreakIn}>
            <Text style={s.btnText}>Start Break</Text>
          </Pressable>
          <Pressable style={[s.btn, { backgroundColor: C.bad }]} onPress={onClockOut}>
            <Text style={s.btnText}>Clock Out</Text>
          </Pressable>
        </>
      )}
      {currentStatus === "on_break" && (
        <Pressable style={[s.btn, { backgroundColor: C.info }]} onPress={onBreakOut}>
          <Text style={s.btnText}>End Break</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  btn: { flex: 1, paddingVertical: 11, borderRadius: R.md, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#000000", fontSize: 13, fontWeight: "700" },
});

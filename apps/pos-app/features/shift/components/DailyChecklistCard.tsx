import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { R } from "../../theme/tokens";
import type { Checklist } from "../types";

interface Props {
  readonly checklists: readonly Checklist[];
  readonly onCompleteItem: (checklistId: string, itemId: string, alreadyDone: boolean) => void;
  readonly onRefresh: () => void;
}

export function DailyChecklistCard({ checklists, onCompleteItem, onRefresh }: Props) {
  const { C } = useTheme();
  const s = styles(C);

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>Daily Checklist</Text>
      {checklists.length === 0 ? (
        <Text style={{ color: C.ink4, fontSize: 13 }}>No checklists configured. Set them up in the admin panel.</Text>
      ) : (
        checklists.map(checklist => (
          <View key={checklist.id} style={{ marginBottom: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: C.ink2, marginBottom: 6 }}>{checklist.name}</Text>
            {(checklist.items ?? []).map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => onCompleteItem(checklist.id, item.id, item.completed)}
                style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}
              >
                <View style={{
                  width: 20, height: 20, borderRadius: 4, borderWidth: 2,
                  borderColor: item.completed ? "#10b981" : C.line,
                  backgroundColor: item.completed ? "#10b981" : "transparent",
                  alignItems: "center", justifyContent: "center", marginRight: 10,
                }}>
                  {item.completed && <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>✓</Text>}
                </View>
                <Text style={{ fontSize: 13, color: item.completed ? C.ink4 : C.ink, textDecorationLine: item.completed ? "line-through" : "none" }}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))
      )}
      <TouchableOpacity onPress={onRefresh} style={{ marginTop: 4, alignSelf: "flex-end" }}>
        <Text style={{ fontSize: 11, color: C.amber }}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 16, gap: 12 },
  cardTitle: { color: C.ink, fontSize: 16, fontWeight: "600" },
});

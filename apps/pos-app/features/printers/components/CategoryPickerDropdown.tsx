import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AnchoredDropdown } from "../../ui/AnchoredDropdown";
import type { useAnchoredDropdown } from "../../ui/useAnchoredDropdown";
import { useTheme } from "../../theme/ThemeContext";
import type { makeStyles } from "../printersScreenStyles";
import type { Category } from "../types";

interface Props {
  readonly dropdown: ReturnType<typeof useAnchoredDropdown>;
  readonly categories: Category[];
  readonly selectedCategory: string;
  readonly onToggle: (name: string) => void;
  readonly onClear: () => void;
  readonly s: ReturnType<typeof makeStyles>;
}

export function CategoryPickerDropdown({ dropdown, categories, selectedCategory, onToggle, onClear, s }: Props) {
  const { C } = useTheme();
  const selectedNames = selectedCategory.split(",").map(n => n.trim()).filter(Boolean);

  return (
    <AnchoredDropdown visible={dropdown.visible} position={dropdown.position} onClose={dropdown.close} maxHeight={310}>
      <Pressable style={[s.ddItem, !selectedCategory && s.ddItemActive]} onPress={onClear}>
        <Text style={[s.ddItemTxt, !selectedCategory && { color: C.amber, fontWeight: "700" }]}>
          All items (no filter)
        </Text>
      </Pressable>
      {categories.map(cat => {
        const selected = selectedNames.includes(cat.name);
        return (
          <Pressable key={cat.id} style={[s.ddItem, selected && s.ddItemActive]} onPress={() => onToggle(cat.name)}>
            {cat.color && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cat.color }} />}
            <Text style={[s.ddItemTxt, selected && { color: C.amber, fontWeight: "700" }]}>{cat.name}</Text>
            {selected && <Feather name="check" size={14} color={C.amber} style={{ marginLeft: "auto" }} />}
          </Pressable>
        );
      })}
      {categories.length === 0 && (
        <Text style={[s.ddItemTxt, { color: C.ink4, padding: 12 }]}>No categories found</Text>
      )}
      <Pressable
        style={{ padding: 12, borderTopWidth: 1, borderTopColor: C.line, alignItems: "center" }}
        onPress={dropdown.close}
      >
        <Text style={{ color: C.amber, fontWeight: "700", fontSize: 14 }}>Done</Text>
      </Pressable>
    </AnchoredDropdown>
  );
}

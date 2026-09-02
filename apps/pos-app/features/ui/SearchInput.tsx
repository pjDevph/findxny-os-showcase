/**
 * SearchInput — search icon + text input + clear-X.
 *
 * Replaces near-identical copies in products.tsx, staff.tsx and
 * transactions.tsx's list toolbars.
 */
import { View, TextInput, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  readonly value: string;
  readonly onChangeText: (v: string) => void;
  readonly placeholder?: string;
  readonly autoFocus?: boolean;
}

export function SearchInput({ value, onChangeText, placeholder = "Search…", autoFocus }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  return (
    <View style={s.wrap}>
      <Feather name="search" size={15} color={C.ink3} />
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.ink4}
        autoFocus={autoFocus}
        autoCapitalize="none"
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText("")} hitSlop={8}>
          <Feather name="x" size={15} color={C.ink3} />
        </Pressable>
      )}
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  input: { flex: 1, color: C.ink, fontSize: 14, padding: 0 },
});

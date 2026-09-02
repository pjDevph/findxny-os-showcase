import { Pressable, Text, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { R } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeContext";
import { MONO } from "../../theme/mono";
import { peso } from "../../order/format";
import { pct } from "../productsHelpers";
import type { RecipeLine } from "../types";

interface Props {
  readonly recipe: readonly RecipeLine[];
  readonly recipeCogs: number;
  readonly formPrice: number;
  readonly canWrite: boolean;
  readonly onAddIngredient: () => void;
  readonly onRemoveLine: (line: RecipeLine) => void;
}

export function RecipeEditor({ recipe, recipeCogs, formPrice, canWrite, onAddIngredient, onRemoveLine }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  const margin = formPrice > 0 ? ((formPrice - recipeCogs) / formPrice) * 100 : 0;

  return (
    <>
      <View style={s.header}>
        <Feather name="git-branch" size={13} color={C.info} />
        <Text style={s.title}>Recipe / Ingredients</Text>
        {recipe.length > 0 && (
          <View style={s.cogsPill}>
            <Text style={s.cogsPillTxt}>Cost {peso(recipeCogs)}</Text>
            {formPrice > 0 && (
              <Text style={[s.cogsPillTxt, { color: margin >= 0 ? C.good : C.bad }]}>
                {"  "}{pct(margin)} margin
              </Text>
            )}
          </View>
        )}
      </View>
      {recipe.length > 0 && (
        <View style={s.list}>
          {recipe.map(line => (
            <View key={line.catalog_id} style={s.line}>
              <View style={{ flex: 1 }}>
                <Text style={s.ingName}>{line.ingredient_name}</Text>
                <Text style={s.ingDetail}>
                  {line.quantity} {line.unit}  ·  {peso(line.cost_per_unit)}/{line.unit}
                  {"  =  "}
                  <Text style={{ color: C.amber }}>{peso(line.quantity * line.cost_per_unit)}</Text>
                </Text>
              </View>
              {canWrite && (
                <Pressable onPress={() => onRemoveLine(line)} hitSlop={8}>
                  <Feather name="x" size={15} color={C.bad} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}
      {canWrite && (
        <Pressable style={s.addBtn} onPress={onAddIngredient}>
          <Feather name="plus" size={13} color={C.info} />
          <Text style={s.addBtnTxt}>Add Ingredient</Text>
        </Pressable>
      )}
    </>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14 },
  title: { color: C.ink, fontSize: 14, fontWeight: "700", flex: 1 },
  cogsPill: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.full, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 4 },
  cogsPillTxt: { color: C.ink3, fontSize: 11, fontFamily: MONO },
  list: { borderRadius: R.md, borderWidth: 1, borderColor: C.line, overflow: "hidden" },
  line: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  ingName: { color: C.ink, fontSize: 13, fontWeight: "600" },
  ingDetail: { color: C.ink4, fontSize: 11, fontFamily: MONO, marginTop: 2 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: R.md, borderWidth: 1, borderStyle: "dashed", borderColor: C.info, backgroundColor: `${C.info}08` },
  addBtnTxt: { color: C.info, fontSize: 13, fontWeight: "600" },
});

import { Pressable, Text, View, StyleSheet } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { MONO } from "../../theme/mono";
import { ActionSheetModal, type ActionSheetItem } from "../../ui/ActionSheetModal";
import type { Product } from "../types";

interface Props {
  readonly product: Product | null;
  readonly onClose: () => void;
  readonly onEdit: (p: Product) => void;
  readonly onRestore: (p: Product) => void;
  readonly onToggleVisibility: (p: Product, patch: { active?: boolean; for_sale?: boolean }) => void;
  readonly onArchive: (p: Product) => void;
}

export function ProductActionMenu({ product, onClose, onEdit, onRestore, onToggleVisibility, onArchive }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  if (!product) return null;

  const header = (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        <Text style={s.name} numberOfLines={1}>{product.name}</Text>
        {product.archived ? (
          <View style={s.statusRow}>
            <View style={[s.dot, { backgroundColor: C.bad }]} />
            <Text style={s.statusTxt}>Archived</Text>
          </View>
        ) : (
          <View style={s.statusRow}>
            <View style={s.statusGroup}>
              <View style={[s.dot, { backgroundColor: product.active ? C.good : C.ink4 }]} />
              <Text style={s.statusTxt}>POS</Text>
            </View>
            <View style={s.statusGroup}>
              <View style={[s.dot, { backgroundColor: product.for_sale ? C.good : C.ink4 }]} />
              <Text style={s.statusTxt}>Web</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );

  const actions: ActionSheetItem[] = product.archived
    ? [
        {
          key: "restore", label: "Restore product",
          sub: "Brings it back to your catalog (still hidden from POS/web until you enable it)",
          icon: "rotate-ccw", iconBg: `${C.good}18`,
          onPress: () => onRestore(product),
        },
      ]
    : [
        { key: "edit", label: "Edit product", icon: "edit-2", iconBg: `${C.info}18`, onPress: () => onEdit(product) },
        {
          key: "toggle-pos", label: product.active ? "Hide from POS" : "Show on POS",
          sub: "Cashier ordering screen only",
          icon: product.active ? "eye-off" : "eye", iconBg: product.active ? `${C.warn}18` : `${C.good}18`,
          dividerBefore: true,
          onPress: () => onToggleVisibility(product, { active: !product.active }),
        },
        {
          key: "toggle-web", label: product.for_sale ? "Hide from web menu" : "Show on web menu",
          sub: "Public menu site only",
          icon: product.for_sale ? "eye-off" : "eye", iconBg: product.for_sale ? `${C.warn}18` : `${C.good}18`,
          onPress: () => onToggleVisibility(product, { for_sale: !product.for_sale }),
        },
        {
          key: "toggle-both", label: (product.active && product.for_sale) ? "Hide from both" : "Show on both",
          sub: "POS and web menu together",
          icon: (product.active && product.for_sale) ? "eye-off" : "eye", iconBg: `${C.ink4}18`,
          onPress: () => onToggleVisibility(product, { active: !(product.active && product.for_sale), for_sale: !(product.active && product.for_sale) }),
        },
        {
          key: "archive", label: "Archive product", sub: "Removes from catalog, POS & web — order history kept",
          icon: "archive", iconBg: `${C.bad}18`, destructive: true, dividerBefore: true,
          onPress: () => onArchive(product),
        },
      ];

  return <ActionSheetModal visible={!!product} onClose={onClose} header={header} actions={actions} />;
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
  },
  name: { color: C.ink, fontSize: 15, fontWeight: "700" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 5 },
  statusGroup: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  statusTxt: { color: C.ink4, fontSize: 11.5, fontFamily: MONO },
});

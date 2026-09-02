import { Modal, Pressable, Text, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { R } from "../../theme/tokens";
import { roleColor, type WorkspaceRole } from "../types";

interface Props {
  readonly visible: boolean;
  readonly roleFilter: WorkspaceRole | "all";
  readonly onClose: () => void;
  readonly onSelect: (role: WorkspaceRole | "all") => void;
}

const ALL_ROLE_OPTIONS: { key: WorkspaceRole | "all"; label: string }[] = [
  { key: "all", label: "All Roles" },
  { key: "owner", label: "Owner" },
  { key: "admin", label: "Admin" },
  { key: "manager", label: "Manager" },
  { key: "cashier", label: "Cashier" },
  { key: "kitchen", label: "Kitchen" },
];

export function RoleFilterModal({ visible, roleFilter, onClose, onSelect }: Props) {
  const { C } = useTheme();
  const s = styles(C);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.modalBd} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <View style={s.head}>
            <Text style={s.title}>Filter by Role</Text>
            <Pressable hitSlop={10} onPress={onClose}>
              <Feather name="x" size={18} color={C.ink3} />
            </Pressable>
          </View>
          {ALL_ROLE_OPTIONS.map((opt, idx) => {
            const rc = opt.key === "all" ? C.ink3 : roleColor(C, opt.key);
            const active = roleFilter === opt.key;
            return (
              <Pressable key={opt.key}
                style={[s.row, idx < ALL_ROLE_OPTIONS.length - 1 && s.rowDivider, active && { backgroundColor: `${rc}10` }]}
                onPress={() => { onSelect(opt.key); onClose(); }}>
                {opt.key === "all"
                  ? <Feather name="users" size={12} color={active ? C.ink : C.ink4} />
                  : <View style={[s.dot, { backgroundColor: rc }]} />
                }
                <Text style={[s.label, { color: active ? (opt.key === "all" ? C.ink : rc) : C.ink3, fontWeight: active ? "700" : "500" }]}>
                  {opt.label}
                </Text>
                {active && <Feather name="check" size={16} color={opt.key === "all" ? C.ink : rc} />}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  modalBd: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 16 },
  card: { backgroundColor: C.bg2, borderRadius: R.xl, overflow: "hidden", width: "100%", maxWidth: 320 },
  head: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  title: { color: C.ink, fontSize: 17, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: C.line },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { flex: 1, fontSize: 14 },
});

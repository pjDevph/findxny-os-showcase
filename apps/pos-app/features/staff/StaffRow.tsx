import { Pressable, Text, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { MONO } from "../theme/mono";
import { initials } from "./staffHelpers";
import { roleColor, type StaffMember } from "./types";

interface Props {
  readonly member: StaffMember;
  readonly isMe: boolean;
  readonly isSelected: boolean;
  readonly onPress: () => void;
}

export function StaffRow({ member, isMe, isSelected, onPress }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  const rc = roleColor(C, member.role);
  const name = member.full_name || "Unnamed Staff";
  const uname = member.username ? `@${member.username}` : "no username";

  return (
    <Pressable style={[s.row, isSelected && s.rowSelected]} onPress={onPress}>
      <View style={[s.avatar, { backgroundColor: `${rc}20` }]}>
        <Text style={[s.avatarText, { color: rc }]}>{initials(name)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={s.name} numberOfLines={1}>{name}</Text>
          {isMe && <Text style={s.youTag}>you</Text>}
        </View>
        <Text style={s.meta}>{uname}</Text>
        <View style={[s.rolePill, { backgroundColor: `${rc}18`, borderColor: `${rc}40`, alignSelf: "flex-start", marginTop: 2 }]}>
          <Text style={[s.rolePillText, { color: rc }]}>{member.role}</Text>
        </View>
      </View>
      {isSelected && <Feather name="chevron-right" size={14} color={C.amber} />}
    </Pressable>
  );
}

export function StaffListSeparator() {
  const { C } = useTheme();
  return <View style={{ height: 1, backgroundColor: C.lineSoft, marginHorizontal: 10 }} />;
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 11 },
  rowSelected: { backgroundColor: `${C.amber}0D` },
  avatar: { width: 40, height: 40, borderRadius: R.full, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarText: { fontSize: 13, fontWeight: "700" },
  name: { color: C.ink, fontSize: 13, fontWeight: "600" },
  meta: { color: C.ink4, fontSize: 11, fontFamily: MONO },
  youTag: {
    color: C.ink4, fontSize: 9, fontFamily: MONO,
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: R.full, borderWidth: 1, borderColor: C.line,
  },
  rolePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.full, borderWidth: 1 },
  rolePillText: { fontSize: 9, fontWeight: "700", fontFamily: MONO, textTransform: "uppercase" },
});

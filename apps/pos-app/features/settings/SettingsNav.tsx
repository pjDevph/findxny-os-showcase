import { View, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import type { makeStyles } from "./settingsScreenStyles";
import type { SectionDef, SectionId } from "./types";

interface Props {
  readonly sections: readonly SectionDef[];
  readonly isWide: boolean;
  readonly activeId: SectionId | null;
  readonly getStatus: (id: SectionId) => { text: string; warn?: boolean };
  readonly onNavigate: (id: SectionId) => void;
  readonly s: ReturnType<typeof makeStyles>;
}

export function SettingsNav({ sections, isWide, activeId, getStatus, onNavigate, s }: Props) {
  const { C } = useTheme();

  return (
    <View style={isWide ? s.rail : undefined}>
      {sections.map((sec) => {
        const active = isWide ? activeId === sec.id : false;
        const st = getStatus(sec.id);
        return (
          <Pressable
            key={sec.id}
            style={[isWide ? s.railItem : s.listCard, active && s.railItemActive]}
            onPress={() => onNavigate(sec.id)}
          >
            <View style={[s.navIcon, active && { backgroundColor: `${C.amber}1f`, borderColor: `${C.amber}55` }]}>
              <Feather name={sec.icon} size={15} color={active ? C.amber : C.ink3} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.navLabel, active && { color: C.ink }]} numberOfLines={1}>{sec.label}</Text>
              {!!st.text && (
                <Text style={[s.navStatus, st.warn && { color: C.bad }]} numberOfLines={1}>{st.text}</Text>
              )}
            </View>
            {!isWide && <Feather name="chevron-right" size={16} color={C.ink4} />}
          </Pressable>
        );
      })}
    </View>
  );
}

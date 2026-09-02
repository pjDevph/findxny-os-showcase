import type { ComponentProps, ReactNode } from "react";
import { View, Text, Pressable, Image } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import type { makeStyles } from "./settingsScreenStyles";

type C = ReturnType<typeof useTheme>["C"];
type S = ReturnType<typeof makeStyles>;

interface Props {
  readonly id: string;
  readonly title: string;
  readonly logo?: ReturnType<typeof require>;
  readonly icon?: { name: ComponentProps<typeof Feather>["name"]; bg: string };
  readonly ready: boolean;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
  readonly C: C;
  readonly s: S;
}

export function PayAccordion({ title, logo, icon, ready, expanded, onToggle, children, C, s }: Props) {
  return (
    <View style={s.payCard}>
      <Pressable style={s.payHead} onPress={onToggle}>
        {logo
          ? <Image source={logo} style={s.payBadge} resizeMode="cover" />
          : (
            <View style={[s.payBadge, { backgroundColor: icon?.bg ?? C.ink4, alignItems: "center", justifyContent: "center" }]}>
              {icon && <Feather name={icon.name} size={16} color="#fff" />}
            </View>
          )}
        <Text style={s.payMethodTitle}>{title}</Text>
        <View style={{ flex: 1 }} />
        <View style={[s.readyChip, { backgroundColor: ready ? `${C.good}22` : `${C.ink4}22` }]}>
          <Text style={[s.readyTxt, { color: ready ? C.good : C.ink3 }]}>{ready ? "Ready" : "Not set"}</Text>
        </View>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={18} color={C.ink3} />
      </Pressable>
      {expanded && <View style={s.payBody}>{children}</View>}
    </View>
  );
}

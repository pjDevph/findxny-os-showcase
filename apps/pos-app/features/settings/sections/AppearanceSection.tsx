import { View, Text, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { SectionLabel } from "../SettingsCard";
import type { makeStyles } from "../settingsScreenStyles";

const FONT_PRESETS = [
  { label: "Small", size: 11, scale: 0.85 },
  { label: "Normal", size: 14, scale: 1.0 },
  { label: "Large", size: 17, scale: 1.15 },
  { label: "X-Large", size: 20, scale: 1.3 },
];

interface Props {
  readonly s: ReturnType<typeof makeStyles>;
}

export function AppearanceSection({ s }: Props) {
  const { C, themeId, themes, setThemeId, fontScale, setFontScale, mode, setMode } = useTheme();

  return (
    <>
      <SectionLabel label="Mode" />
      <View style={s.fontRow}>
        {(["light", "dark"] as const).map((m) => {
          const active = mode === m;
          return (
            <Pressable key={m} style={[s.fontChip, active && { borderColor: C.amber, backgroundColor: `${C.amber}18` }]}
              onPress={() => setMode(m)}>
              <Feather name={m === "light" ? "sun" : "moon"} size={16} color={active ? C.amber : C.ink3} />
              <Text style={[s.fontChipLabel, { color: active ? C.amber : C.ink4 }]}>{m === "light" ? "Light" : "Dark"}</Text>
            </Pressable>
          );
        })}
      </View>
      <SectionLabel label="Theme" />
      <View style={s.themeGrid}>
        {themes.map((t) => {
          const active = t.id === themeId;
          return (
            <Pressable key={t.id} style={[s.swatch, active && { borderColor: t.primary, borderWidth: 2 }]}
              onPress={() => setThemeId(t.id)}>
              <View style={[s.swatchDot, { backgroundColor: t.primary }]} />
              <View style={[s.swatchDot2, { backgroundColor: t.secondary }]} />
              <Text style={[s.swatchName, active && { color: C.ink }]} numberOfLines={1}>{t.name}</Text>
              {active && (
                <View style={[s.swatchCheck, { backgroundColor: t.primary }]}>
                  <Feather name="check" size={9} color="#000000" />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <SectionLabel label="Text Size" />
      <View style={s.fontRow}>
        {FONT_PRESETS.map((p) => {
          const active = Math.abs(fontScale - p.scale) < 0.01;
          return (
            <Pressable key={p.scale} style={[s.fontChip, active && { borderColor: C.amber, backgroundColor: `${C.amber}18` }]}
              onPress={() => setFontScale(p.scale)}>
              <Text style={[s.fontChipA, { fontSize: p.size, color: active ? C.amber : C.ink3 }]}>A</Text>
              <Text style={[s.fontChipLabel, { color: active ? C.amber : C.ink4 }]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

/**
 * PermissionPreview — renders what a role can access.
 *
 * Consolidates three near-identical renderings that used to live inline in
 * staff.tsx: the staff-detail "Access Summary" (allow+deny grid for every
 * tab), the role-change modal's preview (allowed-only chips grouped by
 * section), and the add-staff modal's preview (one-line comma summary).
 */
import { Text, View, StyleSheet } from "react-native";
import { canAccessPosRoute } from "../auth/rolePermissions";
import { useTheme } from "../theme/ThemeContext";
import { R } from "../theme/tokens";
import { MONO } from "../theme/mono";
import { getRoleAccessSummary } from "./staffHelpers";
import { PERM_SECTIONS, TAB_LABELS, type WorkspaceRole } from "./types";

interface Props {
  readonly role: WorkspaceRole;
  readonly color: string;
  readonly heading: string;
  readonly headingColor?: string;
  readonly badge?: string;
  /** "chips": allowed-only chips per section. "text": one-line summary. "grid": allow+deny chips for every tab. */
  readonly mode: "chips" | "text" | "grid";
}

export function PermissionPreview({ role, color, heading, headingColor, badge, mode }: Props) {
  const { C } = useTheme();
  const s = styles(C);
  const accent = mode === "grid";

  return (
    <View style={[accent ? s.plainCard : s.accentCard, !accent && { borderColor: `${color}30` }]}>
      <View style={s.head}>
        <Text style={[accent ? s.plainHeading : s.accentHeading, { color: headingColor ?? (accent ? C.ink3 : color) }]}>
          {heading}
        </Text>
        {!!badge && <Text style={[s.badge, { color: headingColor ?? color }]}>{badge}</Text>}
      </View>

      {mode === "text" && <Text style={s.summaryTxt}>{getRoleAccessSummary(role)}</Text>}

      {mode === "chips" && PERM_SECTIONS.map(sec => {
        const allowed = sec.keys.filter(k => canAccessPosRoute(role, k));
        if (!allowed.length) return null;
        return (
          <View key={sec.label} style={{ marginBottom: 7 }}>
            <Text style={s.secLabel}>{sec.label}</Text>
            <View style={s.chipRow}>
              {allowed.map(k => (
                <View key={k} style={[s.chip, { backgroundColor: `${color}12`, borderColor: `${color}28` }]}>
                  <Text style={[s.chipTxt, { color }]}>{TAB_LABELS[k] ?? k}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}

      {mode === "grid" && PERM_SECTIONS.map(sec => (
        <View key={sec.label} style={{ gap: 5 }}>
          <Text style={s.secLabel}>{sec.label}</Text>
          <View style={s.chipRow}>
            {sec.keys.map(k => {
              const ok = canAccessPosRoute(role, k);
              return (
                <View key={k} style={[s.chip, ok ? s.gridChipOk : s.gridChipNo]}>
                  <Text style={ok ? s.gridChipTxtOk : s.gridChipTxtNo}>{TAB_LABELS[k] ?? k}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  accentCard: { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, padding: 12, gap: 8 },
  plainCard: { backgroundColor: C.bg2, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 14, gap: 10 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  accentHeading: { fontSize: 12, fontWeight: "700", fontFamily: MONO },
  plainHeading: { fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", fontFamily: MONO },
  badge: { fontSize: 12, fontWeight: "700", fontFamily: MONO },
  summaryTxt: { color: C.ink3, fontSize: 12, lineHeight: 18 },
  secLabel: { color: C.ink4, fontSize: 9, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", fontFamily: MONO, marginBottom: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.sm, borderWidth: 1 },
  chipTxt: { fontSize: 11, fontWeight: "600" },
  gridChipOk: { backgroundColor: `${C.good}12`, borderColor: `${C.good}28` },
  gridChipNo: { backgroundColor: "transparent", borderColor: `${C.line}60` },
  gridChipTxtOk: { color: C.good, fontSize: 11, fontWeight: "600" },
  gridChipTxtNo: { color: C.ink4, fontSize: 11 },
});

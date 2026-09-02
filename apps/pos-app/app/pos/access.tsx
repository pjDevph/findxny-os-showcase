import {
  View, Text, StyleSheet, ScrollView, Platform, Pressable, useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useMemo } from "react";
import { useTheme } from "../../features/theme/ThemeContext";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { R } from "../../features/theme/tokens";
import { POS_ROUTE_PERMISSIONS, WorkspaceRole } from "../../features/auth/rolePermissions";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });

/* ── Data ─────────────────────────────────────────────────────────── */

const ROLES = [
  {
    key: "owner",
    label: "Owner",
    color: "#D09030",
    desc: "Full workspace control — billing, reports, settings, all operations.",
  },
  {
    key: "admin",
    label: "Admin",
    color: "#60A5E8",
    desc: "Full operations — catalog, staff, reports, settings, orders.",
  },
  {
    key: "manager",
    label: "Manager",
    color: "#4CC38A",
    desc: "Branch control — orders, bookings, catalog, reports. No staff or billing.",
  },
  {
    key: "cashier",
    label: "Cashier",
    color: "#E07858",
    desc: "Sales & bookings — orders, payments, receipts, shift cash.",
  },
  {
    key: "kitchen",
    label: "Kitchen",
    color: "#9B7FE8",
    desc: "Kitchen only — dashboard and kitchen ticket screen.",
  },
] as const;

type RoleKey = typeof ROLES[number]["key"];

const SECTIONS = [
  {
    label: "OVERVIEW",
    rows: [
      { label: "Dashboard", segment: "dashboard" },
      { label: "Costing",   segment: "costing"   },
      { label: "Reports",   segment: "reports"   },
    ],
  },
  {
    label: "SALES",
    rows: [
      { label: "Orders",       segment: "order"        },
      { label: "Counter",      segment: "counter"      },
      { label: "Transactions", segment: "transactions" },
      { label: "Receipts",     segment: "receipts"     },
      { label: "Shift & Cash", segment: "shift"        },
    ],
  },
  {
    label: "BOOKINGS",
    rows: [
      { label: "Room Bookings",    segment: "book-room"    },
      { label: "Amenity Bookings", segment: "book-amenity" },
      { label: "Resources",        segment: "resources"    },
    ],
  },
  {
    label: "CATALOG",
    rows: [
      { label: "Products",  segment: "products"  },
      { label: "Inventory", segment: "inventory" },
    ],
  },
  {
    label: "PEOPLE",
    rows: [{ label: "Staff", segment: "staff" }],
  },
  {
    label: "SYSTEM",
    rows: [
      { label: "Kitchen",       segment: "kitchen"  },
      { label: "Printers",      segment: "printers" },
      { label: "Audit Log",     segment: "audit"    },
      { label: "Settings",      segment: "settings" },
      { label: "Access Matrix", segment: "access"   },
    ],
  },
];

const ALL_ROWS = SECTIONS.flatMap(s => s.rows);
const TOTAL = ALL_ROWS.length;

function canAccess(segment: string, role: string) {
  const allowed = POS_ROUTE_PERMISSIONS[segment];
  if (!allowed) return true;
  return allowed.includes(role as WorkspaceRole);
}

function countAccess(role: string) {
  return ALL_ROWS.filter(r => canAccess(r.segment, role)).length;
}

type ViewMode = "role" | "matrix";
type C = ReturnType<typeof useTheme>["C"];

/* ── Screen ───────────────────────────────────────────────────────── */

export default function AccessMatrixScreen() {
  const { C } = useTheme();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();

  const [viewMode, setViewMode] = useState<ViewMode>("role");
  const [selectedRole, setSelectedRole] = useState<RoleKey>("cashier");

  const role = ROLES.find(r => r.key === selectedRole)!;

  return (
    <View style={s.root}>
      <PosScreenHeader
        title="Access Matrix"
        right={
          <View style={s.viewToggle}>
            <Pressable
              style={[s.toggleBtn, viewMode === "role" && s.toggleBtnActive]}
              onPress={() => setViewMode("role")}
            >
              <Text style={[s.toggleBtnText, viewMode === "role" && s.toggleBtnTextActive]}>Role View</Text>
            </Pressable>
            <Pressable
              style={[s.toggleBtn, viewMode === "matrix" && s.toggleBtnActive]}
              onPress={() => setViewMode("matrix")}
            >
              <Text style={[s.toggleBtnText, viewMode === "matrix" && s.toggleBtnTextActive]}>Matrix</Text>
            </Pressable>
          </View>
        }
      />

      {viewMode === "role" ? (
        isTablet
          ? <TabletRoleView s={s} C={C} selectedRole={selectedRole} setSelectedRole={setSelectedRole} role={role} insetBottom={insets.bottom} />
          : <PhoneRoleView  s={s} C={C} selectedRole={selectedRole} setSelectedRole={setSelectedRole} role={role} insetBottom={insets.bottom} />
      ) : (
        <MatrixView s={s} C={C} />
      )}
    </View>
  );
}

/* ── Role view — tablet (left list + right detail) ─────────────────── */

function TabletRoleView({ s, C, selectedRole, setSelectedRole, role, insetBottom }: {
  s: ReturnType<typeof makeStyles>; C: C;
  selectedRole: RoleKey; setSelectedRole: (r: RoleKey) => void;
  role: typeof ROLES[number]; insetBottom: number;
}) {
  return (
    <View style={s.splitContainer}>
      {/* Left: role list */}
      <View style={s.leftPanel}>
        <Text style={s.leftPanelHeader}>Roles</Text>
        {ROLES.map(r => {
          const count = countAccess(r.key);
          const active = r.key === selectedRole;
          return (
            <Pressable
              key={r.key}
              style={[s.roleListItem, active && { backgroundColor: `${r.color}18`, borderColor: `${r.color}55` }]}
              onPress={() => setSelectedRole(r.key)}
            >
              <View style={[s.roleListDot, { backgroundColor: r.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={[s.roleListLabel, active && { color: r.color }]}>{r.label}</Text>
                <Text style={s.roleListCount}>{count} of {TOTAL} tabs</Text>
              </View>
              {active && <View style={[s.roleListPip, { backgroundColor: r.color }]} />}
            </Pressable>
          );
        })}
      </View>

      {/* Right: access detail */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.detailContent, { paddingBottom: insetBottom + 40 }]}>
        <RoleDetailHeader s={s} C={C} role={role} />
        <RoleAccessList s={s} C={C} roleKey={selectedRole} />
        <Legend s={s} />
      </ScrollView>
    </View>
  );
}

/* ── Role view — phone (chips + detail below) ───────────────────────── */

function PhoneRoleView({ s, C, selectedRole, setSelectedRole, role, insetBottom }: {
  s: ReturnType<typeof makeStyles>; C: C;
  selectedRole: RoleKey; setSelectedRole: (r: RoleKey) => void;
  role: typeof ROLES[number]; insetBottom: number;
}) {
  return (
    <ScrollView contentContainerStyle={[s.phoneContent, { paddingBottom: insetBottom + 40 }]}>
      {/* Role chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipScroll}
        contentContainerStyle={s.chipRow}>
        {ROLES.map(r => {
          const active = r.key === selectedRole;
          return (
            <Pressable
              key={r.key}
              style={[s.roleChip, active && { backgroundColor: `${r.color}22`, borderColor: r.color }]}
              onPress={() => setSelectedRole(r.key)}
            >
              <View style={[s.roleChipDot, { backgroundColor: r.color }]} />
              <Text style={[s.roleChipLabel, active && { color: r.color }]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <RoleDetailHeader s={s} C={C} role={role} />
      <RoleAccessList s={s} C={C} roleKey={selectedRole} />
      <Legend s={s} />
    </ScrollView>
  );
}

/* ── Shared: role description header ───────────────────────────────── */

function RoleDetailHeader({ s, C, role }: {
  s: ReturnType<typeof makeStyles>; C: C; role: typeof ROLES[number];
}) {
  const count = countAccess(role.key);
  return (
    <View style={[s.detailHeader, { borderLeftColor: role.color }]}>
      <View style={s.detailHeaderTop}>
        <Text style={[s.detailRoleName, { color: role.color }]}>{role.label}</Text>
        <View style={[s.countBadge, { backgroundColor: `${role.color}22`, borderColor: `${role.color}44` }]}>
          <Text style={[s.countBadgeText, { color: role.color }]}>{count} of {TOTAL} tabs</Text>
        </View>
      </View>
      <Text style={s.detailDesc}>{role.desc}</Text>
    </View>
  );
}

/* ── Shared: access list grouped by section ─────────────────────────── */

function RoleAccessList({ s, C, roleKey }: {
  s: ReturnType<typeof makeStyles>; C: C; roleKey: string;
}) {
  return (
    <View style={s.accessList}>
      {SECTIONS.map(section => (
        <View key={section.label} style={s.accessSection}>
          <Text style={s.accessSectionLabel}>{section.label}</Text>
          {section.rows.map(row => {
            const allowed = canAccess(row.segment, roleKey);
            return (
              <View key={row.segment} style={s.accessRow}>
                <Text style={allowed ? s.accessTick : s.accessDash}>
                  {allowed ? "✓" : "—"}
                </Text>
                <Text style={[s.accessTabLabel, !allowed && s.accessTabLabelDim]}>
                  {row.label}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/* ── Matrix view ────────────────────────────────────────────────────── */

function MatrixView({ s, C }: { s: ReturnType<typeof makeStyles>; C: C }) {
  return (
    <View style={{ flex: 1 }}>
      {/* Sticky column headers */}
      <View style={s.matrixHeaderRow}>
        <View style={s.matrixLabelCol}>
          <Text style={s.matrixColHead}>Tab</Text>
        </View>
        {ROLES.map(r => (
          <View key={r.key} style={s.matrixRoleCol}>
            <Text style={[s.matrixColHead, { color: r.color }]}>{r.label}</Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {SECTIONS.map(section => (
          <View key={section.label}>
            <View style={s.matrixSectionRow}>
              <Text style={s.matrixSectionLabel}>{section.label}</Text>
            </View>
            {section.rows.map((row, i) => (
              <View key={row.segment} style={[s.matrixRow, i % 2 === 1 && s.matrixRowAlt]}>
                <View style={s.matrixLabelCol}>
                  <Text style={s.matrixTabLabel}>{row.label}</Text>
                </View>
                {ROLES.map(role => {
                  const allowed = canAccess(row.segment, role.key);
                  return (
                    <View key={role.key} style={s.matrixRoleCol}>
                      <Text style={allowed ? [s.matrixTick, { color: role.color }] : s.matrixDash}>
                        {allowed ? "✓" : "—"}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        ))}
        <Legend s={s} style={{ margin: 16 }} />
      </ScrollView>
    </View>
  );
}

/* ── Legend ─────────────────────────────────────────────────────────── */

function Legend({ s, style }: { s: ReturnType<typeof makeStyles>; style?: object }) {
  return (
    <View style={[s.legend, style]}>
      <View style={s.legendRow}>
        <Text style={s.accessTick}>✓</Text>
        <Text style={s.legendText}>Can access this tab</Text>
      </View>
      <View style={s.legendRow}>
        <Text style={s.accessDash}>—</Text>
        <Text style={s.legendText}>Hidden — redirected away if accessed directly</Text>
      </View>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────────────────── */

const makeStyles = (C: C) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // View mode toggle (in header right slot)
  viewToggle: {
    flexDirection: "row", borderRadius: R.md, overflow: "hidden",
    borderWidth: 1, borderColor: C.line,
  },
  toggleBtn:          { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.surface },
  toggleBtnActive:    { backgroundColor: C.amber },
  toggleBtnText:      { color: C.ink3, fontSize: 12, fontWeight: "600" },
  toggleBtnTextActive:{ color: "#000000", fontSize: 12, fontWeight: "700" },

  // ── Tablet split layout
  splitContainer: { flex: 1, flexDirection: "row" },

  leftPanel: {
    width: 200,
    borderRightWidth: 1, borderRightColor: C.line,
    backgroundColor: C.bg2,
    paddingTop: 8,
  },
  leftPanelHeader: {
    color: C.ink4, fontSize: 9, fontWeight: "700", letterSpacing: 1.2,
    fontFamily: MONO, paddingHorizontal: 14, paddingBottom: 6, paddingTop: 4,
  },
  roleListItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    marginHorizontal: 6, borderRadius: R.md,
    borderWidth: 1, borderColor: "transparent",
    marginBottom: 2,
  },
  roleListDot:   { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  roleListLabel: { color: C.ink2, fontSize: 13, fontWeight: "600" },
  roleListCount: { color: C.ink4, fontSize: 10, marginTop: 1, fontFamily: MONO },
  roleListPip: {
    width: 4, height: 4, borderRadius: 2, flexShrink: 0,
  },

  detailContent: { padding: 20, gap: 16, paddingBottom: 40 },

  // ── Phone layout
  phoneContent: { padding: 16, gap: 16, paddingBottom: 40 },
  chipScroll:   { marginHorizontal: -16, marginBottom: -4 },
  chipRow:      { paddingHorizontal: 16, gap: 8, flexDirection: "row" },
  roleChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: R.full, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.surface,
  },
  roleChipDot:   { width: 7, height: 7, borderRadius: 4 },
  roleChipLabel: { color: C.ink3, fontSize: 13, fontWeight: "600" },

  // ── Role detail header
  detailHeader: {
    backgroundColor: C.bg2, borderRadius: R.lg,
    padding: 16, gap: 6,
    borderWidth: 1, borderColor: C.line,
    borderLeftWidth: 3, borderLeftColor: C.amber,
  },
  detailHeaderTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  detailRoleName:  { color: C.ink, fontSize: 18, fontWeight: "700" },
  countBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: R.full, borderWidth: 1,
  },
  countBadgeText: { fontSize: 11, fontWeight: "700", fontFamily: MONO },
  detailDesc: { color: C.ink3, fontSize: 13, lineHeight: 19 },

  // ── Access list
  accessList: { gap: 8 },
  accessSection: {
    backgroundColor: C.bg2, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line,
    overflow: "hidden",
  },
  accessSectionLabel: {
    color: C.ink4, fontSize: 9, fontWeight: "700", letterSpacing: 1.2,
    fontFamily: MONO, paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: C.surface,
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  accessRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: `${C.line}55`,
  },
  accessTick:         { color: "#4CC38A", fontSize: 14, fontWeight: "700", fontFamily: MONO, width: 16 },
  accessDash:         { color: C.ink4,    fontSize: 14, fontFamily: MONO, width: 16 },
  accessTabLabel:     { color: C.ink2, fontSize: 13 },
  accessTabLabelDim:  { color: C.ink4 },

  // ── Matrix view
  matrixHeaderRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.bg2,
    borderBottomWidth: 1, borderBottomColor: C.line,
    paddingHorizontal: 16,
  },
  matrixSectionRow: {
    backgroundColor: C.surface,
    paddingHorizontal: 16, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: C.line,
    borderTopWidth: 1, borderTopColor: C.line,
  },
  matrixSectionLabel: {
    color: C.ink4, fontSize: 9, fontWeight: "700", letterSpacing: 1.2, fontFamily: MONO,
  },
  matrixRow:    { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 11 },
  matrixRowAlt: { backgroundColor: `${C.surface}66` },
  matrixLabelCol: { flex: 1, minWidth: 130 },
  matrixRoleCol:  { width: 72, alignItems: "center" },
  matrixColHead:  { color: C.ink3, fontSize: 11, fontWeight: "700", textAlign: "center", paddingVertical: 10 },
  matrixTabLabel: { color: C.ink2, fontSize: 13 },
  matrixTick:     { fontSize: 14, fontWeight: "700", fontFamily: MONO },
  matrixDash:     { color: C.ink4, fontSize: 14, fontFamily: MONO },

  // ── Legend
  legend: {
    gap: 8, padding: 14,
    backgroundColor: C.bg2, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line,
  },
  legendRow:  { flexDirection: "row", alignItems: "center", gap: 10 },
  legendText: { color: C.ink3, fontSize: 12 },
});

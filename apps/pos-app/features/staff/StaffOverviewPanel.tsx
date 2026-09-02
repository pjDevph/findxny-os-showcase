import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { MONO } from "../theme/mono";
import { roleColor, ROLE_DESC, type StaffMember, type WorkspaceRole } from "./types";

interface Attendance { clock_in: string; clock_out: string | null }

interface Props {
  readonly allStaff: StaffMember[];
  readonly noUsernameCount: number;
  readonly suspendedCount: number;
  readonly canManage: boolean;
  readonly myAttendance: Attendance | null;
  readonly attendanceBusy: boolean;
  readonly onClockIn: () => void;
  readonly onClockOut: () => void;
  readonly onViewArchived: () => void;
  readonly bottomInset: number;
}

const ROLE_ORDER: WorkspaceRole[] = ["owner", "admin", "manager", "cashier", "kitchen"];

export function StaffOverviewPanel({
  allStaff, noUsernameCount, suspendedCount, canManage,
  myAttendance, attendanceBusy, onClockIn, onClockOut, onViewArchived, bottomInset,
}: Props) {
  const { C } = useTheme();
  const router = useRouter();
  const s = styles(C);
  const clockedIn = !!myAttendance && !myAttendance.clock_out;

  const attentionItems = [
    {
      label: "No login set", sub: "Staff can't log in yet",
      value: noUsernameCount, color: noUsernameCount > 0 ? C.warn : C.ink4, icon: "alert-circle" as const,
    },
    {
      label: "Suspended accounts", sub: "Access currently blocked",
      value: suspendedCount, color: suspendedCount > 0 ? C.amber : C.ink4, icon: "pause-circle" as const,
    },
  ];

  return (
    <ScrollView contentContainerStyle={[s.content, { paddingBottom: bottomInset + 40 }]}>
      <Text style={s.title}>Staff Overview</Text>

      <Text style={s.sectionTitle}>My Attendance</Text>
      <View style={s.card}>
        <View style={[s.row, { borderBottomWidth: 0 }]}>
          <Feather name="clock" size={16} color={clockedIn ? C.good : C.ink4} />
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>
              {clockedIn
                ? `Clocked in at ${new Date(myAttendance!.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Not clocked in"}
            </Text>
            <Text style={s.rowSub}>{clockedIn ? "Tap to end your shift" : "Tap to start your shift"}</Text>
          </View>
          <Pressable
            disabled={attendanceBusy}
            onPress={clockedIn ? onClockOut : onClockIn}
            style={{
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
              backgroundColor: clockedIn ? C.bad : C.good,
              opacity: attendanceBusy ? 0.6 : 1,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{clockedIn ? "Clock Out" : "Clock In"}</Text>
          </Pressable>
        </View>
      </View>

      <Text style={s.sectionTitle}>Needs Attention</Text>
      <View style={s.card}>
        {attentionItems.map((item, idx, arr) => (
          <View key={item.label} style={[s.row, idx === arr.length - 1 && { borderBottomWidth: 0 }]}>
            <Feather name={item.icon} size={16} color={item.value > 0 ? item.color : C.ink4} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>{item.label}</Text>
              <Text style={s.rowSub}>{item.sub}</Text>
            </View>
            <Text style={[s.rowValue, { color: item.value > 0 ? item.color : C.ink4 }]}>{item.value}</Text>
          </View>
        ))}
      </View>

      {canManage && (
        <>
          <Text style={s.sectionTitle}>Quick Actions</Text>
          <View style={s.quickActions}>
            <Pressable style={s.quickAction} onPress={onViewArchived}>
              <Feather name="archive" size={18} color={C.ink3} />
              <Text style={s.quickActionText}>View Archived</Text>
            </Pressable>
            <Pressable style={s.quickAction} onPress={() => router.push("/pos/access" as any)}>
              <Feather name="shield" size={18} color={C.info} />
              <Text style={s.quickActionText}>Access Matrix</Text>
            </Pressable>
            <Pressable style={s.quickAction} onPress={() => router.push("/pos/audit" as any)}>
              <Feather name="activity" size={18} color={C.ink3} />
              <Text style={s.quickActionText}>Audit Log</Text>
            </Pressable>
          </View>
        </>
      )}

      <Text style={s.sectionTitle}>Role Hierarchy</Text>
      <View style={s.card}>
        {ROLE_ORDER.map(r => {
          const rc = roleColor(C, r);
          const count = allStaff.filter(m => m.role === r && !m.is_archived).length;
          return (
            <View key={r} style={s.roleRow}>
              <View style={[s.roleColorBar, { backgroundColor: rc }]} />
              <Text style={[s.roleName, { color: rc, width: 60 }]}>{r.charAt(0).toUpperCase() + r.slice(1)}</Text>
              <Text style={[s.roleCount, { color: rc, width: 22, textAlign: "right" }]}>{count > 0 ? count : "—"}</Text>
              <Text style={[s.roleDesc, { flex: 1 }]} numberOfLines={1}>{ROLE_DESC[r]}</Text>
            </View>
          );
        })}
      </View>

      <Text style={s.sectionTitle}>Access Controls</Text>
      <View style={s.tipCard}>
        <View style={s.tipRow}>
          <Feather name="lock" size={13} color={C.ink4} />
          <Text style={s.tipText}>Only Owner / Admin can add staff or change roles.</Text>
        </View>
        <View style={s.tipRow}>
          <Feather name="user-x" size={13} color={C.ink4} />
          <Text style={s.tipText}>Do not delete staff who made transactions — use Archive instead.</Text>
        </View>
        <View style={s.tipRow}>
          <Feather name="pause-circle" size={13} color={C.ink4} />
          <Text style={s.tipText}>Suspend temporarily blocks login. Archive hides from daily view.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { color: C.ink, fontSize: 20, fontWeight: "700" },
  sectionTitle: { color: C.ink4, fontSize: 9, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", fontFamily: MONO },
  card: { backgroundColor: C.bg2, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: `${C.line}60` },
  rowLabel: { color: C.ink, fontSize: 13, fontWeight: "500" },
  rowSub: { color: C.ink4, fontSize: 11, marginTop: 1 },
  rowValue: { fontSize: 22, fontWeight: "700", fontFamily: MONO, minWidth: 30, textAlign: "right" },
  quickActions: { flexDirection: "row", gap: 10 },
  quickAction: { flex: 1, backgroundColor: C.bg2, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 14, alignItems: "center", gap: 8 },
  quickActionText: { color: C.ink3, fontSize: 11, fontWeight: "600", textAlign: "center" },
  roleRow: { flexDirection: "row", gap: 10, alignItems: "center", paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: `${C.line}60` },
  roleColorBar: { width: 3, height: 14, borderRadius: 2, flexShrink: 0 },
  roleName: { fontSize: 12, fontWeight: "700" },
  roleCount: { fontSize: 11, fontFamily: MONO },
  roleDesc: { color: C.ink4, fontSize: 11 },
  tipCard: { backgroundColor: C.bg2, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, padding: 14, gap: 8 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  tipText: { color: C.ink3, fontSize: 12, lineHeight: 17, flex: 1 },
});

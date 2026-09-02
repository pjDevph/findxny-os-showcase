import { ActivityIndicator, FlatList, Pressable, Text, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { R } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { MONO } from "../theme/mono";
import { SearchInput } from "../ui/SearchInput";
import { StatTileRow } from "../ui/StatTileRow";
import { EmptyState } from "../ui/EmptyState";
import { StaffRow, StaffListSeparator } from "./StaffRow";
import { roleColor, type StatusTab, type StaffMember, type WorkspaceRole } from "./types";

interface Stats { total: number; active: number; suspended: number; archived: number }

interface Props {
  readonly isTablet: boolean;
  readonly stats: Stats;
  readonly statusTab: StatusTab;
  readonly onStatusTabChange: (tab: StatusTab) => void;
  readonly search: string;
  readonly onSearchChange: (v: string) => void;
  readonly roleFilter: WorkspaceRole | "all";
  readonly onOpenRoleFilter: () => void;
  readonly filtered: StaffMember[];
  readonly loading: boolean;
  readonly loadError: string;
  readonly onRetry: () => void;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly myUserId: string | undefined;
}

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "archived", label: "Archived" },
];

export function StaffListPanel({
  isTablet, stats, statusTab, onStatusTabChange, search, onSearchChange,
  roleFilter, onOpenRoleFilter, filtered, loading, loadError, onRetry,
  selectedId, onSelect, myUserId,
}: Props) {
  const { C } = useTheme();
  const s = styles(C);
  const statusCount: Record<StatusTab, number> = { active: stats.active, suspended: stats.suspended, archived: stats.archived };

  return (
    <View style={[s.leftPanel, !isTablet && { flex: 1, width: undefined, borderRightWidth: 0 }]}>
      <View style={{ padding: 10 }}>
        <StatTileRow tiles={[
          { key: "total", label: "TOTAL", value: stats.total },
          { key: "active", label: "ACTIVE", value: stats.active, color: C.good },
          { key: "suspended", label: "SUSPENDED", value: stats.suspended, color: C.warn },
          { key: "archived", label: "ARCHIVED", value: stats.archived, color: C.ink4 },
        ]} />
      </View>

      <View style={s.statusTabRow}>
        {STATUS_TABS.map(tab => (
          <Pressable key={tab.key}
            style={[s.statusTab, statusTab === tab.key && s.statusTabActive]}
            onPress={() => onStatusTabChange(tab.key)}>
            <Text style={[s.statusTabText, statusTab === tab.key && s.statusTabTextActive]}>{tab.label}</Text>
            {statusCount[tab.key] > 0 && (
              <View style={[s.statusCount, statusTab === tab.key && s.statusCountActive]}>
                <Text style={[s.statusCountText, statusTab === tab.key && s.statusCountTextActive]}>{statusCount[tab.key]}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      <View style={{ margin: 10 }}>
        <SearchInput value={search} onChangeText={onSearchChange} placeholder="Search by name or username..." />
      </View>

      <Pressable style={s.roleFilterBtn} onPress={onOpenRoleFilter}>
        <Feather name="filter" size={12} color={roleFilter !== "all" ? roleColor(C, roleFilter) : C.ink4} />
        <Text style={[s.roleFilterBtnText, roleFilter !== "all" && { color: roleColor(C, roleFilter) }]}>
          {roleFilter === "all" ? "All Roles" : roleFilter.charAt(0).toUpperCase() + roleFilter.slice(1)}
        </Text>
        <Feather name="chevron-down" size={12} color={C.ink4} />
      </Pressable>

      {loading ? (
        <View style={s.listCenter}><ActivityIndicator color={C.amber} /></View>
      ) : loadError ? (
        <View style={s.listCenter}>
          <Text style={s.emptyText}>{loadError}</Text>
          <Pressable onPress={onRetry} style={s.retryBtn}>
            <Text style={s.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={m => m.user_id}
          renderItem={({ item }) => (
            <StaffRow
              member={item}
              isMe={item.user_id === myUserId}
              isSelected={selectedId === item.user_id}
              onPress={() => onSelect(item.user_id)}
            />
          )}
          ItemSeparatorComponent={StaffListSeparator}
          contentContainerStyle={filtered.length === 0 ? { flex: 1 } : { paddingVertical: 4 }}
          ListEmptyComponent={
            <EmptyState icon="user-x" title={search ? "No staff match your search" : `No ${statusTab} staff`} />
          }
        />
      )}
    </View>
  );
}

const styles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  leftPanel: { width: 340, flexDirection: "column", borderRightWidth: 1, borderRightColor: C.line, backgroundColor: C.bg },
  statusTabRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line },
  statusTab: { flex: 1, paddingVertical: 9, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 5, borderBottomWidth: 2, borderBottomColor: "transparent" },
  statusTabActive: { borderBottomColor: C.amber },
  statusTabText: { color: C.ink4, fontSize: 11, fontWeight: "600" },
  statusTabTextActive: { color: C.amber },
  statusCount: { backgroundColor: C.surface, borderRadius: R.full, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: C.line },
  statusCountActive: { backgroundColor: `${C.amber}20`, borderColor: `${C.amber}50` },
  statusCountText: { color: C.ink4, fontSize: 9, fontFamily: MONO },
  statusCountTextActive: { color: C.amber },
  roleFilterBtn: {
    flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 10, marginBottom: 10,
    backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  roleFilterBtnText: { color: C.ink3, fontSize: 13, fontWeight: "600", flex: 1 },
  listCenter: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 6 },
  emptyText: { color: C.ink4, fontSize: 13, textAlign: "center" },
  retryBtn: { marginTop: 8, paddingHorizontal: 16, paddingVertical: 8 },
  retryBtnText: { color: C.amber, fontSize: 13, fontWeight: "600" },
});

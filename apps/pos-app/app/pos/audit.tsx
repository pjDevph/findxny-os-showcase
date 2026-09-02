import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
  FlatList, Platform, ScrollView, TextInput, useWindowDimensions, Modal,
} from "react-native";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Feather } from "@expo/vector-icons";
import { invokeFn } from "../../services/supabase";
import { useAuth } from "../../features/auth/AuthContext";
import { useTheme } from "../../features/theme/ThemeContext";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { R } from "../../features/theme/tokens";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PAGE_SIZES } from "../../features/constants";
import { phDateStr, phMonthStartDateStr, phStartOfDayIso } from "../../features/utils/phDate";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
const PAGE = PAGE_SIZES.auditLogEntries;

type DateFilter = "today" | "week" | "month" | "all";
type Severity   = "normal" | "important" | "sensitive" | "warning";
type C = ReturnType<typeof useTheme>["C"];

interface AuditEntry {
  id:          string;
  actor_id:    string | null;
  action:      string;
  entity_type: string;
  entity_id:   string | null;
  before:      Record<string, unknown> | null;
  after:       Record<string, unknown> | null;
  created_at:  string;
}

interface ActorInfo { name: string; username: string; role: string; }
interface Human     { title: string; summary: string; severity: Severity; }

interface ActorMapRow {
  user_id:  string;
  role?:    string | null;
  profiles?: { full_name?: string | null; username?: string | null } | null;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function cap(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function humanizeStaffRoleChange(bf: Record<string, unknown>, af: Record<string, unknown>): Human | null {
  if (bf.role !== undefined && af.role !== undefined && bf.role !== af.role) {
    return { title: "Staff role changed", summary: `${cap(String(bf.role ?? "?"))} → ${cap(String(af.role ?? "?"))}`, severity: "important" };
  }
  return null;
}

function humanizeStaffArchive(af: Record<string, unknown>): Human | null {
  if (af.is_archived === undefined) return null;
  const isArchived = af.is_archived === true || af.is_archived === "true";
  return {
    title:    isArchived ? "Staff archived" : "Staff restored",
    summary:  isArchived ? "Account moved to archive" : "Account restored to active",
    severity: "sensitive",
  };
}

function humanizeStaffSuspension(af: Record<string, unknown>): Human | null {
  if (af.is_suspended === undefined) return null;
  const isSusp = af.is_suspended === true || af.is_suspended === "true";
  return {
    title:    isSusp ? "Staff suspended" : "Staff reactivated",
    summary:  isSusp ? "POS access blocked" : "POS access restored",
    severity: isSusp ? "warning" : "normal",
  };
}

function humanizeStaffUpdate(a: string, af: Record<string, unknown>, bf: Record<string, unknown>): Human {
  return (
    humanizeStaffRoleChange(bf, af) ??
    humanizeStaffArchive(af) ??
    humanizeStaffSuspension(af) ??
    { title: "Staff record updated", summary: "Staff information modified", severity: "normal" }
  );
}

function humanizeStaff(a: string, af: Record<string, unknown>, bf: Record<string, unknown>): Human | null {
  if (a.includes("create")) {
    const who  = af.full_name ?? af.username ?? "New staff";
    const role = af.role ? ` as ${cap(String(af.role))}` : "";
    return { title: "Staff account created", summary: `${who} added${role}`, severity: "important" };
  }
  if (a.includes("pin") || a.includes("reset")) {
    return { title: "PIN reset", summary: "Staff login PIN was changed", severity: "sensitive" };
  }
  if (a.includes("update") || a.includes("edit")) {
    return humanizeStaffUpdate(a, af, bf);
  }
  if (a.includes("remove") || a.includes("delete")) {
    return { title: "Staff removed", summary: "Staff account deleted from workspace", severity: "sensitive" };
  }
  return null;
}

function humanizeOrder(a: string, af: Record<string, unknown>): Human | null {
  if (a.includes("cancel")) return { title: "Order cancelled", summary: "Order was cancelled", severity: "warning" };
  if (a.includes("void"))   return { title: "Order voided",    summary: "Order was voided",    severity: "warning" };
  if (a.includes("create")) {
    const total = af.total_amount ?? af.total ?? af.amount;
    return { title: "Order created", summary: total != null ? `Order for ₱${Number(total).toFixed(2)}` : "New order placed", severity: "normal" };
  }
  if (a.includes("update")) {
    const status = af.status ?? af.order_status;
    return { title: "Order updated", summary: status ? `Status → ${cap(String(status))}` : "Order modified", severity: "normal" };
  }
  return null;
}

function humanizeBooking(a: string): Human {
  if (a.includes("create")) return { title: "Booking created",   summary: "New booking placed",      severity: "normal" };
  if (a.includes("cancel")) return { title: "Booking cancelled", summary: "Booking was cancelled",    severity: "warning" };
  if (a.includes("hold"))   return { title: "Booking held",      summary: "Booking hold placed",      severity: "normal" };
  if (a.includes("update")) return { title: "Booking updated",   summary: "Booking details modified", severity: "normal" };
  return { title: "Booking event", summary: "Booking record changed", severity: "normal" };
}

function humanizeProduct(a: string, af: Record<string, unknown>, bf: Record<string, unknown>): Human | null {
  if (a.includes("create")) {
    return { title: "Product added",   summary: af.name ? `${af.name} added to catalog` : "New product created",  severity: "normal" };
  }
  if (a.includes("delete")) {
    return { title: "Product deleted", summary: bf.name ? `${bf.name} removed` : "Product removed from catalog",   severity: "warning" };
  }
  if (a.includes("update")) {
    if (bf.price != null && af.price != null && bf.price !== af.price) {
      return { title: "Product price changed", summary: `₱${Number(bf.price).toFixed(2)} → ₱${Number(af.price).toFixed(2)}`, severity: "important" };
    }
    return { title: "Product updated", summary: af.name ? `${af.name} modified` : "Product record modified", severity: "normal" };
  }
  return null;
}

function humanizePayment(a: string, af: Record<string, unknown>): Human {
  if (a.includes("refund")) return { title: "Refund issued", summary: "Payment refund processed", severity: "warning" };
  const amt = af.amount ?? af.total;
  return { title: "Payment recorded", summary: amt != null ? `₱${Number(amt).toFixed(2)} payment processed` : "Payment recorded", severity: "normal" };
}

function humanizeShift(a: string): Human {
  if (a.includes("open"))  return { title: "Shift opened", summary: "Cash register shift started", severity: "normal" };
  if (a.includes("close")) return { title: "Shift closed", summary: "Cash register shift ended",   severity: "normal" };
  return { title: "Shift event", summary: "Shift record updated", severity: "normal" };
}

function humanizeKitchen(a: string): Human {
  const verb  = a.split(".")[1] ?? "";
  const label = verb ? cap(verb) : "updated";
  return { title: "Kitchen ticket updated", summary: `Ticket moved to ${label}`, severity: "normal" };
}

function humanizeInventory(af: Record<string, unknown>, bf: Record<string, unknown>): Human {
  const name = af.name ?? bf.name ?? "";
  return { title: "Inventory adjusted", summary: name ? `${name} stock updated` : "Stock level modified", severity: "important" };
}

function humanizeSetting(): Human {
  return { title: "Settings changed", summary: "Workspace settings modified", severity: "important" };
}

function humanizeFallback(e: AuditEntry): Human {
  const et    = e.entity_type.toLowerCase();
  const parts = e.action.split(".");
  const entityLabel = cap(parts[0] ?? et);
  const verbLabel   = parts[1] ? cap(parts[1]) : "";
  return { title: verbLabel ? `${entityLabel} ${verbLabel}` : entityLabel, summary: `${cap(et)} record updated`, severity: "normal" };
}

function humanize(e: AuditEntry): Human { // NOSONAR
  const a  = e.action.toLowerCase();
  const et = e.entity_type.toLowerCase();
  const af = e.after  ?? {};
  const bf = e.before ?? {};

  if (et.includes("workspace_member") || a.startsWith("staff")) {
    return humanizeStaff(a, af, bf) ?? { title: "Staff event", summary: "Staff record changed", severity: "normal" };
  }
  if (et.includes("order") || a.startsWith("order")) {
    return humanizeOrder(a, af) ?? humanizeFallback(e);
  }
  if (et.includes("kitchen") || a.startsWith("kitchen")) {
    return humanizeKitchen(a);
  }
  if (et.includes("booking") || a.startsWith("booking")) {
    return humanizeBooking(a);
  }
  if (et.includes("product") || a.startsWith("product")) {
    return humanizeProduct(a, af, bf) ?? humanizeFallback(e);
  }
  if (et.includes("inventory") || et.includes("ingredient") || a.startsWith("inventory") || a.startsWith("stock")) {
    return humanizeInventory(af, bf);
  }
  if (et.includes("payment") || a.startsWith("payment")) {
    return humanizePayment(a, af);
  }
  if (et.includes("shift") || a.startsWith("shift")) {
    return humanizeShift(a);
  }
  if (et.includes("setting") || a.includes("setting")) {
    return humanizeSetting();
  }
  return humanizeFallback(e);
}

function matchesEntityOrAction(et: string, a: string, entityKey: string, actionPrefix: string): boolean {
  return et.includes(entityKey) || a.startsWith(actionPrefix);
}

function entryIcon(e: AuditEntry): React.ComponentProps<typeof Feather>["name"] {
  const a  = e.action.toLowerCase();
  const et = e.entity_type.toLowerCase();
  if (matchesEntityOrAction(et, a, "workspace_member", "staff")) return "users";
  if (matchesEntityOrAction(et, a, "order",            "order")) return "shopping-bag";
  if (matchesEntityOrAction(et, a, "booking",          "booking")) return "calendar";
  if (matchesEntityOrAction(et, a, "product",          "product")) return "box";
  if (et.includes("inventory") || et.includes("ingredient"))       return "layers";
  if (matchesEntityOrAction(et, a, "payment",          "payment")) return "credit-card";
  if (matchesEntityOrAction(et, a, "kitchen",          "kitchen")) return "cpu";
  if (matchesEntityOrAction(et, a, "shift",            "shift"))   return "dollar-sign";
  if (a.includes("pin"))                                           return "key";
  return "activity";
}

function sevColor(sev: Severity, C: C): string {
  switch (sev) {
    case "warning":   return C.warn;
    case "sensitive": return C.rust;
    case "important": return C.info;
    default:          return C.ink3;
  }
}

function sevIcon(sev: Severity): React.ComponentProps<typeof Feather>["name"] {
  switch (sev) {
    case "warning":   return "alert-triangle";
    case "sensitive": return "lock";
    case "important": return "info";
    default:          return "activity";
  }
}

function fmtShort(iso: string): string {
  const d = new Date(iso);
  const isToday = d.toDateString() === new Date().toDateString();
  if (isToday) return d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtFull(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    weekday: "short", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function rangeStart(f: DateFilter): string | null {
  if (f === "all") return null;
  if (f === "today") return phStartOfDayIso(phDateStr(0));
  if (f === "week")  return phStartOfDayIso(phDateStr(-6));
  return phStartOfDayIso(phMonthStartDateStr());
}

const SKIP_FIELDS = new Set(["workspace_id", "id", "created_at", "updated_at", "branch_id", "user_id"]);

function getChanges(e: AuditEntry) {
  const af = e.after  ?? {};
  const bf = e.before ?? {};
  const keys = [...new Set([...Object.keys(af), ...Object.keys(bf)])].filter(k => !SKIP_FIELDS.has(k));
  const hasOnlyAfter = !e.before && !!e.after;
  return keys.map(k => ({
    key:     k,
    label:   cap(k.replace(/_/g, " ")),
    before:  bf[k],
    after:   af[k],
    changed: !hasOnlyAfter && JSON.stringify(bf[k]) !== JSON.stringify(af[k]),
    hasOnlyAfter,
  }));
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (v === true  || v === "true")   return "Yes";
  if (v === false || v === "false")  return "No";
  if (typeof v === "object") {
    if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
    // Nested config blobs (payment_config, printer_config, ...) aren't
    // meaningful as a single diffed value — the raw shape is still available
    // in Technical Details below.
    return "Updated (see Technical Details)";
  }
  return String(v);
}

function ListSeparator({ style }: { style: object }) {
  return <View style={style} />;
}

function AuditListSep() {
  const { C } = useTheme();
  return <View style={{ height: 1, backgroundColor: C.lineSoft, marginLeft: 60 }} />;
}

/* ── Screen ───────────────────────────────────────────────────────── */

export default function AuditScreen() {
  const { activeWorkspaceId } = useAuth();
  const { C }    = useTheme();
  const { width } = useWindowDimensions();
  const insets   = useSafeAreaInsets();
  const isTablet = width >= 768;
  const s = useMemo(() => makeStyles(C), [C]);

  const [entries,         setEntries]         = useState<AuditEntry[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [loadingMore,     setLoadingMore]     = useState(false);
  const [hasMore,         setHasMore]         = useState(true);
  const [fetchError,      setFetchError]      = useState<string | null>(null);
  const [dateFilter,      setDateFilter]      = useState<DateFilter>("today");
  const [entityFilter,    setEntityFilter]    = useState("all");
  const [search,          setSearch]          = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedId,      setSelectedId]      = useState<string | null>(null);
  const [showRaw,         setShowRaw]         = useState(false);
  const [actorMap,        setActorMap]        = useState<Record<string, ActorInfo>>({});
  const pageRef = useRef(0);

  const selected = useMemo(() => entries.find(e => e.id === selectedId) ?? null, [entries, selectedId]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Load actor names from workspace members
  useEffect(() => {
    if (!activeWorkspaceId) return;
    void (async () => {
      const { data: actorResult } = await invokeFn<{ "audit-actor-map": ActorMapRow[] }>("pos-data", {
        workspace_id: activeWorkspaceId,
        resource: "audit-actor-map",
        params: {},
      });
      const data = actorResult?.["audit-actor-map"];
      const map: Record<string, ActorInfo> = {};
      (data ?? []).forEach(m => {
        map[m.user_id] = {
          name:     m.profiles?.full_name ?? m.profiles?.username ?? "Unknown",
          username: m.profiles?.username  ?? "",
          role:     m.role ?? "",
        };
      });
      setActorMap(map);
    })();
  }, [activeWorkspaceId]);

  const fetchEntries = useCallback(async (reset = true) => {
    if (!activeWorkspaceId) return;
    if (reset) { pageRef.current = 0; setLoading(true); setLoadingMore(false); setFetchError(null); }
    else        { setLoadingMore(true); }
    const pg = pageRef.current;
    try {
      const rs = rangeStart(dateFilter);
      const params: Record<string, unknown> = { page: pg };
      if (rs)                     params.range_start = rs;
      if (entityFilter !== "all") params.entity_type = entityFilter;
      if (debouncedSearch)        params.search = debouncedSearch;
      const { data: logResult, error } = await invokeFn<{ "audit-log-entries": AuditEntry[] }>("pos-data", {
        workspace_id: activeWorkspaceId,
        resource: "audit-log-entries",
        params,
      });
      const data = logResult?.["audit-log-entries"];
      if (error) throw error;
      const mapped: AuditEntry[] = (data ?? []).map(e => ({
        id: e.id, actor_id: e.actor_id, action: e.action,
        entity_type: e.entity_type, entity_id: e.entity_id,
        before: e.before, after: e.after, created_at: e.created_at,
      }));
      if (reset) { setEntries(mapped); } else { setEntries(prev => [...prev, ...mapped]); }
      pageRef.current = pg + 1;
      setHasMore(mapped.length === PAGE);
    } catch (e: any) {
      setFetchError(e?.message ?? "Failed to load audit logs.");
      if (reset) setEntries([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeWorkspaceId, dateFilter, entityFilter, debouncedSearch]);

  useEffect(() => {
    setSelectedId(null);
    fetchEntries(true);
  }, [activeWorkspaceId, dateFilter, entityFilter, debouncedSearch]);

  const DATE_FILTERS: { id: DateFilter; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "week",  label: "Week"  },
    { id: "month", label: "Month" },
    { id: "all",   label: "All"   },
  ];
  // "kitchen" is the actual action-prefix match (kitchen.accepted, kitchen.preparing, …);
  // labeled "Prep Display" to match this screen's own name and web's audit-log filter for
  // the same events (apps/web/app/(admin)/audit-logs/page.tsx uses key "prep" there, which
  // maps to the same underlying kitchen_ticket events via a different DB column).
  const ENTITY_FILTERS = [
    { key: "all",         label: "All Types"    },
    { key: "order",       label: "Order"        },
    { key: "booking",     label: "Booking"      },
    { key: "product",     label: "Product"      },
    { key: "inventory",   label: "Inventory"    },
    { key: "ingredient",  label: "Ingredient"   },
    { key: "payment",     label: "Payment"      },
    { key: "transaction", label: "Transactions" },
    { key: "kitchen",     label: "Prep Display" },
    { key: "staff",       label: "Staff"        },
    { key: "workspace",   label: "Workspace"    },
  ];

  /* ── Activity row ─────────────────────────────────────────────── */

  function renderRow(renderInfo: { item: AuditEntry }) {
    const item = renderInfo.item;
    const human = humanize(item);
    const icon  = entryIcon(item);
    const sc    = sevColor(human.severity, C);
    const actor = item.actor_id ? actorMap[item.actor_id] : null;
    const actorLabel = actor?.name ?? (item.actor_id ? `User ${item.actor_id.slice(0,6)}` : "System");
    const isSelected = selectedId === item.id;

    return (
      <Pressable
        style={[s.row, isSelected && s.rowSelected]}
        onPress={() => { setSelectedId(prev => prev === item.id ? null : item.id); setShowRaw(false); }}>
        <View style={[s.rowIcon, { backgroundColor: `${sc}18` }]}>
          <Feather name={icon} size={14} color={sc} />
        </View>
        <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={s.rowTitle} numberOfLines={1}>{human.title}</Text>
            {human.severity !== "normal" && (
              <View style={[s.sevPill, { backgroundColor: `${sc}18`, borderColor: `${sc}35` }]}>
                <Feather name={sevIcon(human.severity)} size={9} color={sc} />
              </View>
            )}
          </View>
          <Text style={s.rowSummary} numberOfLines={1}>{human.summary}</Text>
          <Text style={s.rowMeta}>{actorLabel} · {fmtShort(item.created_at)}</Text>
        </View>
        {isSelected && isTablet && (
          <Feather name="chevron-right" size={13} color={C.amber} style={{ marginTop: 2 }} />
        )}
      </Pressable>
    );
  }

  /* ── Detail content ───────────────────────────────────────────── */

  function renderDetailSevBadge(human: Human, sc: string) {
    if (human.severity === "normal") return null;
    const label =
      human.severity === "warning"   ? "Warning — unusual activity"
      : human.severity === "sensitive" ? "Sensitive — access change"
      : "Important change";
    return (
      <View style={[s.detailSevBadge, { backgroundColor: `${sc}14`, borderColor: `${sc}30` }]}>
        <Feather name={sevIcon(human.severity)} size={11} color={sc} />
        <Text style={[s.detailSevText, { color: sc }]}>{label}</Text>
      </View>
    );
  }

  function renderChangeRow(ch: ReturnType<typeof getChanges>[number], idx: number, total: number) {
    const isLast = idx >= total - 1;
    return (
      <View key={ch.key}
        style={[s.changeRow, !isLast && { borderBottomWidth: 1, borderBottomColor: `${C.line}60` }]}>
        <Text style={s.changeKey}>{ch.label}</Text>
        {ch.hasOnlyAfter || !ch.changed ? (
          <Text style={s.changeVal}>{fmtVal(ch.after)}</Text>
        ) : (
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            <Text style={[s.changeVal, { color: C.ink4, textDecorationLine: "line-through" }]}>
              {fmtVal(ch.before)}
            </Text>
            <Text style={[s.changeVal, { color: C.good }]}>{fmtVal(ch.after)}</Text>
          </View>
        )}
      </View>
    );
  }

  function renderDetailActor(actor: ActorInfo | null, entry: AuditEntry) {
    if (actor) {
      return (
        <>
          <View style={s.actorAvatar}>
            <Text style={s.actorAvatarText}>{(actor.name.charAt(0) || "?").toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.actorName}>{actor.name}</Text>
            <Text style={s.actorMeta}>
              {actor.role ? cap(actor.role) : "Staff"}
              {actor.username ? ` · @${actor.username}` : ""}
            </Text>
          </View>
        </>
      );
    }
    return (
      <>
        <View style={[s.actorAvatar, { backgroundColor: `${C.ink4}18` }]}>
          <Feather name="cpu" size={14} color={C.ink4} />
        </View>
        <Text style={s.actorName}>{entry.actor_id ? "External user" : "System"}</Text>
      </>
    );
  }

  function renderRawJson(entry: AuditEntry) {
    if (!(entry.before ?? entry.after)) return null;
    return (
      <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 8, marginTop: 4 }}>
        {entry.before && (
          <>
            <Text style={s.rawSectionLabel}>BEFORE</Text>
            <Text style={[s.rawJson, { fontFamily: MONO }]}>{JSON.stringify(entry.before, null, 2)}</Text>
          </>
        )}
        {entry.after && (
          <>
            <Text style={s.rawSectionLabel}>AFTER</Text>
            <Text style={[s.rawJson, { fontFamily: MONO }]}>{JSON.stringify(entry.after, null, 2)}</Text>
          </>
        )}
      </View>
    );
  }

  function renderDetail(entry: AuditEntry | null) {
    if (!entry) {
      return (
        <View style={s.detailEmpty}>
          <Feather name="activity" size={36} color={C.ink4} />
          <Text style={s.detailEmptyText}>Select an activity to see details</Text>
        </View>
      );
    }

    const human    = humanize(entry);
    const sc       = sevColor(human.severity, C);
    const icon     = entryIcon(entry);
    const actor    = entry.actor_id ? actorMap[entry.actor_id] : null;
    const changes  = getChanges(entry);
    const isCreate = !entry.before && !!entry.after;

    const technicalRows = [
      { label: "Entity type", value: entry.entity_type },
      { label: "Entity ID",   value: entry.entity_id ?? "—" },
      { label: "Action",      value: entry.action },
      { label: "Actor ID",    value: entry.actor_id ?? "System" },
      { label: "Log ID",      value: entry.id },
    ];

    return (
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={[s.detailContent, { paddingBottom: insets.bottom + 40 }]}>

        {/* Header card */}
        <View style={[s.detailHeader, { borderTopColor: sc }]}>
          <View style={[s.detailHeaderIcon, { backgroundColor: `${sc}18` }]}>
            <Feather name={icon} size={22} color={sc} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.detailTitle}>{human.title}</Text>
            <Text style={s.detailTimestamp}>{fmtFull(entry.created_at)}</Text>
            {renderDetailSevBadge(human, sc)}
          </View>
        </View>

        {/* Summary */}
        <View style={s.detailBlock}>
          <Text style={s.detailBlockLabel}>Summary</Text>
          <Text style={s.detailSummaryText}>{human.summary}</Text>
        </View>

        {/* What changed */}
        {changes.length > 0 && (
          <View style={s.detailBlock}>
            <Text style={s.detailBlockLabel}>{isCreate ? "Details" : "What Changed"}</Text>
            <View style={s.detailCard}>
              {changes.map((ch, idx) => renderChangeRow(ch, idx, changes.length))}
            </View>
          </View>
        )}

        {/* Performed by */}
        <View style={s.detailBlock}>
          <Text style={s.detailBlockLabel}>Performed By</Text>
          <View style={s.detailCard}>
            <View style={s.actorRow}>
              {renderDetailActor(actor ?? null, entry)}
            </View>
          </View>
        </View>

        {/* Technical details (collapsible) */}
        <View style={s.detailBlock}>
          <Pressable style={s.rawToggle} onPress={() => setShowRaw(v => !v)}>
            <Text style={s.detailBlockLabel}>Technical Details</Text>
            <Feather name={showRaw ? "chevron-up" : "chevron-down"} size={13} color={C.ink4} />
          </Pressable>
          {showRaw && (
            <View style={s.detailCard}>
              {technicalRows.map((row, idx, arr) => (
                <View key={row.label}
                  style={[s.changeRow, idx < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: `${C.line}60` }]}>
                  <Text style={s.changeKey}>{row.label}</Text>
                  <Text style={[s.changeVal, { fontFamily: MONO, fontSize: 10, color: C.ink3 }]}
                    numberOfLines={1} selectable>
                    {row.value}
                  </Text>
                </View>
              ))}
              {renderRawJson(entry)}
            </View>
          )}
        </View>

      </ScrollView>
    );
  }

  /* ── Filter bar ────────────────────────────────────────────────── */

  function renderFilters() {
    return (
      <>
        <View style={s.dateRow}>
          {DATE_FILTERS.map(f => (
            <Pressable key={f.id}
              style={[s.dateBtn, dateFilter === f.id && s.dateBtnActive]}
              onPress={() => setDateFilter(f.id)}>
              <Text style={[s.dateBtnText, dateFilter === f.id && s.dateBtnTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={s.entityScroll} contentContainerStyle={s.entityRow}>
          {ENTITY_FILTERS.map(ef => (
            <Pressable key={ef.key}
              style={[s.entityChip, entityFilter === ef.key && s.entityChipActive]}
              onPress={() => setEntityFilter(ef.key)}>
              <Text style={[s.entityChipText, entityFilter === ef.key && s.entityChipTextActive]}>
                {ef.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={s.searchBar}>
          <Feather name="search" size={13} color={C.ink4} />
          <TextInput
            style={s.searchInput}
            placeholder="Search activity…"
            placeholderTextColor={C.ink4}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Feather name="x" size={13} color={C.ink4} />
            </Pressable>
          )}
        </View>
      </>
    );
  }

  /* ── Activity list ─────────────────────────────────────────────── */

  function renderList() {
    if (loading) {
      return <View style={s.center}><ActivityIndicator color={C.amber} /></View>;
    }
    if (fetchError) {
      return (
        <View style={s.center}>
          <Feather name="wifi-off" size={32} color={C.rust} />
          <Text style={[s.emptyText, { color: C.rust, textAlign: "center" }]}>
            Couldn&apos;t load audit logs.{"\n"}Check your connection and try again.
          </Text>
          <Pressable
            style={[s.refreshBtn, { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, width: undefined }]}
            onPress={() => fetchEntries(true)}
          >
            <Feather name="refresh-cw" size={13} color={C.ink3} />
            <Text style={{ color: C.ink3, fontSize: 12, marginLeft: 6 }}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <FlatList
        data={entries}
        keyExtractor={e => e.id}
        renderItem={renderRow}
        contentContainerStyle={[
          s.listContent,
          !isTablet && { paddingBottom: insets.bottom + 40 },
        ]}
        ItemSeparatorComponent={AuditListSep}
        onEndReached={() => hasMore && !loadingMore && fetchEntries(false)}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          entries.length > 0 ? (
            loadingMore ? (
              <View style={s.footerLoading}>
                <ActivityIndicator size="small" color={C.amber} />
                <Text style={s.footerText}>Loading more…</Text>
              </View>
            ) : !hasMore ? (
              <View style={s.footerEnd}>
                <View style={s.footerLine} />
                <Text style={s.footerText}>All {entries.length} entries loaded</Text>
                <View style={s.footerLine} />
              </View>
            ) : null
          ) : null
        }
        ListEmptyComponent={
          <View style={s.center}>
            <Feather name="clock" size={32} color={C.ink4} />
            <Text style={s.emptyText}>No activity for this period</Text>
          </View>
        }
      />
    );
  }

  /* ── Main render ───────────────────────────────────────────────── */

  return (
    <View style={s.root}>
      <PosScreenHeader
        title="Audit Logs"
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={[s.countText, { fontFamily: MONO }]}>
              {entries.length}{hasMore ? "+" : ""} {dateFilter === "today" ? "today" : "entries"}
            </Text>
            <Pressable style={s.refreshBtn} onPress={() => fetchEntries(true)} hitSlop={8}>
              <Feather name="refresh-cw" size={14} color={C.ink3} />
            </Pressable>
          </View>
        }
      />

      {renderFilters()}

      {isTablet ? (
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={s.listPanel}>{renderList()}</View>
          <View style={s.detailPanel}>{renderDetail(selected)}</View>
        </View>
      ) : (
        <>
          {renderList()}
          <Modal visible={!!selected} animationType="slide" transparent
            onRequestClose={() => { setSelectedId(null); setShowRaw(false); }}>
            <Pressable style={s.modalBd}
              onPress={() => { setSelectedId(null); setShowRaw(false); }}>
              <Pressable style={s.modalCard} onPress={() => {}}>
                <View style={s.modalHead}>
                  <Text style={s.modalHeadTitle}>Activity Details</Text>
                  <Pressable hitSlop={10}
                    onPress={() => { setSelectedId(null); setShowRaw(false); }}>
                    <Feather name="x" size={20} color={C.ink3} />
                  </Pressable>
                </View>
                {renderDetail(selected)}
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}
    </View>
  );
}

/* ── Styles ────────────────────────────────────────────────────────── */

const makeStyles = (C: C) => StyleSheet.create({
  root:       { flex: 1, backgroundColor: C.bg },
  countText:  { color: C.ink4, fontSize: 11 },
  refreshBtn: {
    width: 30, height: 30, borderRadius: R.md,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
    alignItems: "center", justifyContent: "center",
  },

  /* ── Filters ── */
  dateRow: {
    flexDirection: "row", gap: 8, padding: 10,
    backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  dateBtn: {
    flex: 1, paddingVertical: 8, alignItems: "center",
    borderRadius: R.md, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.line,
  },
  dateBtnActive:     { backgroundColor: `${C.amber}18`, borderColor: C.amber },
  dateBtnText:       { color: C.ink3, fontSize: 12, fontWeight: "600" },
  dateBtnTextActive: { color: C.amber },

  entityScroll: { flexGrow: 0, backgroundColor: C.bg2 },
  entityRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  entityChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: R.full, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.line,
  },
  entityChipActive:     { backgroundColor: `${C.info}18`, borderColor: C.info },
  entityChipText:       { color: C.ink3, fontSize: 11, fontWeight: "500" },
  entityChipTextActive: { color: C.info },

  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 9,
    backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  searchInput: { flex: 1, color: C.ink, fontSize: 13, paddingVertical: 0 },

  /* ── Layout ── */
  listPanel: {
    width: 380, borderRightWidth: 1, borderRightColor: C.line, backgroundColor: C.bg,
  },
  detailPanel: { flex: 1, backgroundColor: C.bg },
  listContent: { paddingVertical: 4 },
  center:      { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 40 },
  emptyText:   { color: C.ink4, fontSize: 13 },

  footerLoading: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 18,
  },
  footerEnd: {
    flexDirection: "row", alignItems: "center",
    gap: 10, paddingHorizontal: 16, paddingVertical: 18,
  },
  footerLine: { flex: 1, height: 1, backgroundColor: C.line },
  footerText: { color: C.ink4, fontSize: 10, fontFamily: MONO },

  /* ── Activity row ── */
  row: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  rowSelected: { backgroundColor: `${C.amber}0A` },
  rowIcon: {
    width: 34, height: 34, borderRadius: R.md,
    alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
  },
  rowTitle:   { color: C.ink, fontSize: 13, fontWeight: "600" },
  rowSummary: { color: C.ink3, fontSize: 11 },
  rowMeta:    { color: C.ink4, fontSize: 10 },
  sevPill: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },

  /* ── Detail panel ── */
  detailEmpty: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 40,
  },
  detailEmptyText: { color: C.ink4, fontSize: 13 },
  detailContent:   { padding: 20, gap: 16 },

  detailHeader: {
    flexDirection: "row", gap: 14, alignItems: "flex-start",
    backgroundColor: C.bg2, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line, borderTopWidth: 3,
    padding: 16,
  },
  detailHeaderIcon: {
    width: 46, height: 46, borderRadius: R.md,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  detailTitle:     { color: C.ink, fontSize: 16, fontWeight: "700" },
  detailTimestamp: { color: C.ink4, fontSize: 11, marginTop: 2 },
  detailSevBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    alignSelf: "flex-start", marginTop: 6,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: R.md, borderWidth: 1,
  },
  detailSevText: { fontSize: 11, fontWeight: "600" },

  detailBlock:      { gap: 8 },
  detailBlockLabel: {
    color: C.ink4, fontSize: 9, fontWeight: "700",
    letterSpacing: 1.2, textTransform: "uppercase",
  },
  detailSummaryText: { color: C.ink3, fontSize: 14, lineHeight: 21 },
  detailCard: {
    backgroundColor: C.bg2, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line, overflow: "hidden",
  },

  changeRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 11, gap: 12,
  },
  changeKey: { color: C.ink3, fontSize: 12, flex: 1 },
  changeVal: { color: C.ink,  fontSize: 12, fontWeight: "500", textAlign: "right", flexShrink: 1 },

  actorRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  actorAvatar: {
    width: 34, height: 34, borderRadius: R.full,
    backgroundColor: `${C.amber}18`, borderWidth: 1, borderColor: `${C.amber}30`,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  actorAvatarText: { color: C.amber, fontSize: 13, fontWeight: "700" },
  actorName:       { color: C.ink,  fontSize: 13, fontWeight: "600" },
  actorMeta:       { color: C.ink4, fontSize: 11, marginTop: 1 },

  rawToggle:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 2 },
  rawSectionLabel:{ color: C.ink4, fontSize: 9, fontWeight: "700", letterSpacing: 1.2 },
  rawJson:        { color: C.good, fontSize: 11, lineHeight: 18 },

  /* ── Phone modal ── */
  modalBd:   { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: C.bg2,
    borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl,
    maxHeight: "88%",
  },
  modalHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  modalHeadTitle: { color: C.ink, fontSize: 16, fontWeight: "700" },
});

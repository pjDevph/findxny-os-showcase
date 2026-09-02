import {
  View, Text, Pressable, TextInput, FlatList,
  StyleSheet, Modal, ActivityIndicator, Platform,
  ScrollView, Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Feather } from "@expo/vector-icons";
import { invokeFn } from "../../services/supabase";
import { useAuth } from "../../features/auth/AuthContext";
import { R } from "../../features/theme/tokens";
import { useTheme } from "../../features/theme/ThemeContext";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { KeyboardSheet } from "../../features/ui/KeyboardSheet";
import { KeyboardAwareScrollView } from "../../features/ui/KeyboardAwareScrollView";
import { useAppAlert } from "../../features/ui/AppAlertProvider";
import { useToast } from "../../features/ui/ToastProvider";
import { sanitizeMoney, sanitizePercent, sanitizeInteger, sanitizeCode, sanitizeDateStr } from "../../features/utils/inputSanitizers";

const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });
const peso = (n: number) => `₱${Number(n).toFixed(2)}`;

type DiscountType    = "percentage" | "fixed";
type AppliesToType   = "order" | "food" | "drinks" | "rooms" | "amenities";
type VoucherStatus   = "active" | "scheduled" | "disabled";
type EffectiveStatus = "active" | "scheduled" | "expired" | "used_up" | "disabled";
type MainTab         = "vouchers" | "checker" | "usage";
type StatusFilter    = "all" | EffectiveStatus;

interface Voucher {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  max_cap: number | null;
  min_spend: number;
  usage_limit: number | null;
  usage_count: number;
  one_per_customer: boolean;
  applies_to: AppliesToType;
  valid_from: string | null;
  valid_until: string | null;
  status: VoucherStatus;
  created_at: string;
}

type EnrichedVoucher = Voucher & { _effective: EffectiveStatus };

interface Redemption {
  id: string;
  voucher_code: string;
  voucher_name: string;
  order_total: number;
  discount_amount: number;
  redeemed_at: string;
}

interface RedemptionRow {
  id: string;
  vouchers: { code: string; name: string } | null;
  order_total: number;
  discount_amount: number;
  redeemed_at: string;
}

const EMPTY_FORM = {
  name: "",
  code: "",
  description: "",
  discount_type: "fixed" as DiscountType,
  discount_value: "",
  max_cap: "",
  min_spend: "",
  usage_limit: "",
  one_per_customer: false,
  applies_to: "order" as AppliesToType,
  valid_from: "",
  valid_until: "",
  status: "active" as VoucherStatus,
};

const APPLIES_TO_LABELS: Record<AppliesToType, string> = {
  order:     "Entire Order",
  food:      "Food Only",
  drinks:    "Drinks Only",
  rooms:     "Rooms",
  amenities: "Amenities",
};

const STATUS_LABELS: Record<EffectiveStatus, string> = {
  active:    "Active",
  scheduled: "Scheduled",
  expired:   "Expired",
  used_up:   "Used Up",
  disabled:  "Disabled",
};

function randomCode(): string {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => c[Math.floor(Math.random() * c.length)]).join(""); // NOSONAR - non-security randomness
}

function getEffectiveStatus(v: Voucher): EffectiveStatus {
  if (v.status === "disabled") return "disabled";
  const now = new Date();
  if (v.valid_until && new Date(v.valid_until) < now) return "expired";
  if (v.usage_limit !== null && v.usage_count >= v.usage_limit) return "used_up";
  if (v.valid_from && new Date(v.valid_from) > now) return "scheduled";
  if (v.status === "scheduled") return "scheduled";
  return "active";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

interface VoucherCheckResult {
  valid: boolean;
  reason: string | null;
  discount_amount: number;
  final_total: number;
  voucher: {
    id: string; code: string; name: string; applies_to: AppliesToType;
    discount_type: DiscountType; discount_value: number; max_cap: number | null;
    min_spend: number; usage_limit: number | null; usage_count: number;
    valid_from: string | null; valid_until: string | null;
  } | null;
}

function fmtDiscount(v: { discount_type: DiscountType; discount_value: number; max_cap: number | null }): string {
  if (v.discount_type === "percentage") {
    const cap = v.max_cap ? ` (max ${peso(v.max_cap)})` : "";
    return `${v.discount_value}% off${cap}`;
  }
  return `${peso(v.discount_value)} off`;
}

export default function VouchersScreen() {
  const { activeWorkspaceId, role } = useAuth();
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { showAlert } = useAppAlert();
  const { showToast } = useToast();
  // Management (create/edit/delete) is owner/admin only; manager+ can apply at checkout
  const canManage = role === "owner" || role === "admin";

  const [mainTab, setMainTab]           = useState<MainTab>("vouchers");
  const [vouchers, setVouchers]         = useState<Voucher[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [menuVoucher, setMenuVoucher]   = useState<EnrichedVoucher | null>(null);

  const [showForm, setShowForm]         = useState(false);
  const [editVoucher, setEditVoucher]   = useState<Voucher | null>(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [saving, setSaving]             = useState(false);

  const [checkerCode, setCheckerCode]         = useState("");
  const [checkResult, setCheckResult]         = useState<VoucherCheckResult | null>(null);
  const [checkerSubtotal, setCheckerSubtotal] = useState("");
  const [checking, setChecking]               = useState(false);

  const [redemptions, setRedemptions]   = useState<Redemption[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchVouchers = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    const { data, error } = await invokeFn<{ "vouchers-list": Voucher[] }>(
      "pos-data", { workspace_id: activeWorkspaceId, resource: "vouchers-list" },
    );
    setLoading(false);
    if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
    setVouchers(data?.["vouchers-list"] ?? []);
  }, [activeWorkspaceId]);

  const fetchRedemptions = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setUsageLoading(true);
    const { data } = await invokeFn<{ "vouchers-redemptions": RedemptionRow[] }>(
      "pos-data", { workspace_id: activeWorkspaceId, resource: "vouchers-redemptions" },
    );
    setUsageLoading(false);
    setRedemptions(
      ((data?.["vouchers-redemptions"]) ?? []).map(r => ({
        id:              r.id,
        voucher_code:    r.vouchers?.code ?? "—", // NOSONAR
        voucher_name:    r.vouchers?.name ?? "—", // NOSONAR
        order_total:     Number(r.order_total),
        discount_amount: Number(r.discount_amount),
        redeemed_at:     r.redeemed_at,
      }))
    );
  }, [activeWorkspaceId]);

  useEffect(() => { fetchVouchers(); fetchRedemptions(); }, [fetchVouchers, fetchRedemptions]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const enriched: EnrichedVoucher[] = useMemo(
    () => vouchers.map(v => ({ ...v, _effective: getEffectiveStatus(v) })),
    [vouchers],
  );

  const counts = useMemo(() => ({
    active:    enriched.filter(v => v._effective === "active").length,
    scheduled: enriched.filter(v => v._effective === "scheduled").length,
    expired:   enriched.filter(v => v._effective === "expired").length,
    used_up:   enriched.filter(v => v._effective === "used_up").length,
    disabled:  enriched.filter(v => v._effective === "disabled").length,
  }), [enriched]);

  const filtered = useMemo(() =>
    enriched.filter(v => {
      if (statusFilter !== "all" && v._effective !== statusFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return v.code.toLowerCase().includes(q) || v.name.toLowerCase().includes(q);
    }),
    [enriched, statusFilter, search],
  );

  const totalDiscountGiven = useMemo(
    () => redemptions.reduce((acc, r) => acc + r.discount_amount, 0),
    [redemptions],
  );

  // ── Form helpers ───────────────────────────────────────────────────────────

  function openAdd() {
    setEditVoucher(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(v: Voucher) {
    setEditVoucher(v);
    setForm({
      name:             v.name,
      code:             v.code,
      description:      v.description ?? "",
      discount_type:    v.discount_type,
      discount_value:   String(v.discount_value),
      max_cap:          v.max_cap != null ? String(v.max_cap) : "",
      min_spend:        v.min_spend > 0 ? String(v.min_spend) : "",
      usage_limit:      v.usage_limit != null ? String(v.usage_limit) : "",
      one_per_customer: v.one_per_customer,
      applies_to:       v.applies_to,
      valid_from:       v.valid_from ? v.valid_from.slice(0, 10) : "",
      valid_until:      v.valid_until ? v.valid_until.slice(0, 10) : "",
      status:           v.status,
    });
    setShowForm(true);
  }

  async function saveVoucher() {
    if (!form.name.trim() || !form.code.trim() || !form.discount_value) {
      showToast({ title: "Required", message: "Name, code, and discount value are required.", type: "error" });
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      workspace_id:     activeWorkspaceId,
      code:             form.code.trim().toUpperCase(),
      name:             form.name.trim(),
      description:      form.description.trim() || null,
      discount_type:    form.discount_type,
      discount_value:   parseFloat(form.discount_value) || 0,
      max_cap:          form.max_cap ? parseFloat(form.max_cap) : null,
      min_spend:        parseFloat(form.min_spend) || 0,
      usage_limit:      form.usage_limit ? parseInt(form.usage_limit, 10) : null,
      one_per_customer: form.one_per_customer,
      applies_to:       form.applies_to,
      valid_from:       form.valid_from || null,
      valid_until:      form.valid_until || null,
      status:           form.status,
    };
    if (editVoucher) payload.id = editVoucher.id;
    const wasEdit = !!editVoucher;
    const { error } = await invokeFn("vouchers-upsert", payload);
    setSaving(false);
    if (error) { showToast({ title: "Error", message: error.message ?? "Failed to save", type: "error" }); return; }
    setShowForm(false);
    showToast({
      title: wasEdit ? "Voucher updated" : "Voucher created",
      message: `${payload.code} ${wasEdit ? "saved" : "is ready to use"}.`,
      type: "success",
    });
    fetchVouchers();
  }

  async function toggleDisabled(v: Voucher) {
    const newStatus: VoucherStatus = v.status === "disabled" ? "active" : "disabled";
    const { error } = await invokeFn("vouchers-upsert", {
      workspace_id: activeWorkspaceId,
      id:           v.id,
      status:       newStatus,
    });
    if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
    setVouchers(prev => prev.map(x => x.id === v.id ? { ...x, status: newStatus } : x));
    showToast({
      title: newStatus === "disabled" ? "Voucher disabled" : "Voucher enabled",
      message: `${v.code} is now ${newStatus}.`,
      type: "success",
    });
  }

  function confirmDelete(v: Voucher) {
    showAlert(
      "Delete voucher?",
      `"${v.code}" will be permanently deleted. Redemption history remains.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => { void deleteVoucher(v); } },
      ],
    );
  }

  async function deleteVoucher(v: Voucher) {
    const { error } = await invokeFn("vouchers-delete", {
      workspace_id: activeWorkspaceId,
      id:           v.id,
    });
    if (error) { showToast({ title: "Error", message: error.message, type: "error" }); return; }
    setVouchers(prev => prev.filter(x => x.id !== v.id));
    showToast({ title: "Voucher deleted", message: `${v.code} was removed.`, type: "success" });
  }

  // ── Checker helpers ────────────────────────────────────────────────────────

  async function checkVoucher() {
    const code = checkerCode.trim().toUpperCase();
    if (!code) return;
    setChecking(true);
    setCheckResult(null);
    // Delegates to the same server-side "vouchers-validate" resource web's checker
    // and real checkout use, so this screen can never disagree with what actually
    // gets applied at the register.
    const { data, error } = await invokeFn<Record<string, VoucherCheckResult>>(
      "pos-data",
      {
        workspace_id: activeWorkspaceId,
        resource: "vouchers-validate",
        params: { code, subtotal: parseFloat(checkerSubtotal) || 0 },
      },
    );
    setChecking(false);
    if (error) {
      showToast({ title: "Error", message: error.message ?? "Check failed", type: "error" });
      return;
    }
    setCheckResult(data?.["vouchers-validate"] ?? null);
  }

  // ── Status color ───────────────────────────────────────────────────────────

  function statusColor(eff: EffectiveStatus): string {
    switch (eff) {
      case "active":    return C.good;
      case "scheduled": return C.info;
      case "expired":   return C.ink4;
      case "used_up":   return C.warn;
      case "disabled":  return C.ink4;
    }
  }

  // ── Tab: Vouchers ──────────────────────────────────────────────────────────

  function renderVouchersTab() {
    return (
      <View style={{ flex: 1 }}>
        <View style={s.toolbar}>
          <View style={s.searchWrap}>
            <Text style={s.searchIcon}>⌕</Text>
            <TextInput
              style={s.searchInput}
              placeholder="Search code or name…"
              placeholderTextColor={C.ink4}
              value={search}
              onChangeText={setSearch}
            />
            {search ? <Pressable onPress={() => setSearch("")}><Text style={s.clearX}>✕</Text></Pressable> : null}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={s.tabsBar} contentContainerStyle={s.tabsContent}>
          {([
            { id: "all",       label: "All",       count: vouchers.length },
            { id: "active",    label: "Active",    count: counts.active },
            { id: "scheduled", label: "Scheduled", count: counts.scheduled },
            { id: "expired",   label: "Expired",   count: counts.expired },
            { id: "used_up",   label: "Used Up",   count: counts.used_up },
            { id: "disabled",  label: "Disabled",  count: counts.disabled },
          ] as { id: StatusFilter; label: string; count: number }[]).map(tab => (
            <Pressable key={tab.id}
              style={[s.statusTab, statusFilter === tab.id && s.statusTabActive]}
              onPress={() => setStatusFilter(tab.id)}>
              <Text style={[s.statusTabTxt, statusFilter === tab.id && s.statusTabTxtActive]}>
                {tab.label}
              </Text>
              <View style={[s.statusTabCount, statusFilter === tab.id && s.statusTabCountActive]}>
                <Text style={[s.statusTabCountTxt, statusFilter === tab.id && s.statusTabCountTxtActive]}>
                  {tab.count}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <View style={s.center}><ActivityIndicator color={C.amber} /></View>
        ) : (
          <>
            <View style={s.tableHeader}>
              <Text style={[s.thTxt, s.colCode]}>CODE / NAME</Text>
              <Text style={[s.thTxt, s.colDiscount]}>DISCOUNT</Text>
              <Text style={[s.thTxt, s.colRules]}>RULES</Text>
              <Text style={[s.thTxt, s.colUsage]}>USED</Text>
              <Text style={[s.thTxt, s.colValid]}>VALID UNTIL</Text>
              <Text style={[s.thTxt, s.colStatus]}>STATUS</Text>
              <View style={s.colAction} />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={v => v.id}
              contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 100 }]}
              renderItem={({ item: v }) => {
                const sc = statusColor(v._effective);
                return (
                  <Pressable
                    style={({ pressed }) => [s.voucherRow, pressed && { opacity: 0.75 }]}
                    onPress={() => canManage && openEdit(v)}
                  >
                    <View style={s.colCode}>
                      <Text style={s.voucherCode} numberOfLines={1}>{v.code}</Text>
                      <Text style={s.voucherName} numberOfLines={1}>{v.name}</Text>
                    </View>
                    <Text style={[s.colDiscount, s.colTxt]} numberOfLines={1}>{fmtDiscount(v)}</Text>
                    <View style={s.colRules}>
                      {v.min_spend > 0 && (
                        <View style={s.ruleTag}><Text style={s.ruleTagTxt}>Min {peso(v.min_spend)}</Text></View>
                      )}
                      {v.applies_to !== "order" && (
                        <View style={s.ruleTag}><Text style={s.ruleTagTxt}>{APPLIES_TO_LABELS[v.applies_to]}</Text></View>
                      )}
                    </View>
                    <Text style={[s.colUsage, s.colTxt]}>
                      {v.usage_count}{v.usage_limit != null ? `/${v.usage_limit}` : ""}
                    </Text>
                    <Text style={[s.colValid, s.colTxtSm]}>{fmtDate(v.valid_until)}</Text>
                    <View style={s.colStatus}>
                      <View style={[s.statusChip, { backgroundColor: `${sc}20`, borderColor: `${sc}50` }]}>
                        <Text style={[s.statusChipTxt, { color: sc }]}>{STATUS_LABELS[v._effective]}</Text>
                      </View>
                    </View>
                    <View style={s.colAction}>
                      {canManage && (
                        <Pressable style={s.moreBtn}
                          onPress={e => { e.stopPropagation(); setMenuVoucher(v); }}
                          hitSlop={8}>
                          <Feather name="more-vertical" size={16} color={C.ink3} />
                        </Pressable>
                      )}
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={s.center}>
                  <Text style={s.empty}>No vouchers found</Text>
                  {canManage && <Text style={s.emptySub}>Tap + Create to add your first voucher</Text>}
                </View>
              }
            />
          </>
        )}
      </View>
    );
  }

  // ── Tab: Checker ───────────────────────────────────────────────────────────

  function renderCheckerTab() {
    const result = checkResult;
    const voucher = result?.voucher ?? null;

    return (
      <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={[s.checkerContent, { paddingBottom: insets.bottom + 60 }]}>
        <Text style={s.checkerTitle}>Voucher Checker</Text>
        <Text style={s.checkerSub}>Validity and discount are calculated by the server — the same check real checkout runs.</Text>

        <View style={s.checkerRow}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            placeholder="Enter voucher code…"
            placeholderTextColor={C.ink4}
            value={checkerCode}
            autoCapitalize="characters"
            returnKeyType="search"
            maxLength={20}
            onChangeText={v => { setCheckerCode(sanitizeCode(v, { maxLen: 20 })); setCheckResult(null); }}
            onSubmitEditing={checkVoucher}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={s.fieldLabel}>Cart Subtotal (optional)</Text>
          <TextInput
            style={s.input}
            placeholder="₱ 0.00"
            placeholderTextColor={C.ink4}
            keyboardType="decimal-pad"
            maxLength={12}
            value={checkerSubtotal}
            onChangeText={v => { setCheckerSubtotal(sanitizeMoney(v)); setCheckResult(null); }}
          />
        </View>

        <Pressable
          style={[s.checkBtn, (!checkerCode.trim() || checking) && { opacity: 0.5 }]}
          onPress={checkVoucher}
          disabled={!checkerCode.trim() || checking}
        >
          {checking
            ? <ActivityIndicator size="small" color="#000000" />
            : <Text style={s.checkBtnTxt}>Check</Text>}
        </Pressable>

        {result && !voucher && (
          <View style={[s.resultCard, { borderColor: `${C.bad}44` }]}>
            <View style={s.resultCardRow}>
              <Feather name="x-circle" size={20} color={C.bad} />
              <View style={{ flex: 1 }}>
                <Text style={[s.resultTitle, { color: C.bad }]}>{result.reason ?? "Code not found"}</Text>
                <Text style={s.resultSub}>"{checkerCode}" does not exist in this workspace.</Text>
              </View>
            </View>
          </View>
        )}

        {result && voucher && (
          <View style={[s.resultCard, { borderColor: `${result.valid ? C.good : C.bad}44` }]}>
            <View style={s.resultCardRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.resultCode}>{voucher.code}</Text>
                <Text style={s.resultName}>{voucher.name}</Text>
              </View>
              <View style={[s.statusChip,
                { backgroundColor: `${result.valid ? C.good : C.bad}20`,
                  borderColor: `${result.valid ? C.good : C.bad}50` }]}>
                <Text style={[s.statusChipTxt, { color: result.valid ? C.good : C.bad }]}>
                  {result.valid ? "Valid" : "Invalid"}
                </Text>
              </View>
            </View>

            {!result.valid && result.reason && (
              <View style={[s.reasonBanner, { backgroundColor: `${C.bad}10` }]}>
                <Feather name="alert-circle" size={13} color={C.bad} />
                <Text style={[s.reasonBannerTxt, { color: C.bad }]}>{result.reason}</Text>
              </View>
            )}

            <View style={s.resultDetails}>
              <View style={s.resultRow}>
                <Text style={s.resultLabel}>Discount</Text>
                <Text style={s.resultVal}>{fmtDiscount(voucher)}</Text>
              </View>
              {voucher.min_spend > 0 && (
                <View style={s.resultRow}>
                  <Text style={s.resultLabel}>Min spend</Text>
                  <Text style={s.resultVal}>{peso(voucher.min_spend)}</Text>
                </View>
              )}
              <View style={s.resultRow}>
                <Text style={s.resultLabel}>Used</Text>
                <Text style={s.resultVal}>
                  {voucher.usage_count}{voucher.usage_limit != null ? ` / ${voucher.usage_limit}` : ""}
                </Text>
              </View>
              {voucher.valid_until && (
                <View style={s.resultRow}>
                  <Text style={s.resultLabel}>Valid until</Text>
                  <Text style={s.resultVal}>{fmtDate(voucher.valid_until)}</Text>
                </View>
              )}
              {voucher.applies_to !== "order" && (
                <View style={s.resultRow}>
                  <Text style={s.resultLabel}>Applies to</Text>
                  <Text style={s.resultVal}>{APPLIES_TO_LABELS[voucher.applies_to]}</Text>
                </View>
              )}
            </View>

            {result.valid && !!checkerSubtotal && (
              <View style={s.subtotalTest}>
                <View style={[s.discountPreview, { borderColor: `${C.good}44` }]}>
                  <Text style={s.discountPreviewLabel}>Discount amount</Text>
                  <Text style={[s.discountPreviewAmt, { color: result.discount_amount > 0 ? C.good : C.ink4 }]}>
                    {peso(result.discount_amount)}
                  </Text>
                  {voucher.min_spend > 0 && (parseFloat(checkerSubtotal) || 0) < voucher.min_spend && (
                    <Text style={[s.discountPreviewNote, { color: C.warn }]}>
                      Minimum spend of {peso(voucher.min_spend)} not reached
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>
        )}
      </KeyboardAwareScrollView>
    );
  }

  // ── Tab: Usage ─────────────────────────────────────────────────────────────

  function renderUsageTab() {
    const totalUsed  = redemptions.length;
    const totalDisc  = redemptions.reduce((acc, r) => acc + r.discount_amount, 0);
    const totalSales = redemptions.reduce((acc, r) => acc + r.order_total, 0);

    return (
      <View style={{ flex: 1 }}>
        <View style={s.usageStats}>
          <View style={s.usageStat}>
            <Text style={s.usageStatVal}>{totalUsed}</Text>
            <Text style={s.usageStatLabel}>Redemptions</Text>
          </View>
          <View style={s.usageStatDivider} />
          <View style={s.usageStat}>
            <Text style={s.usageStatVal}>{peso(totalDisc)}</Text>
            <Text style={s.usageStatLabel}>Discount Given</Text>
          </View>
          <View style={s.usageStatDivider} />
          <View style={s.usageStat}>
            <Text style={s.usageStatVal}>{peso(totalSales)}</Text>
            <Text style={s.usageStatLabel}>Sales Generated</Text>
          </View>
        </View>

        {usageLoading ? (
          <View style={s.center}><ActivityIndicator color={C.amber} /></View>
        ) : (
          <FlatList
            data={redemptions}
            keyExtractor={r => r.id}
            contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 100 }]}
            renderItem={({ item: r }) => (
              <View style={s.redemptionRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.voucherCode}>{r.voucher_code}</Text>
                  <Text style={s.voucherName}>{r.voucher_name}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Text style={[s.redemptionDisc, { color: C.good }]}>-{peso(r.discount_amount)}</Text>
                  <Text style={s.colTxtSm}>{fmtDate(r.redeemed_at)}</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={s.center}>
                <Text style={s.empty}>No redemptions yet</Text>
                <Text style={s.emptySub}>Voucher usage will appear here after orders are processed.</Text>
              </View>
            }
          />
        )}
      </View>
    );
  }

  // ── Root render ────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <PosScreenHeader
        title="Vouchers & Discounts"
        right={
          canManage ? (
            <Pressable style={s.addBtn} onPress={openAdd}>
              <Text style={s.addBtnTxt}>+ Create</Text>
            </Pressable>
          ) : undefined
        }
      />

      {/* Summary bar */}
      <View style={s.summaryBar}>
        <View style={s.summaryPill}>
          <Text style={s.summaryVal}>{counts.active}</Text>
          <Text style={s.summaryLabel}>Active</Text>
        </View>
        <View style={s.summaryPill}>
          <Text style={s.summaryVal}>{counts.scheduled}</Text>
          <Text style={s.summaryLabel}>Scheduled</Text>
        </View>
        <View style={s.summaryPill}>
          <Text style={s.summaryVal}>{counts.expired}</Text>
          <Text style={s.summaryLabel}>Expired</Text>
        </View>
        <View style={s.summaryPill}>
          <Text style={[s.summaryVal, { color: C.good }]}>{peso(totalDiscountGiven)}</Text>
          <Text style={s.summaryLabel}>Discount Given</Text>
        </View>
      </View>

      {/* Main tab bar */}
      <View style={s.mainTabBar}>
        {(["vouchers", "checker", "usage"] as MainTab[]).map(tab => (
          <Pressable key={tab}
            style={[s.mainTab, mainTab === tab && s.mainTabActive]}
            onPress={() => setMainTab(tab)}>
            <Text style={[s.mainTabTxt, mainTab === tab && s.mainTabTxtActive]}>
              {tab === "vouchers" ? "Vouchers" : tab === "checker" ? "Checker" : "Usage"}
            </Text>
          </Pressable>
        ))}
      </View>

      {mainTab === "vouchers" && renderVouchersTab()}
      {mainTab === "checker"  && renderCheckerTab()}
      {mainTab === "usage"    && renderUsageTab()}

      {/* ── Create / Edit modal ── */}
      <Modal visible={showForm} animationType="fade" transparent onRequestClose={() => setShowForm(false)}>
        <KeyboardSheet style={s.modalBd}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowForm(false)} />
          <Pressable style={s.sheet} onPress={() => {}}>
              <View style={s.sheetHeader}>
                <Text style={[s.sheetTitle, { flex: 1 }]} numberOfLines={1}>
                  {editVoucher ? "Edit Voucher" : "Create Voucher"}
                </Text>
                <Pressable onPress={() => setShowForm(false)} hitSlop={8} style={{ padding: 4 }}>
                  <Feather name="x" size={20} color={C.ink3} />
                </Pressable>
              </View>
              <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={s.sheetContent} keyboardShouldPersistTaps="handled">

                <Text style={s.fieldLabel}>Voucher Name</Text>
                <TextInput style={s.input} placeholder="e.g. Welcome Promo"
                  placeholderTextColor={C.ink4} maxLength={80} value={form.name}
                  onChangeText={v => setForm(f => ({ ...f, name: v }))} />

                <Text style={s.fieldLabel}>Code</Text>
                <View style={s.codeRow}>
                  <TextInput style={[s.input, { flex: 1 }]}
                    placeholder="e.g. WELCOME10"
                    placeholderTextColor={C.ink4}
                    autoCapitalize="characters"
                    maxLength={20}
                    value={form.code}
                    onChangeText={v => setForm(f => ({ ...f, code: sanitizeCode(v, { maxLen: 20 }) }))} />
                  <Pressable style={s.genBtn} onPress={() => setForm(f => ({ ...f, code: randomCode() }))}>
                    <Text style={s.genBtnTxt}>Generate</Text>
                  </Pressable>
                </View>

                <Text style={s.fieldLabel}>Description (optional)</Text>
                <TextInput style={[s.input, { minHeight: 56 }]}
                  placeholder="Short note for staff reference"
                  placeholderTextColor={C.ink4}
                  multiline
                  maxLength={300}
                  value={form.description}
                  onChangeText={v => setForm(f => ({ ...f, description: v }))} />

                <Text style={s.fieldLabel}>Discount Type</Text>
                {([
                  { id: "fixed",      label: "Fixed Amount",  desc: "₱X off the order total" },
                  { id: "percentage", label: "Percentage",    desc: "X% off the order total" },
                ] as { id: DiscountType; label: string; desc: string }[]).map(opt => (
                  <Pressable key={opt.id}
                    style={[s.radioOpt, form.discount_type === opt.id && s.radioOptActive]}
                    onPress={() => setForm(f => ({ ...f, discount_type: opt.id }))}>
                    <View style={[s.radio, form.discount_type === opt.id && s.radioActive]}>
                      {form.discount_type === opt.id && <View style={s.radioDot} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.radioLabel, form.discount_type === opt.id && s.radioLabelActive]}>
                        {opt.label}
                      </Text>
                      <Text style={s.radioDesc}>{opt.desc}</Text>
                    </View>
                  </Pressable>
                ))}

                <Text style={s.fieldLabel}>
                  {form.discount_type === "percentage" ? "Discount (%)" : "Discount Amount (₱)"}
                </Text>
                <TextInput style={s.input}
                  placeholder={form.discount_type === "percentage" ? "e.g. 10" : "e.g. 100"}
                  placeholderTextColor={C.ink4}
                  keyboardType="decimal-pad"
                  maxLength={8}
                  value={form.discount_value}
                  onChangeText={v => setForm(f => ({ ...f, discount_value: f.discount_type === "percentage" ? sanitizePercent(v) : sanitizeMoney(v) }))} />

                {form.discount_type === "percentage" && (
                  <>
                    <Text style={s.fieldLabel}>Max Discount Cap (₱, optional)</Text>
                    <TextInput style={s.input}
                      placeholder="e.g. 200 — leave blank for no cap"
                      placeholderTextColor={C.ink4}
                      keyboardType="decimal-pad"
                      maxLength={12}
                      value={form.max_cap}
                      onChangeText={v => setForm(f => ({ ...f, max_cap: sanitizeMoney(v) }))} />
                  </>
                )}

                <Text style={s.fieldLabel}>Minimum Spend (₱, optional)</Text>
                <TextInput style={s.input}
                  placeholder="e.g. 500 — leave blank for none"
                  placeholderTextColor={C.ink4}
                  keyboardType="decimal-pad"
                  maxLength={12}
                  value={form.min_spend}
                  onChangeText={v => setForm(f => ({ ...f, min_spend: sanitizeMoney(v) }))} />

                <Text style={s.fieldLabel}>Applies To</Text>
                <View style={s.chipGrid}>
                  {(Object.entries(APPLIES_TO_LABELS) as [AppliesToType, string][]).map(([id, label]) => (
                    <Pressable key={id}
                      style={[s.chip, form.applies_to === id && s.chipSel]}
                      onPress={() => setForm(f => ({ ...f, applies_to: id }))}>
                      <Text style={[s.chipTxt, form.applies_to === id && s.chipTxtSel]}>{label}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={s.fieldLabel}>Total Usage Limit (optional)</Text>
                <TextInput style={s.input}
                  placeholder="e.g. 100 — leave blank for unlimited"
                  placeholderTextColor={C.ink4}
                  keyboardType="number-pad"
                  maxLength={7}
                  value={form.usage_limit}
                  onChangeText={v => setForm(f => ({ ...f, usage_limit: sanitizeInteger(v, { maxLen: 7 }) }))} />

                <View style={s.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.switchLabel}>One use per customer</Text>
                    <Text style={s.radioDesc}>Requires customer to be linked to the order</Text>
                  </View>
                  <Switch
                    value={form.one_per_customer}
                    onValueChange={v => setForm(f => ({ ...f, one_per_customer: v }))}
                    trackColor={{ true: C.amber }} thumbColor={C.ink} />
                </View>

                <Text style={s.fieldLabel}>Valid From (YYYY-MM-DD, optional)</Text>
                <TextInput style={s.input}
                  placeholder="e.g. 2026-06-01"
                  placeholderTextColor={C.ink4}
                  maxLength={10}
                  value={form.valid_from}
                  onChangeText={v => setForm(f => ({ ...f, valid_from: sanitizeDateStr(v) }))} />

                <Text style={s.fieldLabel}>Valid Until (YYYY-MM-DD, optional)</Text>
                <TextInput style={s.input}
                  placeholder="e.g. 2026-06-30"
                  placeholderTextColor={C.ink4}
                  maxLength={10}
                  value={form.valid_until}
                  onChangeText={v => setForm(f => ({ ...f, valid_until: sanitizeDateStr(v) }))} />

                <Text style={s.fieldLabel}>Status</Text>
                <View style={s.chipGrid}>
                  {(["active", "scheduled", "disabled"] as VoucherStatus[]).map(id => (
                    <Pressable key={id}
                      style={[s.chip, form.status === id && s.chipSel]}
                      onPress={() => setForm(f => ({ ...f, status: id }))}>
                      <Text style={[s.chipTxt, form.status === id && s.chipTxtSel]}>
                        {id.charAt(0).toUpperCase() + id.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

              </ScrollView>
              <View style={[s.sheetFooter, { paddingBottom: 16 + insets.bottom }]}>
                <Pressable
                  style={[s.footerPrimaryBtn,
                    (saving || !form.name.trim() || !form.code.trim() || !form.discount_value) && { opacity: 0.5 }]}
                  onPress={saveVoucher}
                  disabled={saving || !form.name.trim() || !form.code.trim() || !form.discount_value}>
                  <Text style={s.footerPrimaryBtnTxt}>
                    {saving ? "Saving…" : editVoucher ? "Save Changes" : "Create Voucher"}
                  </Text>
                </Pressable>
              </View>
          </Pressable>
        </KeyboardSheet>
      </Modal>

      {/* ── ⋯ Action menu ── */}
      <Modal visible={!!menuVoucher} animationType="fade" transparent onRequestClose={() => setMenuVoucher(null)}>
        <Pressable style={s.modalBd} onPress={() => setMenuVoucher(null)}>
          <Pressable style={[s.sheet, { padding: 0, overflow: "hidden" }]} onPress={() => {}}>
            <View style={s.menuHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.menuCode} numberOfLines={1}>{menuVoucher?.code}</Text>
                <Text style={s.menuName} numberOfLines={1}>{menuVoucher?.name}</Text>
              </View>
            </View>
            <Pressable style={s.menuItem}
              onPress={() => { if (menuVoucher) { openEdit(menuVoucher); } setMenuVoucher(null); }}>
              <Feather name="edit-2" size={15} color={C.ink3} />
              <Text style={s.menuItemTxt}>Edit</Text>
            </Pressable>
            <Pressable style={s.menuItem}
              onPress={() => {
                if (menuVoucher) { void toggleDisabled(menuVoucher); }
                setMenuVoucher(null);
              }}>
              <Feather
                name={menuVoucher?.status === "disabled" ? "toggle-right" : "toggle-left"}
                size={15} color={C.ink3} />
              <Text style={s.menuItemTxt}>
                {menuVoucher?.status === "disabled" ? "Enable" : "Disable"}
              </Text>
            </Pressable>
            <View style={s.menuDivider} />
            <Pressable style={s.menuItem}
              onPress={() => { if (menuVoucher) { confirmDelete(menuVoucher); } setMenuVoucher(null); }}>
              <Feather name="trash-2" size={15} color={C.bad} />
              <Text style={[s.menuItemTxt, { color: C.bad }]}>Delete</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["C"]) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Summary bar
  summaryBar:   { flexDirection: "row", alignItems: "center", gap: 20, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.line },
  summaryPill:  { alignItems: "center", gap: 1 },
  summaryVal:   { color: C.ink, fontSize: 15, fontWeight: "700", fontFamily: MONO },
  summaryLabel: { color: C.ink4, fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase" as const },

  // Main tabs
  mainTabBar:      { flexDirection: "row", backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.line },
  mainTab:         { flex: 1, alignItems: "center", paddingVertical: 11 },
  mainTabActive:   { borderBottomWidth: 2, borderBottomColor: C.amber },
  mainTabTxt:      { color: C.ink3, fontSize: 13, fontWeight: "600" },
  mainTabTxtActive:{ color: C.amber },

  // Toolbar / search
  toolbar:    { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  searchWrap: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10 },
  searchIcon: { color: C.ink3, fontSize: 16, marginRight: 6 },
  searchInput:{ flex: 1, paddingVertical: 9, color: C.ink, fontSize: 14 },
  clearX:     { color: C.ink4, paddingHorizontal: 6 },

  // Status filter tabs
  tabsBar:    { flexGrow: 0, flexShrink: 0, backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  tabsContent:{ flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  statusTab:  { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.full, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  statusTabActive:      { backgroundColor: `${C.amber}18`, borderColor: `${C.amber}77` },
  statusTabTxt:         { color: C.ink2, fontSize: 13, fontWeight: "600" },
  statusTabTxtActive:   { color: C.amber, fontWeight: "700" },
  statusTabCount:       { paddingHorizontal: 7, paddingVertical: 2, borderRadius: R.full, backgroundColor: `${C.ink4}33` },
  statusTabCountActive: { backgroundColor: `${C.amber}33` },
  statusTabCountTxt:    { color: C.ink3, fontSize: 11, fontWeight: "700" },
  statusTabCountTxtActive: { color: C.amber },

  // Table
  tableHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  thTxt:       { color: C.ink4, fontSize: 9, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" as const, fontFamily: MONO },
  list:        { paddingBottom: 100 },

  // Column widths (shared by header + rows)
  colCode:     { flex: 2.5, paddingRight: 8 },
  colDiscount: { flex: 1.8, paddingRight: 8 },
  colRules:    { flex: 1.4, gap: 2, paddingRight: 8 },
  colUsage:    { width: 56, textAlign: "right" as const, paddingRight: 8 },
  colValid:    { width: 84, textAlign: "right" as const, paddingRight: 8 },
  colStatus:   { width: 88 },
  colAction:   { width: 32, alignItems: "center" as const },
  colTxt:      { color: C.ink3, fontSize: 12 },
  colTxtSm:    { color: C.ink4, fontSize: 11 },

  // Voucher rows
  voucherRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  voucherCode:{ color: C.ink, fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },
  voucherName:{ color: C.ink4, fontSize: 11, marginTop: 1 },
  ruleTag:    { backgroundColor: C.surface, borderRadius: R.sm, borderWidth: 1, borderColor: C.line, paddingHorizontal: 5, paddingVertical: 1 },
  ruleTagTxt: { color: C.ink4, fontSize: 9, fontWeight: "600" },

  // Status chip
  statusChip:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.full, borderWidth: 1, alignSelf: "flex-start" as const },
  statusChipTxt: { fontSize: 10, fontWeight: "700" },

  moreBtn: { padding: 4, borderRadius: R.md },

  // Empty / center
  center:   { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 60 },
  empty:    { color: C.ink4, fontSize: 13, textAlign: "center" },
  emptySub: { color: C.ink4, fontSize: 11, textAlign: "center" },

  // Checker tab
  checkerContent: { padding: 20, gap: 16, paddingBottom: 60 },
  checkerTitle:   { color: C.ink, fontSize: 18, fontWeight: "700" },
  checkerSub:     { color: C.ink4, fontSize: 13, lineHeight: 18 },
  checkerRow:     { flexDirection: "row", gap: 8, alignItems: "center" },
  checkBtn:       { backgroundColor: C.amber, borderRadius: R.md, paddingHorizontal: 18, paddingVertical: 11 },
  checkBtnTxt:    { color: "#000000", fontSize: 14, fontWeight: "700" },
  resultCard:     { borderRadius: R.xl, borderWidth: 1, backgroundColor: C.bg2, padding: 16, gap: 12 },
  resultCardRow:  { flexDirection: "row", alignItems: "center", gap: 12 },
  resultTitle:    { fontSize: 15, fontWeight: "700" },
  resultSub:      { color: C.ink4, fontSize: 12, marginTop: 2 },
  resultCode:     { color: C.ink, fontSize: 16, fontWeight: "800", letterSpacing: 0.4 },
  resultName:     { color: C.ink3, fontSize: 12, marginTop: 2 },
  reasonBanner:   { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: R.md, padding: 10 },
  reasonBannerTxt:{ fontSize: 12, flex: 1, lineHeight: 17 },
  resultDetails:  { gap: 6 },
  resultRow:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  resultLabel:    { color: C.ink4, fontSize: 12 },
  resultVal:      { color: C.ink, fontSize: 12, fontWeight: "600", fontFamily: MONO },
  subtotalTest:   { gap: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 },
  discountPreview:{ borderRadius: R.md, borderWidth: 1, padding: 12, alignItems: "center", gap: 4, backgroundColor: `${C.good}08` },
  discountPreviewLabel: { color: C.ink4, fontSize: 11 },
  discountPreviewAmt:   { fontSize: 22, fontWeight: "800", fontFamily: MONO },
  discountPreviewNote:  { fontSize: 11, textAlign: "center" as const },

  // Usage tab
  usageStats:      { flexDirection: "row", backgroundColor: C.bg2, borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 14, paddingHorizontal: 16 },
  usageStat:       { flex: 1, alignItems: "center", gap: 3 },
  usageStatDivider:{ width: 1, backgroundColor: C.line, marginVertical: 4 },
  usageStatVal:    { color: C.ink, fontSize: 15, fontWeight: "700", fontFamily: MONO },
  usageStatLabel:  { color: C.ink4, fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase" as const },
  redemptionRow:   { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.lineSoft, gap: 12 },
  redemptionDisc:  { fontSize: 14, fontWeight: "700", fontFamily: MONO },

  // Form modal
  modalBd:     { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 16 },
  sheet:       { backgroundColor: C.bg2, borderRadius: R.xl, maxHeight: "92%", overflow: "hidden", width: "100%", maxWidth: 640 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  // Generous bottom padding — Android's window-resize keyboard mode shrinks
  // the whole sheet, so fields near the end (valid-from/until dates, status)
  // need room to scroll clear above the keyboard instead of staying pinned
  // behind it.
  sheetContent:{ padding: 20, gap: 12, paddingBottom: 220 },
  sheetFooter: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, borderTopWidth: 1, borderTopColor: C.line },
  sheetTitle:  { color: C.ink, fontSize: 17, fontWeight: "700" },
  fieldLabel:  { color: C.ink3, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" as const, fontFamily: MONO, marginBottom: -6 },
  input:       { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 10, color: C.ink, fontSize: 14 },
  codeRow:     { flexDirection: "row", gap: 8 },
  genBtn:      { backgroundColor: C.surface, borderRadius: R.md, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, justifyContent: "center" },
  genBtnTxt:   { color: C.ink3, fontSize: 13, fontWeight: "600" },

  // Radio options
  radioOpt:       { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  radioOptActive: { borderColor: C.amber, backgroundColor: `${C.amber}0d` },
  radio:          { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.ink4, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  radioActive:    { borderColor: C.amber },
  radioDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: C.amber },
  radioLabel:     { color: C.ink2, fontSize: 13, fontWeight: "600" },
  radioLabelActive: { color: C.amber },
  radioDesc:      { color: C.ink4, fontSize: 11, marginTop: 1 },

  // Chip grid
  chipGrid:   { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.full, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  chipSel:    { backgroundColor: `${C.amber}22`, borderColor: `${C.amber}88` },
  chipTxt:    { color: C.ink3, fontSize: 12, fontWeight: "500" },
  chipTxtSel: { color: C.amber, fontWeight: "700" },

  switchRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  switchLabel: { color: C.ink2, fontSize: 14, fontWeight: "500" },

  // Action menu
  menuHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  menuCode:   { color: C.ink, fontSize: 15, fontWeight: "700" },
  menuName:   { color: C.ink4, fontSize: 12, marginTop: 2 },
  menuItem:   { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  menuItemTxt:{ color: C.ink2, fontSize: 14, fontWeight: "500" },
  menuDivider:{ height: 1, backgroundColor: C.lineSoft, marginHorizontal: 16 },

  addBtn:    { backgroundColor: C.amber, borderRadius: R.full, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnTxt: { color: "#000000", fontSize: 12, fontWeight: "700" },
  primaryBtn:    { backgroundColor: C.good, borderRadius: R.md, padding: 14, alignItems: "center" },
  primaryBtnTxt: { color: "#000000", fontSize: 15, fontWeight: "700" },
  footerPrimaryBtn:    { backgroundColor: C.good, borderRadius: R.cta, padding: 14, alignItems: "center" },
  footerPrimaryBtnTxt: { color: "#000000", fontSize: 15, fontWeight: "700" },
});

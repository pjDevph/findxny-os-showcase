import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { invokeFn } from "../../services/supabase";
import { useAppAlert } from "../ui/AppAlertProvider";
import { useToast } from "../ui/ToastProvider";
import {
  loadPaymentConfig, savePaymentConfig, paymentConfigFromWorkspace,
  type PaymentConfig, EMPTY_PAYMENT_CONFIG,
} from "../payments/paymentConfig";
import {
  loadReceiptConfig, saveReceiptConfig, receiptConfigFromWorkspace,
  type ReceiptConfig, EMPTY_RECEIPT_CONFIG,
} from "../receipt/receiptConfig";
import { updatePrinterConfig, type ReceiptMode } from "../receipt/printerConfig";
import { sanitizePercent } from "../utils/inputSanitizers";
import type { WorkspaceInfo } from "./types";

export function useWorkspaceSettings(activeWorkspaceId: string | null | undefined) {
  const { showAlert } = useAppAlert();
  const { showToast } = useToast();

  const [info, setInfo] = useState<WorkspaceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", tax_rate: "0.12", service_rate: "0" });
  const [vatEnabled, setVatEnabled] = useState(true);
  const [svcEnabled, setSvcEnabled] = useState(true);
  const [dirty, setDirty] = useState(false);

  const [payConfig, setPayConfig] = useState<PaymentConfig>(EMPTY_PAYMENT_CONFIG);
  const [payDirty, setPayDirty] = useState(false);
  const [expandedPay, setExpandedPay] = useState<string | null>(null);

  const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig>(EMPTY_RECEIPT_CONFIG);
  const [receiptDirty, setReceiptDirty] = useState(false);

  const [bookingForm, setBookingForm] = useState({ hold_minutes: "", slot_minutes: "" });
  const [bookingDirty, setBookingDirty] = useState(false);

  function applyWorkspaceData(d: WorkspaceInfo) {
    setInfo(d);
    // `?? ` already defaults a genuinely-missing rate to the fallback below —
    // re-applying `sr > 0 ? sr : 0.10` on top of that was clobbering a real,
    // intentionally-disabled 0% rate back to 10% every time settings loaded,
    // so re-enabling the toggle silently brought back a service charge the
    // owner never asked for.
    const tr = Number(d.tax_rate ?? 0.12);
    const sr = Number(d.service_rate ?? 0);
    setVatEnabled(tr > 0);
    setSvcEnabled(sr > 0);
    setForm({
      name: d.name ?? "",
      phone: d.phone ?? "",
      tax_rate: String(tr),
      service_rate: String(sr),
    });
    const rc = receiptConfigFromWorkspace(d);
    const pc = paymentConfigFromWorkspace(d);
    setReceiptConfig(rc);
    setPayConfig(pc);
    saveReceiptConfig(rc).catch(console.error);
    savePaymentConfig(pc).catch(console.error);
    setBookingForm({
      hold_minutes: d.hold_minutes != null ? String(d.hold_minutes) : "",
      slot_minutes: d.slot_minutes != null ? String(d.slot_minutes) : "",
    });
  }

  useEffect(() => {
    if (!activeWorkspaceId) return;
    const cacheKey = `pos_settings_workspace_v1_${activeWorkspaceId}`;
    let cancelled = false;
    // Paint from whatever's cached first (works offline, and avoids a blank
    // form flash while online too) — the live fetch below still runs and
    // overwrites it with the current server values when it succeeds.
    AsyncStorage.getItem(cacheKey).then((cached) => {
      if (cancelled || !cached) return;
      try { applyWorkspaceData(JSON.parse(cached) as WorkspaceInfo); } catch { /* corrupt cache */ }
    });
    invokeFn<{ "settings-workspace": WorkspaceInfo }>("pos-data", { workspace_id: activeWorkspaceId, resource: "settings-workspace", params: { id: activeWorkspaceId } })
      .then(({ data: raw }) => {
        if (cancelled) return;
        const data = raw?.["settings-workspace"] ?? null;
        // No data typically means the fetch failed (offline — invokeFn never
        // throws, it resolves {data:null,error}) — leave the cache-painted
        // values (or the blank defaults, if nothing was ever cached) alone
        // rather than clobbering them.
        if (data) {
          applyWorkspaceData(data);
          AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {});
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  useEffect(() => { loadPaymentConfig().then(setPayConfig); }, []);
  useEffect(() => { loadReceiptConfig().then(setReceiptConfig); }, []);

  function updatePay(key: keyof PaymentConfig, val: string) {
    setPayConfig((p) => ({ ...p, [key]: val }));
    setPayDirty(true);
  }

  function updateReceipt(key: keyof ReceiptConfig, val: string) {
    setReceiptConfig((r) => ({ ...r, [key]: val }));
    setReceiptDirty(true);
  }

  /** Save accreditation field immediately to AsyncStorage (no server sync needed). */
  async function saveAccredField(key: keyof ReceiptConfig, val: string) {
    const updated = { ...receiptConfig, [key]: val };
    setReceiptConfig(updated);
    await saveReceiptConfig({ [key]: val });
  }

  /** Whether all 5 BIR accreditation fields are filled. */
  const accredComplete = !!(
    receiptConfig.ptu_no?.trim() &&
    receiptConfig.min_no?.trim() &&
    receiptConfig.serial_series?.trim() &&
    receiptConfig.accred_date?.trim() &&
    receiptConfig.accred_no?.trim()
  );

  function update(key: keyof typeof form, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
    setDirty(true);
  }

  /** Edit a rate as a percent (UI) while storing the decimal in form state. */
  function updatePct(key: "tax_rate" | "service_rate", pctStr: string) {
    const n = parseFloat(sanitizePercent(pctStr));
    update(key, isNaN(n) ? "0" : String(+(n / 100).toFixed(4)));
  }
  const asPct = (decStr: string) => {
    const n = parseFloat(decStr);
    return isNaN(n) ? "" : String(+(n * 100).toFixed(2));
  };

  function enableVat() { setVatEnabled(true); setDirty(true); }
  function disableVat() {
    showAlert("Disable VAT?", "VAT will be removed from all new orders. This affects totals.", [
      { text: "Cancel", style: "cancel" },
      { text: "Disable", style: "destructive", onPress: () => { setVatEnabled(false); setDirty(true); } },
    ]);
  }
  function enableSvc() { setSvcEnabled(true); setDirty(true); }
  function disableSvc() {
    showAlert("Disable Service Charge?", "Service charge will be removed from all new orders.", [
      { text: "Cancel", style: "cancel" },
      { text: "Disable", style: "destructive", onPress: () => { setSvcEnabled(false); setDirty(true); } },
    ]);
  }

  function handleReceiptModeChange(m: ReceiptMode) {
    if (m === "official") {
      if (!accredComplete) {
        showToast({
          title: "Accreditation Incomplete",
          message: "Fill in all BIR Accreditation fields below before enabling Official Invoice Mode.",
          type: "error",
        });
        return;
      }
      showAlert(
        "Switch to Official Invoice Mode?",
        "Official mode prints TIN, VAT, and Service Charge. Make sure TIN is set in Store Profile.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Switch to Official", onPress: () => { updatePrinterConfig({ receiptMode: m }).catch(console.error); } },
        ],
      );
    } else {
      showAlert(
        "Switch to Simple Receipt?",
        "Simple mode hides TIN, VAT, and Service Charge rows. The totals are still correct.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Switch to Simple", onPress: () => { updatePrinterConfig({ receiptMode: m }).catch(console.error); } },
        ],
      );
    }
  }

  const anyDirty = dirty || payDirty || receiptDirty || bookingDirty;

  async function saveProfileAndReceipt() {
    const taxRate = vatEnabled ? (Number.parseFloat(form.tax_rate) || 0) : 0;
    const svcRate = svcEnabled ? (Number.parseFloat(form.service_rate) || 0) : 0;
    const { error } = await invokeFn("workspaces-update", {
      workspace_id: activeWorkspaceId,
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      tax_rate: taxRate,
      service_rate: svcRate,
      receipt_address: receiptConfig.address,
      receipt_tin: receiptConfig.tin,
      receipt_footer: receiptConfig.footer,
      receipt_wifi_ssid: receiptConfig.wifiSsid,
      receipt_wifi_cred: receiptConfig.wifiCred,
      receipt_promo_line: receiptConfig.promoLine,
      receipt_logo: receiptConfig.receiptLogo,
      receipt_order_prefix: receiptConfig.orderNoPrefix,
    });
    if (error) throw error;
    await saveReceiptConfig(receiptConfig);
    setDirty(false);
    setReceiptDirty(false);
  }

  async function saveReceiptOnly() {
    const { error } = await invokeFn("workspaces-update", {
      workspace_id: activeWorkspaceId,
      receipt_address: receiptConfig.address,
      receipt_tin: receiptConfig.tin,
      receipt_footer: receiptConfig.footer,
      receipt_wifi_ssid: receiptConfig.wifiSsid,
      receipt_wifi_cred: receiptConfig.wifiCred,
      receipt_promo_line: receiptConfig.promoLine,
      receipt_logo: receiptConfig.receiptLogo,
      receipt_order_prefix: receiptConfig.orderNoPrefix,
    });
    if (error) throw error;
    await saveReceiptConfig(receiptConfig);
    setReceiptDirty(false);
  }

  async function savePaymentOnly() {
    const { error } = await invokeFn("workspaces-update", {
      workspace_id: activeWorkspaceId,
      payment_config: payConfig,
    });
    if (error) throw error;
    await savePaymentConfig(payConfig);
    setPayDirty(false);
  }

  async function saveBookingOnly() {
    const holdMin = Number.parseInt(bookingForm.hold_minutes, 10);
    const slotMin = Number.parseInt(bookingForm.slot_minutes, 10);
    const { error } = await invokeFn("workspaces-update", {
      workspace_id: activeWorkspaceId,
      ...(Number.isFinite(holdMin) ? { hold_minutes: holdMin } : {}),
      ...(Number.isFinite(slotMin) ? { slot_minutes: slotMin } : {}),
    });
    if (error) throw error;
    setBookingDirty(false);
  }

  async function saveAll(onValidationError: () => void) {
    if (!form.name.trim()) { showToast({ title: "Error", message: "Store name is required.", type: "error" }); onValidationError(); return; }
    setSaving(true);
    try {
      if (dirty) await saveProfileAndReceipt();
      if (receiptDirty) await saveReceiptOnly();
      if (payDirty) await savePaymentOnly();
      if (bookingDirty) await saveBookingOnly();
      showToast({ title: "Saved", message: "Settings updated for all devices.", type: "success" });
    } catch (e: any) {
      showToast({ title: "Error", message: e?.message ?? "Failed to save", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  function discardAll() {
    if (!info) return;
    const tr = Number(info.tax_rate ?? 0.12);
    const sr = Number(info.service_rate ?? 0);
    setVatEnabled(tr > 0);
    setSvcEnabled(sr > 0);
    setForm({
      name: info.name ?? "", phone: info.phone ?? "",
      tax_rate: String(tr), service_rate: String(sr),
    });
    setReceiptConfig(receiptConfigFromWorkspace(info));
    setPayConfig(paymentConfigFromWorkspace(info));
    setBookingForm({
      hold_minutes: info.hold_minutes != null ? String(info.hold_minutes) : "",
      slot_minutes: info.slot_minutes != null ? String(info.slot_minutes) : "",
    });
    setDirty(false); setReceiptDirty(false); setPayDirty(false); setBookingDirty(false);
  }

  const vatPct = vatEnabled ? Math.round((parseFloat(form.tax_rate) || 0) * 100) : 0;
  const svcPct = svcEnabled ? Math.round((parseFloat(form.service_rate) || 0) * 100) : 0;
  const paymentsSet = [payConfig.gcashNumber, payConfig.mayaNumber, payConfig.qrphInfo, payConfig.bankAccountNumber].filter((v) => v?.trim()).length;

  return {
    info, loading, saving,
    form, update, vatEnabled, svcEnabled, enableVat, disableVat, enableSvc, disableSvc,
    updatePct, asPct, vatPct, svcPct,
    payConfig, updatePay, payDirty, expandedPay, setExpandedPay, paymentsSet,
    receiptConfig, updateReceipt, receiptDirty, saveAccredField, accredComplete,
    bookingForm, setBookingForm, bookingDirty, setBookingDirty,
    handleReceiptModeChange,
    dirty, anyDirty, saveAll, discardAll,
  };
}

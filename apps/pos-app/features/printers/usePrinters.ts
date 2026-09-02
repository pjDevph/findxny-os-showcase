import { useCallback, useEffect, useState } from "react";
import { invokeFn } from "../../services/supabase";
import { EscPrinterNative } from "../../modules/esc-printer";
import { useAppAlert } from "../ui/AppAlertProvider";
import { useToast } from "../ui/ToastProvider";
import { applyPrintersPayload, buildPrinterSavePayload, persistPrinter, validatePrinterForm } from "./printerHelpers";
import {
  DEFAULT_ROUTING, DEFAULT_TEMPLATE, EMPTY_FORM,
  type Category, type LabelTemplate, type LoadedPrintersPayload, type Printer, type PrinterForm, type RoutingConfig,
} from "./types";

/** Loads and manages the printer list (plus the routing/label-template config
 *  and category list that ride along in the same "printers-load" fetch), and
 *  owns printer CRUD (add/edit/delete/toggle/set-default). */
export function usePrinters(activeWorkspaceId: string | null | undefined) {
  const { showAlert } = useAppAlert();
  const { showToast } = useToast();

  const [printers, setPrinters] = useState<Printer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [routing, setRouting] = useState<RoutingConfig>(DEFAULT_ROUTING);
  const [template, setTemplate] = useState<LabelTemplate>(DEFAULT_TEMPLATE);
  const [usbOnline, setUsbOnline] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PrinterForm>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);

  const loadAll = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const { data, error } = await invokeFn<{ "printers-load": LoadedPrintersPayload }>("pos-data", {
        workspace_id: activeWorkspaceId, resource: "printers-load",
      });
      if (error) throw error;
      const payload = data?.["printers-load"];
      if (!payload) throw new Error("No data returned");
      applyPrintersPayload(payload, setPrinters, setRouting, setTemplate, setCategories, DEFAULT_ROUTING, DEFAULT_TEMPLATE);
    } catch (e: any) {
      showToast({ title: "Error", message: "Failed to load printer settings: " + e?.message, type: "error" });
    } finally {
      setLoading(false);
    }
    // Refresh USB online status (best-effort, don't block or alert on failure)
    if (EscPrinterNative?.listUsbPrinters) {
      EscPrinterNative.listUsbPrinters()
        .then(devs => setUsbOnline(new Set(devs.map(d => d.address))))
        .catch(() => {});
    }
  }, [activeWorkspaceId]);

  useEffect(() => { if (activeWorkspaceId) loadAll(); }, [activeWorkspaceId, loadAll]);

  function openAddForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEditForm(p: Printer) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      type: p.type,
      connection: p.connection,
      mac_address: p.mac_address ?? "",
      ip_address: p.ip_address ?? "",
    });
    setShowForm(true);
  }

  function closeForm() { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }

  function updForm<K extends keyof PrinterForm>(k: K, v: PrinterForm[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function savePrinter() {
    const validationError = validatePrinterForm(form);
    if (validationError) { showToast({ title: "Error", message: validationError, type: "error" }); return; }
    setSaving(true);
    try {
      const payload = buildPrinterSavePayload(activeWorkspaceId, form);
      await persistPrinter(editingId, payload);
      await loadAll();
      closeForm();
    } catch (e: any) {
      showToast({ title: "Error", message: e?.message ?? "Failed to save printer", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function togglePrinter(id: string, enabled: boolean) {
    try {
      const { error } = await invokeFn("printers-update-meta", {
        workspace_id: activeWorkspaceId, printer_id: id, is_enabled: enabled,
      });
      if (error) throw error;
      await loadAll();
    } catch (e: any) {
      showToast({ title: "Error", message: e?.message ?? "Failed to toggle printer", type: "error" });
    }
  }

  async function setAsDefault(id: string) {
    try {
      const { error } = await invokeFn("printers-update-meta", {
        workspace_id: activeWorkspaceId, printer_id: id, set_as_default: true,
      });
      if (error) throw error;
      await loadAll();
    } catch (e: any) {
      showToast({ title: "Error", message: e?.message ?? "Failed to set default", type: "error" });
    }
  }

  async function deletePrinter(id: string) {
    setDeleting(id);
    try {
      const { data, error } = await invokeFn<{ ok?: boolean }>("printers-delete", { workspace_id: activeWorkspaceId, printer_id: id });
      if (error || !data?.ok) throw error ?? new Error("Failed to delete printer");
      await loadAll();
    } catch (e: any) {
      showToast({ title: "Error", message: e?.message ?? "Failed to delete printer", type: "error" });
    } finally {
      setDeleting(null);
    }
  }

  function confirmDelete(p: Printer) {
    showAlert("Remove Printer?", `Remove "${p.name}" from your workspace?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => { deletePrinter(p.id).catch(console.error); } },
    ]);
  }

  return {
    printers, categories, routing, setRouting, template, setTemplate, usbOnline,
    loading, saving, deleting, editingId, form, setForm, showForm,
    loadAll, openAddForm, openEditForm, closeForm, updForm, savePrinter,
    togglePrinter, setAsDefault, deletePrinter, confirmDelete,
  };
}

import { View, Text, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useMemo, useCallback } from "react";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../../features/auth/AuthContext";
import { useTheme } from "../../features/theme/ThemeContext";
import { WRITE_ROLES } from "../../features/constants";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { KeyboardAwareScrollView } from "../../features/ui/KeyboardAwareScrollView";
import { useAppAlert } from "../../features/ui/AppAlertProvider";
import { useCustomerDisplayConfig } from "../../features/customerDisplay/config";
import { usePrinterConfig } from "../../features/receipt/printerConfig";
import { makeStyles } from "../../features/settings/settingsScreenStyles";
import { useWorkspaceSettings } from "../../features/settings/useWorkspaceSettings";
import { useBranchOperations } from "../../features/settings/useBranchOperations";
import { useApprovalCode } from "../../features/settings/useApprovalCode";
import { SettingsNav } from "../../features/settings/SettingsNav";
import { ProfileSection } from "../../features/settings/sections/ProfileSection";
import { TaxesSection } from "../../features/settings/sections/TaxesSection";
import { PaymentsSection } from "../../features/settings/sections/PaymentsSection";
import { PrintersSection } from "../../features/settings/sections/PrintersSection";
import { ReceiptSection } from "../../features/settings/sections/ReceiptSection";
import { BranchSection } from "../../features/settings/sections/BranchSection";
import { ApprovalSection } from "../../features/settings/sections/ApprovalSection";
import { BookingSection } from "../../features/settings/sections/BookingSection";
import { DisplaySection } from "../../features/settings/sections/DisplaySection";
import { AppearanceSection } from "../../features/settings/sections/AppearanceSection";
import { AboutSection } from "../../features/settings/sections/AboutSection";
import type { SectionDef, SectionId } from "../../features/settings/types";
import { CachedDataBanner } from "../../features/offline/CachedDataBanner";

export default function SettingsScreen() {
  const { activeWorkspaceId, role } = useAuth();
  const { C, themeId, themes } = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const s = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const canEdit = role != null && role.toLowerCase() === "owner";
  const canEditBranch = role != null && (WRITE_ROLES as readonly string[]).includes(role.toLowerCase());
  const canEditApprovalCode = role != null && ["owner", "admin"].includes(role.toLowerCase());
  const cdConfig = useCustomerDisplayConfig();
  const printerCfg = usePrinterConfig();
  const { showAlert } = useAppAlert();

  const settings = useWorkspaceSettings(activeWorkspaceId);
  const branchApi = useBranchOperations(activeWorkspaceId, canEditBranch);
  const approvalApi = useApprovalCode(activeWorkspaceId, canEditApprovalCode);

  const anyDirty = settings.anyDirty && canEdit;

  // Section navigation. Wide layout always shows a section; narrow shows a list first.
  const [activeSection, setActiveSection] = useState<SectionId | null>(null);

  function discardAll() { settings.discardAll(); }

  function navigate(id: SectionId | null) {
    if (anyDirty) {
      showAlert(
        "Unsaved Changes",
        "You have unsaved changes. Save them first or discard to continue.",
        [
          { text: "Keep Editing", style: "cancel" },
          { text: "Discard & Switch", style: "destructive", onPress: () => { discardAll(); setActiveSection(id); } },
        ],
      );
      return;
    }
    setActiveSection(id);
  }

  const idleLabel: Record<string, string> = { logo: "Logo", image: "Promo", slideshow: "Slideshow", qr: "QR order" };

  const sectionStatus = useCallback((id: SectionId): { text: string; warn?: boolean } => {
    switch (id) {
      case "profile": return settings.form.name.trim() ? { text: settings.form.name.trim() } : { text: "Missing name", warn: true };
      case "taxes": return { text: settings.vatEnabled ? `VAT ${settings.vatPct}%` : "VAT off" };
      case "payments": return settings.paymentsSet ? { text: `${settings.paymentsSet} set` } : { text: "None set", warn: true };
      case "receipt": return settings.receiptConfig.tin?.trim() ? { text: "Ready" } : { text: "Missing TIN", warn: true };
      case "printers": return { text: "Manage" };
      case "branch": return { text: `${branchApi.branches.length} branch${branchApi.branches.length !== 1 ? "es" : ""}` };
      case "approval": return approvalApi.hasApprovalCode ? { text: "Set" } : { text: "Not set", warn: true };
      case "booking": return settings.bookingForm.hold_minutes ? { text: `${settings.bookingForm.hold_minutes}m hold` } : { text: "Not configured" };
      case "display": return { text: cdConfig.enabled ? idleLabel[cdConfig.idleMode] : "Off" };
      case "appearance": return { text: themes.find((t) => t.id === themeId)?.name ?? "Theme" };
      case "about": return { text: (role ?? "—").toString() };
      default: return { text: "" };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.form.name, settings.vatEnabled, settings.vatPct, settings.paymentsSet, settings.receiptConfig.tin,
    branchApi.branches.length, approvalApi.hasApprovalCode, settings.bookingForm.hold_minutes, cdConfig, themes, themeId, role]);

  const SECTIONS: SectionDef[] = useMemo(() => {
    const base: SectionDef[] = [
      { id: "profile", label: "Store Profile", icon: "home" },
      { id: "taxes", label: "Taxes & Charges", icon: "percent" },
      { id: "payments", label: "Payment Methods", icon: "credit-card" },
      { id: "receipt", label: "Receipt", icon: "file-text" },
      { id: "printers", label: "Printers", icon: "printer" },
    ];
    if (canEditBranch) base.push({ id: "branch", label: "Branch Operations", icon: "shopping-bag" });
    if (canEditApprovalCode) base.push({ id: "approval", label: "Approval Code", icon: "shield" });
    base.push(
      { id: "booking", label: "Booking Rules", icon: "calendar" },
      { id: "display", label: "Customer Display", icon: "monitor" },
      { id: "appearance", label: "Appearance", icon: "droplet" },
      { id: "about", label: "Device & Info", icon: "info" },
    );
    return base;
  }, [canEditBranch, canEditApprovalCode]);

  // On wide screens always have a section selected.
  const wideSection: SectionId = activeSection ?? "profile";

  if (settings.loading) {
    return (
      <View style={s.root}>
        <PosScreenHeader title="Store Settings" />
        <CachedDataBanner />
        <View style={s.center}><ActivityIndicator color={C.amber} /></View>
      </View>
    );
  }

  const stickyBar = anyDirty ? (
    <View style={[s.stickyBar, { paddingBottom: insets.bottom + 12 }]}>
      <View style={s.unsavedWrap}>
        <View style={s.unsavedDot} />
        <Text style={s.unsavedTxt}>Unsaved changes</Text>
      </View>
      <Pressable style={s.discardBtn} onPress={discardAll} disabled={settings.saving}>
        <Text style={s.discardTxt}>Discard</Text>
      </Pressable>
      <Pressable style={[s.saveBtn, settings.saving && { opacity: 0.6 }]}
        onPress={() => settings.saveAll(() => setActiveSection("profile"))} disabled={settings.saving}>
        <Feather name="check" size={15} color="#000000" />
        <Text style={s.saveTxt}>{settings.saving ? "Saving…" : "Save Changes"}</Text>
      </Pressable>
    </View>
  ) : null;

  const navList = (
    <SettingsNav
      sections={SECTIONS} isWide={isWide} activeId={isWide ? wideSection : null}
      getStatus={sectionStatus} onNavigate={navigate} s={s}
    />
  );

  function renderSection(id: SectionId) {
    switch (id) {
      case "profile": return <ProfileSection settings={settings} canEdit={canEdit} s={s} />;
      case "taxes": return <TaxesSection settings={settings} canEdit={canEdit} s={s} />;
      case "payments": return <PaymentsSection settings={settings} s={s} />;
      case "printers": return <PrintersSection canEdit={canEdit} s={s} />;
      case "receipt": return <ReceiptSection settings={settings} printerCfg={printerCfg} canEdit={canEdit} s={s} />;
      case "branch": return <BranchSection branchApi={branchApi} canEditApprovalCode={canEditApprovalCode} s={s} />;
      case "approval": return <ApprovalSection approvalApi={approvalApi} s={s} />;
      case "booking": return <BookingSection settings={settings} canEditBooking={canEditBranch} s={s} />;
      case "display": return <DisplaySection s={s} />;
      case "appearance": return <AppearanceSection s={s} />;
      case "about": return <AboutSection info={settings.info} role={role} canEdit={canEdit} s={s} />;
    }
  }

  const content = (id: SectionId) => (
    <KeyboardAwareScrollView
      contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      {!isWide && (
        <Pressable style={s.backToList} onPress={() => navigate(null)}>
          <Feather name="chevron-left" size={16} color={C.amber} />
          <Text style={s.backToListTxt}>All settings</Text>
        </Pressable>
      )}
      {renderSection(id)}
      <View style={{ height: anyDirty ? 80 : 24 }} />
    </KeyboardAwareScrollView>
  );

  return (
    <View style={s.root}>
      <PosScreenHeader title="Store Settings" />
      <CachedDataBanner />
      {isWide ? (
        <View style={s.wideBody}>
          {navList}
          <View style={{ flex: 1 }}>{content(wideSection)}</View>
        </View>
      ) : activeSection == null ? (
        <KeyboardAwareScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {navList}
          <View style={{ height: anyDirty ? 80 : 24 }} />
        </KeyboardAwareScrollView>
      ) : (
        content(activeSection)
      )}
      {stickyBar}
    </View>
  );
}

import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { usePrinterConfig } from "../../features/receipt/printerConfig";
import { useAuth } from "../../features/auth/AuthContext";
import { useTheme } from "../../features/theme/ThemeContext";
import { PosScreenHeader } from "../../features/ui/PosScreenHeader";
import { makeStyles } from "../../features/printers/printersScreenStyles";
import { usePrinters } from "../../features/printers/usePrinters";
import { useDeviceScan } from "../../features/printers/useDeviceScan";
import { usePrinterTest } from "../../features/printers/usePrinterTest";
import { useRoutingConfig } from "../../features/printers/useRoutingConfig";
import { useLabelTemplateConfig } from "../../features/printers/useLabelTemplateConfig";
import { DevicesTab } from "../../features/printers/components/DevicesTab";
import { RoutingTab } from "../../features/printers/components/RoutingTab";
import { TemplatesTab } from "../../features/printers/components/TemplatesTab";
import { TroubleshootTab } from "../../features/printers/components/TroubleshootTab";
import type { Tab } from "../../features/printers/types";

const TABS: { id: Tab; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: "devices", label: "Devices", icon: "printer" },
  { id: "routing", label: "Routing", icon: "share-2" },
  { id: "templates", label: "Labels", icon: "tag" },
  { id: "troubleshoot", label: "Troubleshoot", icon: "tool" },
];

export default function PrintersScreen() {
  const { activeWorkspaceId, role } = useAuth();
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(C), [C]);
  const canEdit = role != null && ["owner", "admin"].includes(role.toLowerCase());
  const localPrinter = usePrinterConfig();

  const [activeTab, setActiveTab] = useState<Tab>("devices");

  const printersApi = usePrinters(activeWorkspaceId);
  const { printers, categories, routing, setRouting, template, setTemplate, loading } = printersApi;

  const deviceScan = useDeviceScan(printersApi.setForm);
  const testApi = usePrinterTest(activeWorkspaceId, printers, routing, template, printersApi.loadAll);
  const routingApi = useRoutingConfig(activeWorkspaceId, routing, setRouting, printers);
  const templateApi = useLabelTemplateConfig(activeWorkspaceId, template);

  const printerName = (id: string) => printers.find(p => p.id === id)?.name ?? "—";

  if (loading) {
    return (
      <View style={s.root}>
        <PosScreenHeader title="Printer Management" />
        <View style={s.center}><ActivityIndicator color={C.amber} /></View>
      </View>
    );
  }

  const labelPrinters = printers.filter(p => p.type === "label" && p.is_enabled);
  const kitchenPrinters = printers.filter(p => p.type === "kitchen" && p.is_enabled);

  return (
    <View style={s.root}>
      <PosScreenHeader title="Printer Management" />

      {!canEdit && (
        <View style={s.noEditBanner}>
          <Feather name="lock" size={13} color={C.ink4} />
          <Text style={s.noEditTxt}>View only. Only owner or admin can edit printer settings.</Text>
        </View>
      )}

      <View style={s.tabBar}>
        {TABS.map(tab => (
          <Pressable key={tab.id} style={[s.tabItem, activeTab === tab.id && s.tabItemActive]} onPress={() => setActiveTab(tab.id)}>
            <Feather name={tab.icon} size={14} color={activeTab === tab.id ? C.amber : C.ink4} />
            <Text style={[s.tabTxt, activeTab === tab.id && s.tabTxtActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "devices" && (
        <DevicesTab printersApi={printersApi} deviceScan={deviceScan} testApi={testApi} canEdit={canEdit} bottomPad={insets.bottom} s={s} />
      )}
      {activeTab === "routing" && (
        <RoutingTab
          routing={routing} setRouting={setRouting} localPrinter={localPrinter} canEdit={canEdit}
          labelPrinters={labelPrinters} kitchenPrinters={kitchenPrinters} categories={categories}
          routingApi={routingApi} printerName={printerName} s={s}
        />
      )}
      {activeTab === "templates" && (
        <TemplatesTab template={template} setTemplate={setTemplate} canEdit={canEdit} templateApi={templateApi} s={s} />
      )}
      {activeTab === "troubleshoot" && (
        <TroubleshootTab printers={printers} routing={routing} testApi={testApi} s={s} />
      )}
    </View>
  );
}

import { Pressable, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { KeyboardAwareScrollView } from "../../ui/KeyboardAwareScrollView";
import { ConnectionFields } from "../ConnectionFields";
import { DeviceScanPicker } from "../DeviceScanPicker";
import { FFld } from "../FFld";
import { PrinterListItem } from "../PrinterListItem";
import { connLabel, typeLabel, validatePrinterForm } from "../printerHelpers";
import { useBuiltInPrinterLabel } from "../useBuiltInPrinterLabel";
import type { makeStyles } from "../printersScreenStyles";
import type { usePrinters } from "../usePrinters";
import type { useDeviceScan } from "../useDeviceScan";
import type { usePrinterTest } from "../usePrinterTest";

interface Props {
  readonly printersApi: ReturnType<typeof usePrinters>;
  readonly deviceScan: ReturnType<typeof useDeviceScan>;
  readonly testApi: ReturnType<typeof usePrinterTest>;
  readonly canEdit: boolean;
  readonly bottomPad: number;
  readonly s: ReturnType<typeof makeStyles>;
}

export function DevicesTab({ printersApi, deviceScan, testApi, canEdit, bottomPad, s }: Props) {
  const { C } = useTheme();
  const {
    printers, usbOnline, saving, deleting, editingId, form, showForm,
    openAddForm, closeForm, updForm, savePrinter, togglePrinter, setAsDefault, openEditForm, confirmDelete,
  } = printersApi;
  const { testing, testPrinter } = testApi;
  const builtInLabel = useBuiltInPrinterLabel();

  return (
    <KeyboardAwareScrollView contentContainerStyle={[s.scrollPad, { paddingBottom: bottomPad + 100 }]}>
      <View style={s.builtinCard}>
        <View style={s.builtinIconWrap}>
          <Feather name="printer" size={22} color={C.amber} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={s.builtinName}>{builtInLabel.full}</Text>
            <View style={[s.badge, { backgroundColor: `${C.good}22` }]}>
              <Text style={[s.badgeTxt, { color: C.good }]}>ALWAYS ON</Text>
            </View>
          </View>
          <Text style={s.builtinSub}>Thermal · Built into this device · Receipts only</Text>
        </View>
      </View>

      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>External Printers</Text>
        {canEdit && (
          <Pressable style={s.addBtn} onPress={() => { deviceScan.resetDetected(); openAddForm(); }} disabled={showForm}>
            <Feather name="plus" size={15} color="#000000" />
            <Text style={s.addBtnTxt}>Add Printer</Text>
          </Pressable>
        )}
      </View>

      {printers.length === 0 && !showForm ? (
        <View style={s.emptyState}>
          <Feather name="inbox" size={36} color={C.ink4} />
          <Text style={s.emptyTxt}>No external printers yet</Text>
          <Text style={s.emptySub}>
            Add a label printer to print drink labels,{"\n"}
            or a receipt printer for a second terminal.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {printers.map(p => (
            <PrinterListItem
              key={p.id}
              p={p} s={s} canEdit={canEdit} testing={testing} deleting={deleting} usbOnlineAddrs={usbOnline}
              onToggle={(id, v) => { togglePrinter(id, v).catch(console.error); }}
              onTest={(id) => { testPrinter(id).catch(console.error); }}
              onSetDefault={(id) => { setAsDefault(id).catch(console.error); }}
              onEdit={(printer) => { deviceScan.resetDetected(); openEditForm(printer); }}
              onDelete={confirmDelete}
            />
          ))}
        </View>
      )}

      {showForm && (
        <View style={s.formCard}>
          <View style={s.formHead}>
            <Text style={s.formTitle}>{editingId ? "Edit Printer" : "Add External Printer"}</Text>
            <Pressable onPress={closeForm} disabled={saving} hitSlop={8}>
              <Feather name="x" size={20} color={C.ink3} />
            </Pressable>
          </View>

          <FFld label="Printer Name" required>
            <TextInput
              style={s.input}
              value={form.name}
              onChangeText={v => updForm("name", v)}
              placeholder="e.g. Drink Label Printer"
              placeholderTextColor={C.ink4}
              editable={canEdit}
              maxLength={60}
            />
          </FFld>

          <FFld label="Type">
            <View style={s.chipRow}>
              {(["receipt", "label", "kitchen"] as const).map(t => (
                <Pressable key={t} style={[s.chip, form.type === t && s.chipActive]} onPress={() => updForm("type", t)} disabled={!canEdit}>
                  <Text style={[s.chipTxt, form.type === t && s.chipTxtActive]}>{typeLabel(t)}</Text>
                </Pressable>
              ))}
            </View>
          </FFld>

          <FFld label="Connection">
            <View style={s.chipRow}>
              {(["network", "bluetooth", "usb", "builtin"] as const).map(c => (
                <Pressable
                  key={c}
                  style={[s.chip, form.connection === c && s.chipActive]}
                  onPress={() => { updForm("connection", c); deviceScan.resetDetected(); }}
                  disabled={!canEdit}
                >
                  <Text style={[s.chipTxt, form.connection === c && s.chipTxtActive]}>{connLabel(c)}</Text>
                </Pressable>
              ))}
            </View>
          </FFld>

          <ConnectionFields form={form} s={s} canEdit={canEdit} updForm={updForm} />

          {(form.connection === "usb" || form.connection === "bluetooth") && canEdit && !form.mac_address && (
            <DeviceScanPicker connection={form.connection} deviceScan={deviceScan} s={s} />
          )}

          <View style={s.formActions}>
            <Pressable style={[s.formBtn, { backgroundColor: C.line, flex: 1 }]} onPress={closeForm} disabled={saving}>
              <Text style={[s.formBtnTxt, { color: C.ink }]}>Discard</Text>
            </Pressable>
            <Pressable
              style={[s.formBtn, { backgroundColor: C.good, flex: 1 }, (saving || !!validatePrinterForm(form)) && { opacity: 0.6 }]}
              onPress={() => savePrinter().catch(console.error)}
              disabled={saving || !canEdit || !!validatePrinterForm(form)}
            >
              <Text style={[s.formBtnTxt, { color: "#000000" }]}>{saving ? "Saving…" : "Save Printer"}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={{ height: 32 }} />
    </KeyboardAwareScrollView>
  );
}

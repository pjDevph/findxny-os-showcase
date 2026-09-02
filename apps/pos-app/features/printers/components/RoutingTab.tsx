import { useRef } from "react";
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { updatePrinterConfig, type PrinterConfig } from "../../receipt/printerConfig";
import { CardSection } from "../CardSection";
import { RouteRow } from "../RouteRow";
import { CategoryPickerDropdown } from "./CategoryPickerDropdown";
import { PrinterPickerDropdown } from "./PrinterPickerDropdown";
import { useBuiltInPrinterLabel } from "../useBuiltInPrinterLabel";
import type { makeStyles } from "../printersScreenStyles";
import type { useRoutingConfig } from "../useRoutingConfig";
import type { Category, Printer, RoutingConfig } from "../types";

interface Props {
  readonly routing: RoutingConfig;
  readonly setRouting: (updater: (r: RoutingConfig) => RoutingConfig) => void;
  readonly localPrinter: PrinterConfig;
  readonly canEdit: boolean;
  readonly labelPrinters: Printer[];
  readonly kitchenPrinters: Printer[];
  readonly categories: Category[];
  readonly routingApi: ReturnType<typeof useRoutingConfig>;
  readonly printerName: (id: string) => string;
  readonly s: ReturnType<typeof makeStyles>;
}

export function RoutingTab({
  routing, setRouting, localPrinter, canEdit,
  labelPrinters, kitchenPrinters, categories,
  routingApi, printerName, s,
}: Props) {
  const { C } = useTheme();
  const {
    savingRouting, saveRouting, canSaveRouting,
    catDropdown, printerDdField, printerDdPos,
    openPrinterDropdown, closePrinterDropdown, selectPrinter, clearCategoryFilter, toggleCategory,
  } = routingApi;

  const drinkPrinterRef = useRef<View>(null);
  const kitchenTicketPrinterRef = useRef<View>(null);
  const drinksTicketPrinterRef = useRef<View>(null);
  const builtInLabel = useBuiltInPrinterLabel();

  return (
    <ScrollView contentContainerStyle={s.scrollPad} keyboardShouldPersistTaps="handled">
      <Text style={s.helpNote}>
        {`Define which printer handles each job. Receipts always go to the ${builtInLabel.brand} built-in.`}
        {" "}Drink labels go to your external label printer when enabled.
      </Text>

      <CardSection icon="file-text" title="Receipt Printing">
        <View style={s.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleLabel}>Auto-print receipts</Text>
            <Text style={s.toggleSub}>Silently print receipt on this device when an order is confirmed (no tap needed)</Text>
          </View>
          <Switch
            value={localPrinter.autoPrint}
            onValueChange={v => updatePrinterConfig({ autoPrint: v })}
            trackColor={{ false: C.line, true: `${C.amber}66` }}
            thumbColor={localPrinter.autoPrint ? C.amber : C.ink3}
          />
        </View>
        {routing.receiptEnabled && (
          <>
            <RouteRow icon="arrow-right" label="Prints to">
              <View style={[s.routeChip, { backgroundColor: `${C.good}15`, borderColor: `${C.good}50` }]}>
                <Feather name="printer" size={13} color={C.good} />
                <Text style={[s.routeChipTxt, { color: C.good }]}>{builtInLabel.full} (always)</Text>
              </View>
            </RouteRow>
            <RouteRow icon="copy" label="Copies">
              <View style={{ flexDirection: "row", gap: 8 }}>
                {([1, 2] as (1 | 2)[]).map(n => (
                  <Pressable
                    key={n}
                    style={[s.chip, routing.receiptCopies === n && s.chipActive]}
                    onPress={() => setRouting(r => ({ ...r, receiptCopies: n }))}
                    disabled={!canEdit}
                  >
                    <Text style={[s.chipTxt, routing.receiptCopies === n && s.chipTxtActive]}>
                      {n === 1 ? "1 Copy" : "2 Copies"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </RouteRow>
          </>
        )}
      </CardSection>

      <CardSection icon="tag" title="Drink Label Printing">
        <View style={s.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleLabel}>Enable drink labels</Text>
            <Text style={s.toggleSub}>Allow printing drink labels from the receipt screen</Text>
          </View>
          <Switch
            value={routing.drinkLabelEnabled}
            onValueChange={v => setRouting(r => ({ ...r, drinkLabelEnabled: v }))}
            trackColor={{ false: C.line, true: `${C.amber}66` }}
            thumbColor={routing.drinkLabelEnabled ? C.amber : C.ink3}
            disabled={!canEdit}
          />
        </View>

        {routing.drinkLabelEnabled && (
          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>Auto-print labels on checkout</Text>
              <Text style={s.toggleSub}>Print labels immediately when order is confirmed on this device (no tap needed)</Text>
            </View>
            <Switch
              value={localPrinter.labelAutoPrint ?? false}
              onValueChange={v => updatePrinterConfig({ labelAutoPrint: v })}
              trackColor={{ false: C.line, true: `${C.amber}66` }}
              thumbColor={(localPrinter.labelAutoPrint ?? false) ? C.amber : C.ink3}
            />
          </View>
        )}

        {routing.drinkLabelEnabled && (
          <>
            <RouteRow icon="tag" label="Category">
              <Pressable
                ref={catDropdown.anchorRef}
                style={[s.routeChip, { borderColor: C.amber, backgroundColor: `${C.amber}12` }]}
                onPress={catDropdown.open}
                disabled={!canEdit}
              >
                <Text style={[s.routeChipTxt, { color: C.amber }]}>
                  {routing.drinkLabelCategory
                    ? routing.drinkLabelCategory.split(",").map(c => c.trim()).join(", ")
                    : "All items"}
                </Text>
                <Feather name="chevron-down" size={12} color={C.amber} />
              </Pressable>
            </RouteRow>

            <RouteRow icon="printer" label="Prints to">
              <Pressable
                ref={drinkPrinterRef}
                style={[s.routeChip, labelPrinters.length === 0 && { borderColor: `${C.bad}80`, backgroundColor: `${C.bad}10` }]}
                onPress={() => openPrinterDropdown("drinkLabel", drinkPrinterRef)}
                disabled={!canEdit || labelPrinters.length === 0}
              >
                <Feather name="printer" size={13} color={labelPrinters.length === 0 ? C.bad : C.ink3} />
                <Text style={[s.routeChipTxt, { color: labelPrinters.length === 0 ? C.bad : C.ink }]}>
                  {labelPrinters.length === 0
                    ? "No label printer — add one in Devices"
                    : routing.drinkLabelPrinterId ? printerName(routing.drinkLabelPrinterId) : "Select printer"}
                </Text>
                {labelPrinters.length > 0 && <Feather name="chevron-down" size={12} color={C.ink4} />}
              </Pressable>
            </RouteRow>

            <RouteRow icon="layers" label="Print mode">
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["per_item_qty", "per_order"] as const).map(m => (
                  <Pressable
                    key={m}
                    style={[s.chip, routing.drinkLabelMode === m && s.chipActive]}
                    onPress={() => setRouting(r => ({ ...r, drinkLabelMode: m }))}
                    disabled={!canEdit}
                  >
                    <Text style={[s.chipTxt, routing.drinkLabelMode === m && s.chipTxtActive]}>
                      {m === "per_item_qty" ? "Per Qty" : "Per Order"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </RouteRow>

            <RouteRow icon="maximize-2" label="Label width">
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["40", "58", "80"] as const).map(w => (
                  <Pressable
                    key={w}
                    style={[s.chip, routing.drinkLabelPaperWidth === w && s.chipActive]}
                    onPress={() => setRouting(r => ({ ...r, drinkLabelPaperWidth: w }))}
                    disabled={!canEdit}
                  >
                    <Text style={[s.chipTxt, routing.drinkLabelPaperWidth === w && s.chipTxtActive]}>{w}mm</Text>
                  </Pressable>
                ))}
              </View>
            </RouteRow>

            {routing.drinkLabelMode === "per_item_qty" && (
              <View style={s.infoNote}>
                <Feather name="info" size={12} color={C.amber} />
                <Text style={s.infoNoteTxt}>2× Iced Latte → prints "Iced Latte 1/2" and "Iced Latte 2/2"</Text>
              </View>
            )}

            <RouteRow icon="globe" label="Online orders">
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["confirmed", "paid"] as const).map(v => (
                  <Pressable
                    key={v}
                    style={[s.chip, routing.drinkLabelFireOn === v && s.chipActive]}
                    onPress={() => setRouting(r => ({ ...r, drinkLabelFireOn: v }))}
                    disabled={!canEdit}
                  >
                    <Text style={[s.chipTxt, routing.drinkLabelFireOn === v && s.chipTxtActive]}>
                      {v === "confirmed" ? "On Confirm" : "On Paid"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </RouteRow>

            {routing.drinkLabelFireOn === "paid" && (
              <View style={s.infoNote}>
                <Feather name="info" size={12} color={C.amber} />
                <Text style={s.infoNoteTxt}>Labels only print after the online order is marked Paid / Accepted.</Text>
              </View>
            )}
          </>
        )}
      </CardSection>

      <CardSection icon="clipboard" title="Kitchen & Drinks Ticket Printing">
        <View style={s.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleLabel}>Enable ticket printing</Text>
            <Text style={s.toggleSub}>Print separate kitchen and drinks prep tickets on checkout</Text>
          </View>
          <Switch
            value={routing.kitchenTicketEnabled || routing.drinksTicketEnabled}
            onValueChange={v => setRouting(r => ({ ...r, kitchenTicketEnabled: v, drinksTicketEnabled: v }))}
            trackColor={{ false: C.line, true: `${C.amber}66` }}
            thumbColor={(routing.kitchenTicketEnabled || routing.drinksTicketEnabled) ? C.amber : C.ink3}
            disabled={!canEdit}
          />
        </View>

        {(routing.kitchenTicketEnabled || routing.drinksTicketEnabled) && (
          <>
            <View style={s.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.toggleLabel}>Auto-print tickets on checkout</Text>
                <Text style={s.toggleSub}>Print immediately when order is confirmed on this device (no tap needed)</Text>
              </View>
              <Switch
                value={localPrinter.ticketAutoPrint ?? false}
                onValueChange={v => updatePrinterConfig({ ticketAutoPrint: v })}
                trackColor={{ false: C.line, true: `${C.amber}66` }}
                thumbColor={(localPrinter.ticketAutoPrint ?? false) ? C.amber : C.ink3}
              />
            </View>

            <RouteRow icon="printer" label="Kitchen prints to">
              <Pressable
                ref={kitchenTicketPrinterRef}
                style={[s.routeChip, kitchenPrinters.length === 0 && { borderColor: `${C.bad}80`, backgroundColor: `${C.bad}10` }]}
                onPress={() => openPrinterDropdown("kitchenTicket", kitchenTicketPrinterRef)}
                disabled={!canEdit || kitchenPrinters.length === 0}
              >
                <Feather name="printer" size={13} color={kitchenPrinters.length === 0 ? C.bad : C.ink3} />
                <Text style={[s.routeChipTxt, { color: kitchenPrinters.length === 0 ? C.bad : C.ink }]}>
                  {kitchenPrinters.length === 0
                    ? "No kitchen printer — add one in Devices"
                    : routing.kitchenTicketPrinterId ? printerName(routing.kitchenTicketPrinterId) : "Select printer"}
                </Text>
                {kitchenPrinters.length > 0 && <Feather name="chevron-down" size={12} color={C.ink4} />}
              </Pressable>
            </RouteRow>

            {/* Same kitchenPrinters list/empty-check as the row above — intentional,
                both stations may share one printer (see info note below). */}
            <RouteRow icon="printer" label="Drinks prints to">
              <Pressable
                ref={drinksTicketPrinterRef}
                style={[s.routeChip, kitchenPrinters.length === 0 && { borderColor: `${C.bad}80`, backgroundColor: `${C.bad}10` }]}
                onPress={() => openPrinterDropdown("drinksTicket", drinksTicketPrinterRef)}
                disabled={!canEdit || kitchenPrinters.length === 0}
              >
                <Feather name="printer" size={13} color={kitchenPrinters.length === 0 ? C.bad : C.ink3} />
                <Text style={[s.routeChipTxt, { color: kitchenPrinters.length === 0 ? C.bad : C.ink }]}>
                  {kitchenPrinters.length === 0
                    ? "No kitchen printer — add one in Devices"
                    : routing.drinksTicketPrinterId ? printerName(routing.drinksTicketPrinterId) : "Select printer"}
                </Text>
                {kitchenPrinters.length > 0 && <Feather name="chevron-down" size={12} color={C.ink4} />}
              </Pressable>
            </RouteRow>

            <RouteRow icon="maximize-2" label="Ticket width">
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["58", "80"] as const).map(w => (
                  <Pressable
                    key={w}
                    style={[s.chip, routing.ticketPaperWidth === w && s.chipActive]}
                    onPress={() => setRouting(r => ({ ...r, ticketPaperWidth: w }))}
                    disabled={!canEdit}
                  >
                    <Text style={[s.chipTxt, routing.ticketPaperWidth === w && s.chipTxtActive]}>{w}mm</Text>
                  </Pressable>
                ))}
              </View>
            </RouteRow>

            <View style={s.infoNote}>
              <Feather name="info" size={12} color={C.amber} />
              <Text style={s.infoNoteTxt}>
                Both stations can point to the same printer — the two tickets just print back to back.
                A ticket only prints if the order has items for that station.
              </Text>
            </View>
          </>
        )}
      </CardSection>

      {canEdit && (
        <Pressable
          style={[s.saveBtn, (savingRouting || !canSaveRouting) && { opacity: 0.6 }]}
          onPress={() => saveRouting().catch(console.error)}
          disabled={savingRouting || !canSaveRouting}
        >
          {savingRouting ? <ActivityIndicator size="small" color="#000000" /> : <Feather name="save" size={16} color="#000000" />}
          <Text style={s.saveBtnTxt}>{savingRouting ? "Saving…" : "Save Routing Rules"}</Text>
        </Pressable>
      )}

      <View style={{ height: 32 }} />

      <CategoryPickerDropdown
        dropdown={catDropdown}
        categories={categories}
        selectedCategory={routing.drinkLabelCategory}
        onToggle={toggleCategory}
        onClear={clearCategoryFilter}
        s={s}
      />

      <PrinterPickerDropdown
        field={printerDdField}
        position={printerDdPos}
        onClose={closePrinterDropdown}
        routing={routing}
        labelPrinters={labelPrinters}
        kitchenPrinters={kitchenPrinters}
        onSelect={selectPrinter}
        s={s}
      />
    </ScrollView>
  );
}

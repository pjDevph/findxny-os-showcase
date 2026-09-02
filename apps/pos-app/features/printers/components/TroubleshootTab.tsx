import { Pressable, ScrollView, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { useToast } from "../../ui/ToastProvider";
import { CardSection } from "../CardSection";
import { TroubleshootPrinterRow } from "../TroubleshootPrinterRow";
import { printBuiltInTestPage, printDotRulerGrid } from "../printerHelpers";
import { useBuiltInPrinterLabel } from "../useBuiltInPrinterLabel";
import type { makeStyles } from "../printersScreenStyles";
import type { usePrinterTest } from "../usePrinterTest";
import type { Printer, RoutingConfig } from "../types";

interface Props {
  readonly printers: Printer[];
  readonly routing: RoutingConfig;
  readonly testApi: ReturnType<typeof usePrinterTest>;
  readonly s: ReturnType<typeof makeStyles>;
}

export function TroubleshootTab({ printers, routing, testApi, s }: Props) {
  const { C } = useTheme();
  const { showToast } = useToast();
  const { testing, testingLabel, testPrinter, testLabelPrint } = testApi;
  const builtInLabel = useBuiltInPrinterLabel();

  function testBuiltinPrinter() {
    printBuiltInTestPage()
      .catch((e: Error) => showToast({ title: "Test failed", message: e.message, type: "error" }));
  }

  function printCalibrationGrid() {
    printDotRulerGrid()
      .catch((e: Error) => showToast({ title: "Calibration print failed", message: e.message, type: "error" }));
  }

  return (
    <ScrollView contentContainerStyle={s.scrollPad}>
      <Text style={s.helpNote}>
        Send a test page to each printer to verify connectivity and paper loading.
      </Text>

      <CardSection icon="printer" title={`${builtInLabel.full} (Receipt)`}>
        <View style={s.tsRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleLabel}>Thermal · Built-in · Always enabled</Text>
            <Text style={s.toggleSub}>{`The built-in ${builtInLabel.brand} thermal receipt printer on this device.`}</Text>
          </View>
          <Pressable style={s.testBtn} onPress={testBuiltinPrinter}>
            <Feather name="send" size={14} color={C.amber} />
            <Text style={s.testBtnTxt}>Test</Text>
          </Pressable>
          <Pressable style={s.testBtn} onPress={printCalibrationGrid}>
            <Feather name="grid" size={14} color={C.amber} />
            <Text style={s.testBtnTxt}>Grid</Text>
          </Pressable>
        </View>
      </CardSection>

      {printers.length === 0 ? (
        <View style={s.emptyState}>
          <Feather name="inbox" size={32} color={C.ink4} />
          <Text style={s.emptyTxt}>No external printers</Text>
          <Text style={s.emptySub}>Add printers in the Devices tab to test them here.</Text>
        </View>
      ) : (
        printers.map(p => {
          const isLabelPrinter = routing.drinkLabelEnabled && routing.drinkLabelPrinterId === p.id;
          const deviceAddr = p.ip_address || p.mac_address || null;
          return (
            <TroubleshootPrinterRow
              key={p.id}
              p={p} s={s} testing={testing}
              onTest={(id) => { testPrinter(id).catch(console.error); }}
              isLabelPrinter={isLabelPrinter}
              testingLabel={testingLabel}
              onTestLabel={deviceAddr ? () => { testLabelPrint(deviceAddr).catch(console.error); } : undefined}
            />
          );
        })
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

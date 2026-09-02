import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import type { useDeviceScan } from "./useDeviceScan";
import type { makeStyles } from "./printersScreenStyles";
import type { PrinterForm } from "./types";

interface Props {
  readonly connection: PrinterForm["connection"];
  readonly deviceScan: ReturnType<typeof useDeviceScan>;
  readonly s: ReturnType<typeof makeStyles>;
}

export function DeviceScanPicker({ connection, deviceScan, s }: Props) {
  const { C } = useTheme();
  const {
    scanningUsb, detectedUsbPrinters, scanUsbPrinters, applyDetectedPrinter,
    scanningBt, detectedBtPrinters, scanBluetoothPrinters, applyBluetoothPrinter,
  } = deviceScan;

  if (connection === "usb") {
    return (
      <View style={{ marginTop: 4, gap: 8 }}>
        <Pressable
          style={[s.chip, { alignSelf: "flex-start", flexDirection: "row", gap: 6, paddingHorizontal: 14 }]}
          onPress={() => { scanUsbPrinters().catch(console.error); }}
          disabled={scanningUsb}
        >
          {scanningUsb ? <ActivityIndicator size="small" color={C.ink} /> : <Feather name="search" size={13} color={C.ink} />}
          <Text style={s.chipTxt}>{scanningUsb ? "Scanning…" : "Scan for USB Printers"}</Text>
        </Pressable>

        {detectedUsbPrinters.length > 0 && (
          <View style={{ gap: 6 }}>
            {detectedUsbPrinters.map(p => (
              <Pressable
                key={p.address}
                style={[s.routeChip, { flexDirection: "column", alignItems: "flex-start", gap: 2 }]}
                onPress={() => applyDetectedPrinter(p)}
              >
                <Text style={[s.chipTxt, { fontWeight: "700" }]}>{p.name}</Text>
                <Text style={[s.chipTxt, { color: C.ink3, fontSize: 11 }]}>
                  {p.manufacturer ? `${p.manufacturer} · ` : ""}{p.address}
                  {!p.hasPermission ? " · ⚠ needs permission" : " · ✓ ready"}
                </Text>
              </Pressable>
            ))}
            <Text style={[s.helpNote, { marginTop: 0 }]}>Tap a printer to fill the form</Text>
          </View>
        )}
      </View>
    );
  }

  if (connection === "bluetooth") {
    return (
      <View style={{ marginTop: 4, gap: 8 }}>
        <Text style={s.helpNote}>Pair the printer in Android Settings → Bluetooth first, then scan.</Text>
        <Pressable
          style={[s.chip, { alignSelf: "flex-start", flexDirection: "row", gap: 6, paddingHorizontal: 14 }]}
          onPress={() => { scanBluetoothPrinters().catch(console.error); }}
          disabled={scanningBt}
        >
          {scanningBt ? <ActivityIndicator size="small" color={C.ink} /> : <Feather name="bluetooth" size={13} color={C.ink} />}
          <Text style={s.chipTxt}>{scanningBt ? "Scanning…" : "Scan Paired Devices"}</Text>
        </Pressable>

        {detectedBtPrinters.length > 0 && (
          <View style={{ gap: 6 }}>
            {detectedBtPrinters.map(p => (
              <Pressable
                key={p.address}
                style={[s.routeChip, { flexDirection: "column", alignItems: "flex-start", gap: 2 }]}
                onPress={() => applyBluetoothPrinter(p)}
              >
                <Text style={[s.chipTxt, { fontWeight: "700" }]}>{p.name}</Text>
                <Text style={[s.chipTxt, { color: C.ink3, fontSize: 11 }]}>{p.address} · {p.type}</Text>
              </Pressable>
            ))}
            <Text style={[s.helpNote, { marginTop: 0 }]}>Tap a device to fill the form</Text>
          </View>
        )}
      </View>
    );
  }

  return null;
}

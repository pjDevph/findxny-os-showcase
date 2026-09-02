import { Pressable, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { FFld } from "./FFld";
import type { makeStyles } from "./printersScreenStyles";
import { DEFAULT_PRINTER_IP, type PrinterForm } from "./types";

interface Props {
  readonly form: PrinterForm;
  readonly s: ReturnType<typeof makeStyles>;
  readonly canEdit: boolean;
  readonly updForm: <K extends keyof PrinterForm>(k: K, v: PrinterForm[K]) => void;
}

export function ConnectionFields({ form, s, canEdit, updForm }: Props) {
  const { C } = useTheme();

  if (form.connection === "network") {
    return (
      <FFld label="IP Address" required>
        <TextInput
          style={s.input}
          value={form.ip_address}
          onChangeText={v => updForm("ip_address", v)}
          placeholder={DEFAULT_PRINTER_IP}
          placeholderTextColor={C.ink4}
          keyboardType="decimal-pad"
          maxLength={15}
          editable={canEdit}
        />
      </FFld>
    );
  }
  if (form.connection === "bluetooth") {
    return (
      <FFld label="MAC Address" required>
        <TextInput
          style={s.input}
          value={form.mac_address}
          onChangeText={v => updForm("mac_address", v)}
          placeholder="00:1A:7D:DA:71:13"
          placeholderTextColor={C.ink4}
          autoCapitalize="characters"
          maxLength={17}
          editable={canEdit}
        />
      </FFld>
    );
  }
  if (form.connection === "usb" && form.mac_address) {
    return (
      <FFld label="USB Device">
        <View style={[s.chipRow, { alignItems: "center" }]}>
          <View style={[s.chip, s.chipActive, { flexDirection: "row", gap: 6, alignItems: "center" }]}>
            <Feather name="printer" size={13} color="#000000" />
            <Text style={[s.chipTxt, s.chipTxtActive]}>{form.mac_address}</Text>
          </View>
          {canEdit && (
            <Pressable style={s.chip} onPress={() => updForm("mac_address", "")} hitSlop={8}>
              <Feather name="x" size={13} color={C.ink} />
            </Pressable>
          )}
        </View>
      </FFld>
    );
  }
  return null;
}

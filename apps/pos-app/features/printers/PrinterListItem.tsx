import { Pressable, Switch, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { connLabel, typeIcon, typeLabel } from "./printerHelpers";
import type { makeStyles } from "./printersScreenStyles";
import type { Printer } from "./types";

interface Props {
  readonly p: Printer;
  readonly s: ReturnType<typeof makeStyles>;
  readonly canEdit: boolean;
  readonly testing: string | null;
  readonly deleting: string | null;
  readonly usbOnlineAddrs: Set<string>;
  readonly onToggle: (id: string, v: boolean) => void;
  readonly onTest: (id: string) => void;
  readonly onSetDefault: (id: string) => void;
  readonly onEdit: (p: Printer) => void;
  readonly onDelete: (p: Printer) => void;
}

export function PrinterListItem({
  p, s, canEdit, testing, deleting, usbOnlineAddrs,
  onToggle, onTest, onSetDefault, onEdit, onDelete,
}: Props) {
  const { C } = useTheme();
  const usbAddr = p.mac_address || p.ip_address || null;
  const onlineStatus = p.connection === "usb" && usbAddr
    ? (usbOnlineAddrs.has(usbAddr) ? "online" : "offline")
    : null;

  return (
    <View style={s.printerCard}>
      <View style={s.printerRow}>
        <View style={[s.typeIconWrap, { backgroundColor: `${C.amber}15` }]}>
          <Feather name={typeIcon(p.type)} size={16} color={C.amber} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={s.printerName}>{p.name}</Text>
            {p.is_default && (
              <View style={[s.badge, { backgroundColor: `${C.amber}20` }]}>
                <Text style={[s.badgeTxt, { color: C.amber }]}>DEFAULT</Text>
              </View>
            )}
            {onlineStatus === "online" && (
              <View style={[s.badge, { backgroundColor: `${C.good}20` }]}>
                <Text style={[s.badgeTxt, { color: C.good }]}>ONLINE</Text>
              </View>
            )}
            {onlineStatus === "offline" && (
              <View style={[s.badge, { backgroundColor: `${C.bad}20` }]}>
                <Text style={[s.badgeTxt, { color: C.bad }]}>OFFLINE</Text>
              </View>
            )}
            {!p.is_enabled && (
              <View style={[s.badge, { backgroundColor: `${C.ink4}18` }]}>
                <Text style={[s.badgeTxt, { color: C.ink4 }]}>OFF</Text>
              </View>
            )}
          </View>
          <Text style={s.printerMeta}>{typeLabel(p.type)} · {connLabel(p.connection)}</Text>
          {!!p.ip_address && <Text style={s.printerMeta}>{p.ip_address}</Text>}
          {!!p.mac_address && <Text style={s.printerMeta}>{p.mac_address}</Text>}
          {!!p.last_test && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
              <Feather name="check-circle" size={11} color={C.good} />
              <Text style={[s.printerMeta, { color: C.good }]}>
                Last test: {new Date(p.last_test).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>
        {canEdit && (
          <Switch
            value={p.is_enabled}
            onValueChange={v => onToggle(p.id, v)}
            trackColor={{ false: C.line, true: `${C.amber}66` }}
            thumbColor={p.is_enabled ? C.amber : C.ink3}
          />
        )}
      </View>

      {canEdit && (
        <View style={s.printerActions}>
          <Pressable style={s.actionBtn} onPress={() => onTest(p.id)} disabled={testing === p.id || !p.is_enabled}>
            <Feather name="send" size={13} color={p.is_enabled ? C.amber : C.ink4} />
            <Text style={[s.actionBtnTxt, { color: p.is_enabled ? C.amber : C.ink4 }]}>
              {testing === p.id ? "Testing…" : "Test"}
            </Text>
          </Pressable>
          {!p.is_default && (
            <Pressable style={s.actionBtn} onPress={() => onSetDefault(p.id)}>
              <Feather name="star" size={13} color={C.ink3} />
              <Text style={[s.actionBtnTxt, { color: C.ink3 }]}>Set Default</Text>
            </Pressable>
          )}
          <Pressable style={s.actionBtn} onPress={() => onEdit(p)}>
            <Feather name="edit-2" size={13} color={C.ink3} />
            <Text style={[s.actionBtnTxt, { color: C.ink3 }]}>Edit</Text>
          </Pressable>
          <Pressable style={s.actionBtn} onPress={() => onDelete(p)} disabled={deleting === p.id}>
            <Feather name="trash-2" size={13} color={C.bad} />
            <Text style={[s.actionBtnTxt, { color: C.bad }]}>{deleting === p.id ? "Removing…" : "Remove"}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

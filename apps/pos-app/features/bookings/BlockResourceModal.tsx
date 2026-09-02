import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { KeyboardSheet } from "../ui/KeyboardSheet";
import { MONO } from "../theme/mono";
import { sanitizeDateStr } from "../utils/inputSanitizers";
import { BLOCK_TYPE_LABELS, type BlockType, type Resource } from "./types";
import type { StyleMap, ThemeColors } from "./bookingsScreenStyles";

interface Props {
  readonly visible: boolean;
  readonly resources: Resource[];
  readonly s: StyleMap;
  readonly C: ThemeColors;
  readonly onClose: () => void;
  readonly onSubmit: (resourceId: string, startDate: string, endDate: string, blockType: BlockType, reason: string) => void;
}

export function BlockResourceModal({ visible, resources, s, C, onClose, onSubmit }: Props) {
  const [resourceId, setResourceId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [blockType, setBlockType] = useState<BlockType>("owner_block");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [inlineErr, setInlineErr] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setResourceId(""); setStartDate(""); setEndDate("");
      setBlockType("owner_block"); setReason(""); setInlineErr(null); setBusy(false);
    }
  }, [visible]);

  function submit() {
    if (!resourceId) { setInlineErr("Select a room."); return; }
    if (!startDate || !endDate) { setInlineErr("Enter both start and end dates (YYYY-MM-DD)."); return; }
    if (endDate < startDate) { setInlineErr("End date must be on or after start date."); return; }
    setBusy(true);
    setInlineErr(null);
    onSubmit(resourceId, startDate, endDate, blockType, reason.trim());
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardSheet style={s.centeredOverlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <Pressable style={s.alertSheet} onPress={() => {}}>
          <View style={[s.alertIconWrap, { backgroundColor: `${C.ink3}18` }]}>
            <Feather name="slash" size={28} color={C.ink2} />
          </View>
          <Text style={s.alertTitle}>Block Dates</Text>
          <Text style={s.alertBody}>Prevents new holds/bookings from being placed in this window.</Text>
          <View style={{ alignSelf: "stretch", gap: 10 }}>
            <Text style={s.fieldLabel}>Room</Text>
            <View style={s.chipGrid}>
              {resources.map((r) => (
                <Pressable key={r.id} style={[s.chip, resourceId === r.id && s.chipSel]} onPress={() => setResourceId(r.id)}>
                  <Text style={[s.chipTxt, resourceId === r.id && s.chipTxtSel]}>{r.name}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Start Date</Text>
                <TextInput style={s.input} value={startDate} onChangeText={(v) => { setStartDate(sanitizeDateStr(v)); setInlineErr(null); }}
                  maxLength={10} placeholder="YYYY-MM-DD" placeholderTextColor={C.ink4} autoCapitalize="none" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>End Date</Text>
                <TextInput style={s.input} value={endDate} onChangeText={(v) => { setEndDate(sanitizeDateStr(v)); setInlineErr(null); }}
                  maxLength={10} placeholder="YYYY-MM-DD" placeholderTextColor={C.ink4} autoCapitalize="none" />
              </View>
            </View>
            <Text style={s.fieldLabel}>Reason</Text>
            <View style={s.chipGrid}>
              {(Object.keys(BLOCK_TYPE_LABELS) as BlockType[]).map((t) => (
                <Pressable key={t} style={[s.chip, blockType === t && s.chipSel]} onPress={() => setBlockType(t)}>
                  <Text style={[s.chipTxt, blockType === t && s.chipTxtSel]}>{BLOCK_TYPE_LABELS[t]}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={[s.input, { minHeight: 56, textAlignVertical: "top" }]}
              multiline
              value={reason}
              maxLength={200}
              onChangeText={setReason}
              placeholder="e.g. Painting crew, deep cleaning… (optional)"
              placeholderTextColor={C.ink4}
            />
            {!!inlineErr && (
              <Text style={{ color: C.bad, fontSize: 12, fontFamily: MONO }}>{inlineErr}</Text>
            )}
          </View>
          <View style={s.alertActions}>
            <Pressable style={s.alertKeepBtn} onPress={onClose}>
              <Text style={s.alertKeepTxt}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[s.alertCancelBtn, { borderColor: `${C.ink3}44`, backgroundColor: `${C.ink3}18` }, busy && { opacity: 0.5 }]}
              onPress={submit}
              disabled={busy}
            >
              {busy
                ? <ActivityIndicator size="small" color={C.ink2} />
                : <Text style={[s.alertCancelTxt, { color: C.ink2 }]}>Block Dates</Text>
              }
            </Pressable>
          </View>
        </Pressable>
      </KeyboardSheet>
    </Modal>
  );
}

import { useCallback, useState } from "react";
import { View, Text, Pressable, TextInput, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { useToast } from "../ui/ToastProvider";
import type { makeStyles } from "./settingsScreenStyles";

type C = ReturnType<typeof useTheme>["C"];
type S = ReturnType<typeof makeStyles>;
type QrMode = "url" | "upload";

interface Props {
  readonly label: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly C: C;
  readonly s: S;
}

export function QrInput({ label, value, onChange, C, s }: Props) {
  const isImage = value.startsWith("data:") || value.startsWith("file://") || value.startsWith("content://");
  const [mode, setMode] = useState<QrMode>(isImage ? "upload" : "url");
  const { showToast } = useToast();

  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { showToast({ title: "Permission needed", message: "Allow photo library access to upload a QR image.", type: "error" }); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, base64: true, allowsEditing: false });
    if (!result.canceled && result.assets[0]?.base64) onChange(`data:image/jpeg;base64,${result.assets[0].base64}`);
  }, [onChange, showToast]);

  function switchMode(m: QrMode) {
    setMode(m);
    if (m === "url" && isImage) onChange("");
    if (m === "upload" && !isImage) onChange("");
  }

  return (
    <View style={s.qrWrap}>
      <Text style={s.qrLabel}>{label}</Text>
      <View style={s.qrModeBar}>
        <Pressable style={[s.qrModeBtn, mode === "upload" && s.qrModeBtnActive]} onPress={() => switchMode("upload")}>
          <Feather name="upload" size={12} color={mode === "upload" ? C.amber : C.ink4} />
          <Text style={[s.qrModeBtnTxt, { color: mode === "upload" ? C.amber : C.ink4 }]}>Upload QR</Text>
        </Pressable>
        <Pressable style={[s.qrModeBtn, mode === "url" && s.qrModeBtnActive]} onPress={() => switchMode("url")}>
          <Feather name="link" size={12} color={mode === "url" ? C.amber : C.ink4} />
          <Text style={[s.qrModeBtnTxt, { color: mode === "url" ? C.amber : C.ink4 }]}>QR URL</Text>
        </Pressable>
      </View>
      {mode === "upload" ? (
        isImage ? (
          <View style={s.qrPreviewRow}>
            <Image source={{ uri: value }} style={s.qrPreview} resizeMode="contain" />
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={s.qrPreviewTxt}>QR image set</Text>
              <Pressable style={s.qrRemoveBtn} onPress={() => onChange("")}>
                <Feather name="trash-2" size={12} color={C.bad} />
                <Text style={[s.qrModeBtnTxt, { color: C.bad }]}>Remove</Text>
              </Pressable>
              <Pressable style={s.qrRemoveBtn} onPress={pickImage}>
                <Feather name="refresh-cw" size={12} color={C.ink3} />
                <Text style={[s.qrModeBtnTxt, { color: C.ink3 }]}>Replace</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={s.qrPickBtn} onPress={pickImage}>
            <Feather name="image" size={22} color={C.ink3} />
            <Text style={s.qrPickTxt}>Tap to choose QR image from library</Text>
          </Pressable>
        )
      ) : (
        <TextInput style={s.input} placeholder="https://… (QR redirect URL)" placeholderTextColor={C.ink4}
          value={isImage ? "" : value} onChangeText={onChange} autoCapitalize="none" keyboardType="url" />
      )}
    </View>
  );
}

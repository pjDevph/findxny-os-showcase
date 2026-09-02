/**
 * Customer Display — media picker
 *
 * Picks an image OR video from the library for idle screens and persists it to
 * the app's documents dir (videos are far too large for AsyncStorage/base64).
 * The resulting file URI is stored in ./images under the given key; the caller
 * records the returned kind (image|video) so the view knows how to render it.
 */
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { setImage } from "./images";

export type MediaKind = "image" | "video";

const MEDIA_DIR = `${FileSystem.documentDirectory}cd_media/`;

async function ensureDir() {
  try {
    const info = await FileSystem.getInfoAsync(MEDIA_DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
  } catch {
    /* best effort — copy may still work or we fall back to the picker uri */
  }
}

/**
 * Pick image/video, persist it, and store its URI under `key`.
 * Returns the picked kind, or null if cancelled / permission denied.
 */
export async function pickMedia(key: string): Promise<MediaKind | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    quality: 0.6,
    videoMaxDuration: 60,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const kind: MediaKind = asset.type === "video" ? "video" : "image";

  await ensureDir();
  const ext = kind === "video" ? "mp4" : "jpg";
  const dest = `${MEDIA_DIR}${key}_${Date.now()}.${ext}`;
  try {
    await FileSystem.copyAsync({ from: asset.uri, to: dest });
    await setImage(key, dest);
  } catch {
    // Couldn't copy (e.g. content:// source) — fall back to the picker URI.
    await setImage(key, asset.uri);
  }
  return kind;
}

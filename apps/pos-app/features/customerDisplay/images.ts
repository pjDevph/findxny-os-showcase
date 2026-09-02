/**
 * Customer Display — image store
 *
 * Idle-screen images (promo banner, QR-ordering image, per-slide images) are
 * potentially large data URIs. Storing them all inside the config JSON would
 * risk AsyncStorage's per-item read limit, so each image gets its OWN key
 * (`cd_img_<id>`). Reactive so the preview and second screen update live.
 *
 * Keys: "idle", "qr", or a slide id (see ../customerDisplay/config).
 */
import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "cd_img_";

let images: Record<string, string> = {};
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getImages(): Record<string, string> {
  return images;
}

/** Load all persisted idle images once (idempotent). */
export async function hydrateImages(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
    if (keys.length) {
      const pairs = await AsyncStorage.multiGet(keys);
      const next = { ...images };
      for (const [k, v] of pairs) if (v) next[k.slice(PREFIX.length)] = v;
      images = next;
      emit();
    }
  } catch {
    /* keep what we have */
  }
}

/** Set (or clear, when dataUri is null) an image for a logical id. */
export async function setImage(id: string, dataUri: string | null): Promise<void> {
  const next = { ...images };
  if (dataUri) next[id] = dataUri;
  else delete next[id];
  images = next;
  emit();
  try {
    if (dataUri) await AsyncStorage.setItem(PREFIX + id, dataUri);
    else await AsyncStorage.removeItem(PREFIX + id);
  } catch {
    /* best effort */
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useImages(): Record<string, string> {
  return useSyncExternalStore(subscribe, getImages, getImages);
}

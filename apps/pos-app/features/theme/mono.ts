import { Platform } from "react-native";

/** Matches the app's established fontFamily convention (formFieldStyles.ts, etc.) — Courier on iOS, monospace elsewhere. */
export const MONO = Platform.select({ ios: "Courier", android: "monospace", default: "monospace" });

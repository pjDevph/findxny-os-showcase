import type { ExpoConfig } from "expo/config";

// Sets the dev/preview/prod distinction: local `expo start`/`expo run:*` and
// the EAS "development" build profile set APP_VARIANT=development; the
// "preview" build profile sets APP_VARIANT=preview (see package.json scripts
// + eas.json). Production builds leave it unset. Every non-production
// variant gets a different app name AND a different applicationId/
// bundleIdentifier, so installing one never silently overwrites another —
// each lands as its own separate app on the device.
const APP_VARIANT = process.env.APP_VARIANT as "development" | "preview" | undefined;

const BASE_ID = "com.findxny426.aiopos";

const VARIANTS = {
  development: { name: "FINDXNY (Demo)", idSuffix: ".demo" },
  preview:     { name: "FINDXNY (Preview)", idSuffix: ".preview" },
} as const;

const variant = APP_VARIANT ? VARIANTS[APP_VARIANT] : null;

const config: ExpoConfig = {
  name: variant?.name ?? "FINDXNY",
  slug: "findxny-pos",
  owner: "pjdevph",
  version: "1.0.2",
  scheme: "aiopos",
  orientation: "default",
  icon: "./assets/logo/icon.png",
  platforms: ["ios", "android"],
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-video",
    "expo-sqlite",
    "expo-sharing",
    "expo-image",
    [
      "expo-splash-screen",
      {
        image: "./assets/logo/splash-wordmark.png",
        imageWidth: 240,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },
    ],
  ],
  android: {
    package: variant ? `${BASE_ID}${variant.idSuffix}` : BASE_ID,
    softwareKeyboardLayoutMode: "resize",
    adaptiveIcon: {
      foregroundImage: "./assets/logo/adaptive-icon-foreground.png",
      backgroundColor: "#ffffff",
    },
  },
  ios: {
    bundleIdentifier: variant ? `${BASE_ID}${variant.idSuffix}` : BASE_ID,
  },
  extra: {
    router: {},
    eas: {
      projectId: "691f365c-87d6-4a77-9b7e-97c5fa9f153e",
    },
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  updates: {
    url: "https://u.expo.dev/691f365c-87d6-4a77-9b7e-97c5fa9f153e",
  },
};

export default config;

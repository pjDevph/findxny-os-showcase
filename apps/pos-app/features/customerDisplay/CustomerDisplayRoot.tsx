/**
 * Customer Display — connected root for the physical second screen.
 *
 * Registered under the component name "CustomerDisplay" so the native
 * Presentation (ReactHost.createSurface) can mount it on the secondary
 * display. It reads the SAME module stores the cashier screen writes to,
 * so it stays in sync with zero extra plumbing.
 */
import { useEffect } from "react";
import { AppRegistry } from "react-native";
import { CustomerDisplayView } from "./CustomerDisplayView";
import { useCustomerDisplay } from "./store";
import { useCustomerDisplayConfig, hydrateCustomerDisplayConfig } from "./config";
import { useImages, hydrateImages } from "./images";

export function CustomerDisplayRoot() {
  const state = useCustomerDisplay();
  const config = useCustomerDisplayConfig();
  const images = useImages();
  useEffect(() => { void hydrateCustomerDisplayConfig(); void hydrateImages(); }, []);
  return <CustomerDisplayView state={state} config={config} images={images} />;
}

let registered = false;
/** Idempotently register the second-screen surface component. */
export function registerCustomerDisplaySurface() {
  if (registered) return;
  registered = true;
  AppRegistry.registerComponent("CustomerDisplay", () => CustomerDisplayRoot);
}

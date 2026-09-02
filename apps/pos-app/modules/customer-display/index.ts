import { requireOptionalNativeModule } from "expo-modules-core";

export type CustomerDisplayNativeModule = {
  /** True when a secondary "presentation" display is physically connected. */
  isPresent(): Promise<boolean>;
  /** Show/hide the customer-facing surface on the secondary display. */
  setEnabled(enabled: boolean): void;
};

/**
 * Null in Expo Go or before the native module is built — callers must guard.
 */
export const CustomerDisplayNative =
  requireOptionalNativeModule<CustomerDisplayNativeModule>("CustomerDisplay") ?? null;

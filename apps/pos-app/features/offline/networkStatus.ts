import { useSyncExternalStore } from "react";
import NetInfo from "@react-native-community/netinfo";

let connected = true;
// Manual override for testing the offline flows (queueing, sync, stuck-order
// review, the shift-close guard, etc.) without needing real airplane-mode or
// emulator network fiddling — see OfflineBanner's "Simulate Offline" toggle.
// Purely in-memory: resets to off on every app restart, so it can never be
// accidentally left on across a real session.
let forcedOffline = false;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

NetInfo.addEventListener((state) => {
  const next = !!(state.isConnected && state.isInternetReachable !== false);
  if (next !== connected) { connected = next; emit(); }
});

export function getIsConnected() { return connected && !forcedOffline; }

export function isForcedOffline() { return forcedOffline; }

export function setForcedOffline(next: boolean) {
  if (next === forcedOffline) return;
  forcedOffline = next;
  emit();
}

function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }

export function onConnectivityChange(cb: (isConnected: boolean) => void): () => void {
  const listener = () => cb(getIsConnected());
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useIsConnected() {
  return useSyncExternalStore(subscribe, getIsConnected, () => true);
}

export function useIsForcedOffline() {
  return useSyncExternalStore(subscribe, isForcedOffline, () => false);
}

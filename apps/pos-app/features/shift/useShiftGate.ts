import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "pos_shift_native";

export interface ShiftGateState {
  loaded:       boolean;
  shiftOpen:    boolean;
  clockedIn:    boolean;
  onBreak:      boolean;
  cashier:      string | null;
  registerName: string | null;
}

const CLOSED: ShiftGateState = {
  loaded: true, shiftOpen: false, clockedIn: false, onBreak: false, cashier: null, registerName: null,
};

/**
 * Reads this device's local shift state (same AsyncStorage record shift.tsx
 * writes) on every screen focus — no shift is genuinely open/clocked-in
 * unless this says so. Used to gate order-taking screens behind
 * open-shift + clocked-in, matching how Shift & Cash treats "on break" as
 * not actually working.
 */
export function useShiftGate(): ShiftGateState {
  const [state, setState] = useState<ShiftGateState>({ ...CLOSED, loaded: false });

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      if (!raw) { setState(CLOSED); return; }
      try {
        const parsed = JSON.parse(raw);
        setState({
          loaded:       true,
          shiftOpen:    !!parsed?.open,
          clockedIn:    parsed?.currentStatus === "clocked_in",
          onBreak:      parsed?.currentStatus === "on_break",
          cashier:      parsed?.cashier ?? null,
          registerName: parsed?.registerName ?? null,
        });
      } catch {
        setState(CLOSED);
      }
    });
    return () => { cancelled = true; };
  }, []));

  return state;
}

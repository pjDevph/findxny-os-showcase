"use client";

export type ToastType = "add" | "remove" | "info";

export interface ToastEvent {
  id: number;
  msg: string;
  type: ToastType;
}

let _seq = 0;

export function toast(msg: string, type: ToastType = "add") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ToastEvent>("mtm-toast", {
      detail: { id: ++_seq, msg, type },
    })
  );
}

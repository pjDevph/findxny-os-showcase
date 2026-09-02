/**
 * Bridge between printReceiptImage.ts (a plain async function, called from
 * checkout/reprint code with no component of its own) and
 * ReceiptImageCaptureHost.tsx (an always-mounted, off-screen component —
 * see app/_layout.tsx — that actually renders PrintableReceiptView and
 * captures it). Same module-store + useSyncExternalStore pattern as
 * customerDisplay/store.ts.
 */
import { useSyncExternalStore } from "react";
import { ReceiptConfig, ReceiptPayload } from "./receiptConfig";

export interface CaptureJob {
  payload: ReceiptPayload;
  config: ReceiptConfig;
  storeName: string;
  copyLabel: string | null;
  mode: "simple" | "official";
  showTin: boolean;
  includeSku: boolean;
  pixelWidth: number;
}

let currentJob: CaptureJob | null = null;
let pendingResolve: ((uri: string) => void) | null = null;
let pendingReject: ((e: unknown) => void) | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getJob(): CaptureJob | null {
  return currentJob;
}

/** Host-side hook: the current job to render, or null when idle. */
export function useCaptureJob(): CaptureJob | null {
  return useSyncExternalStore(subscribe, getJob, getJob);
}

/**
 * Caller-side: request one receipt copy be rendered and captured to a
 * bitmap. Only one job can be in flight at a time (the host is a single
 * shared instance) — callers must await each copy before requesting the
 * next, which printReceiptImage.ts already does naturally by printing one
 * copy at a time.
 */
export function requestReceiptCapture(job: CaptureJob): Promise<string> {
  if (currentJob) throw new Error("A receipt capture is already in progress");
  return new Promise((resolve, reject) => {
    currentJob = job;
    pendingResolve = resolve;
    pendingReject = reject;
    emit();
  });
}

/** Host-side: called once the off-screen view has been captured. */
export function resolveReceiptCapture(uri: string): void {
  pendingResolve?.(uri);
  currentJob = null;
  pendingResolve = null;
  pendingReject = null;
  emit();
}

/** Host-side: called if rendering/capture itself fails. */
export function rejectReceiptCapture(e: unknown): void {
  pendingReject?.(e);
  currentJob = null;
  pendingResolve = null;
  pendingReject = null;
  emit();
}

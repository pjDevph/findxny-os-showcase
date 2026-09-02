"use client";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { ToastEvent } from "@/lib/toast";

interface ToastItem extends ToastEvent {
  dying: boolean;
}

const TTL = 2600;
const FADE = 350;

type SetToasts = Dispatch<SetStateAction<ToastItem[]>>;

function markDying(setToasts: SetToasts, id: number) {
  setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, dying: true } : t)));
}

function removeToast(setToasts: SetToasts, id: number) {
  setToasts((prev) => prev.filter((t) => t.id !== id));
}

function scheduleDismiss(setToasts: SetToasts, id: number) {
  setTimeout(() => {
    markDying(setToasts, id);
    setTimeout(() => removeToast(setToasts, id), FADE);
  }, TTL);
}

export default function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { id, msg, type } = (e as CustomEvent<ToastEvent>).detail;
      setToasts((prev) => [...prev, { id, msg, type, dying: false }]);
      scheduleDismiss(setToasts, id);
    };
    window.addEventListener("mtm-toast", handler);
    return () => window.removeEventListener("mtm-toast", handler);
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="toaster" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type} ${t.dying ? "toast-out" : ""}`}>
          {t.type === "add" && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {t.type === "remove" && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

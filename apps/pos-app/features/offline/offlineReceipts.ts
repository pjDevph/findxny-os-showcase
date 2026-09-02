/**
 * Local cache of receipt payloads for orders created while offline, keyed by
 * their temp id (the same `offln-...` id used in offlineQueue.ts) — lets a
 * cashier reprint an order that hasn't synced yet, from anywhere (not just
 * the checkout success screen, which is the only place it was ever
 * available before). Entries are written when the order is queued
 * (orderHelpers.ts) and removed once it actually syncs (offlineQueue.ts) —
 * after that, the real order is reprintable the normal way (server-backed,
 * via useTransactionDetail's own cache).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ReceiptPayload } from "../receipt/receiptConfig";

const cacheKey = (workspaceId: string) => `pos_offline_receipts_v1_${workspaceId}`;

async function readAll(workspaceId: string): Promise<Record<string, ReceiptPayload>> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(workspaceId));
    return raw ? (JSON.parse(raw) as Record<string, ReceiptPayload>) : {};
  } catch { return {}; }
}

export async function cacheOfflineReceipt(workspaceId: string, tempId: string, payload: ReceiptPayload): Promise<void> {
  const all = await readAll(workspaceId);
  all[tempId] = payload;
  await AsyncStorage.setItem(cacheKey(workspaceId), JSON.stringify(all));
}

export async function removeOfflineReceipt(workspaceId: string, tempId: string): Promise<void> {
  const all = await readAll(workspaceId);
  if (!(tempId in all)) return;
  delete all[tempId];
  await AsyncStorage.setItem(cacheKey(workspaceId), JSON.stringify(all));
}

export async function readOfflineReceipts(workspaceId: string): Promise<Record<string, ReceiptPayload>> {
  return readAll(workspaceId);
}

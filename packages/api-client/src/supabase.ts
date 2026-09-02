import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  /** Optional storage adapter — pass `expo-secure-store`-backed adapter on RN, omit for web. */
  storage?: any;
}

let _client: SupabaseClient | null = null;

export function initSupabase(cfg: SupabaseConfig): SupabaseClient {
  _client = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: typeof window !== "undefined" && cfg.storage === undefined,
      storage: cfg.storage,
    },
  });
  return _client;
}

export function supabase(): SupabaseClient {
  if (!_client) throw new Error("Supabase not initialized — call initSupabase() first");
  return _client;
}

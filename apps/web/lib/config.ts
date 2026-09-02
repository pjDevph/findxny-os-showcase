export {
  SUPABASE_URL, SUPABASE_ANON_KEY, WORKSPACE_SLUG,
  ONLINE_ORDERING_ENABLED, ONLINE_BOOKING_ENABLED,
} from "./env";

export const peso = (n: number) =>
  "₱ " + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

import AsyncStorage from "@react-native-async-storage/async-storage";

export interface PaymentConfig {
  gcashName:   string;
  gcashNumber: string;
  gcashQr:     string;
  mayaName:    string;
  mayaNumber:  string;
  mayaQr:      string;
  qrphInfo:    string;
  qrphQr:      string;
  bankName:          string;
  bankAccountName:   string;
  bankAccountNumber: string;
}

export const EMPTY_PAYMENT_CONFIG: PaymentConfig = {
  gcashName: "", gcashNumber: "", gcashQr: "",
  mayaName:  "", mayaNumber:  "", mayaQr:  "",
  qrphInfo:  "", qrphQr:      "",
  bankName: "", bankAccountName: "", bankAccountNumber: "",
};

const KEYS = {
  gcashName:   "pos_pay_gcash_name",
  gcashNumber: "pos_pay_gcash_number",
  gcashQr:     "pos_pay_gcash_qr",
  mayaName:    "pos_pay_maya_name",
  mayaNumber:  "pos_pay_maya_number",
  mayaQr:      "pos_pay_maya_qr",
  qrphInfo:    "pos_pay_qrph_info",
  qrphQr:      "pos_pay_qrph_qr",
  bankName:          "pos_pay_bank_name",
  bankAccountName:   "pos_pay_bank_account_name",
  bankAccountNumber: "pos_pay_bank_account_number",
} as const;

export async function loadPaymentConfig(): Promise<PaymentConfig> {
  const pairs = await AsyncStorage.multiGet(Object.values(KEYS));
  const m = Object.fromEntries(pairs.map(([k, v]) => [k, v ?? ""]));
  return {
    gcashName:   m[KEYS.gcashName],
    gcashNumber: m[KEYS.gcashNumber],
    gcashQr:     m[KEYS.gcashQr],
    mayaName:    m[KEYS.mayaName],
    mayaNumber:  m[KEYS.mayaNumber],
    mayaQr:      m[KEYS.mayaQr],
    qrphInfo:    m[KEYS.qrphInfo],
    qrphQr:      m[KEYS.qrphQr],
    bankName:          m[KEYS.bankName],
    bankAccountName:   m[KEYS.bankAccountName],
    bankAccountNumber: m[KEYS.bankAccountNumber],
  };
}

export async function savePaymentConfig(cfg: Partial<PaymentConfig>): Promise<void> {
  const pairs: [string, string][] = (Object.entries(KEYS) as [keyof typeof KEYS, string][])
    .filter(([k]) => cfg[k] !== undefined)
    .map(([k, storageKey]) => [storageKey, cfg[k]!]);
  if (pairs.length) await AsyncStorage.multiSet(pairs);
}

/** Map a workspaces row's payment_config jsonb (DB source of truth) to a PaymentConfig. */
export function paymentConfigFromWorkspace(
  ws: { payment_config?: Record<string, string> | null } | null | undefined,
): PaymentConfig {
  const pc = ws?.payment_config ?? {};
  return {
    gcashName:   pc.gcashName   ?? "",
    gcashNumber: pc.gcashNumber ?? "",
    gcashQr:     pc.gcashQr     ?? "",
    mayaName:    pc.mayaName    ?? "",
    mayaNumber:  pc.mayaNumber  ?? "",
    mayaQr:      pc.mayaQr      ?? "",
    qrphInfo:    pc.qrphInfo    ?? "",
    qrphQr:      pc.qrphQr      ?? "",
    bankName:          pc.bankName          ?? "",
    bankAccountName:   pc.bankAccountName   ?? "",
    bankAccountNumber: pc.bankAccountNumber ?? "",
  };
}

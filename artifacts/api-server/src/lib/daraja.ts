import { logger } from "./logger";

const CONSUMER_KEY    = process.env.MPESA_CONSUMER_KEY ?? "";
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET ?? "";
const SHORTCODE       = process.env.MPESA_SHORTCODE ?? "174379";
const PASSKEY         = process.env.MPESA_PASSKEY ?? "";
const B2C_SHORTCODE   = process.env.MPESA_B2C_SHORTCODE ?? SHORTCODE;
const B2C_INITIATOR   = process.env.MPESA_B2C_INITIATOR_NAME ?? "";
const B2C_SECURITY_CREDENTIAL = process.env.MPESA_B2C_SECURITY_CREDENTIAL ?? "";
const CALLBACK_BASE   = process.env.MPESA_CALLBACK_BASE_URL ?? "";
const CALLBACK_TOKEN  = process.env.MPESA_CALLBACK_TOKEN ?? "";
const ENVIRONMENT     = process.env.MPESA_ENVIRONMENT ?? "sandbox";
const MOCK_MODE       = process.env.MPESA_MOCK_MODE === "true" && process.env.NODE_ENV !== "production";

const BASE_URL =
  ENVIRONMENT === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }

  const credentials = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString("base64");
  const res = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!res.ok) throw new Error(`Daraja auth failed: ${res.status} ${await res.text()}`);

  const data = (await res.json()) as { access_token: string; expires_in: string };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in) * 1000,
  };
  return cachedToken.value;
}

function getTimestamp(): string {
  const now = new Date();
  return (
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0")
  );
}

function getPassword(timestamp: string): string {
  return Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString("base64");
}

export interface StkPushResult {
  success: boolean;
  checkoutRequestId?: string;
  merchantRequestId?: string;
  error?: string;
}

export async function initiateStkPush(
  phone: string,
  amountKes: number,
  accountRef: string,
  description: string
): Promise<StkPushResult> {
  if (!CONSUMER_KEY || !CONSUMER_SECRET || !PASSKEY || !CALLBACK_BASE || CALLBACK_TOKEN.length < 32) {
    if (MOCK_MODE) {
      logger.warn("M-Pesa credentials/callback URL missing — explicit non-production mock mode enabled");
      return {
        success: true,
        checkoutRequestId: `mock-${Date.now()}`,
        merchantRequestId: `mock-merchant-${Date.now()}`,
      };
    }
    logger.error("M-Pesa STK Push unavailable: required credentials or callback URL missing");
    return { success: false, error: "M-Pesa is not configured. Please contact support." };
  }

  try {
    const token = await getAccessToken();
    const timestamp = getTimestamp();
    const password = getPassword(timestamp);
    const callbackUrl = `${CALLBACK_BASE.replace(/\/$/, "")}/api/mpesa/callback?token=${encodeURIComponent(CALLBACK_TOKEN)}`;

    const body = {
      BusinessShortCode: SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.ceil(amountKes),
      PartyA: phone.replace(/^0/, "254"),
      PartyB: SHORTCODE,
      PhoneNumber: phone.replace(/^0/, "254"),
      CallBackURL: callbackUrl,
      AccountReference: accountRef,
      TransactionDesc: description,
    };

    const res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as Record<string, unknown>;
    logger.info({ data }, "STK push response");

    if (!res.ok || data["ResponseCode"] !== "0") {
      return { success: false, error: String(data["errorMessage"] ?? data["ResponseDescription"] ?? "STK push failed") };
    }

    return {
      success: true,
      checkoutRequestId: String(data["CheckoutRequestID"]),
      merchantRequestId: String(data["MerchantRequestID"]),
    };
  } catch (err) {
    logger.error({ err }, "STK push error");
    return { success: false, error: "M-Pesa service unavailable" };
  }
}

export interface B2CResult {
  success: boolean;
  conversationId?: string;
  error?: string;
}

export async function initiateB2CPayment(
  phone: string,
  amountKes: number,
  occasion: string
): Promise<B2CResult> {
  if (!CONSUMER_KEY || !CONSUMER_SECRET || !B2C_INITIATOR || !B2C_SECURITY_CREDENTIAL || !CALLBACK_BASE) {
    if (MOCK_MODE) {
      logger.warn("M-Pesa B2C credentials/callback URL missing — explicit non-production mock mode enabled");
      return { success: true, conversationId: `mock-b2c-${Date.now()}` };
    }
    logger.error("M-Pesa B2C unavailable: required credentials or callback URL missing");
    return { success: false, error: "M-Pesa withdrawals are not configured. Please contact support." };
  }

  try {
    const token = await getAccessToken();
    const callbackBase = CALLBACK_BASE.replace(/\/$/, "");
    const tokenQuery = `?token=${encodeURIComponent(CALLBACK_TOKEN)}`;
    const resultUrl = `${callbackBase}/api/mpesa/b2c-result${tokenQuery}`;
    const timeoutUrl = `${callbackBase}/api/mpesa/b2c-timeout${tokenQuery}`;

    const body = {
      InitiatorName: B2C_INITIATOR,
      SecurityCredential: B2C_SECURITY_CREDENTIAL,
      CommandID: "BusinessPayment",
      Amount: Math.floor(amountKes),
      PartyA: B2C_SHORTCODE,
      PartyB: phone.replace(/^0/, "254"),
      Remarks: occasion,
      QueueTimeOutURL: timeoutUrl,
      ResultURL: resultUrl,
      Occasion: occasion,
    };

    const res = await fetch(`${BASE_URL}/mpesa/b2c/v1/paymentrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok || !data["ConversationID"]) {
      return { success: false, error: String(data["errorMessage"] ?? "B2C request failed") };
    }

    return { success: true, conversationId: String(data["ConversationID"]) };
  } catch (err) {
    logger.error({ err }, "B2C payment error");
    return { success: false, error: "M-Pesa service unavailable" };
  }
}

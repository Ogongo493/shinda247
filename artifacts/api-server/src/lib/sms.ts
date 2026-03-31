import { logger } from "./logger";

const AT_API_KEY   = process.env.AT_API_KEY ?? "";
const AT_USERNAME  = process.env.AT_USERNAME ?? "";
const AT_SENDER_ID = process.env.AT_SENDER_ID ?? "SHINDA247";
const AT_ENV       = process.env.AT_ENV ?? "sandbox";

const AT_BASE_URL =
  AT_ENV === "production"
    ? "https://api.africastalking.com/version1/messaging"
    : "https://api.sandbox.africastalking.com/version1/messaging";

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendSms(phone: string, message: string): Promise<SmsSendResult> {
  const e164Phone = phone.startsWith("+") ? phone : "+" + phone;

  if (!AT_API_KEY || !AT_USERNAME) {
    logger.warn({ phone: e164Phone, message }, "Africa's Talking not configured — SMS not sent");
    return { success: false, error: "SMS gateway not configured" };
  }

  try {
    const params = new URLSearchParams({
      username: AT_USERNAME,
      to:       e164Phone,
      message,
      from:     AT_SENDER_ID,
    });

    const res = await fetch(AT_BASE_URL, {
      method:  "POST",
      headers: {
        apiKey:         AT_API_KEY,
        Accept:         "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, body: text }, "Africa's Talking SMS error");
      return { success: false, error: `SMS API error: ${res.status}` };
    }

    const data = (await res.json()) as Record<string, any>;
    const recipients = data?.SMSMessageData?.Recipients ?? [];
    const first = recipients[0];

    if (!first || (first.status !== "Success" && first.statusCode !== 101)) {
      logger.error({ data }, "Africa's Talking SMS delivery failed");
      return { success: false, error: first?.status ?? "Delivery failed" };
    }

    logger.info({ phone: e164Phone, messageId: first.messageId }, "SMS sent via Africa's Talking");
    return { success: true, messageId: String(first.messageId ?? "") };
  } catch (err) {
    logger.error({ err }, "Africa's Talking SMS exception");
    return { success: false, error: "SMS service unavailable" };
  }
}

export async function sendOtp(phone: string, otp: string): Promise<SmsSendResult> {
  const message = `Your Shinda 24/7 verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`;
  return sendSms(phone, message);
}

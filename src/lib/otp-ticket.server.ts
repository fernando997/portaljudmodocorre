import { createHmac, timingSafeEqual } from "node:crypto";

type OtpTicketPayload = {
  phone: string;
  expires: number;
  challenge: string;
};

const getSessionSecret = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET não configurado.");
  return secret;
};

const toBase64Url = (value: string) =>
  Buffer.from(value, "utf8").toString("base64url");

const fromBase64Url = (value: string) =>
  Buffer.from(value, "base64url").toString("utf8");

const hmac = (secret: string, value: string) =>
  createHmac("sha256", secret).update(value).digest("base64url");

const timingSafeEquals = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const createOtpTicket = (phone: string, code: string, expires: number) => {
  const secret = getSessionSecret();
  const payload: OtpTicketPayload = {
    phone,
    expires,
    challenge: hmac(secret, `${phone}:${code}:${expires}:otp-challenge`),
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  return `${encodedPayload}.${hmac(secret, encodedPayload)}`;
};

export const readOtpTicket = (ticket: string | undefined, code: string) => {
  if (!ticket) return null;

  const [encodedPayload, signature] = ticket.split(".");
  if (!encodedPayload || !signature) return null;

  const secret = getSessionSecret();
  const expectedSignature = hmac(secret, encodedPayload);
  if (!timingSafeEquals(signature, expectedSignature)) return null;

  const payload = JSON.parse(fromBase64Url(encodedPayload)) as OtpTicketPayload;
  if (!payload.phone || !payload.expires || !payload.challenge) return null;

  const expectedChallenge = hmac(
    secret,
    `${payload.phone}:${code}:${payload.expires}:otp-challenge`,
  );

  if (!timingSafeEquals(payload.challenge, expectedChallenge)) return null;
  return payload;
};
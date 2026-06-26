import { createServerFn } from "@tanstack/react-start";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const phoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(z.string().min(10, "Celular inválido").max(13));

const codeSchema = z.string().regex(/^\d{6}$/, "Código deve ter 6 dígitos");

const ticketSchema = z.string().optional();

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

const createOtpTicket = (phone: string, code: string, expires: number) => {
  const secret = getSessionSecret();
  const payload: OtpTicketPayload = {
    phone,
    expires,
    challenge: hmac(secret, `${phone}:${code}:${expires}:otp-challenge`),
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  return `${encodedPayload}.${hmac(secret, encodedPayload)}`;
};

const readOtpTicket = (ticket: string | undefined, code: string) => {
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

export const requestOtp = createServerFn({ method: "POST" })
  .inputValidator((d: { phone: string }) => ({ phone: phoneSchema.parse(d.phone) }))
  .handler(async ({ data }) => {
    const { getAppSession } = await import("./session.server");
    const session = await getAppSession();

    // Mock OTP: random 6-digit code returned to client (dev mode).
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 5 * 60 * 1000;
    await session.update({
      pendingPhone: data.phone,
      pendingCode: code,
      pendingExpires: expires,
    });

    // TODO: integrar provedor real (Twilio / Z-API / Evolution / API Bubble)
    return { ok: true as const, devCode: code, phone: data.phone, ticket: createOtpTicket(data.phone, code, expires) };
  });

export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string; ticket?: string }) => ({
    code: codeSchema.parse(d.code),
    ticket: ticketSchema.parse(d.ticket),
  }))
  .handler(async ({ data }) => {
    const { getAppSession } = await import("./session.server");
    const session = await getAppSession();
    const s = session.data;
    const ticket = readOtpTicket(data.ticket, data.code);
    const phone = s.pendingPhone ?? ticket?.phone;
    const pendingCode = s.pendingCode;
    const expires = s.pendingExpires ?? ticket?.expires;

    if (!phone || !expires || (!pendingCode && !ticket)) {
      return { ok: false as const, error: "Nenhum código pendente. Reinicie o login." };
    }
    if (Date.now() > expires) {
      return { ok: false as const, error: "Código expirado. Solicite um novo." };
    }
    if (pendingCode && data.code !== pendingCode) {
      return { ok: false as const, error: "Código incorreto." };
    }

    await session.update({
      userId: phone,
      phone,
      pendingPhone: undefined,
      pendingCode: undefined,
      pendingExpires: undefined,
    });

    return { ok: true as const };
  });

export const getCurrentUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getAppSession } = await import("./session.server");
  const session = await getAppSession();
  if (!session.data.userId || !session.data.phone) return null;
  return { userId: session.data.userId, phone: session.data.phone };
});

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const { getAppSession } = await import("./session.server");
  const session = await getAppSession();
  await session.clear();
  return { ok: true as const };
});

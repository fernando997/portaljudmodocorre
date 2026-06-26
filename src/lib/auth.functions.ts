import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const phoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(z.string().min(10, "Celular inválido").max(13));

const codeSchema = z.string().regex(/^\d{6}$/, "Código deve ter 6 dígitos");

const ticketSchema = z.string().optional();

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

    const { createOtpTicket } = await import("./otp-ticket.server");

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
    const { readOtpTicket } = await import("./otp-ticket.server");
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

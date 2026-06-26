import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const phoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(z.string().min(10, "Celular inválido").max(13));

const codeSchema = z.string().regex(/^\d{6}$/, "Código deve ter 6 dígitos");

export const requestOtp = createServerFn({ method: "POST" })
  .inputValidator((d: { phone: string }) => ({ phone: phoneSchema.parse(d.phone) }))
  .handler(async ({ data }) => {
    const { getAppSession } = await import("./session.server");
    const session = await getAppSession();

    // Mock OTP: random 6-digit code returned to client (dev mode).
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await session.update({
      pendingPhone: data.phone,
      pendingCode: code,
      pendingExpires: Date.now() + 5 * 60 * 1000,
    });

    // TODO: integrar provedor real (Twilio / Z-API / Evolution / API Bubble)
    return { ok: true as const, devCode: code, phone: data.phone };
  });

export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string }) => ({ code: codeSchema.parse(d.code) }))
  .handler(async ({ data }) => {
    const { getAppSession } = await import("./session.server");
    const session = await getAppSession();
    const s = session.data;

    if (!s.pendingPhone || !s.pendingCode || !s.pendingExpires) {
      throw new Error("Nenhum código pendente. Reinicie o login.");
    }
    if (Date.now() > s.pendingExpires) {
      throw new Error("Código expirado. Solicite um novo.");
    }
    if (data.code !== s.pendingCode) {
      throw new Error("Código incorreto.");
    }

    await session.update({
      userId: s.pendingPhone,
      phone: s.pendingPhone,
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

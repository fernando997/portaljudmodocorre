import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const phoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(z.string().min(10, "Celular inválido").max(13));

const codeSchema = z.string().regex(/^\d{6}$/, "Código deve ter 6 dígitos");

export const requestOtp = createServerFn({ method: "POST" })
  .inputValidator((d: { phone: string }) => ({
    phone: phoneSchema.parse(d.phone),
  }))
  .handler(async ({ data }) => {
    const { getAppSession } = await import("./session.server");
    const { debugLog } = await import("./debug.server");
    const session = await getAppSession();

    const baseUrl = process.env.VITE_BUBBLE_BASE_URL_PRODUCTION;
    const platformToken = process.env.VITE_BUBBLE_PLATFORM_TOKEN;
    const apiToken = process.env.VITE_BUBBLE_API_TOKEN;

    if (!baseUrl || !platformToken) {
      throw new Error("Configuração do servidor incompleta.");
    }

    const getUsuarioUrl = `${baseUrl.replace(/\/$/, "")}/get_usuario`;
    const getUsuarioBody = { celular: data.phone, apikey: apiToken ?? "" };
    debugLog("get_usuario:request", { url: getUsuarioUrl, body: getUsuarioBody });

    const userRes = await fetch(getUsuarioUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${platformToken}`,
      },
      body: JSON.stringify(getUsuarioBody),
    });

    const userRaw = await userRes.text();
    debugLog("get_usuario:response", { status: userRes.status, body: userRaw });

    if (!userRes.ok) {
      throw new Error("Não encontramos registro desse celular!");
    }

    let userJson: any = {};
    try { userJson = JSON.parse(userRaw); } catch {}
    const userData = userJson.response ?? userJson;
    const advogado = userData.usuario ?? null;
    debugLog("get_usuario:parsed", { advogado });

    if (!advogado?._id) {
      throw new Error("Não encontramos registro desse celular!");
    }

    const pendingNome = String(advogado.nome ?? "");
    const pendingAdvogadoId = String(advogado._id);
    const pendingComissao = Number(advogado.comissao ?? 0);

    const url = `${baseUrl.replace(/\/$/, "")}/enviar-codigo-jud`;
    const code = Math.floor(100000 + Math.random() * 900000);
    const body = { telefone: Number(data.phone), codigo: code, apikey: apiToken ?? "" };
    debugLog("enviar-codigo-jud:request", { url, body });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${platformToken}`,
      },
      body: JSON.stringify(body),
    });

    const rawText = await res.text();
    debugLog("enviar-codigo-jud:response", { status: res.status, body: rawText });
    const expires = Date.now() + 5 * 60 * 1000;

    await session.update({
      userId: undefined,
      pendingPhone: data.phone,
      pendingCode: String(code),
      pendingExpires: expires,
      pendingNome: pendingNome,
      pendingAdvogadoId: pendingAdvogadoId,
      pendingComissao: pendingComissao,
    });

    return { ok: true as const, phone: data.phone };
  });

export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string }) => ({
    code: codeSchema.parse(d.code),
  }))
  .handler(async ({ data }) => {
    const { getAppSession } = await import("./session.server");
    const { debugLog } = await import("./debug.server");
    const session = await getAppSession();
    const s = session.data;

    const phone = s.pendingPhone;
    const pendingCode = s.pendingCode;
    const expires = s.pendingExpires;

    if (!phone || !pendingCode || !expires) {
      return { ok: false as const, error: "Nenhum código pendente. Reinicie o login." };
    }
    if (Date.now() > expires) {
      return { ok: false as const, error: "Código expirado. Solicite um novo." };
    }
    if (data.code !== pendingCode) {
      return { ok: false as const, error: "Código incorreto." };
    }

    const baseUrl = process.env.VITE_BUBBLE_BASE_URL_PRODUCTION;
    const platformToken = process.env.VITE_BUBBLE_PLATFORM_TOKEN;
    const apiToken = process.env.VITE_BUBBLE_API_TOKEN;

    if (baseUrl && platformToken) {
      const url = `${baseUrl.replace(/\/$/, "")}/verificar-codigo-jud`;
      const body = { celular: Number(phone), codigo: Number(data.code), apikey: apiToken ?? "" };
      debugLog("verificar-codigo-jud:request", { url, body });

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${platformToken}`,
        },
        body: JSON.stringify(body),
      });

      const rawText = await res.text();
      debugLog("verificar-codigo-jud:response", { status: res.status, body: rawText });

      if (!res.ok) {
        return { ok: false as const, error: "Falha ao verificar código no servidor." };
      }

      const json = JSON.parse(rawText);
      const responseData = json.response ?? json;
      debugLog("verificar-codigo-jud:parsed", responseData);
    }

    await session.update({
      userId: phone,
      phone,
      nome: s.pendingNome || "",
      advogadoId: s.pendingAdvogadoId || "",
      comissao: s.pendingComissao ?? 0,
      pendingPhone: undefined,
      pendingCode: undefined,
      pendingExpires: undefined,
      pendingNome: undefined,
      pendingAdvogadoId: undefined,
      pendingComissao: undefined,
    });

    return { ok: true as const };
  });

export const getCurrentUser = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getAppSession } = await import("./session.server");
    const session = await getAppSession();
    if (!session.data.userId || !session.data.phone) return null;
    return {
      userId: session.data.userId,
      phone: session.data.phone,
      nome: session.data.nome || "",
      advogadoId: session.data.advogadoId || "",
    };
  },
);

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const { getAppSession } = await import("./session.server");
  const session = await getAppSession();
  await session.clear();
  return { ok: true as const };
});

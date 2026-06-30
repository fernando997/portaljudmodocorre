import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type Case = {
  id: string;
  contratoId: string;
  advogadoId: string;
  status: string;
};

export async function getAdvogadoId(): Promise<string> {
  const { getAppSession } = await import("./session.server");
  const session = await getAppSession();
  if (!session.data.userId) throw new Error("Não autenticado");

  if (session.data.advogadoId) return session.data.advogadoId;

  const baseUrl = process.env.VITE_BUBBLE_BASE_URL_PRODUCTION;
  const platformToken = process.env.VITE_BUBBLE_PLATFORM_TOKEN;
  const apiToken = process.env.VITE_BUBBLE_API_TOKEN;
  if (!baseUrl || !platformToken) throw new Error("Faça login novamente.");

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/get_usuario`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${platformToken}`,
    },
    body: JSON.stringify({ celular: session.data.phone, apikey: apiToken ?? "" }),
  });
  if (!res.ok) throw new Error("Erro ao recuperar dados do advogado.");
  const json = await res.json();
  const advogado = (json.response ?? json).usuario;
  if (!advogado?._id) throw new Error("Faça login novamente.");

  await session.update({ ...session.data, advogadoId: String(advogado._id) });
  return String(advogado._id);
}

function bubbleHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.VITE_BUBBLE_PLATFORM_TOKEN}`,
  };
}

export const aceitarCaso = createServerFn({ method: "POST" })
  .inputValidator((d: { contratoId: string }) => ({
    contratoId: z.string().min(1).parse(d.contratoId),
  }))
  .handler(async ({ data }) => {
    const advogadoId = await getAdvogadoId();
    const baseUrl = process.env.VITE_BUBBLE_BASE_URL_PRODUCTION!;
    const apiToken = process.env.VITE_BUBBLE_API_TOKEN;

    const { debugLog } = await import("./debug.server");
    const url = `${baseUrl.replace(/\/$/, "")}/aceitar_caso`;
    const body = {
      apikey: apiToken ?? "",
      contrato_id: data.contratoId,
      advogado_id: advogadoId,
    };
    debugLog("aceitar_caso:request", { url, body });

    const res = await fetch(url, {
      method: "POST",
      headers: bubbleHeaders(),
      body: JSON.stringify(body),
    });

    const rawText = await res.text();
    debugLog("aceitar_caso:response", { status: res.status, body: rawText });

    if (!res.ok) throw new Error("Erro ao aceitar caso.");
    return { ok: true as const };
  });

export const abandonarCaso = createServerFn({ method: "POST" })
  .inputValidator((d: { casoId: string; contratoId: string; motivo: string }) => ({
    casoId: z.string().min(1).parse(d.casoId),
    contratoId: z.string().min(1).parse(d.contratoId),
    motivo: z.string().min(1, "Informe o motivo").parse(d.motivo),
  }))
  .handler(async ({ data }) => {
    const { getAppSession } = await import("./session.server");
    const session = await getAppSession();
    if (!session.data.userId) throw new Error("Não autenticado");

    const baseUrl = process.env.VITE_BUBBLE_BASE_URL_PRODUCTION!;
    const apiToken = process.env.VITE_BUBBLE_API_TOKEN;

    const { debugLog } = await import("./debug.server");
    const url = `${baseUrl.replace(/\/$/, "")}/abandonar_caso`;
    const body = {
      apikey: apiToken ?? "",
      caso_id: data.casoId,
      contrato: data.contratoId,
      motivo: data.motivo,
      data_abandono: new Date().toISOString(),
    };
    debugLog("abandonar_caso:request", { url, body });

    const res = await fetch(url, {
      method: "POST",
      headers: bubbleHeaders(),
      body: JSON.stringify(body),
    });

    const rawText = await res.text();
    debugLog("abandonar_caso:response", { status: res.status, body: rawText });

    if (!res.ok) throw new Error("Erro ao abandonar caso.");
    return { ok: true as const };
  });

async function uploadToTmpFiles(base64Data: string, filename: string): Promise<string> {
  const base64Content = base64Data.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(base64Content, "base64");
  const blob = new Blob([buffer]);

  const form = new FormData();
  form.append("file", blob, filename);

  const res = await fetch("https://tmpfiles.org/api/v1/upload", {
    method: "POST",
    body: form,
  });

  if (!res.ok) throw new Error("Erro ao fazer upload do arquivo.");
  const json = (await res.json()) as { data: { url: string } };
  return json.data.url.replace("tmpfiles.org/", "tmpfiles.org/dl/");
}

export const finalizarCaso = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { casoId: string; contratoId: string; arquivo?: string; arquivoNome?: string }) => ({
      casoId: z.string().min(1).parse(d.casoId),
      contratoId: z.string().min(1).parse(d.contratoId),
      arquivo: d.arquivo ?? "",
      arquivoNome: d.arquivoNome ?? "",
    }),
  )
  .handler(async ({ data }) => {
    const { getAppSession } = await import("./session.server");
    const session = await getAppSession();
    if (!session.data.userId) throw new Error("Não autenticado");

    const baseUrl = process.env.VITE_BUBBLE_BASE_URL_PRODUCTION!;
    const apiToken = process.env.VITE_BUBBLE_API_TOKEN;

    const { debugLog } = await import("./debug.server");

    let fileUrl = "";
    if (data.arquivo) {
      fileUrl = await uploadToTmpFiles(data.arquivo, data.arquivoNome || "arquivo.pdf");
    }

    const url = `${baseUrl.replace(/\/$/, "")}/finalizar_caso`;
    const body = {
      apikey: apiToken ?? "",
      caso_id: data.contratoId,
      data_conclusao: new Date().toISOString(),
      file: fileUrl,
    };
    debugLog("finalizar_caso:request", {
      url,
      caso_id: data.contratoId,
      fileUrl,
      arquivoNome: data.arquivoNome,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: bubbleHeaders(),
      body: JSON.stringify(body),
    });

    const rawText = await res.text();
    debugLog("finalizar_caso:response", { status: res.status, body: rawText });

    if (!res.ok) throw new Error("Erro ao finalizar caso.");
    return { ok: true as const };
  });

export const getCasos = createServerFn({ method: "GET" }).handler(async () => {
  const { getAppSession } = await import("./session.server");
  const session = await getAppSession();
  if (!session.data.userId) throw new Error("Não autenticado");

  const baseUrl = process.env.VITE_BUBBLE_BASE_URL_PRODUCTION;
  const platformToken = process.env.VITE_BUBBLE_PLATFORM_TOKEN;
  const apiToken = process.env.VITE_BUBBLE_API_TOKEN;

  if (!baseUrl || !platformToken) {
    return { casos: [] as Case[], contracts: [] as any[] };
  }

  const advogadoId = await getAdvogadoId();

  const { debugLog } = await import("./debug.server");
  const url = `${baseUrl.replace(/\/$/, "")}/get_casos`;
  const body = { apikey: apiToken ?? "", advogado_id: advogadoId };
  debugLog("get_casos:request", { url, body });

  const res = await fetch(url, {
    method: "POST",
    headers: bubbleHeaders(),
    body: JSON.stringify(body),
  });

  const rawText = await res.text();
  debugLog("get_casos:response", { status: res.status, body: rawText.slice(0, 1000) });

  if (!res.ok) return { casos: [] as Case[], contracts: [] as any[] };

  const json = JSON.parse(rawText);
  const data = json.response ?? json;

  const rawCasos: any[] = data.casos ?? [];
  const casos: Case[] = rawCasos.map((c: any) => ({
    id: String(c._id ?? ""),
    contratoId: String(c.contrato ?? ""),
    advogadoId: String(c.advogado ?? ""),
    status: String(c.status ?? ""),
  }));

  debugLog("get_casos:parsed", {
    total: casos.length,
    sample: casos[0],
  });

  return { casos };
});

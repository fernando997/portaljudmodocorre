import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function fileUrl(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.startsWith("//") ? `https:${s}` : s;
}

export const getProcuracaoUrl = createServerFn({ method: "GET" })
  .inputValidator((d: { locadoraBubbleId: string }) => ({
    locadoraBubbleId: z.string().min(1).parse(d.locadoraBubbleId),
  }))
  .handler(async ({ data }) => {
    const { getAppSession } = await import("./session.server");
    const session = await getAppSession();
    if (!session.data.userId) throw new Error("Não autenticado");

    const apiKey = process.env.PROCURACAO_API;
    const auth = process.env.PROCURACAO_AUTH;
    const xApiKey = process.env.PROCURACAO_X_API_KEY;
    if (!apiKey || !auth || !xApiKey) {
      throw new Error("Integração de Procuração não configurada.");
    }

    const res = await fetch(
      "https://dmcsfceqxffajewahjgj.supabase.co/functions/v1/consultar-arquivos",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
          Authorization: auth,
          "x-api-key": xApiKey,
        },
        body: JSON.stringify({ locadora_bubble_id: data.locadoraBubbleId }),
      },
    );

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json?.error || "Erro ao consultar procuração.");
    }

    const arquivos: any[] = Array.isArray(json.arquivos) ? json.arquivos : [];
    const procuracao = arquivos.find((a) => a.tipo === "procuracao");

    if (!procuracao?.file_url) {
      throw new Error("Procuração não encontrada para esta locadora.");
    }

    return { url: fileUrl(procuracao.file_url) };
  });

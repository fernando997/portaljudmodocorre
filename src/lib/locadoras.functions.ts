import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { nomePlausivel } from "./formatters";

export type Locadora = {
  id: string;
  nomeSocial: string;
  cnpj: string;
  logradouro: string;
  numero: string;
  bairro: string;
  complemento: string;
  cidade: string;
  estado: string;
  cep: string;
  status: string;
  assinaturaUrl: string;
  certificadoVencimento: number | null;
  temCertificado: boolean;
  /**
   * Representante legal do cadastro (RL_nome), já filtrado: vem string vazia
   * quando o campo tem lixo. Serve só para a procuração sem assinatura — na
   * assinada, quem manda é o responsável lido do certificado.
   */
  representanteNome: string;
};

/**
 * Regra única de "esta locadora consegue assinar hoje": tem certificado
 * cadastrado e ele não venceu. É usada pelo card em /locadoras (para bloquear
 * o botão) e pela vitrine (para o filtro de procuração) — se as duas telas
 * calculassem por conta própria, uma hora divergiriam.
 */
export function certificadoValido(l: {
  temCertificado: boolean;
  certificadoVencimento: number | null;
}): boolean {
  if (!l.temCertificado) return false;
  return !(l.certificadoVencimento && l.certificadoVencimento < Date.now());
}

/**
 * Locadora + dados sensíveis do certificado digital. NUNCA pode sair do
 * servidor — a URL do .pfx é pública no CDN do Bubble e a senha vem em texto
 * puro, então quem tiver os dois consegue assinar como a empresa.
 */
export type LocadoraComCertificado = {
  locadora: Locadora;
  email: string;
  certificadoUrl: string;
  certificadoSenha: string;
};

/** Registro cru do Bubble. Os nomes de campo são do cadastro, não do nosso tipo. */
type RegistroBruto = Record<string, unknown>;

function str(v: unknown): string {
  return String(v ?? "");
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function normalize(raw: RegistroBruto): Locadora {
  const nomeSocial = str(raw.nome);
  const rl = str(raw.RL_nome).trim();
  return {
    id: str(raw._id),
    nomeSocial,
    cnpj: str(raw.cnpj),
    logradouro: str(raw.logradouro),
    numero: str(raw.numero),
    bairro: str(raw.bairro),
    complemento: str(raw.complemento),
    cidade: str(raw.cidade),
    estado: str(raw.estado),
    cep: str(raw.cep),
    status: str(raw.status),
    assinaturaUrl: str(raw.assinatura),
    certificadoVencimento: num(raw.certificado_vencimento),
    temCertificado: !!str(raw.certificado) && !!str(raw.certificado_senha),
    representanteNome: nomePlausivel(rl, nomeSocial) ? rl : "",
  };
}

type PaginaBruta = { locadoras: RegistroBruto[]; total: number };

/**
 * Busca uma página crua no Bubble. Server-only: o retorno inclui os campos de
 * certificado, que não podem trafegar até o browser.
 */
export async function fetchLocadorasRaw(
  offset: number,
  limit: number,
  busca: string,
): Promise<PaginaBruta> {
  const baseUrl = process.env.VITE_BUBBLE_BASE_URL;
  const platformToken = process.env.VITE_BUBBLE_PLATFORM_TOKEN;
  const apiToken = process.env.VITE_BUBBLE_API_TOKEN;

  if (!baseUrl || !platformToken) return { locadoras: [], total: 0 };

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/get_locadoras`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${platformToken}`,
    },
    body: JSON.stringify({
      apikey: apiToken ?? "",
      offset,
      limit,
      locadoras: null,
      busca,
    }),
  });

  if (!res.ok) throw new Error("Erro ao buscar locadoras.");

  const json = await res.json();
  const data = json.response ?? json;
  const locadoras: RegistroBruto[] = data.locadoras ?? data.results ?? [];
  const total: number = typeof data.total === "number" ? data.total : locadoras.length;

  return { locadoras, total };
}

export const getLocadoras = createServerFn({ method: "GET" })
  .inputValidator((d: { offset: number; limit: number; search?: string }) => ({
    offset: z.number().int().min(0).parse(d.offset),
    limit: z.number().int().min(1).max(100).parse(d.limit),
    search: d.search ? z.string().parse(d.search) : "",
  }))
  .handler(async ({ data }) => {
    const { getAppSession } = await import("./session.server");
    const session = await getAppSession();
    if (!session.data.userId) throw new Error("Não autenticado");

    const { locadoras, total } = await fetchLocadorasRaw(data.offset, data.limit, data.search);

    return { locadoras: locadoras.map(normalize), total };
  });

/**
 * Localiza uma locadora pelo id e devolve os dados dela junto com o
 * certificado. Só pode ser chamada de dentro de um handler server-side.
 *
 * O endpoint do Bubble não filtra por id e devolve no máximo 50 por página,
 * então percorre as páginas até achar.
 */
export async function getLocadoraComCertificado(
  locadoraId: string,
): Promise<LocadoraComCertificado | null> {
  const PAGINA = 50;
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const pagina = await fetchLocadorasRaw(offset, PAGINA, "");
    total = pagina.total;

    const achada = pagina.locadoras.find((l) => str(l._id) === locadoraId);
    if (achada) {
      return {
        locadora: normalize(achada),
        email: str(achada.email),
        certificadoUrl: str(achada.certificado),
        certificadoSenha: str(achada.certificado_senha),
      };
    }

    if (pagina.locadoras.length === 0) break;
    offset += pagina.locadoras.length;
  }

  return null;
}

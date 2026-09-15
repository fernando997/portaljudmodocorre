import { createServerFn } from "@tanstack/react-start";

import { certificadoValido } from "./locadoras.functions";

export type Contract = {
  id: string;
  nrContrato: string;
  clienteNome: string;
  clienteCelular: string;
  clienteCidade: string;
  fiadorNome: string;
  comissao: number;
  totalFechamento: number;
  statusContrato: string;
  tipoContrato: string;
  tipoEntrega: string;
  statusAssinatura: string;
  createdAt?: number;
  inicio?: number;
  fim?: number;
  status: "ativo" | "bloqueado" | "encerrado";
  /** Id da locadora dona do contrato, resolvida via contrato → placa → locadora. */
  locadoraId: string;
  locadoraNome: string;
  /**
   * A locadora consegue assinar uma procuração hoje: tem certificado A1
   * cadastrado e ele não venceu. Alimenta o filtro "Com procuração assinada /
   * Sem procuração" da vitrine. Só o booleano viaja até o browser — o
   * certificado em si nunca sai do servidor, mesmo vindo embutido no registro
   * bruto da locadora (ver `normalize`).
   */
  locadoraCertificadoValido: boolean;
};

export type CustomerInfo = {
  nome_completo: string;
  celular: string;
  cidade: string;
  bairro: string;
  fiador: string;
};

export function parseBrl(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 0;
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

const BUBBLE_ID_RE = /^\d+x\d+$/;

export function normalize(
  raw: any,
  idx: number,
  customers: Map<string, CustomerInfo>,
  fechamentos: Map<string, number>,
  locadoraRaw?: Record<string, unknown>,
): Contract {
  const bloqueio = String(raw["bloqueio"] ?? "").trim();
  const aditivo = String(raw["Aditivo"] ?? raw["aditivo"] ?? "").trim();
  const statusBubble = String(raw["status"] ?? "").trim();

  const clienteId = String(raw["cliente"] ?? "");
  const cust = customers.get(clienteId);

  const fiadorId = String(raw["fiadores"] ?? cust?.fiador ?? "");
  const fiadorCust = customers.get(fiadorId);

  let clienteNome = cust?.nome_completo ?? "";
  if (!clienteNome && !BUBBLE_ID_RE.test(clienteId)) clienteNome = clienteId;

  const contractId = String(raw["_id"] ?? raw["id"] ?? `c-${idx}`);

  return {
    id: contractId,
    nrContrato: raw["Numero ctr"] ? String(raw["Numero ctr"]) : "",
    clienteNome,
    clienteCelular: cust?.celular ? formatPhone(cust.celular) : "",
    clienteCidade: cust?.cidade ?? "",
    fiadorNome: fiadorCust?.nome_completo ?? "",
    comissao: parseBrl(raw["comissao1pgt"]),
    totalFechamento: fechamentos.get(contractId) ?? 0,
    statusContrato: statusBubble,
    tipoContrato: String(raw["tipo de contrato"] ?? ""),
    tipoEntrega: String(raw["tipo_de_entrega"] ?? ""),
    statusAssinatura: String(raw["status assinatura"] ?? ""),
    createdAt: raw["Created Date"],
    inicio: raw["inicio"],
    fim: raw["fim"],
    status: bloqueio ? "bloqueado" : aditivo ? "encerrado" : "ativo",
    ...locadoraDe(locadoraRaw),
  };
}

/**
 * O get_contratos devolve a locadora embutida (contrato → placa → locadora),
 * na mesma lista paralela que já traz `customer`/`fiador`/`fechamento`. O
 * registro cru carrega `certificado`/`certificado_senha` — por isso só o
 * necessário é extraído aqui, e o objeto bruto nunca é devolvido ao browser.
 */
function locadoraDe(
  raw: Record<string, unknown> | undefined,
): Pick<Contract, "locadoraId" | "locadoraNome" | "locadoraCertificadoValido"> {
  if (!raw) return { locadoraId: "", locadoraNome: "", locadoraCertificadoValido: false };
  return {
    locadoraId: String(raw["_id"] ?? "").trim(),
    locadoraNome: String(raw["nome"] ?? "").trim(),
    locadoraCertificadoValido: certificadoValido({
      temCertificado:
        !!String(raw["certificado"] ?? "") && !!String(raw["certificado_senha"] ?? ""),
      certificadoVencimento:
        typeof raw["certificado_vencimento"] === "number"
          ? (raw["certificado_vencimento"] as number)
          : null,
    }),
  };
}

// Demo dataset baked in until the user supplies Bubble URL + token via secrets.
const MOCK: any[] = Array.from({ length: 28 }).map((_, i) => {
  const month = (i % 12) + 1;
  const day = ((i * 3) % 27) + 1;
  const blocked = i % 11 === 0;
  const ended = i % 7 === 0 && !blocked;
  return {
    _id: `mock-${i}`,
    cliente: `Cliente ${1000 + i}`,
    "agente operador": i % 3 === 0 ? "" : "Operador A",
    caução: "1756664876582x563251611730968600",
    combustivel: i % 2 === 0 ? "R" : "G",
    comissao1pgt: (80 + ((i * 7.31) % 80)).toFixed(4).replace(".", ","),
    Aditivo: ended ? "Sim" : "",
    bloqueio: blocked ? "Sim" : "",
    "Created Date": `2024-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T10:00:00Z`,
  };
});

export const getContracts = createServerFn({ method: "GET" }).handler(async () => {
  const { getAppSession } = await import("./session.server");
  const session = await getAppSession();
  if (!session.data.userId) throw new Error("Não autenticado");

  const { getAdvogadoId } = await import("./cases.functions");
  const advogadoId = await getAdvogadoId();

  const baseUrl = process.env.VITE_BUBBLE_BASE_URL;
  const apiToken = process.env.VITE_BUBBLE_API_TOKEN;
  const platformToken = process.env.VITE_BUBBLE_PLATFORM_TOKEN;

  const PAGE_SIZE = 50;
  let raw: any[] = [];
  let rawCasos: any[] = [];
  let customers = new Map<string, CustomerInfo>();
  let fechamentos = new Map<string, number>();
  // Locadora vem numa lista paralela a `contratos`, alinhada por posição
  // dentro da mesma página — por isso é pareada aqui, não pelo _id da
  // locadora (que a gente só conhece depois de já ter o objeto em mãos).
  const locadorasPorContratoId = new Map<string, Record<string, unknown>>();
  let seenFechamentos = new Set<string>();
  let seenCasos = new Set<string>();
  let source: "bubble" | "mock" = "mock";

  if (baseUrl && platformToken) {
    try {
      const endpoint = `${baseUrl.replace(/\/$/, "")}/get_contratos`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${platformToken}`,
      };

      let offset = 0;
      let totalFromBubble = 0;
      let hasMore = true;
      while (hasMore) {
        const body = {
          offset,
          limit: offset + PAGE_SIZE,
          apikey: apiToken ?? "",
          contratos: null,
          advogado_id: advogadoId,
        };

        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        const rawText = await res.text();

        if (!res.ok) throw new Error(`Bubble respondeu ${res.status}`);
        const json = JSON.parse(rawText);
        const data = json.response ?? json;

        if (offset === 0 && typeof data.total === "number") {
          totalFromBubble = data.total;
        }

        const pageContracts: any[] = data.contratos ?? data.results ?? [];
        const pageCustomers: any[] = data.customer ?? [];
        const pageFiadores: any[] = data.fiador ?? [];
        const pageFechamentos: any[] = data.fechamento ?? [];
        const pageLocadoras: unknown[] = data.locadora ?? [];

        raw.push(...pageContracts);

        pageContracts.forEach((c, i) => {
          const l = pageLocadoras[i] as Record<string, unknown> | undefined;
          const contratoId = String(c["_id"] ?? "");
          if (contratoId && l) locadorasPorContratoId.set(contratoId, l);
        });

        for (const c of pageCustomers) {
          const id = String(c["_id"] ?? "");
          if (id) {
            customers.set(id, {
              nome_completo: String(c["nome_completo"] ?? ""),
              celular: String(c["celular"] ?? ""),
              cidade: String(c["cidade"] ?? ""),
              bairro: String(c["bairro"] ?? ""),
              fiador: String(c["fiador"] ?? ""),
            });
          }
        }

        for (const f of pageFiadores) {
          const id = String(f["_id"] ?? "");
          if (id && !customers.has(id)) {
            customers.set(id, {
              nome_completo: String(f["nome"] ?? ""),
              celular: String(f["whatsapp"] ?? f["celular"] ?? ""),
              cidade: String(f["cidade"] ?? ""),
              bairro: String(f["bairro"] ?? ""),
              fiador: "",
            });
          }
        }

        for (const fc of pageFechamentos) {
          const fcId = String(fc["_id"] ?? "");
          if (seenFechamentos.has(fcId)) continue;
          seenFechamentos.add(fcId);
          const ctrId = String(fc["contrato_atrelado"] ?? "");
          const valor = parseBrl(fc["total_fechamento"] ?? 0);
          if (ctrId) {
            fechamentos.set(ctrId, (fechamentos.get(ctrId) ?? 0) + valor);
          }
        }

        const pageCasos: any[] = data.casos ?? data.caso ?? [];
        for (const caso of pageCasos) {
          const casoId = String(caso["_id"] ?? "");
          if (casoId && !seenCasos.has(casoId)) {
            seenCasos.add(casoId);
            rawCasos.push(caso);
          }
        }

        offset += pageContracts.length;
        hasMore =
          totalFromBubble > 0 ? raw.length < totalFromBubble : pageContracts.length >= PAGE_SIZE;
      }

      source = "bubble";
    } catch (e) {
      console.error("[BUBBLE ERROR]", e);
      throw e;
    }
  } else {
    console.error(
      "[MOCK FALLBACK] Env vars ausentes — baseUrl:",
      baseUrl,
      "platformToken:",
      !!platformToken,
    );
    raw = MOCK;
  }

  const seen = new Set<string>();
  const deduped = raw.filter((r) => {
    const id = String(r["_id"] ?? "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const contracts = deduped.map((r, i) =>
    normalize(r, i, customers, fechamentos, locadorasPorContratoId.get(String(r["_id"] ?? ""))),
  );

  const total = contracts.length;
  const ativos = contracts.filter((c) => c.status === "ativo").length;
  const bloqueados = contracts.filter((c) => c.status === "bloqueado").length;
  const encerrados = contracts.filter((c) => c.status === "encerrado").length;
  const comissaoTotal = contracts.reduce((a, c) => a + c.comissao, 0);

  // contratos por mês (últimos 12)
  const months: { mes: string; total: number }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const count = contracts.filter((c) => {
      if (!c.createdAt) return false;
      const cd = new Date(c.createdAt);
      return `${cd.getFullYear()}-${cd.getMonth()}` === key;
    }).length;
    months.push({ mes: label, total: count });
  }

  const casos = rawCasos.map((c: any) => ({
    id: String(c["_id"] ?? ""),
    contratoId: String(c["contrato "] ?? c["contrato"] ?? "").trim(),
    advogadoId: String(c["advogado"] ?? ""),
    status: String(c["status"] ?? ""),
    file: String(c["file"] ?? c["arquivo"] ?? ""),
    dataConclusao: c["data_conclusao"] ? Number(c["data_conclusao"]) : 0,
  }));

  return {
    source,
    contracts,
    casos,
    stats: { total, ativos, bloqueados, encerrados, comissaoTotal },
    chartMonths: months,
    advogadoId,
    comissao: session.data.comissao ?? 0,
    apiEnv: baseUrl?.includes("version-test") ? "DEV" : baseUrl ? "PROD" : "NONE",
  };
});

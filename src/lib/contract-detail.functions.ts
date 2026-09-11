import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ContractDetail = {
  id: string;
  nrContrato: string;
  tipoContrato: string;
  status: string;
  statusAssinatura: string;
  inicio: number;
  fim: number;
  novaRenovacao: number;
  observacao: string;
  temContratoAssinado: boolean;
  kmInicial: number;
  diarias: number;

  clienteNome: string;
  clienteCpf: string;
  clienteCelular: string;
  clienteEmail: string;
  clienteCidade: string;
  clienteBairro: string;
  clienteLogradouro: string;

  fiadorNome: string;
  fiadorCpf: string;
  fiadorTelefone: string;

  locadoraNomeSocial: string;
  locadoraCnpj: string;
  locadoraLogradouro: string;
  locadoraNumero: string;
  locadoraBairro: string;
  locadoraCidade: string;

  fechamento: {
    totalFechamento: number;
    parcelasEmAberto: number;
    juros10pct: number;
    diariasAdicionais: number;
    creditoDiarias: number;
    multasContratual: number;
    multaDescricao: string;
    multasTransito: number;
    avarias: number;
    saldoCaucao: number;
    faturadoTotal: number;
    faturadoAbater: number;
    lancamentoFaturar: number;
    dataFechamento: number;
  } | null;

  parcelas: {
    id: string;
    descricao: string;
    comprovanteLink: string;
    formaPagamento: string;
    bloqueioAutorizado: string;
    idAsaas: string;
    status: string;
    vencimento: string;
    valor: number;
  }[];

  avariasItens: {
    id: string;
    item: string;
    quantidade: number;
    valor: number;
    valorTotal: number;
  }[];

  multas: {
    id: string;
    descricao: string;
    local: string;
    data: string;
    valor: number;
    aitPdfUrl: string;
  }[];

  vistoriaAntes: { data: string; video: string; midia: "imagem" | "video" | ""; pdf: string } | null;
  vistoriaDepois: { data: string; video: string; midia: "imagem" | "video" | ""; pdf: string } | null;
};

export function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function str(v: unknown): string {
  return String(v ?? "");
}

export function fileUrl(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.startsWith("//") ? `https:${s}` : s;
}

export function classifyMidia(url: string): "imagem" | "video" | "" {
  if (!url) return "";
  const clean = url.split("?")[0].toLowerCase();
  if (/\.(jpe?g|png|gif|webp|bmp|heic)$/.test(clean)) return "imagem";
  if (/\.(mp4|mov|webm|m4v|avi|mkv)$/.test(clean)) return "video";
  return "video";
}

// valor_bruto de multas_detalhes vem em decimal-ponto simples (ex: "130.16"),
// diferente dos campos BRL do Bubble — não usar num() aqui.
export function numDecimal(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 0;
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

function formatDate(ts: unknown): string {
  if (!ts || ts === 0) return "";
  const d = new Date(typeof ts === "number" ? ts : String(ts));
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const getContractDetail = createServerFn({ method: "GET" })
  .inputValidator((d: { contratoId: string }) => ({
    contratoId: z.string().min(1).parse(d.contratoId),
  }))
  .handler(async ({ data }) => {
    const { getAppSession } = await import("./session.server");
    const session = await getAppSession();
    if (!session.data.userId) throw new Error("Não autenticado");

    const baseUrl = process.env.VITE_BUBBLE_BASE_URL;
    const platformToken = process.env.VITE_BUBBLE_PLATFORM_TOKEN;
    const apiToken = process.env.VITE_BUBBLE_API_TOKEN;

    if (!baseUrl || !platformToken) throw new Error("API não configurada");

    const url = `${baseUrl.replace(/\/$/, "")}/get_contrato_detalhe`;
    const body = { apikey: apiToken ?? "", contrato_id: data.contratoId };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${platformToken}`,
      },
      body: JSON.stringify(body),
    });

    const rawText = await res.text();

    if (!res.ok) throw new Error("Erro ao buscar detalhes do contrato");

    const json = JSON.parse(rawText);
    const d = json.response ?? json;

    const ctr = d.contrato ?? {};
    const cust = d.customer ?? {};
    const fiad = d.fiador ?? {};
    // A chave veio com espaço sobrando no workflow do Bubble ("locadora ") —
    // aceitar as duas variações pra não depender de corrigirem isso lá.
    const locad = d["locadora "] ?? d.locadora ?? {};
    const fechArr: any[] = d.fechamento ?? [];
    const parcArr: any[] = d.parcelas ?? d.parcela ?? [];
    const avariasItensArr: any[] = d.avarias ?? [];
    // multas_detalhes tem o doc_infração (AIT), mas ainda não está populado
    // para todos os contratos (é uma integração mais nova). Preferir essa
    // lista quando tiver dado; senão cair pro "multas" antigo (sem AIT) pra
    // não sumir com multas de contratos que ainda não têm multas_detalhes.
    const multasDetalhesArr: any[] = d.multas_detalhes ?? [];
    const multasArr: any[] = multasDetalhesArr.length > 0 ? multasDetalhesArr : (d.multas ?? []);
    const usandoMultasDetalhes = multasDetalhesArr.length > 0;
    const vistoriasArr: any[] = d.vistorias ?? [];

    const multasNormalizadas = multasArr.map((m: any) =>
      usandoMultasDetalhes
        ? {
            id: str(m._id),
            descricao: str(m["descrição"] ?? m.descricao),
            local: str(m.endereco),
            data: m.data ? formatDate(m.data) : "",
            valor: numDecimal(m.valor_bruto),
            aitPdfUrl: fileUrl(m["doc_infração"] ?? m["doc_infracao"]),
          }
        : {
            id: str(m._id),
            descricao: str(m["descrição"] ?? m.descricao),
            local: str(m.local),
            data: m.data ? formatDate(m.data) : "",
            valor: num(m.valor),
            aitPdfUrl: "",
          },
    );

    // Total das multas de trânsito: soma exatamente as linhas exibidas no popup
    // de Multas de Trânsito, para as duas telas nunca divergirem.
    const totalMultasTransito = multasNormalizadas.reduce((soma, m) => soma + m.valor, 0);

    const fech = fechArr[0] ?? null;

    const vistoriasNormalizadas = vistoriasArr
      .map((v: any) => {
        const rawData = v["data"] ?? v["Created Date"] ?? "";
        const ts =
          typeof rawData === "number" ? rawData : new Date(str(rawData)).getTime();
        const videoUrl = fileUrl(v["VIDEO"] ?? v["video"] ?? "");
        return {
          tipo: str(v["tipo"] ?? "").trim().toUpperCase(),
          data: formatDate(rawData),
          video: videoUrl,
          midia: classifyMidia(videoUrl),
          pdf: fileUrl(v["Vistoria_pdf"] ?? v["vistoria_pdf"] ?? ""),
          ts,
        };
      })
      .filter((v) => Number.isFinite(v.ts) && !isNaN(v.ts));

    const maisRecentePorTipo = (tipo: string) =>
      vistoriasNormalizadas
        .filter((v) => v.tipo === tipo)
        .sort((a, b) => b.ts - a.ts)[0] ?? null;

    const vistoriaAntes = maisRecentePorTipo("ENTREGA");
    const vistoriaDepois = maisRecentePorTipo("DEVOLUÇÃO");

    // A URL assinada da ZapSign é pré-assinada e expira: buscá-la aqui deixava
    // o HTML do SSR com um valor que já não batia na hidratação, além de custar
    // uma chamada ao Bubble em todo carregamento. Agora ela e buscada no clique
    // (getContratoAssinadoUrl), sempre fresca.

    const detail: ContractDetail = {
      id: str(ctr._id),
      nrContrato: ctr["Numero ctr"] ? String(ctr["Numero ctr"]) : "",
      tipoContrato: str(ctr["tipo de contrato"]),
      status: str(ctr.status),
      statusAssinatura: str(ctr["status assinatura"]),
      inicio: num(ctr.inicio),
      fim: num(ctr.fim),
      novaRenovacao: num(ctr.nova_renovação),
      observacao: str(ctr["observação"]),
      temContratoAssinado: !!str(ctr.contrato_assinado),
      kmInicial: num(ctr["km inicial"]),
      diarias: num(ctr.diarias),

      clienteNome: str(cust.nome_completo),
      clienteCpf: str(cust.cpf),
      clienteCelular: cust.celular ? formatPhone(str(cust.celular)) : "",
      clienteEmail: str(cust.email),
      clienteCidade: str(cust.cidade),
      clienteBairro: str(cust.bairro),
      clienteLogradouro: str(cust.logradouro),

      fiadorNome: str(fiad.nome),
      fiadorCpf: str(fiad.cpf),
      fiadorTelefone: fiad.whatsapp ? formatPhone(str(fiad.whatsapp)) : "",

      locadoraNomeSocial: str(locad.nome),
      locadoraCnpj: str(locad.cnpj),
      locadoraLogradouro: str(locad.logradouro),
      locadoraNumero: str(locad.numero),
      locadoraBairro: str(locad.bairro),
      locadoraCidade: str(locad.cidade),

      fechamento: fech
        ? {
            totalFechamento: num(fech.total_fechamento),
            parcelasEmAberto: num(fech.total_parcelas_em_aberto),
            juros10pct: num(fech["total_10%_juros"]),
            diariasAdicionais: num(fech.total_diarias_adicionais),
            creditoDiarias: num(fech.total_credito_de_diarias),
            multasContratual: num(fech.total_multas_contratual),
            multaDescricao: str(fech["multa contratual descrição"]),
            multasTransito: totalMultasTransito,
            avarias: num(fech.avarias),
            saldoCaucao: num(fech.total_saldo_caucao),
            faturadoTotal: num(fech.faturado_total),
            faturadoAbater: num(fech.faturado_abater),
            lancamentoFaturar: num(fech.total_lancamento_faturar),
            dataFechamento: num(fech["data do fechamento"]),
          }
        : null,

      parcelas: parcArr.map((p: any) => ({
        id: str(p._id),
        descricao: str(p["descrição parcela"]),
        comprovanteLink: str(p["comprovante link"]),
        formaPagamento: str(p["forma de pagamento"]),
        bloqueioAutorizado: str(p["bloqueio autorizado"]),
        idAsaas: str(p["id asaas"]),
        status: str(p["status"]),
        vencimento: p["vencimento"] ? formatDate(p["vencimento"]) : "",
        valor: num(p["Valor parcela"] ?? p["valor parcela"] ?? p["valor"] ?? 0),
      })),

      avariasItens: avariasItensArr.map((it: any) => ({
        id: str(it._id),
        item: str(it.item),
        quantidade: num(it.quantidade),
        valor: num(it.valor),
        valorTotal: num(it["valor total"] ?? it.valor_total ?? 0),
      })),

      multas: multasNormalizadas,

      vistoriaAntes: vistoriaAntes
        ? { data: vistoriaAntes.data, video: vistoriaAntes.video, midia: vistoriaAntes.midia, pdf: vistoriaAntes.pdf }
        : null,
      vistoriaDepois: vistoriaDepois
        ? { data: vistoriaDepois.data, video: vistoriaDepois.video, midia: vistoriaDepois.midia, pdf: vistoriaDepois.pdf }
        : null,
    };

    return detail;
  });

export { formatDate };

/**
 * Busca a URL do contrato assinado na ZapSign no momento do clique. A URL é
 * pré-assinada e tem validade curta, por isso não é embutida no detalhe.
 */
export const getContratoAssinadoUrl = createServerFn({ method: "POST" })
  .inputValidator((d: { contratoId: string }) => ({
    contratoId: z.string().min(1).parse(d.contratoId),
  }))
  .handler(async ({ data }): Promise<{ url: string }> => {
    const { getAppSession } = await import("./session.server");
    const session = await getAppSession();
    if (!session.data.userId) throw new Error("Não autenticado");

    const baseUrl = process.env.VITE_BUBBLE_BASE_URL;
    const platformToken = process.env.VITE_BUBBLE_PLATFORM_TOKEN;
    const apiToken = process.env.VITE_BUBBLE_API_TOKEN;
    if (!baseUrl || !platformToken) throw new Error("API não configurada");

    const endpoint = baseUrl.replace(/\/$/, "") + "/get_contrato_assinado";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + platformToken,
      },
      body: JSON.stringify({ apikey: apiToken ?? "", contrato: data.contratoId }),
    });

    if (!res.ok) throw new Error("Não foi possível obter o contrato assinado.");

    const json = await res.json();
    const url = str((json.response ?? json).url_zapsign ?? "");
    if (!url) throw new Error("Contrato assinado não disponível para este contrato.");

    return { url };
  });

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
  urlContratoAssinado: string;
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

  fechamento: {
    totalFechamento: number;
    parcelasEmAberto: number;
    juros10pct: number;
    diariasAdicionais: number;
    creditoDiarias: number;
    multasContratual: number;
    multaDescricao: string;
    multaValor: number;
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
  }[];
};

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function str(v: unknown): string {
  return String(v ?? "");
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

    const baseUrl = process.env.VITE_BUBBLE_BASE_URL_PRODUCTION;
    const platformToken = process.env.VITE_BUBBLE_PLATFORM_TOKEN;
    const apiToken = process.env.VITE_BUBBLE_API_TOKEN;

    if (!baseUrl || !platformToken) throw new Error("API não configurada");

    const { debugLog } = await import("./debug.server");
    const url = `${baseUrl.replace(/\/$/, "")}/get_contrato_detalhe`;
    const body = { apikey: apiToken ?? "", contrato_id: data.contratoId };
    debugLog("get_contrato_detalhe:request", { url, body });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${platformToken}`,
      },
      body: JSON.stringify(body),
    });

    const rawText = await res.text();
    debugLog("get_contrato_detalhe:response", {
      status: res.status,
      body: rawText.slice(0, 2000),
    });

    if (!res.ok) throw new Error("Erro ao buscar detalhes do contrato");

    const json = JSON.parse(rawText);
    const d = json.response ?? json;

    const ctr = d.contrato ?? {};
    const cust = d.customer ?? {};
    const fiad = d.fiador ?? {};
    const fechArr: any[] = d.fechamento ?? [];
    const parcArr: any[] = d.parcelas ?? d.parcela ?? [];
    const avariasItensArr: any[] = d.avarias ?? [];
    const multasArr: any[] = d.multas ?? [];

    debugLog("get_contrato_detalhe:parsed", {
      contratoKeys: Object.keys(ctr),
      customerKeys: Object.keys(cust),
      fiadorKeys: Object.keys(fiad),
      fechamentos: fechArr.length,
      parcelas: parcArr.length,
      avariasItens: avariasItensArr.length,
      multas: multasArr.length,
      multasKeys: multasArr[0] ? Object.keys(multasArr[0]) : [],
      sampleMulta: multasArr[0],
      allResponseKeys: Object.keys(d),
    });

    const fech = fechArr[0] ?? null;

    let urlContratoAssinado = str(ctr.contrato_assinado);
    try {
      const assinadoUrl = `${baseUrl.replace(/\/$/, "")}/get_contrato_assinado`;
      const assinadoBody = { apikey: apiToken ?? "", contrato: data.contratoId };
      debugLog("get_contrato_assinado:request", { url: assinadoUrl, body: assinadoBody });
      const assinadoRes = await fetch(assinadoUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${platformToken}`,
        },
        body: JSON.stringify(assinadoBody),
      });
      const assinadoRaw = await assinadoRes.text();
      debugLog("get_contrato_assinado:response", { status: assinadoRes.status, body: assinadoRaw.slice(0, 500) });
      if (assinadoRes.ok) {
        const assinadoJson = JSON.parse(assinadoRaw);
        const assinadoData = assinadoJson.response ?? assinadoJson;
        const zapsignUrl = str(assinadoData.url_zapsign ?? "");
        if (zapsignUrl) urlContratoAssinado = zapsignUrl;
      }
    } catch (e) {
      debugLog("get_contrato_assinado:error", { error: String(e) });
    }

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
      urlContratoAssinado,
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

      fechamento: fech
        ? {
            totalFechamento: num(fech.total_fechamento),
            parcelasEmAberto: num(fech.total_parcelas_em_aberto),
            juros10pct: num(fech["total_10%_juros"]),
            diariasAdicionais: num(fech.total_diarias_adicionais),
            creditoDiarias: num(fech.total_credito_de_diarias),
            multasContratual: num(fech.total_multas_contratual),
            multaDescricao: str(fech["multa contratual descrição"]),
            multaValor: num(fech["multa contratual valor"]),
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

      multas: multasArr.map((m: any) => ({
        id: str(m._id),
        descricao: str(m["descrição"] ?? m.descricao),
        local: str(m.local),
        data: m.data ? str(m.data) : "",
        valor: num(m.valor),
      })),
    };

    return detail;
  });

export { formatDate };

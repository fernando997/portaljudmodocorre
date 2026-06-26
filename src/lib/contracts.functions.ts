import { createServerFn } from "@tanstack/react-start";

export type Contract = {
  id: string;
  cliente: string;
  agenteOperador: string;
  caucao: string;
  combustivel: string;
  comissao: number;
  aditivo: string;
  bloqueio: string;
  createdAt?: string;
  status: "ativo" | "bloqueado" | "encerrado";
};

function parseBrl(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 0;
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function normalize(raw: any, idx: number): Contract {
  const bloqueio = String(raw["bloqueio"] ?? "").trim();
  const aditivo = String(raw["Aditivo"] ?? raw["aditivo"] ?? "").trim();
  return {
    id: String(raw["_id"] ?? raw["id"] ?? `c-${idx}`),
    cliente: String(raw["cliente"] ?? ""),
    agenteOperador: String(raw["agente operador"] ?? ""),
    caucao: String(raw["caução"] ?? raw["caucao"] ?? ""),
    combustivel: String(raw["combustivel"] ?? ""),
    comissao: parseBrl(raw["comissao1pgt"]),
    aditivo,
    bloqueio,
    createdAt: raw["Created Date"] ?? raw["createdAt"],
    status: bloqueio ? "bloqueado" : aditivo ? "encerrado" : "ativo",
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
    "caução": "1756664876582x563251611730968600",
    combustivel: i % 2 === 0 ? "R" : "G",
    comissao1pgt: (80 + (i * 7.31) % 80).toFixed(4).replace(".", ","),
    Aditivo: ended ? "Sim" : "",
    bloqueio: blocked ? "Sim" : "",
    "Created Date": `2024-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T10:00:00Z`,
  };
});

export const getContracts = createServerFn({ method: "GET" }).handler(async () => {
  const { getAppSession } = await import("./session.server");
  const session = await getAppSession();
  if (!session.data.userId) throw new Error("Não autenticado");

  const url = process.env.BUBBLE_API_URL;
  const token = process.env.BUBBLE_API_TOKEN;

  let raw: any[];
  let source: "bubble" | "mock" = "mock";

  if (url && token) {
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/contrato?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Bubble respondeu ${res.status}`);
      const json = (await res.json()) as { response?: { results?: any[] } };
      raw = json.response?.results ?? [];
      source = "bubble";
    } catch (e) {
      console.error("Falha Bubble, usando mock:", e);
      raw = MOCK;
    }
  } else {
    raw = MOCK;
  }

  const contracts = raw.map(normalize);
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

  return {
    source,
    contracts,
    stats: { total, ativos, bloqueados, encerrados, comissaoTotal },
    chartMonths: months,
  };
});

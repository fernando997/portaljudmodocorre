import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  LayoutGrid,
  List,
  Phone,
  MapPin,
  User,
  Shield,
  FileText,
  CheckCircle2,
  Gavel,
  Handshake,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getContracts, type Contract } from "@/lib/contracts.functions";
import { aceitarCaso } from "@/lib/cases.functions";
import { useServerFn } from "@tanstack/react-start";

const contractsQuery = queryOptions({
  queryKey: ["contracts"],
  queryFn: () => getContracts(),
});

export const Route = createFileRoute("/_authenticated/contratos/")({
  head: () => ({
    meta: [{ title: "Contratos — PORTAL JUD · Modo Corre" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(contractsQuery),
  pendingMs: 0,
  pendingComponent: LoadingVitrine,
  component: ContratosPage,
});

const LOADING_PHRASES = [
  "Conectando com a Modo Corre...",
  "Recebendo dados da MODO CORRE...",
  "Processando contratos...",
  "Listando os casos na vitrine...",
  "Organizando sua carteira...",
  "Quase lá...",
];

function LoadingVitrine() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIdx((i) => (i + 1) % LOADING_PHRASES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="absolute -inset-4 rounded-full bg-primary/20 blur-xl animate-pulse" />
          <Loader2 className="relative h-12 w-12 animate-spin text-primary" />
        </div>
        <div className="text-center space-y-2">
          <p
            key={idx}
            className="text-sm font-medium text-foreground animate-in fade-in slide-in-from-bottom-2 duration-500"
          >
            {LOADING_PHRASES[idx]}
          </p>
          <div className="flex items-center justify-center gap-1.5">
            {LOADING_PHRASES.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === idx ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type ViewMode = "cards" | "table";

const PER_PAGE = 30;

function ContratosPage() {
  const { data } = useSuspenseQuery(contractsQuery);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [view, setView] = useState<ViewMode>("cards");
  const [page, setPage] = useState(0);
  const [activeTab, setActiveTab] = useState<"JUD" | "SAP">("JUD");

  const queryClient = useQueryClient();
  const aceitar = useServerFn(aceitarCaso);
  const [aceitandoId, setAceitandoId] = useState<string | null>(null);

  const aceitarMutation = useMutation({
    mutationFn: async (contratoId: string) => {
      setAceitandoId(contratoId);
      return aceitar({ data: { contratoId } });
    },
    onSuccess: () => {
      toast.success("Caso aceito com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["casos"] });
      setAceitandoId(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao aceitar caso");
      setAceitandoId(null);
    },
  });

  const acceptedIds = new Set(
    (data.casos ?? [])
      .filter((c) => c.status === "ACEITO" || c.status === "CASO ACEITO")
      .map((c) => c.contratoId),
  );

  if (typeof window !== "undefined" && (data as any).debugRaw) {
    console.log("[BUBBLE RAW]", (data as any).debugRaw);
    console.log("[vitrine] total:", data.contracts.length, "| apiEnv:", (data as any).apiEnv);
  }

  const filtered = data.contracts
    .filter((c) => !acceptedIds.has(c.id))
    .filter((c) =>
      activeTab === "SAP"
        ? c.statusContrato === "SAP"
        : c.statusContrato !== "SAP", // JUD = tudo que não é SAP (catch-all)
    )
    .filter((c) => {
      const term = q.toLowerCase();
      return (
        c.clienteNome.toLowerCase().includes(term) ||
        c.clienteCidade.toLowerCase().includes(term) ||
        c.clienteCelular.toLowerCase().includes(term) ||
        c.nrContrato.toLowerCase().includes(term) ||
        c.fiadorNome.toLowerCase().includes(term) ||
        c.id.toLowerCase().includes(term)
      );
    })
    .sort((a, b) => b.totalFechamento - a.totalFechamento);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Casos em Aberto</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vitrine de contratos disponíveis para aceitar.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => { setActiveTab("JUD"); setPage(0); }}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === "JUD"
                ? "bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-md shadow-primary/25"
                : "border border-border/50 bg-card text-muted-foreground hover:text-foreground hover:border-primary/40"
            }`}
          >
            <Gavel className="h-4 w-4" />
            Sem Acordo
          </button>
          <button
            onClick={() => { setActiveTab("SAP"); setPage(0); }}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === "SAP"
                ? "bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-md shadow-primary/25"
                : "border border-border/50 bg-card text-muted-foreground hover:text-foreground hover:border-primary/40"
            }`}
          >
            <Handshake className="h-4 w-4" />
            Tentativa Acordo
          </button>
        </div>

        <div className={`rounded-xl border px-4 py-3 text-sm ${
          activeTab === "JUD"
            ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
        }`}>
          {activeTab === "JUD"
            ? "Estes casos estão em estado JUDICIÁRIO no nosso sistema pois os clientes não se manifestaram ou estão dificultando um acordo."
            : "Estes casos estão em estado de tentativa de negociação — damos um prazo de 15 dias para um acordo com os clientes listados nesta aba."}
        </div>
      </div>

      <div className="rounded-2xl border border-border/30 bg-muted/30 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="Buscar por nome, telefone, cidade ou nº contrato…"
            className="h-11 max-w-sm rounded-xl border-border/40 bg-card/80 backdrop-blur-sm"
          />

          <div className="flex items-center gap-1 rounded-xl border border-border/40 bg-card/80 p-1 backdrop-blur-sm">
            <button
              onClick={() => setView("cards")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                view === "cards"
                  ? "bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Cards
            </button>
            <button
              onClick={() => setView("table")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                view === "table"
                  ? "bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              Tabela
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-border/50 bg-card py-16 text-center text-sm text-muted-foreground">
          Nenhum contrato encontrado.
        </div>
      )}

      {filtered.length > 0 && view === "cards" && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {paged.map((c) => (
            <ContractCard
              key={c.id}
              c={c}
              variant={activeTab}
              onAceitar={() => aceitarMutation.mutate(c.id)}
              onDetail={() => navigate({ to: "/contratos/$id", params: { id: c.id } })}
              loading={aceitandoId === c.id}
            />
          ))}
        </div>
      )}

      {filtered.length > 0 && view === "table" && (
        <div className="rounded-2xl border border-border/50 bg-card p-2">
          <Table>
            <TableHeader>
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wider">Nº</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Cliente</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Fiador</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Telefone</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">Valor</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((c) => (
                <TableRow key={c.id} className="border-border/30 hover:bg-muted/40 cursor-pointer" onClick={() => navigate({ to: "/contratos/$id", params: { id: c.id } })}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {c.nrContrato || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium text-foreground">
                      {c.clienteNome || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.clienteCidade}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.fiadorNome || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.clienteCelular || "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold text-primary">
                    {c.totalFechamento > 0 ? brl(c.totalFechamento) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => aceitarMutation.mutate(c.id)}
                      disabled={aceitandoId === c.id}
                      className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-accent px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:shadow-md hover:shadow-primary/40 disabled:opacity-50"
                    >
                      {aceitandoId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Aceitar
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card px-4 py-3">
          <span className="text-xs text-muted-foreground">
            {page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, filtered.length)} de {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setPage(Math.max(0, page - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              disabled={page === 0}
              className="rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-30"
            >
              Anterior
            </button>
            <span className="text-xs font-medium text-foreground">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => { setPage(Math.min(totalPages - 1, page + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              disabled={page >= totalPages - 1}
              className="rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-30"
            >
              Próximo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ContractCard({ c, variant, onAceitar, onDetail, loading }: { c: Contract; variant: "JUD" | "SAP"; onAceitar: () => void; onDetail: () => void; loading: boolean }) {
  const isSap = variant === "SAP";

  return (
    <div onClick={onDetail} className={`group relative cursor-pointer overflow-hidden rounded-2xl border bg-card p-5 transition-all ${
      isSap
        ? "border-emerald-500/20 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10"
        : "border-border/50 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
    }`}>
      <div className={`absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl transition-opacity group-hover:opacity-100 ${
        isSap
          ? "bg-gradient-to-br from-emerald-500/20 to-emerald-500/5"
          : "bg-gradient-to-br from-primary/20 to-primary/5"
      }`} />

      <div className="relative space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <User className={`h-3.5 w-3.5 shrink-0 ${isSap ? "text-emerald-500" : "text-primary"}`} />
              <span className="truncate text-sm font-semibold text-foreground">
                {c.clienteNome || "—"}
              </span>
            </div>
            {c.fiadorNome && (
              <div className="mt-1 flex items-center gap-2">
                <Shield className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate text-xs text-muted-foreground">
                  Fiador: {c.fiadorNome}
                </span>
              </div>
            )}
          </div>
          <span className={`inline-flex items-center rounded-full border px-3 py-1 font-mono text-sm font-bold shadow-sm ${
            isSap
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400 shadow-emerald-500/20"
              : "border-primary/50 bg-primary/15 text-primary shadow-primary/20"
          }`}>
            {c.totalFechamento > 0 ? brl(c.totalFechamento) : "—"}
          </span>
        </div>

        <div className="h-px bg-border/40" />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Telefone
            </div>
            <div className="mt-0.5 flex items-center gap-1">
              <Phone className="h-3 w-3 text-muted-foreground" />
              <span className="truncate text-xs text-muted-foreground">
                {c.clienteCelular || "—"}
              </span>
            </div>
          </div>
          {c.clienteCidade && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Cidade
              </div>
              <div className="mt-0.5 flex items-center gap-1">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <span className="truncate text-xs text-muted-foreground">
                  {c.clienteCidade}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <FileText className="h-3 w-3 text-muted-foreground/60" />
            <span className="text-[10px] text-muted-foreground/60">
              Nº {c.nrContrato || c.id.slice(-8)}
            </span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onAceitar(); }}
            disabled={loading}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-all disabled:opacity-50 ${
              isSap
                ? "bg-gradient-to-r from-emerald-600 to-emerald-500 shadow-md shadow-emerald-500/25 hover:shadow-lg hover:shadow-emerald-500/40"
                : "bg-gradient-to-r from-primary to-accent shadow-md shadow-primary/25 hover:shadow-lg hover:shadow-primary/40"
            }`}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Aceitar caso
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, label }: { status: Contract["status"]; label?: string }) {
  const map = {
    ativo: "border-primary/40 bg-primary/10 text-primary",
    bloqueado: "border-destructive/40 bg-destructive/10 text-destructive",
    encerrado: "border-muted-foreground/30 bg-muted text-muted-foreground",
  } as const;
  const fallback = { ativo: "Ativo", bloqueado: "Bloqueado", encerrado: "Encerrado" }[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[status]}`}
    >
      {label || fallback}
    </span>
  );
}

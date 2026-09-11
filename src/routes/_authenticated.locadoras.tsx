import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, queryOptions, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Building2, Search, FileText, FileSignature, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { getLocadoras, type Locadora } from "@/lib/locadoras.functions";
import { gerarProcuracaoAssinada, gerarProcuracaoSemAssinatura } from "@/lib/procuracao.functions";
import {
  clausulaRepresentante,
  formatCep,
  formatCnpj,
  montarEndereco,
  qualificacaoMandante,
  dataPorExtenso,
} from "@/lib/formatters";
import topo from "@/assets/Topo.png";
import rodape from "@/assets/Rodape.png";
import marcadagua from "@/assets/marcadagua.png";

const PAGE_SIZE = 50;

const locadorasQuery = (page: number, search: string) =>
  queryOptions({
    queryKey: ["locadoras", page, search],
    queryFn: () => getLocadoras({ data: { offset: page * PAGE_SIZE, limit: PAGE_SIZE, search } }),
  });

const locadorasTodasQuery = (search: string) =>
  queryOptions({
    // Mesmo tipo de chave da query paginada, senão a união dos dois
    // objetos de opções não bate no useQuery.
    queryKey: ["locadoras", "todas", search] as (string | number)[],
    queryFn: async () => {
      const todas: Locadora[] = [];
      let offset = 0;
      let total = Infinity;
      while (offset < total) {
        const p = await getLocadoras({ data: { offset, limit: PAGE_SIZE, search } });
        total = p.total;
        if (p.locadoras.length === 0) break;
        todas.push(...p.locadoras);
        offset += p.locadoras.length;
      }
      return { locadoras: todas, total: todas.length };
    },
  });

type Filtro = "todos" | "vencido" | "sem";

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "vencido", rotulo: "Certificado vencido" },
  { valor: "sem", rotulo: "Sem certificado" },
];

function passaNoFiltro(l: Locadora, filtro: Filtro): boolean {
  if (filtro === "sem") return !l.temCertificado;
  if (filtro === "vencido") {
    return !!l.temCertificado && !!l.certificadoVencimento && l.certificadoVencimento < Date.now();
  }
  return true;
}

function dispararDownload({ url, nomeArquivo }: { url: string; nomeArquivo: string }) {
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const Route = createFileRoute("/_authenticated/locadoras")({
  head: () => ({
    meta: [{ title: "Locadoras — PORTAL JUD · Modo Corre" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(locadorasQuery(0, "")),
  pendingMs: 0,
  pendingComponent: () => (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  ),
  component: LocadorasPage,
});

/** Devolve o motivo pelo qual não dá para assinar, ou null quando está tudo ok. */
function motivoBloqueio(l: Locadora): string | null {
  if (!l.temCertificado) return "Sem certificado digital cadastrado";
  if (l.certificadoVencimento && l.certificadoVencimento < Date.now()) {
    return `Certificado vencido em ${new Date(l.certificadoVencimento).toLocaleDateString("pt-BR")}`;
  }
  return null;
}

function LocadorasPage() {
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [procuracaoLocadora, setProcuracaoLocadora] = useState<Locadora | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todos");

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filtrando = filtro !== "todos";
  const { data, isFetching } = useQuery({
    ...(filtrando ? locadorasTodasQuery(search) : locadorasQuery(page, search)),
    placeholderData: keepPreviousData,
  });

  const listaBruta = data?.locadoras ?? [];
  const locadoras = filtrando ? listaBruta.filter((l) => passaNoFiltro(l, filtro)) : listaBruta;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const assinar = useServerFn(gerarProcuracaoAssinada);
  const assinarMutation = useMutation({
    mutationFn: (locadoraId: string) => assinar({ data: { locadoraId } }),
    onSuccess: (r) => {
      dispararDownload(r);
      toast.success("Procuração assinada gerada.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar a procuração assinada.");
    },
  });

  const semAssinatura = useServerFn(gerarProcuracaoSemAssinatura);
  const semAssinaturaMutation = useMutation({
    mutationFn: (locadoraId: string) => semAssinatura({ data: { locadoraId } }),
    onSuccess: (r) => {
      dispararDownload(r);
      toast.success("Procuração gerada (sem assinatura).");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar a procuração.");
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Locadoras</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {filtrando
            ? `${locadoras.length} de ${listaBruta.length} ${
                filtro === "vencido" ? "com certificado vencido" : "sem certificado"
              }`
            : `${total} ${total === 1 ? "locadora cadastrada" : "locadoras cadastradas"}`}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por nome ou CNPJ…"
            className="h-11 rounded-xl border-border/40 bg-card/80 pl-10 backdrop-blur-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FILTROS.map((f) => {
            const ativo = filtro === f.valor;
            const alerta = f.valor !== "todos";
            return (
              <button
                key={f.valor}
                onClick={() => {
                  setFiltro(f.valor);
                  setPage(0);
                }}
                className={`rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                  ativo && alerta
                    ? "border border-destructive/50 bg-destructive/15 text-destructive"
                    : ativo
                      ? "bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-sm shadow-primary/25"
                      : "border border-border/50 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {f.rotulo}
              </button>
            );
          })}
        </div>
      </div>

      {locadoras.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card py-16 text-center text-sm text-muted-foreground">
          {isFetching ? "Carregando…" : "Nenhuma locadora encontrada."}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {locadoras.map((l) => (
            <LocadoraCard
              key={l.id}
              l={l}
              onPrevia={() => setProcuracaoLocadora(l)}
              onSemAssinatura={() => semAssinaturaMutation.mutate(l.id)}
              onAssinada={() => assinarMutation.mutate(l.id)}
              gerandoSemAssinatura={
                semAssinaturaMutation.isPending && semAssinaturaMutation.variables === l.id
              }
              gerandoAssinada={assinarMutation.isPending && assinarMutation.variables === l.id}
            />
          ))}
        </div>
      )}

      {!filtrando && totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card px-4 py-3">
          <span className="text-xs text-muted-foreground">
            Página {page + 1} de {totalPages}
            {isFetching ? " · carregando…" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || isFetching}
              className="rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-30"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || isFetching}
              className="rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-30"
            >
              Próximo
            </button>
          </div>
        </div>
      )}

      <AlertDialog
        open={!!procuracaoLocadora}
        onOpenChange={(open) => {
          if (!open) setProcuracaoLocadora(null);
        }}
      >
        <AlertDialogContent className="max-w-3xl border-border/50 bg-card p-0">
          <div className="max-h-[85vh] overflow-y-auto p-4">
            {procuracaoLocadora && <ProcuracaoDocumento l={procuracaoLocadora} />}
          </div>
          <AlertDialogFooter className="items-center border-t border-border/40 p-4 sm:justify-between">
            {procuracaoLocadora && (
              <span className="text-xs text-muted-foreground">
                {motivoBloqueio(procuracaoLocadora) ??
                  "Assinada digitalmente com o certificado da locadora."}
              </span>
            )}
            <div className="flex items-center gap-2">
              <AlertDialogCancel className="mt-0 border-border/50">Fechar</AlertDialogCancel>
              <button
                onClick={() => procuracaoLocadora && assinarMutation.mutate(procuracaoLocadora.id)}
                disabled={
                  assinarMutation.isPending ||
                  !procuracaoLocadora ||
                  !!motivoBloqueio(procuracaoLocadora)
                }
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:shadow-lg hover:shadow-primary/40 disabled:opacity-40 disabled:shadow-none"
              >
                {assinarMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSignature className="h-4 w-4" />
                )}
                Baixar assinada
              </button>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LocadoraCard({
  l,
  onPrevia,
  onSemAssinatura,
  onAssinada,
  gerandoSemAssinatura,
  gerandoAssinada,
}: {
  l: Locadora;
  onPrevia: () => void;
  onSemAssinatura: () => void;
  onAssinada: () => void;
  gerandoSemAssinatura: boolean;
  gerandoAssinada: boolean;
}) {
  // Sem certificado ou com certificado vencido a locadora não assina: o card
  // inteiro vira destructive para o problema saltar aos olhos na listagem.
  const bloqueio = motivoBloqueio(l);

  return (
    <div
      onClick={onPrevia}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border bg-card p-5 transition-all ${
        bloqueio
          ? "border-destructive/50 hover:border-destructive/70 hover:shadow-lg hover:shadow-destructive/10"
          : "border-border/50 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
      }`}
    >
      <div
        className={`absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br blur-2xl transition-opacity group-hover:opacity-100 ${
          bloqueio ? "from-destructive/25 to-destructive/5" : "from-primary/20 to-primary/5"
        }`}
      />

      <div className="relative space-y-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-background/40 ${
              bloqueio ? "border-destructive/40 text-destructive" : "border-border/60 text-primary"
            }`}
          >
            <Building2 className="h-4 w-4" />
          </div>
          <p className="text-sm leading-relaxed text-foreground">
            <span className="font-semibold text-primary">Outorgante(s):</span>{" "}
            <span className="font-semibold">{l.nomeSocial || "—"}</span>, CNPJ{" "}
            <span className="font-mono text-xs">{l.cnpj ? formatCnpj(l.cnpj) : "—"}</span>, com sede
            na {montarEndereco(l)}.
          </p>
        </div>

        {bloqueio && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
            <span className="text-xs font-medium text-destructive">{bloqueio}</span>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSemAssinatura();
            }}
            disabled={gerandoSemAssinatura}
            className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
          >
            {gerandoSemAssinatura ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            Procuração sem assinatura
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onAssinada();
            }}
            disabled={gerandoAssinada || !!bloqueio}
            title={bloqueio ?? undefined}
            className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
          >
            {gerandoAssinada ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileSignature className="h-3.5 w-3.5" />
            )}
            Procuração assinada
          </button>
        </div>
      </div>
    </div>
  );
}

function ProcuracaoDocumento({ l }: { l: Locadora }) {
  const dataExtenso = dataPorExtenso();

  return (
    <div className="relative mx-auto max-w-[720px] overflow-hidden bg-white text-black shadow-2xl">
      <img
        src={marcadagua}
        alt=""
        className="pointer-events-none absolute left-1/2 top-1/2 h-[65%] w-auto -translate-x-1/2 -translate-y-1/2 opacity-60"
      />

      <div className="relative">
        <img
          src={topo}
          alt="Pereira e Rodrigues — Advocacia e Consultoria Jurídica"
          className="h-28 w-full object-cover"
        />

        <div className="space-y-4 px-10 py-6 text-justify text-[13px] leading-relaxed text-black">
          <div className="text-center">
            <p className="font-serif text-lg font-bold">Procuração</p>
            <p className="italic">&quot;Ad Judicia et Extra&quot;</p>
          </div>

          <p>
            <span className="font-bold">Mandante:</span>{" "}
            <span className="font-bold">{l.nomeSocial || "—"}</span>, {qualificacaoMandante(l.cnpj)}
            , com estabelecimento {montarEndereco(l)}, CEP nº {l.cep ? formatCep(l.cep) : "—"}
            {clausulaRepresentante(l.representanteNome ? { nome: l.representanteNome } : null)}
          </p>

          <p>
            <span className="font-bold">Mandatário:</span> NATHÁLIA GOMES DOS SANTOS, inscrita na
            OAB/SP sob o nº 552.306, com escritório na Rua Doutor Virgílio de Rezende, nº 1.320,
            Centro, Itapetininga-SP.
          </p>

          <p>
            <span className="font-bold">Poderes:</span> Por este instrumento de procuração ad
            judicia et extra o mandante, nomeia e constitui seus procuradores ou mandatários a quem
            confere amplos e gerais poderes para o foro em geral, com a cláusula ad-judicia et
            extra, em qualquer Juízo, Instância ou Tribunal, podendo propor contra quem de direito
            as ações competentes e defendê-lo nas contrárias, seguindo uma e outras, até final
            decisão, usando os recursos legais e acompanhando-os, conferindo-lhes, mais poderes
            especiais para reconhecer a procedência do pedido, desistir, transigir, renunciar ao
            direito, firmar compromissos ou acordos, receber e dar quitação, receber precatório,
            dando tudo por bom, firme e valioso.
          </p>

          <p className="pt-2">Itapetininga/SP, {dataExtenso}.</p>

          <div className="pt-10 text-center">
            <div className="mx-auto w-64 border-t border-black" />
            <p className="mt-1 font-bold">{l.nomeSocial || "—"}</p>
          </div>
        </div>

        <img src={rodape} alt="" className="h-28 w-full object-cover" />
      </div>
    </div>
  );
}

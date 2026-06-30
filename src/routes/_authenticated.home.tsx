import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import {
  FileText,
  TrendingUp,
  ShieldAlert,
  CheckCircle2,
  Sparkles,
  Loader2,
  XCircle,
  Briefcase,
  Upload,
  CheckCheck,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useState, useRef, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getContracts, type Contract } from "@/lib/contracts.functions";
import { abandonarCaso, finalizarCaso } from "@/lib/cases.functions";

const contractsQuery = queryOptions({
  queryKey: ["contracts"],
  queryFn: () => getContracts(),
});

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({ meta: [{ title: "Home — PORTAL JUD" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(contractsQuery),
  pendingMs: 0,
  pendingComponent: LoadingDashboard,
  component: Dashboard,
});

const LOADING_PHRASES = [
  "Conectando com a Modo Corre...",
  "Recebendo dados da MODO CORRE...",
  "Carregando seus casos...",
  "Calculando comissões...",
  "Montando o painel...",
  "Quase lá...",
];

function LoadingDashboard() {
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

function Dashboard() {
  const { data } = useSuspenseQuery(contractsQuery);
  const { stats, contracts, chartMonths, source, comissao } = data;
  const navigate = useNavigate();

  const queryClient = useQueryClient();
  const abandonar = useServerFn(abandonarCaso);
  const finalizar = useServerFn(finalizarCaso);
  const [abandonandoId, setAbandonandoId] = useState<string | null>(null);
  const [abandonPopup, setAbandonPopup] = useState<{ casoId: string; contratoId: string } | null>(null);
  const [motivoAbandono, setMotivoAbandono] = useState("");
  const [finalizarPopup, setFinalizarPopup] = useState<{ casoId: string; contratoId: string } | null>(null);
  const [finalizandoId, setFinalizandoId] = useState<string | null>(null);
  const [arquivoFile, setArquivoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const abandonarMutation = useMutation({
    mutationFn: async ({ casoId, contratoId, motivo }: { casoId: string; contratoId: string; motivo: string }) => {
      setAbandonandoId(casoId);
      return abandonar({ data: { casoId, contratoId, motivo } });
    },
    onSuccess: () => {
      toast.success("Caso abandonado. O contrato voltou para a vitrine.");
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      setAbandonandoId(null);
      setAbandonPopup(null);
      setMotivoAbandono("");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao abandonar caso");
      setAbandonandoId(null);
    },
  });

  const finalizarMutation = useMutation({
    mutationFn: async ({ casoId, contratoId, arquivo }: { casoId: string; contratoId: string; arquivo: File | null }) => {
      setFinalizandoId(casoId);
      let arquivoBase64 = "";
      let arquivoNome = "";
      if (arquivo) {
        arquivoNome = arquivo.name;
        const buffer = await arquivo.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        arquivoBase64 = `data:${arquivo.type};base64,${btoa(binary)}`;
      }
      return finalizar({ data: { casoId, contratoId, arquivo: arquivoBase64, arquivoNome } });
    },
    onSuccess: () => {
      toast.success("Processo finalizado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      setFinalizandoId(null);
      setFinalizarPopup(null);
      setArquivoFile(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao finalizar processo");
      setFinalizandoId(null);
    },
  });

  const todosCasos = data.casos ?? [];
  const myId = data.advogadoId;
  const meusCasos = todosCasos.filter(
    (c) => (c.status === "ACEITO" || c.status === "CASO ACEITO") && c.advogadoId === myId,
  );
  const casosAbandonados = todosCasos.filter(
    (c) => (c.status === "ABANDONADO" || c.status === "ABANDONO") && c.advogadoId === myId,
  );
  const casosFinalizados = todosCasos.filter(
    (c) => c.status === "FINALIZADO" && c.advogadoId === myId,
  );

  const contractMap = new Map(contracts.map((c) => [c.id, c]));

  const totalAceitos = meusCasos.reduce((acc, caso) => {
    const ctr = contractMap.get(caso.contratoId);
    return acc + (ctr?.totalFechamento ?? 0);
  }, 0);
  const comissaoCasos = totalAceitos * comissao / 100;

  const totalCasos = meusCasos.length + casosAbandonados.length + casosFinalizados.length;
  const aceitosPct = totalCasos ? (meusCasos.length / totalCasos) * 100 : 0;
  const finalizadosPct = totalCasos ? (casosFinalizados.length / totalCasos) * 100 : 0;
  const abandonadosPct = totalCasos ? (casosAbandonados.length / totalCasos) * 100 : 0;

  const cards = [
    {
      label: "Casos aceitos",
      value: meusCasos.length.toString(),
      sub: `${totalCasos} casos no total`,
      pct: totalCasos ? 100 : 0,
      icon: FileText,
      tone: "from-primary/30 to-primary/5",
    },
    {
      label: `Comissão (${comissao}%)`,
      value: brl(comissaoCasos),
      sub: `${meusCasos.length} casos aceitos`,
      pct: Math.min(100, meusCasos.length > 0 ? 100 : 0),
      icon: TrendingUp,
      tone: "from-accent/30 to-accent/5",
    },
    {
      label: "Casos finalizados",
      value: casosFinalizados.length.toString(),
      sub: `${finalizadosPct.toFixed(1)}% do total`,
      pct: finalizadosPct,
      icon: CheckCircle2,
      tone: "from-primary/30 to-accent/5",
    },
    {
      label: "Abandonados",
      value: casosAbandonados.length.toString(),
      sub: `${abandonadosPct.toFixed(1)}% do total`,
      pct: abandonadosPct,
      icon: ShieldAlert,
      tone: "from-destructive/30 to-destructive/5",
    },
  ];


  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-primary">
            <Sparkles className="h-3 w-3" />
            {source === "bubble" ? "Dados em tempo real" : "Dados de demonstração"}
          </div>
          <h1 className="mt-2 font-display text-4xl font-bold leading-tight">
            Bem-vindo de volta
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Por onde gostaria de começar hoje?
          </p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-5 transition-all hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"
          >
            <div
              className={`absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${c.tone} blur-2xl transition-opacity group-hover:opacity-100`}
            />
            <div className="relative flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {c.label}
                </div>
                <div className="mt-3 font-display text-3xl font-bold text-foreground">
                  {c.value}
                </div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background/40 text-primary">
                <c.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="relative mt-5 space-y-2">
              <Progress value={c.pct} className="h-1.5 bg-muted" />
              <div className="text-xs text-muted-foreground">{c.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">
              Meus Casos
            </h3>
            <p className="text-xs text-muted-foreground">
              Casos aceitos na sua carteira
            </p>
          </div>
          <Badge variant="outline" className="border-primary/40 text-primary">
            {meusCasos.length} {meusCasos.length === 1 ? "caso" : "casos"}
          </Badge>
        </div>

        {meusCasos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Briefcase className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Nenhum caso aceito ainda. Vá para{" "}
              <a href="/contratos" className="text-primary hover:underline">
                Contratos
              </a>{" "}
              para aceitar casos.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wider">Nº</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Cliente</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Fiador</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider">Valor</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {meusCasos.map((caso) => {
                  const c = contractMap.get(caso.contratoId);
                  return (
                    <TableRow key={caso.id} className="border-border/30 hover:bg-muted/40 cursor-pointer" onClick={() => navigate({ to: "/contratos/$id", params: { id: caso.contratoId } })}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {c?.nrContrato || "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="text-sm text-foreground">{c?.clienteNome || "—"}</div>
                        <div className="text-xs text-muted-foreground">{c?.clienteCidade}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c?.fiadorNome || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-bold text-primary">
                        {c?.totalFechamento ? brl(c.totalFechamento) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setFinalizarPopup({ casoId: caso.id, contratoId: caso.contratoId }); }}
                            className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-all hover:bg-primary/20"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            Finalizar
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setAbandonPopup({ casoId: caso.id, contratoId: caso.contratoId }); }}
                            className="flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-all hover:bg-destructive/20"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Abandonar
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <AlertDialog open={!!abandonPopup} onOpenChange={(open) => { if (!open) { setAbandonPopup(null); setMotivoAbandono(""); } }}>
        <AlertDialogContent className="border-border/50 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-lg">Abandonar caso</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Tem certeza que deseja abandonar este caso? O contrato voltará para a vitrine.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {abandonPopup && (() => {
            const ctr = contractMap.get(abandonPopup.contratoId);
            return ctr ? (
              <div className="rounded-xl border border-border/40 bg-background/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Contrato Nº</span>
                  <span className="text-sm font-semibold text-foreground">{ctr.nrContrato}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Cliente</span>
                  <span className="text-sm text-foreground">{ctr.clienteNome}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Fiador</span>
                  <span className="text-sm text-foreground">{ctr.fiadorNome || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Valor</span>
                  <span className="font-mono text-sm font-bold text-primary">{ctr.totalFechamento ? brl(ctr.totalFechamento) : "—"}</span>
                </div>
              </div>
            ) : null;
          })()}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Motivo do abandono</label>
            <Textarea
              value={motivoAbandono}
              onChange={(e) => setMotivoAbandono(e.target.value)}
              placeholder="Descreva o motivo pelo qual está abandonando este caso..."
              className="min-h-[80px] border-border/50 bg-background/60"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="border-border/50">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (abandonPopup && motivoAbandono.trim()) {
                  abandonarMutation.mutate({ casoId: abandonPopup.casoId, contratoId: abandonPopup.contratoId, motivo: motivoAbandono.trim() });
                }
              }}
              disabled={!motivoAbandono.trim() || abandonandoId === abandonPopup?.casoId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {abandonandoId === abandonPopup?.casoId ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirmar abandono
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!finalizarPopup} onOpenChange={(open) => { if (!open) { setFinalizarPopup(null); setArquivoFile(null); } }}>
        <AlertDialogContent className="border-border/50 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-lg">Finalizar processo</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Confirme os dados e anexe o arquivo do processo para finalizar.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {finalizarPopup && (() => {
            const ctr = contractMap.get(finalizarPopup.contratoId);
            return ctr ? (
              <div className="rounded-xl border border-border/40 bg-background/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Contrato Nº</span>
                  <span className="text-sm font-semibold text-foreground">{ctr.nrContrato}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Cliente</span>
                  <span className="text-sm text-foreground">{ctr.clienteNome}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Fiador</span>
                  <span className="text-sm text-foreground">{ctr.fiadorNome || "—"}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border/30 pt-2 mt-2">
                  <span className="text-sm font-medium text-muted-foreground">Total Fechamento</span>
                  <span className="font-mono text-lg font-bold text-primary">{ctr.totalFechamento ? brl(ctr.totalFechamento) : "—"}</span>
                </div>
              </div>
            ) : null;
          })()}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Arquivo do processo</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={(e) => setArquivoFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border/60 bg-background/60 p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-card text-muted-foreground">
                <Upload className="h-4 w-4" />
              </div>
              {arquivoFile ? (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{arquivoFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(arquivoFile.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground">Clique para selecionar o arquivo</p>
                  <p className="text-xs text-muted-foreground/60">PDF, DOC, DOCX, JPG, PNG</p>
                </div>
              )}
            </button>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="border-border/50">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (finalizarPopup) {
                  finalizarMutation.mutate({ casoId: finalizarPopup.casoId, contratoId: finalizarPopup.contratoId, arquivo: arquivoFile });
                }
              }}
              disabled={finalizandoId === finalizarPopup?.casoId}
              className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {finalizandoId === finalizarPopup?.casoId ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="mr-2 h-4 w-4" />
              )}
              Finalizar processo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


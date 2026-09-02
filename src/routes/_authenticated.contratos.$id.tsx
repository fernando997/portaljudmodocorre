import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileText, ExternalLink, Loader2, ShieldAlert, Car, CheckCircle2, Video, Download, Clapperboard } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getContractDetail,
  formatDate,
} from "@/lib/contract-detail.functions";
import { getContracts } from "@/lib/contracts.functions";
import { aceitarCaso } from "@/lib/cases.functions";

const detailQuery = (id: string) =>
  queryOptions({
    queryKey: ["contract-detail", id],
    queryFn: () => getContractDetail({ data: { contratoId: id } }),
  });

const contractsQuery = queryOptions({
  queryKey: ["contracts"],
  queryFn: () => getContracts(),
});

export const Route = createFileRoute("/_authenticated/contratos/$id")({
  head: () => ({
    meta: [{ title: "Detalhes do Contrato — PORTAL JUD · Modo Corre" }],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(detailQuery(params.id)),
  pendingMs: 0,
  pendingComponent: LoadingDetail,
  component: ContractDetailPage,
});

function LoadingDetail() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando contrato...</p>
      </div>
    </div>
  );
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 break-all rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-sm text-foreground">
        {value || "—"}
      </div>
    </div>
  );
}

function FechamentoRow({
  label,
  value,
  negative,
}: {
  label: string;
  value: number;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`font-mono text-sm font-medium ${negative ? "text-destructive" : "text-foreground"}`}
      >
        {negative && value > 0 ? `(-) ${brl(value)}` : brl(value)}
      </span>
    </div>
  );
}

function VistoriaCard({
  label,
  vistoria,
}: {
  label: string;
  vistoria: { data: string; video: string; midia: "imagem" | "video" | ""; pdf: string } | null;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
          {label}
        </span>
        {vistoria?.data && (
          <span className="text-xs text-muted-foreground">{vistoria.data}</span>
        )}
      </div>

      {!vistoria ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Sem registro de vistoria
        </p>
      ) : (
        <div className="space-y-3">
          {vistoria.video && vistoria.midia === "imagem" ? (
            <img
              src={vistoria.video}
              alt={label}
              className="aspect-video w-full rounded-lg border border-border/40 bg-black object-contain"
            />
          ) : vistoria.video ? (
            <video
              controls
              preload="auto"
              playsInline
              className="aspect-video w-full rounded-lg border border-border/40 bg-black"
              src={vistoria.video}
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-border/40 bg-muted/30 text-muted-foreground">
              <Clapperboard className="h-8 w-8 opacity-40" />
            </div>
          )}
          {vistoria.pdf && (
            <a
              href={vistoria.pdf}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <Download className="h-3.5 w-3.5" />
              Baixar PDF da vistoria
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function ContractDetailPage() {
  const { id } = Route.useParams();
  const { data: d } = useSuspenseQuery(detailQuery(id));
  const { data: contractsData } = useSuspenseQuery(contractsQuery);
  const [showAvarias, setShowAvarias] = useState(false);
  const [showMultas, setShowMultas] = useState(false);
  const [aceitando, setAceitando] = useState(false);

  const queryClient = useQueryClient();
  const aceitar = useServerFn(aceitarCaso);

  const jaAceito = (contractsData?.casos ?? []).some(
    (c) => c.contratoId === id,
  );

  const aceitarMutation = useMutation({
    mutationFn: async () => {
      setAceitando(true);
      return aceitar({ data: { contratoId: id } });
    },
    onSuccess: () => {
      toast.success("Caso aceito com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      setAceitando(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erro ao aceitar caso");
      setAceitando(false);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/contratos"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/50 bg-card text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold">
            Fechamento de Contrato{" "}
            <span className="text-primary">#{d.nrContrato}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Cliente {d.clienteNome}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-border/50 bg-card p-6 xl:col-span-2">
          <div className="mb-6 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-display text-lg font-semibold">
                Dados do contrato
              </h3>
              <p className="text-xs text-muted-foreground">
                Informações do cliente e período de locação
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-primary">Contrato</div>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Nº Contrato" value={d.nrContrato} />
                <Field label="Status" value={d.status} />
                <Field label="Tipo" value={d.tipoContrato} />
                <Field label="Assinatura" value={d.statusAssinatura} />
              </div>
            </div>

            <div className="h-px bg-border/30" />

            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-primary">Cliente</div>
              <Field label="Nome do Cliente" value={d.clienteNome} />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="CPF" value={d.clienteCpf} />
                <Field label="Telefone" value={d.clienteCelular} />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="E-mail" value={d.clienteEmail} />
                <Field label="Cidade / Bairro" value={d.clienteCidade ? `${d.clienteCidade}${d.clienteBairro ? ` — ${d.clienteBairro}` : ""}` : ""} />
                <Field label="Logradouro" value={d.clienteLogradouro} />
              </div>
            </div>

            <div className="h-px bg-border/30" />

            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-primary">Fiador</div>
              <Field label="Fiador" value={d.fiadorNome} />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="CPF do Fiador" value={d.fiadorCpf} />
                <Field label="Telefone do Fiador" value={d.fiadorTelefone} />
              </div>
            </div>

            <div className="h-px bg-border/30" />

            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-primary">Período</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Início do contrato" value={formatDate(d.inicio)} />
                <Field label="Próxima renovação" value={formatDate(d.novaRenovacao)} />
                <Field label="Diárias" value={d.diarias ? String(d.diarias) : ""} />
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {!jaAceito && (
              <button
                onClick={() => aceitarMutation.mutate()}
                disabled={aceitando}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:shadow-lg hover:shadow-primary/40 disabled:opacity-50"
              >
                {aceitando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Aceitar Caso
              </button>
            )}
            <a
              href={d.urlContratoAssinado || "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { if (!d.urlContratoAssinado) e.preventDefault(); }}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                d.urlContratoAssinado
                  ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                  : "border-border/30 bg-muted/30 text-muted-foreground cursor-not-allowed"
              }`}
            >
              <FileText className="h-4 w-4" />
              Contrato Assinado
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="https://www.modocorre.com.br/contrato_padrao/contrato.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <FileText className="h-4 w-4" />
              Termos e Condições
              <ExternalLink className="h-3 w-3" />
            </a>
            {d.avariasItens.length > 0 && (
              <button
                onClick={() => setShowAvarias(true)}
                className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
              >
                <ShieldAlert className="h-4 w-4" />
                Orçamento das Avarias
              </button>
            )}
            {d.multas.length > 0 && (
              <button
                onClick={() => setShowMultas(true)}
                className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-500 transition-colors hover:bg-amber-500/20"
              >
                <Car className="h-4 w-4" />
                Multas de Trânsito
              </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-primary/30 bg-card p-6">
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Fechamento
          </div>
          <div className="mb-6 text-right">
            <div className="text-xs text-muted-foreground">Total a pagar</div>
            <div className="font-display text-3xl font-bold text-primary">
              {d.fechamento
                ? brl(
                    d.fechamento.parcelasEmAberto +
                    d.fechamento.juros10pct +
                    d.fechamento.lancamentoFaturar +
                    d.fechamento.multaValor +
                    d.fechamento.multasContratual +
                    d.fechamento.avarias +
                    d.fechamento.diariasAdicionais -
                    d.fechamento.creditoDiarias -
                    d.fechamento.saldoCaucao
                  )
                : "—"}
            </div>
          </div>

          {d.fechamento ? (
            <div className="space-y-1 divide-y divide-border/30">
              <FechamentoRow
                label="Parcelas Faturadas em aberto"
                value={d.fechamento.parcelasEmAberto}
              />
              <FechamentoRow
                label="10% Sobre total em atraso"
                value={d.fechamento.juros10pct}
              />
              <FechamentoRow
                label="Lançamentos a Faturar"
                value={d.fechamento.lancamentoFaturar}
              />
              <FechamentoRow
                label="Multas"
                value={d.fechamento.multaValor}
              />
              <FechamentoRow
                label="Multas Contratual"
                value={d.fechamento.multasContratual}
              />
              <FechamentoRow
                label="Orçamento de Avarias"
                value={d.fechamento.avarias}
              />
              <FechamentoRow
                label="Diárias Adicionais"
                value={d.fechamento.diariasAdicionais}
              />
              <FechamentoRow
                label="Crédito de Diárias"
                value={d.fechamento.creditoDiarias}
              />
              <FechamentoRow
                label="Saldo do Caução"
                value={d.fechamento.saldoCaucao}
                negative
              />
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sem dados de fechamento
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <h3 className="mb-4 font-display text-lg font-semibold">
          Parcelas Faturadas Vinculadas a este Contrato
        </h3>

        {(() => {
          const parcelasVisiveis = d.parcelas.filter(
            (p) => p.status === "GERADO" || p.status === "CONSOLIDADO PARA FECHAMENTO",
          );
          return parcelasVisiveis.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma parcela em aberto
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wider">
                    Descrição
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">
                    Vencimento
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider">
                    Valor
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">
                    Status
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider">
                    Comprovante
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parcelasVisiveis.map((p) => (
                  <TableRow
                    key={p.id}
                    className="border-border/30 hover:bg-muted/40"
                  >
                    <TableCell className="text-sm font-medium text-foreground">
                      {p.descricao || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.vencimento || "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium text-primary">
                      {p.valor > 0 ? brl(p.valor) : "—"}
                    </TableCell>
                    <TableCell>
                      {p.status ? (
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          p.status === "RECEIVED" || p.status === "CONFIRMED"
                            ? "border-green-500/40 bg-green-500/10 text-green-400"
                            : p.status === "OVERDUE"
                              ? "border-destructive/40 bg-destructive/10 text-destructive"
                              : "border-primary/40 bg-primary/10 text-primary"
                        }`}>
                          {p.status}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.comprovanteLink ? (
                        <a
                          href={p.comprovanteLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          Ver comprovante
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          —
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        );
        })()}
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Video className="h-5 w-5 text-primary" />
          <h3 className="font-display text-lg font-semibold">
            Vistoria — Antes e Depois
          </h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <VistoriaCard label="Antes (Entrega)" vistoria={d.vistoriaAntes} />
          <VistoriaCard label="Depois (Devolução)" vistoria={d.vistoriaDepois} />
        </div>
      </div>

      <AlertDialog open={showAvarias} onOpenChange={setShowAvarias}>
        <AlertDialogContent className="max-w-2xl border-border/50 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-display text-lg">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Orçamento das Avarias
            </AlertDialogTitle>
          </AlertDialogHeader>

          {d.avariasItens.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum item de avaria registrado.
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40 hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wider">Item</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wider">Qtd</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wider">Valor Unit.</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wider">Valor Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.avariasItens.map((it) => (
                    <TableRow key={it.id} className="border-border/30 hover:bg-muted/40">
                      <TableCell className="text-sm font-medium text-foreground">
                        {it.item || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {it.quantidade}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {brl(it.valor)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-bold text-primary">
                        {brl(it.valorTotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-4 px-2">
                <span className="text-sm font-semibold text-foreground">Total Avarias</span>
                <span className="font-mono text-lg font-bold text-destructive">
                  {brl(d.avariasItens.reduce((acc, it) => acc + it.valorTotal, 0))}
                </span>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel className="border-border/50">Fechar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showMultas} onOpenChange={setShowMultas}>
        <AlertDialogContent className="max-w-[720px] border-border/50 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-display text-lg">
              <Car className="h-5 w-5 text-amber-500" />
              Multas de Trânsito
            </AlertDialogTitle>
          </AlertDialogHeader>

          {d.multas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma multa de trânsito registrada.
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40 hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wider">Descrição</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Local</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Data</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wider">Valor</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wider">AIT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.multas.map((m) => (
                    <TableRow key={m.id} className="border-border/30 hover:bg-muted/40">
                      <TableCell className="max-w-[250px] text-sm font-medium text-foreground">
                        {m.descricao || "—"}
                      </TableCell>
                      <TableCell className="max-w-[200px] text-sm text-muted-foreground">
                        {m.local || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {m.data || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-bold text-amber-500">
                        {brl(m.valor)}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.aitPdfUrl ? (
                          <a
                            href={m.aitPdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Baixar multa
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-4 px-2">
                <span className="text-sm font-semibold text-foreground">Total Multas</span>
                <span className="font-mono text-lg font-bold text-amber-500">
                  {brl(d.multas.reduce((acc, m) => acc + m.valor, 0))}
                </span>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel className="border-border/50">Fechar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

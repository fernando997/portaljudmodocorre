import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Briefcase, Download, X, User, Shield, FileText, MapPin, Phone } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getContracts, type Contract } from "@/lib/contracts.functions";

const contractsQuery = queryOptions({
  queryKey: ["contracts"],
  queryFn: () => getContracts(),
});

export const Route = createFileRoute("/_authenticated/finalizados")({
  head: () => ({
    meta: [{ title: "Casos Finalizados — PORTAL JUD" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(contractsQuery),
  pendingMs: 0,
  pendingComponent: () => (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  ),
  component: CasosFinalizados,
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function CasosFinalizados() {
  const { data } = useSuspenseQuery(contractsQuery);
  const { contracts, casos } = data;
  const [selectedCaso, setSelectedCaso] = useState<{ casoId: string; contratoId: string; file: string; dataConclusao: number } | null>(null);

  const myId = data.advogadoId;
  const finalizados = (casos ?? []).filter(
    (c) => c.status === "FINALIZADO" && c.advogadoId === myId,
  );

  const contractMap = new Map(contracts.map((c) => [c.id, c]));
  const selectedContract = selectedCaso ? contractMap.get(selectedCaso.contratoId) : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-primary">
          <CheckCircle2 className="h-3 w-3" />
          Processos concluídos
        </div>
        <h1 className="mt-2 font-display text-3xl font-bold">
          Casos Finalizados
        </h1>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">
            Processos finalizados
          </h3>
          <Badge variant="outline" className="border-primary/40 text-primary">
            {finalizados.length} {finalizados.length === 1 ? "caso" : "casos"}
          </Badge>
        </div>

        {finalizados.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Briefcase className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Nenhum caso finalizado ainda.
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
                  <TableHead className="text-right text-xs uppercase tracking-wider">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {finalizados.map((caso) => {
                  const c = contractMap.get(caso.contratoId);
                  return (
                    <TableRow
                      key={caso.id}
                      className="border-border/30 hover:bg-muted/40 cursor-pointer"
                      onClick={() => setSelectedCaso({ casoId: caso.id, contratoId: caso.contratoId, file: caso.file, dataConclusao: caso.dataConclusao })}
                    >
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
                        <Badge className="bg-primary/15 text-primary border-primary/30">
                          Finalizado
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {selectedCaso && selectedContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedCaso(null)}>
          <div className="relative w-full max-w-lg rounded-2xl border border-border/50 bg-card p-6 shadow-2xl shadow-black/40 mx-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelectedCaso(null)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg shadow-primary/30">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs uppercase tracking-[0.2em] text-primary">Caso finalizado</span>
                <h3 className="font-display text-lg font-bold">Contrato Nº {selectedContract.nrContrato || "—"}</h3>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border/40 bg-background/60 p-4">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 shrink-0 text-primary" />
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Cliente</div>
                  <div className="text-sm font-medium text-foreground">{selectedContract.clienteNome || "—"}</div>
                </div>
              </div>

              {selectedContract.fiadorNome && (
                <div className="flex items-center gap-3">
                  <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Fiador</div>
                    <div className="text-sm text-foreground">{selectedContract.fiadorNome}</div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Telefone</div>
                  <div className="text-sm text-foreground">{selectedContract.clienteCelular || "—"}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Cidade</div>
                  <div className="text-sm text-foreground">{selectedContract.clienteCidade || "—"}</div>
                </div>
              </div>

              <div className="h-px bg-border/40" />

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Valor total</span>
                <span className="font-mono text-lg font-bold text-primary">
                  {selectedContract.totalFechamento ? brl(selectedContract.totalFechamento) : "—"}
                </span>
              </div>

              {selectedCaso.dataConclusao > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Data conclusão</span>
                  <span className="text-sm text-foreground">
                    {new Date(selectedCaso.dataConclusao).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-4">
              {selectedCaso.file ? (
                <a
                  href={selectedCaso.file.startsWith("//") ? `https:${selectedCaso.file}` : selectedCaso.file}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40"
                >
                  <Download className="h-4 w-4" />
                  Baixar arquivo do processo
                </a>
              ) : (
                <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/40 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  Nenhum arquivo anexado
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

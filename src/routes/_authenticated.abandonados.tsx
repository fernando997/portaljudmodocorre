import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ShieldAlert, Loader2, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getContracts } from "@/lib/contracts.functions";

const contractsQuery = queryOptions({
  queryKey: ["contracts"],
  queryFn: () => getContracts(),
});

export const Route = createFileRoute("/_authenticated/abandonados")({
  head: () => ({
    meta: [{ title: "Casos Abandonados — PORTAL JUD" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(contractsQuery),
  pendingMs: 0,
  pendingComponent: () => (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  ),
  component: CasosAbandonados,
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function CasosAbandonados() {
  const { data } = useSuspenseQuery(contractsQuery);
  const { contracts, casos } = data;

  const myId = data.advogadoId;
  const abandonados = (casos ?? []).filter(
    (c) => (c.status === "ABANDONO" || c.status === "ABANDONADO") && c.advogadoId === myId,
  );

  const contractMap = new Map(contracts.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-destructive">
          <ShieldAlert className="h-3 w-3" />
          Processos abandonados
        </div>
        <h1 className="mt-2 font-display text-3xl font-bold">
          Casos Abandonados
        </h1>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">
            Processos abandonados
          </h3>
          <Badge variant="outline" className="border-destructive/40 text-destructive">
            {abandonados.length} {abandonados.length === 1 ? "caso" : "casos"}
          </Badge>
        </div>

        {abandonados.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Briefcase className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Nenhum caso abandonado.
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
                {abandonados.map((caso) => {
                  const c = contractMap.get(caso.contratoId);
                  return (
                    <TableRow key={caso.id} className="border-border/30 hover:bg-muted/40">
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
                        <Badge variant="destructive" className="bg-destructive/15 text-destructive border-destructive/30">
                          Abandonado
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
    </div>
  );
}

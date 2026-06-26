import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useState } from "react";

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

const contractsQuery = queryOptions({
  queryKey: ["contracts"],
  queryFn: () => getContracts(),
});

export const Route = createFileRoute("/_authenticated/contratos")({
  head: () => ({ meta: [{ title: "Contratos — Lex.Portal" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(contractsQuery),
  component: ContratosPage,
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ContratosPage() {
  const { data } = useSuspenseQuery(contractsQuery);
  const [q, setQ] = useState("");

  const filtered = data.contracts.filter(
    (c) =>
      c.cliente.toLowerCase().includes(q.toLowerCase()) ||
      c.agenteOperador.toLowerCase().includes(q.toLowerCase()) ||
      c.id.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Contratos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.contracts.length} contratos na sua carteira.
        </p>
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por cliente, operador ou ID…"
        className="h-11 max-w-sm rounded-xl border-border/60 bg-card"
      />

      <div className="rounded-2xl border border-border/50 bg-card p-2">
        <Table>
          <TableHeader>
            <TableRow className="border-border/40 hover:bg-transparent">
              <TableHead className="text-xs uppercase tracking-wider">Cliente</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Operador</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Combustível</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Comissão</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id} className="border-border/30 hover:bg-muted/40">
                <TableCell>
                  <div className="text-sm font-medium text-foreground">{c.cliente || "—"}</div>
                  <div className="text-xs text-muted-foreground">#{c.id.slice(-8)}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {c.agenteOperador || "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="border-border/60 font-mono text-xs">
                    {c.combustivel || "—"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-primary">
                  {brl(c.comissao)}
                </TableCell>
                <TableCell className="text-right">
                  <StatusBadge status={c.status} />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum contrato encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Contract["status"] }) {
  const map = {
    ativo: "border-primary/40 bg-primary/10 text-primary",
    bloqueado: "border-destructive/40 bg-destructive/10 text-destructive",
    encerrado: "border-muted-foreground/30 bg-muted text-muted-foreground",
  } as const;
  const label = { ativo: "Ativo", bloqueado: "Bloqueado", encerrado: "Encerrado" }[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[status]}`}>
      {label}
    </span>
  );
}

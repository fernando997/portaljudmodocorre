import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import {
  FileText,
  TrendingUp,
  ShieldAlert,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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

const contractsQuery = queryOptions({
  queryKey: ["contracts"],
  queryFn: () => getContracts(),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Lex.Portal" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(contractsQuery),
  component: Dashboard,
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Dashboard() {
  const { data } = useSuspenseQuery(contractsQuery);
  const { stats, contracts, chartMonths, source } = data;

  const ativosPct = stats.total ? (stats.ativos / stats.total) * 100 : 0;
  const bloqPct = stats.total ? (stats.bloqueados / stats.total) * 100 : 0;

  const cards = [
    {
      label: "Contratos totais",
      value: stats.total.toString(),
      sub: `${stats.encerrados} encerrados`,
      pct: 100,
      icon: FileText,
      tone: "from-primary/30 to-primary/5",
    },
    {
      label: "Comissão acumulada",
      value: brl(stats.comissaoTotal),
      sub: "1ª parcela paga",
      pct: Math.min(100, (stats.comissaoTotal / 5000) * 100),
      icon: TrendingUp,
      tone: "from-accent/30 to-accent/5",
    },
    {
      label: "Contratos ativos",
      value: stats.ativos.toString(),
      sub: `${ativosPct.toFixed(1)}% do total`,
      pct: ativosPct,
      icon: CheckCircle2,
      tone: "from-primary/30 to-accent/5",
    },
    {
      label: "Bloqueados",
      value: stats.bloqueados.toString(),
      sub: `${bloqPct.toFixed(1)}% do total`,
      pct: bloqPct,
      icon: ShieldAlert,
      tone: "from-destructive/30 to-destructive/5",
    },
  ];

  const recent = contracts.slice(0, 6);

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
            Você tem <span className="font-semibold text-foreground">{stats.ativos}</span> contratos
            ativos e uma comissão acumulada de{" "}
            <span className="font-semibold text-primary">{brl(stats.comissaoTotal)}</span> —
            por onde gostaria de começar hoje?
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

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="rounded-2xl border border-border/50 bg-card p-6 xl:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold">
                Contratos por mês
              </h3>
              <p className="text-xs text-muted-foreground">
                Últimos 12 meses
              </p>
            </div>
            <Badge
              variant="outline"
              className="border-primary/40 text-primary"
            >
              {chartMonths.reduce((a, m) => a + m.total, 0)} no período
            </Badge>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartMonths} barCategoryGap={12}>
                <defs>
                  <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="var(--gold)" stopOpacity={0.25} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 6"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="mes"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    color: "var(--foreground)",
                    fontSize: "12px",
                  }}
                />
                <Bar
                  dataKey="total"
                  fill="url(#barFill)"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-6">
          <div className="mb-6">
            <h3 className="font-display text-lg font-semibold">Composição</h3>
            <p className="text-xs text-muted-foreground">Status da carteira</p>
          </div>
          <div className="space-y-5">
            {[
              { label: "Ativos", value: stats.ativos, pct: ativosPct, color: "var(--gold)" },
              { label: "Encerrados", value: stats.encerrados, pct: stats.total ? (stats.encerrados / stats.total) * 100 : 0, color: "var(--gold-soft)" },
              { label: "Bloqueados", value: stats.bloqueados, pct: bloqPct, color: "var(--destructive)" },
            ].map((row) => (
              <div key={row.label}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium text-foreground">{row.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${row.pct}%`,
                      background: `linear-gradient(90deg, ${row.color}, ${row.color}80)`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">
              Contratos recentes
            </h3>
            <p className="text-xs text-muted-foreground">
              Visão geral dos últimos lançamentos
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wider">
                  Cliente
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider">
                  Operador
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider">
                  Combustível
                </TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">
                  Comissão
                </TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((c) => (
                <ContractRow key={c.id} c={c} />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function ContractRow({ c }: { c: Contract }) {
  return (
    <TableRow className="border-border/30 hover:bg-muted/40">
      <TableCell className="font-medium">
        <div className="text-sm text-foreground">{c.cliente || "—"}</div>
        <div className="text-xs text-muted-foreground">#{c.id.slice(-8)}</div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {c.agenteOperador || <span className="italic opacity-60">sem operador</span>}
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
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[status]}`}
    >
      {label}
    </span>
  );
}

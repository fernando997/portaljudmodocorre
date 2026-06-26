## Visão geral

Portal web para advogados acessarem seus contratos. Login em 2 etapas por celular + código WhatsApp (mock no início), e dashboard estilo "Santori" puxando dados da tabela `contratos` do Bubble.io via API.

## Design

- **Paleta Noir & Gold**: fundo `#0d0d0d` / superfícies `#1a1a1a` / dourado `#c9a84c` (primário) / dourado claro `#f0d78c` (accent) / texto `#f5f0e0`. Sidebar preta com item ativo em gradiente dourado (espelhando o destaque azul do mockup Santori).
- **Tipografia**: Montserrat (headings, 600/700) + Inter (corpo, 400/500) via `@fontsource`.
- **Estrutura visual = mockup Santori**: sidebar fixa à esquerda com logo + nav vertical com ícones, área principal com saudação "Bem-vindo de volta, Dr(a). …", linha de 3 cards de KPI (total contratos, comissão acumulada, contratos ativos) com barra de progresso, gráfico de barras de contratos por mês, e tabela "Visão geral" com últimos contratos e coluna de status.
- Cantos arredondados generosos (rounded-2xl), sombras suaves, divisórias sutis em ouro a 15%.

## Fluxo de login (2 etapas)

1. `/auth` — input de celular (máscara BR) → botão "Receber código".
2. `/auth/verify` — 6 dígitos (input-otp do shadcn) → "Entrar".
3. **Mock OTP**: server function gera código, guarda em cookie httpOnly assinado (`SESSION_SECRET` via `generate_secret`) e exibe o código em toast/banner dev. Trocar provedor depois é só plugar o envio real.
4. Sessão = cookie httpOnly com `phone` + `userId`. Guard `_authenticated` redireciona para `/auth` quando ausente.

## Integração Bubble

- Secrets: `BUBBLE_API_URL` e `BUBBLE_API_TOKEN` (via `add_secret`).
- Server function `getContracts({ phone })` chama `GET {BUBBLE_API_URL}/contrato` com `Authorization: Bearer …`, filtrando pelo advogado logado (campo a confirmar — provavelmente `agente operador` ou `cliente`).
- Normaliza campos do Bubble (`comissao1pgt`, `caução`, `cliente`, etc.) para DTO tipado.
- Dashboard usa `ensureQueryData` + `useSuspenseQuery`.

## Rotas

- `/auth` (telefone) e `/auth/verify` (OTP) — públicas.
- `/_authenticated/dashboard` — KPIs + gráfico + tabela.
- `/_authenticated/contratos` — listagem completa com busca/filtro.
- `/_authenticated/contratos/$id` — detalhe.
- `/` redireciona para `/dashboard` ou `/auth`.

## Detalhes técnicos

- Stack atual: TanStack Start + Tailwind v4 + shadcn. Sem Lovable Cloud nesta fase (auth é própria via cookie + API Bubble).
- Sidebar: shadcn `Sidebar` com `collapsible="icon"`.
- Gráfico: Recharts (BarChart).
- Validação: zod nos inputs de telefone e OTP.
- Secrets a criar: `SESSION_SECRET` (generate), `BUBBLE_API_URL`, `BUBBLE_API_TOKEN` (add_secret após aprovação).

## O que confirmar antes/durante o build

1. URL base do Bubble (ex.: `https://seuapp.bubbleapps.io/api/1.1/obj`) e nome exato do data type (`contrato`?).
2. Qual campo identifica o advogado logado por telefone — `agente operador`, `cliente`, ou outro?
3. Quais KPIs/colunas você quer ver primeiro no dashboard (sugiro: nº de contratos, soma de `comissao1pgt`, contratos ativos vs bloqueados).
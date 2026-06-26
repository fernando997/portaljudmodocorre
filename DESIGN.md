# Portal Judiciário Modo Corre — Design System

## Identidade
- **Nome**: Portal Judiciário · Modo Corre
- **Público**: Advogados parceiros
- **Tom**: Seriedade, autoridade, premium, jurídico

## Paleta — Noir & Gold
Definida em `src/styles.css` via tokens `oklch`.
- Background: `#0d0d0d` (preto profundo)
- Card / surface: tons escuros com leve calor
- Primary (Gold): `#c9a84c`
- Accent (Gold soft): `var(--gold-soft)` para gradientes
- Foreground: branco quente
- Muted-foreground: cinza claro
- Bordas: `border-border/30..40` com glass

Sempre usar tokens semânticos (`bg-background`, `text-primary`, `border-border`). NUNCA `text-white`, `bg-black`, cores hex inline.

## Tipografia
- **Display / Títulos**: Montserrat (`font-display`)
- **Corpo**: Inter
- Tracking marcante em rótulos: `uppercase tracking-[0.22em]` a `0.35em`

## Logo
- Asset CDN: `src/assets/logo_modo.png.asset.json` (`logoModo.url`)
- **Login**: grande (`h-56` desktop, `h-28` mobile) centralizado, com glow dourado
- **Sidebar expandido**: `h-20` no topo, centralizado, com label "Portal Judiciário / Modo Corre"
- **Sidebar colapsado**: `h-9` centralizado, sem texto
- Sempre acompanhar com texto "PORTAL JUDICIÁRIO · MODO CORRE" abaixo do logo (exceto sidebar colapsado)

## Layout
- **Login (`/auth`)**: grid 2 colunas no desktop, painel esquerdo institucional (logo + tagline), direito card glass com formulário. Background com imagem jurídica (`law-bg`) + overlays escuros + gradientes dourados radiais sutis.
- **App autenticado**: `Sidebar` colapsável (`collapsible="icon"`) + área principal. Itens com ícone Lucide e gradiente dourado quando ativos.
- **Dashboard (`/home`)**: KPIs, gráficos Recharts, listas de contratos.

## Componentes
- shadcn/ui customizado com variantes douradas
- Glassmorphism em cards de auth: `bg-card/70 backdrop-blur-xl border-border/40`
- Botões primários: gradiente `from-primary to-accent`
- Sombras: `shadow-primary/20..40`

## Auth Flow (2 etapas)
1. `/auth` — celular + checkbox "Manter conectado" (sessão 30 dias)
2. `/auth/verify` — OTP 6 dígitos (mock via toast; ticket HMAC assinado em `sessionStorage`)

## Rotas
- `/auth`, `/auth/verify` (público)
- `/_authenticated/home` (dashboard), `/contratos`, `/clientes`, `/compliance`, `/configuracoes`

## Dados
- Mock em `src/lib/contracts.functions.ts` baseado em `contratos.txt` do Bubble
- Integração futura: `BUBBLE_API_URL` + `BUBBLE_API_TOKEN` (secrets)

## Regras invioláveis
- Não reintroduzir branding "Lex.Portal" (removido)
- Não usar fontes serif
- Não usar roxo/indigo (anti-AI generic)
- Logo Modo Corre é a identidade visual principal — sempre presente em login e sidebar

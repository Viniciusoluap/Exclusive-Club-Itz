# Frontend/UX Specification — exclusive-club-reservas

> Fase 3 do workflow Brownfield Discovery — análise somente-leitura conduzida por @ux-design-expert (Uma).
> Escopo: `client/src/`. Stack: React + Vite, wouter (router), Radix UI + shadcn/ui (new-york), Tailwind CSS v4 (CSS-based `@theme`), TanStack Query, tRPC, sonner (toasts).

## Inventário de Componentes

### Biblioteca base (shadcn/ui)
- `client/src/components/ui/` — **53 primitivos** shadcn/ui (button, dialog, alert-dialog, drawer, sheet, table, form, select, tabs, sonner, spinner, skeleton, empty, sidebar, etc.). Base sólida e completa; poucos são realmente consumidos (ver débitos).
- `components.json` presente: style `new-york`, baseColor `neutral`, cssVariables `true`, aliases `@/components`, `@/lib/utils`. Configuração correta de design system.

### Componentes de domínio (`client/src/components/`)
| Componente | LOC aprox. | Observação |
|-----------|-----------|-----------|
| `DashboardLayout.tsx` | ~10 KB | Layout admin/sócio. **Contém menu placeholder de scaffolding** (`{ label: "Page 1", path: "/" }`, `"Page 2", "/some-path"`) — nunca customizado. |
| `EmployeeDashboardLayout.tsx` | ~7,6 KB | Layout de funcionário. Duplica ~80% da lógica de sidebar/mobile-drawer/logout de `DashboardLayout`. |
| `DashboardLayoutSkeleton.tsx` | ~1,6 KB | Skeleton de layout — subutilizado. |
| `MobileMenu.tsx` | ~6,8 KB | Terceiro padrão de navegação mobile (além dos drawers embutidos nos dois layouts). |
| `ReportsTab.tsx` | 959 linhas | Componente monolítico de relatórios. |
| `FuelManagementDialog`, `PixPaymentDialog`, `ManusDialog`, `InspectionChargesSection`, `AIChatBox`, `Map`, `WeatherWidget`, `WhatsAppButton`, `ExclusiveClubLogo`, `ErrorBoundary`, `RoleRedirect` | — | Componentes de feature. `ManusDialog` é 100% hardcoded (cores hex, radius, sombras) — claramente colado de template externo. |

### Duplicação / inconsistência de padrões
1. **Três padrões de navegação**: `DashboardLayout` (sidebar+drawer), `EmployeeDashboardLayout` (sidebar+drawer duplicado) e `MobileMenu`. Sidebar, overlay mobile, avatar-com-inicial e botão logout são reimplementados em cada layout em vez de extraídos.
2. **Dois padrões de tabela**: primitivo `ui/table` (apenas ~3 arquivos) vs. `<table>` HTML cru (`CobrancasDanos.tsx`, `InspectionChargesSection.tsx`).
3. **Dois padrões de confirmação**: `AlertDialog` (Radix) em algumas telas vs. `window.confirm()`/`alert()` nativos (**29 ocorrências**).
4. **Loading ad-hoc**: `animate-spin` inline reimplementado **112 vezes**; o primitivo `ui/spinner` existe e é usado **0 vez**.

## Design System / Tokens

- **Tokens centralizados existem** — `client/src/index.css` define via Tailwind v4 `@theme inline` + `:root`/`.dark` todo o conjunto semântico em **oklch**: background/foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring, chart-1..5, sidebar-*. Paleta temática marítima (Ocean Blue `oklch(0.55 0.15 220)`, Turquoise, Bright Ocean). `--radius: 0.65rem` com escala sm/md/lg/xl derivada. **Boa fundação.**
- **Inconsistência de fonte de token**: `:root` mistura literais oklch com referências à paleta default do Tailwind — ex. `--sidebar-primary-foreground: var(--color-blue-50)` enquanto o resto usa oklch literal. O tema `.dark` inteiro depende de `var(--color-blue-500/700)`, quebrando a coerência com `:root` (que usa oklch literal). Risco de divergência visual se o dark mode for ativado.
- **Valores hardcoded fora dos tokens**: 22 ocorrências de hex/`text-[#...]`/`bg-[#...]`. `ManusDialog` (`#f8f8f7`, `#34322d`, `#858481`, `#1a1a19`, radius `20px`/`10px`, sombras literais), `WhatsAppButton` (`#25D366`, `#1ebe5d`), sombras arbitrárias. Nenhum token de espaçamento/tipografia customizado além do default Tailwind.
- **Tipografia**: `body` declara `font-family: 'Poppins', ...` porém não há `@font-face`/import da Poppins no CSS — depende de carregamento externo (index.html); se ausente, cai em system-ui silenciosamente.

## Fluxos de Usuário Principais

- Router único em `App.tsx` (wouter, `<Switch>`), **~24 rotas**, sem lazy-loading/code-splitting (todas as páginas importadas estaticamente no topo).
- **Organização por perfil** (implícita pela URL, não por guarda de rota no router — a autorização vive dentro dos layouts):
  - **Público / Sócio**: `/` (Home), `/galeria`, `/reservas`, `/dashboard`, `/dashboard/meus-abastecimentos`, `/mensalidades`, `/pagamento-danos`, `/acesso-negado`.
  - **Funcionário**: `/employee/reservas`, `/employee/manutencoes`, `/employee/abastecimentos`, `/employee/vistorias`.
  - **Admin**: `/admin`, `/admin/manutencao`, `/admin/funcionarios`, `/admin/abastecimento`, `/admin/vistorias`, `/admin/cobrancas-danos`, `/admin/solicitacoes-vencimento`, `/admin/configuracoes`, `/admin/backups`, `/admin/saas`.
- **Redirecionamento por papel**: `RoleRedirect` em `/redirect`. Guarda de acesso é feita nos layouts (`useAuth` + checagem de `user.role`), não no router — cada página confia no layout envolvê-la.
- **Rota-redirect improvisada**: `/admin/pagamentos` monta um componente inline que usa `useEffect`+`nav("/admin/saas")` (efeito colateral em render) em vez de `<Redirect>` do wouter.
- **Fluxos de domínio identificados**: reserva de embarcação (jetski/lancha), abastecimento/combustível, vistorias com campos por tipo de casco + fotos de reprovação + e-mail, cobranças de danos + pagamento PIX, mensalidades, manutenções, gestão de funcionários, SaaS/backups (admin).

## Responsividade

- **47 de 99** arquivos `.tsx` usam breakpoints Tailwind (`sm:`/`md:`/`lg:`) — cobertura ~47%, o que significa que metade dos componentes não tem tratamento responsivo explícito.
- Ambos os layouts implementam corretamente sidebar desktop (`hidden md:flex md:w-64`) + drawer mobile.
- `.container` é sobrescrito em `@layer components` com padding responsivo manual (16/24/32px) e `max-width: 1280px` — padrão consistente, porém divergente do `container` default do Tailwind (pode confundir).
- Páginas monolíticas grandes (Saas 3274, Admin 2236, Abastecimento 1804 linhas) concentram risco de layout responsivo não testado.

## Acessibilidade (a11y)

**Pontos fortes**
- Uso extensivo de primitivos Radix (dialog, alert-dialog, select, radio-group, tabs, tooltip, popover) → foco preso, `Esc`, roles/ARIA e navegação por teclado herdados corretamente.
- `TooltipProvider` global; `img` de logo com `alt={APP_TITLE}`.
- CSS base força `cursor: pointer` em elementos interativos e `outline-ring/50` global (indicador de foco preservado).

**Lacunas**
- Apenas **17 `aria-label`** em 99 arquivos. Botões icon-only (`Menu`, `X`, `size="icon"`) nos layouts não têm `aria-label` → leitores de tela anunciam botão sem nome.
- Overlay mobile é `<div onClick={close}>` sem handler de teclado nem `role`/`aria` → fecha só por mouse/toque.
- Contraste: paleta oklch parece adequada em light; `--border` no dark é `oklch(1 0 0 / 10%)` (10% opacidade) — bordas quase invisíveis, risco de contraste insuficiente se dark for ativado.
- Estados de foco em elementos custom hardcoded (`ManusDialog`, `WhatsAppButton`) não seguem o token `--ring`.

## Consistência Visual

- **Cores**: majoritariamente via tokens semânticos (`bg-primary`, `text-muted-foreground`, `bg-card`) — bom. Exceções pontuais hardcoded (ManusDialog, WhatsApp, sombras arbitrárias) quebram a paleta marítima.
- **Tipografia**: escala default Tailwind + Poppins declarada; sem tokens de tipografia próprios → hierarquia depende de classes soltas (`text-lg font-bold`) repetidas caso a caso.
- **Espaçamento**: escala default Tailwind, aplicada de forma inconsistente (mix de `gap-3`, `space-y-2`, paddings literais). Sem tokens de espaçamento de projeto.
- **Radius/sombras**: `--radius` respeitado nos primitivos; componentes colados (ManusDialog) usam radius/sombra literais divergentes.

## Estados de Loading/Error/Empty

- **189 `useQuery`/`useMutation`** no total. Data-fetching centralizado em tRPC + TanStack Query — arquitetura correta.
- **Loading — inconsistente**: 112 spinners `animate-spin` inline reinventados; `ui/spinner` (existe) nunca usado; `Skeleton` em apenas 6 arquivos; `DashboardLayoutSkeleton` subutilizado. Sem padrão único.
- **Error — sub-tratado**: mutations tratam erro via `onError`+toast (bom), mas queries raramente checam `isError`/`error` (~19 arquivos). Padrão recorrente `...useQuery(...) || { data: [] }` e uso de `trpc as any` (`trpcAny`) **mascara falhas silenciosamente** — query que falha vira "lista vazia" sem feedback.
- **Empty — parcial**: ~21 arquivos com textos "Nenhum…/Não há…"; primitivo `ui/empty` disponível mas não adotado de forma sistemática. Cobertura desigual entre páginas.

## Feedback ao Usuário

- **Toasts — padrão único e consistente**: `sonner` em toda a app (23 usos), único `<Toaster />` montado em `App.tsx`. Bom. Ruídos menores: inconsistência de aspas nos imports e um alias `toast as sonnerToast`.
- **Confirmações — duplicado**: `AlertDialog` (Radix, acessível) em parte das telas vs. `window.confirm()`/`alert()` nativos (**29 ocorrências**) — UX de confirmação inconsistente e não estilizada.
- **Erros globais**: `ErrorBoundary` envolve a app (bom). `WhatsAppButton` condicional (oculto em `/admin`).

---

## Débitos Identificados (nível UX/UI)

| ID | Débito | Severidade | Descrição | Onde |
|----|--------|------------|-----------|------|
| UX-01 | Confirmações nativas `window.confirm`/`alert` | **Alta** | 29 usos de diálogos nativos do browser em vez do `AlertDialog` acessível já disponível — UX inconsistente, não estilizada, não localizável. | 29 ocorrências em `pages/**`, `components/**` |
| UX-02 | Erros de query mascarados | **Alta** | Padrão `useQuery(...) \|\| { data: [] }` + `trpc as any` engole falhas de rede/servidor; query com erro vira lista vazia sem feedback ao usuário. | `pages/employee/Vistorias.tsx` e demais páginas com `trpcAny` |
| UX-03 | Loading sem padrão único | **Média** | 112 spinners `animate-spin` inline; `ui/spinner` usado 0x; `Skeleton` em só 6 arquivos. Experiência de carregamento incoerente entre telas. | Toda a app |
| UX-04 | Layouts duplicados | **Média** | `DashboardLayout` e `EmployeeDashboardLayout` duplicam ~80% de sidebar/drawer/logout/avatar; `MobileMenu` é um 3º padrão de navegação. Manutenção divergente. | `components/DashboardLayout.tsx`, `EmployeeDashboardLayout.tsx`, `MobileMenu.tsx` |
| UX-05 | Menu placeholder de scaffolding em produção | **Média** | `DashboardLayout` mantém itens de template `"Page 1" → "/"`, `"Page 2" → "/some-path"` nunca customizados. | `components/DashboardLayout.tsx` |
| UX-06 | Cores/estilos hardcoded fora dos tokens | **Média** | 22 hex/valores arbitrários; `ManusDialog` totalmente hardcoded (cores, radius, sombras) e `WhatsAppButton` (#25D366). Quebra a paleta marítima e o dark mode. | `components/ManusDialog.tsx`, `WhatsAppButton.tsx`, diversos |
| UX-07 | Dois padrões de tabela | **Média** | `<table>` HTML cru vs. primitivo `ui/table`; estilos e a11y divergentes. | `pages/admin/CobrancasDanos.tsx`, `components/InspectionChargesSection.tsx` |
| UX-08 | a11y: botões icon-only sem `aria-label` | **Média** | Apenas 17 `aria-label` em 99 arquivos; botões `size="icon"` (Menu/X) sem nome acessível; overlay mobile sem suporte a teclado. | Layouts, `MobileMenu`, diálogos custom |
| UX-09 | Dark mode inconsistente/quebrável | **Média** | Tokens `.dark` dependem de `var(--color-blue-*)` enquanto `:root` usa oklch literal; `--border` dark a 10% opacidade (contraste insuficiente). Tema não é switchable, mas divergência ficará latente. | `client/src/index.css` |
| UX-10 | Páginas monolíticas | **Baixa** | Saas (3274), Admin (2236), Abastecimento (1804), ReportsTab (959) — arquivos gigantes sem decomposição, dificultam consistência responsiva/visual e testes. | `pages/admin/Saas.tsx`, `pages/Admin.tsx`, `pages/Abastecimento.tsx`, `components/ReportsTab.tsx` |
| UX-11 | Código morto de UI | **Baixa** | `ReservasAntigo.tsx`, `ComponentShowcase.tsx` (1437 linhas), `admin/Pagamentos.tsx` não são roteados em `App.tsx` — confundem o inventário e o design system real. | `pages/ReservasAntigo.tsx`, `ComponentShowcase.tsx`, `admin/Pagamentos.tsx` |
| UX-12 | Empty states desiguais | **Baixa** | ~21 telas com texto de vazio ad-hoc; primitivo `ui/empty` não adotado sistematicamente. | `pages/**` |
| UX-13 | Sem lazy-loading / code-splitting de rotas | **Baixa** | 24 rotas importadas estaticamente; bundle inicial carrega Saas/Admin (milhares de linhas) mesmo para o sócio. Impacto de performance percebida. | `client/src/App.tsx` |
| UX-14 | Redirect via efeito colateral em render | **Baixa** | `/admin/pagamentos` usa componente inline com `useEffect(nav)` em vez de `<Redirect>` do wouter. | `client/src/App.tsx` |
| UX-15 | Fonte Poppins sem fallback garantido | **Baixa** | `body` pede Poppins mas não há `@font-face`/import no CSS; se não carregar externamente, cai em system-ui silenciosamente. | `client/src/index.css` |

**Resumo por severidade:** Alta = 2 · Média = 7 · Baixa = 6 · **Total = 15 débitos.**

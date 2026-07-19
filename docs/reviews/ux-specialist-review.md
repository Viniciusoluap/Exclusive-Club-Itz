# UX Specialist Review — Fase 6 (Brownfield Discovery)

> **Revisor:** @ux-design-expert (Uma) — 2026-07-18
> **Documento revisado:** `docs/prd/technical-debt-DRAFT.md` (Seção 3 — Frontend/UX) + Seção 4 (sobreposições) + Seção 5 (matriz) + Seção 6 (perguntas).
> **Método:** análise somente-leitura sobre `client/src/` (validação cruzada dos 15 débitos UX-XX contra o código-fonte real).
> **Escala:** Alta/Média/Baixa (mesma dos docs de frontend/database). Priorização abaixo é da **perspectiva UX**: impacto na experiência do usuário → acessibilidade → consistência visual.

---

## UX Specialist Review

### Débitos Validados

| ID | Débito | Severidade (DRAFT → Revisada) | Horas (DRAFT → Revisada) | Prioridade UX | Impacto UX |
|----|--------|-------------------------------|--------------------------|---------------|------------|
| UX-02 | Erros de query mascarados (`\|\| {data:[]}` + `trpc as any`) | **Alta → Alta** (mantida — **é o débito UX #1**) | 10–16 → **14–20** | **P1** | Crítico. Uma falha de rede/servidor vira "lista vazia" silenciosa. O usuário toma decisão sobre dados incompletos (ex.: sócio não vê reservas existentes, admin não vê cobranças pendentes). Erros invisíveis são o pior tipo de erro em UX. |
| UX-01 | Confirmações nativas `window.confirm`/`alert` (29 usos) | **Alta → Alta** (mantida) | 6–10 → **8–12** | **P1** | Alto. **Confirmei 29 ocorrências** (11 só em `Admin.tsx`). A maioria protege ações **destrutivas e irreversíveis**: excluir cliente, embarcação, reserva, documento, cobrança (Asaas), **restaurar backup** (`Backups.tsx:81` — "banco será substituído"). Diálogo nativo não é estilizado, não localizável, quebra imersão e é bloqueante do thread. |
| UX-08 | a11y: icon buttons sem `aria-label` + overlay mobile sem teclado | **Média → Alta** (**elevada**) | 6–10 → **10–16** | **P1** | Elevo para Alta: o overlay mobile é `<div onClick>` sem handler de teclado nem `role` → **falha WCAG 2.1.1 (Operável por teclado, Nível A)**. 37 `size="icon"` em 18 arquivos, só 17 `aria-label` em toda a app → leitores de tela anunciam "botão" sem nome (**WCAG 4.1.2, Nível A**). São barreiras que impedem uso, não só polimento. |
| UX-03 | Loading sem padrão único (112 spinners inline; `ui/spinner` 0x) | **Média → Média** (mantida) | 10–16 → **12–18** | **P2** | Médio. Confirmei 112 `animate-spin` inline em 29 arquivos; `ui/spinner` só aparece dentro do próprio `ui/spinner.tsx`. Experiência de carregamento incoerente (tamanhos/cores/posições variados). Não bloqueia, mas denuncia falta de sistema. |
| UX-04 | Layouts duplicados (`Dashboard`/`EmployeeDashboard` + `MobileMenu`) | **Média → Média** (mantida) | 12–20 → **14–22** | **P2** | Médio (débito de manutenibilidade com sintoma UX). O risco real é **divergência de navegação** entre perfis — o menu do funcionário evolui diferente do menu do sócio. Impacto no usuário é indireto/futuro. |
| UX-05 | Menu placeholder de scaffolding em produção (`"Page 1"→"/"`) | **Média → Média** (mantida) | 1–2 → **1–2** | **P2** (quick win) | Médio mas **constrangedor**: itens de template visíveis renderizam no `DashboardLayout` do sócio/admin. Alto ratio impacto-visível/esforço — corrigir imediato. |
| UX-06 | Cores/estilos hardcoded fora dos tokens (22 ocorrências) | **Média → Média** (mantida) | 6–10 → **6–10** | **P2** | Médio. `ManusDialog` é 100% hardcoded (colado de template). `WhatsAppButton` (#25D366) é cor de **marca legítima** — manter como exceção documentada, não forçar token. Foco em `ManusDialog` e sombras arbitrárias. |
| UX-07 | Dois padrões de tabela (`<table>` cru vs `ui/table`) | **Média → Média** (mantida) | 8–12 → **8–12** | **P2** | Médio. `<table>` cru em `CobrancasDanos.tsx` e `InspectionChargesSection.tsx` não herda estilos/scroll/a11y do primitivo. Inconsistência visível em telas financeiras. |
| UX-13 | Sem lazy-loading / code-splitting de rotas | **Baixa → Média** (**elevada**) | 4–8 → **6–10** | **P2** | Elevo para Média por **impacto na persona primária**: `App.tsx` importa tudo estático. O bundle inicial carrega `Saas.tsx` (3274 linhas) + `Admin.tsx` (2236) mesmo para o **sócio**, que nunca acessa essas telas. Performance percebida degradada para o usuário mais comum. |
| UX-12 | Empty states desiguais (~21 telas ad-hoc; `ui/empty` não adotado) | **Baixa → Baixa** (mantida) | 6–10 → **6–10** | **P2/P3** | Baixo-médio. Não quebra fluxo, mas piora clareza ("nada aqui" vs. tela em branco). Adotar `ui/empty` em conjunto com a correção de UX-02 (erro ≠ vazio). |
| UX-11 | Código morto de UI (`ReservasAntigo`, `ComponentShowcase`, `admin/Pagamentos`) | **Baixa → Baixa** (mantida) | 2–4 → **2–4** | **P3** (quick win) | Baixo. **Confirmei em `App.tsx`: nenhum dos três é importado/roteado.** `admin/Pagamentos` tem comentário explícito de migração (linha 29). Remover reduz ruído do inventário **e** tira 1 das 29 confirmações nativas (a de `ReservasAntigo.tsx:217`). |
| UX-14 | Redirect via efeito colateral em render (`/admin/pagamentos`) | **Baixa → Baixa** (mantida) | 1 → **1** | **P3** (quick win) | Baixo. Confirmado em `App.tsx:53` — componente inline recriado a cada render com `useEffect(nav)`. Trocar por `<Redirect to="/admin/saas">` do wouter. |
| UX-15 | Fonte Poppins sem fallback garantido | **Baixa → Baixa** (mantida) | 1 → **1** | **P3** (quick win) | Baixo. Se a Poppins não carregar (index.html), cai em system-ui sem aviso → tipografia inconsistente entre ambientes. |
| UX-10 | Páginas monolíticas (Saas 3274, Admin 2236, Abastecimento 1804) | **Baixa → Baixa** (mantida, mas ver nota) | 24–40 → **24–40** | **P3** | Baixo como débito UX puro, **mas é o maior bloqueador estrutural** para resolver UX-03/UX-07/UX-13/testes (SYS-07). Não priorizar isoladamente — decompor **oportunisticamente** ao tocar cada arquivo para os outros débitos. |
| UX-09 | Dark mode inconsistente/quebrável | **Média → Baixa** (**rebaixada**) | 6–10 → **4–8** | **P3** | **Rebaixo para Baixa:** confirmei em `App.tsx:85-86` que o tema é fixo em `light` e `switchable` está **comentado**. Dark mode está **dormente** — a divergência (`.dark` usa `var(--color-blue-*)`, `--border` a 10%) é risco **latente**, não um problema que o usuário vê hoje. Corrigir só antes de habilitar dark mode. |

**Resumo da revisão:** 15 débitos validados. **12 mantidos**, **2 elevados** (UX-08, UX-13), **1 rebaixado** (UX-09). **0 removidos** (todos são problemas UX reais).

---

### Débitos Adicionados

| ID | Débito | Severidade | Horas | Prioridade UX | Descrição | Onde |
|----|--------|------------|-------|---------------|-----------|------|
| **UX-16** | Falha parcial de upload prossegue silenciosamente | **Média** | 6–10 | **P1/P2** | No fluxo de vistoria, se o upload de uma foto de item reprovado falha (`employee/Vistorias.tsx:281-283`), dispara `toast.error` por foto **mas o registro da vistoria é submetido mesmo assim** sem a foto, sem bloqueio nem resumo do que ficou faltando. O usuário acredita ter registrado prova que não foi salva. Relaciona UX-02 (feedback existe, mas recuperação de erro é fraca). | `pages/employee/Vistorias.tsx`, `pages/Vistorias.tsx` |
| **UX-17** | Autorização de UI depende do layout, não de guarda de rota | **Média** | 8–14 | **P2** | `App.tsx` não tem guarda de rota; a checagem de papel vive dentro dos layouts (`useAuth` + `user.role`). `RoleRedirect` só redireciona **após login** (3 papéis: admin/employee/user; papel desconhecido cai em `/dashboard`). Navegação direta por URL a uma página admin depende inteiramente de o layout envolvê-la e checar — inconsistente entre páginas, e estados de "acesso negado" não são uniformes. **Espelha DB-03 no frontend.** | `client/src/App.tsx`, layouts, `RoleRedirect.tsx` |

**Total pós-revisão:** 17 débitos UX (Alta: 3 · Média: 8 · Baixa: 6).

---

### Respostas ao Architect (Seção 6 — Fase 6)

**1. SYS-07 — Quais fluxos de frontend priorizar para cobertura de teste?**
Priorizar por **consequência de falha para o usuário/negócio**, não por complexidade de código. Ordem recomendada:
1. **Pagamento PIX via Asaas** (`PixPaymentDialog`, `admin/Saas.tsx`, `CobrancasDanos.tsx`) — dinheiro real, integração externa, mutações destrutivas (`markAsPaid`, `generatePayment`, exclusão que cancela cobrança no Asaas). **Maior risco.**
2. **Reserva de embarcação** (`Reservas.tsx`, `Dashboard.tsx`) — fluxo core do sócio (persona primária); cancelamento é destrutivo.
3. **Registro de vistoria** (`employee/Vistorias.tsx`) — inclui upload de fotos (ver UX-16) + envio de e-mail; falha silenciosa perde prova.
4. **Abastecimento/combustível** (`Abastecimento.tsx`) — cálculos de saldo/cobrança; erro propaga para faturamento.
Cobrir primeiro os **componentes de erro/loading compartilhados** (após resolver UX-02/UX-03) rende mais que testar páginas monolíticas inteiras. Testes de página só valem depois da decomposição (UX-10), senão são frágeis.

**2. Há ~53 primitivos `ui/` (shadcn) — todos em uso ou há peso morto? `ComponentShowcase` é dev-only?**
Não são todos usados — vários primitivos existem mas têm consumo **zero** (ex.: `ui/spinner` reinventado 112x inline; `ui/empty` quase não adotado; `ui/table` só ~3 arquivos). **Porém não recomendo remover primitivos shadcn** — são baratos, tree-shakeable e são o alvo de consolidação (queremos *aumentar* seu uso, não removê-los). O peso morto real é de **componentes/páginas**, não de primitivos. `ComponentShowcase.tsx` (1437 linhas) **não é roteado em `App.tsx`** → é dev-only/showcase não exposto. Manter fora do bundle é fácil (já não está roteado); pode ser movido para fora de `pages/` ou deletado (UX-11).

**3. UX-11 — `Reservas.tsx` vs `ReservasAntigo.tsx`: a antiga ainda é referenciada?**
**Não.** Confirmado: `App.tsx` importa e roteia apenas `Reservas` (`/reservas`, linha 43). `ReservasAntigo` **não é importado em nenhum lugar do router**. É código morto seguro para remover. Bônus: remove 1 `confirm()` nativo (linha 217) e 6 usos de tratamento de erro legado.

**4. `WeatherWidget` e ausência de `OPENWEATHER_API_KEY` — como a UI trata?**
**Bem tratado — não é débito.** `WeatherWidget.tsx` usa `isLoading`/`error` corretamente e, em `error || !forecast`, renderiza um card com mensagem amigável ("Não foi possível carregar a previsão do tempo") em vez de quebrar ou sumir. É, aliás, o **padrão de referência** que UX-02 deveria seguir em toda a app (contrasta com o `|| {data:[]}` silencioso das outras telas). Única ressalva menor: usa `animate-spin` inline (exemplo de UX-03).

**5. UX-02 — Estados de erro/loading de uploads (recibos, fotos de vistoria, docs) têm feedback consistente, dado o proxy Forge da Manus?**
**Parcialmente.** Uploads via `fetch('/api/upload-*')` **têm** feedback: `toast.info` durante e `toast.error` no `catch` por arquivo (`employee/Vistorias.tsx:259,281-283`). O problema **não é ausência de toast, é a recuperação**: em falha parcial o fluxo **prossegue e submete o registro sem os arquivos que falharam**, sem bloquear nem resumir o que faltou (novo débito **UX-16**). Como o backend depende do proxy Forge/Manus (SYS-17 loga "S3" mas usa Forge), falhas de rede do proxy são plausíveis e o usuário fica com registro incompleto achando que está completo. Recomendo: bloquear submissão em falha de upload crítico, ou marcar claramente o registro como "com pendências de anexo".

**6. A separação admin/employee/client no roteamento cobre todos os papéis do backend?**
**Não com robustez — é o novo débito UX-17.** `RoleRedirect` cobre 3 papéis (admin/employee/user) e faz **fallback silencioso para `/dashboard`** em papel desconhecido. Não há **guarda de rota** em `App.tsx`: qualquer URL é montável e a autorização depende do **layout** envolver a página e checar `user.role`. Isso confia na disciplina de cada página, não no router — exatamente o espelho frontend de **DB-03** (mutations em `publicProcedure` com checagem inline). A UI **não deve** ser a fronteira de segurança (isso é backend/tRPC), mas **deve** oferecer estado de "acesso negado" consistente. Hoje `AccessDenied` existe (`/acesso-negado`) mas não há garantia de que todas as rotas protegidas redirecionem para ele.

---

### Recomendações de Design (top 3 débitos)

#### 1. UX-02 — Eliminar erros mascarados (padrão único de estados de query)
**Problema:** `useQuery(...) || { data: [] }` + `trpc as any` transformam falha em vazio silencioso.
**Solução concreta:**
- Banir `trpcAny`/`trpc as any` e o fallback `|| {data:[]}` (lint rule `no-restricted-syntax`).
- Criar um wrapper de estado `<QueryBoundary query={...}>` (ou hook `useQueryState`) que renderiza 3 estados explícitos, reusando primitivos existentes:
  - **loading** → `ui/skeleton` (não spinner inline);
  - **error** → `ui/empty` com variante destrutiva + botão "Tentar novamente" (`refetch`) + `toast.error`;
  - **empty (sucesso, 0 itens)** → `ui/empty` neutro.
- Adotar o padrão do `WeatherWidget` (que já faz certo) como referência canônica. Resolve UX-02, alimenta UX-03 e UX-12 no mesmo movimento.

#### 2. UX-01 — Substituir os 29 `confirm/alert` nativos por `AlertDialog` (Radix, já instalado)
**Problema:** confirmações nativas bloqueantes, não estilizadas, protegendo ações destrutivas.
**Solução concreta:**
- Criar um hook `useConfirm()` retornando `confirm({ title, description, confirmLabel, variant })` que resolve uma `Promise<boolean>`, renderizando um `AlertDialog` único e acessível (foco preso, `Esc`, botão destrutivo em `variant="destructive"`).
- Migração mecânica: `if (confirm("...")) { doX() }` → `if (await confirm({title:"...", variant:"destructive"})) { doX() }`.
- Priorizar as ações **irreversíveis** primeiro: `admin/Backups.tsx` (restaurar/excluir backup), `Admin.tsx` (excluir cliente/embarcação/reserva/documento — 11 usos), `admin/Saas.tsx` (excluir cobrança Asaas — 4 usos), `CobrancasDanos.tsx`. Remover `ReservasAntigo.tsx` (UX-11) elimina 1 caso "de graça".

#### 3. UX-04 — Consolidar os dois layouts + `MobileMenu` em um único `<AppShell>`
**Problema:** `DashboardLayout` e `EmployeeDashboardLayout` duplicam ~80% (sidebar, drawer mobile, avatar-inicial, logout); `MobileMenu` é um 3º padrão.
**Solução concreta:**
- Extrair um único `<AppShell nav={navItems} user={user}>` parametrizado por uma **config declarativa de navegação por papel** (`navConfig = { admin: [...], employee: [...], member: [...] }`), eliminando a duplicação e o menu placeholder "Page 1/Page 2" (UX-05) de uma vez.
- Consolidar a navegação mobile no drawer do `AppShell` (aposentar `MobileMenu`), resolvendo junto os gaps de a11y do overlay (UX-08): trocar `<div onClick>` por `ui/sheet`/`ui/drawer` (Radix) que já trazem `role`, foco e teclado.
- Este trabalho é pré-requisito natural para UX-05, UX-08 (overlay) e reduz superfície para UX-13.

**Sequência de resolução recomendada (lente UX):** habilitar quick wins e desbloqueios primeiro, depois o trabalho estrutural.
`UX-05` (1–2h, placeholder visível) → `UX-11`/`UX-14`/`UX-15` (quick wins, ~5h juntos) → **`UX-02`** (esconde falhas reais) → **`UX-01`** (ações destrutivas) → **`UX-08`** (a11y bloqueante) → `UX-16` → `UX-03`/`UX-12` (junto com UX-02) → `UX-04`/`UX-07`/`UX-06`/`UX-13`/`UX-17` → `UX-09`/`UX-10` (oportunístico).

---
*Fim da revisão UX (Fase 6). Handoff para @qa (Quinn) — Fase 7 QA Gate consolidado, e @architect (Aria) — Fase 8 finalização de `technical-debt-assessment.md`.*

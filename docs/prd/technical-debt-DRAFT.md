# Technical Debt Assessment — DRAFT
## Para Revisão dos Especialistas

> **Fase 4 do workflow Brownfield Discovery** — `@architect` (Aria) — 2026-07-18
> Consolidação inicial dos débitos técnicos das Fases 1–3 (system + database + frontend) em um único inventário.
>
> ⚠️ **ESTE É UM DRAFT SUJEITO A REVISÃO.** Nenhuma decisão aqui é final. As seções de dados e frontend serão validadas pelos especialistas nas Fases 5–7:
> - **Seção 2 (Database)** → revisão obrigatória de **@data-engineer (Dara)** — Fase 5
> - **Seção 3 (Frontend/UX)** → revisão obrigatória de **@ux-design-expert (Uma)** — Fase 6
> - **QA Gate consolidado** → **@qa (Quinn)** — Fase 7
> - Estimativas de esforço e prioridades são **grosseiras/preliminares** e serão refinadas pelos especialistas.
> - Sobreposições identificadas (Seção 4) **não foram removidas** — serão resolvidas na validação.

**Fontes de entrada:**
- `docs/architecture/system-architecture.md` (Fase 1 — 18 débitos SYS-XX)
- `docs/database/SCHEMA.md` + `docs/database/DB-AUDIT.md` (Fase 2 — 16 débitos DB-XX)
- `docs/frontend/frontend-spec.md` (Fase 3 — 15 débitos UX-XX)

**Nota de stack confirmada nas Fases 1–2:** o banco é **MySQL** (`drizzle-orm/mysql2`), **não Postgres** — divergência vs. briefing inicial confirmada. Sem RLS nativo; autorização 100% na aplicação (camada tRPC).

---

## Executive Summary (preliminar)

- **Total de débitos consolidados: 49**
  - **Crítico: 2** (SYS-01, SYS-02)
  - **Alto/Alta: 12** (SYS: 5 · DB: 5 · UX: 2)
  - **Médio/Média: 20** (SYS: 6 · DB: 7 · UX: 7)
  - **Baixo/Baixa: 15** (SYS: 5 · DB: 4 · UX: 6)

> Nota de normalização de escala: o documento de sistema usa Crítico/Alto/Médio/Baixo; os documentos de database e frontend usam Alta/Média/Baixa. Para o total unificado, mapeei **Alta→Alto**, **Média→Médio**, **Baixa→Baixo**, preservando os rótulos originais em cada seção. Alguns débitos "Alta" de dados (DB-02, DB-05) têm severidade de fato próxima de **Crítico** — sinalizados no Top 5 abaixo, para reavaliação pelos especialistas.

### Áreas mais afetadas
1. **Camada de dados / segurança de dados** — a mais grave em concentração de risco: FKs ausentes, `sql.raw()` com injeção de 2ª ordem, segredo em tabela, migrations à deriva.
2. **Qualidade / CI** — CI não roda testes/lint/build; zero testes de frontend; 83 testes de backend nunca executam no pipeline.
3. **Arquitetura de backend** — monólito `routers.ts` (5.784 linhas), duplicações (Asaas 3x, email 6x, PDF 5 libs), lógica de negócio no bootstrap HTTP.
4. **Consistência de frontend/UX** — layouts e padrões duplicados (navegação, tabela, confirmação, loading), erros de query mascarados, código morto de UI.

### Achados mais graves (Top 5 — cross-área)

| # | Achado | IDs | Por que é grave |
|---|--------|-----|-----------------|
| 1 | **SQL injection de 2ª ordem via email mutável do usuário** | DB-02 (+ DB-16, SYS-11) | `WHERE client_email = '${ctx.user.email}'` em `sql.raw()`; o email é controlável pelo usuário (`updateUserEmail`). Vetor real de vazamento/alteração de dados de outros clientes. |
| 2 | **Migrations com numeração duplicada e não rastreadas** | SYS-01 (= DB-04) | `0002/0003/0004/0062` duplicados; `_journal.json` referencia só um de cada. Órfãos não aplicados pelo drizzle-kit → drift entre ambientes; `0062` recria coluna já existente (`password_hash`). Risco de deploy quebrado em ambiente novo. |
| 3 | **Integridade referencial quase ausente** | DB-01 (+ DB-12) | 1 FK em 21 tabelas; sem `ON DELETE`. Registros órfãos, lixo referencial e cópias desnormalizadas divergentes (nome/email de cliente/embarcação). |
| 4 | **CI não valida nada + zero testes de frontend** | SYS-02 (+ SYS-07) | CI só roda `tsc --noEmit`; 83 testes Vitest nunca executam; `client/` sem nenhum teste. Regressões em reservas/pagamento PIX/vistorias passam despercebidas. |
| 5 | **Segredo de pagamento (`asaas_api_key`) persistido em tabela de app** | SYS-05 (= DB-05) | Chave do gateway Asaas em `system_settings` sem criptografia, legível por qualquer admin/script com `DATABASE_URL`. Deveria estar em secret manager/env. |

---

## 1. Débitos de Sistema
*(fonte: `docs/architecture/system-architecture.md` — @architect, Fase 1)*

| ID | Débito | Severidade | Área | Descrição resumida |
|----|--------|-----------|------|--------------------|
| SYS-01 | Migrations com numeração duplicada | **Crítico** | Banco/Deploy | `0002/0003/0004/0062` aparecem 2x em `drizzle/`; colisão no journal → ordem não-determinística e migrations perdidas. *(sobrepõe DB-04)* |
| SYS-02 | CI não executa testes/lint/build | **Crítico** | CI/Qualidade | 83 testes Vitest existem, mas o CI só faz `tsc --noEmit`. Sem garantia de build de produção. |
| SYS-03 | `routers.ts` monolítico de 5.784 linhas | **Alto** | Arquitetura | ~18 sub-routers inline; `fuelRecords` ~1.500 linhas. Merge conflicts, navegação e testabilidade comprometidos. |
| SYS-04 | Config/lógica de Asaas triplicada | **Alto** | Integração | `asaas.ts` + `asaasService.ts` duplicam chave/URL; terceira via em `asaasService.ts:696`; webhook inteiro no `_core/index.ts`. |
| SYS-05 | Chave de API Asaas persistida no banco | **Alto** | Segurança | `systemSettings.asaas_api_key` guarda segredo de gateway como workaround de env. *(sobrepõe DB-05)* |
| SYS-06 | Dependências mortas/redundantes | **Alto** | Dependências | `@aws-sdk/*` não usados; patch `wouter@3.7.1` órfão; pacote-lixo `add`; 5 libs de PDF concorrentes. |
| SYS-07 | Zero testes de frontend | **Alto** | Qualidade | `client/` sem nenhum `*.test/*.spec`; Vitest só cobre `server/**`. UI crítica sem cobertura. |
| SYS-08 | Sprawl de docs/scripts órfãos na raiz | **Médio** | Organização | ~29 `.md` soltos + ~25 scripts de debug/seed na raiz; sem README/`docs/`. Risco de rodar script destrutivo. *(sobrepõe DB-10)* |
| SYS-09 | Camada de email fragmentada (6+ módulos) | **Médio** | Integração | Envio SMTP espalhado por 6 módulos sem serviço único; templates/config duplicados. |
| SYS-10 | Geração de PDF fragmentada (5 módulos, 5 libs) | **Médio** | Arquitetura | `htmlToPdf.ts` (55KB) + 4 módulos usando pdfkit+jspdf+pdf-lib+pdf-to-img simultaneamente. |
| SYS-11 | Mistura ORM tipado + SQL cru com mapeamento manual | **Médio** | Banco | Relatórios/combustível/webhook usam `db.execute(sql\`...\`)` + snake→camel manual; perde type-safety. *(relaciona DB-02/DB-16)* |
| SYS-12 | `adminProcedure` duplicado (auth em 2 lugares) | **Médio** | Segurança | Definido em `_core/trpc.ts` e redefinido em `routers.ts`; divergência silenciosa futura. *(relaciona DB-03)* |
| SYS-13 | Recursão sem guarda + N+1 em `db.ts` | **Médio** | Performance | `calculateMonthFinalBalance` recorre sem limite/memoização; `getAllowedClients` faz N+1 de cotas. *(relaciona DB-06)* |
| SYS-14 | Alias `@assets`/`attached_assets` quebrado | **Baixo** | Build | Referenciado em vite/vitest, pasta inexistente; falha latente. |
| SYS-15 | Inconsistência pnpm (projeto) vs npm (CI) | **Baixo** | CI/Deploy | `packageManager: pnpm@10.33.4`, mas CI usa `npm install --legacy-peer-deps`. Resolução divergente. |
| SYS-16 | `.env.example` poluído com vars de tooling AIOX | **Baixo** | Config | ~20 vars (DEEPSEEK, SUPABASE, RAILWAY, N8N...) não pertencentes ao runtime do produto. |
| SYS-17 | Mensagens de erro dizem "S3" mas usam Forge | **Baixo** | Observabilidade | `_core/index.ts` loga "S3 upload error" enquanto `storage.ts` usa proxy Manus. Confunde diagnóstico. |
| SYS-18 | Jobs/cron via `import().then()` sem retry/observabilidade | **Baixo** | Confiabilidade | Falha de registro só loga; sem alerta/retry/health-check. |

**Subtotal:** Crítico: 2 · Alto: 5 · Médio: 6 · Baixo: 5 · **Total: 18**

---

## 2. Débitos de Database
*(fonte: `docs/database/DB-AUDIT.md` + `SCHEMA.md` — @data-engineer, Fase 2)*

> ⚠️ **PENDENTE: Revisão do @data-engineer (Dara) — Fase 5.** Confirmar estado real do schema em produção (`mysqldump --no-data`), volumes, criptografia at-rest e resolução da numeração de migrations antes de qualquer priorização final.

| ID | Débito | Severidade | Categoria | Descrição resumida |
|----|--------|------------|-----------|--------------------|
| DB-01 | Ausência de foreign keys | **Alta** | constraint | Só 1 FK em 21 tabelas; sem `ON DELETE`. Registros órfãos/inconsistência. |
| DB-02 | `sql.raw()` com interpolação de string | **Alta** | segurança | ~40 usos; injeção de 2ª ordem via `client_email` mutável e `input.reason`. Vetor real. |
| DB-03 | Autorização espalhada em `publicProcedure` | **Alta** | acesso | 40 `publicProcedure` (inc. deletes/markAsPaid/generatePayment) com checagem de role inline ~33x. *(relaciona SYS-12)* |
| DB-04 | Migrations com numeração duplicada não rastreadas | **Alta** | migration | Órfãos `0002/0003/0004/0062` não aplicados pelo drizzle-kit; drift entre ambientes. *(= SYS-01)* |
| DB-05 | Segredo (`asaas_api_key`) em `system_settings` | **Alta** | segurança | Segredo de pagamento em tabela de app, sem criptografia. *(= SYS-05)* |
| DB-06 | Índices faltando em colunas de join/filtro quentes | Média | índice | Sem índice em `bookings(client_email,vessel_id,booking_date)`, `fuel_records(...)`, etc. *(relaciona SYS-13)* |
| DB-07 | `bpo_charges` indexada por `client_id` mas consultada por `client_email` | Média | índice | Full scan no portal do cliente; falta índice em `client_email`. |
| DB-08 | Zero CHECK constraints | Média | constraint | Sem validação de domínio no banco (`amount>=0`, `rating BETWEEN 1 AND 5`). |
| DB-09 | UNIQUE ausente em chaves naturais | Média | constraint | `users.email/open_id`, `allowed_clients.email`, `employees.email` só têm `index`; permite duplicatas de identidade. |
| DB-10 | Scripts ad-hoc com acesso direto a produção | Média | segurança | ~25 scripts `.mjs/.ts` na raiz conectam via `DATABASE_URL` e rodam SQL bruto sem revisão. *(sobrepõe SYS-08)* |
| DB-11 | `employees.vessel_ids` como CSV/JSON em text | Média | constraint | Falta tabela de junção `employee_vessels`; impede FK/índice/joins. |
| DB-12 | Desnormalização ampla sem trigger de consistência | Média | constraint | `vessel_name/client_name/client_email` copiados em várias tabelas sem sincronização. *(relaciona DB-01)* |
| DB-13 | Tipos temporais inconsistentes entre tabelas | Baixa | constraint | `bigint` epoch vs `varchar(10)` vs `timestamp`. Dificulta comparações/índices por data. |
| DB-14 | Índice nomeado `*_unique` sem ser UNIQUE | Baixa | constraint | `allowed_clients_email_unique`/`users_openId_unique` são `index` comum — nome enganoso. |
| DB-15 | `fuel_records` tabela muito larga (~40 colunas) | Baixa | constraint | Mistura abastecimento/pesagem/cobrança Asaas/sync. Candidata a decomposição. *(relaciona SYS-11)* |
| DB-16 | Escape manual de aspas em SQL | Baixa | segurança | `input.reason.replace(/'/g,"\\'")` frágil; deveria ser bind. *(relaciona DB-02)* |

**Subtotal:** Alta: 5 · Média: 7 · Baixa: 4 · **Total: 16**

---

## 3. Débitos de Frontend/UX
*(fonte: `docs/frontend/frontend-spec.md` — @ux-design-expert, Fase 3)*

> ⚠️ **PENDENTE: Revisão do @ux-design-expert (Uma) — Fase 6.** Confirmar prioridade de cobertura de fluxos críticos, catalogar código morto de UI e validar impacto do dark mode antes da priorização final.

| ID | Débito | Severidade | Descrição resumida | Onde |
|----|--------|------------|--------------------|------|
| UX-01 | Confirmações nativas `window.confirm`/`alert` | **Alta** | 29 diálogos nativos em vez do `AlertDialog` acessível; UX inconsistente/não localizável. | `pages/**`, `components/**` |
| UX-02 | Erros de query mascarados | **Alta** | `useQuery(...) \|\| {data:[]}` + `trpc as any` engolem falhas → lista vazia sem feedback. | páginas com `trpcAny` |
| UX-03 | Loading sem padrão único | Média | 112 spinners `animate-spin` inline; `ui/spinner` usado 0x; `Skeleton` em 6 arquivos. | toda a app |
| UX-04 | Layouts duplicados | Média | `DashboardLayout`/`EmployeeDashboardLayout` duplicam ~80%; `MobileMenu` é 3º padrão de navegação. | `components/*Layout.tsx`, `MobileMenu.tsx` |
| UX-05 | Menu placeholder de scaffolding em produção | Média | Itens de template `"Page 1"→"/"`, `"Page 2"` nunca customizados. | `components/DashboardLayout.tsx` |
| UX-06 | Cores/estilos hardcoded fora dos tokens | Média | 22 hex/valores arbitrários; `ManusDialog`/`WhatsAppButton` quebram paleta e dark mode. | `ManusDialog.tsx`, `WhatsAppButton.tsx` |
| UX-07 | Dois padrões de tabela | Média | `<table>` HTML cru vs. primitivo `ui/table`; a11y divergente. | `CobrancasDanos.tsx`, `InspectionChargesSection.tsx` |
| UX-08 | a11y: botões icon-only sem `aria-label` | Média | 17 `aria-label` em 99 arquivos; overlay mobile sem suporte a teclado. | layouts, `MobileMenu`, diálogos custom |
| UX-09 | Dark mode inconsistente/quebrável | Média | `.dark` depende de `var(--color-blue-*)` vs `:root` oklch; `--border` a 10% (contraste). | `client/src/index.css` |
| UX-10 | Páginas monolíticas | Baixa | Saas (3274), Admin (2236), Abastecimento (1804), ReportsTab (959) sem decomposição. | `pages/admin/Saas.tsx`, etc. |
| UX-11 | Código morto de UI | Baixa | `ReservasAntigo.tsx`, `ComponentShowcase.tsx` (1437), `admin/Pagamentos.tsx` não roteados. | `pages/**` |
| UX-12 | Empty states desiguais | Baixa | ~21 telas com texto ad-hoc; `ui/empty` não adotado sistematicamente. | `pages/**` |
| UX-13 | Sem lazy-loading / code-splitting de rotas | Baixa | 24 rotas estáticas; bundle inicial carrega Saas/Admin mesmo para o sócio. | `client/src/App.tsx` |
| UX-14 | Redirect via efeito colateral em render | Baixa | `/admin/pagamentos` usa `useEffect(nav)` em vez de `<Redirect>`. | `client/src/App.tsx` |
| UX-15 | Fonte Poppins sem fallback garantido | Baixa | Sem `@font-face`/import; cai em system-ui silenciosamente. | `client/src/index.css` |

**Subtotal:** Alta: 2 · Média: 7 · Baixa: 6 · **Total: 15**

---

## 4. Sobreposições Identificadas
*(não removidas — a resolver nas Fases 5–7)*

| # | Débitos | Tipo | Observação para validação |
|---|---------|------|---------------------------|
| O-1 | **SYS-01 ≡ DB-04** | Duplicata quase exata | Mesmo problema (migrations `0002/0003/0004/0062` duplicadas), visto por @architect (deploy) e @data-engineer (journal). **Consolidar em um único débito** com dono @data-engineer; @architect cobre impacto de CI/deploy. |
| O-2 | **SYS-05 ≡ DB-05** | Duplicata exata | `asaas_api_key` em `system_settings`. Mesmo débito de segurança. **Consolidar**; @data-engineer confirma criptografia/at-rest, @architect define destino (secret manager/env). |
| O-3 | **SYS-08 ⊃ DB-10** | Sobreposição parcial | SYS-08 é o sprawl geral de docs+scripts na raiz; DB-10 foca no subconjunto de scripts que acessam produção via `DATABASE_URL`. DB-10 é o subconjunto de **maior risco**. Manter ambos, mas tratar DB-10 como prioridade dentro de SYS-08. |
| O-4 | **SYS-11 ↔ DB-02 ↔ DB-16** | Relacionados (mesma raiz) | Raiz comum: uso de `sql.raw()`/SQL cru em vez de query builder tipado. DB-02 é o risco de segurança (injeção), DB-16 o escaping frágil, SYS-11 a perda de type-safety. **Tratar como um workstream** ("erradicar `sql.raw()` interpolado"), preservando as 3 perspectivas. |
| O-5 | **SYS-12 ↔ DB-03** | Relacionados (auth) | Ambos sobre autorização frágil: SYS-12 = `adminProcedure` duplicado; DB-03 = mutations em `publicProcedure` com checagem inline. Complementares — mesma iniciativa de "centralizar autorização tRPC". |
| O-6 | **SYS-13 ↔ DB-06/DB-07** | Relacionados (performance/dados) | SYS-13 (N+1 + recursão em `db.ts`) é mitigado em parte pelos índices ausentes de DB-06/DB-07. Coordenar: índices + refactor de query juntos. |
| O-7 | **SYS-07 ↔ UX (implícito)** | Lacuna cross-área | SYS-07 (zero testes de frontend) foi levantado pelo @architect; o @ux-design-expert deve indicar **quais fluxos** priorizar (ver perguntas). Sem débito UX-XX equivalente — @ux valida escopo. |
| O-8 | **SYS-11 ↔ DB-15** | Relacionados fracamente | Decomposição de `fuel_records` (DB-15) e o SQL cru de combustível (SYS-11) tocam o mesmo domínio; avaliar em conjunto no workstream de combustível. |

---

## 5. Matriz Preliminar de Priorização
*(esforço em horas — estimativa grosseira do @architect, a refinar pelos especialistas)*

**Legenda de prioridade:** P0 = crítico/segurança imediato · P1 = alto impacto · P2 = médio · P3 = baixo/oportunista.

| ID | Débito | Área | Severidade | Esforço Est. (h) | Prioridade Prelim. |
|----|--------|------|------------|------------------|--------------------|
| DB-02 | `sql.raw()` injeção 2ª ordem | Database | Alta (≈Crítico) | 16–24 | **P0** |
| SYS-01 / DB-04 | Migrations duplicadas | Sistema/Database | Crítico/Alta | 8–16 | **P0** |
| SYS-02 | CI não roda testes/lint/build | Sistema | Crítico | 6–10 | **P0** |
| SYS-05 / DB-05 | Segredo Asaas em tabela | Sistema/Database | Alto/Alta | 4–8 | **P0** |
| DB-03 | Auth inline em `publicProcedure` | Database | Alta | 16–24 | **P1** |
| DB-01 | Ausência de foreign keys | Database | Alta | 24–40 | **P1** |
| SYS-07 | Zero testes de frontend | Sistema | Alto | 24–40 (contínuo) | **P1** |
| SYS-03 | `routers.ts` monólito 5.784 linhas | Sistema | Alto | 40–60 | **P1** |
| SYS-04 | Config Asaas triplicada | Sistema | Alto | 8–12 | **P1** |
| SYS-06 | Dependências mortas/redundantes | Sistema | Alto | 4–8 | **P1** |
| UX-01 | Confirmações nativas | Frontend | Alta | 6–10 | **P1** |
| UX-02 | Erros de query mascarados | Frontend | Alta | 10–16 | **P1** |
| DB-16 | Escape manual de aspas | Database | Baixa | 2–4 | **P1** (junto DB-02) |
| SYS-12 | `adminProcedure` duplicado | Sistema | Médio | 3–5 | **P2** |
| DB-06 | Índices de join/filtro | Database | Média | 6–10 | **P2** |
| DB-07 | Índice `client_email` em bpo_charges | Database | Média | 1–2 | **P2** |
| DB-09 | UNIQUE em chaves naturais | Database | Média | 4–8 | **P2** |
| DB-08 | CHECK constraints | Database | Média | 4–8 | **P2** |
| SYS-13 | Recursão/N+1 em `db.ts` | Sistema | Médio | 8–16 | **P2** |
| DB-10 | Scripts ad-hoc contra prod | Database | Média | 8–12 | **P2** |
| DB-11 | `employees.vessel_ids` CSV | Database | Média | 8–12 | **P2** |
| DB-12 | Desnormalização sem sync | Database | Média | 8–16 | **P2** |
| SYS-08 | Sprawl docs/scripts raiz | Sistema | Médio | 6–10 | **P2** |
| SYS-09 | Email fragmentado (6 módulos) | Sistema | Médio | 12–20 | **P2** |
| SYS-10 | PDF fragmentado (5 libs) | Sistema | Médio | 16–24 | **P2** |
| SYS-11 | ORM tipado + SQL cru | Sistema | Médio | 16–24 | **P2** |
| UX-03 | Loading sem padrão | Frontend | Média | 10–16 | **P2** |
| UX-04 | Layouts duplicados | Frontend | Média | 12–20 | **P2** |
| UX-05 | Menu placeholder | Frontend | Média | 1–2 | **P2** |
| UX-06 | Estilos hardcoded | Frontend | Média | 6–10 | **P2** |
| UX-07 | Dois padrões de tabela | Frontend | Média | 8–12 | **P2** |
| UX-08 | a11y icon buttons | Frontend | Média | 6–10 | **P2** |
| UX-09 | Dark mode inconsistente | Frontend | Média | 6–10 | **P2** |
| SYS-14 | Alias `@assets` quebrado | Sistema | Baixo | 1 | **P3** |
| SYS-15 | pnpm vs npm no CI | Sistema | Baixo | 2–4 | **P3** |
| SYS-16 | `.env.example` poluído | Sistema | Baixo | 1–2 | **P3** |
| SYS-17 | Erro "S3" enganoso | Sistema | Baixo | 1 | **P3** |
| SYS-18 | Cron sem retry/observabilidade | Sistema | Baixo | 6–10 | **P3** |
| DB-13 | Tipos temporais inconsistentes | Database | Baixa | 12–20 | **P3** |
| DB-14 | Índice `*_unique` enganoso | Database | Baixa | 1–2 | **P3** |
| DB-15 | `fuel_records` larga | Database | Baixa | 16–24 | **P3** |
| UX-10 | Páginas monolíticas | Frontend | Baixa | 24–40 | **P3** |
| UX-11 | Código morto de UI | Frontend | Baixa | 2–4 | **P3** |
| UX-12 | Empty states desiguais | Frontend | Baixa | 6–10 | **P3** |
| UX-13 | Sem lazy-loading de rotas | Frontend | Baixa | 4–8 | **P3** |
| UX-14 | Redirect via efeito colateral | Frontend | Baixa | 1 | **P3** |
| UX-15 | Poppins sem fallback | Frontend | Baixa | 1 | **P3** |

> Débitos sobrepostos (O-1, O-2) aparecem em linha combinada. Total de linhas ≈ 47 (49 débitos − 2 consolidações). Estimativa agregada grosseira: **~500–800h** de esforço total, dominada por SYS-03, DB-01, SYS-07 e UX-10.

---

## 6. Perguntas para Especialistas
*(extraídas das perguntas pendentes que a Fase 1 deixou; a serem respondidas nas Fases 5–6)*

### Para @data-engineer (Dara) — Fase 5
1. **SYS-01/DB-04:** As migrations com números duplicados são de branches divergentes mergeadas? O `_journal.json` está consistente com o estado real do banco de produção? Há migrations que nunca aplicaram (drift)? Confirmar via `mysqldump --no-data`.
2. **SYS-05/DB-05:** A `asaas_api_key` em `system_settings` está criptografada at-rest? Quem tem acesso de leitura? Há outros segredos persistidos na tabela?
3. **SYS-11/SYS-13/DB-06:** As tabelas `fuel_records`, `fuel_purchases`, `fuel_record_containers`, `fuel_budget` têm índices em `month_year`, `gallon_number`, `created_at` para suportar as agregações/recursões de saldo? Qual o volume esperado?
4. **Pool/dialeto:** `getDb` não passa `schema` ao Drizzle e não configura pool — qual a estratégia de pool/conexões em produção? MySQL puro ou **TiDB** (comentários mencionam TiDB)?
5. **Integridade (DB-01/DB-12):** Existe FK/constraint entre `bpo_charges`, `inspection_charges`, `fuel_records` e `webhook_logs`, ou a sincronização de status é só aplicacional (`syncStatusToSources`)? Risco de inconsistência de status de pagamento.
6. **Retenção:** `webhook_logs` tem política de retenção/expurgo? Payloads truncados a 4000 chars são suficientes para auditoria?

### Para @ux-design-expert (Uma) — Fase 6
1. **SYS-07:** Nenhuma página tem teste. Quais fluxos são críticos para priorizar cobertura (reserva de embarcação, pagamento PIX via Asaas, registro de vistoria, abastecimento)?
2. Há ~53 primitivos `ui/` (shadcn) — todos em uso ou parte é peso morto? `ComponentShowcase.tsx` (UX-11) é dev-only ou exposto?
3. **UX-11:** `Reservas.tsx` vs `ReservasAntigo.tsx` — a antiga ainda é referenciada em rotas? Confirmar como código morto a remover.
4. O `WeatherWidget` depende de `OPENWEATHER_API_KEY` opcional (degrada para `null`). Como a UI trata ausência de clima?
5. **UX-02:** Estados de erro/loading dos uploads (recibos, fotos de vistoria, documentos de cliente) — há feedback consistente ao usuário, dado que o backend depende do proxy Forge da Manus?
6. A separação de áreas (admin/employee/client) no roteamento (`RoleRedirect`, `AccessDenied`) cobre todos os papéis do backend? (Relaciona DB-03 — autorização no frontend confia nos layouts, não no router.)

---

*Fim do DRAFT (Fase 4). Próximas etapas: Fase 5 (@data-engineer revisa Seção 2), Fase 6 (@ux-design-expert revisa Seção 3), Fase 7 (@qa QA Gate), Fase 8 (@architect finaliza `technical-debt-assessment.md`).*

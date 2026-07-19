# System Architecture Analysis — exclusive-club-reservas

> Fase 1 (Brownfield Discovery) — `@architect` (Aria) — 2026-07-18
> Escopo: análise arquitetural somente-leitura de nível sistema. Detalhamento de banco de dados fica para `@data-engineer` (Fase 2) e frontend/UX para `@ux-design-expert` (Fase 3). Perguntas pendentes catalogadas ao final.

---

## Stack Tecnológico

Sistema de gestão/reservas para um clube de embarcações (lanchas/jet skis): reservas, cotas por cliente, controle de combustível/estoque de galões, vistorias, manutenções, cobranças de danos, mensalidades e pagamentos.

| Camada | Tecnologia | Versão | Observação |
|--------|-----------|--------|-----------|
| Runtime | Node.js | 22 (CI) / 18+ | Type `module` (ESM puro) |
| Package manager | pnpm | 10.33.4 (declarado) | **CI usa `npm install --legacy-peer-deps`** — inconsistente |
| Linguagem | TypeScript | 5.9.3 | `strict: true`, `noEmit`, moduleResolution `bundler` |
| Frontend | React | 19.1.1 | Vite 7, Wouter (router), TanStack Query 5 |
| UI | Radix UI + Tailwind 4 | — | ~50 componentes shadcn-style em `client/src/components/ui` |
| RPC | tRPC | 11.6.0 | client + server + react-query, `superjson` transformer |
| Servidor HTTP | Express | 4.21.2 | Core custom em `server/_core/` (não é "Express-like", é Express real) |
| ORM | Drizzle | 0.44.5 | **Dialeto MySQL** (`drizzle-orm/mysql2`) |
| Banco | **MySQL** (mysql2 3.15) | — | **NÃO é Postgres** (o briefing dizia Postgres — divergência confirmada). Sinais de TiDB em comentários. |
| Auth | OAuth Manus + JWT (`jose`) | — | Cookie de sessão assinado; plataforma Manus |
| Validação | Zod | 4.1.12 | — |
| Testes | Vitest | 2.1.4 | 83 arquivos `*.test.ts`, co-locados no `server/` |

**Divergências vs. briefing inicial:** (1) banco é **MySQL, não Postgres**; (2) o "core custom" é **Express real** com middleware, não um framework próprio; (3) além de Google Drive há dependências de **AWS S3** no `package.json` (não usadas — ver débitos) e o upload real usa um **proxy de storage da Manus (Forge)**, não S3 nem Drive diretamente no caminho principal.

---

## Estrutura de Pastas e Componentes

```
client/src/         Frontend React (App.tsx, main.tsx)
  _core/hooks/       useAuth (código de plataforma Manus)
  components/        17 componentes de domínio + ui/ (~50 primitivos shadcn)
  contexts/          ThemeContext
  hooks/             useComposition, useMobile, usePersistFn
  lib/               trpc.ts, utils.ts, formatCurrency.ts
  pages/             ~17 páginas + admin/ (5) + employee/ (4)
server/              Backend (Express + tRPC)
  _core/             Núcleo de plataforma: index.ts (bootstrap), context, trpc,
                     env, cookies, oauth, sdk, vite, asaas(2x), email(3x), PDF(5x), llm, map
  routers/           7 routers extraídos (bpoRouter 110KB, reportsRouter 34KB, ...)
  routers.ts         MONOLITO de 5.784 linhas com ~18 sub-routers inline
  db.ts              Camada de acesso a dados (funções + SQL cru)
  jobs/, cronJobs.ts Agendamento (node-cron)
  *.test.ts          83 arquivos de teste co-locados
shared/              types.ts (re-export de schema+errors), const.ts, _core/
drizzle/             schema.ts, relations.ts, 71 arquivos .sql de migration
```

**Composição de routers (inconsistente):** 7 routers foram extraídos para `server/routers/` (backup, reports, expenses, bpo, contract, notification) + `systemRouter`, porém ~18 sub-routers permanecem **inline** dentro de `routers.ts` (allowedClients, vessels, bookings, maintenances, weather, stats, reviews, employee, employees, `fuelRecords` [~1.500 linhas, linhas 1644–3151], fuelBudget, fuelPurchases, inspections, inspectionCharges, dueDateRequests, clientPayments, systemSettings). Não há critério claro para o que é extraído vs. inline.

**Camadas de abstração:** `db.ts` mistura duas estratégias — query-builder Drizzle tipado (`db.select().from()`) e **SQL cru via `db.execute(sql\`...\`)`** com mapeamento manual snake_case→camelCase (ex.: `getMaintenances`). Isso quebra a garantia de tipos do ORM em partes críticas (relatórios, combustível, webhook Asaas).

---

## Dependências e Versões (riscos identificados)

- **Stack recente e coerente no geral** (React 19, Vite 7, Tailwind 4, Drizzle 0.44, tRPC 11) — baixo risco de EOL, mas React 19 + Tailwind 4 são majors novos que exigem `--legacy-peer-deps` no CI (indício de conflitos de peer deps não resolvidos).
- **`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` — aparentemente NÃO utilizados** em nenhum `.ts/.tsx/.mjs` do código-fonte. O upload real usa o proxy Forge da Manus (`server/storage.ts`). Peso morto grande (~vários MB) e mensagens de erro enganosas que dizem "S3 upload error".
- **5 bibliotecas de PDF simultâneas:** `pdfkit`, `jspdf`, `jspdf-autotable`, `pdf-lib`, `pdf-to-img`. Redundância de responsabilidades; aumenta superfície de bundle e manutenção.
- **`add: ^2.0.6` em devDependencies** — pacote-lixo instalado por engano (provável `npm install add ...`). Remover.
- **`mysql2` presente, mas há `@types/multer`, `googleapis`, `openai` e chaves de IA** — a plataforma acumulou dependências de múltiplos provedores (OpenAI + Forge/Claude via `llm.ts`).
- **Patch órfão:** `patches/wouter@3.7.1.patch` existe, mas (a) `package.json` **não tem `pnpm.patchedDependencies`** e (b) a versão instalada de `wouter` é `^3.3.5`, não `3.7.1`. O patch nunca é aplicado — dead file.
- **`.env.example` inchado por variáveis do AIOX** (DEEPSEEK, OPENROUTER, ANTHROPIC, SUPABASE, RAILWAY, VERCEL, CLICKUP, N8N...) que **não pertencem ao runtime do app** — misturam config de tooling com config de produto e confundem quem faz deploy.
- **`pnpm.overrides: tailwindcss>nanoid: 3.3.7`** — override manual, provável mitigação de conflito; monitorar.

---

## Padrões de Código Existentes

**Positivos:**
- Autorização em camadas via middlewares tRPC: `protectedProcedure`, `adminProcedure`, `allowedClientProcedure`, `employeeProcedure` — modelo de papéis (admin/employee/client) claro.
- Tratamento de erro consistente nos endpoints Express de upload (validação de mimetype, limites de tamanho, `try/catch` + log com prefixo `[contexto]`).
- Segurança de infra recente aplicada (commit #35): `helmet`, `express-rate-limit` (limiters diferenciados para trpc/upload/webhook), validação de upload por whitelist de mimetype/pasta.
- Segredos **não hardcoded** — busca (grep) não encontrou chaves embutidas; tudo via `process.env` / systemSettings.

**Inconsistências / anti-padrões:**
- **`adminProcedure` definido duas vezes** — em `_core/trpc.ts` e redefinido em `routers.ts` (linha 23). Duas fontes de verdade para a mesma regra de autorização.
- **Três formas de resolver a URL/chave do Asaas:** `asaas.ts` e `asaasService.ts` duplicam `getAsaasApiKey()`/`getAsaasApiUrl()`, e `asaasService.ts:696` usa ainda `process.env.ASAAS_API_URL`. Config de integração fragmentada.
- **Chave da API Asaas persistida no banco** (`systemSettings.asaas_api_key`) como *workaround* para bug de injeção de env da Manus — implicação de segurança (segredo em tabela de aplicação; ver perguntas ao @data-engineer).
- **Imports dinâmicos dispersos** (`await import('drizzle-orm')`, `await import('../db')`, `await import('../routers/bpoRouter')`) dentro de funções — dificulta análise estática, mascara dependências circulares e adiciona latência por chamada.
- **SQL cru com montagem de string de IDs** no webhook (`consolidated-` parsing) — funcional, mas frágil (parsing por `split('-')`) e mistura lógica de negócio no bootstrap HTTP (`_core/index.ts`).
- **Lógica de negócio pesada no `index.ts`** — o webhook Asaas inteiro (~110 linhas) vive no arquivo de bootstrap do servidor, não em um módulo/handler testável.
- **Recursão sem guarda em `calculateMonthFinalBalance`** (`db.ts`) — recorre mês a mês pela herança de saldo; sem limite de profundidade nem memoização (risco de custo/loop em dados inconsistentes).
- **Padrão N+1** em `getAllowedClients` (busca cotas por cliente em `Promise.all` de queries individuais).

---

## Pontos de Integração Externos

| Integração | Módulo | Config | Tratamento de falha | Acoplamento / risco |
|-----------|--------|--------|---------------------|---------------------|
| **Asaas (pagamentos)** | `_core/asaas.ts`, `_core/asaasService.ts`, `routers/bpoRouter.ts` (110KB), webhook em `_core/index.ts` | chave via DB (workaround) → env fallback; URL sandbox/prod inferida pelo prefixo `$aact_prod_` | Webhook responde 200 imediato; valida `asaas-access-token`; grava `webhook_logs`; `try/catch` granular | **Alto** — 3 módulos, config em 3 lugares, lógica de webhook no bootstrap, parsing frágil de `externalReference` |
| **Storage (uploads)** | `server/storage.ts` (proxy Forge Manus) | `BUILT_IN_FORGE_API_URL/KEY` | `throw` se credenciais ausentes; erro propagado | **Alto** acoplamento à plataforma Manus; mensagens de erro dizem "S3" (enganoso) |
| **AWS S3** | — | env AWS_* em `.env.example` | — | **Dependência declarada, código ausente** (peso morto) |
| **Google Drive (backup)** | `setup-google-drive.ts`, `googleDriveUpload` (via `googleapis`) | OAuth local (`@google-cloud/local-auth`) | ver `backup.ts` / `databaseBackup.ts` | Médio — fluxo OAuth interativo; backup agendado |
| **Email SMTP** | `email.ts`, `_core/emailService.ts`, `_core/emailNotification.ts`, `_core/welcomeEmail.ts`, `_core/inspectionEmails.ts`, `backupNotification.ts` | `SMTP_*` via env | `nodemailer` | **Alto** — lógica de email espalhada por 6+ módulos, sem camada única de envio |
| **Clima** | `weather.ts` | `OPENWEATHER_API_KEY` | Degradação graciosa (retorna `null` + log) | Baixo — bem isolado; coordenadas default Brasília hardcoded |
| **IA/LLM** | `_core/llm.ts`, `_core/voiceTranscription.ts`, `_core/imageGeneration.ts` | Forge/OpenAI | — | Médio — múltiplos provedores |
| **PDF** | `_core/htmlToPdf.ts` (55KB), `inspectionPDF.ts`, `inspectionsPDF.ts`, `clientReportPDF.ts`, `fuelRecordPDF.ts` | 5 libs | — | **Alto** — geração de PDF fragmentada em 5 módulos e 5 libs |
| **Cron / Jobs** | `cronJobs.ts`, `jobs/updateOverdueStatus.ts`, `reminders.ts`, `schedule-backup.ts` | `node-cron` | jobs registrados via `import().then()` no boot | Médio — falha de registro só loga; sem retry/observabilidade |

**Segredos:** corretamente externalizados em env vars / systemSettings; nenhum hardcoded encontrado (exceto token de teste em `webhookAsaas.test.ts`, aceitável).

---

## Configurações (env/build/deploy)

- **Build:** `vite build` (frontend → `dist/public`) + `esbuild` bundla `server/_core/index.ts` (`--platform=node --packages=external --bundle --format=esm`). Dois artefatos, um comando. Razoável.
- **`vite.config.ts`:** carrega `vite-plugin-manus-runtime` de forma opcional (try/catch) — bom para portabilidade fora da Manus. Aliases `@`, `@shared`, `@assets`. `server.fs.deny: ["**/.*"]` (bom). Lista de `allowedHosts` fixa em domínios `*.manus*`.
- **Alias órfão:** `@assets → attached_assets` referenciado em `vite.config.ts` e `vitest.config.ts`, mas **a pasta `attached_assets/` não existe**. Alias quebrado.
- **`tsconfig.json`:** `strict`, exclui `**/*.test.ts` do typecheck (testes não passam por `tsc --noEmit`). `allowImportingTsExtensions`.
- **CI (`.github/workflows/ci.yml`):** roda **apenas `tsc --noEmit`**. **NÃO roda testes (vitest), NÃO roda lint, NÃO roda build.** Usa `npm` (não pnpm declarado) com `--legacy-peer-deps --ignore-scripts --no-optional`. Há 83 arquivos de teste que nunca executam no CI.
- **Sem script de lint** no `package.json` (só `format` via Prettier). Não há ESLint configurado.
- **Sem README** e **sem pasta `docs/`** (criada agora por esta análise).
- **`db.ts`/`getDb`:** conexão lazy via `drizzle(process.env.DATABASE_URL)` sem passar `schema` (impede `db.query` relacional) e **sem configuração explícita de pool** — depende dos defaults do `mysql2`.

---

## Débitos Técnicos Identificados (nível sistema)

| ID | Débito | Severidade | Área | Descrição |
|----|--------|-----------|------|-----------|
| SYS-01 | Migrations com numeração duplicada | **Crítico** | Banco/Deploy | `0002`, `0003`, `0004` e `0062` aparecem **duas vezes** em `drizzle/` (ex.: `0002_gifted_rhino.sql` + `0002_loud_ironclad.sql`). Colisão no journal do drizzle-kit — risco de ordem de aplicação não-determinística e migrations perdidas. Validar com @data-engineer. |
| SYS-02 | CI não executa testes nem lint nem build | **Crítico** | CI/Qualidade | 83 testes Vitest existem mas o CI só faz `tsc --noEmit`. Regressões passam despercebidas; nenhuma garantia de que o build de produção compila. |
| SYS-03 | `routers.ts` monolítico de 5.784 linhas | **Alto** | Arquitetura | ~18 sub-routers inline num único arquivo; `fuelRecords` sozinho ~1.500 linhas. Merge conflicts, navegação e testabilidade comprometidos. Extração parcial e sem critério. |
| SYS-04 | Config/lógica de Asaas triplicada | **Alto** | Integração | `asaas.ts` + `asaasService.ts` duplicam resolução de chave/URL; `asaasService.ts:696` usa terceira via (`ASAAS_API_URL`). Webhook completo mora no `_core/index.ts`. |
| SYS-05 | Chave de API Asaas persistida no banco | **Alto** | Segurança | `systemSettings.asaas_api_key` guarda segredo de gateway de pagamento como workaround de env. Segredo em tabela de app (verificar criptografia/at-rest e RLS com @data-engineer). |
| SYS-06 | Dependências mortas / redundantes | **Alto** | Dependências | `@aws-sdk/client-s3` + `s3-request-presigner` não usados; `patches/wouter@3.7.1.patch` órfão (sem `patchedDependencies`, versão errada); pacote-lixo `add`; 5 libs de PDF concorrentes. |
| SYS-07 | Zero testes de frontend | **Alto** | Qualidade | `client/` não tem nenhum `*.test/*.spec`. Vitest só inclui `server/**`. Toda a UI (reservas, pagamentos PIX, vistorias) sem cobertura automatizada. |
| SYS-08 | Sprawl de documentação e scripts órfãos na raiz | **Médio** | Organização | ~29 `.md` soltos na raiz (TESTE_*, PROPOSTA_*, bug-analysis, CORRECOES_*...), ~25 scripts de debug/seed na raiz (`check-*.mjs/.ts`, `diag-*`, `seed-*`, `run_reimport.mjs`) + 16 em `scripts/`. Sem `docs/` nem README. Ruído massivo; risco de rodar script destrutivo por engano. |
| SYS-09 | Camada de email fragmentada em 6+ módulos | **Médio** | Integração | Envio SMTP espalhado por `email.ts`, `emailService.ts`, `emailNotification.ts`, `welcomeEmail.ts`, `inspectionEmails.ts`, `backupNotification.ts`. Sem serviço único; duplicação de templates/config. |
| SYS-10 | Geração de PDF fragmentada (5 módulos, 5 libs) | **Médio** | Arquitetura | `htmlToPdf.ts` (55KB), `inspectionPDF.ts`, `inspectionsPDF.ts`, `clientReportPDF.ts`, `fuelRecordPDF.ts` usando pdfkit+jspdf+pdf-lib+pdf-to-img simultaneamente. |
| SYS-11 | Mistura ORM tipado + SQL cru com mapeamento manual | **Médio** | Banco | Partes críticas (relatórios, combustível, webhook) usam `db.execute(sql\`...\`)` + snake→camel manual, perdendo type-safety do Drizzle. Ver @data-engineer. |
| SYS-12 | `adminProcedure` duplicado / regras de auth em 2 lugares | **Médio** | Segurança | Definido em `_core/trpc.ts` e redefinido em `routers.ts`. Divergência futura silenciosa nas regras de acesso admin. |
| SYS-13 | Recursão sem guarda + N+1 em `db.ts` | **Médio** | Performance | `calculateMonthFinalBalance` recorre por herança de saldo sem limite/memoização; `getAllowedClients` faz N+1 de cotas. Custo cresce com histórico. |
| SYS-14 | Alias `@assets`/`attached_assets` quebrado | **Baixo** | Build | Referenciado em vite/vitest configs, pasta inexistente. Falha latente se algum import usar `@assets`. |
| SYS-15 | Inconsistência pnpm (projeto) vs npm (CI) | **Baixo** | CI/Deploy | `packageManager: pnpm@10.33.4` mas CI usa `npm install --legacy-peer-deps`. Lockfiles/resolução divergentes entre dev e CI. |
| SYS-16 | `.env.example` poluído com variáveis de tooling AIOX | **Baixo** | Config | ~20 vars (DEEPSEEK, SUPABASE, RAILWAY, VERCEL, N8N...) não pertencentes ao runtime do produto misturadas com config real de deploy. |
| SYS-17 | Mensagens de erro de upload dizem "S3" mas usam Forge | **Baixo** | Observabilidade | `_core/index.ts` loga "S3 upload error" enquanto `storage.ts` usa o proxy Manus. Confunde diagnóstico em produção. |
| SYS-18 | Jobs/cron registrados via `import().then()` sem retry/observabilidade | **Baixo** | Confiabilidade | Falha de registro de cron só é logada; sem alerta, retry ou health-check. Reincidência silenciosa. |

**Resumo por severidade:** Crítico: 2 · Alto: 5 · Médio: 6 · Baixo: 5 · **Total: 18**

---

## Perguntas para outros especialistas

### Para @data-engineer (Fase 2 — SCHEMA.md / DB-AUDIT.md)
1. **SYS-01:** As migrations com números duplicados (`0002`, `0003`, `0004`, `0062`) são de branches divergentes mergeadas? O `_journal.json` do drizzle está consistente com o estado real do banco de produção? Há migrations que nunca aplicaram?
2. **SYS-05:** A `asaas_api_key` em `system_settings` está criptografada at-rest? Quem tem acesso de leitura à tabela? Há outros segredos persistidos ali?
3. **SYS-11/13:** As tabelas `fuel_records`, `fuel_purchases`, `fuel_record_containers`, `fuel_budget` têm índices em `month_year`, `gallon_number`, `created_at` para suportar as agregações/recursões de saldo? Qual o volume esperado?
4. O `getDb` não passa `schema` ao Drizzle e não configura pool — qual a estratégia de pool/conexões em produção (MySQL vs TiDB — os comentários mencionam TiDB)?
5. Existe FK/constraint entre `bpo_charges`, `inspection_charges`, `fuel_records` e `webhook_logs`, ou a sincronização de status é só aplicacional (`syncStatusToSources`)? Risco de inconsistência de status de pagamento.
6. `webhook_logs` tem política de retenção/expurgo? Payloads são truncados a 4000 chars — suficiente para auditoria?

### Para @ux-design-expert (Fase 3 — frontend-spec.md)
1. **SYS-07:** Nenhuma página tem teste. Quais fluxos são críticos para priorizar cobertura (reserva de embarcação, pagamento PIX via Asaas, registro de vistoria, abastecimento)?
2. Há ~50 primitivos `ui/` (shadcn) — todos estão em uso ou parte é peso morto? `ComponentShowcase.tsx` sugere página de catálogo — é dev-only ou exposta?
3. Existem duas páginas de reserva: `Reservas.tsx` e `ReservasAntigo.tsx` (legado). A antiga ainda é referenciada em rotas? Débito de UI a remover?
4. O `WeatherWidget` depende de `OPENWEATHER_API_KEY` opcional (degrada para `null`). Como a UI trata ausência de clima?
5. Estados de erro/loading dos uploads (recibos, fotos de vistoria, documentos de cliente) — há feedback consistente ao usuário, dado que o backend depende do proxy Forge da Manus?
6. A separação de áreas (admin / employee / client) no roteamento (`RoleRedirect`, `AccessDenied`) cobre todos os papéis do backend?

---

*Fim da Fase 1. Próximo: @data-engineer (Fase 2) e @ux-design-expert (Fase 3) respondem as perguntas acima; @architect consolida em `technical-debt-DRAFT.md` na Fase 4.*

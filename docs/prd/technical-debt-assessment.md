# Technical Debt Assessment — FINAL

> **Fase 8 do workflow Brownfield Discovery** — `@architect` (Aria) — 2026-07-18
> Consolidação final incorporando: DRAFT (Fase 4, 49 débitos) + revisão @data-engineer (Fase 5) + revisão @ux-design-expert (Fase 6) + QA gate @qa (Fase 7, NEEDS WORK) + addendum de cobertura de gaps (Fase 7b, gate → APPROVED).
> Método: **somente-leitura** sobre código-fonte. Nenhum arquivo de código modificado; nenhuma migration aplicada; nenhum teste executado.
> Stack confirmada: banco **TiDB Cloud** (`server/databaseBackup.ts:34-36` — SSL + comentário explícito), `drizzle-orm/mysql2`, autorização 100% na camada tRPC (sem RLS nativo). **Implicação de plataforma:** FK/trigger/CHECK nativos provavelmente indisponíveis/limitados → integridade migra para a camada de aplicação (afeta DB-01/DB-08/DB-12).

---

## Executive Summary

- **Total de débitos catalogados (IDs distintos):** 63
- **Total de débitos após merge de sobreposições exatas (O-1: SYS-01≡DB-04; O-2: SYS-05≡DB-05):** **61**
  - **Crítico: 3** (SYS-02, DB-02, SYS-22)
  - **Alto: 14** (SYS: 7 · DB: 4 · UX: 3)
  - **Médio: 26** (SYS: 8 · DB: 10 · UX: 8)
  - **Baixo: 18** (SYS: 7 · DB: 5 · UX: 6)
- **Itens acionáveis independentes:** 59 (DB-14 e DB-16 são *folded* em execução — remediados junto de DB-09 e DB-02 respectivamente, sem esforço de linha própria; permanecem no inventário por rastreabilidade, "0 removidos").
- **Esforço total estimado:** **~650 horas** (faixa 600–700h), dominado por SYS-03 (~50h), SYS-07 (~32h), UX-10 (~32h), DB-01 (~28h).

**Evolução da escala de severidade nesta consolidação (vs. DRAFT):**
- DB-02 elevado Alta → **Crítico** (@data-engineer, confirmado @qa): 6 interpolações de `client_email` mutável em `sql.raw()`.
- **SYS-22 elevado Alto → Crítico** — `[AUTO-DECISION]` do @architect: *o backup empacota `.env` + tokens OAuth + dump PII num único ZIP publicável sem criptografia (`backup.ts:69-79`). Não é risco latente — é exfiltração ativa de segredo e PII. Justifica tier Crítico e entrada na janela de emergência* (reason: vetor de exfiltração mais direto do sistema, superior aos 25 scripts de DB-10; a chave Asaas pode já ter vazado em backups gerados).
- UX-08 elevado Média → Alta (falha WCAG 2.1.1/4.1.2). UX-13 elevado Baixa → Média (impacto na persona primária). UX-09 rebaixado Média → Baixa (tema fixo em `light`, dark mode dormente).
- SYS-23 (cron de inadimplência) destacado de SYS-18 e elevado de Baixo → Médio.

**Confirmações antes-abertas — FECHADAS com evidência de código (Fase 7b):**
- **`webhook_logs` NÃO existe** — criada em `0032`, dropada em `0033_good_lila_cheney.sql:5`, nunca recriada, ausente de `schema.ts`. Todo o subsistema de auditoria de pagamento (`payment_audit_logs`, `payment_reconciliations`, `asaas_payments`) foi dropado na mesma migration. → dispara **DB-21**.
- **Provider é TiDB Cloud** — confirma o gate de FK de DB-01.
- **Refutação (Constitution Art. IV — No Invention):** o G-3 do QA (SSRF/HTML-injection em `htmlToPdf`) **não se aplica** — o renderer é PDFKit (estrutura tipada), sem HTML/browser/fetch remoto. Rebaixado a SYS-20 (Baixo, higiene). Não inflar o inventário com risco inexistente.

---

## ⚠️ Janela de Emergência
### (ação recomendada imediata, independente do cronograma de fases)

Estes itens representam **risco ativo** — exposição de segredo, vazamento cross-cliente de dados, e corrupção/perda de dados financeiros. Podem e devem começar **em paralelo à Fase 0**, sem esperar o restante do programa. O QA e o addendum confirmam: "nada bloqueia iniciar a remediação de emergência (SYS-02 + DB-02 + DB-05 + SYS-22)".

| Prioridade | Débito | Severidade | Risco ativo | Ação imediata | Horas |
|-----------|--------|-----------|-------------|---------------|-------|
| 🔴 E-1 | **DB-02 (+DB-16)** — `sql.raw()` injeção 2ª ordem via `client_email` mutável | **Crítico** | Vazamento/alteração de dados cross-cliente (6 interpolações confirmadas) | Erradicar as 6 interpolações de `client_email` e a de `input.reason`; usar bind params/query builder tipado | 16–24 |
| 🔴 E-2 | **SYS-22** — backup empacota `.env` + OAuth + PII sem cripto | **Crítico** | Exfiltração de segredo + PII num ZIP publicável (`backup.ts:69-79`); URL de download pode furar gate admin | Excluir `.env`/tokens do `archive.glob`; criptografar artefato; **auditar backups já gerados**; assinar/expirar URL de download | 12–20 |
| 🔴 E-3 | **SYS-05 ≡ DB-05** — chave Asaas em `system_settings` (texto plano) | **Alto** | Segredo legível por qualquer admin/script com `DATABASE_URL` | Extrair para env/secret manager + **rotacionar a chave** (assumir comprometida — pode ter vazado em backups) | 4–8 |
| 🟠 E-4 | **DB-21** — `webhook_logs` dropada, zero auditoria de pagamento | **Alto** | Corrupção financeira **não é sequer detectável forense**; pré-requisito de observabilidade do workstream financeiro | Recriar tabela de auditoria alinhada ao schema; corrigir o `INSERT` incompatível de `index.ts:369` (falha 100% em silêncio hoje) | 8–16 |

> **Nota de contenção de segredo:** ao rotacionar a chave Asaas (E-3), tratar como comprometida — revisar TODO backup já gerado por SYS-22, pois podem conter `.env` com a chave antiga. Estes quatro itens são a interseção dos riscos cruzados **R-1, R-2 e R-4**.

---

## Inventário Completo de Débitos

### Débito #0 — Bloqueador Estrutural

| ID | Débito | Severidade | Horas | Justificativa de bloqueio |
|----|--------|-----------|-------|---------------------------|
| **SYS-02** | **CI não executa testes/lint/build** — só roda `tsc --noEmit` | **Crítico** | 6–10 | **Meta-enabler de todo o programa.** Os 83 testes Vitest existentes — incluindo `webhook.phase2.test.ts`, `webhookAsaas.test.ts`, `jobs/updateOverdueStatus.test.ts`, `payments.test.ts`, `clientPayments.test.ts` — **existem em disco e nunca rodam**. Sem CI, corrigir DB-02/DB-19/DB-21/SYS-19 (todos em caminhos financeiros já cobertos por testes desligados) é "mudança às cegas". 6–10h transformam cada PR subsequente de não-verificável em verificável. **Pré-requisito absoluto de todo o backlog, inclusive da janela de emergência.** |

> **Sequência de topo (validada por @qa e reconfirmada na Fase 7b):** SYS-02 (habilitar CI + rodar os 83 testes) → ligar/escrever testes de caracterização dos caminhos financeiros → **então** refatorar DB-02/DB-03/SYS-19/DB-21. A remediação de emergência (E-1..E-4) pode começar em paralelo, mas só é *verificável* após SYS-02.

### Sistema (validado por @architect — Fases 1, 7b)

| ID | Débito | Severidade | Horas | Prioridade |
|----|--------|-----------|-------|-----------|
| SYS-01 ≡ DB-04 | Migrations numeração duplicada / drift (`0002/0003/0004/0062`) | Alto | 4–8 | P0 (enabler DDL) |
| SYS-02 | CI não roda testes/lint/build | **Crítico** | 6–10 | **#0** |
| SYS-03 | `routers.ts` monolítico (5.784 linhas) | Alto | 40–60 | P2 |
| SYS-04 | Config/lógica Asaas triplicada | Alto | 8–12 | P1 |
| SYS-05 ≡ DB-05 | Chave Asaas persistida em `system_settings` | Alto | 4–8 | **P0 (emergência E-3)** |
| SYS-06 | Dependências mortas/redundantes | Alto | 4–8 | P1 |
| SYS-07 | Zero testes de frontend | Alto | 24–40 | P1 (contínuo, pós UX-10) |
| SYS-08 | Sprawl de docs/scripts órfãos na raiz | Médio | 6–10 | P2 |
| SYS-09 | Camada de email fragmentada (6 módulos) | Médio | 12–20 | P2 |
| SYS-10 | Geração de PDF fragmentada (5 libs) | Médio | 16–24 | P2 |
| SYS-11 | ORM tipado + SQL cru c/ mapeamento manual | Médio | 16–24 | P2 (workstream `sql.raw`) |
| SYS-12 | `adminProcedure` duplicado (auth em 2 lugares) | Médio | 3–5 | P1 (workstream identidade) |
| SYS-13 | Recursão sem guarda + N+1 em `db.ts` | Médio | 8–16 | P2 |
| SYS-14 | Alias `@assets`/`attached_assets` quebrado | Baixo | 1 | P3 |
| SYS-15 | Inconsistência pnpm (projeto) vs npm (CI) | Baixo | 2–4 | P3 (junto SYS-02) |
| SYS-16 | `.env.example` poluído com vars de tooling | Baixo | 1–2 | P3 |
| SYS-17 | Logs dizem "S3" mas usam proxy Forge | Baixo | 1 | P3 |
| SYS-18 | Cron via `import().then()` sem retry/observabilidade (genérico, sem o job de inadimplência) | Baixo | 4–6 | P3 |
| **SYS-19** | **Webhook Asaas: sem transação, responde `200` antes de processar, sem idempotency-key/ordenação** | **Alto** | 16–24 | P1 (integridade financeira) |
| SYS-20 | Higiene de geração de PDF *(SSRF/HTML-injection REFUTADO — PDFKit)* | Baixo | 2–4 | P3 |
| **SYS-21** | **Email: injeção HTML/template + falha SMTP silenciosa** | **Médio** | 6–10 | P2 (observabilidade) |
| **SYS-22** | **Backup empacota segredos + PII sem cripto; DR não auditado** | **Crítico** | 12–20 | **P0 (emergência E-2)** |
| **SYS-23** | **Cron `updateOverdueStatus` — 3 UPDATEs não transacionais, falha silenciosa, bug de fuso UTC** | **Médio** | 4–8 | P1 (integridade financeira) |
| **SYS-24** | **Integração LLM/IA não auditada** (custo, PII a provedor externo, prompt-injection) | **Baixo** | 4–8 | P3 |

### Database (validado por @data-engineer — Fase 5)

| ID | Débito | Severidade | Horas | Prioridade |
|----|--------|-----------|-------|-----------|
| DB-01 | Ausência de foreign keys (1 FK em 21 tabelas) | Alto | 16–40 | P1 (**gate TiDB**: se FK nativa indisponível → integridade aplicacional + jobs de reconciliação) |
| DB-02 (+DB-16) | `sql.raw()` c/ interpolação (injeção 2ª ordem) | **Crítico** | 16–24 | **P0 (emergência E-1)** |
| DB-03 | Autorização inline em `publicProcedure` (40 usos) | Alto | 16–24 | P1 (workstream identidade) |
| DB-04 | *(≡ SYS-01 — consolidado)* | — | — | — |
| DB-05 | *(≡ SYS-05 — consolidado)* | — | — | — |
| DB-06 | Índices faltando em colunas quentes de join/filtro | Médio | 6–10 | P1 (quick win, era P2 ↑) |
| DB-07 | `bpo_charges` sem índice em `client_email` | Médio | 1–2 | P1 (quick win 1–2h, era P2 ↑) |
| DB-08 | Zero CHECK constraints | Médio | 4–8 | P2 (verificar suporte TiDB antes) |
| DB-09 (+DB-14) | UNIQUE ausente em chaves naturais (email/open_id) | Médio | 4–8 | P2 (exige dedup antes do DDL) |
| DB-10 | Scripts ad-hoc com acesso direto a produção (~25) | Médio | 8–12 | P2 (⊂ SYS-08; subconjunto de maior risco) |
| DB-11 | `employees.vessel_ids` como CSV/JSON em text | Médio | 8–12 | P2 (depende de DB-04) |
| DB-12 | Desnormalização ampla sem sincronização | Médio | 8–16 | P2 (sync aplicacional se TiDB sem trigger) |
| DB-13 | Tipos temporais inconsistentes | Baixo | 12–20 | P3 |
| DB-14 | *(folded em DB-09 — nome deixa de enganar ao virar UNIQUE real)* | Baixo | — | P2 |
| DB-15 | `fuel_records` tabela muito larga (~40 col.) | Baixo | 16–24 | P3 (workstream combustível) |
| DB-16 | *(folded em DB-02 — mesma erradicação de `sql.raw`)* | Baixo | — | P0 |
| **DB-17** | **Zero transações no backend** (fluxos financeiros multi-escrita não atômicos) | **Alto** | 12–20 | P1 (integridade financeira) |
| **DB-18** | **Conexão única sem pool nem reconnect** (`db.ts:11`; sem `schema` → empurra p/ `sql.raw`) | **Médio** | 3–6 | P1 (pré-condição facilitadora de DB-02) |
| **DB-19** | **Representação monetária mista** (int centavos vs `decimal`) | **Médio** | 8–16 | P2 |
| **DB-20** | **Sem charset/collation explícito** (risco no join por `client_email`) | **Baixo** | 2–6 | P3 (verificação barata; parte de R-1) |
| **DB-21** | **`webhook_logs` dropada — auditoria de pagamento inexistente** | **Alto** | 8–16 | **P0 (emergência E-4; pré-req observabilidade financeira)** |
| **DB-22** | **SQLi de 2ª ordem no cron de despesas** (`cronJobs.ts` interpola `tx.description`/`tx.id` da API Asaas) | **Médio** | 4–8 | P2 (família DB-02) |

### Frontend/UX (validado por @ux-design-expert — Fase 6)

| ID | Débito | Severidade | Horas | Prioridade |
|----|--------|-----------|-------|-----------|
| UX-01 | Confirmações nativas `window.confirm`/`alert` (29 usos, protegem ações destrutivas) | Alto | 8–12 | P1 |
| UX-02 | Erros de query mascarados (`\|\| {data:[]}` + `trpc as any`) | Alto | 14–20 | P1 (débito UX #1) |
| UX-03 | Loading sem padrão único (112 spinners inline) | Médio | 12–18 | P2 (junto UX-02) |
| UX-04 | Layouts duplicados (`Dashboard`/`EmployeeDashboard` + `MobileMenu`) | Médio | 14–22 | P2 |
| UX-05 | Menu placeholder de scaffolding em produção ("Page 1/2") | Médio | 1–2 | P2 (quick win) |
| UX-06 | Cores/estilos hardcoded fora dos tokens (`ManusDialog`) | Médio | 6–10 | P2 |
| UX-07 | Dois padrões de tabela (`<table>` cru vs `ui/table`) | Médio | 8–12 | P2 |
| UX-08 | a11y: icon buttons sem `aria-label` + overlay mobile sem teclado (WCAG 2.1.1/4.1.2) | Alto | 10–16 | P1 (elevado) |
| UX-09 | Dark mode inconsistente/quebrável (dormente — tema fixo `light`) | Baixo | 4–8 | P3 (rebaixado) |
| UX-10 | Páginas monolíticas (Saas 3274, Admin 2236, Abastecimento 1804) | Baixo | 24–40 | P3 (decompor **oportunisticamente**; bloqueador de UX-03/07/13 + SYS-07) |
| UX-11 | Código morto de UI (`ReservasAntigo`, `ComponentShowcase`, `admin/Pagamentos`) | Baixo | 2–4 | P3 (quick win) |
| UX-12 | Empty states desiguais (~21 telas ad-hoc) | Baixo | 6–10 | P2/P3 (junto UX-02) |
| UX-13 | Sem lazy-loading / code-splitting de rotas | Médio | 6–10 | P2 (elevado; impacto na persona primária) |
| UX-14 | Redirect via efeito colateral em render | Baixo | 1 | P3 (quick win) |
| UX-15 | Fonte Poppins sem fallback garantido | Baixo | 1 | P3 (quick win) |
| **UX-16** | **Falha parcial de upload de vistoria prossegue silenciosamente** (submete registro sem a foto) | **Médio** | 6–10 | P1/P2 (família R-5) |
| **UX-17** | **Autorização de UI depende do layout, não de guarda de rota** (espelha DB-03) | **Médio** | 8–14 | P2 (workstream authz) |

### Sobreposições Mescladas

| # | Débitos | Resolução | Dono da execução | Stakeholder |
|---|---------|-----------|------------------|-------------|
| **O-1** | **SYS-01 ≡ DB-04** — migrations `0002/0003/0004/0062` duplicadas | **MESCLADO em 1 débito.** Raiz única: colisão de numeração por merge de branches (evidência decisiva: `0062_small_katie_power` e o órfão `0062_add_password_hash` fazem a **mesma** alteração `ADD password_hash`). Execução: reconciliar baseline via `mysqldump --no-data`, remover/renumerar órfãos, documentar. | @data-engineer | @architect (impacto CI/deploy) |
| **O-2** | **SYS-05 ≡ DB-05** — `asaas_api_key` em `system_settings` | **MESCLADO em 1 débito P0** (janela de emergência E-3). Execução dividida: @data-engineer remove valor da tabela + rotaciona; @architect define destino (secret manager/env) + plumbing. | @data-engineer + @architect | — |

**Sobreposições relacionadas mantidas como workstreams** (não são duplicatas, são famílias de raiz comum — ver Riscos Cruzados): O-3 (SYS-08 ⊃ DB-10), O-4 (SYS-11 ↔ DB-02 ↔ DB-16 + DB-18 facilitador), O-5 (SYS-12 ↔ DB-03), O-6 (SYS-13 ↔ DB-06/DB-07), O-8 (SYS-11 ↔ DB-15).

---

## Riscos Cruzados (R-1 a R-6)

Os riscos abaixo **conectam múltiplos débitos** e são a lente mais acionável do assessment: cada um é um **workstream**, não um item de lista. Corrigir débitos isolados dentro de um risco **não fecha o risco**. Reavaliados contra o código na Fase 7b (R-2/R-4/R-5 ampliados; R-6 parcialmente mitigado).

| Risco | Áreas | Débitos combinados | Mitigação (workstream) |
|-------|-------|--------------------|------------------------|
| **R-1 — Identidade sobre email mutável** *(risco mestre)* | Dados + Segurança + Frontend | DB-02, DB-03, DB-09, DB-20, UX-17, SYS-12 | Workstream único "identidade e isolamento por dono": (1) email UNIQUE após dedup; (2) erradicar `sql.raw()` no scoping; (3) fixar `utf8mb4` + collation consistente no join de email; (4) centralizar scoping por dono em helper único; (5) travar mutação de email ou re-verificar authz após troca. **Evidência ampliada (7b):** `cronJobs.ts:62-64` usa `email.toLowerCase()` como chave de `Map` — dois clientes com mesmo email → um **sobrescreve o outro** → cobrança atribuída ao cliente errado. |
| **R-2 — Corrupção silenciosa de dados financeiros** | Dados + Sistema + Integração | DB-17, DB-01, DB-12, DB-19, DB-21, SYS-19, SYS-23 | Workstream "integridade financeira": envolver caminho cobrança/pagamento/sync em `db.transaction()`; idempotency-key no webhook; padronizar tipo monetário; job de reconciliação auditável. **Pior que o estimado (7b):** SYS-19 responde `200` antes de processar → erro transitório = **perda permanente**; sem DB-21 (auditoria), a corrupção **não é sequer detectável forense**. **DB-21 é pré-requisito de observabilidade do workstream.** |
| **R-3 — Deploy em ambiente novo quebra** | Dados + Sistema + CI | SYS-01/DB-04, SYS-02, SYS-22 | DB-04 é enabler (reconciliar baseline via `mysqldump --no-data` **antes** de qualquer DDL); CI roda migrations em banco efêmero; restore só sobre baseline reconhecido. **Agravante (7b):** `databaseBackup.ts:65` gera `DROP TABLE` universal + `0033` dropa PKs/UNIQUEs de ~15 tabelas → restaurar sobre schema divergente = destruição. |
| **R-4 — Exfiltração de segredo de pagamento** | Dados + Sistema + Segurança | DB-05/SYS-05, DB-10, SYS-08, **SYS-22** | Extrair segredo para secret manager + **rotacionar** (assumir comprometido) + consolidar/gate os scripts. **Ampliado (7b):** não é só "25 scripts leem a chave" — SYS-22 mostra o **backup empacotando `.env` + tokens OAuth + dump PII** num ZIP publicável. **Revisar todo backup já gerado.** |
| **R-5 — Família "falha silenciosa" (observabilidade)** | Frontend + Sistema + Integração | UX-02, UX-16, SYS-19, SYS-21, SYS-23, SYS-17, SYS-18, DB-21 | O sistema esconde falha em **todas** as camadas. Padrão único de erro no frontend (`WeatherWidget` como referência canônica), bloqueio de submissão em upload crítico, alertas em cron/SMTP/webhook, logs corretos. **Confirmado (7b) em ≥5 superfícies novas:** webhook (`200` antecipado + `catch` warn), `updateOverdueStatus` (catch→zeros sem alerta), cron expenses, email (boolean ignorado), `webhook_logs` (insert falha em silêncio). |
| **R-6 — Autorização sem defesa em profundidade** | Frontend + Dados | UX-17, DB-03 | Frontend **e** backend devem falhar seguro; o backend/tRPC é a fronteira real. **Parcialmente mitigado (7b):** `downloadBackupRoute.ts:15-22` **tem** gate de admin real (bom exemplo). Ressalva nova: `res.redirect` para URL de storage pode furar o gate se a URL for pública (SYS-22) — garantir URLs assinadas/efêmeras. |

---

## Matriz de Priorização Final

**Legenda:** P0 = crítico/segurança imediato (janela de emergência) · P1 = alto impacto / fundação · P2 = médio · P3 = baixo/oportunista. `#0` = bloqueador estrutural que precede tudo.

| Ordem | ID | Débito | Área | Severidade | Horas | Prioridade |
|------:|----|--------|------|-----------|-------|-----------|
| #0 | SYS-02 | CI não roda testes/lint/build | Sistema | **Crítico** | 6–10 | **#0** |
| 1 | DB-02 (+DB-16) | `sql.raw()` injeção 2ª ordem | Database | **Crítico** | 16–24 | **P0 (E-1)** |
| 2 | SYS-22 | Backup exfiltra segredos + PII | Sistema | **Crítico** | 12–20 | **P0 (E-2)** |
| 3 | SYS-05 ≡ DB-05 | Chave Asaas em tabela | Sist/DB | Alto | 4–8 | **P0 (E-3)** |
| 4 | DB-21 | `webhook_logs` dropada / sem auditoria | Database | Alto | 8–16 | **P0 (E-4)** |
| 5 | SYS-01 ≡ DB-04 | Migrations duplicadas (enabler DDL) | Sist/DB | Alto | 4–8 | P0 |
| 6 | DB-18 | Conexão sem pool + sem `schema` | Database | Médio | 3–6 | P1 (facilitador DB-02) |
| 7 | DB-17 | Zero transações | Database | Alto | 12–20 | P1 |
| 8 | SYS-19 | Webhook não transacional / 200 antecipado | Sistema | Alto | 16–24 | P1 |
| 9 | SYS-23 | Cron inadimplência (transação/fuso/alerta) | Sistema | Médio | 4–8 | P1 |
| 10 | DB-22 | SQLi cron de despesas | Database | Médio | 4–8 | P1 (família DB-02) |
| 11 | DB-03 | Authz inline em `publicProcedure` | Database | Alto | 16–24 | P1 |
| 12 | SYS-12 | `adminProcedure` duplicado | Sistema | Médio | 3–5 | P1 (identidade) |
| 13 | DB-07 | Índice `client_email` em bpo_charges | Database | Médio | 1–2 | P1 (quick win) |
| 14 | DB-06 | Índices de join/filtro quentes | Database | Médio | 6–10 | P1 (quick win) |
| 15 | DB-09 (+DB-14) | UNIQUE em chaves naturais (pós-dedup) | Database | Médio | 4–8 | P1/P2 |
| 16 | DB-20 | Charset/collation no join de email | Database | Baixo | 2–6 | P1 (verificação, parte R-1) |
| 17 | DB-01 | Foreign keys (gate TiDB) | Database | Alto | 16–40 | P1 |
| 18 | SYS-04 | Config Asaas triplicada | Sistema | Alto | 8–12 | P1 |
| 19 | SYS-06 | Dependências mortas | Sistema | Alto | 4–8 | P1 |
| 20 | UX-02 | Erros de query mascarados | Frontend | Alto | 14–20 | P1 |
| 21 | UX-01 | Confirmações nativas | Frontend | Alto | 8–12 | P1 |
| 22 | UX-08 | a11y icon buttons + overlay teclado | Frontend | Alto | 10–16 | P1 |
| 23 | UX-16 | Upload de vistoria falha em silêncio | Frontend | Médio | 6–10 | P1/P2 |
| 24 | SYS-07 | Zero testes de frontend | Sistema | Alto | 24–40 | P1 (pós UX-10) |
| 25 | SYS-21 | Email injection + SMTP silencioso | Sistema | Médio | 6–10 | P2 |
| 26 | DB-19 | Representação monetária mista | Database | Médio | 8–16 | P2 |
| 27 | DB-12 | Desnormalização sem sync | Database | Médio | 8–16 | P2 |
| 28 | DB-11 | `employees.vessel_ids` CSV | Database | Médio | 8–12 | P2 |
| 29 | DB-08 | CHECK constraints (verificar TiDB) | Database | Médio | 4–8 | P2 |
| 30 | DB-10 | Scripts ad-hoc contra prod | Database | Médio | 8–12 | P2 |
| 31 | SYS-08 | Sprawl docs/scripts raiz | Sistema | Médio | 6–10 | P2 |
| 32 | SYS-13 | Recursão/N+1 em `db.ts` | Sistema | Médio | 8–16 | P2 |
| 33 | SYS-09 | Email fragmentado (6 módulos) | Sistema | Médio | 12–20 | P2 |
| 34 | SYS-10 | PDF fragmentado (5 libs) | Sistema | Médio | 16–24 | P2 |
| 35 | SYS-11 | ORM tipado + SQL cru | Sistema | Médio | 16–24 | P2 |
| 36 | UX-17 | Authz de UI sem guarda de rota | Frontend | Médio | 8–14 | P2 |
| 37 | UX-13 | Sem lazy-loading de rotas | Frontend | Médio | 6–10 | P2 |
| 38 | UX-03 | Loading sem padrão | Frontend | Médio | 12–18 | P2 |
| 39 | UX-04 | Layouts duplicados | Frontend | Médio | 14–22 | P2 |
| 40 | UX-07 | Dois padrões de tabela | Frontend | Médio | 8–12 | P2 |
| 41 | UX-06 | Estilos hardcoded | Frontend | Médio | 6–10 | P2 |
| 42 | UX-05 | Menu placeholder | Frontend | Médio | 1–2 | P2 (quick win) |
| 43 | UX-12 | Empty states desiguais | Frontend | Baixo | 6–10 | P2/P3 |
| 44 | SYS-03 | `routers.ts` monólito | Sistema | Alto | 40–60 | P2 (estrutural, incremental) |
| 45 | UX-11 | Código morto de UI | Frontend | Baixo | 2–4 | P3 (quick win) |
| 46 | UX-14 | Redirect efeito colateral | Frontend | Baixo | 1 | P3 (quick win) |
| 47 | UX-15 | Poppins sem fallback | Frontend | Baixo | 1 | P3 (quick win) |
| 48 | SYS-15 | pnpm vs npm no CI | Sistema | Baixo | 2–4 | P3 (junto SYS-02) |
| 49 | SYS-14 | Alias `@assets` quebrado | Sistema | Baixo | 1 | P3 |
| 50 | SYS-16 | `.env.example` poluído | Sistema | Baixo | 1–2 | P3 |
| 51 | SYS-17 | Log "S3" enganoso | Sistema | Baixo | 1 | P3 |
| 52 | SYS-18 | Cron sem retry/observabilidade (genérico) | Sistema | Baixo | 4–6 | P3 |
| 53 | SYS-20 | Higiene PDF (SSRF refutado) | Sistema | Baixo | 2–4 | P3 |
| 54 | SYS-24 | LLM/IA não auditada | Sistema | Baixo | 4–8 | P3 |
| 55 | DB-13 | Tipos temporais inconsistentes | Database | Baixo | 12–20 | P3 |
| 56 | DB-15 | `fuel_records` larga | Database | Baixo | 16–24 | P3 |
| 57 | UX-09 | Dark mode dormente | Frontend | Baixo | 4–8 | P3 |
| 58 | UX-10 | Páginas monolíticas | Frontend | Baixo | 24–40 | P3 (oportunista) |

> DB-04, DB-05 aparecem consolidados em SYS-01/SYS-05. DB-14, DB-16 folded em DB-09/DB-02. Linhas de execução independentes ≈ 58.

---

## Plano de Resolução por Fases

Respeita as dependências técnicas identificadas por todos os especialistas: **CI habilita verificação → baseline de migrations habilita DDL → transações/auditoria habilitam integridade → UX crítico → otimização**.

### Fase 0 — CI + Emergência de Segurança
**Objetivo:** tornar todo o resto verificável e estancar risco ativo. **Nada aqui espera.**

1. **SYS-02 (#0)** — habilitar CI: `vitest run` + `tsc --noEmit` + `build` + migrations em banco efêmero; job **falha** se qualquer etapa falhar. Corrige SYS-15 (pnpm/npm) junto. *(6–10h)*
2. Ligar/escrever **testes de caracterização** dos caminhos financeiros já existentes em disco (webhook, pagamento, overdue) **antes** de tocá-los.
3. **Janela de emergência em paralelo:** E-1 (DB-02+DB-16), E-2 (SYS-22 — excluir `.env`/OAuth do backup, criptografar, auditar backups já gerados), E-3 (SYS-05≡DB-05 — extrair + **rotacionar** chave Asaas), E-4 (DB-21 — recriar auditoria de webhook).

**Gate de saída:** CI verde bloqueando merges; segredos fora do banco e rotacionados; nenhuma interpolação de `client_email` em `sql.raw()`; auditoria de pagamento gravando.

### Fase 1 — Fundação de Dados e Integridade Financeira
**Objetivo:** base íntegra e atômica. **Bloqueio de planejamento a resolver primeiro:** confirmar suporte a FK do TiDB (`SELECT VERSION()`) — decide se DB-01 é DDL nativa ou integridade aplicacional.

1. **SYS-01≡DB-04** — reconciliar baseline de migrations via `mysqldump --no-data` (**enabler de toda DDL subsequente**).
2. **DB-18** — `createPool` + passar `schema` (facilitador que tira o time do `sql.raw`).
3. **Workstream integridade financeira (R-2):** DB-17 (transações) → SYS-19 (webhook transacional + idempotency-key + parar de responder 200 antecipado) → SYS-23 (cron overdue transacional + fuso + alerta) → DB-22 (SQLi cron despesas).
4. **Workstream identidade (R-1):** DB-03 + SYS-12 (centralizar authz/scoping) → dedup + DB-09 (UNIQUE) → DB-20 (collation) → DB-01 (FK ou integridade aplicacional, conforme gate TiDB).
5. **Quick wins de performance:** DB-07 (1–2h) + DB-06 (índices).
6. SYS-04 (unificar Asaas) + SYS-06 (limpar deps).

### Fase 2 — Correções Críticas de UX
**Objetivo:** eliminar falhas invisíveis ao usuário e barreiras de acessibilidade (workstream R-5 no frontend).

1. **UX-02** — padrão único de estados de query (`QueryBoundary`/`useQueryState`; `WeatherWidget` como referência); banir `trpc as any` e `|| {data:[]}` via lint. Alimenta UX-03 e UX-12 no mesmo movimento.
2. **UX-01** — `useConfirm()` + `AlertDialog` para as 29 confirmações destrutivas (priorizar backup/restore, exclusões).
3. **UX-08** — a11y: overlay mobile via `ui/sheet`/`ui/drawer` (Radix) + `aria-label` em icon buttons.
4. **UX-16** — bloquear submissão de vistoria em falha de upload crítico.
5. **UX-17** — guarda de rota por papel (defesa em profundidade, espelha DB-03).
6. **SYS-07** — cobertura E2E dos 4 fluxos priorizados (PIX Asaas → reserva → vistoria → abastecimento), **após** decompor páginas (UX-10) para evitar testes frágeis.

### Fase 3 — Otimização / Débito Restante
**Objetivo:** manutenibilidade e higiene, oportunista.

- **Estrutural incremental:** SYS-03 (decompor `routers.ts`), UX-10 (decompor páginas — **oportunisticamente** ao tocar cada arquivo para UX-03/07/13), UX-04 (`AppShell` unificado + UX-05).
- **Consolidação de integração:** SYS-09 (email), SYS-10/SYS-11 (PDF + SQL cru), SYS-21, SYS-13.
- **Modelagem:** DB-19, DB-12, DB-11, DB-08, DB-10, DB-13, DB-15.
- **Quick wins soltos:** UX-11, UX-14, UX-15, SYS-14, SYS-16, SYS-17.
- **Backlog "não auditado":** SYS-20, SYS-24, SYS-18, UX-09 (só antes de habilitar dark mode).

---

## Riscos e Mitigações

| Risco de execução | Mitigação |
|-------------------|-----------|
| **Refatorar caminho financeiro sem rede** | SYS-02 primeiro, sempre. Testes de caracterização antes de tocar webhook/pagamento/overdue. |
| **DDL sobre schema com drift** | DB-04 (reconciliar baseline via `mysqldump --no-data`) precede qualquer FK/índice/UNIQUE. |
| **Estimar DB-01 sem saber o provider** | Gate: `SELECT VERSION()`. TiDB confirmado (7b) → provavelmente sem FK nativa → integridade aplicacional + jobs de reconciliação (menos DDL, mais app). |
| **Criar UNIQUE sobre duplicatas existentes** | DB-09 exige auditoria/dedup de `users.email/open_id`, `allowed_clients.email`, `employees.email` **antes** do DDL. |
| **Restore destrutivo sobre baseline divergente** | SYS-22 + R-3: restore só sobre baseline reconhecido; `backup_history` fora do DB gerenciado (Constituição AIOX). |
| **Chave Asaas já vazada em backups** | Rotacionar (assumir comprometida) + revisar todos os backups já gerados por SYS-22. |
| **Corrigir DB-02 isolado não fecha R-1** | Enquanto email for mutável + não-único + collation incerta, o risco de identidade persiste. Tratar R-1 como workstream, não como débito solto. |
| **Testes de página frágeis pré-decomposição** | Escrever E2E de fluxo (SYS-07) só após UX-10 decompor as páginas monolíticas. |

---

## Critérios de Sucesso

Métricas/testes por débito crítico e alto (puxados dos "Testes Requeridos" do @qa). Um débito só é "resolvido" quando o teste correspondente passa **no CI**.

| Débito | Critério de sucesso / teste | Tipo |
|--------|------------------------------|------|
| **SYS-02** | Pipeline roda `vitest run` + `tsc --noEmit` + `build` + migrations efêmeras e **falha** o job se qualquer etapa falhar; os 83 testes existentes executam. | CI (meta-gate) |
| **DB-02 (+DB-16)** | Para cada uma das 6 interpolações: email = `x' OR '1'='1`/`x'; DROP…`/unicode → query retorna **só** dados do dono, zero vazamento cross-cliente. | Segurança / Integração |
| **SYS-22** | Backup gerado **não contém** `.env`/tokens OAuth; artefato criptografado; URL de download assinada/efêmera; scan de backups antigos concluído. | Segurança |
| **SYS-05≡DB-05** | `asaas_api_key` **não** é lida de `system_settings` (lint/scan); leitura vem de env; scan de segredos na tabela retorna vazio; chave rotacionada. | Segurança / Estático |
| **DB-21** | `webhook_logs` (ou equivalente) grava cada evento; `INSERT` de `index.ts:369` alinhado ao schema; retenção definida (ex.: TTL 90d); zero falhas silenciosas de insert. | Integração |
| **SYS-01≡DB-04** | `drizzle-kit migrate` em banco **vazio** aplica journal completo sem erro (pega `0062` duplicado); schema resultante bate com `mysqldump --no-data` de prod. | Migration / CI |
| **DB-17 / SYS-19 (R-2)** | Falha simulada no meio de criar-cobrança→sync→update → **rollback total** (zero estado parcial); reenvio do **mesmo** webhook 2x → baixa única; assinatura inválida → rejeição; erro de processamento **não** responde 200 antecipado. | Integração |
| **SYS-23** | `updateOverdueStatus` com falha simulada → **alerta emitido** e status não corrompido; idempotência do job; fronteira de vencido em `America/Sao_Paulo`. | Integração |
| **DB-22** | `tx.description`/`tx.id` com aspas/payload malicioso → bind param, sem interpolação; teste de injeção verde. | Segurança |
| **DB-03 / UX-17 (R-6)** | Matriz de authz: cada mutation (`delete`/`markAsPaid`/`generatePayment`) como anônimo/cliente/employee/admin → negação onde devido; guarda de rota no frontend por papel. | Integração + E2E |
| **DB-01** | Inserir órfão → rejeição (FK ou lógica app); delete pai → `ON DELETE` esperado; job de reconciliação encontra 0 órfãos em baseline limpo. | Integração / Migration |
| **DB-09** | Inserir email/open_id duplicado → rejeição; pré-migração reporta duplicatas existentes. | Integração / Migration |
| **DB-06/DB-07** | `EXPLAIN` das queries quentes (portal por `client_email`) usa índice, não full scan. | Performance |
| **DB-19** | Property test int-centavos ↔ `decimal`; relatório consolidado (combustível int × cobrança decimal) bate ao centavo. | Unit |
| **UX-02 / R-5** | Query que falha renderiza estado de **erro** (não lista vazia) + "tentar novamente"; distingue erro de vazio-sucesso. | Componente (Vitest+RTL) |
| **UX-01** | `useConfirm()` abre `AlertDialog` acessível; ações destrutivas exigem confirmação; foco preso + `Esc`. | Componente / a11y |
| **UX-08** | axe: overlay mobile operável por teclado (`role`/`Esc`/foco); icon buttons têm nome acessível; WCAG 2.1.1/4.1.2 verdes. | a11y automatizado |
| **UX-16** | Falha de upload de foto **bloqueia** submissão ou marca registro como pendente; não submete em silêncio. | Componente / Integração |
| **SYS-07** | Cobertura E2E dos 4 fluxos (PIX Asaas, reserva, vistoria c/ upload, abastecimento), pós-decomposição. | E2E (Playwright) |
| **SYS-21** | Nome de cliente com HTML/`\r\n` → escapado no corpo/header do email; falha SMTP em fluxo crítico → alerta, não silêncio. | Segurança / Integração |

---

*Fim do Technical Debt Assessment FINAL (Fase 8). Gate QA: converte para **APPROVED** com os 4 itens do parecer incorporados (débitos de integração adicionados, 2 confirmações fechadas, SYS-02 como #0, R-1..R-6 como workstreams). Handoff para @pm (Fase 9/10) — relatório executivo + epics/stories de remediação, começando pela Fase 0.*
</content>
</invoke>

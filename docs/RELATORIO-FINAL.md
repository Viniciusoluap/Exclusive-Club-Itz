# Relatório Final — Auditoria de Débito Técnico
## exclusive-club-reservas

> Auditoria completa (Brownfield Discovery, 10 fases + rodada de cobertura de gaps) — **2026-07-18**.
> Método: **100% somente-leitura**. Nenhum arquivo de código foi alterado, nenhuma migration aplicada, nenhum commit/push realizado.
> Este documento consolida os 9 artefatos gerados no processo em um único relatório de leitura — **você não precisa abrir nenhum outro arquivo** para entender o panorama completo.

> **⚠️ Natureza desta entrega:** este é o produto final de uma auditoria **exclusivamente de análise**. **Nenhuma correção foi aplicada. Tudo aqui é diagnóstico e recomendação — todo o trabalho de remediação aguarda autorização explícita do responsável pelo projeto.**

---

## Índice

1. [Resumo Executivo](#1-resumo-executivo)
2. [Custos e ROI](#2-custos-e-roi)
3. [Visão Geral do Sistema](#3-visão-geral-do-sistema)
4. [⚠️ Janela de Emergência — Ação Imediata Recomendada](#4-️-janela-de-emergência--ação-imediata-recomendada)
5. [Inventário Completo de Débitos (61 itens)](#5-inventário-completo-de-débitos-61-itens)
6. [Riscos Cruzados (R-1 a R-6)](#6-riscos-cruzados-r-1-a-r-6)
7. [Plano de Resolução em Fases](#7-plano-de-resolução-em-fases)
8. [Backlog Proposto (43 Stories)](#8-backlog-proposto-43-stories)
9. [Metodologia e Rastreabilidade](#9-metodologia-e-rastreabilidade)
10. [Próximos Passos](#10-próximos-passos)

---

## 1. Resumo Executivo

A plataforma que administra o clube — reservas de embarcações (lanchas/jet skis), cotas por sócio, controle de combustível/estoque, vistorias e **cobranças financeiras via Asaas** — está **funcional**, mas foi construída sem uma "rede de segurança" de engenharia. Uma auditoria técnica completa, feita **sem alterar nada**, mapeou **61 pontos de fragilidade**.

A maioria é higiene e manutenção (não urgente). Mas **3 deles são críticos e representam risco ATIVO — não teórico** — envolvendo dinheiro, dados dos sócios e a chave da conta de pagamentos do clube.

### Números-chave

| Métrica | Valor |
|---------|-------|
| Pontos de fragilidade catalogados | **61** |
| 🔴 Críticos (risco ativo) | **3** (SYS-22, DB-02, SYS-02) |
| 🟠 Altos | **14** |
| 🟡 Médios | **26** |
| ⚪ Baixos | **18** |
| Esforço total de resolução | **~650 horas** (faixa 600–700h) |
| Custo total (R$ 150/h) | **~R$ 97.500** (faixa R$ 90k–105k) |
| **Custo da Janela de Emergência** | **~R$ 9.300** (46–78h) |
| Prazo da Emergência | **dias, não semanas** |

### O ponto mais grave (não é hipótese — provavelmente já está acontecendo)

O sistema gera **backups que empacotam, num único ZIP e sem qualquer criptografia**, a chave da conta Asaas do clube, tokens de acesso OAuth e um dump com dados pessoais de **todos** os sócios (`server/backup.ts:69-79`). Se qualquer backup já gerado vazar (e-mail, pen drive, pasta compartilhada, storage mal configurado), quem o obtiver tem acesso direto à conta de cobranças e à base de sócios. Por isso a recomendação é tratar a chave de pagamento como **já comprometida** e rotacioná-la imediatamente.

Somam-se a isso:
- **Vazamento entre sócios (DB-02):** uma falha de "injeção de SQL de 2ª ordem" em 6 pontos do código permite que um sócio, usando o próprio cadastro legítimo, **veja ou altere dados de reservas e financeiros de outros sócios**.
- **Cegueira financeira (DB-21):** a trilha de auditoria de cobranças foi apagada do banco. Hoje **é impossível provar** o que ocorreu numa cobrança contestada — corrupção financeira não é sequer detectável.

Nenhum desses problemas aparece na tela; todos operam **em silêncio**.

### Recomendação

**Autorizar imediatamente a "Janela de Emergência" (4 ações, ~R$ 9.300, poucos dias de trabalho), independentemente de qualquer decisão sobre o resto do programa.** Esses quatro itens estancam a exposição da chave de pagamento, o vazamento entre sócios e a falta de auditoria financeira. Custam **menos de 10% do orçamento total** e removem quase todo o risco de um incidente reputacional/financeiro grave. O restante da modernização (Fases 1–3) pode ser decidido depois, com calma.

> **Nível de confiança:** ALTO para a existência e severidade dos 3 críticos (confirmados por código, com linhas específicas citadas). MÉDIO para os valores monetários de "custo de não resolver" (estimativas de ordem de grandeza, não cotações). As horas de resolução são faixas conservadoras (±15%).

---

## 2. Custos e ROI

> **Premissa de custo (ajustável):** todos os valores usam **R$ 150/hora** como taxa base de dev sênior. Se a sua taxa for outra, multiplique as horas. Reais calculados sobre o ponto médio de cada faixa.

### Custo de RESOLVER — por fase

| Fase | Escopo | Horas | Custo (R$ 150/h) |
|------|--------|------:|-----------------:|
| **Fase 0 — Emergência + CI** | Estancar risco ativo + tornar o resto verificável | ~62h | **~R$ 9.300** |
| **Fase 1 — Fundação de Dados** | Integridade financeira, transações, isolamento entre sócios | ~145h | ~R$ 21.750 |
| **Fase 2 — UX Crítico** | Eliminar falhas silenciosas e barreiras de acessibilidade | ~91h | ~R$ 13.650 |
| **Fase 3 — Otimização** | Manutenibilidade, higiene, débito restante (oportunista) | ~352h | ~R$ 52.800 |
| **TOTAL** | Programa completo | **~650h** | **~R$ 97.500** |

> **Leitura de negócio:** ~54% do orçamento (Fase 3) é melhoria de manutenção diluível no tempo. O que **realmente protege o clube** — Fases 0 e 1 — soma **~R$ 31.000** e resolve **todos** os riscos de segurança e financeiros.

### Custo de NÃO RESOLVER (risco acumulado)

| Risco | Probabilidade | Impacto | Custo potencial |
|-------|--------------|---------|-----------------|
| **Vazamento da chave Asaas via backup sem cripto** (SYS-22) | **Alta** — já empacota a chave + PII hoje | Conta de cobranças comprometida; cobranças fraudulentas; PII de todos os sócios (LGPD) | **R$ 50.000 – R$ 500.000+** |
| **Sócio acessa/altera dados de outros** (DB-02) | **Média-Alta** — em 6 pontos, explorável por qualquer sócio | Quebra de confidencialidade num clube exclusivo; adulteração de valores; perda de confiança | **R$ 30.000 – R$ 200.000+** |
| **Impossível auditar cobranças** (DB-21) | **Certa** — a trilha não existe | Contestação vira "palavra contra palavra"; corrupção não detectável | **R$ 10.000 – R$ 80.000+** |
| **Corrupção silenciosa de cobrança** (SYS-19: webhook responde "OK" antes de processar) | **Média** — a cada falha transitória de rede | Sócio paga mas consta como devedor (ou o inverso) | **R$ 5.000 – R$ 40.000+** |

> **Comparação direta:** o cenário **mais provável e mais barato de ocorrer** (vazamento de um backup) já supera, sozinho, o custo de **todo** o programa. A emergência custa **~R$ 9.300**; um único incidente de vazamento de dados de sócios de um clube exclusivo custa facilmente **5 a 50 vezes isso** — sem contar o dano reputacional, o ativo mais difícil de recuperar num clube de membros selecionados.

### ROI da Resolução

| Investimento | Custo | O que compra |
|--------------|------:|--------------|
| **Só a Emergência (Fase 0)** | **~R$ 9.300** | Remove ~90% do risco de incidente grave |
| **Emergência + Fundação (Fases 0+1)** | **~R$ 31.000** | Sistema financeiro íntegro e seguro; base sólida |
| **Programa completo (Fases 0–3)** | **~R$ 97.500** | Acima + UX polida + código sustentável |

**ROI da Emergência ≈ 5x a 50x** apenas na Fase 0: investe-se ~R$ 9.300 para evitar um custo conservador de R$ 50.000+ num incidente de **probabilidade alta**. Para um clube exclusivo, é essencialmente **um seguro barato contra um prejuízo desproporcional**.

---

## 3. Visão Geral do Sistema

**Domínio de negócio:** gestão de um clube de embarcações — reservas de lanchas/jet skis, cotas por cliente, controle de combustível/estoque de galões, vistorias, manutenções, cobranças de danos, mensalidades e pagamentos via **Asaas** (gateway PIX/boleto).

### Stack tecnológico (confirmada por código)

| Camada | Tecnologia | Observação |
|--------|-----------|-----------|
| Runtime | Node.js 22 (CI) / 18+ | ESM puro |
| Package manager | pnpm 10.33.4 declarado | **CI usa `npm --legacy-peer-deps`** — inconsistente (SYS-15) |
| Linguagem | TypeScript 5.9.3 | `strict: true`; testes excluídos do typecheck |
| Frontend | React 19.1.1 + Vite 7 | Wouter (router), TanStack Query 5, Radix UI + Tailwind 4, ~53 primitivos shadcn |
| RPC | tRPC 11.6.0 | client + server + react-query |
| Servidor | Express 4.21.2 | núcleo em `server/_core/` |
| ORM | Drizzle 0.44.5 | **dialeto MySQL** (`drizzle-orm/mysql2`) |
| Banco | **TiDB Cloud** (MySQL-compatível) | **NÃO é Postgres** (briefing inicial estava errado). SSL + comentário explícito em `server/databaseBackup.ts:34-36` |
| Auth | OAuth Manus + JWT (`jose`) | modelo de papéis admin/employee/client |
| Testes | Vitest 2.1.4 | **83 arquivos `*.test.ts` que existem em disco e nunca rodam** |

**Implicação de plataforma (TiDB):** FK/trigger/CHECK nativos são provavelmente indisponíveis/limitados → a integridade referencial migra para a camada de aplicação (afeta DB-01/DB-08/DB-12). Autorização é **100% na camada tRPC** — não há RLS nativo.

### Arquitetura e domínio de dados

- **Backend:** Express + tRPC. `routers.ts` é um **monólito de 5.784 linhas** com ~18 sub-routers inline (SYS-03); 7 outros foram extraídos para `server/routers/` sem critério claro. `db.ts` mistura query-builder tipado **e SQL cru** (`sql.raw`) com mapeamento manual — quebrando a type-safety em caminhos críticos (relatórios, combustível, webhook Asaas).
- **Banco:** **21 tabelas**, domínios clientes/cotas, reservas, frota, vistorias, combustível, financeiro/BPO, operação/sistema. Integridade praticamente ausente: **apenas 1 foreign key em todo o banco** (`fuel_purchases.purchased_by → users.id`), **1 UNIQUE real** (`bpo_charges.asaas_charge_id`), **zero CHECK constraints**. Identidade de sócio apoiada em **email mutável e não-único** — raiz do risco mestre R-1.
- **Frontend:** ~24 rotas em router único sem lazy-loading; autorização vive dentro dos layouts, não em guarda de rota. Boa fundação de design tokens (oklch, paleta marítima) mas com padrões duplicados (3 navegações, 2 tabelas, 2 confirmações, 112 spinners inline) e falhas silenciosas de erro de query.
- **Integrações externas de maior acoplamento:** Asaas (config triplicada, webhook no bootstrap HTTP), storage via proxy Forge da Manus (logs enganosos dizem "S3"), email fragmentado em 6+ módulos, PDF em 5 libs simultâneas, backup via Google Drive.

**Positivos observados:** segurança de infra recente aplicada (`helmet`, `express-rate-limit`, whitelist de mimetype de upload); segredos não-hardcoded no código; `downloadBackupRoute.ts:15-22` tem gate de admin real; toasts (`sonner`) e `ErrorBoundary` consistentes no frontend.

---

## 4. ⚠️ Janela de Emergência — Ação Imediata Recomendada

Estes itens representam **risco ativo** — exposição de segredo, vazamento cross-cliente e corrupção/perda de dados financeiros. Podem e devem começar **em paralelo à Fase 0**, sem esperar o restante do programa. QA e addendum confirmam: "nada bloqueia iniciar a remediação de emergência".

| Prio. | Débito | Sev. | Risco ativo | Ação imediata | Horas |
|-------|--------|------|-------------|---------------|-------|
| 🔴 **E-1** | **DB-02 (+DB-16)** — `sql.raw()` injeção 2ª ordem via `client_email` mutável | Crítico | Vazamento/alteração cross-cliente (6 interpolações confirmadas) | Erradicar as 6 interpolações de `client_email` + a de `input.reason`; usar bind params/query builder tipado | 16–24 |
| 🔴 **E-2** | **SYS-22** — backup empacota `.env` + OAuth + PII sem cripto (`backup.ts:69-79`) | Crítico | Exfiltração de segredo + PII num ZIP publicável | Excluir `.env`/tokens do `archive.glob`; criptografar; **auditar backups já gerados**; assinar/expirar URL de download | 12–20 |
| 🔴 **E-3** | **SYS-05 ≡ DB-05** — chave Asaas em `system_settings` (texto plano) | Alto | Segredo legível por qualquer admin/script com `DATABASE_URL` | Extrair para env/secret manager + **rotacionar a chave** (assumir comprometida) | 4–8 |
| 🟠 **E-4** | **DB-21** — `webhook_logs` dropada, zero auditoria de pagamento | Alto | Corrupção financeira **não é sequer detectável forense** | Recriar tabela de auditoria alinhada ao schema; corrigir o `INSERT` incompatível de `index.ts:369` (falha 100% em silêncio hoje) | 8–16 |

> **Pré-requisito estrutural (item #0):** **SYS-02 (habilitar CI + rodar os 83 testes existentes, 6–10h)**. A emergência pode começar em paralelo, mas só se torna **verificável** após o CI. Corrigir caminhos financeiros sem CI é "mudança às cegas".

> **Contenção de segredo:** ao rotacionar a chave Asaas (E-3), tratar como comprometida — revisar **todo** backup já gerado por SYS-22, pois podem conter `.env` com a chave antiga. Estes quatro itens são a interseção dos riscos cruzados **R-1, R-2 e R-4**.

**Confirmações fechadas com evidência de código (Fase 7b):**
- `webhook_logs` **NÃO existe** — criada em `0032`, dropada em `0033_good_lila_cheney.sql:5`, nunca recriada, ausente de `schema.ts` (dispara DB-21).
- Provider é **TiDB Cloud** — confirma o gate de FK de DB-01.
- **Refutação (No Invention):** o risco de SSRF/HTML-injection em `htmlToPdf` **não se aplica** — o renderer é PDFKit (estrutura tipada), sem HTML/browser/fetch remoto. Rebaixado a SYS-20 (Baixo). O inventário não foi inflado com risco inexistente.

---

## 5. Inventário Completo de Débitos (61 itens)

63 IDs distintos → **61 débitos** após 2 merges exatos (SYS-01≡DB-04; SYS-05≡DB-05). DB-14 e DB-16 permanecem no inventário por rastreabilidade, mas são *folded* em execução (remediados junto de DB-09 e DB-02, sem esforço próprio). **Severidade:** 🔴 Crítico 3 · 🟠 Alto 14 · 🟡 Médio 26 · ⚪ Baixo 18.

### Sistema (24 itens — validado por @architect)

| ID | Débito | Área | Severidade | Horas | Fase |
|----|--------|------|-----------|-------|------|
| SYS-01 ≡ DB-04 | Migrations numeração duplicada / drift (`0002/0003/0004/0062`) | Sist/DB | 🟠 Alto | 4–8 | 1 |
| **SYS-02** | **CI não roda testes/lint/build (só `tsc --noEmit`); 83 testes mortos** | Sistema | 🔴 Crítico | 6–10 | **0 (#0)** |
| SYS-03 | `routers.ts` monolítico (5.784 linhas, ~18 sub-routers inline) | Sistema | 🟠 Alto | 40–60 | 3 |
| SYS-04 | Config/lógica Asaas triplicada | Sistema | 🟠 Alto | 8–12 | 1 |
| SYS-05 ≡ DB-05 | Chave Asaas persistida em `system_settings` (texto plano) | Sist/DB | 🟠 Alto | 4–8 | **0 (E-3)** |
| SYS-06 | Dependências mortas/redundantes (AWS-SDK não usado, `add`, patch órfão) | Sistema | 🟠 Alto | 4–8 | 1 |
| SYS-07 | Zero testes de frontend | Sistema | 🟠 Alto | 24–40 | 2 |
| SYS-08 | Sprawl de docs/scripts órfãos na raiz (~29 md + ~25 scripts) | Sistema | 🟡 Médio | 6–10 | 3 |
| SYS-09 | Camada de email fragmentada (6+ módulos) | Sistema | 🟡 Médio | 12–20 | 3 |
| SYS-10 | Geração de PDF fragmentada (5 libs) | Sistema | 🟡 Médio | 16–24 | 3 |
| SYS-11 | ORM tipado + SQL cru com mapeamento manual | Sistema | 🟡 Médio | 16–24 | 3 |
| SYS-12 | `adminProcedure` duplicado (auth em 2 lugares) | Sistema | 🟡 Médio | 3–5 | 1 |
| SYS-13 | Recursão sem guarda + N+1 em `db.ts` | Sistema | 🟡 Médio | 8–16 | 3 |
| SYS-14 | Alias `@assets`/`attached_assets` quebrado | Sistema | ⚪ Baixo | 1 | 3 |
| SYS-15 | Inconsistência pnpm (projeto) vs npm (CI) | Sistema | ⚪ Baixo | 2–4 | 0 |
| SYS-16 | `.env.example` poluído com vars de tooling AIOX | Sistema | ⚪ Baixo | 1–2 | 3 |
| SYS-17 | Logs dizem "S3" mas usam proxy Forge | Sistema | ⚪ Baixo | 1 | 3 |
| SYS-18 | Cron via `import().then()` sem retry/observabilidade | Sistema | ⚪ Baixo | 4–6 | 3 |
| **SYS-19** | **Webhook Asaas: sem transação, responde `200` antes de processar, sem idempotency-key** | Sistema | 🟠 Alto | 16–24 | 1 |
| SYS-20 | Higiene de geração de PDF (*SSRF refutado — PDFKit*) | Sistema | ⚪ Baixo | 2–4 | 3 |
| SYS-21 | Email: injeção HTML/template + falha SMTP silenciosa | Sistema | 🟡 Médio | 6–10 | 3 |
| **SYS-22** | **Backup empacota segredos + PII sem cripto; DR não auditado** | Sistema | 🔴 Crítico | 12–20 | **0 (E-2)** |
| SYS-23 | Cron `updateOverdueStatus` — 3 UPDATEs não transacionais, falha silenciosa, bug fuso UTC | Sistema | 🟡 Médio | 4–8 | 1 |
| SYS-24 | Integração LLM/IA não auditada (custo, PII a provedor, prompt-injection) | Sistema | ⚪ Baixo | 4–8 | 3 |

### Database (20 itens — validado por @data-engineer)

| ID | Débito | Área | Severidade | Horas | Fase |
|----|--------|------|-----------|-------|------|
| DB-01 | Ausência de foreign keys (1 FK em 21 tabelas) | Database | 🟠 Alto | 16–40 | 1 |
| **DB-02 (+DB-16)** | **`sql.raw()` c/ interpolação (injeção 2ª ordem via email mutável)** | Database | 🔴 Crítico | 16–24 | **0 (E-1)** |
| DB-03 | Autorização inline em `publicProcedure` (40 usos, ~33 checagens de role) | Database | 🟠 Alto | 16–24 | 1 |
| DB-06 | Índices faltando em colunas quentes de join/filtro | Database | 🟡 Médio | 6–10 | 1 |
| DB-07 | `bpo_charges` sem índice em `client_email` (full scan no portal) | Database | 🟡 Médio | 1–2 | 1 |
| DB-08 | Zero CHECK constraints (verificar suporte TiDB) | Database | 🟡 Médio | 4–8 | 3 |
| DB-09 (+DB-14) | UNIQUE ausente em chaves naturais (email/open_id) | Database | 🟡 Médio | 4–8 | 1 |
| DB-10 | Scripts ad-hoc com acesso direto a produção (~25) | Database | 🟡 Médio | 8–12 | 3 |
| DB-11 | `employees.vessel_ids` como CSV/JSON em text | Database | 🟡 Médio | 8–12 | 3 |
| DB-12 | Desnormalização ampla sem sincronização | Database | 🟡 Médio | 8–16 | 3 |
| DB-13 | Tipos temporais inconsistentes entre tabelas | Database | ⚪ Baixo | 12–20 | 3 |
| DB-14 | *(folded em DB-09)* Índice `*_unique` sem ser UNIQUE (nome enganoso) | Database | ⚪ Baixo | — | 1 |
| DB-15 | `fuel_records` tabela muito larga (~40 colunas) | Database | ⚪ Baixo | 16–24 | 3 |
| DB-16 | *(folded em DB-02)* Escape manual de aspas em SQL (`input.reason`) | Database | ⚪ Baixo | — | 0 |
| **DB-17** | **Zero transações no backend (fluxos financeiros multi-escrita não atômicos)** | Database | 🟠 Alto | 12–20 | 1 |
| DB-18 | Conexão única sem pool nem reconnect; sem `schema` (empurra p/ `sql.raw`) | Database | 🟡 Médio | 3–6 | 1 |
| DB-19 | Representação monetária mista (int centavos vs `decimal`) | Database | 🟡 Médio | 8–16 | 3 |
| DB-20 | Sem charset/collation explícito (risco no join por `client_email`) | Database | ⚪ Baixo | 2–6 | 1 |
| **DB-21** | **`webhook_logs` dropada — auditoria de pagamento inexistente** | Database | 🟠 Alto | 8–16 | **0 (E-4)** |
| DB-22 | SQLi de 2ª ordem no cron de despesas (`cronJobs.ts` interpola dados da API Asaas) | Database | 🟡 Médio | 4–8 | 1 |

### Frontend/UX (17 itens — validado por @ux-design-expert)

| ID | Débito | Área | Severidade | Horas | Fase |
|----|--------|------|-----------|-------|------|
| UX-01 | Confirmações nativas `window.confirm`/`alert` (29 usos em ações destrutivas) | Frontend | 🟠 Alto | 8–12 | 2 |
| UX-02 | Erros de query mascarados (`\|\| {data:[]}` + `trpc as any`) | Frontend | 🟠 Alto | 14–20 | 2 |
| UX-03 | Loading sem padrão único (112 spinners inline; `ui/spinner` usado 0x) | Frontend | 🟡 Médio | 12–18 | 3 |
| UX-04 | Layouts duplicados (`Dashboard`/`EmployeeDashboard` + `MobileMenu`) | Frontend | 🟡 Médio | 14–22 | 3 |
| UX-05 | Menu placeholder de scaffolding em produção ("Page 1/2") | Frontend | 🟡 Médio | 1–2 | 3 |
| UX-06 | Cores/estilos hardcoded fora dos tokens (`ManusDialog`, 22 ocorrências) | Frontend | 🟡 Médio | 6–10 | 3 |
| UX-07 | Dois padrões de tabela (`<table>` cru vs `ui/table`) | Frontend | 🟡 Médio | 8–12 | 3 |
| **UX-08** | **a11y: icon buttons sem `aria-label` + overlay mobile sem teclado (WCAG 2.1.1/4.1.2)** | Frontend | 🟠 Alto | 10–16 | 2 |
| UX-09 | Dark mode inconsistente/quebrável (dormente — tema fixo `light`) | Frontend | ⚪ Baixo | 4–8 | 3 |
| UX-10 | Páginas monolíticas (Saas 3274, Admin 2236, Abastecimento 1804) | Frontend | ⚪ Baixo | 24–40 | 3 |
| UX-11 | Código morto de UI (`ReservasAntigo`, `ComponentShowcase`, `admin/Pagamentos`) | Frontend | ⚪ Baixo | 2–4 | 3 |
| UX-12 | Empty states desiguais (~21 telas ad-hoc) | Frontend | ⚪ Baixo | 6–10 | 3 |
| UX-13 | Sem lazy-loading / code-splitting de rotas | Frontend | 🟡 Médio | 6–10 | 3 |
| UX-14 | Redirect via efeito colateral em render (`/admin/pagamentos`) | Frontend | ⚪ Baixo | 1 | 3 |
| UX-15 | Fonte Poppins sem fallback garantido | Frontend | ⚪ Baixo | 1 | 3 |
| **UX-16** | **Falha parcial de upload de vistoria prossegue silenciosamente (submete sem a foto)** | Frontend | 🟡 Médio | 6–10 | 2 |
| UX-17 | Autorização de UI depende do layout, não de guarda de rota (espelha DB-03) | Frontend | 🟡 Médio | 8–14 | 2 |

> **Notas de contagem:** 24 (Sistema) + 20 (Database) + 17 (Frontend) = **61 débitos**. Linhas de execução independentes ≈ 58–59 (DB-14/DB-16 folded; SYS-01≡DB-04 e SYS-05≡DB-05 mesclados). Esforço dominado por SYS-03 (~50h), SYS-07 (~32h), UX-10 (~32h), DB-01 (~28h).

---

## 6. Riscos Cruzados (R-1 a R-6)

Cada risco **conecta múltiplos débitos** e é um **workstream**, não um item de lista. Corrigir débitos isolados dentro de um risco **não fecha o risco**. Reavaliados contra o código na Fase 7b.

| Risco | Áreas | Débitos combinados | Mitigação (workstream) |
|-------|-------|--------------------|------------------------|
| **R-1 — Identidade sobre email mutável** *(risco mestre)* | Dados + Segurança + Frontend | DB-02, DB-03, DB-09, DB-20, UX-17, SYS-12 | Workstream "identidade e isolamento por dono": email UNIQUE após dedup; erradicar `sql.raw()` no scoping; fixar `utf8mb4`+collation no join de email; centralizar scoping num helper; travar mutação de email ou re-verificar authz. **Evidência (7b):** `cronJobs.ts:62-64` usa `email.toLowerCase()` como chave de `Map` → dois clientes com mesmo email, um **sobrescreve o outro** → cobrança ao cliente errado. |
| **R-2 — Corrupção silenciosa de dados financeiros** | Dados + Sistema + Integração | DB-17, DB-01, DB-12, DB-19, DB-21, SYS-19, SYS-23 | Envolver cobrança/pagamento/sync em `db.transaction()`; idempotency-key no webhook; padronizar tipo monetário; job de reconciliação auditável. **Pior que o estimado:** SYS-19 responde `200` antes de processar → erro transitório = perda permanente; sem DB-21 (auditoria), a corrupção não é detectável. **DB-21 é pré-requisito de observabilidade.** |
| **R-3 — Deploy em ambiente novo quebra** | Dados + Sistema + CI | SYS-01/DB-04, SYS-02, SYS-22 | DB-04 é enabler (reconciliar baseline via `mysqldump --no-data` antes de qualquer DDL); CI roda migrations em banco efêmero. **Agravante:** `databaseBackup.ts:65` gera `DROP TABLE` universal + `0033` dropa PKs/UNIQUEs de ~15 tabelas → restaurar sobre schema divergente = destruição. |
| **R-4 — Exfiltração de segredo de pagamento** | Dados + Sistema + Segurança | DB-05/SYS-05, DB-10, SYS-08, **SYS-22** | Extrair segredo para secret manager + rotacionar + consolidar/gate os scripts. **Ampliado:** não é só "25 scripts leem a chave" — SYS-22 mostra o backup empacotando `.env` + OAuth + PII num ZIP publicável. **Revisar todo backup já gerado.** |
| **R-5 — Família "falha silenciosa" (observabilidade)** | Frontend + Sistema + Integração | UX-02, UX-16, SYS-19, SYS-21, SYS-23, SYS-17, SYS-18, DB-21 | O sistema esconde falha em **todas** as camadas. Padrão único de erro no frontend (`WeatherWidget` como referência), bloqueio de submissão em upload crítico, alertas em cron/SMTP/webhook. **Confirmado em ≥5 superfícies novas.** |
| **R-6 — Autorização sem defesa em profundidade** | Frontend + Dados | UX-17, DB-03 | Frontend **e** backend devem falhar seguro; o tRPC é a fronteira real. **Parcialmente mitigado:** `downloadBackupRoute.ts:15-22` tem gate de admin real (bom exemplo). Ressalva: `res.redirect` p/ URL de storage pode furar o gate se a URL for pública (SYS-22) — garantir URLs assinadas/efêmeras. |

---

## 7. Plano de Resolução em Fases

Respeita as dependências técnicas: **CI habilita verificação → baseline de migrations habilita DDL → transações/auditoria habilitam integridade → UX crítico → otimização.**

### Fase 0 — CI + Emergência de Segurança (~62h · ~R$ 9.300) — *dias, não semanas*
**Objetivo:** tornar todo o resto verificável e estancar risco ativo. **Nada aqui espera.**
1. **SYS-02 (#0)** — habilitar CI: `vitest run` + `tsc --noEmit` + `build` + migrations em banco efêmero; job **falha** se qualquer etapa falhar. Corrige SYS-15 junto.
2. Ligar/escrever **testes de caracterização** dos caminhos financeiros (webhook, pagamento, overdue) **antes** de tocá-los.
3. **Emergência em paralelo:** E-1 (DB-02+DB-16), E-2 (SYS-22), E-3 (SYS-05≡DB-05 — extrair + **rotacionar** chave), E-4 (DB-21 — recriar auditoria).

**Gate de saída:** CI verde bloqueando merges; segredos fora do banco e rotacionados; zero interpolação de `client_email` em `sql.raw()`; auditoria de pagamento gravando.

### Fase 1 — Fundação de Dados e Integridade Financeira (~145h · ~R$ 21.750)
**Bloqueio a resolver primeiro:** confirmar suporte a FK do TiDB (`SELECT VERSION()`) — decide se DB-01 é DDL nativa ou integridade aplicacional.
1. **SYS-01≡DB-04** — reconciliar baseline de migrations via `mysqldump --no-data` (enabler de toda DDL).
2. **DB-18** — `createPool` + passar `schema` (tira o time do `sql.raw`).
3. **Integridade financeira (R-2):** DB-17 → SYS-19 → SYS-23 → DB-22.
4. **Identidade (R-1):** DB-03 + SYS-12 → dedup + DB-09 → DB-20 → DB-01.
5. **Quick wins de performance:** DB-07 (1–2h) + DB-06.
6. SYS-04 (unificar Asaas) + SYS-06 (limpar deps).

### Fase 2 — Correções Críticas de UX (~91h · ~R$ 13.650)
**Objetivo:** eliminar falhas invisíveis e barreiras de acessibilidade (R-5 no frontend).
1. **UX-02** — padrão único de estados de query; banir `trpc as any` e `|| {data:[]}` via lint.
2. **UX-01** — `useConfirm()` + `AlertDialog` para as 29 confirmações destrutivas.
3. **UX-08** — a11y: overlay mobile via `ui/sheet`/`ui/drawer` + `aria-label`.
4. **UX-16** — bloquear submissão de vistoria em falha de upload crítico.
5. **UX-17** — guarda de rota por papel (espelha DB-03).
6. **SYS-07** — cobertura E2E dos 4 fluxos priorizados, **após** decompor páginas (UX-10).

### Fase 3 — Otimização / Débito Restante (~352h · ~R$ 52.800) — *oportunista*
- **Estrutural incremental:** SYS-03 (decompor `routers.ts`), UX-10 (páginas), UX-04+05.
- **Consolidação de integração:** SYS-09, SYS-10/SYS-11, SYS-21, SYS-13.
- **Modelagem:** DB-19, DB-12, DB-11, DB-08, DB-10, DB-13, DB-15.
- **Quick wins soltos:** UX-11, UX-14, UX-15, SYS-14, SYS-16, SYS-17.
- **Backlog "não auditado":** SYS-20, SYS-24, SYS-18, UX-09.

---

## 8. Backlog Proposto (43 Stories)

Consolidação dos 61 débitos em **43 stories agrupadas** (débitos de raiz comum ou muito pequenos agrupados; rastreabilidade preservada na coluna "Débito(s)"). **Todas em status Draft (proposta) — nenhuma validação ou implementação foi acionada.** Numeração completa em `docs/stories/epic-technical-debt.md`.

| # | Story | Débito(s) | Esforço (h) | Fase | Prio. |
|---|-------|-----------|-------------|------|-------|
| 1 | Habilitar CI com testes/lint/build/migrations + alinhar package manager | SYS-02, SYS-15 | 8–14 | 0 | #0 |
| 2 | Erradicar injeção SQL de 2ª ordem via `client_email` (E-1) | DB-02, DB-16 | 16–24 | 0 | P0 |
| 3 | Remover segredos/PII do backup + criptografar + auditar antigos (E-2) | SYS-22 | 12–20 | 0 | P0 |
| 4 | Extrair chave Asaas para secret manager e rotacionar (E-3) | SYS-05≡DB-05 | 4–8 | 0 | P0 |
| 5 | Recriar trilha de auditoria de pagamento (`webhook_logs`) (E-4) | DB-21 | 8–16 | 0 | P0 |
| 6 | Reconciliar baseline de migrations (enabler de DDL) | SYS-01≡DB-04 | 4–8 | 1 | P1 |
| 7 | Pool de conexões + passar `schema` (anti-`sql.raw`) | DB-18 | 3–6 | 1 | P1 |
| 8 | Envolver fluxos financeiros em transações (R-2) | DB-17 | 12–20 | 1 | P1 |
| 9 | Webhook Asaas transacional, idempotente, sem `200` antecipado (R-2) | SYS-19 | 16–24 | 1 | P1 |
| 10 | Cron de inadimplência transacional, com alerta e fuso correto (R-2) | SYS-23 | 4–8 | 1 | P1 |
| 11 | Corrigir SQLi de 2ª ordem no cron de despesas | DB-22 | 4–8 | 1 | P1 |
| 12 | Centralizar autorização/scoping por dono (R-1 + R-6) | DB-03, SYS-12 | 19–29 | 1 | P1 |
| 13 | Dedup + UNIQUE em chaves naturais (R-1) | DB-09, DB-14 | 4–8 | 1 | P1 |
| 14 | Fixar charset/collation consistente no join de email (R-1) | DB-20 | 2–6 | 1 | P1 |
| 15 | Integridade referencial: FK nativa ou aplicacional (gate TiDB) | DB-01 | 16–40 | 1 | P1 |
| 16 | Índices em colunas quentes (quick wins de performance) | DB-06, DB-07 | 7–12 | 1 | P1 |
| 17 | Unificar configuração/lógica Asaas triplicada | SYS-04 | 8–12 | 1 | P1 |
| 18 | Remover dependências mortas/redundantes | SYS-06 | 4–8 | 1 | P1 |
| 19 | Padrão único de estados de query (erro ≠ lista vazia) (R-5) | UX-02 | 14–20 | 2 | P1 |
| 20 | Confirmação acessível para ações destrutivas | UX-01 | 8–12 | 2 | P1 |
| 21 | a11y: teclado no overlay mobile + rótulos em icon buttons | UX-08 | 10–16 | 2 | P1 |
| 22 | Bloquear submissão de vistoria em falha de upload (R-5) | UX-16 | 6–10 | 2 | P1 |
| 23 | Guarda de rota por papel no frontend (R-6) | UX-17 | 8–14 | 2 | P2 |
| 24 | Cobertura E2E dos 4 fluxos críticos (pós-decomposição) | SYS-07 | 24–40 | 2 | P1 |
| 25 | Decompor páginas monolíticas + padronizar loading/tabela/lazy | UX-10, UX-03, UX-07, UX-13 | 50–80 | 3 | P2/P3 |
| 26 | AppShell unificado + remover menu placeholder | UX-04, UX-05 | 15–24 | 3 | P2 |
| 27 | Migrar estilos hardcoded para design tokens | UX-06 | 6–10 | 3 | P2 |
| 28 | Padronizar empty states | UX-12 | 6–10 | 3 | P3 |
| 29 | Consolidar camada de email (6 módulos) | SYS-09 | 12–20 | 3 | P2 |
| 30 | Consolidar geração de PDF + eliminar SQL cru residual | SYS-10, SYS-11 | 32–48 | 3 | P2 |
| 31 | Escapar injeção HTML de email + alertar falha SMTP (R-5) | SYS-21 | 6–10 | 3 | P2 |
| 32 | Corrigir recursão sem guarda + N+1 em `db.ts` | SYS-13 | 8–16 | 3 | P2 |
| 33 | Padronizar representação monetária | DB-19 | 8–16 | 3 | P2 |
| 34 | Sincronizar campos desnormalizados | DB-12 | 8–16 | 3 | P2 |
| 35 | Normalizar `employees.vessel_ids` (CSV → relacional) | DB-11 | 8–12 | 3 | P2 |
| 36 | Adicionar CHECK constraints (verificar suporte TiDB) | DB-08 | 4–8 | 3 | P2 |
| 37 | Consolidar/gate scripts contra prod + limpar sprawl da raiz | SYS-08, DB-10 | 14–22 | 3 | P2 |
| 38 | Padronizar tipos temporais | DB-13 | 12–20 | 3 | P3 |
| 39 | Refatorar `fuel_records` (tabela larga ~40 col.) | DB-15 | 16–24 | 3 | P3 |
| 40 | Decompor `routers.ts` monolítico (5.784 linhas) | SYS-03 | 40–60 | 3 | P2 |
| 41 | Lote de quick wins de higiene (1–2h cada) | UX-11, UX-14, UX-15, SYS-14, SYS-16, SYS-17 | 7–11 | 3 | P3 |
| 42 | Backlog "não auditado": hardening PDF, LLM/IA, observabilidade cron | SYS-20, SYS-24, SYS-18 | 10–18 | 3 | P3 |
| 43 | Corrigir dark mode (somente antes de habilitar o tema) | UX-09 | 4–8 | 3 | P3 |

**Cobertura:** 63 IDs → 61 débitos → 43 stories; **nenhum débito órfão**.

**Sequenciamento crítico (para quem for priorizar):**
- **Story 1 (SYS-02) é bloqueador absoluto.** Sem CI verde, corrigir caminhos financeiros (stories 2, 5, 8–11) é "às cegas".
- **Emergência (stories 2–5) pode iniciar em paralelo à story 1**, mas só é verificável após o CI.
- **Stories 3 e 4 acopladas:** ao rotacionar a chave (story 4), revisar todo backup gerado (story 3).
- **Baseline de migrations (story 6) precede toda DDL** (stories 13, 14, 15, 34, 35, 36).
- **Story 15 (DB-01) tem gate de plataforma:** `SELECT VERSION()` primeiro; TiDB → provável integridade aplicacional.
- **Story 24 (E2E) depende de decomposição de páginas (story 25):** antecipar a decomposição dos 4 fluxos priorizados.

---

## 9. Metodologia e Rastreabilidade

**Método:** Brownfield Discovery, 10 fases + rodada de cobertura de gaps (7b). **100% somente-leitura** sobre o código-fonte. Nenhum arquivo alterado, nenhuma migration aplicada, nenhum teste executado, nenhum commit/PR/push. Ancorado no princípio "No Invention" (Art. IV da Constituição AIOX): todo débito rastreia a evidência de código; risco inexistente (SSRF em PDFKit) foi ativamente refutado, não inflado.

| Fase | Responsável | Artefato produzido | Documento-fonte completo |
|------|-------------|--------------------|--------------------------|
| 1 | @architect (Aria) | Análise arquitetural de sistema (stack, integrações, 18 débitos SYS) | `docs/architecture/system-architecture.md` |
| 2 | @data-engineer (Dara) | Schema (21 tabelas) + auditoria de banco (16 débitos DB) | `docs/database/SCHEMA.md` · `docs/database/DB-AUDIT.md` |
| 3 | @ux-design-expert (Uma) | Especificação frontend/UX (15 débitos UX) | `docs/frontend/frontend-spec.md` |
| 4 | @architect | Draft consolidado (49 débitos) | `docs/prd/technical-debt-DRAFT.md` |
| 5 | @data-engineer | Revisão de especialista de banco (elevou DB-02 → Crítico; +DB-17..22) | `docs/reviews/db-specialist-review.md` |
| 6 | @ux-design-expert | Revisão de especialista de UX (+UX-16/17; ajustes de severidade) | `docs/reviews/ux-specialist-review.md` |
| 7 | @qa (Quinn) | QA gate → **NEEDS WORK** (gaps de cobertura financeira) | `docs/reviews/qa-review.md` |
| 7b | @qa | Addendum de cobertura de gaps → gate **APPROVED** | `docs/reviews/qa-gap-coverage-addendum.md` |
| 8 | @architect | **Assessment técnico FINAL** (61 débitos, R-1..R-6, matriz, plano) | `docs/prd/technical-debt-assessment.md` |
| 9 | @analyst (Atlas) | Relatório executivo de negócio (custos, ROI) | `docs/reports/TECHNICAL-DEBT-REPORT.md` |
| 10 | @pm (Morgan) | Epic + 43 stories propostas (Draft) | `docs/stories/epic-technical-debt.md` |
| Final | @analyst (Atlas) | **Este relatório único consolidado** | `docs/RELATORIO-FINAL.md` |

**Evolução dos números:** DRAFT (49) → +especialistas (DB-17..22, UX-16/17) → 63 IDs → **61 débitos** após 2 merges exatos. Elevações de severidade documentadas: DB-02 (Alta→Crítica), SYS-22 (Alta→Crítica), UX-08 (Média→Alta), SYS-23 (Baixa→Média); rebaixamentos: SYS-20 (SSRF refutado), UX-09 (dark mode dormente).

**Divergência importante corrigida na auditoria:** o briefing inicial assumia banco **Postgres** — o código confirma **TiDB Cloud (MySQL-compatível)**. Isso reorienta toda a análise de integridade referencial (FK/CHECK/trigger nativos indisponíveis → integridade aplicacional).

**Confiança:** ALTA para existência/severidade dos débitos (evidência de código linha a linha nos documentos-fonte). MÉDIA para valores monetários de "custo de não resolver" (ordem de grandeza). Horas: faixas conservadoras (±15%).

---

## 10. Próximos Passos

1. [ ] **Decisão sobre a Janela de Emergência (E-1 a E-4 + #0 CI)** — ~R$ 9.300, dias de trabalho. Pode ser autorizada **imediatamente e isoladamente**, independente de qualquer decisão sobre o resto. Inclui **rotacionar a chave Asaas** (tratá-la como já comprometida) e **auditar os backups existentes**.
2. [ ] **Priorização do backlog restante (Fases 1–3)** — decidir ritmo e orçamento entre os marcos: (a) só Emergência ~R$ 9.300 · (b) Emergência + Fundação ~R$ 31.000 · (c) programa completo ~R$ 97.500. ROI concentra-se nas Fases 0+1.
3. [ ] **Autorização explícita antes de qualquer implementação** — nenhuma story foi validada (@po) ou implementada (@dev); todas permanecem em **Draft**. Nenhum status de ciclo de vida foi alterado. **Nada será tocado no código sem aprovação formal.**

---

*Relatório final consolidado da auditoria Brownfield Discovery — @analyst (Atlas), 2026-07-18. Produto de análise somente-leitura: nenhuma correção aplicada, tudo aguarda autorização. Documentos-fonte completos preservados em `docs/` para aprofundamento (ver seção 9).*

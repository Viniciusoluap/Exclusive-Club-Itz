# Epic: Resolução de Débitos Técnicos — exclusive-club-reservas

**Status:** Draft (proposta — aguardando autorização do responsável pelo projeto)
**Autor:** @pm (Morgan) — Fase 10 do workflow Brownfield Discovery — 2026-07-18
**Fontes:** `docs/prd/technical-debt-assessment.md` (Fase 8, 61 débitos) · `docs/reports/TECHNICAL-DEBT-REPORT.md` (Fase 9, enquadramento de negócio/ROI)

> **Nota de escopo desta entrega:** por solicitação explícita do responsável, TODAS as stories propostas estão consolidadas neste único arquivo como um backlog em tabela. NÃO foram criados arquivos `story-X.X-*.md` individuais. As stories são **propostas** e permanecem em status **Draft** — nenhum status de ciclo de vida foi alterado, nenhuma validação (@po) ou implementação (@dev) foi acionada. Este é material de planejamento para autorização futura, não trabalho pronto para começar.

---

## Objetivo

Eliminar, de forma sequenciada e verificável, os **61 débitos técnicos** catalogados na auditoria brownfield da plataforma de gestão do clube (reservas de embarcações, combustível, vistorias e cobranças via Asaas), começando pelos **3 críticos de risco ativo** (exfiltração de segredo/PII em backup, injeção SQL de 2ª ordem cross-sócio, ausência de auditoria financeira) e pela habilitação da "rede de segurança" de engenharia (CI + testes). O epic converte o assessment técnico da Fase 8 em um backlog priorizado e estimado, pronto para decisão de orçamento e ritmo.

## Escopo

**Dentro do escopo:**
- Os 61 débitos consolidados (63 IDs distintos − 2 merges exatos: SYS-01≡DB-04, SYS-05≡DB-05).
- Habilitação de CI/testes como meta-enabler (#0) e os 4 itens da Janela de Emergência (E-1..E-4).
- Os 6 workstreams de riscos cruzados (R-1 identidade · R-2 integridade financeira · R-3 deploy · R-4 exfiltração de segredo · R-5 falhas silenciosas · R-6 authz em profundidade).
- Fundação de dados, correções críticas de UX e otimização/higiene restante.

**Fora do escopo (explícito):**
- Novas funcionalidades de produto (No Invention — Art. IV): nenhuma story adiciona feature; todas remediam débito rastreável a um ID do inventário.
- Migração de plataforma de banco (TiDB Cloud permanece; DB-01 respeita o gate de FK nativa vs. integridade aplicacional).
- Habilitar dark mode (UX-09 só é tocado se/quando o tema deixar de ser fixo `light`).

## Critérios de Sucesso do Epic

1. **CI verde bloqueando merges** — pipeline roda `vitest run` + `tsc --noEmit` + `build` + migrations em banco efêmero e falha o job em qualquer etapa; os 83 testes Vitest existentes (hoje mortos) executam. (Gate da Fase 0)
2. **Risco ativo estancado** — segredo Asaas fora do banco e **rotacionado**; backups sem `.env`/OAuth/PII e criptografados, com backups antigos auditados; zero interpolação de `client_email` em `sql.raw()`; auditoria de pagamento gravando cada evento.
3. **Integridade financeira atômica** — fluxos cobrança/pagamento/sync envoltos em `db.transaction()`; webhook idempotente que não responde `200` antes de processar; cron de inadimplência transacional, com alerta e fuso `America/Sao_Paulo`.
4. **Isolamento por dono real** — email UNIQUE pós-dedup, scoping centralizado, collation consistente no join de email; matriz de authz negando acesso indevido em cada mutation sensível.
5. **UX sem falhas silenciosas** — erro de query renderiza estado de erro (não lista vazia); ações destrutivas exigem confirmação acessível; WCAG 2.1.1/4.1.2 verdes; upload de vistoria não submete em silêncio.
6. **Definição de "resolvido":** um débito só é considerado resolvido quando o teste/critério correspondente **passa no CI**.

## Budget e Timeline

Base de custo: **R$ 150/hora** (dev sênior; ajustável). Reais calculados sobre o ponto médio das faixas de horas do assessment.

| Fase | Débitos (foco) | Horas (aprox.) | Custo Estimado |
|------|----------------|---------------:|---------------:|
| **Fase 0 — CI + Emergência de Segurança** | SYS-02, SYS-15, DB-02(+16), SYS-22, SYS-05≡DB-05, DB-21 | **~62h** | **~R$ 9.300** |
| **Fase 1 — Fundação de Dados e Integridade Financeira** | SYS-01≡DB-04, DB-18, DB-17, SYS-19, SYS-23, DB-22, DB-03+SYS-12, DB-09(+14), DB-20, DB-01, DB-06+07, SYS-04, SYS-06 | **~145h** | **~R$ 21.750** |
| **Fase 2 — Correções Críticas de UX** | UX-02, UX-01, UX-08, UX-16, UX-17, SYS-07 | **~91h** | **~R$ 13.650** |
| **Fase 3 — Otimização / Débito Restante** | SYS-03, UX-10/03/07/13, UX-04+05, UX-06, UX-12, SYS-09, SYS-10+11, SYS-21, SYS-13, DB-19, DB-12, DB-11, DB-08, SYS-08+DB-10, DB-13, DB-15, quick-wins, SYS-20/24/18, UX-09 | **~352h** | **~R$ 52.800** |
| **TOTAL** | 61 débitos (59 linhas de execução; DB-14/DB-16 folded) | **~650h** (faixa 600–700h) | **~R$ 97.500** (faixa R$ 90k–105k) |

**Marcos de decisão de orçamento (do relatório executivo):** (a) só Emergência ~R$ 9.300 · (b) Emergência + Fundação (Fases 0+1) ~R$ 31.000 · (c) programa completo ~R$ 97.500. ROI concentra-se em Fases 0 e 1 (~R$ 31k resolve todos os riscos de segurança e financeiros); Fase 3 (~54% do custo) é higiene diluível no tempo.

**Timeline:** Fase 0 = **dias, não semanas** (pode iniciar imediatamente, em paralelo). Fases 1–3 sequenciadas por dependência técnica: CI habilita verificação → baseline de migrations habilita DDL → transações/auditoria habilitam integridade → UX crítico → otimização.

---

## Backlog de Stories Propostas

Ordenado pela sequência de execução recomendada. Prioridade: **#0** = bloqueador estrutural · **P0** = crítico/emergência · **P1** = alto/fundação · **P2** = médio · **P3** = baixo/oportunista. Todas em status **Draft (proposta)**.

| # | Story | Débito(s) | Critério de Aceite (resumo) | Esforço (h) | Fase | Prioridade |
|---|-------|-----------|------------------------------|-------------|------|------------|
| 1 | Habilitar CI com testes/lint/build/migrations e alinhar gerenciador de pacotes | SYS-02, SYS-15 | • Pipeline roda `vitest run` + `tsc --noEmit` + `build` + migrations efêmeras e **falha** o job em qualquer etapa; os 83 testes existentes executam.<br>• CI e projeto usam o mesmo package manager (resolver pnpm×npm).<br>• Testes de caracterização dos caminhos financeiros (webhook, pagamento, overdue) ligados/escritos **antes** de qualquer refatoração. | 8–14 | Fase 0 | #0 |
| 2 | Erradicar injeção SQL de 2ª ordem via `client_email` (E-1) | DB-02, DB-16 | • Para cada uma das 6 interpolações: payloads `x' OR '1'='1`/`x'; DROP…`/unicode retornam **só** dados do dono, zero vazamento cross-cliente.<br>• Substituir `sql.raw()` por bind params/query builder tipado; teste de segurança verde no CI. | 16–24 | Fase 0 | P0 (E-1) |
| 3 | Remover segredos e PII do backup + criptografar + auditar backups antigos (E-2) | SYS-22 | • Backup gerado **não contém** `.env`/tokens OAuth/dump PII em claro; artefato criptografado.<br>• URL de download assinada/efêmera (não fura gate admin).<br>• Scan de **todos** os backups já gerados concluído e documentado. | 12–20 | Fase 0 | P0 (E-2) |
| 4 | Extrair chave Asaas do banco para secret manager e rotacionar (E-3) | SYS-05 ≡ DB-05 | • `asaas_api_key` não é mais lida de `system_settings` (lint/scan verde); leitura vem de env/secret manager.<br>• Scan de segredos na tabela retorna vazio.<br>• Chave **rotacionada** (tratada como comprometida — coordenar com auditoria de backups da story 3). | 4–8 | Fase 0 | P0 (E-3) |
| 5 | Recriar trilha de auditoria de pagamento (`webhook_logs`) (E-4) | DB-21 | • Tabela de auditoria recriada alinhada ao schema; cada evento de webhook grava.<br>• `INSERT` de `index.ts:369` corrigido (hoje falha 100% em silêncio); zero falhas silenciosas de insert.<br>• Retenção definida (ex.: TTL 90d). | 8–16 | Fase 0 | P0 (E-4) |
| 6 | Reconciliar baseline de migrations (enabler de toda DDL) | SYS-01 ≡ DB-04 | • `drizzle-kit migrate` em banco **vazio** aplica o journal completo sem erro (resolve `0062` duplicado e órfãos `0002/0003/0004`).<br>• Schema resultante bate com `mysqldump --no-data` de produção; baseline documentado. | 4–8 | Fase 1 | P1 |
| 7 | Pool de conexões + passar `schema` ao driver (facilitador anti-`sql.raw`) | DB-18 | • `createPool` com reconnect substitui a conexão única de `db.ts:11`.<br>• `schema` passado ao drizzle, habilitando query builder tipado no lugar de `sql.raw`. | 3–6 | Fase 1 | P1 |
| 8 | Envolver fluxos financeiros multi-escrita em transações (R-2) | DB-17 | • Falha simulada no meio de criar-cobrança→sync→update resulta em **rollback total** (zero estado parcial).<br>• Caminhos cobrança/pagamento/sync usam `db.transaction()`. | 12–20 | Fase 1 | P1 |
| 9 | Webhook Asaas transacional, idempotente e sem `200` antecipado (R-2) | SYS-19 | • Reenvio do **mesmo** webhook 2x → baixa única (idempotency-key/ordenação).<br>• Assinatura inválida → rejeição; erro de processamento **não** responde `200` antes de processar.<br>• Processamento atômico dentro de transação. | 16–24 | Fase 1 | P1 |
| 10 | Cron de inadimplência transacional, com alerta e fuso correto (R-2) | SYS-23 | • Falha simulada em `updateOverdueStatus` → **alerta emitido** e status não corrompido (fim dos 3 UPDATEs não atômicos).<br>• Fronteira de vencido calculada em `America/Sao_Paulo` (corrige bug UTC); job idempotente. | 4–8 | Fase 1 | P1 |
| 11 | Corrigir SQLi de 2ª ordem no cron de despesas (família DB-02) | DB-22 | • `tx.description`/`tx.id` da API Asaas usam bind param, sem interpolação em `cronJobs.ts`.<br>• Teste de injeção com aspas/payload malicioso verde. | 4–8 | Fase 1 | P1 |
| 12 | Centralizar autorização/scoping por dono (R-1 + R-6) | DB-03, SYS-12 | • Matriz de authz: cada mutation sensível como anônimo/cliente/employee/admin → negação onde devido (elimina os 40 usos inline em `publicProcedure`).<br>• `adminProcedure` unificado num único ponto (fim da duplicação de auth). | 19–29 | Fase 1 | P1 |
| 13 | Dedup + UNIQUE em chaves naturais (email/open_id) (R-1) | DB-09, DB-14 | • Pré-migração reporta duplicatas existentes em `users.email/open_id`, `allowed_clients.email`, `employees.email`.<br>• Após dedup, inserir email/open_id duplicado → rejeição por constraint UNIQUE. | 4–8 | Fase 1 | P1 |
| 14 | Fixar charset/collation consistente no join de email (R-1) | DB-20 | • `utf8mb4` + collation consistente aplicados nas colunas de email usadas em join.<br>• Verificação confirma ausência de mismatch de collation no scoping por `client_email`. | 2–6 | Fase 1 | P1 |
| 15 | Integridade referencial: FK nativa ou integridade aplicacional (gate TiDB) | DB-01 | • **Gate primeiro:** `SELECT VERSION()` decide FK nativa vs. integridade aplicacional (TiDB confirmado → provável app + reconciliação).<br>• Inserir órfão → rejeição; delete pai → comportamento `ON DELETE` esperado; job de reconciliação encontra 0 órfãos em baseline limpo. | 16–40 | Fase 1 | P1 |
| 16 | Índices em colunas quentes de join/filtro (quick wins de performance) | DB-06, DB-07 | • `EXPLAIN` das queries quentes (portal por `client_email`, incl. `bpo_charges`) usa índice, não full scan. | 7–12 | Fase 1 | P1 |
| 17 | Unificar configuração/lógica Asaas triplicada | SYS-04 | • Config e lógica de integração Asaas consolidadas em fonte única; eliminadas as 3 cópias divergentes.<br>• Comportamento preservado sob os testes de caracterização (story 1). | 8–12 | Fase 1 | P1 |
| 18 | Remover dependências mortas/redundantes | SYS-06 | • Dependências não utilizadas removidas do manifest; `build` e testes verdes no CI pós-remoção.<br>• Nenhuma redução de funcionalidade. | 4–8 | Fase 1 | P1 |
| 19 | Padrão único de estados de query (erro ≠ lista vazia) (R-5) | UX-02 | • Query que falha renderiza estado de **erro** + "tentar novamente" (não lista vazia); distingue erro de vazio-sucesso.<br>• `trpc as any` e `\|\| {data:[]}` banidos via lint; `WeatherWidget` como referência canônica. | 14–20 | Fase 2 | P1 |
| 20 | Confirmação acessível para ações destrutivas | UX-01 | • `useConfirm()` + `AlertDialog` cobrem as 29 confirmações destrutivas (priorizar backup/restore, exclusões).<br>• Diálogo acessível: foco preso + `Esc`; substitui `window.confirm`/`alert`. | 8–12 | Fase 2 | P1 |
| 21 | Acessibilidade: teclado no overlay mobile + rótulos em icon buttons | UX-08 | • axe: overlay mobile operável por teclado (`role`/`Esc`/foco) via `ui/sheet`/`ui/drawer`.<br>• Icon buttons têm nome acessível (`aria-label`); WCAG 2.1.1/4.1.2 verdes. | 10–16 | Fase 2 | P1 |
| 22 | Bloquear submissão de vistoria em falha de upload (R-5) | UX-16 | • Falha de upload de foto **bloqueia** a submissão ou marca o registro como pendente; não submete em silêncio.<br>• Usuário recebe feedback explícito do erro. | 6–10 | Fase 2 | P1 |
| 23 | Guarda de rota por papel no frontend (defesa em profundidade) (R-6) | UX-17 | • Rotas protegidas por guarda de papel, não por layout; espelha a matriz de authz do backend (story 12).<br>• Acesso indevido por URL direta → redirecionado/negado. | 8–14 | Fase 2 | P2 |
| 24 | Cobertura E2E dos 4 fluxos críticos (pós-decomposição) | SYS-07 | • E2E (Playwright) cobrindo PIX Asaas → reserva → vistoria c/ upload → abastecimento.<br>• Escrita **após** UX-10 decompor páginas monolíticas, para evitar testes frágeis. | 24–40 | Fase 2 | P1 |
| 25 | Decompor páginas monolíticas + padronizar loading/tabela/lazy | UX-10, UX-03, UX-07, UX-13 | • Páginas (Saas 3274, Admin 2236, Abastecimento 1804) decompostas em componentes coesos.<br>• Loading unificado (fim dos 112 spinners inline), padrão único de tabela (`ui/table`), lazy-loading/code-splitting de rotas. | 50–80 | Fase 3 | P2/P3 |
| 26 | AppShell unificado + remover menu placeholder | UX-04, UX-05 | • `Dashboard`/`EmployeeDashboard`+`MobileMenu` consolidados em shell único.<br>• Itens de scaffolding ("Page 1/2") removidos de produção. | 15–24 | Fase 3 | P2 |
| 27 | Migrar estilos hardcoded para design tokens | UX-06 | • Cores/estilos fora dos tokens (`ManusDialog` e afins) migrados para o sistema de tokens; sem valores hardcoded remanescentes no lint. | 6–10 | Fase 3 | P2 |
| 28 | Padronizar empty states | UX-12 | • ~21 telas ad-hoc de estado vazio unificadas num componente comum; distinção clara vazio × erro (consome padrão da story 19). | 6–10 | Fase 3 | P3 |
| 29 | Consolidar camada de email (6 módulos) | SYS-09 | • Envio de email centralizado num módulo único; eliminada a fragmentação em 6 pontos.<br>• Comportamento preservado sob teste. | 12–20 | Fase 3 | P2 |
| 30 | Consolidar geração de PDF + eliminar SQL cru com mapeamento manual | SYS-10, SYS-11 | • Geração de PDF unificada (fim das 5 libs); SQL cru com mapeamento manual migrado para ORM tipado.<br>• Workstream `sql.raw` finalizado (complementa stories 2/7/11). | 32–48 | Fase 3 | P2 |
| 31 | Escapar injeção HTML de email + alertar falha SMTP silenciosa (R-5) | SYS-21 | • Nome de cliente com HTML/`\r\n` → escapado no corpo/header do email.<br>• Falha SMTP em fluxo crítico → **alerta**, não silêncio. | 6–10 | Fase 3 | P2 |
| 32 | Corrigir recursão sem guarda + N+1 em `db.ts` | SYS-13 | • Recursão com guarda de profundidade/ciclo; consultas N+1 substituídas por batch/join.<br>• `EXPLAIN`/profiling confirma redução de queries. | 8–16 | Fase 3 | P2 |
| 33 | Padronizar representação monetária | DB-19 | • Property test int-centavos ↔ `decimal`; relatório consolidado (combustível int × cobrança decimal) bate ao centavo. | 8–16 | Fase 3 | P2 |
| 34 | Sincronizar campos desnormalizados | DB-12 | • Sync aplicacional (TiDB sem trigger) mantém campos desnormalizados consistentes; teste detecta divergência.<br>• Depende do baseline reconciliado (story 6). | 8–16 | Fase 3 | P2 |
| 35 | Normalizar `employees.vessel_ids` (CSV/JSON → relacional) | DB-11 | • `vessel_ids` migrado de CSV/JSON em text para tabela de junção; integridade garantida.<br>• Depende da baseline de migrations (story 6). | 8–12 | Fase 3 | P2 |
| 36 | Adicionar CHECK constraints (verificar suporte TiDB) | DB-08 | • Suporte a CHECK do TiDB verificado; onde indisponível, validação aplicacional equivalente.<br>• Valores fora de faixa rejeitados. | 4–8 | Fase 3 | P2 |
| 37 | Consolidar/gate scripts ad-hoc contra produção + limpar sprawl da raiz | SYS-08, DB-10 | • Docs/scripts órfãos da raiz organizados; os ~25 scripts de acesso direto a produção consolidados e com gate (subconjunto de maior risco de R-4). | 14–22 | Fase 3 | P2 |
| 38 | Padronizar tipos temporais | DB-13 | • Colunas temporais unificadas em tipo/fuso consistente; conversões documentadas e testadas. | 12–20 | Fase 3 | P3 |
| 39 | Refatorar `fuel_records` (tabela larga ~40 colunas) | DB-15 | • `fuel_records` decomposta/normalizada reduzindo largura; queries de combustível preservadas sob teste. | 16–24 | Fase 3 | P3 |
| 40 | Decompor `routers.ts` monolítico (5.784 linhas) | SYS-03 | • `routers.ts` dividido em módulos por domínio, incrementalmente; cada extração verde no CI.<br>• Nenhuma mudança de contrato de API. | 40–60 | Fase 3 | P2 |
| 41 | Lote de quick wins de higiene (1–2h cada) | UX-11, UX-14, UX-15, SYS-14, SYS-16, SYS-17 | • Código morto de UI removido (`ReservasAntigo`, `ComponentShowcase`, `admin/Pagamentos`); redirect por efeito colateral corrigido; fallback de fonte Poppins garantido.<br>• Alias `@assets` corrigido; `.env.example` limpo de vars de tooling; log "S3" enganoso corrigido para proxy Forge. | 7–11 | Fase 3 | P3 |
| 42 | Backlog "não auditado": hardening de PDF, LLM/IA e observabilidade de cron | SYS-20, SYS-24, SYS-18 | • Higiene de geração de PDF (SSRF refutado — só ajustes de higiene PDFKit).<br>• Integração LLM/IA auditada (custo, PII a provedor, prompt-injection).<br>• Cron genérico com retry/observabilidade. | 10–18 | Fase 3 | P3 |
| 43 | Corrigir dark mode (somente antes de habilitar o tema) | UX-09 | • Dark mode consistente/estável — executar **apenas** se/quando o tema deixar de ser fixo `light` (hoje dormente). | 4–8 | Fase 3 | P3 |

**Cobertura:** 63 IDs mapeados → 61 débitos (SYS-01≡DB-04 e SYS-05≡DB-05 mesclados; DB-14 folded em DB-09/story 13, DB-16 folded em DB-02/story 2). 43 stories propostas; nenhum débito órfão.

---

## Notas

**Sequenciamento e dependências (para quem for priorizar):**

1. **Story 1 (SYS-02) é bloqueador absoluto (#0).** Sem CI verde, corrigir qualquer caminho financeiro (stories 2, 5, 8–11) é "mudança às cegas". Os testes de caracterização (item da story 1) devem ligar **antes** de tocar webhook/pagamento/overdue.
2. **Janela de emergência (stories 2–5) pode iniciar em paralelo à story 1**, mas só se torna *verificável* após o CI. É a interseção dos riscos R-1, R-2 e R-4 e o item de maior ROI (~R$ 9.300 removem ~90% do risco de incidente grave).
3. **Contenção de segredo (stories 3 e 4 acopladas):** ao rotacionar a chave Asaas (story 4), tratar como comprometida e revisar TODO backup já gerado por SYS-22 (story 3) — a chave antiga pode ter vazado nesses ZIPs.
4. **Baseline de migrations (story 6) precede toda DDL** (stories 13, 14, 15, 34, 35, 36). Reconciliar via `mysqldump --no-data` antes de qualquer FK/índice/UNIQUE (mitiga R-3: restore destrutivo sobre schema divergente).
5. **DB-01 (story 15) tem gate de plataforma:** rodar `SELECT VERSION()` primeiro. TiDB confirmado → provavelmente sem FK nativa → integridade aplicacional + jobs de reconciliação (menos DDL, mais app). A faixa de esforço (16–40h) reflete essa incerteza — resolvê-la reduz o risco de estimativa.
6. **UNIQUE exige dedup antes (story 13):** criar constraint sobre duplicatas existentes falha. Auditar `email/open_id` antes do DDL. Evidência ampliada: `cronJobs.ts:62-64` usa `email.toLowerCase()` como chave de `Map` — dois clientes com mesmo email → cobrança atribuída ao cliente errado.
7. **Riscos cruzados são workstreams, não itens soltos:** corrigir DB-02 isolado **não fecha R-1** enquanto o email for mutável, não-único e com collation incerta. Priorizar por risco (R-1..R-6), não só por severidade individual.
8. **SYS-07 (story 24) depende de UX-10 (story 25):** escrever E2E de fluxo só após decompor as páginas monolíticas, senão os testes ficam frágeis. Por isso UX-10 aparece na Fase 3 mas é pré-requisito de parte da Fase 2 — recomenda-se **antecipar a decomposição dos 4 fluxos priorizados** (PIX/reserva/vistoria/abastecimento) para dentro da janela da story 24.
9. **Workstream `sql.raw` atravessa fases:** stories 2 (erradicação crítica), 7 (facilitador `schema`), 11 (cron despesas) e 30 (SQL cru residual). O fim do workstream é a story 30.
10. **Marcos de orçamento sugeridos:** aprovar Fase 0 (stories 1–5) imediatamente e isoladamente; decidir Fases 1–3 depois, com calma. Fases 0+1 (~R$ 31k) resolvem todos os riscos de segurança e financeiros; Fase 3 (~R$ 52,8k) é higiene diluível.

**[AUTO-DECISION] Granularidade do backlog** → 43 stories em vez de 61 (uma por débito) (razão: a instrução do responsável pede um único relatório consolidado; agrupei débitos de raiz comum ou muito pequenos — ex.: 6 quick-wins de 1–2h na story 41, PDF+SQL cru na story 30, decomposição+padronização de UI na story 25 — preservando rastreabilidade de cada ID na coluna "Débito(s)". Merges exatos SYS-01≡DB-04 e SYS-05≡DB-05 e os folds DB-14/DB-16 seguem o próprio assessment).

**[AUTO-DECISION] Fase de UX-17, UX-13, UX-03, UX-07** → mantidas conforme o Plano de Resolução por Fases da Fase 8 (UX-17 em Fase 2; UX-03/07/13 agrupadas com UX-10 na Fase 3) (razão: o plano do @architect prevalece sobre a coluna de prioridade da matriz quando há conflito, pois codifica as dependências de execução — UX-03/07/13 "andam junto" com a decomposição de páginas).

---

*Fim do Epic (Fase 10 do Brownfield Discovery). Stories PROPOSTAS em status Draft — aguardando autorização de orçamento/ritmo do responsável pelo projeto. Nenhum status de ciclo de vida alterado; @po/@dev não acionados; nenhum commit/PR/push realizado.*

---

# Estado da execução — 07/08/2026

Registro do que foi de fato executado, para quem retomar não precisar reconstruir
o contexto lendo 60 PRs. **Este bloco descreve execução, não planejamento** — a
matriz acima permanece como foi proposta na Fase 10.

## Trabalho concluído e mergeado

| Frente | PRs | Estado |
|---|---|---|
| Fase 0 (CI, SQLi, backup sem segredos, chave Asaas, auditoria de webhook) | #38 e correlatos | ✅ |
| Fase 1 (baseline de migrations, transações, idempotência, índices, scoping) | vários | ✅ |
| Fase 2 (estados de query, confirmação acessível, acessibilidade, guarda de rota) | vários | ✅ |
| Story 40 — decompor `routers.ts` (5.662 → 118 linhas) | 5 fatias | ✅ |
| Pagamento parcial: baixa pelo valor real + saldo devedor | — | ✅ |
| **Backup: reconstrução completa** | #84–#92 | ✅ |
| **Migrações automáticas com adoção de baseline** | #93 | ✅ |
| **`@ts-nocheck` removido do `bpoRouter.ts`** | #93 | ✅ |
| **Migração das cobranças `partiallyPaid` legadas** | #94 | ✅ |
| **Varredura de valores enum em todo o servidor** | #95 | ✅ |

## Defeitos reais encontrados no caminho (não estavam na matriz)

Vale mais que a lista de stories: são coisas que a auditoria original não viu.

1. **Backup disparava a cada start do servidor.** Um `if (import.meta.url === ...)`
   para execução por linha de comando virava sempre verdadeiro depois do
   empacotamento pelo esbuild. Gerou 313 backups numa noite. (#89)
2. **`source: "asaas_reconcile"` gravava valor fora do enum.** A reconciliação de
   cobrança falharia em banco estrito. Escondido pelo `@ts-nocheck`. (#93)
3. **Migrações nunca chegavam ao banco de produção.** A hospedagem publica o
   código mas não roda migrações — duas funcionalidades quebraram por isso antes
   de a causa ser identificada. (#93)
4. **Download de backup entregava arquivo criptografado cru**, que não abria em
   programa nenhum. (#91)
5. **Conexão do backup exigia SSL incondicionalmente**, quebrando em qualquer
   servidor sem TLS. (#90)
6. **Regex de `DATABASE_URL` rejeitava senha vazia**, com mensagem que apontava
   para o lugar errado. (#90)

## Pendente — precisa de verificação visual do responsável

Não executado de propósito: o critério de aceite é visual e não havia como
conferir.

- **Story 30** — consolidar geração de PDF. São 2 bibliotecas (pdfkit, jsPDF) em
  5 lugares, não 5 bibliotecas. Reescrever às cegas um artefato que vai para
  cliente é risco sem contrapartida.
- **Stories 27, 28, 24** — dependem de conferência de tela.

## Pendente — precisa de decisão de risco do responsável

Mexem em schema/dados de tabelas grandes:

- Stories 33–36 (representação monetária, campos desnormalizados,
  `employees.vessel_ids`, CHECK constraints)
- Stories 38–39 (tipos temporais, refatorar `fuel_records`)

Com o migrador automático (#93) essas mudanças passaram a ser viáveis: a
migração chega ao banco sozinha. O que falta é a decisão sobre a janela.

## Restrições permanentes

- **`BACKUP_ENCRYPTION_KEY` não pode mudar.** Se mudar ou se perder, todos os
  backups existentes ficam ilegíveis. Não há recuperação.
- **`calculateMonthFinalBalance` (`db.ts`) não pode ser alterada** — determinação
  do responsável pelo projeto.
- **Senha SMTP não deve ser rotacionada** — determinação do responsável.
- **Deploy é manual**, pelo painel do Manus (sincronizar + publicar). A tela
  `/admin/diagnostico` mostra o `BUILD_MARKER` para confirmar o que subiu.
- **CI não dispara por push nem por pull request** nesta conta; é preciso usar
  `workflow_dispatch`. Nada entra em `main` sem uma execução manual verde.

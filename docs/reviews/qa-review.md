# QA Review — Technical Debt Assessment

> **Fase 7 do workflow Brownfield Discovery** — `@qa` (Quinn) — 2026-07-18
> Revisão consolidada de qualidade sobre `technical-debt-DRAFT.md` (Fase 4) + `db-specialist-review.md` (Fase 5) + `ux-specialist-review.md` (Fase 6), cruzada com os documentos de origem (`system-architecture.md`, `DB-AUDIT.md`, `frontend-spec.md`).
> Método: análise **somente-leitura**. Nenhum código-fonte modificado, nenhum teste executado, nenhuma migration aplicada.

## QA Review - Technical Debt Assessment

### Gate Status: **NEEDS WORK**

O assessment está **maduro e bem fundamentado** nos três domínios cobertos (sistema, dados, frontend). As revisões de Fase 5 e 6 são consistentes, rastreáveis ao código e resolveram corretamente as sobreposições que importavam. **Não há retrabalho de Fases 5–6.**

Porém o gate **não passa** por uma razão estrutural: **áreas de integração de alto risco citadas no `system-architecture.md` nunca receberam auditoria de risco por nenhum especialista** — foram apenas *listadas* na tabela de integrações da Fase 1, mas não viraram débitos avaliados. Três delas tocam **dinheiro real** (webhook de pagamento Asaas, cron de inadimplência, backup/restore). Além disso, **duas perguntas de confirmação ficaram formalmente em aberto** (existência/retenção de `webhook_logs`; provider MySQL vs TiDB/Vitess) e essas respostas **mudam o approach** de débitos P0/P1. A Fase 8 não pode consolidar um assessment que omite o caminho de webhook de pagamento e não sabe se a tabela de auditoria existe.

Essas correções são **de domínio do @architect (Fase 1/8)** — não exigem re-executar Fases 5–6. São adições de débitos de sistema + fechamento de 2 confirmações.

---

### Gaps Identificados

Áreas presentes na **tabela de integrações do `system-architecture.md`** (Seção "Pontos de Integração Externos") que foram apenas citadas, mas **não auditadas a fundo** por nenhum dos três especialistas:

| # | Área | Estado atual no assessment | Por que é gap (risco não endereçado) |
|---|------|----------------------------|--------------------------------------|
| G-1 | **Webhook Asaas (idempotência / replay / assinatura)** | SYS-04 cobre *config triplicada*; a lógica no `_core/index.ts` é citada como "frágil/no bootstrap", mas **não há débito sobre idempotência nem replay**. | Webhook de **pagamento**. Asaas reenvia webhooks em falha. Sem chave de idempotência + sem transação (DB-17), um reenvio pode **duplicar baixa de cobrança** ou re-disparar `syncStatusToSources`. O parsing de `externalReference` por `split('-')` (consolidated-) é frágil e roda em SQL cru. Nenhum especialista avaliou o risco financeiro do handler, só a organização do código. |
| G-2 | **`webhook_logs` — existência e retenção** | @data-engineer (Resposta 6) **não conseguiu confirmar** que a tabela existe (não está nas 21 do SCHEMA.md); retenção/expurgo desconhecidos. | Auditoria/replay de pagamento pode não existir ou crescer indefinidamente. É um **item aberto que precisa de confirmação em prod (`SHOW TABLES`)** antes da Fase 8 — não pode ficar como "talvez". |
| G-3 | **Geração de PDF (`htmlToPdf.ts`, 55KB) — segurança** | SYS-10 trata só de *fragmentação* (5 libs). | PDFs de relatório/vistoria/cobrança consomem dados de cliente. Renderização server-side de HTML com input do usuário abre **HTML/CSS injection e potencial SSRF** (imagens remotas). Ninguém avaliou se `htmlToPdf` sanitiza input. Gap de segurança, não só de arquitetura. |
| G-4 | **Camada de email (6 módulos) — injeção/confiabilidade** | SYS-09 trata só de *fragmentação*. | Emails de vistoria/boas-vindas/notificação usam campos controláveis pelo usuário (nome, notas). Sem avaliação de **header/template injection** nem de **falha silenciosa de SMTP** em fluxos críticos (o email de vistoria confirma prova ao cliente). Relaciona a família "falha silenciosa" (ver Riscos Cruzados). |
| G-5 | **Cron `updateOverdueStatus` — confiabilidade financeira** | SYS-18 classifica todo o cron como **Baixo**, genérico ("sem retry/observabilidade"). | `updateOverdueStatus` marca **inadimplência** — se falha em silêncio, cobranças ficam com status errado e o portal do cliente/admin mostra dado financeiro incorreto. Severidade **Baixo é subavaliada** para um job financeiro. Deveria ser destacado do balde genérico de cron. |
| G-6 | **Backup / restore + Google Drive OAuth** | Listado na tabela de integrações; UX-01 tocou o `confirm()` de restore. **Nenhum débito (SYS/DB) sobre a corretude do fluxo.** | O restore "substitui o banco" (Backups.tsx). Combinado com drift de migrations (SYS-01/DB-04), DROPs destrutivos e ausência de transações, restaurar sobre schema divergente é catastrófico. O backup para Google Drive depende de **OAuth interativo que expira** — pode parar de rodar em silêncio. DR não auditado. Constituição AIOX proíbe backup dentro do próprio DB gerenciado (o `backup_history` merece verificação). |
| G-7 | **Camada de autenticação (email mutável como identidade)** | DB-02/DB-03/DB-09/UX-17 tocam pedaços; ninguém auditou a **raiz**: o email é a chave de isolamento por dono **e** é mutável (`updateUserEmail`) **e** não é UNIQUE (DB-09) **e** a collation do join é desconhecida (DB-20). | A identidade/autorização de todo o sistema repousa sobre um campo mutável, não-único, interpolado em SQL cru e de collation incerta. Está fragmentado em 4 débitos que ninguém amarrou como **uma falha de identidade única**. Ver Riscos Cruzados R-1. |
| G-8 | **Integração LLM/IA (`llm.ts`, voice, image, AIChatBox)** | Citada na tabela; sem débito. | Menor, mas: custo, PII enviada a provedores externos, prompt-injection no `AIChatBox`. Aceitável registrar como débito Baixo "não auditado" para completude. |

**Nota de completude:** todos os débitos das Fases 4–6 (SYS-01..18, DB-01..20, UX-01..17) **se sustentam** — validei os ajustes de severidade contra as evidências de código citadas e estão corretos (DB-02→Crítico justificado pelas 6 interpolações; UX-08→Alta justificado por falha WCAG 2.1.1/4.1.2; UX-09→Baixa justificado por tema fixo em `light`). O problema não é o que está lá — é o que **não foi capturado**.

---

### Riscos Cruzados

| Risco | Áreas Afetadas | Débitos que se combinam | Mitigação |
|-------|-----------------|--------------------------|-----------|
| **R-1 — Identidade construída sobre email mutável** (o risco mestre) | Dados + Segurança + Frontend | DB-02 (injeção via email) + DB-03 (authz inline) + DB-09 (email não-UNIQUE → duplicidade) + DB-20 (collation do join incerta) + UX-17 (sem guarda de rota) + SYS-12 (`adminProcedure` duplicado) | Tratar como **um único workstream de "identidade e isolamento por dono"**: (1) tornar email UNIQUE após dedup; (2) erradicar `sql.raw()` no scoping; (3) fixar `utf8mb4` + collation consistente no join de email; (4) centralizar scoping por dono em helper único; (5) travar mutação de email ou re-verificar autorização após troca. Corrigir DB-02 isolado **não fecha o risco** enquanto o email continuar não-único e mutável. |
| **R-2 — Corrupção silenciosa de dados financeiros** | Dados + Sistema + Integração | DB-17 (zero transações) + DB-01 (sem FK) + DB-12 (desnormalização sem sync) + DB-19 (dinheiro int vs decimal) + G-1 (webhook sem idempotência) + G-5 (cron de inadimplência) | Workstream de **"integridade financeira"**: escrever caminho de cobrança/pagamento/sync dentro de `db.transaction()`; adicionar chave de idempotência no webhook; padronizar tipo monetário; reconciliar status com job auditável. Nenhum item resolve sozinho — é a interseção mais perigosa do sistema. |
| **R-3 — Deploy em ambiente novo quebra** | Dados + Sistema + CI | SYS-01/DB-04 (drift de migrations) + DB-AUDIT (DROPs sem rollback) + SYS-02 (CI não roda migrations/testes) + G-6 (restore sobre schema divergente) | DB-04 é enabler (reconciliar baseline via `mysqldump --no-data` **antes** de qualquer DDL). CI deve passar a rodar migrations num banco efêmero. Restore só sobre baseline reconhecido. |
| **R-4 — Exfiltração de segredo de pagamento** | Dados + Sistema + Segurança | DB-05/SYS-05 (chave Asaas em texto plano na tabela) + DB-10 (25 scripts na raiz com `DATABASE_URL`) + SYS-08 (sprawl de scripts) | Qualquer um dos ~25 scripts não revisados lê a chave em claro. Extrair segredo para secret manager + **rotacionar** (assumir comprometido) + consolidar/gate os scripts. |
| **R-5 — Família "falha silenciosa" (observabilidade)** | Frontend + Sistema + Integração | UX-02 (erro de query vira lista vazia) + UX-16 (upload de vistoria falha e submete mesmo assim) + G-4 (SMTP falha em silêncio) + G-5 (cron falha em silêncio) + SYS-17 (log "S3" enganoso) + SYS-18 (cron sem alerta) | O sistema **esconde falhas em todas as camadas**. Padrão único de erro no frontend (WeatherWidget como referência), bloqueio de submissão em upload crítico, alertas em cron/SMTP, logs corretos. Sem isto, nenhuma correção é observável em produção. |
| **R-6 — Autorização sem defesa em profundidade** | Frontend + Dados | UX-17 (UI confia no layout, não em guarda de rota) + DB-03 (mutations em `publicProcedure` com check inline) | Se a UI é contornada (URL direta), a única linha é o `if` inline do backend — e DB-03 diz que um endpoint que esquece o `if` fica público. Frontend **e** backend precisam falhar seguro; o backend/tRPC é a fronteira real. |

---

### Dependências Validadas

**Parecer sobre a fusão O-1 / O-2 (recomendada pelo @data-engineer): CORRETA.**
- **O-1 (SYS-01 ≡ DB-04):** confirmo mesclar. A evidência do `0062` (a tag do journal `0062_small_katie_power` e o órfão `0062_add_password_hash` fazem **a mesma** alteração) prova raiz única — colisão de numeração por merge de branches. Dono @data-engineer (execução: reconciliar baseline), @architect stakeholder de CI/deploy. Um débito, duas perspectivas.
- **O-2 (SYS-05 ≡ DB-05):** confirmo mesclar. Duplicata exata (`asaas_api_key` em `system_settings`). Um débito P0 de segurança com divisão de execução (dados remove/rotaciona; arquitetura define destino). Correto.

**Ordem de resolução — tecnicamente sólida, com UMA correção de topo:**

1. **SYS-02 (CI) deve ser o débito #0 — antes de tudo, inclusive de DB-02.** Este é o furo do sequenciamento atual: a matriz da Fase 4 e a ordem do @data-engineer colocam DB-02 como primeiro P0. Mas **sem CI rodando os 83 testes existentes, não há rede de segurança para validar que a correção de DB-02 não quebra os 6 caminhos de query que ela toca.** SYS-02 é o **meta-enabler** de todo o programa: 6–10h que tornam cada PR subsequente verificável. Corrigir CI primeiro, depois escrever testes de caracterização dos caminhos financeiros (webhook, pagamento) **antes** de refatorar DB-02/DB-03/SYS-03. Nenhum especialista era dono de SYS-02, então ninguém o elevou a #0 — é a correção de dependência mais importante desta review.

2. **DB-04 como enabler de DDL — validado.** Nenhuma FK/índice/UNIQUE (DB-01/DB-06/DB-09) é segura antes de reconciliar o baseline de migrations. Ordem correta. Confirmação obrigatória via `mysqldump --no-data` de produção.

3. **DB-01 (FKs) com gate de provider — validado e crítico.** A ressalva do @data-engineer está certa: se o backend for TiDB/Vitess/PlanetScale, FK nativa, trigger e (parte de) CHECK não existem → integridade migra para a aplicação. **Isto é um item aberto que muda o esforço de DB-01/DB-08/DB-12** e precisa ser resolvido (`SELECT VERSION()`) antes da Fase 8 comprometer estimativas. Bloqueio de planejamento, não de código.

4. **DB-09 (UNIQUE) exige dedup antes do DDL — validado.** Não se cria UNIQUE sobre duplicatas existentes. Auditoria/dedup de `users.email/open_id`, `allowed_clients.email`, `employees.email` precede o DDL. Correto. Absorve DB-14.

5. **DB-02 antes/junto de DB-03 — validado, mas ver R-1.** Ambos tocam `WHERE client_email = ctx.user.email`. Correto coordená-los. Ressalva: fechá-los **sem** DB-09+DB-20 (email único + collation) deixa o risco de identidade (R-1) parcialmente aberto.

6. **DB-18 (pool + `schema`) como pré-condição facilitadora de DB-02 — validado.** Sem a API relacional tipada, o time continua caindo em `sql.raw()`. Incluir no workstream de erradicação faz sentido.

**Sem bloqueios de ordenação inválidos detectados** além do reposicionamento de SYS-02 para #0. A lógica "segurança → integridade → performance → manutenção" do @data-engineer é apropriada, desde que **precedida pela habilitação do CI**.

---

### Testes Requeridos

Premissa: **SYS-02 primeiro** — os 83 testes Vitest existentes precisam rodar no CI antes que qualquer teste abaixo tenha valor de regressão. Onde não há teste (frontend, SYS-07), escrever **testes de caracterização** do comportamento atual antes de refatorar.

| Débito | Teste Necessário | Tipo |
|--------|-------------------|------|
| SYS-02 (CI) | Pipeline roda `vitest run` + `tsc --noEmit` + `build` + (migrations em banco efêmero) e **falha** o job se qualquer um falhar. Meta-teste do próprio gate. | CI / Automatizado |
| DB-02 (+DB-16) | Testes de injeção de 2ª ordem: setar email = `x' OR '1'='1`, `x'; DROP…`, unicode/aspas; asseverar que a query retorna **só** os dados do dono e não vaza cross-cliente. Para cada uma das 6 interpolações. | Segurança / Integração |
| DB-03 / UX-17 (R-6) | Matriz de autorização: cada mutation (delete/markAsPaid/generatePayment) chamada como `user` anônimo, cliente, employee, admin → asseverar negação onde devido. Guarda de rota no frontend por papel. | Integração + E2E |
| DB-17 / R-2 (webhook, G-1) | Teste transacional: simular falha no meio de criar-cobrança→sync→update; asseverar rollback total (sem estado parcial). Idempotência: reenviar o **mesmo** webhook Asaas 2x → asseverar baixa única. Assinatura inválida → rejeição. | Integração |
| DB-01 (FKs) | Após aplicar FKs (ou lógica aplicacional se TiDB): inserir órfão → asseverar rejeição; delete pai → asseverar `ON DELETE` esperado. Job de reconciliação encontra 0 órfãos em baseline limpo. | Integração / Migration |
| DB-04 (migrations) | `drizzle-kit migrate` em banco **vazio** aplica journal completo sem erro (pega o `0062` duplicado) e o schema resultante bate com `mysqldump --no-data` de prod. | Migration / CI |
| DB-05 (segredo) | Asseverar que `asaas_api_key` **não** é lida de `system_settings` (regra de lint/scan); leitura vem de env; scan de segredos em `system_settings` retorna vazio. | Segurança / Estático |
| DB-06/DB-07 (índices) | `EXPLAIN` das queries quentes (portal do cliente por `client_email`) usa índice, não full scan. | Performance |
| DB-09 (UNIQUE) | Inserir email/open_id duplicado → rejeição. Pré-migração: query de detecção de duplicatas existentes roda e reporta. | Integração / Migration |
| DB-19 (dinheiro) | Property test de conversão int-centavos ↔ decimal; relatório consolidado que cruza combustível (int) e cobrança (decimal) bate ao centavo. | Unit |
| G-5 (cron inadimplência) | `updateOverdueStatus` com falha simulada → alerta emitido e status não corrompido; teste de idempotência do job. | Integração |
| G-3 (PDF) | `htmlToPdf` com input contendo HTML/`<script>`/URL remota → sanitizado, sem fetch externo (SSRF). | Segurança |
| UX-02 / R-5 | Query que falha renderiza estado de **erro** (não lista vazia) + botão "tentar novamente"; distinguir erro de vazio-sucesso. Padrão único (`WeatherWidget`). | Componente (Vitest+RTL) |
| UX-01 | `useConfirm()` abre `AlertDialog` acessível; ações destrutivas (excluir cliente, restaurar backup) exigem confirmação; foco preso + `Esc`. | Componente / a11y |
| UX-08 | Testes a11y (axe): overlay mobile operável por teclado (`role`, `Esc`, foco); botões icon-only têm nome acessível. Falha WCAG 2.1.1/4.1.2 = teste vermelho. | a11y automatizado |
| UX-16 | Falha de upload de foto de vistoria **bloqueia** submissão ou marca registro como pendente; asseverar que não submete em silêncio. | Componente / Integração |
| SYS-07 (fluxos críticos) | Cobertura E2E dos 4 fluxos priorizados pelo @ux: pagamento PIX Asaas, reserva, vistoria (com upload), abastecimento. Escrever após decompor páginas monolíticas (UX-10) para não gerar testes frágeis. | E2E (Playwright) |

---

### Parecer Final

**O CI (SYS-02) precisa ser corrigido ANTES de qualquer outro débito — sem exceção.** Este é o ponto central da minha review como gate de qualidade. Hoje o CI só roda `tsc --noEmit`; os 83 testes Vitest existentes **nunca executam** e o frontend não tem teste algum. Isso significa que **não há como validar que a correção de DB-02, DB-03, DB-01 ou qualquer refactor não introduz regressão** — especialmente perigoso porque os débitos mais graves ficam nos caminhos financeiros (webhook, cobrança, sync). Habilitar o CI (6–10h) transforma todo o resto do programa de "mudança às cegas" em "mudança verificável". A matriz da Fase 4 coloca SYS-02 como P0 lado a lado com DB-02; eu o elevo a **P0 #0, pré-requisito absoluto** de todo o backlog.

**Qualidade das Fases 5–6:** excelente. As duas revisões são rastreáveis ao código, ajustaram severidades com justificativa (DB-02→Crítico, UX-08→Alta, UX-09→Baixa) e resolveram as sobreposições que importavam. Endosso integralmente as fusões O-1 e O-2, o gate de provider para DB-01, e a sequência "segurança→integridade→performance→manutenção" — desde que precedida pela habilitação do CI. **Nenhum retrabalho de Fase 5 ou 6 é necessário.**

**Por que NEEDS WORK e não APPROVED:** o assessment é forte no que cobre, mas um inventário de débito técnico brownfield que **não audita o webhook de pagamento (idempotência/replay), não sabe se a tabela de auditoria `webhook_logs` existe, não avalia a segurança da geração de PDF/email, e subvaloriza o cron de inadimplência** não está completo o suficiente para virar o documento final da Fase 8. Estas são áreas de **integração de sistema** (domínio @architect, Fase 1) que foram listadas na tabela de integrações mas nunca viraram débitos avaliados — e três delas tocam dinheiro.

**O que a Fase 8 (@architect) deve incorporar para fechar o gate (bounded, sem re-rodar Fases 5–6):**
1. **Adicionar débitos de sistema faltantes:** SYS-19 (webhook Asaas sem idempotência/replay — Alto), SYS-20 (segurança de `htmlToPdf` / injeção-SSRF — Médio), SYS-21 (injeção/confiabilidade de email — Médio), SYS-22 (backup/restore + Google Drive OAuth não auditado, DR — Alto), e destacar o cron de inadimplência do genérico SYS-18 (elevar de Baixo para Médio). Registrar LLM como débito Baixo "não auditado" para completude.
2. **Fechar as 2 confirmações abertas** (idealmente antes de finalizar): existência/retenção de `webhook_logs` (`SHOW TABLES`/`information_schema`) e provider real (`SELECT VERSION()` — MySQL vs TiDB/Vitess), porque **ambas mudam o approach** de débitos P0/P1 (retenção/auditoria e estratégia de FK).
3. **Reposicionar SYS-02 como P0 #0** explicitamente na matriz final, com nota de que é pré-requisito de validação de todos os demais.
4. **Registrar os 6 riscos cruzados (R-1..R-6)** como workstreams na consolidação — a organização por workstream (identidade, integridade financeira, deploy, segredos, observabilidade, authz em profundidade) é mais acionável que a lista plana de 53 débitos.

Com esses 4 itens incorporados, o assessment estará completo e consistente e eu converto o gate para **APPROVED**. Nada aqui bloqueia o início da remediação de emergência (SYS-02 + DB-02 + DB-05 podem começar já) — bloqueia apenas a **finalização** do documento da Fase 8.

---
*Fim da Fase 7 (QA Gate). Handoff para @architect (Aria) — Fase 8: finalizar `technical-debt-assessment.md` incorporando os 4 itens acima.*

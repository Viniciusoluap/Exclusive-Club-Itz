# QA Gap Coverage Addendum

> **Fase 7b do workflow Brownfield Discovery** — `@architect` (Aria) — 2026-07-18
> Rodada extra para cobrir os gaps de integração apontados pelo QA gate (`qa-review.md`, veredito **NEEDS WORK**) antes da consolidação da Fase 8.
> Método: análise **somente-leitura** sobre código-fonte. Nenhum arquivo modificado, nenhum teste executado, nenhuma migration aplicada.
> Escopo: auditar as áreas de integração listadas em `system-architecture.md` mas nunca transformadas em débitos avaliados (G-1..G-8), e fechar as 2 confirmações abertas.

---

## Resumo executivo

Os 5 gaps foram investigados no código. **4 confirmam débitos reais** (2 deles mais graves do que a Fase 4 supunha), **1 é parcialmente refutado** (a "SSRF/HTML-injection no PDF" não existe — o renderer é PDFKit, não HTML). Além disso, **as 2 confirmações abertas do QA foram respondidas com evidência de código** — o que era o principal bloqueio formal da Fase 8:

- **`webhook_logs` NÃO existe** — foi criada na migration `0032` e **removida (`DROP TABLE`) na migration `0033`**, nunca recriada, e não está em `drizzle/schema.ts`. A tabela de auditoria de pagamento não existe. (fim do "talvez")
- **Provider é quase certamente TiDB Cloud** — `server/databaseBackup.ts:34-36` conecta com `ssl: { rejectUnauthorized: false }` e comentário `// TiDB Cloud requer SSL`. Isso confirma a ressalva do @data-engineer: FK/trigger/CHECK nativos podem não existir → integridade migra para a aplicação (impacta DB-01/DB-08/DB-12).

Achado mais grave desta rodada: a combinação **webhook sem transação + resposta HTTP 200 antes do processamento + tabela de auditoria dropada** — eventos de pagamento podem ser **perdidos permanentemente e sem rastro**.

---

## Gaps Investigados

### 1. Webhook Asaas — Idempotência / Replay

**Arquivo:** `server/_core/index.ts:271-379`

O que **existe** (parcialmente melhor que o QA supôs):
- **Validação de origem existe**: `server/_core/index.ts:275-285` compara o header `asaas-access-token` com `process.env.ASAAS_WEBHOOK_TOKEN` e rejeita se ausente/divergente. Rate limit de 60/min no path (`index.ts:43,49`). Ou seja, **há** autenticação da origem — porém é um **token estático compartilhado**, não HMAC com timestamp; um request válido capturado pode ser **replayado** indefinidamente.
- **Idempotência parcial por design**: o `UPDATE bpo_charges SET status=..., amount_paid=${amountPaidVal}` (`index.ts:310-315`) grava valores **absolutos** (não incrementa), e o caminho consolidado tem guarda `AND status NOT IN ('receivedInCash','received','confirmed','cancelled')` (`index.ts:344`). Portanto o cenário "baixa dobrada" que o QA temeu é **mitigado** para o caso feliz.

O que **é gap real** (confirmado):
- **Zero transação (DB-17 confirmado aqui):** são 4+ `db.execute` independentes — `UPDATE bpo_charges` → `syncStatusToSources` → `UPDATE` consolidado → `INSERT webhook_logs`. Falha no meio deixa `bpo_charges` atualizado mas `inspection_charges`/`fuel_records` dessincronizados. Não há `db.transaction()`.
- **Responde `200` ANTES de processar** (`index.ts:272`: `res.status(200).json({ received: true })` antes do `try`). Consequência crítica: se o processamento lançar exceção (erro transitório de DB), o Asaas **recebe 200 e NUNCA reenvia** → **perda permanente e silenciosa** de um evento de pagamento. Isto é pior que replay: um soluço de DB às 3h da manhã = status financeiro errado para sempre, sem alerta.
- **Sem idempotency-key / sem ordenação de eventos:** não há dedup por ID de evento nem tratamento de entrega fora de ordem. `PAYMENT_UPDATED`/`PAYMENT_REFUNDED`/`PAYMENT_DELETED` podem chegar fora de ordem e reverter um status para valor obsoleto.
- **Parsing frágil** de `externalReference` por `split('-')` (`index.ts:333`) rodando sobre SQL cru.

**→ Novo débito: SYS-19 (Alto).**

### 2. `webhook_logs` — Auditoria

**Confirmação definitiva (fecha a pergunta aberta 6 do @data-engineer):**
- `drizzle/0032_dizzy_spacker_dave.sql:67-81` **cria** `webhook_logs`.
- `drizzle/0033_good_lila_cheney.sql:5` **`DROP TABLE \`webhook_logs\``**. Nenhuma migration posterior (até `0062`) a recria. **A tabela não existe.** Também não está em `drizzle/schema.ts` (ORM não a conhece).
- A mesma migration `0033` também dropa `payment_audit_logs`, `payment_reconciliations`, `asaas_payments`, `asaas_customers` — **todo o subsistema de auditoria/reconciliação de pagamento foi removido.**
- **Bug adicional:** mesmo que a tabela existisse, o `INSERT` em `index.ts:369` usa colunas `(event, asaas_payment_id, payload, processed, error, created_at)` que **nunca bateram** com o schema `0032` (`source` NOT NULL, `event_type`, `related_payment_id`, `error_message`) — o insert **sempre falharia** por coluna inexistente + `source`/`event_type` NOT NULL omitidos.
- O `INSERT` está dentro de `try/catch (logErr)` que só faz `console.warn` (`index.ts:372-374`) → **falha 100% silenciosa em todo webhook**. Não há retenção porque não há linhas. **Não existe trilha de auditoria de eventos financeiros.**

**→ Novo débito: DB-21 (Alto)** — cross-cutting (dados + sistema + segurança/forense).

### 3. Segurança PDF/Email

**PDF — gap PARCIALMENTE REFUTADO.** `server/_core/htmlToPdf.ts:1-24` é um **misnomer**: o cabeçalho documenta que a implementação Puppeteer/Chrome foi **substituída por PDFKit**. O PDF é montado a partir de **estrutura de dados tipada** (`PdfSection`), desenhando texto via PDFKit — **não há parse de HTML, não há browser, não há fetch de imagem remota**. Portanto o risco **SSRF / HTML-CSS injection que o QA levantou (G-3) NÃO se aplica**. Residual real: texto do usuário é desenhado sem escape, mas em PDFKit isso é inerte (não executa). Não encontrei, no renderer genérico, quebra de isolamento por dono — o scoping de dados é responsabilidade das rotas que chamam o renderer (território DB-03), não do `htmlToPdf`. **A severidade de "SYS-20 PDF" cai de Médio (SSRF) para Baixo (higiene).**

**Email — gap CONFIRMADO (menor que "crítico", mas real).** `server/_core/welcomeEmail.ts:14,24,32` interpola `${data.clientName}` e `${data.quotaName}` **direto no HTML sem escape**; `email.ts:29,53,76,99` interpola `clientName/clientEmail` em conteúdo de notificação. Campos controláveis pelo usuário (nome do cliente) → **HTML/template injection no corpo do email** (conteúdo de phishing embutido, markup arbitrário). O destinatário `to: data.clientEmail` sem sanitização abre **header injection** se o transporte não normalizar `\r\n` (depende de `emailService.sendEmail`). Falha de SMTP é silenciosa (retorno boolean ignorado nos callers) — família R-5.

**→ Novos débitos: SYS-20 (Baixo, PDF higiene — reclassificado), SYS-21 (Médio, email injection/confiabilidade).**

### 4. Backup/Restore + Google Drive OAuth

**Arquivos:** `server/backup.ts`, `server/databaseBackup.ts`, `server/downloadBackupRoute.ts`, `server/setup-google-drive.ts`, `server/storage.ts`

Achados (confirmados, severos):
- **Vazamento de segredos no ZIP de backup (crítico):** `backup.ts:69-79` faz `archive.glob('**/*')` de `process.cwd()` inteiro, com ignore list = `node_modules,.git,dist,*.zip,*.log,backups`. **`.env`, `google-drive-token.json` e `google-drive-credentials.json` NÃO estão excluídos.** O ZIP de backup embute: dump completo do banco (todo PII/financeiro) **+ `.env` (DATABASE_URL, chave Asaas) + token/credenciais OAuth do Google**. Enviado ao storage proxy (`storagePut`) **sem criptografia**. Isto é exfiltração de segredo + PII num único artefato — reforça **R-4** materialmente (não é só "25 scripts leem a chave"; o backup a empacota e publica).
- **Dump destrutivo:** `databaseBackup.ts:65` gera `DROP TABLE IF EXISTS` para cada tabela com `SET FOREIGN_KEY_CHECKS=0` (`:48`). Um restore desse dump é **totalmente destrutivo**; sobre schema com drift (SYS-01/DB-04) = catastrófico. Confirma **R-3**.
- **OAuth Google Drive frágil:** `setup-google-drive.ts:7,51-58` grava o token em `google-drive-token.json` na **raiz do projeto, em texto plano**, via fluxo `@google-cloud/local-auth` **interativo** (abre navegador, exige humano). Sem lógica de refresh/renovação visível; `folderId` hardcoded (`:69`). Se o refresh token expirar/for revogado, o backup para Drive **para em silêncio**. (Observação: `backup.ts` na prática usa `storagePut` para o proxy de storage, não o Drive — a integração Drive parece paralela/vestigial, o que por si é um gap de clareza de DR.)
- **Controle de acesso ao download — OK, com ressalva:** `downloadBackupRoute.ts:15-22` **tem** gate de admin (`sdk.authenticateRequest` + `role==='admin'`). Bom. Ressalva: `:51` faz `res.redirect(backupData.s3Url)` para a URL crua retornada por `storagePut`. Se essa URL for pública/长-lived (não assinada por request), quem obtiver a URL **contorna o gate de admin** — e o artefato contém segredos. A publicidade da URL depende do proxy de storage (não determinável só pelo código); registrar como risco a verificar.
- **Constituição AIOX:** `backup_history` vive no próprio DB gerenciado (`backup.ts:7,152`), o que o QA sinalizou como violação a verificar — confirmado que o histórico de backup está dentro do DB que ele faz backup.

**→ Novo débito: SYS-22 (Alto)** — segurança (exfiltração de segredo/PII) + DR não auditado. É o débito novo mais grave desta rodada, empatado com DB-21.

### 5. Cron de Inadimplência — Reavaliação de Severidade

**Arquivo real:** `server/jobs/updateOverdueStatus.ts` (o QA referia `updateOverdueStatus`; ele **não** está em `cronJobs.ts`, e sim em `server/jobs/`).

Achados:
- **Três `UPDATE` em `sql.raw`, NÃO transacionais** (`:36-59`): `inspection_charges`, `bpo_charges`, `fuel_records`. Falha no 2º deixa estado **parcial/inconsistente de inadimplência** entre as 3 tabelas.
- **Falha silenciosa** (`:76-79`): o catch retorna zeros e só faz `console.error`. **Sem alerta.** Se o DB oscilar às 00:05, ninguém sabe; cobranças ficam `pending` sendo `overdue` → portal do cliente/admin mostra status financeiro errado; lembretes/dunning que dependem de `overdue` não disparam. Confirma **R-5**.
- **Bug de fuso:** agenda `"5 0 * * *"` em **UTC** (`:87-88`), enquanto os crons de `cronJobs.ts` usam `America/Sao_Paulo`. A fronteira de "vencido" fica ~3h deslocada do meia-noite de Brasília → registros marcados como vencidos cedo/tarde demais.

**Reavaliação de severidade:** o QA está certo que **Baixo é subavaliado** para um job financeiro. Porém o job é **idempotente e auto-cura** (no dia seguinte re-pega as mesmas linhas ainda `pending<CURDATE`), então uma falha isolada **atrasa** a marcação em 1 dia, não corrompe permanentemente. Isso limita o teto. **Severidade sugerida: Médio** (não Alto) — destacado do balde genérico SYS-18. Os defeitos concretos que sustentam Médio são o multi-update não-transacional e o bug de fuso, não perda permanente.

**→ Novo débito: SYS-23 (Médio)** — destacar de SYS-18.

### Bônus — SQL injection de 2ª ordem no cron de despesas (achado colateral)

`server/cronJobs.ts:237,252-268,302-329,361-390` monta `INSERT/SELECT` via `sql.raw()` **interpolando dados externos da API Asaas** (`tx.description`, `tx.id`) — `JSON.stringify(desc)` produz literal com aspas duplas, **não é escape SQL correto** para MySQL/TiDB. É **SQL injection de 2ª ordem** a partir de dados semi-confiáveis do provedor de pagamento. Fonte de risco moderada (Asaas), mas mesma família de DB-02/R-2/R-4.

**→ Novo débito: DB-22 (Médio).**

### LLM/IA (G-8) — registro de completude

`server/_core/llm.ts`, `voiceTranscription.ts`, `imageGeneration.ts` citados na tabela de integrações, sem débito. Não auditado a fundo nesta rodada. Registrar **SYS-24 (Baixo, "não auditado")** para completude: custo, PII enviada a provedor externo, prompt-injection no `AIChatBox`.

---

## Novos Débitos Catalogados

| ID | Débito | Severidade | Área | Descrição (evidência) |
|----|--------|------------|------|-----------------------|
| **DB-21** | `webhook_logs` dropada + auditoria de pagamento inexistente | **Alto** | Dados/Segurança | Tabela criada em `0032` e **DROPada em `0033`** (`0033_good_lila_cheney.sql:5`), nunca recriada, ausente de `schema.ts`; `INSERT` em `index.ts:369` com colunas incompatíveis falha 100% em silêncio. `payment_audit_logs`/`payment_reconciliations` também dropadas. Zero trilha de auditoria financeira. |
| **SYS-22** | Backup empacota segredos + PII sem cripto; DR não auditado | **Alto** | Sistema/Segurança | `backup.ts:69-79` zipa repo inteiro **incluindo `.env` e tokens OAuth**; `databaseBackup.ts:65` restore com `DROP TABLE` destrutivo; `setup-google-drive.ts:58` token OAuth em texto plano na raiz, expiry não tratado. Reforça R-4/R-3. |
| **SYS-19** | Webhook Asaas: sem transação, responde 200 antes de processar, sem idempotency-key/ordenação | **Alto** | Sistema/Integração | `index.ts:272` responde 200 pré-processamento → erro transitório = **perda permanente silenciosa** do evento. `index.ts:310-374` 4+ execuções não transacionais. Token estático (sem HMAC) → replay possível. Parsing `split('-')` frágil (`:333`). |
| **SYS-21** | Email: injeção HTML/template + falha SMTP silenciosa | **Médio** | Sistema/Segurança | `welcomeEmail.ts:24,32` interpola `clientName`/`quotaName` sem escape no HTML; `to` sem sanitização (header injection). Retorno boolean ignorado pelos callers (R-5). |
| **SYS-23** | Cron `updateOverdueStatus` destacado de SYS-18 | **Médio** (era Baixo) | Sistema/Integração | `jobs/updateOverdueStatus.ts:36-59` 3 UPDATEs não transacionais; `:76-79` falha silenciosa sem alerta; `:87` fuso UTC vs America/Sao_Paulo. Idempotente (auto-cura em 1 dia) → teto Médio. |
| **DB-22** | SQLi de 2ª ordem no cron de despesas | **Médio** | Dados/Integração | `cronJobs.ts:252-268,313-390` `sql.raw()` interpolando `tx.description`/`tx.id` da API Asaas com `JSON.stringify` (escape SQL incorreto). Família DB-02/R-2. |
| **SYS-20** | Higiene de geração de PDF (reclassificado) | **Baixo** (era Médio/SSRF) | Sistema | **SSRF/HTML-injection REFUTADO**: `htmlToPdf.ts` é PDFKit, sem HTML/browser/fetch remoto. Residual: texto sem escape (inerte no PDFKit); scoping por dono é território DB-03, não do renderer. |
| **SYS-24** | Integração LLM/IA não auditada | **Baixo** | Sistema/Integração | `_core/llm.ts`, `voiceTranscription.ts`, `imageGeneration.ts`: custo, PII a provedor externo, prompt-injection no `AIChatBox`. Registro de completude. |

**Confirmações abertas — FECHADAS com evidência:**
- **`webhook_logs` existe?** NÃO (dropada em `0033`). → dispara DB-21; muda approach de retenção/auditoria de P0/P1.
- **Provider MySQL vs TiDB?** Evidência forte de **TiDB Cloud** (`databaseBackup.ts:34-36` SSL + comentário). → confirma o gate de DB-01: FK/trigger/CHECK nativos provavelmente indisponíveis, integridade vai para a aplicação.

---

## Avaliação dos Riscos Cruzados R-1..R-6

| Risco | Veredito desta rodada | Ajuste |
|-------|-----------------------|--------|
| **R-1 — Identidade sobre email mutável** | **Confirmado e ampliado.** `cronJobs.ts:62-64` usa `email.toLowerCase()` como chave de `Map` para casar cliente↔cobrança; com email não-UNIQUE (DB-09) dois clientes com mesmo email → um **sobrescreve o outro** no mapa → cobrança atribuída ao cliente errado. Novo ponto de evidência para R-1 além dos 6 débitos já listados. | Mantém como workstream mestre. |
| **R-2 — Corrupção silenciosa financeira** | **Confirmado, pior que o estimado.** SYS-19 (webhook responde 200 antes de processar → perda permanente) + DB-21 (sem auditoria para reconstruir) + ausência de transação nos 3 fluxos (webhook, overdue, cron expenses). Sem `webhook_logs`, uma corrupção **não é sequer detectável forense**. | Elevar prioridade: DB-21 é pré-requisito de observabilidade do workstream. |
| **R-3 — Deploy novo quebra** | **Confirmado.** `databaseBackup.ts` restore com `DROP TABLE` universal (SYS-22) + drift `0033` que dropa PKs/UNIQUEs de ~15 tabelas + `0062` duplicado. Restaurar sobre schema divergente = destruição. | Sem mudança; SYS-22 entra como agravante. |
| **R-4 — Exfiltração de segredo de pagamento** | **Confirmado e ampliado.** Não é só "25 scripts leem a chave": SYS-22 mostra que o **backup empacota `.env` + tokens OAuth + dump PII** num único ZIP publicável. Vetor de exfiltração mais direto que os scripts. | Elevar: rotacionar chave Asaas **e** revisar todo backup já gerado (podem conter `.env`). |
| **R-5 — Família "falha silenciosa"** | **Confirmado em 4 novas superfícies:** webhook (200 antecipado + `catch` warn), `updateOverdueStatus` (catch→zeros sem alerta), cron expenses (`catch{errors++}`), email (boolean ignorado), `webhook_logs` (insert falha em silêncio). O sistema esconde falha em **todas** as camadas de integração, não só no frontend. | Reforça o workstream de observabilidade como transversal a integração, não só UX. |
| **R-6 — Authz sem defesa em profundidade** | **Parcialmente mitigado onde olhei:** `downloadBackupRoute.ts:15-22` **tem** gate de admin real no backend (bom exemplo). Ressalva nova: o `res.redirect` para URL de storage pode furar o gate se a URL for pública (SYS-22). | Sem mudança estrutural; adicionar verificação de que URLs de artefato sensível sejam assinadas/efêmeras. |

---

## Confirmação: SYS-02/CI como débito #0

**CONCORDO integralmente — e a investigação reforça isso com evidência nova e decisiva.**

O argumento do QA já era sólido; esta rodada o torna incontestável: **os testes de caracterização dos caminhos financeiros já existem no repositório mas nunca rodam no CI.** Encontrei `server/webhook.phase2.test.ts`, `server/webhookAsaas.test.ts`, `server/jobs/updateOverdueStatus.test.ts`, `server/payments.test.ts`, `server/clientPayments.test.ts` entre os 83 testes Vitest. A rede de segurança para validar as correções de SYS-19, DB-21, SYS-23 **literalmente existe em disco** — e o CI, rodando só `tsc --noEmit`, **nunca a executa**.

Ou seja: as correções mais perigosas desta rodada (webhook não transacional, auditoria dropada, cron de inadimplência) tocam exatamente os arquivos que **já têm testes que não são executados**. Corrigir qualquer um "às cegas" é injustificável quando a verificação está a um passo de habilitação de CI (6–10h). **SYS-02 é o meta-enabler #0, pré-requisito absoluto de todo o backlog, incluindo DB-02.** Sem refutação.

Sequência de topo confirmada: **SYS-02 (habilitar CI + rodar os 83 testes) → escrever/ligar testes de caracterização de webhook/pagamento/overdue → então refatorar DB-02/DB-03/SYS-19/DB-21.**

---

## Parecer: Assessment pronto para Fase 8?

**SIM — pronto para a Fase 8 consolidar.** Esta rodada 7b entregou exatamente o que o gate NEEDS WORK exigia:

1. **Débitos de integração faltantes catalogados** — SYS-19, SYS-21, SYS-22, SYS-23, SYS-24, SYS-20 (reclassificado), DB-21, DB-22 — com severidade e evidência arquivo:linha.
2. **As 2 confirmações abertas FECHADAS com código** (não mais "talvez"): `webhook_logs` não existe (dropada em `0033`); provider é TiDB Cloud (impacta estratégia de FK de DB-01).
3. **SYS-02 reconfirmado como P0 #0** com evidência nova (testes financeiros existentes não executados).
4. **R-1..R-6 reavaliados** à luz do código, com R-2/R-4/R-5 ampliados e R-6 parcialmente mitigado.

**Uma correção material ao assessment original:** o G-3 (PDF SSRF/HTML-injection) que o QA propunha como SYS-20 Médio **deve ser refutado** — o renderer é PDFKit, não há vetor SSRF. Manter o débito só como higiene Baixo evita inflar o inventário com um risco inexistente (Constitution, Artigo IV — No Invention).

**Recomendação à Fase 8:** consolidar por **workstream** (identidade, integridade financeira, deploy, segredos, observabilidade, authz) conforme R-1..R-6, com **DB-21 promovido a pré-requisito do workstream de integridade financeira** (sem auditoria, nenhuma correção financeira é verificável em produção) e **SYS-22 tratado na mesma janela de emergência que DB-05** (a chave Asaas pode já ter vazado em backups existentes — assumir comprometida e rotacionar). Nada aqui bloqueia iniciar a remediação de emergência (SYS-02 + DB-05 + SYS-22).

---
*Fim da Fase 7b (Gap Coverage). Handoff para Fase 8 (@architect) — incorporar os 8 novos débitos, as 2 confirmações fechadas e a refutação de G-3 ao `technical-debt-assessment.md` final.*

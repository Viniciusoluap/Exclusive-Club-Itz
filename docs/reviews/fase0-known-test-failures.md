# Testes Falhando — Débito Documentado (atualizado pós-correção)

> Levantado em 2026-07-19. Versão original deste documento foi baseada no log de
> diagnóstico do PR #38, que mostrava só as **últimas 40 linhas** do output do
> vitest (limite do step de diagnóstico do CI) — por isso a contagem original de
> "~17 testes" estava **incompleta**. Esta versão foi verificada rodando a suíte
> completa (`pnpm test`) contra um banco MySQL 8.0 real e local (schema aplicado
> via `drizzle-kit push`, mesmo mecanismo do CI), o que dá uma imagem completa.

## O que foi corrigido nesta rodada

| Categoria | Causa raiz | Correção |
|---|---|---|
| 1 — `webhookAsaas.test.ts` (3) | Testava procedure tRPC `webhooks.asaas` inexistente — o webhook real é uma rota Express crua | Lógica extraída para `server/_core/asaasWebhookHandler.ts` (testável), rota Express agora só chama a função. Teste reescrito para chamar a função direto. |
| 1b — `fuelRecords.asaas.test.ts` (2) | Mesmo bug da Categoria 1, em outro arquivo (não capturado no log truncado original) | Mesma correção: chama `processAsaasWebhookEvent` diretamente. |
| 2 — `quotas.test.ts`, `maintenances.*.test.ts` (7) | Banco de teste efêmero (CI) não tem embarcações/manutenções que os testes assumem existir (dado de produção) | Seed em `test-global-setup.ts`: 2 embarcações de teste + 1 manutenção; `maintenances.create.test.ts` busca embarcação dinamicamente em vez de `vesselId: 4` hardcoded. |
| 2b — `fuelRecords.delete.stockReturn.test.ts` (1) | Mesmo padrão: `gallon_stock` vazio num banco novo | Seed condicional (só se vazio) de 1 galão de referência — não é dado de teste descartável, é referência operacional. |
| 3 — `inspectionCharges.myCharges.test.ts` (1) | Fixture com `due_date` fixo no passado (`2025-12-31`) virou "overdue" com o tempo | Data relativa (`Date.now() + 30 dias`). |
| 4 — `inspectionCharges.requestDueDateChange.test.ts` (3) | Catch genérico mascarava `TRPCError NOT_FOUND` intencional com mensagem fallback | `if (error instanceof TRPCError) throw error;` antes do catch genérico. Mesma correção aplicada a 2 irmãos idênticos (`inspectionCharges.markAsPaid`, `fuelRecords.markAsPaid`). |
| 5 — `pdf.generation.test.ts` (1) | `data.quotas[0]` quebrava se `data.quotas` fosse `undefined` (só o `[0]` era guardado, não o array todo) | `const quotas = data.quotas ?? [];` usado em todas as 4 dereferências. |
| 6 — `expensesRouter.test.ts` (2) | Router renomeado: teste chamava `saas.getFilteredStats`, rota real é `bpo.getStats` | Corrigidas as 2 chamadas. |
| SQLi `bpoRouter.ts` (achado durante a Categoria 6) | 37 ocorrências de `sql.raw()` com interpolação de string — mesma classe de vulnerabilidade da Story 2 (Fase 0), mas neste arquivo não coberta | Todas convertidas para `sql\`\`` parametrizado. 3 exceções documentadas (LIMIT/OFFSET numérico validado por zod, sem vetor de injeção). |

**Verificação:** `tsc --noEmit` limpo. Suíte completa rodada 2x contra MySQL 8.0 real: de 26 falhas (1ª rodada, antes dos 2 fixes extras) para 23 falhas (2ª rodada). Todas as categorias acima confirmadas resolvidas nessa suíte real.

## Decisões do responsável do projeto (resolvidas)

### A) `quotas.test.ts > deve bloquear reservas em segundas-feiras` — decisão: é intencional

Confirmado: a exceção do admin é intencional (admin pode abrir reserva em nome do cliente mesmo às segundas). O teste original foi dividido em dois: um cobrindo o bloqueio real (via `bookings.create`, fluxo do cliente) e outro confirmando explicitamente a exceção do admin (via `bookings.createForClient`). Nenhuma mudança de comportamento do sistema, só o teste passou a refletir a regra de negócio correta.

### B) `employees.email-extensions.test.ts > deve rejeitar email duplicado` — decisão: corrigir imediatamente

Corrigido com uma constraint `UNIQUE` real em `employees.email` (`drizzle/schema.ts` + migration `drizzle/0064_employees_email_unique.sql`). Antes, a coluna só tinha `INDEX` comum — o catch de `ER_DUP_ENTRY` em `employees.create` nunca disparava, então duplicatas eram aceitas silenciosamente.

**Achado histórico relevante:** a migration `0033_good_lila_cheney.sql` (linha 7) mostra que essa coluna **já teve** uma constraint `employees_email_unique` no passado, e foi explicitamente dropada naquela migration (substituída por um índice comum). Esse mesmo arquivo já tinha outros 2 bugs confirmados anteriormente nesta investigação (`DROP PRIMARY KEY` sem substituto, `DEFAULT 'CURRENT_TIMESTAMP'` como string). É plausível que a perda da constraint única tenha sido um efeito colateral não intencional daquela migration, não uma decisão de negócio — o código da aplicação nunca parou de esperar esse comportamento.

**⚠️ Pré-requisito antes de aplicar em produção:** se já existir mais de um funcionário com o mesmo email hoje, a migration falha (testado localmente: `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE` rejeita com `ER_DUP_ENTRY` quando há duplicata pré-existente). Antes de aplicar, rodar:
```sql
SELECT email, COUNT(*) FROM employees GROUP BY email HAVING COUNT(*) > 1;
```
e resolver manualmente qualquer duplicata encontrada. Migration testada localmente nos dois cenários (com e sem duplicata) — comportamento confirmado.

## CI real (PR #39): Asaas sem secret + notifyOwner com contrato quebrado

O primeiro run do CI real (GitHub Actions, TiDB efêmero) confirmou exatamente os itens acima que dependiam de rede: `ci.yml` nunca configurou `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN` como secrets, então qualquer teste que chama a API real da Asaas falhava com `invalid_access_token` (a rede *funciona* no GitHub Actions — diferente deste sandbox de verificação local — só a credencial que faltava).

**Correções aplicadas:**

- `ci.yml`: passo "Run tests" agora injeta `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN` a partir de `secrets.*`. Os dois secrets precisam ser cadastrados manualmente em Settings → Secrets and variables → Actions (não é algo que dá pra automatizar com segurança — a API do GitHub exige criptografar o valor com a chave pública do repo antes de enviar).
- `asaas.auth.test.ts`, `asaas.integration.test.ts`, `asaas.test.ts`, `inspectionCharges.cpfcnpj.test.ts`, `inspectionCharges.customer.test.ts`: os 16 testes que fazem chamada real à API sandbox agora usam `it.skipIf(!process.env.ASAAS_API_KEY)` — pulam graciosamente (em vez de falhar) quando o secret não está disponível (ex: PR de fork, que não recebe secrets). Os 2 testes que só *checam* se a env var existe (sem chamar a API) continuam rodando sempre.
- **Bug real encontrado em `asaas.test.ts`:** o arquivo batia direto em `https://api.asaas.com/v3` (produção) independente do tipo de chave — com uma chave sandbox (`$aact_hmlg_...`), isso falharia mesmo com o secret configurado. Corrigido para usar a mesma detecção sandbox/produção já existente em `server/_core/asaas.ts` (prefixo `$aact_prod_` → produção, qualquer outro → `sandbox.asaas.com/api/v3`).
- **Bug real encontrado em `server/_core/notification.ts`:** o docstring de `notifyOwner()` documenta que a função "Retorna `false` quando o serviço não pode ser alcançado (callers podem cair para email/slack)" — e é exatamente isso que todo o resto da função faz (network error, resposta não-ok). Mas os dois guards de configuração ausente (`forgeApiUrl`/`forgeApiKey`) violavam esse contrato e lançavam `TRPCError` em vez de retornar `false`, quebrando qualquer fluxo não relacionado que chamasse `notifyOwner` (era exatamente por isso que `maintenances.create.test.ts` falhava). Corrigido para seguir o mesmo contrato documentado: loga um aviso e retorna `false`.

**Verificação:** suíte completa rodada de novo localmente sem `ASAAS_API_KEY` configurada — caiu de 21 para **7 falhas**, todas as 16 chamadas de rede Asaas agora aparecem como *skipped* (não failed). O comportamento com o secret configurado só pode ser confirmado no CI real, não neste sandbox (rede bloqueada aqui).

**Confirmado no CI real (2ª rodada):** exatamente os 7 esperados falharam, todos por falta dos secrets (ainda não cadastrados) — nenhuma regressão nova. Nota técnica: como o GitHub Actions substitui um secret inexistente por string vazia `""` em vez de deixar a env var indefinida, os testes que antes falhavam com `expected undefined to be defined` agora falham com `expected '' not to be ''` — mesma causa raiz, mensagem de assert diferente. `it.skipIf` não é afetado (`""` e `undefined` são igualmente falsy).

## Secrets cadastrados: fechamento final do débito

Com `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN` cadastrados como secrets do repositório, o CI real passou a executar de verdade os 16 testes que antes só pulavam — e isso revelou 3 problemas novos, só visíveis com uma chave real ativa (516 passaram, contra 503 antes; 1 skip restante, contra 14):

- **Bug confirmado em `asaas.auth.test.ts > deve lançar erro se ASAAS_API_KEY não estiver configurada`:** exatamente o bug latente já documentado acima — a função `resolveAsaasApiKey()` lia `ENV.asaasApiKey`, um valor capturado uma única vez na primeira importação de `server/_core/env.ts`. Com uma chave real configurada no processo, apagar `process.env.ASAAS_API_KEY` em runtime (o que o teste faz para simular "chave ausente") não tinha efeito nenhum sobre esse valor já congelado. **Corrigido:** `resolveAsaasApiKey()` agora lê `process.env.ASAAS_API_KEY` diretamente, não mais via `ENV`. Nenhum outro ponto do código usava `ENV.asaasApiKey` na produção (só um teste, `asaas.test.ts`, que não faz mutação em runtime e não é afetado).
- **CPF/CNPJ ausente em `asaas.auth.test.ts`/`asaas.integration.test.ts` (testes de criação de cobrança):** com a chave real, a chamada chegou pela primeira vez até a validação de negócio real da Asaas, que rejeita criar cobrança para cliente sem CPF/CNPJ (`invalid_object`) — exatamente o bug que `inspectionCharges.cpfcnpj.test.ts` foi criado para cobrir. Os testes de criação de cliente para cobrança não passavam esse campo. **Corrigido:** adicionado `cpfCnpj: "24971563792"` (mesmo CPF de teste válido já usado em `inspectionCharges.cpfcnpj.test.ts`) nas duas chamadas de `getOrCreateCustomer`.
- **Mensagem de erro desatualizada em `fuelRecords.generatePayment.test.ts > deve rejeitar se nenhum abastecimento pendente for encontrado`:** mesma classe de bug da Categoria 4 (teste esperando uma mensagem antiga, `"Nenhum abastecimento pendente encontrado para pagamento"`, que não existe mais em `routers.ts` — a mensagem real e atual é `"Abastecimento não encontrado ou já foi pago"`, já usada corretamente por outro teste no mesmo arquivo para o mesmo cenário). **Corrigido:** string esperada atualizada para bater com o código real.

**Arquivos órfãos deletados** (não reescritos — ver justificativa completa acima): `webhook.phase2.test.ts` (arquitetura `subscription_charges`/`asaas_payments` substituída por `bpo_charges`, webhook atual já coberto por `webhookAsaas.test.ts`/`fuelRecords.asaas.test.ts`) e `googleDriveUpload.test.ts` (módulo `uploadToGoogleDrive` nunca existiu no histórico do git; `runBackup()` atual não faz upload para o Drive).

**Estado final local (sem `ASAAS_API_KEY`, ambiente de verificação sem rede pro sandbox):** 4 falhas — as 2 checagens de "chave configurada" (esperadas sem secret neste ambiente local) e `backupRouter.test.ts` (aguardando confirmação no TiDB real do CI, ver item abaixo). Total de arquivos de teste: 83 (85 − 2 deletados).

**Achado adicional, não corrigido (fora de escopo desta rodada):** `asaas.auth.test.ts > deve lançar erro se ASAAS_API_KEY não estiver configurada` tenta simular "chave ausente" com `delete process.env.ASAAS_API_KEY` em runtime, mas `resolveAsaasApiKey()` lê `ENV.asaasApiKey` (`server/_core/env.ts`), uma constante calculada **uma única vez** na primeira importação do módulo — a partir daí, apagar `process.env.ASAAS_API_KEY` em runtime não tem efeito nenhum sobre esse valor já capturado. Ou seja: mesmo depois que os secrets forem cadastrados, esse teste específico provavelmente vai continuar falhando (por um motivo diferente do atual). Corrigir exigiria decidir entre reescrever o teste (mock em vez de deletar env var) ou mudar `ENV` para ler `process.env` sob demanda em vez de capturar no import — mudança de escopo maior, não incluída aqui.

## Débito remanescente — pré-existente, não relacionado a este trabalho

| Falha | Causa | Ação sugerida |
|---|---|---|
| `webhook.phase2.test.ts` (arquivo inteiro) | Importa `./webhookRouter`, módulo que **nunca existiu** no histórico do repo (confirmado via `git log`) | Arquivo de teste morto/órfão — remover ou reescrever contra a interface real, fora de escopo aqui. |
| `googleDriveUpload.test.ts` (3) | Import `./googleDriveUpload` não resolve (path/arquivo ausente) | Mesma categoria: teste órfão, investigar separadamente. |
| `backupRouter.test.ts > getStats` | MySQL 8.0 (modo estrito) rejeita datetime `'...Z'` (ISO 8601) em `INSERT` direto — pode ser específico de MySQL vanilla e não reproduzir em TiDB (que é o que o CI real usa) | Verificar contra TiDB real antes de tratar como bug — pode ser um falso positivo da minha verificação local. |

## Resumo

- **15 testes corrigidos** (Categorias 1-6 + 2 extras + as 2 decisões resolvidas) + **37 ocorrências de SQL injection eliminadas** em `bpoRouter.ts` + **1 migration de integridade de dados** (email único de funcionários) + **secrets Asaas conectados ao CI** (16 testes deixam de ser débito, passam a rodar de verdade) + **2 bugs reais adicionais corrigidos** (`asaas.test.ts` batendo no host errado; `notifyOwner` violando seu próprio contrato de graceful degradation).
- Suíte completa rodada localmente contra MySQL 8.0 real ao longo do processo: 26 → 23 → 21 → **7 falhas** (sem secrets configurados; as 16 chamadas de rede Asaas viram skip em vez de fail).
- **4 falhas remanescentes são débito pré-existente e não relacionado**: 2 arquivos de teste órfãos (módulos deletados: `webhookRouter`, `googleDriveUpload`) e um possível falso-positivo de MySQL-vs-TiDB em `backupRouter.test.ts`. As outras 3 falhas locais (`deve ter ASAAS_API_KEY configurada` etc.) são esperadas *sem* secret e devem passar assim que os secrets forem cadastrados no repositório.

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

## Pendente de decisão do responsável do projeto (NÃO decidido unilateralmente)

### A) `quotas.test.ts > deve bloquear reservas em segundas-feiras`

`bookings.create` (cliente) bloqueia reserva às segundas-feiras; `bookings.createForClient` (admin reservando em nome de cliente) **não tem essa checagem**. Só ficou visível agora que a embarcação passou a ser encontrada (antes o teste falhava antes de chegar nessa lógica). Pode ser intencional (admin abre exceção) ou bug. **Aguardando decisão.**

### B) `employees.email-extensions.test.ts > deve rejeitar email duplicado`

`employees.create` tenta capturar erro de duplicidade do MySQL (`ER_DUP_ENTRY`/1062), mas a coluna `employees.email` só tem `INDEX` comum, não `UNIQUE` — o erro nunca é lançado, emails duplicados são aceitos silenciosamente. Correção exigiria migration (`UNIQUE INDEX`), com risco de falhar se já existir duplicata em produção. **Aguardando decisão.**

## Débito remanescente — pré-existente, não relacionado a este trabalho

| Falha | Causa | Ação sugerida |
|---|---|---|
| `webhook.phase2.test.ts` (arquivo inteiro) | Importa `./webhookRouter`, módulo que **nunca existiu** no histórico do repo (confirmado via `git log`) | Arquivo de teste morto/órfão — remover ou reescrever contra a interface real, fora de escopo aqui. |
| `googleDriveUpload.test.ts` (3) | Import `./googleDriveUpload` não resolve (path/arquivo ausente) | Mesma categoria: teste órfão, investigar separadamente. |
| `asaas.auth.test.ts` (6), `asaas.integration.test.ts` (3), `asaas.test.ts` (2), `inspectionCharges.cpfcnpj.test.ts` (3), `inspectionCharges.customer.test.ts` (2) | Dependem de `ASAAS_API_KEY` real e acesso de rede a `sandbox.asaas.com` — bloqueado neste sandbox local; **incerto se `ci.yml` configura isso** para o GitHub Actions real | Verificar se `ci.yml` precisa de um secret `ASAAS_API_KEY` de sandbox para esses testes passarem em CI real. |
| `maintenances.create.test.ts` | Após corrigir a busca de embarcação (Categoria 2), passou a falhar em outro ponto: `Notification service URL is not configured` (`ENV.forgeApiUrl` ausente) | Gap de configuração de ambiente de teste, não relacionado à correção desta rodada — documentar para Fase 1. |
| `backupRouter.test.ts > getStats` | MySQL 8.0 (modo estrito) rejeita datetime `'...Z'` (ISO 8601) em `INSERT` direto — pode ser específico de MySQL vanilla e não reproduzir em TiDB (que é o que o CI real usa) | Verificar contra TiDB real antes de tratar como bug — pode ser um falso positivo da minha verificação local. |

## Resumo

- **~13 testes corrigidos nesta rodada** (Categorias 1-6 + 2 extras encontrados) + **37 ocorrências de SQL injection eliminadas** em `bpoRouter.ts`.
- **2 itens aguardam decisão de negócio/risco** antes de fechar (regra de segunda-feira no admin; constraint de email único).
- **~20 falhas remanescentes são débito pré-existente e não relacionado**: testes órfãos (módulos deletados), dependência de rede/API externa bloqueada neste sandbox, e um gap de configuração de notificação — nenhum bloqueia as correções desta rodada.

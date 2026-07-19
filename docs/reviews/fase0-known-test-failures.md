# Testes Falhando Pós-Fase 0 — Débito Documentado

> Levantado em 2026-07-19, durante a implementação da Fase 0 (Story 1 — habilitar CI real).
> Estes ~17 testes falham com o CI agora **realmente funcional** (TiDB efêmero + schema completo
> aplicado + typecheck). Nenhum deles está relacionado às 5 correções de segurança da Fase 0
> (SQL injection, backup, webhook_logs, chave Asaas, CI) — são problemas pré-existentes que o CI
> nunca tinha tido a chance de expor, porque antes da Story 1 o pipeline só rodava `tsc`.
>
> Decisão do responsável pelo projeto: não corrigir agora, documentar como débito e priorizar depois.
> Enquanto não forem corrigidos, o CI deste PR permanece "failing" — isso é esperado e correto
> (é exatamente o que a Story 1 foi desenhada para revelar), não uma regressão introduzida por ela.

## Categoria 1 — Rota tRPC ausente (possível gap real, ligado a SYS-19)

**Arquivo:** `server/webhookAsaas.test.ts` (3 testes)
**Erro:** `TRPCError: No procedure found on path "webhooks,asaas"`

Os testes chamam um procedure `webhooks.asaas` que não existe na árvore de routers atual.
Pode ser: (a) um router renomeado/removido sem atualizar o teste, ou (b) um gap real na
integração de webhook — vale checar junto da Story 9 (Fase 1, "Webhook Asaas transacional,
idempotente e sem 200 antecipado", SYS-19) quando essa story for trabalhada.

## Categoria 2 — Isolamento entre testes (dados de um teste dependem de outro)

**Arquivos:** `server/quotas.test.ts` (5), `server/maintenances.create.test.ts` (1),
`server/maintenances.getActive.test.ts` (2)

Erros como "Lancha não encontrada", "Jetski não encontrado", "Embarcações não encontradas",
"Embarcação não encontrada", "expected 0 to be greater than 0" — sintoma clássico de testes que
esperam registros (embarcações, vistorias) criados por OUTRO arquivo/teste rodando antes, numa
suíte que compartilha um único banco efêmero sem isolamento/transação por teste. Corrigir exige
ou fixtures próprias por teste, ou uma estratégia de isolamento (schema/transação por arquivo de
teste).

## Categoria 3 — Teste sensível à data atual

**Arquivo:** `server/inspectionCharges.myCharges.test.ts` (1 teste)
**Erro:** esperado `status: 'pending'`, recebido `status: 'overdue'`

A fixture usa uma data de vencimento fixa no passado; como "hoje" avança a cada execução, o
status calculado (`pending` vs `overdue`) muda. Precisa de uma data relativa (`Date.now() + N
dias`) em vez de fixa.

## Categoria 4 — Mensagem de erro divergente

**Arquivo:** `server/inspectionCharges.requestDueDateChange.test.ts` (3 testes)
**Erro:** esperado `"Cobrança não encontrada"`, recebido `"Erro ao solicitar mudança de
vencimento. Tente novamente."`

O código parece ter uma mensagem de erro genérica de fallback que está mascarando a mensagem
específica que o teste espera — possível regressão de um catch genérico em algum ponto do
handler, ou o teste está desatualizado em relação ao comportamento atual.

## Categoria 5 — Bug real de runtime

**Arquivo:** `server/pdf.generation.test.ts` (1 teste)
**Erro:** `TypeError: Cannot read properties of undefined (reading '0')` em
`server/_core/htmlToPdf.ts:479`

Este parece ser um bug de verdade na geração de PDF de contrato (acesso a um array/objeto
indefinido), não um problema de fixture/isolamento. Candidato a investigação prioritária dentro
deste grupo, já que os demais são majoritariamente débito de teste.

## Categoria 6 — Mensagem de asserção genérica (baixa prioridade)

**Arquivo:** `server/routers/expensesRouter.test.ts` (1 teste)
Mensagem de erro não bate com o regex esperado (`/database|Database|INTERNAL_SERVER_ERROR/i`) —
provavelmente um efeito colateral da mesma rota `saas.getFilteredStats` não encontrada, correlato
à Categoria 1.

## Resumo

| Categoria | Testes | Prioridade sugerida |
|-----------|--------|----------------------|
| 1 — Rota tRPC ausente | 3-4 | Média (checar junto com Story 9 / SYS-19) |
| 2 — Isolamento entre testes | 8 | Média (débito de infraestrutura de teste) |
| 3 — Data fixa na fixture | 1 | Baixa (fix trivial) |
| 4 — Mensagem de erro divergente | 3 | Baixa-Média (checar se é regressão real) |
| 5 — Bug de runtime em PDF | 1 | **Alta** (bug de produto, não de teste) |
| 6 — Correlato à Categoria 1 | 1 | Baixa |

**Total: ~17 testes.** Nenhum bloqueia as correções de segurança da Fase 0 — são independentes.

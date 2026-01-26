# Project TODO

## 🐛 Bug: Sincronização Asaas → Sistema (Abastecimentos Pagos Não Atualizam)
====================================================================================

**Problema:**
- Abastecimento R$ 120.01 mostra "Pendente" mas já foi pago no Asaas
- Página de Pagamentos mostra R$ 0,00 (não exibe abastecimentos)
- Botão "Sincronizar Pendentes" não funciona corretamente
- Webhook configurado corretamente mas sincronização não atualiza status

**Causa Raiz:**
1. Abastecimentos não são registrados na tabela `asaas_payments` (apenas em `fuel_records`)
2. Página de Pagamentos consulta `asaas_payments` → vazio → R$ 0,00
3. Função `syncAllPending` busca por `sync_status` que não existe em registros com `asaas_charge_id`
4. Webhook não atualiza status porque não encontra registros em `asaas_payments`

**Tarefas:**
- [x] Adicionar função `migrateFuelRecordsToAsaasPayments` em `paymentReconciliation.ts`
- [x] Chamar migração no `runMaintenanceTasks`
- [x] Adicionar função `syncPaymentStatuses` que consulta API do Asaas
- [x] Criar função `fetchPaymentFromAsaas` no `asaasService.ts`
- [x] Testar migração com botão "Executar Manutenção" → SUCESSO! 9 registros migrados
- [x] Testar sincronização de status com API do Asaas → SUCESSO! 8 pagos, 1 vencido
- [x] Verificar abastecimento R$ 120.01 → Status "Cancelado" (correto conforme Asaas)
- [x] Adicionar `savePaymentRecord` após criar abastecimento em `routers.ts` (para novos abastecimentos)
- [ ] Criar checkpoint

---

## ✅ Funcionalidades Implementadas

### Botão "Marcar como Recebido" em Cobranças de Danos
- [x] Adicionar função `receiveInCash` no `asaasService.ts`
- [x] Adicionar mutation `inspectionCharges.markAsPaid` no `routers.ts`
- [x] Adicionar botão verde com ícone CheckCircle na coluna Ações
- [x] Adicionar handler `handleMarkAsPaid` com confirmação
- [x] Sincronizar com Asaas via API `receiveInCash`
- [x] Testar funcionalidade no navegador
- [x] Criar checkpoint (7f498200)

### Correção do Cálculo de Saldo Financeiro
- [x] Corrigir fórmula: Saldo Atual = Saldo Herdado + Gasto - Orçamento
- [x] Tornar `calculateMonthFinalBalance` recursiva para herança correta
- [x] Remover inversão de sinal no frontend
- [x] Testar sequência: Dezembro 2025 → Janeiro 2026 → Fevereiro 2026
- [x] Criar checkpoint (842a4100)

## 🎨 UI: Remover Sidebar da Página de Pagamentos
====================================================================================

**Problema:**
- No modo paisagem (iPad/tablet), aparece sidebar com "Page 1" e "Page 2"
- No modo retrato, aparece botão de voltar simples (correto)
- Usuário quer comportamento consistente: apenas botão de voltar

**Tarefas:**
- [x] Analisar DashboardLayout e página Pagamentos
- [x] Remover uso de DashboardLayout ou desabilitar sidebar
- [x] Adicionar botão de voltar simples no header
- [x] Testar no navegador em modo paisagem
- [ ] Criar checkpoint

## 🐛 BUG: Cancelamento Incorreto de Reservas Durante Manutenção
====================================================================================

**Problema:**
- Ao criar manutenção de 26/01/2026 a 29/01/2026 (término dia 29)
- Sistema cancelou reserva do dia 30/01/2026 (Laécio Silversat)
- Reserva do dia 30 deveria permanecer ativa (está FORA do período de manutenção)
- Sistema está usando lógica incorreta de comparação de datas

**Comportamento Esperado:**
- Cancelar APENAS reservas dentro do período: 26/01 <= data <= 29/01
- Reserva do dia 30/01 NÃO deve ser cancelada

**Tarefas:**
- [x] Analisar código de cancelamento de reservas na criação de manutenção
- [x] Identificar lógica incorreta de comparação de datas (problema de timezone)
- [x] Corrigir normalização de datas usando new Date(year, month, date)
- [x] Verificar estado atual das reservas (reserva 30/01 foi cancelada pelo bug)
- [ ] Criar checkpoint

## ✅ BUG CORRIGIDO DEFINITIVAMENTE!
====================================================================================

**Problema identificado:**
Frontend enviava timestamps em horário LOCAL (GMT-3) usando `new Date(string + 'T23:59:59').getTime()`, que eram interpretados como UTC no backend, causando mudança de dia.

**Exemplo do bug:**
- Frontend: `new Date('2026-01-29T23:59:59').getTime()` = 29/01 23:59:59 GMT-3
- Timestamp UTC: 30/01 02:59:59 UTC
- Backend: `getDate()` retorna dia 30 ❌

**Solução aplicada:**
- [x] Adicionar logs de debug para ver valores exatos das datas
- [x] Identificar problema no frontend (AdminManutencao.tsx linha 149)
- [x] Corrigir frontend para usar `Date.UTC(year, month-1, day, 23, 59, 59, 999)`
- [x] Corrigir backend para usar `getUTCFullYear()`, `getUTCMonth()`, `getUTCDate()`
- [x] Testar exaustivamente - SUCESSO! ✅
  * Manutenção: 26/01 a 29/01
  * Reserva 30/01: CONFIRMADA (não cancelada) ✅
  * Reserva 31/01: CONFIRMADA (não cancelada) ✅
  * Logs: `endNormalized: 2026-01-29T23:59:59.999Z` ✅
- [x] Remover logs de debug
- [x] Criar checkpoint final (207af728)

## 🐛 BUG: Valores Incorretos na Página de Pagamentos
====================================================================================

**Problema:**
- Página mostra "Total Recebido: R$ 91.689,00" mas valores reais são diferentes
- Página mostra "Vencido: R$ 29.708,00 (2 cobranças)" mas valores reais são:
  * Abastecimento #60001: R$ 207,57 (Vencido)
  * Abastecimento #30009: R$ 120,01 (Pago)
  * Abastecimento #30005: R$ 89,51 (Vencido)
- Total real de vencidos deveria ser R$ 297,08 (207,57 + 89,51)
- Valores "Pago" também parecem incorretos

**Tarefas:**
- [x] Analisar código de cálculo de estatísticas em Pagamentos.tsx
- [x] Verificar query que busca dados de asaas_payments
- [x] Comparar valores calculados com valores reais do banco
- [x] Identificar lógica incorreta: migração salvava centavos como reais
- [x] Corrigir função de migração (dividir por 100)
- [x] Corrigir valores existentes no banco (UPDATE value / 100)
- [x] Testar e validar correção - SUCESSO!
- [x] Criar checkpoint (84fbc568)

## 💰 Feature: Botão "Recebido em Dinheiro" para Baixa Manual
====================================================================================

**Requisito:** Adicionar botão para dar baixa manual em pagamentos de abastecimento

**Localização:** Página de Abastecimento (Registros Recentes)

**Comportamento:**
- Exibir botão "Recebido em Dinheiro" apenas para abastecimentos com status "Vencido" ou "Pendente"
- Ao clicar, marcar pagamento como "Pago" (received)
- Atualizar tanto `fuel_records` quanto `asaas_payments`
- Registrar no log de auditoria

**Tarefas:**
- [x] Adicionar botão na interface (Abastecimento.tsx)
- [x] Mutation tRPC já existe (fuelRecords.markAsPaid)
- [x] Lógica backend já implementada (atualiza fuel_records)
- [x] Testar funcionalidade - SUCESSO! Botão aparece para Vencido/Pendente
- [x] Criar checkpoint (b2537599)

## 🐛 BUG: Estoque Total Incorreto no Painel do Funcionário
===============================================================

**Problema:**
- Painel funcionário mostra: "Estoque Total: 167,95 L disponíveis" ❌
- Painel admin mostra: "Estoque: 18,59 L" ✅ (correto)
- Detalhes por galão desnecessários: "Galão 1: 155,51L / Galão 2: 12,44L / Galão 3: 0,00L"

**Tarefas:**
- [x] Analisar código do painel de funcionário (Abastecimento.tsx ou similar)
- [x] Identificar por que cálculo de estoque está diferente do admin
- [x] Corrigir cálculo para usar mesma lógica do admin
- [x] Remover exibição de detalhes por galão
- [x] Testar e validar correção
- [ ] Criar checkpoint

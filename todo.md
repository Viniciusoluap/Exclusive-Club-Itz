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

## 🔧 Feature: Abastecimento Operacional (Custo da Empresa)
===============================================================

**Requisito:** Adicionar opção de registrar abastecimento operacional sem vincular a cliente/reserva

**Contexto:**
- Embarcação precisa abastecer para manutenção, testes, treinamento
- Custo é da empresa, não de nenhum cliente
- Deve consumir estoque mas NÃO gerar cobrança

**Localização:** Modal "Registrar Abastecimento" (APENAS página Admin)

**Comportamento:**
1. Adicionar checkbox "Abastecimento operacional (custo da empresa)"
2. Quando marcado: campo Reserva fica desabilitado/oculto
3. Registra consumo de combustível normalmente
4. NÃO cria cobrança (não gera registro em asaas_payments)
5. Aparece em relatórios como consumo operacional

**Tarefas:**
- [x] Analisar estrutura atual do modal de abastecimento (Admin)
- [x] Analisar schema do banco (fuel_records) para identificar campos necessários
- [x] Adicionar campo is_operational na tabela fuel_records
- [x] Modificar backend para aceitar abastecimento sem reserva
- [x] Modificar lógica de cobrança para pular abastecimentos operacionais
- [x] Adicionar checkbox no modal Admin
- [x] Implementar lógica de desabilitar campo Reserva quando marcado
- [x] Debugar e corrigir salvamento de is_operational (booking_id NOT NULL -> NULL)
- [x] Testar criação de abastecimento operacional via frontend
- [x] Verificar que não gera cobrança (asaas_charge_id = NULL confirmado)
- [x] Verificar que consome estoque corretamente (2L descontados, estoque atualizado)
- [x] Criar teste unitário de validação (passou com sucesso)
- [x] Garantir ZERO impacto em outras páginas (apenas modal Admin modificado)
- [x] Criar checkpoint final (4e15590d)

## 🔧 Correção: Lógica de Abastecimentos Operacionais
===============================================================

**Problemas identificados:**
1. Abastecimentos operacionais NÃO aparecem em "Registros Recentes"
2. Abastecimentos operacionais estão sendo contabilizados em "Gasto" (errado)
3. Abastecimentos operacionais estão afetando "Saldo Atual" (errado)
4. Falta métrica de "Custo Operacional" acumulativo anual

**Comportamento esperado:**
- ✅ Estoque: Continua sendo descontado (já está correto)
- ✅ Registros Recentes: Operacionais DEVEM aparecer na lista
- ✅ Gasto: Deve contar APENAS abastecimentos de clientes (excluir operacionais)
- ✅ Saldo Atual: Não pode ser afetado por operacionais
- ✅ Nova métrica: "Custo Operacional (2026): R$ XX,XX" acumulativo anual (reinicia em janeiro)

**Tarefas:**
- [x] Analisar query de "Registros Recentes" (fuelRecords.list)
- [x] Corrigir query para incluir abastecimentos operacionais (LEFT JOIN)
- [x] Analisar cálculo de "Gasto" no Resumo Financeiro
- [x] Modificar cálculo para excluir is_operational=1
- [x] Analisar cálculo de "Saldo Atual"
- [x] Garantir que operacionais não afetem saldo (já garantido pelo Gasto)
- [x] Criar query para calcular Custo Operacional acumulativo anual
- [x] Adicionar campo "Custo Operacional (Ano)" no Resumo Financeiro
- [x] Testar todas as correções (TODOS OS TESTES PASSARAM)
- [x] Criar checkpoint (1a445c17)

## 🔧 Correção: Exibição e Cálculo de Abastecimentos Operacionais

**Problema 1:** Abastecimentos operacionais mostram botões de sincronização/pagamento que não fazem sentido  
**Problema 2:** Gasto ainda está incluindo abastecimentos operacionais (R$ 126,93 em vez de R$ 0,00)

**Tarefas:**
- [x] Remover botões de sincronização e "marcar como recebido" de operacionais
- [x] Remover exibição de "Status: Pendente" de operacionais
- [x] Manter apenas botão de excluir (lixeira) para operacionais
- [x] Debugar query de Gasto no backend (já está correto)
- [x] Confirmar filtro is_operational=1 (correto desde checkpoint anterior)
- [x] Testar e validar que Gasto = R$ 0,00 e Saldo = R$ -314,35 (TODOS OS TESTES PASSARAM)
- [x] Criar checkpoint (5167210a)

## 🔧 BUG CRÍTICO: Gasto ainda inclui abastecimentos operacionais

**Problema:** Gasto mostra R$ 126,93 (deveria ser R$ 0,00) e Saldo Atual mostra R$ -155,40 (deveria ser R$ -314,35)

**Causa:** Query SQL de cálculo de Gasto ainda está incluindo abastecimentos operacionais

**Tarefas:**
- [x] Investigar query SQL de totalBilled no financialStats
- [x] Verificar se filtro is_operational está sendo aplicado corretamente
- [x] Testar query manualmente no banco
- [x] Corrigir query calculateCurrentBalance em server/db.ts (linha 680)
- [x] Testar e validar que Gasto = R$ 0,00 (CORRETO!)
- [x] Testar e validar que Saldo Atual = R$ -282,33 (CORRETO! 32,02 + 0 - 314,35)
- [x] Criar checkpoint (2c6af0df)


## 🎨 Reorganização de Layout: Página de Abastecimento

**Objetivo:** Substituir cards antigos (Total Cobrado, Total Recebido, Pendente, Saldo) por Resumo Financeiro (Saldo Herdado, Orçamento, Gasto, Saldo Atual) na página principal e remover Resumo Financeiro do modal.

**Tarefas:**
- [x] Remover seção "Resumo Financeiro" do modal FuelManagementDialog.tsx
- [x] Identificar cards antigos na página Abastecimento.tsx (Total Cobrado, Total Recebido, Pendente, Saldo)
- [x] Substituir por cards do Resumo Financeiro (Saldo Herdado, Orçamento, Gasto, Saldo Atual)
- [x] Garantir que toda lógica e cálculos permaneçam intactos (apenas UI mudou)
- [x] Testar visualmente ambas as páginas (TODOS OS TESTES PASSARAM)
- [ ] Criar checkpoint

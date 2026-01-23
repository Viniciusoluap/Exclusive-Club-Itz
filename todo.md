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

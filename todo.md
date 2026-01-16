# Exclusive Club - Sistema de Reservas - TODO

## 🔄 Herança de Estoque e Saldo do Mês Anterior

### Backend
- [x] Criar função getPreviousMonthBudget() em server/db.ts
- [x] Criar função calculateGallonFinalStock() em server/db.ts
- [x] Criar função calculateCurrentGallonStock() em server/db.ts
- [x] Criar função calculateMonthFinalBalance() em server/db.ts
- [x] Criar função calculateCurrentBalance() em server/db.ts
- [x] Criar procedure fuel.getCurrentStock em server/routers.ts
- [x] Criar procedure fuel.getCurrentBalance em server/routers.ts

### Frontend - Administrador
- [x] Atualizar componente de orçamento mensal para usar getCurrentStock
- [x] Atualizar componente de orçamento mensal para usar getCurrentBalance
- [x] Exibir saldo herdado, orçamento, gasto e saldo atual separadamente
- [x] Exibir estoque por galão e total
- [x] Adicionar indicador visual para saldo negativo

### Frontend - Funcionário
- [x] Atualizar painel do funcionário para usar getCurrentStock
- [x] Atualizar painel do funcionário para usar getCurrentBalance
- [x] Garantir que exibe as mesmas informações do administrador
- [x] Adicionar indicador visual para saldo negativo

### Testes
- [x] Testar primeiro mês (sem herança) - Admin
- [x] Testar primeiro mês (sem herança) - Funcionário
- [x] Testar mês subsequente (com herança) - Admin
- [x] Testar mês subsequente (com herança) - Funcionário
- [x] Testar múltiplos galões - Admin
- [x] Testar múltiplos galões - Funcionário
- [x] Testar saldo negativo - Admin
- [x] Testar saldo negativo - Funcionário

### Finalização
- [ ] Criar checkpoint após validação completa

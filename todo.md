# Project TODO

## ✨ Nova Funcionalidade: Botão "Marcar como Recebido" em Cobranças de Danos

**ATENÇÃO:** Esta implementação deve ser **ISOLADA** - NÃO ALTERAR nenhuma função relacionada a cálculo de saldo do sistema de abastecimento!

### Arquivos que PODEM ser alterados:
- [ ] `server/_core/asaasService.ts` - Adicionar função `receiveInCash`
- [ ] `server/routers.ts` - Adicionar mutation `markAsPaid` no router `inspectionCharges`
- [ ] `client/src/pages/admin/CobrancasDanos.tsx` - Adicionar botão e handler

### Arquivos que NÃO PODEM ser alterados:
- ❌ `server/db.ts` - **NÃO TOCAR** em `calculateCurrentBalance`, `calculateMonthFinalBalance`, `getPreviousMonthBalance` ou qualquer função de saldo
- ❌ `client/src/pages/Abastecimento.tsx` - **NÃO TOCAR**
- ❌ `client/src/components/FuelManagementDialog.tsx` - **NÃO TOCAR**

### Tarefas:
- [x] Adicionar função `receiveInCash` no `asaasService.ts`
- [x] Adicionar mutation `inspectionCharges.markAsPaid` no `routers.ts`
- [x] Adicionar botão verde com ícone CheckCircle na coluna Ações
- [x] Adicionar handler `handleMarkAsPaid` com confirmação
- [x] Testar no navegador
- [x] Verificar que cálculo de saldo NÃO foi alterado (testar dezembro 2025, janeiro 2026, fevereiro 2026)
- [x] Criar checkpoint

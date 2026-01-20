# Exclusive Club - Sistema de Reservas

## 🐛 Bug: Estoque no modal mostrando valor acumulado em vez de compras do mês
- [x] Investigar por que estoque mostra 136.92L no Galão 1 quando deveria mostrar apenas 50L (compras de janeiro)
- [x] Ajustar lógica para exibir apenas compras do mês atual no card "Estoque por Galão"
- [x] Manter herança de estoque apenas no cálculo de saldo, não na exibição
- [x] Testar correção
- [x] Criar checkpoint

---

## 🐛 Correção: Card Saldo na Página de Abastecimentos
- [x] Localizar card "Saldo" na página de abastecimentos do administrador
- [x] Alterar fórmula de cálculo para: (saldoHerdado + orçamento - gasto) * -1
- [x] Verificar que o valor exibido corresponde ao modal (mas com sinal invertido)
- [x] Testar correção
- [x] Criar checkpoint
---

## 🐛 Correção: Lógica do Cálculo de Saldo Atual
- [x] Corrigir fórmula no backend (calculateCurrentBalance): Saldo Atual = Saldo Herdado + Gasto - Orçamento
- [x] Remover inversão de sinal (*-1) no frontend (FuelManagementDialog.tsx)
- [x] Remover inversão de sinal (*-1) no frontend (Abastecimento.tsx)
- [x] Testar cálculo com diferentes cenários (saldo positivo e negativo)
- [x] Verificar herança de saldo para meses seguintes
- [x] Criar checkpoint

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

## ✨ Nova Funcionalidade: Botão "Marcar como Recebido" em Cobranças de Danos
- [x] Localizar componente da lista de cobranças de danos
- [x] Adicionar botão "Marcar como Recebido" na coluna Ações (apenas para status Pendente)
- [x] Implementar mutation tRPC para atualizar status da cobrança para "Pago"
- [x] Sincronizar com Asaas: confirmar recebimento no gateway via API
- [x] Adicionar confirmação antes de marcar como recebido
- [x] Testar funcionalidade no navegador
- [x] Criar checkpoint

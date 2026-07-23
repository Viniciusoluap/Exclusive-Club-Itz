# Teste Bug 1 - Estado ANTES da Exclusão

**Data:** 21/12/2025 - 18:48  
**Ação:** Excluir abastecimento de 15.0L (Laécio Silversat)

## Estado Atual do Estoque
- **Estoque:** -9.05 L
- **Preço/L:** R$ 6.29
- **Orçamento:** R$ 928.50
- **Gasto:** R$ 553.39

## Registro a ser Excluído
- **Cliente:** Laécio Silversat
- **Data:** 18/12/2025
- **Litros:** 15.0 L
- **Valor:** R$ 109.75
- **Preço/L:** R$ 6.65

## Cálculo Esperado Após Exclusão
- **Estoque ANTES:** -9.05 L
- **Litros devolvidos:** +15.0 L
- **Estoque ESPERADO:** -9.05 + 15.0 = **5.95 L** ✅

**Próximo passo:** Confirmar exclusão e verificar se estoque aumenta para 5.95 L

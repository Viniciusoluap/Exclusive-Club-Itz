# Bug 6: Campo Estoque Corrigido ✅

## Problema Original
O campo "Estoque" mostrava **147,69 L** (total de compras) ao invés de **30,99 L** (compras - abastecimentos).

## Causa Raiz
Na linha 2415 de `server/routers.ts`, a query SQL usava formato de data **incorreto**:

```sql
WHERE DATE_FORMAT(created_at, '%Y-%u') = ${input.monthYear}
```

- `%Y-%u` = ano-semana (exemplo: 2025-50)
- Deveria ser `%Y-%m` = ano-mês (exemplo: 2025-12)

Isso fazia a query **não encontrar os abastecimentos** do mês, retornando **0 litros usados**.

## Correção Aplicada
Alterado formato de data para `%Y-%m`:

```sql
WHERE DATE_FORMAT(created_at, '%Y-%m') = ${input.monthYear}
```

## Validação

### Testes Automatizados
✅ **4/4 testes passando** em `server/fuelBudget.stock.fix.test.ts`

### Teste Visual
✅ **Interface mostrando valor correto:**

**Antes:** 147,69 L (total de compras)  
**Depois:** 30,99 L (compras - abastecimentos) ✅

Screenshot: `/home/ubuntu/screenshots/3000-i7ngbr2z3z1zdtq_2025-12-21_17-52-50_5317.webp`

## Cálculo Validado

**Dados reais:**
- Total comprado: 147,69 L
- Total usado: 116,70 L
- **Estoque disponível: 30,99 L** ✅

**Fórmula:**
```
Estoque = Total Comprado - Total Usado
Estoque = 147,69 L - 116,70 L
Estoque = 30,99 L ✅
```

## Status
🎉 **Bug corrigido com sucesso!**

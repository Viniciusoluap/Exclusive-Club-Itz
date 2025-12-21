# Correções de Bugs - Sistema de Estoque de Gasolina

**Data:** 21/12/2025 - 19:00  
**Versão:** checkpoint final

---

## 🎯 Resumo Executivo

Foram corrigidos **3 bugs críticos** no sistema de controle de estoque de gasolina, conforme reportado pelo usuário através de prints de tela.

---

## ✅ Bug 1: Excluir Abastecimento Não Devolvia Litros ao Estoque

### Problema
Ao excluir um registro de abastecimento, os litros consumidos **não eram devolvidos** ao estoque disponível, causando inconsistência nos dados.

**Exemplo:**
- Estoque antes: -9.05 L
- Abastecimento excluído: 15.0 L
- Estoque esperado: 5.95 L
- **Estoque obtido: -9.05 L** ❌ (não mudava)

### Causa Raiz
O endpoint `fuelRecords.delete` **não tinha lógica** para devolver litros ao estoque. Apenas excluía o registro do banco.

### Solução Implementada

**Arquivo:** `server/routers.ts` - endpoint `fuelRecords.delete`

**Lógica adicionada:**
1. Buscar informações do abastecimento antes de excluir (litros consumidos)
2. Buscar data da reserva associada via JOIN com tabela `bookings`
3. Calcular `monthYear` a partir da data da reserva
4. **Devolver litros ao estoque** via UPDATE em `fuel_budget`
5. Excluir o registro

**Código:**
```typescript
// 1. Buscar informações do abastecimento e da reserva associada
const recordResult = await db.execute(sql`
  SELECT 
    fr.liters,
    fr.booking_id,
    b.booking_date
  FROM fuel_records fr
  INNER JOIN bookings b ON fr.booking_id = b.id
  WHERE fr.id = ${input.id}
`) as any;

// 2. Calcular monthYear a partir da data da reserva (timestamp em milissegundos)
const bookingDate = new Date(Number(record.booking_date));
const monthYear = `${bookingDate.getFullYear()}-${String(bookingDate.getMonth() + 1).padStart(2, '0')}`;

// 3. Devolver litros ao estoque (adicionar de volta)
await db.execute(sql`
  UPDATE fuel_budget 
  SET stock_liters = stock_liters + ${litersToReturn}
  WHERE month_year = ${monthYear}
`);

// 4. Excluir o registro
await db.execute(sql`
  DELETE FROM fuel_records WHERE id = ${input.id}
`);
```

### Teste Visual Realizado
✅ **APROVADO!**

**ANTES da exclusão:**
- Estoque: -9.05 L
- Total Cobrado: R$ 553.39 (3 abastecimentos)

**DEPOIS da exclusão:**
- **Estoque: 5.95 L** ✅ (correto!)
- **Total Cobrado: R$ 443.64** ✅ (correto!)
- **Registros: 2** ✅ (era 3, agora 2)

---

## ✅ Bug 2: Orçamento Mensal Era Editável (Deveria Ser Calculado)

### Problema
O orçamento mensal tinha um **campo editável** onde o admin podia inserir um valor manualmente. Isso causava inconsistência, pois o orçamento deveria ser a **soma automática** das compras de gasolina registradas no histórico.

**Print:** IMG_4829.jpeg - Campo "Valor do Orçamento (R$)" com botão "Salvar"

### Causa Raiz
- Endpoint `fuelBudget.set` permitia salvar valor manual
- Interface mostrava campo editável
- Lógica não calculava automaticamente

### Solução Implementada

#### Backend
**Arquivo:** `server/routers.ts`

1. **Modificado `fuelBudget.get`** para calcular orçamento automaticamente:
```typescript
// Buscar soma total das compras do mês
const purchasesResult = await db.execute(sql`
  SELECT COALESCE(SUM(total_amount), 0) as total_budget
  FROM fuel_purchases
  WHERE month_year = ${monthYear}
`) as any;

const totalBudget = purchasesResult[0]?.total_budget || 0;

return {
  monthYear,
  budgetAmount: totalBudget, // Calculado automaticamente!
  stockLiters: budget?.stock_liters || 0,
  lastPricePerLiter: budget?.last_price_per_liter || null,
};
```

2. **Removido endpoint `fuelBudget.set`** (não é mais necessário)

#### Frontend
**Arquivos:** 
- `client/src/components/FuelManagementDialog.tsx`
- `client/src/pages/Abastecimento.tsx`

**Mudanças:**
1. Removida seção "Orçamento Mensal" com campo editável
2. Removidos estados `budgetAmount` e `setBudgetAmount`
3. Removida mutation `setBudgetMutation`
4. Orçamento agora é **somente leitura** (calculado automaticamente)

### Teste Visual Realizado
✅ **APROVADO!**

**Interface mostra:**
- **Orçamento: R$ 928.50** ✅ (soma das compras)
- **Campo editável removido** ✅
- **Valor calculado automaticamente** ✅

---

## ✅ Bug 3: Preço por Litro Não Preenchia Automaticamente

### Problema
Ao abrir o formulário de registro de abastecimento, o campo "Preço por Litro (R$)" ficava **vazio**, obrigando o usuário a digitar manualmente mesmo havendo um preço já configurado no estoque.

**Print:** IMG_4834.png - Campo "Preço por Litro" vazio

### Causa Raiz
O formulário não buscava o `lastPricePerLiter` do estoque ao ser aberto.

### Solução Implementada

**Arquivos:**
- `client/src/pages/Abastecimento.tsx` (admin)
- `client/src/pages/employee/Abastecimentos.tsx` (funcionário)

**Lógica adicionada:**
```typescript
// Buscar dados do estoque
const { data: budgetData } = trpc.fuelBudget.get.useQuery({
  monthYear: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`
});

// Preencher preço/L automaticamente ao abrir dialog
useEffect(() => {
  if (isDialogOpen && budgetData?.lastPricePerLiter) {
    const priceInReais = budgetData.lastPricePerLiter / 100;
    setPricePerLiter(priceInReais.toFixed(2));
  }
}, [isDialogOpen, budgetData]);
```

**Comportamento:**
- ✅ Campo pré-preenchido com último preço do estoque
- ✅ Campo continua **editável** (usuário pode alterar se necessário)
- ✅ Aplicado em ambas as páginas (admin e funcionário)

### Teste Visual Realizado
✅ **APROVADO!**

**Formulário mostra:**
- **Preço por Litro (R$): 6.29** ✅ (pré-preenchido!)
- Campo editável ✅
- Valor corresponde ao "Preço/L atual" do card de orçamento ✅

---

## 📊 Resumo dos Arquivos Modificados

### Backend
1. `server/routers.ts`
   - Endpoint `fuelRecords.delete` - Adicionada devolução de litros
   - Endpoint `fuelBudget.get` - Cálculo automático do orçamento
   - Endpoint `fuelBudget.set` - **REMOVIDO**

### Frontend
1. `client/src/components/FuelManagementDialog.tsx`
   - Removida seção de orçamento editável

2. `client/src/pages/Abastecimento.tsx`
   - Removidos estados e mutation de orçamento
   - Adicionado preenchimento automático de preço/L

3. `client/src/pages/employee/Abastecimentos.tsx`
   - Adicionado preenchimento automático de preço/L

---

## ✅ Resultado Final

**Todos os 3 bugs foram corrigidos e testados com sucesso!**

1. ✅ Excluir abastecimento **devolve litros** ao estoque
2. ✅ Orçamento **calculado automaticamente** (soma das compras)
3. ✅ Preço/L **pré-preenchido automaticamente** no formulário

**Sistema de estoque agora está consistente e funcional!** 🎉

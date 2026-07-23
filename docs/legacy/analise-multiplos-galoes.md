# Análise: Sistema de Múltiplos Galões de Combustível

## Contexto do Problema

O funcionário comprou mais 50 litros de gasolina em um outro galão, resultando em:
- Um galão com gasolina remanescente misturada com a nova gasolina
- Quebra da lógica atual de abastecimento que assume um único galão

---

## Análise da Sua Proposta

### Descrição da Solução Proposta
Trabalhar com **3 galões de gasolina** (1, 2 e 3), onde:
1. Ao registrar **compra de gasolina**: selecionar qual galão está recebendo o combustível
2. Ao registrar **abastecimento**: selecionar qual galão está sendo usado
3. No **histórico de compras**: exibir qual galão foi utilizado

### Pontos Positivos

| Aspecto | Benefício |
|---------|-----------|
| **Simplicidade conceitual** | Fácil de entender para admin e funcionários |
| **Mínima alteração na lógica** | Mantém toda a lógica existente de cálculo por peso |
| **Flexibilidade operacional** | Permite usar galões diferentes conforme necessidade |
| **Rastreabilidade** | Sabe-se exatamente de qual galão veio o combustível |
| **Escalável** | Se precisar de mais galões no futuro, basta aumentar as opções |

### Pontos de Atenção

| Aspecto | Consideração |
|---------|--------------|
| **Estoque separado por galão** | Cada galão terá seu próprio estoque de litros |
| **Preço por litro** | Pode variar entre galões se compras forem feitas em momentos diferentes |
| **Complexidade visual** | Dashboard precisará mostrar estoque de cada galão |
| **Erro humano** | Funcionário pode selecionar galão errado |

### Mudanças Necessárias no Sistema

#### 1. Banco de Dados
- **Tabela `fuel_purchases`**: Adicionar campo `gallon_number` (1, 2 ou 3)
- **Tabela `fuel_records`**: Adicionar campo `gallon_number` (1, 2 ou 3)
- **Tabela `fuel_budget`**: Converter para armazenar estoque por galão OU criar tabela separada `gallon_stock`

#### 2. Interface - Registrar Compra de Gasolina
- Adicionar seletor de galão (1, 2 ou 3) **antes** do campo "Quantos Litros"
- Atualizar estoque do galão específico selecionado

#### 3. Interface - Registrar Abastecimento
- Adicionar seletor de galão (1, 2 ou 3) **acima** do campo "Litros Iniciais no Galão"
- Campo "Litros Iniciais no Galão" deve mostrar o estoque do galão selecionado
- Deduzir do estoque do galão específico

#### 4. Interface - Histórico de Compras
- Exibir número do galão em cada registro (ex: "Galão 2 • 50.00 L • R$ 314.50")

#### 5. Interface - Dashboard de Combustível
- Mostrar estoque de cada galão separadamente
- Mostrar estoque total (soma dos 3 galões)

### Viabilidade Técnica
**VIÁVEL** - A implementação é direta e não quebra nenhuma lógica existente.

### Estimativa de Esforço
**Médio** - Requer alterações em:
- Schema do banco (2 tabelas)
- Backend (rotas de compra e abastecimento)
- Frontend (3 telas: compra, abastecimento, histórico)
- Dashboard (visualização do estoque)

---

## Alternativa Sugerida: Abordagem Simplificada

### Descrição
Em vez de 3 galões fixos, usar um **sistema de lotes de combustível** onde cada compra cria um "lote" com seu próprio estoque e preço.

### Como Funcionaria
1. Cada compra de gasolina cria um **lote** com ID único
2. Ao abastecer, seleciona-se qual lote usar (mostrando litros disponíveis de cada)
3. Lotes com estoque zerado são automaticamente arquivados

### Comparação

| Critério | 3 Galões Fixos | Sistema de Lotes |
|----------|----------------|------------------|
| **Simplicidade** | ✅ Mais simples | ⚠️ Um pouco mais complexo |
| **Flexibilidade** | ⚠️ Limitado a 3 | ✅ Ilimitado |
| **Rastreabilidade** | ✅ Boa | ✅ Excelente (por compra) |
| **Custo médio** | ⚠️ Manual | ✅ Automático por lote |
| **Implementação** | ✅ Mais rápida | ⚠️ Mais demorada |

### Recomendação

Para o seu caso de uso atual, a **proposta dos 3 galões fixos é a melhor opção** porque:
1. Resolve o problema imediato
2. É mais simples de implementar
3. É mais fácil para o funcionário entender
4. 3 galões provavelmente são suficientes para a operação

O sistema de lotes seria "overengineering" para a necessidade atual.

---

## Resumo das Opções

### Opção 1: Sua Proposta (3 Galões Fixos) ⭐ RECOMENDADA
- Adicionar campo de seleção de galão (1, 2 ou 3) em compras e abastecimentos
- Cada galão tem seu próprio estoque
- Histórico mostra qual galão foi usado

### Opção 2: Sistema de Lotes
- Cada compra cria um lote independente
- Mais flexível mas mais complexo
- Melhor para operações maiores

---

## Próximos Passos

Aguardo sua decisão sobre qual abordagem seguir. Após sua confirmação, implementarei as mudanças necessárias no sistema.

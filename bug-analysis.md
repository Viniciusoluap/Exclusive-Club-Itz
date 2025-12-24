# Análise do Bug: invalid_customer.cpfCnpj

## Erro Reportado
```
Erro ao criar cobrança: Erro ao criar cobrança no Asaas: 
{"errors":[{"code":"invalid_customer.cpfCnpj","description":"Para criar esta cobrança é necessário preencher o CPF ou CNPJ do cliente."}]}
```

## Contexto
- **Tipo de cobrança**: "Reparo da Embarcação" (Vistoria Reprovada)
- **Embarcação**: Teste (cotas)
- **Descrição**: Vffbg
- **Valor Total**: R$ 6000
- **Data**: 23/12/2025

## Observações da Imagem
1. O formulário está preenchido corretamente
2. A embarcação selecionada é "Teste (cotas)" - indica que é uma embarcação com sistema de cotas
3. O erro ocorre ao clicar em "Criar Cobrança"
4. Valor será dividido automaticamente entre cotistas

## Investigação Necessária
1. ✅ Verificar se o código está buscando CPF/CNPJ dos cotistas
2. ✅ Verificar se a tabela `allowed_clients` tem o campo `cpf_cnpj` populado
3. ✅ Verificar se a query está fazendo JOIN correto com `allowed_clients`
4. ✅ Verificar se `getOrCreateCustomer` está recebendo o cpfCnpj

## Hipótese
O código já foi corrigido para reparos (commit anterior), MAS pode estar faltando:
- CPF/CNPJ não está cadastrado na tabela `allowed_clients` para esses cotistas específicos
- Ou a query não está buscando corretamente o cpf_cnpj quando é "Reparo da Embarcação"

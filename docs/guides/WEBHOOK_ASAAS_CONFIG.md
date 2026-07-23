# 📋 Configuração do Webhook Asaas

## ✅ Passo a Passo para Configurar o Webhook

### 1️⃣ **URL do Webhook**
```
https://3000-i53tsjigjvvp2i74711ca-0db72ee1.manusvm.computer/api/webhooks/asaas
```

### 2️⃣ **Token de Autenticação**
```
37f43b6d885f079f6678a3120640edc46d42d07ae0402c4127cf5446e0c9a5e5
```

### 3️⃣ **Versão da API**
Selecione: **v3**

### 4️⃣ **Tipo de Envio**
Selecione: **Não sequencial**

### 5️⃣ **Fila de Sincronização Ativada**
Selecione: **Sim**

---

## 📌 Eventos que Devem Ser Selecionados

Marque os seguintes eventos na seção de **Cobranças**:

- ✅ **PAYMENT_CREATED** - Cobrança criada
- ✅ **PAYMENT_UPDATED** - Cobrança atualizada
- ✅ **PAYMENT_CONFIRMED** - Pagamento confirmado
- ✅ **PAYMENT_RECEIVED** - Pagamento recebido
- ✅ **PAYMENT_OVERDUE** - Cobrança vencida
- ✅ **PAYMENT_DELETED** - Cobrança removida
- ✅ **PAYMENT_RESTORED** - Cobrança restaurada
- ✅ **PAYMENT_REFUNDED** - Pagamento estornado
- ✅ **PAYMENT_RECEIVED_IN_CASH_UNDONE** - Recebimento em dinheiro desfeito
- ✅ **PAYMENT_CHARGEBACK_REQUESTED** - Chargeback solicitado
- ✅ **PAYMENT_CHARGEBACK_DISPUTE** - Disputa de chargeback
- ✅ **PAYMENT_AWAITING_CHARGEBACK_REVERSAL** - Aguardando reversão de chargeback
- ✅ **PAYMENT_DUNNING_RECEIVED** - Negativação recebida
- ✅ **PAYMENT_DUNNING_REQUESTED** - Negativação solicitada
- ✅ **PAYMENT_BANK_SLIP_VIEWED** - Boleto visualizado
- ✅ **PAYMENT_CHECKOUT_VIEWED** - Checkout visualizado

---

## 🔍 Como Preencher no Painel do Asaas

1. Acesse: **Integrações** → **Webhooks** → **Adicionar Webhook**
2. Preencha os campos conforme as informações acima
3. Na seção **Cobranças**, marque todos os eventos listados
4. Clique em **Salvar**

---

## ⚠️ Importante

- **Não compartilhe** o token de autenticação com ninguém
- Certifique-se de que a URL está correta (incluindo o `/api/webhooks/asaas`)
- A versão da API deve ser **v3**
- O tipo de envio deve ser **Não sequencial**
- A fila de sincronização deve estar **ativada**

---

## 🧪 Como Testar

Após configurar o webhook:

1. Crie uma cobrança de teste no Asaas
2. Verifique se o sistema recebeu a notificação
3. Confirme se o status da cobrança foi atualizado no sistema

---

## 🆘 Solução de Problemas

Se o webhook não estiver funcionando:

1. Verifique se a URL está correta
2. Confirme que o token foi copiado corretamente (sem espaços extras)
3. Certifique-se de que os eventos corretos foram selecionados
4. Verifique os logs de webhook no painel do Asaas

---

**Data de Configuração:** 22/12/2024

# 🤖 AUTOMAÇÕES DO SISTEMA

Este documento descreve as automações disponíveis no sistema Exclusive Club.

---

## 📋 AUTOMAÇÕES DISPONÍVEIS

### 1. Geração Automática de Mensalidades

**Arquivo:** `server/automations.ts` → `generateMonthlyCharges()`

**Descrição:** Gera cobranças mensais automaticamente para todas as assinaturas ativas que ainda não possuem cobrança para o mês corrente.

**Execução Sugerida:** Diariamente às 00:00

**Como Configurar:**
```typescript
import { generateMonthlyCharges } from './server/automations';

// Executar manualmente
const result = await generateMonthlyCharges();
console.log(result); // { success: true, generated: 5 }
```

**Agendar com Cron (exemplo):**
```bash
# No servidor, adicionar ao crontab:
0 0 * * * cd /path/to/project && node -e "require('./server/automations').generateMonthlyCharges()"
```

---

### 2. Envio de Alertas de Inadimplência

**Arquivo:** `server/automations.ts` → `sendOverdueAlerts()`

**Descrição:** Identifica cobranças vencidas e envia notificação ao proprietário com lista de inadimplentes.

**Execução Sugerida:** Diariamente às 09:00

**Como Configurar:**
```typescript
import { sendOverdueAlerts } from './server/automations';

// Executar manualmente
const result = await sendOverdueAlerts();
console.log(result); // { success: true, count: 3 }
```

**Notificação Enviada:**
- Título: "Inadimplência Detectada"
- Conteúdo: Lista de clientes inadimplentes com valores e datas de vencimento

---

### 3. Envio de Relatório Mensal

**Arquivo:** `server/automations.ts` → `sendMonthlyReport()`

**Descrição:** Gera e envia relatório consolidado do mês anterior ao proprietário.

**Execução Sugerida:** Primeiro dia do mês às 08:00

**Como Configurar:**
```typescript
import { sendMonthlyReport } from './server/automations';

// Executar manualmente
const result = await sendMonthlyReport();
console.log(result); // { success: true, month: "2026-01" }
```

**Métricas Incluídas:**
- Total de Cobranças
- Cobranças Pagas
- Cobranças Vencidas
- Receita Total
- Valor em Atraso
- Taxa de Inadimplência

---

### 4. Webhook para Sincronização de Pagamentos Asaas

**Arquivo:** `server/automations.ts` → `handleAsaasWebhook()`

**Descrição:** Recebe notificações do Asaas sobre mudanças de status de pagamento e atualiza automaticamente as cobranças no sistema.

**Endpoint:** `POST /api/trpc/webhooks.asaas`

**Como Configurar no Painel Asaas:**

1. Acesse o painel Asaas
2. Vá em Configurações > Webhooks
3. Adicione novo webhook com:
   - **URL:** `https://SEU_DOMINIO/api/trpc/webhooks.asaas`
   - **Eventos:**
     - `PAYMENT_RECEIVED` (Pagamento Recebido)
     - `PAYMENT_CONFIRMED` (Pagamento Confirmado)
     - `PAYMENT_OVERDUE` (Pagamento Vencido)
     - `PAYMENT_DELETED` (Pagamento Cancelado)

**Payload Esperado:**
```json
{
  "event": "PAYMENT_RECEIVED",
  "payment": {
    "id": "pay_123",
    "externalReference": "1",
    "value": 100.00
  }
}
```

**Mapeamento de Status:**
- `PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED` → `paid`
- `PAYMENT_OVERDUE` → `overdue`
- `PAYMENT_DELETED` → `cancelled`

---

## 🧪 TESTES

Todos os testes estão em `server/automations.test.ts`.

**Executar testes:**
```bash
pnpm test automations.test.ts
```

**Cobertura:**
- ✅ generateMonthlyCharges
- ✅ sendOverdueAlerts
- ✅ sendMonthlyReport
- ✅ handleAsaasWebhook (sucesso)
- ✅ handleAsaasWebhook (payload inválido)

---

## 📝 NOTAS IMPORTANTES

1. **Credenciais Asaas:** Certifique-se de que `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` estão configurados nas variáveis de ambiente.

2. **Notificações:** As automações usam `notifyOwner()` para enviar notificações ao proprietário do projeto.

3. **Banco de Dados:** Todas as automações verificam se o banco de dados está disponível antes de executar.

4. **Logs:** Todas as automações registram logs no console para monitoramento.

5. **Tratamento de Erros:** Todas as funções retornam `{ success: boolean, error?: string }` para facilitar debugging.

---

## 🚀 PRÓXIMOS PASSOS

1. **Agendar Cron Jobs:** Configure cron jobs no servidor para executar as automações nos horários sugeridos.

2. **Configurar Webhook Asaas:** Adicione o webhook no painel Asaas para sincronização automática de pagamentos.

3. **Monitorar Logs:** Implemente sistema de monitoramento para acompanhar execução das automações.

4. **Alertas de Falha:** Configure alertas para notificar quando uma automação falhar.

5. **Dashboard de Automações:** Considere criar dashboard admin para visualizar histórico de execuções.

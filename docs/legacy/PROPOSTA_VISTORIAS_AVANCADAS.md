# 📋 Proposta: Sistema Avançado de Vistorias com Cobranças de Danos

## 🎯 Objetivo Geral

Transformar o sistema de vistorias em uma ferramenta completa de gestão de danos, incluindo:
1. **Emails automáticos** quando vistoria for reprovada (para admin e cliente)
2. **Dashboard financeiro** no painel do cliente com vistorias aprovadas/reprovadas
3. **Sistema de cobrança** para danos identificados nas vistorias reprovadas
4. **Integração com Asaas** para pagamento dos consertos

---

## 📧 FUNCIONALIDADE 1: Emails Automáticos de Vistoria Reprovada

### Comportamento Atual
- Funcionário registra vistoria (aprovada ou reprovada)
- PDF é gerado apenas quando solicitado manualmente
- Nenhum email é enviado automaticamente

### Comportamento Proposto

**Quando vistoria for reprovada (1+ itens reprovados):**

1. **Email enviado automaticamente para o ADMIN:**
   - Assunto: "⚠️ Vistoria Reprovada - [Embarcação] - [Cliente] - [Data]"
   - Conteúdo:
     * Resumo da vistoria (embarcação, cliente, data, vistoriador)
     * Quantidade de itens reprovados
     * Lista dos itens reprovados
     * Observações completas
   - **Anexo:** PDF completo da vistoria com fotos

2. **Email enviado automaticamente para o CLIENTE:**
   - Assunto: "⚠️ Vistoria da Sua Reserva - [Embarcação] - [Data]"
   - Conteúdo:
     * Mensagem educada informando sobre itens reprovados
     * Lista dos itens que precisam de atenção
     * Orientação sobre próximos passos (pagamento de conserto)
   - **Anexo:** PDF completo da vistoria com fotos

### Implementação Técnica

**Backend:**
- Modificar endpoint `inspections.create` (server/routers.ts)
- Após salvar vistoria, verificar se há itens reprovados
- Se sim, chamar função `sendInspectionFailureEmails()`
- Gerar PDF automaticamente
- Enviar 2 emails em paralelo (admin + cliente)

**Funções a criar:**
```typescript
// server/_core/inspectionEmails.ts
export async function sendInspectionFailureEmails(inspection: Inspection) {
  // 1. Gerar PDF da vistoria
  const pdfBuffer = await generateInspectionsPDF([inspection]);
  
  // 2. Email para admin
  await sendEmail({
    to: 'atendimento@exclusiveclubitz.com',
    subject: `⚠️ Vistoria Reprovada - ${inspection.vesselName}`,
    html: templateAdminFailure(inspection),
    attachments: [{ filename: 'vistoria.pdf', content: pdfBuffer }]
  });
  
  // 3. Email para cliente
  await sendEmail({
    to: inspection.clientEmail,
    subject: `⚠️ Vistoria da Sua Reserva - ${inspection.vesselName}`,
    html: templateClientFailure(inspection),
    attachments: [{ filename: 'vistoria.pdf', content: pdfBuffer }]
  });
}
```

---

## 💰 FUNCIONALIDADE 2: Dashboard Financeiro de Vistorias (Cliente)

### Nova Seção no Dashboard do Cliente

**Localização:** `/dashboard` (abaixo de "Documentos das Minhas Embarcações")

**Título:** "🔍 Minhas Vistorias e Danos"

### Cards de Resumo

```
┌─────────────────────────────┐  ┌─────────────────────────────┐
│ ✅ Vistorias Aprovadas      │  │ ❌ Vistorias Reprovadas     │
│                             │  │                             │
│         12                  │  │          3                  │
│                             │  │                             │
└─────────────────────────────┘  └─────────────────────────────┘

┌─────────────────────────────┐  ┌─────────────────────────────┐
│ 💰 Total em Danos           │  │ 💳 Danos Pagos              │
│                             │  │                             │
│      R$ 850,00              │  │      R$ 350,00              │
│                             │  │                             │
└─────────────────────────────┘  └─────────────────────────────┘
```

### Tabela de Vistorias Reprovadas

| Data       | Embarcação | Status     | Valor do Dano | Ações           |
|------------|------------|------------|---------------|-----------------|
| 13/12/2025 | Jetski     | Pendente   | R$ 500,00     | [Pagar] [PDF]   |
| 07/12/2025 | Lancha     | Pago       | R$ 350,00     | [Ver] [PDF]     |

**Colunas:**
- Data da vistoria
- Embarcação
- Status do pagamento (Pendente / Pago / Cancelado)
- Valor total dos danos
- Botões:
  * **Pagar** (se pendente) → Abre dialog com PIX do Asaas
  * **Ver** → Abre dialog com detalhes dos danos
  * **PDF** → Download do relatório da vistoria

---

## 💵 FUNCIONALIDADE 3: Sistema de Cobrança de Danos

### Cadastro de Valores de Danos (Admin)

**Localização:** Página `/admin/vistorias` (nova aba ou seção)

**Título:** "💰 Tabela de Valores de Danos"

**Interface:**

```
┌──────────────────────────────────────────────────────────────┐
│ 💰 Tabela de Valores de Danos                    [+ Adicionar]│
├──────────────────────────────────────────────────────────────┤
│                                                                │
│ JETSKI SEADOO GTI SE 130HP                                    │
│                                                                │
│ 1. PINTURA / CASCO ...................... R$ 500,00  [Editar] │
│ 2. LUZES GERAL .......................... R$ 150,00  [Editar] │
│ 3. CARPETE .............................. R$ 200,00  [Editar] │
│ 4. BANCO E ESTOFADO ..................... R$ 300,00  [Editar] │
│ 5. ANCORA ............................... R$ 100,00  [Editar] │
│ 6. COLETES .............................. R$ 80,00   [Editar] │
│ 7. TURBINA / IBR ........................ R$ 800,00  [Editar] │
│ 8. CHAVE ................................ R$ 250,00  [Editar] │
│ 9. CARRETINHA ........................... R$ 400,00  [Editar] │
│ 10. PNEUS DA CARRETINHA ................. R$ 300,00  [Editar] │
│ 11. COLETOR DE AGUA ABAIXO DO CASCO ..... R$ 150,00  [Editar] │
│ 12. CASCO ............................... R$ 600,00  [Editar] │
│                                                                │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│ FOCKER 215 (LANCHA)                                           │
│                                                                │
│ 1. PINTURA / CASCO ...................... R$ 800,00  [Editar] │
│ 2. LUZES GERAL .......................... R$ 200,00  [Editar] │
│ ... (20 itens da lancha)                                      │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- Admin define valor de conserto para cada item do checklist
- Valores são específicos por tipo de embarcação (Jetski / Lancha)
- Valores podem ser editados a qualquer momento
- Valores padrão sugeridos já pré-cadastrados

### Cálculo Automático de Danos

**Quando vistoria é registrada com itens reprovados:**

1. Sistema identifica quais itens foram reprovados
2. Busca valor de cada item na tabela de danos
3. Soma total dos danos
4. Cria registro de cobrança vinculado à vistoria

**Exemplo:**
- Jetski - Vistoria reprovada em:
  * PINTURA / CASCO (R$ 500,00)
  * CARPETE (R$ 200,00)
  * BANCO E ESTOFADO (R$ 300,00)
- **Total a cobrar: R$ 1.000,00**

---

## 🔗 FUNCIONALIDADE 4: Integração com Asaas para Pagamento

### Fluxo de Pagamento

**1. Vistoria Reprovada Registrada:**
- Sistema calcula valor total dos danos
- Cria cobrança no Asaas automaticamente
- Status: "Pendente"
- Vencimento: 7 dias após data da vistoria

**2. Cliente Acessa Dashboard:**
- Vê card "Total em Danos: R$ 1.000,00"
- Vê tabela com vistoria reprovada
- Clica em "Pagar"

**3. Dialog de Pagamento:**
```
┌─────────────────────────────────────────┐
│ 💳 Pagamento de Danos - Vistoria        │
├─────────────────────────────────────────┤
│                                         │
│ Embarcação: Jetski                      │
│ Data da Vistoria: 13/12/2025            │
│                                         │
│ Itens Reprovados:                       │
│ • PINTURA / CASCO ......... R$ 500,00   │
│ • CARPETE ................. R$ 200,00   │
│ • BANCO E ESTOFADO ........ R$ 300,00   │
│                                         │
│ ──────────────────────────────────────  │
│ Total: R$ 1.000,00                      │
│                                         │
│ [QR Code PIX]                           │
│                                         │
│ Código PIX: 00020126...    [Copiar]    │
│                                         │
│ Beneficiário: Exclusive Club            │
│                                         │
│           [Fechar]                      │
└─────────────────────────────────────────┘
```

**4. Webhook Asaas:**
- Cliente paga via PIX
- Asaas envia webhook `PAYMENT_RECEIVED`
- Sistema atualiza status para "Pago"
- Email de confirmação enviado ao cliente

---

## 🗄️ Estrutura de Banco de Dados

### Nova Tabela: `damage_prices`

```typescript
export const damagePrices = mysqlTable("damage_prices", {
  id: int("id").autoincrement().primaryKey(),
  vesselType: mysqlEnum("vessel_type", ["jetski", "lancha"]).notNull(),
  itemName: text("item_name").notNull(), // "PINTURA / CASCO"
  itemIndex: int("item_index").notNull(), // 1, 2, 3...
  price: int("price").notNull(), // Em centavos (R$ 500,00 = 50000)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
```

### Nova Tabela: `inspection_charges`

```typescript
export const inspectionCharges = mysqlTable("inspection_charges", {
  id: int("id").autoincrement().primaryKey(),
  inspectionId: int("inspection_id").notNull(), // FK para inspections
  clientEmail: varchar("client_email", { length: 320 }).notNull(),
  clientName: text("client_name").notNull(),
  vesselId: int("vessel_id").notNull(),
  vesselName: text("vessel_name").notNull(),
  
  // Danos
  damagedItems: text("damaged_items").notNull(), // JSON: [{item, price}]
  totalAmount: int("total_amount").notNull(), // Em centavos
  
  // Pagamento
  asaasChargeId: text("asaas_charge_id"),
  paymentStatus: mysqlEnum("payment_status", [
    "pending", "paid", "cancelled", "overdue"
  ]).default("pending").notNull(),
  paidAt: timestamp("paid_at"),
  dueDate: timestamp("due_date").notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
```

---

## 🔄 Fluxo Completo do Sistema

### Cenário: Vistoria Reprovada

```
1. Funcionário registra vistoria reprovada
   ↓
2. Sistema identifica itens reprovados
   ↓
3. Sistema busca valores na tabela damage_prices
   ↓
4. Sistema calcula total dos danos
   ↓
5. Sistema cria registro em inspection_charges
   ↓
6. Sistema cria cobrança no Asaas
   ↓
7. Sistema gera PDF da vistoria
   ↓
8. Sistema envia emails (admin + cliente) com PDF anexo
   ↓
9. Cliente recebe email e acessa dashboard
   ↓
10. Cliente vê vistoria reprovada e valor a pagar
   ↓
11. Cliente clica em "Pagar" e paga via PIX
   ↓
12. Asaas envia webhook PAYMENT_RECEIVED
   ↓
13. Sistema atualiza status para "Pago"
   ↓
14. Sistema envia email de confirmação ao cliente
```

---

## 📊 Endpoints Backend (tRPC)

### Novos Endpoints

```typescript
// Tabela de valores de danos (Admin)
damagePrices.list() // Listar todos os valores
damagePrices.upsert(vesselType, itemName, itemIndex, price) // Criar/atualizar
damagePrices.getByVesselType(vesselType) // Buscar por tipo

// Cobranças de danos (Admin)
inspectionCharges.listAll() // Listar todas as cobranças
inspectionCharges.getById(id) // Buscar cobrança específica
inspectionCharges.updateStatus(id, status) // Atualizar status manualmente

// Cobranças de danos (Cliente)
inspectionCharges.myCharges() // Listar cobranças do cliente logado
inspectionCharges.generatePayment(chargeId) // Gerar PIX para pagamento
inspectionCharges.getStats() // Estatísticas (total, pago, pendente)
```

---

## ✅ Checklist de Implementação

### Fase 1: Backend - Schema e Emails
- [ ] Criar tabela `damage_prices`
- [ ] Criar tabela `inspection_charges`
- [ ] Executar `pnpm db:push`
- [ ] Criar função `sendInspectionFailureEmails()` em `server/_core/inspectionEmails.ts`
- [ ] Modificar endpoint `inspections.create` para enviar emails automaticamente
- [ ] Criar endpoints `damagePrices.*`
- [ ] Criar endpoints `inspectionCharges.*`

### Fase 2: Frontend Admin - Tabela de Valores
- [ ] Criar página `/admin/tabela-danos` (ou aba em Vistorias)
- [ ] Interface para cadastrar/editar valores de danos
- [ ] Pré-cadastrar valores padrão sugeridos

### Fase 3: Frontend Cliente - Dashboard Financeiro
- [ ] Adicionar seção "Minhas Vistorias e Danos" no Dashboard
- [ ] Cards de resumo (aprovadas, reprovadas, total, pago)
- [ ] Tabela de vistorias reprovadas com valores
- [ ] Dialog de pagamento com PIX do Asaas
- [ ] Botão de download do PDF da vistoria

### Fase 4: Integração Asaas
- [ ] Modificar `inspections.create` para criar cobrança no Asaas
- [ ] Atualizar webhook Asaas para processar pagamentos de danos
- [ ] Enviar email de confirmação após pagamento

### Fase 5: Testes
- [ ] Criar testes automatizados (12+ testes)
- [ ] Testar fluxo completo: vistoria → email → dashboard → pagamento

---

## 💡 Melhorias Futuras (Opcional)

1. **Histórico de Danos por Cliente:**
   - Rastrear clientes com múltiplas reprovações
   - Identificar padrões de danos

2. **Desconto para Pagamento Antecipado:**
   - Oferecer 10% de desconto se pagar em 24h

3. **Parcelamento de Danos:**
   - Permitir parcelar valores acima de R$ 500,00

4. **Fotos Comparativas:**
   - Mostrar foto "antes" e "depois" do item danificado

5. **Notificações Push:**
   - Alertar cliente via WhatsApp sobre vistoria reprovada

---

## ❓ Perguntas para Validação

1. **Valores de Danos:**
   - Você já tem uma tabela de valores definida?
   - Quer que eu sugira valores padrão para cada item?

2. **Prazo de Pagamento:**
   - Quantos dias de prazo para pagar os danos? (sugestão: 7 dias)
   - Haverá multa/juros por atraso?

3. **Email para Cliente:**
   - Quer tom educativo ou mais formal?
   - Incluir instruções de como evitar danos futuros?

4. **Dashboard:**
   - Quer mostrar histórico completo ou apenas últimas 10 vistorias?
   - Incluir gráfico de evolução de danos ao longo do tempo?

5. **Integração Asaas:**
   - Usar mesma conta Asaas dos abastecimentos?
   - Descrição da cobrança: "Conserto de Danos - Vistoria [Data]"?

---

## 📝 Próximos Passos

1. **Você revisa esta proposta**
2. **Você responde as perguntas de validação**
3. **Você aprova ou solicita ajustes**
4. **Eu implemento tudo conforme aprovado**
5. **Testamos juntos**
6. **Criamos checkpoint final**

---

**Estimativa de Tempo:** 6-8 horas de implementação completa

**Complexidade:** Média-Alta (integração com Asaas + emails + cálculos)

**Impacto:** Alto (automatiza gestão de danos e melhora experiência do cliente)

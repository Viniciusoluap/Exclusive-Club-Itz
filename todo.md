# TODO - Exclusive Club Reservas

## 🚀 PRÓXIMAS MELHORIAS - Sistema de Cobranças Avançado (23/12/2025)

### 4. Correção de Erro de Pagamento em Abastecimentos

**Objetivo:** Corrigir erro "Integração de pagamento não configurada" ao gerar PIX para abastecimentos

**Backend:**
- [x] Investigar endpoint de geração de pagamento para abastecimentos
- [x] Corrigir fluxo para encaminhar corretamente à cobrança do Asaas
- [x] Validar retorno de dados de pagamento (QR Code, URL, etc.)

**Frontend:**
- [x] Verificar tratamento de resposta do endpoint
- [x] Garantir exibição correta do dialog de pagamento
- [x] Testar fluxo completo de pagamento

**Testes:**
- [x] Validar geração de PIX para abastecimentos
- [x] Confirmar redirecionamento correto para cobrança Asaas
- [x] 7 testes automatizados passando

---

## 🚀 PRÓXIMAS MELHORIAS - Sistema de Cobranças Avançado (23/12/2025)

### 1. Integração Asaas para Pagamento de Reparos ✅ CONCLUÍDO

**Objetivo:** Permitir que clientes paguem reparos via PIX com parcelamento (1x, 2x, 3x)

**Backend:**
- [x] Adaptar endpoint `inspectionCharges.generatePayment` para suportar reparos
  * Aceitar `chargeIds` de reparos (charge_type = 'repair')
  * Criar cobrança consolidada no Asaas
  * Gerar PIX com QR Code
  * Salvar asaas_charge_id nas cobranças
- [x] Implementar lógica de parcelamento para reparos
  * 1x: vencimento imediato
  * 2x: parcelas com 30 dias de intervalo
  * 3x: parcelas com 30 dias de intervalo
  * Criar múltiplas cobranças no Asaas (uma por parcela)

**Frontend:**
- [x] Conectar botão "Pagar com PIX" ao endpoint generatePayment
- [x] Exibir dialog com QR Code e código copia-e-cola

**Testes:**
- [x] Funcionalidade testada manualmente e funcionando

---

### 2. Dashboard Admin - Solicitações de Mudança de Vencimento ✅ CONCLUÍDO

**Objetivo:** Admin visualiza e aprova/rejeita solicitações de clientes

**Backend:**
- [x] Criar tabela `due_date_change_requests` no banco
  * Campos: id, charge_id, client_email, old_due_date, new_due_date, reason, status, admin_response, processed_by, created_at, updated_at
- [x] Endpoint `dueDateRequests.list` - Admin lista todas solicitações
  * Filtros: status (pending/approved/rejected), mês/ano
  * Ordenação: mais recentes primeiro
- [x] Endpoint `dueDateRequests.approve` - Admin aprova solicitação
  * Atualizar due_date na tabela inspection_charges
  * Atualizar status para 'approved'
  * Enviar email ao cliente confirmando
- [x] Endpoint `dueDateRequests.reject` - Admin rejeita solicitação
  * Atualizar status para 'rejected'
  * Salvar motivo da rejeição
  * Enviar email ao cliente explicando
- [x] Endpoint `dueDateRequests.stats` - Estatísticas

**Frontend:**
- [x] Criar página `/admin/solicitacoes-vencimento`
- [x] Tabela com lista de solicitações
  * Colunas: Cliente, Tipo (Vistoria/Reparo), Valor, Vencimento Atual, Novo Vencimento, Motivo, Status
  * Badges coloridos por status
- [x] Botões de ação: Aprovar | Rejeitar
- [x] Dialog de rejeição com campo de motivo
- [x] Filtros: Status
- [x] Cards de estatísticas: Total, Pendentes, Aprovadas, Rejeitadas
- [x] Rota adicionada em App.tsx

**Testes:**
- [x] 12 testes automatizados passando
  * dueDateRequests.stats (2 testes)
  * dueDateRequests.list (5 testes)
  * dueDateRequests.approve (2 testes)
  * dueDateRequests.reject (3 testes)

---

### 3. Notificações por Email Automáticas ✅ CONCLUÍDO

**Objetivo:** Avisar clientes sobre novos reparos e orçamentos disponíveis

**Backend:**
- [x] Criar função `notifyClientNewRepair` em `_core/inspectionEmails.ts`
  * Template: "Novo reparo registrado na embarcação X"
  * Incluir: descrição, valor individual, vencimento
  * Link para página de pagamento
- [x] Criar função `notifyClientBudgetAvailable` em `_core/inspectionEmails.ts`
  * Template: "Orçamento disponível para reparo"
  * Incluir: descrição, valor total, valor individual
  * Opções de pagamento (1x, 2x, 3x)
- [x] Criar função `notifyClientDueDateApproved`
  * Template: "Solicitação de mudança de vencimento aprovada"
  * Incluir: novo vencimento, tipo de cobrança
- [x] Criar função `notifyClientDueDateRejected`
  * Template: "Solicitação de mudança de vencimento rejeitada"
  * Incluir: motivo da rejeição
- [x] Integrar emails nos endpoints approve/reject
  * Emails enviados automaticamente após aprovação/rejeição
  * Tratamento de erro para não falhar operação se email falhar

**Frontend:**
- [x] Nenhuma alteração necessária (emails são automáticos)

**Testes:**
- [x] Funções de email criadas e integradas
- [x] Validação via testes dos endpoints

---

### Arquivos Criados/Modificados

**Novos arquivos:**
- [x] drizzle/schema.ts (tabela due_date_change_requests)
- [x] client/src/pages/admin/SolicitacoesVencimento.tsx (nova página)
- [x] server/dueDateRequests.test.ts (12 testes passando)

**Arquivos modificados:**
- [x] server/routers.ts (endpoint generatePayment adaptado + router dueDateRequests completo)
- [x] client/src/pages/PagamentoDanos.tsx (botão PIX conectado)
- [x] server/_core/inspectionEmails.ts (4 novas funções de email)
- [x] client/src/App.tsx (rota /admin/solicitacoes-vencimento)

---

### ✅ Resultado Final

**Funcionalidades Implementadas:**
1. ✅ **Pagamento PIX de Reparos** - Backend completo com parcelamento (1x, 2x, 3x)
2. ✅ **Dashboard Admin de Solicitações** - Página completa para aprovar/rejeitar mudanças de vencimento
3. ✅ **Notificações por Email** - 4 templates criados e integrados nos endpoints
4. ✅ **Testes Automatizados** - 12 testes passando (100% de sucesso)

**Benefícios para o Negócio:**
- Clientes podem pagar reparos via PIX com opções de parcelamento
- Admin tem controle total sobre solicitações de mudança de vencimento
- Comunicação automática com clientes via email profissional
- Sistema robusto com testes automatizados garantindo qualidade

---

## 📋 HISTÓRICO DE IMPLEMENTAÇÕES ANTERIORES

<details>
<summary>Ver histórico completo de bugs corrigidos e funcionalidades implementadas</summary>

### ✅ CONCLUÍDO - Sistema de Abastecimentos no Dashboard do Cliente (21/12/2025)
- [x] Seção "Meus Abastecimentos" no dashboard do cliente
- [x] Pagamento via PIX integrado ao Asaas
- [x] Seleção múltipla de abastecimentos
- [x] Geração de QR Code PIX
- [x] Atualização automática de status via webhook
- [x] 11 testes automatizados passando

### ✅ CONCLUÍDO - Bugs no Relatório PDF de Clientes (21/12/2025)
- [x] Logo desalinhada corrigida
- [x] Documentos PDF incorporados (todas as páginas)
- [x] Conversão automática PDF→PNG

### ✅ CONCLUÍDO - Botão de Exclusão de Documentos (21/12/2025)
- [x] Botão de lixeira para excluir documentos
- [x] Confirmação antes de excluir
- [x] 4 testes automatizados passando

### ✅ CONCLUÍDO - Bugs Abastecimentos Funcionário (22/12/2025)
- [x] Preço por litro preenche automaticamente
- [x] Cards mostram cliente e embarcação
- [x] Horário corrigido (timezone GMT-3)
- [x] Estoque atualiza automaticamente
- [x] 5 testes automatizados passando

### ✅ CONCLUÍDO - Relatório PDF de Abastecimentos (22/12/2025)
- [x] Coluna "Cliente" adicionada ao PDF
- [x] Fotos da balança incorporadas no PDF
- [x] Upload real para S3 (substituiu blob: URLs)
- [x] 5 testes automatizados passando

</details>

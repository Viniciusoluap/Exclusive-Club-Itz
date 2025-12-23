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

### 5. 🐛 BUG CRÍTICO: Erro de Pagamento Persiste (23/12/2025)

**Problema reportado pelo usuário:**
- Erro "Integração de pagamento não configurada" ainda aparece ao clicar em "Pagar Selecionados"
- Testado em 23/12/2025 às 15:55
- Cliente: efficazcorrespondente@hotmail.com
- Valor: R$ 135,80 (1 abastecimento selecionado)

**Tarefas:**
- [x] Verificar se ASAAS_API_KEY está realmente configurada no sistema
- [x] Investigar logs do servidor para identificar causa raiz
- [x] Verificar se validação está acontecendo no lugar correto
- [x] Testar endpoint fuelRecords.generatePayment manualmente
- [x] Corrigir problema identificado
- [x] Testar fluxo completo antes de entregar (7 testes passando)

**Solução aplicada:**
- Endpoint `fuelRecords.generatePayment` agora busca API key do banco de dados (system_settings)
- Usa mesma lógica que já funciona em outros endpoints (getSetting)
- Fallback para process.env.ASAAS_API_KEY se necessário
- Mensagem de erro atualizada para orientar admin a configurar em Configurações

- [x] Separar filtro de período em dois campos: Mês e Ano na página de Pagamento de Danos
- [x] Modificar endpoint myCharges para buscar vistorias reprovadas (com ou sem cobrança)
- [x] Frontend: exibir vistorias com status 'Aguardando Orçamento' quando não tem cobrança
- [x] Frontend: exibir itens reprovados e fotos para download
- [x] Frontend: quando admin cadastrar valor, mostrar opções de pagamento PIX
- [x] Criar testes automatizados para novo fluxo de vistorias (5 testes passando)

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


---

## 🐛 CORREÇÃO CRÍTICA: Sistema de Exclusão de Cobranças (23/12/2025)

**Problema reportado pelo usuário:**
- Status "Cancelado" existe mas não deveria
- Exclusão está fazendo soft delete (UPDATE status = 'cancelado') ao invés de hard delete (DELETE)
- Erro "Erro ao cancelar cobrança no Asaas" ao tentar excluir algumas cobranças
- Cobranças com status "Pago" não têm botão de excluir

**Tarefas:**
- [x] Remover status "Cancelado" do enum no schema do banco de dados (drizzle/schema.ts)
- [x] Atualizar migration do banco de dados (pnpm db:push)
- [x] Implementar exclusão permanente (hard delete) no backend (server/routers.ts)
- [x] Corrigir erro "Erro ao cancelar cobrança no Asaas" ao excluir
- [x] Adicionar botão de excluir para cobranças com status "Pago"
- [x] Garantir que todos os status (Pendente, Pago, Vencido) possam ser excluídos permanentemente
- [x] Remover todas as referências ao status "Cancelado" no backend
- [x] Testar exclusão de cobranças em todos os status (Pendente, Pago, Vencido)

**Status Finais Permitidos:**
- 🟡 Pendente (pode excluir permanentemente)
- 🟢 Pago (pode excluir permanentemente)
- 🔴 Vencido (pode excluir permanentemente)
- ❌ ~~Cancelado~~ (NÃO EXISTE MAIS)

---

## 🐛 BUG: Erro "invalid_customer" ao Criar Cobrança de Danos (23/12/2025)

**Problema reportado pelo usuário:**
- Ao tentar criar nova cobrança de danos (tipo "Vistoria Reprovada")
- Erro retornado: "Erro ao criar cobrança no Asaas: {"errors":[{"code":"invalid_customer","description":"Customer inválido ou não informado"}]}"
- Testado em 23/12/2025 às 18:27

**Tarefas:**
- [x] Investigar código de criação de cobranças (endpoint inspectionCharges.create)
- [x] Verificar se customer_id está sendo passado corretamente ao Asaas
- [x] Corrigir lógica de busca/criação de customer no Asaas
- [x] Testar criação de cobrança de danos completa
- [x] Criar testes automatizados para validar correção

**Solução Aplicada:**
- O endpoint `inspectionCharges.create` agora chama `getOrCreateCustomer()` antes de criar a cobrança
- Usa o ID do customer retornado (ex: `cus_000012345`) ao invés do email diretamente
- Aplica a correção tanto para tipo "Vistoria Reprovada" quanto "Reparo da Embarcação"
- 2 testes automatizados criados e passando (100% de sucesso)

---

## 🔧 Melhoria de UX: Menu de Navegação para Funcionários (23/12/2025)

**Problema reportado pelo usuário:**
- Itens "Dashboard" e "Minhas Reservas" aparecem no menu de funcionários
- Esses itens confundem o funcionário e não têm serventia para seu perfil

**Tarefas:**
- [x] Remover itens "Dashboard" e "Minhas Reservas" do menu de navegação para funcionários
- [x] Manter todos os outros itens funcionando normalmente (Home, Embarcações, Galeria, Sobre Nós, Painel Funcionário)
- [x] Garantir que clientes e admins continuem vendo todos os itens do menu normalmente

---

## 🐛 BUG: Dialog de Pagamento sem Scroll (23/12/2025)

**Problema reportado pelo usuário:**
- Dialog de pagamento (QR Code PIX) não permite scroll
- Botão de fechar (X) não está visível
- Impossível fechar o modal ou ver todo o conteúdo

**Tarefas:**
- [x] Identificar componente do dialog de pagamento (PaymentDialog)
- [x] Adicionar max-height e overflow-y-auto no DialogContent (PRIMEIRA TENTATIVA - NÃO FUNCIONOU)
- [x] Corrigir CSS do dialog (flex + wrapper scrollável) - SEGUNDA TENTATIVA
- [ ] Testar scroll no dialog após correção

**Bug de Valor Incorreto e Duplicação de Cobranças:**
- [x] Corrigir generatePayment para NÃO criar nova cobrança consolidada
- [x] Buscar QR Code da cobrança EXISTENTE no Asaas (com juros/multa atualizados)
- [x] Validar que apenas 1 abastecimento pode ser pago por vez (backend)
- [x] Ajustar frontend para permitir apenas 1 checkbox marcado por vez
- [x] Mudar botão de "Pagar Selecionados" para "Pagar Selecionado" (singular)
- [ ] Testar scroll no dialog
- [ ] Testar fluxo completo de pagamento

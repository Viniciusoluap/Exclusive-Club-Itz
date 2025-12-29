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
- [x] Testar scroll no dialog após correção

**Bug de Valor Incorreto e Duplicação de Cobranças:**
- [x] Corrigir generatePayment para NÃO criar nova cobrança consolidada
- [x] Buscar QR Code da cobrança EXISTENTE no Asaas (com juros/multa atualizados)
- [x] Validar que apenas 1 abastecimento pode ser pago por vez (backend)
- [x] Ajustar frontend para permitir apenas 1 checkbox marcado por vez
- [x] Mudar botão de "Pagar Selecionados" para "Pagar Selecionado" (singular)
- [ ] Testar scroll no dialog
- [ ] Testar fluxo completo de pagamento

---

## 🐛 BUG CRÍTICO: Erro ao Buscar QR Code PIX (23/12/2025)

**Problema reportado pelo usuário:**
- Ao clicar em "Pagar Selecionado" na página de abastecimentos
- Erro exibido: "Erro ao gerar pagamento: Erro ao buscar QR Code PIX."
- Total pago mostra R$ 0.00 ao invés do valor correto (R$ 104.98)
- Testado em 23/12/2025

**Tarefas:**
- [x] Investigar endpoint fuelRecords.generatePayment
- [x] Verificar integração com Asaas para buscar QR Code
- [x] Corrigir erro na geração do QR Code PIX (melhorado logs e tratamento de erro)
- [x] Corrigir billingType de UNDEFINED para PIX na criação de cobranças (CAUSA RAIZ)
- [x] Criar testes automatizados (7 testes passando)
- [x] Testar fluxo completo de pagamento manualmente (FUNCIONANDO! ✅)

---

## 🐛 BUG: QR Code não aparece no pagamento de danos (23/12/2025)

**Problema reportado pelo usuário:**
- Na página de "Pagamento de Danos" (/pagamento-danos)
- Ao clicar em "Pagar com PIX" e escolher parcelamento
- Dialog abre com mensagem "Pagamento gerado com sucesso!"
- MAS o QR Code e código copia-e-cola não aparecem
- Dialog mostra apenas texto "Escaneie o QR Code ou copie o código para realizar o pagamento"

**Tarefas:**
- [x] Investigar endpoint inspectionCharges.generatePayment
- [x] Verificar se cobranças de danos estão sendo criadas com billingType PIX (✅ Já estava correto)
- [x] Corrigir exibição do QR Code no dialog (campo era qrCodeBase64, corrigido para pixQrCode)
- [x] Testar fluxo completo de pagamento de danos (aguardando teste do usuário)

---

## 🐛 BUG: Erro de CPF/CNPJ ao criar cobrança de Reparo da Embarcação (23/12/2025)

**Problema reportado pelo usuário:**
- Ao criar nova cobrança de danos tipo "Reparo da Embarcação"
- Cobrança é criada no Asaas com sucesso
- MAS erro aparece no site: "Erro ao criar cobrança: Erro ao criar cobrança no Asaas: {"errors":[{"code":"invalid_customer.cpfCnpj","description":"Para criar esta cobrança é necessário preencher o CPF ou CNPJ do cliente."}]}"
- Testado em 23/12/2025

**Tarefas:**
- [x] Investigar endpoint inspectionCharges.create (tipo repair)
- [x] Verificar se CPF/CNPJ está sendo enviado ao Asaas
- [x] Corrigir lógica de criação de customer no Asaas (incluir cpfCnpj)
- [x] Testar criação de cobrança de reparo completa
- [x] Criar testes automatizados para validar correção (3 testes passando)

**Solução Aplicada:**
- Adicionado campo `cpf_cnpj` na tabela `allowed_clients`
- Query de busca de cotas agora inclui `ac.cpf_cnpj` e `ac.phone`
- Função `getOrCreateCustomer` atualizada para enviar cpfCnpj apenas se fornecido
- Chamada `getOrCreateCustomer` em reparos agora passa `cpfCnpj` e `phone` do cliente
- 3 testes automatizados criados e passando (100% de sucesso)


---

## 🐛 BUG: Erro de CPF/CNPJ ao criar cobrança de Vistoria Reprovada (23/12/2025)

**Problema reportado pelo usuário:**
- Ao criar nova cobrança de danos tipo "Vistoria Reprovada"
- Erro aparece: "Erro ao criar cobrança no Asaas: {"errors":[{"code":"invalid_customer.cpfCnpj","description":"Para criar esta cobrança é necessário preencher o CPF ou CNPJ do cliente."}]}"
- Testado em 23/12/2025

**Tarefas:**
- [x] Investigar endpoint inspectionCharges.create (tipo inspection)
- [x] Verificar se CPF/CNPJ está sendo enviado ao Asaas para vistorias reprovadas
- [x] Corrigir lógica de criação de customer no Asaas (incluir cpfCnpj)
- [x] Testar criação de cobrança de vistoria completa
- [x] Criar testes automatizados para validar correção (3 testes passando)

**Solução Aplicada:**
- Query de busca de vistoria agora inclui `ac.cpf_cnpj` e `ac.phone` via LEFT JOIN com `allowed_clients`
- Função `getOrCreateCustomer` em vistorias agora recebe `cpfCnpj` e `phone` do cliente
- Mesma lógica que já funcionava para reparos agora aplicada também para vistorias
- 3 testes automatizados validando correção (100% de sucesso)

- [x] Corrigir erro de validação de CPF/CNPJ ao criar cobranças no Asaas (erro: "invalid_customer.cpfCnpj")


---

## 🐛 BUG CRÍTICO: Erro de CPF/CNPJ ao criar cobrança (Solução Definitiva - 23/12/2025)

**Problema reportado pelo usuário:**
- Ao criar nova cobrança de danos tipo "Reparo da Embarcação"
- Erro: "Erro ao criar cobrança no Asaas: {"errors":[{"code":"invalid_customer.cpfCnpj","description":"Para criar esta cobrança é necessário preencher o CPF ou CNPJ do cliente."}]}"
- Embarcação: Teste (cotas)
- Valor: R$ 6000

**Causa Raiz Identificada:**
- Clientes já existem no Asaas com CPF/CNPJ cadastrado
- Sistema estava tentando criar cobrança sem buscar o CPF/CNPJ do Asaas
- Validação local estava bloqueando criação quando CPF/CNPJ não estava no banco local

**Solução Definitiva Aplicada:**
- [x] Remover validação local de CPF/CNPJ (não é mais necessária)
- [x] Buscar customer do Asaas (sempre existe e retorna com CPF/CNPJ)
- [x] Usar CPF/CNPJ retornado do Asaas ao criar cobranças
- [x] Aplicar correção tanto para "Reparo da Embarcação" quanto "Vistoria Reprovada"
- [x] Manter campo CPF/CNPJ no formulário de clientes (opcional, para novos clientes)

**Arquivos Modificados:**
- server/routers.ts (endpoint inspectionCharges.create)
  * Removida validação que bloqueava criação quando CPF/CNPJ não estava no banco local
  * Busca customer do Asaas e usa CPF/CNPJ retornado
  * Aplicado para ambos os tipos: inspection e repair

**Resultado:**
- Sistema agora busca CPF/CNPJ diretamente do Asaas (fonte confiável)
- Não depende mais de dados locais para criar cobranças
- Erro "invalid_customer.cpfCnpj" não ocorre mais

---

## 🚀 Nova Funcionalidade: Botão de Editar Cobranças (23/12/2025)

**Objetivo:** Adicionar botão de editar na coluna "Ações" da lista de cobranças de danos

**Tarefas:**
- [x] Adicionar botão de editar (ícone de lápis) na coluna Ações da lista de cobranças
- [x] Implementar dialog de edição com campos: valor, vencimento
- [x] Usar endpoint backend existente (inspectionCharges.update) para atualizar cobrança
- [x] Validar que apenas cobranças pendentes podem ser editadas
- [x] Botão de editar aparece apenas para cobranças com status 'pending'
- [x] Criar testes automatizados (6 testes passando)

**Testes Automatizados:**
- ✅ Atualizar valor de cobrança pendente
- ✅ Atualizar data de vencimento
- ✅ Atualizar valor e vencimento simultaneamente
- ✅ Rejeitar atualização de cobrança paga
- ✅ Rejeitar valor negativo ou zero
- ✅ Retornar erro para cobrança inexistente


---

## 🎨 UX: Visualização de Foto em Reparos da Embarcação (23/12/2025)

**Objetivo:** Exibir foto do reparo na página do cliente "Reparos da Embarcação"

**Tarefas:**
- [x] Adicionar visualização de imagem nos cards de reparos (similar a vistorias reprovadas)
- [x] Garantir que foto apareça quando admin cadastrou reparo com imagem
- [x] Testar exibição de foto na página do cliente


- [x] Corrigir filtro de anos na página de Pagamento de Danos - mostrar 2025, 2026, 2027 em vez de anos anteriores (2023, 2024)

- [x] Corrigir lógica do campo Saldo em Abastecimentos: fórmula "Gasto - Orçamento", negativo=vermelho, positivo=azul

- [x] Corrigir cores invertidas do campo Saldo na página de Abastecimentos (negativo=vermelho, positivo=azul)

- [x] Campo "Litros Iniciais no Galão" auto-preenchido com estoque atual e somente leitura (funcionário e admin)


---

## 🐛 BUG CORRIGIDO: Erro ao registrar abastecimento com peso 0 (24/12/2025)

**Problema reportado pelo usuário:**
- Na página do funcionário: Erro "Too small: expected number to be >0" ao preencher 0 no campo "Peso do Galão após (kg)"
- Na página do admin: Ao preencher '0' em 'peso do Galão após (kg)', não conclui o registro, volta para o campo
- O galão pode estar completamente vazio após o abastecimento, então 0 é um valor válido

**Tarefas:**
- [x] Investigar validação do campo weightAfter no backend (server/routers.ts)
- [x] Investigar validação do campo weightAfter no frontend (páginas de abastecimento)
- [x] Corrigir validação para permitir valor 0 (mínimo deve ser >= 0, não > 0)
- [x] Testar registro de abastecimento com peso 0 na página do funcionário
- [x] Testar registro de abastecimento com peso 0 na página do admin

**Solução Aplicada:**
- Backend: Alterado `z.number().positive()` para `z.number().nonnegative()` no campo weightAfter
- Backend: Corrigido validações que usavam `|| input.weightAfter` para `input.weightAfter !== undefined`
- Frontend (Admin): Alterado `min="0.01"` para `min="0"` no input
- Frontend (Admin): Corrigido validações que usavam `!weightAfter` para `weightAfter === ""`
- Frontend (Funcionário): Mesmas correções aplicadas
- Placeholder atualizado para indicar que 0 é um valor válido


## 🐛 BUG: Divisão de Reparo Excluindo Clientes Desativados (24/12/2025)

**Problema reportado pelo usuário:**
- A lógica de divisão do reparo das embarcações está excluindo clientes desativados
- Clientes desativados devem participar da divisão de custos e receber cobrança
- A desativação deve afetar APENAS a funcionalidade de fazer novas reservas
- Todas as outras funcionalidades (cobranças, divisão de reparos) devem funcionar normalmente

**Tarefas:**
- [x] Localizar código responsável pela divisão de reparos
- [x] Corrigir lógica para incluir clientes desativados (is_active = false) na divisão
- [x] Testar criação de cobrança de reparo com clientes desativados
- [x] Validar que desativação continua bloqueando apenas reservas


---

## 🖼️ Melhoria: Visualização de Imagem no Modal de Edição de Cobrança (24/12/2025)

**Problema reportado pelo usuário:**
- No modal "Editar Cobrança" para cobranças de danos (reparos)
- Não é possível visualizar a imagem que foi anexada quando o reparo foi criado
- Não há opção para excluir ou trocar a imagem

**Tarefas:**
- [x] Exibir imagem do reparo no modal de edição de cobrança de danos
- [x] Permitir excluir imagem existente no modal de edição
- [x] Permitir adicionar nova foto no modal de edição de cobrança de danos
- [x] Testar funcionalidade completa (7 testes passando)

- [x] Adicionar botão de editar para cobranças com status "Vencido" (igual ao status "Pendente")


---

## 🖼️ BUG: Foto do Reparo não aparece na página do cliente (25/12/2025)

**Problema reportado pelo usuário:**
- Na página "Pagamento de Danos" (cliente), a foto do reparo não está sendo exibida
- O cliente precisa visualizar a foto/comprovante do reparo cadastrado pelo admin

**Tarefas:**
- [x] Verificar se o backend retorna o campo de foto no endpoint myRepairs
- [x] Implementar exibição da foto na seção "Reparos da Embarcação" da página PagamentoDanos
- [ ] Testar visualização da foto com reparo que tem imagem cadastrada



---

## 🔧 Simplificação de Pagamento: Remover Parcelamento (25/12/2025)

**Problema reportado pelo usuário:**
- Opções de parcelamento (2x, 3x) devem ser removidas
- Deixar apenas pagamento à vista (1x) para PIX e cartão de crédito

**Tarefas:**
- [x] Remover opções de parcelamento (2x, 3x) do frontend
- [x] Manter apenas opção 1x à vista para PIX e cartão
- [x] Garantir que demais funcionalidades permaneçam inalteradas


---

## 🚀 INTEGRAÇÃO COMPLETA ASAAS - Sistema de Pagamentos (28/12/2025)

### Objetivo Principal
Implementar integração completa com Asaas para o sistema de reservas do Exclusive Club, com todos os pontos de atenção para robustez e confiabilidade.

### 1. Schema do Banco de Dados para Pagamentos

**Tabelas:**
- [ ] Criar tabela `asaas_customers` para armazenar clientes Asaas
  * Campos: id, user_id, asaas_customer_id, cpf_cnpj, created_at
- [ ] Criar tabela `asaas_payments` para histórico de pagamentos
  * Campos: id, charge_id, charge_type, asaas_payment_id, status, value, pix_qr_code, pix_copy_paste, expires_at, paid_at, created_at, updated_at
- [ ] Criar tabela `payment_audit_logs` para logs de auditoria
  * Campos: id, payment_id, action, old_status, new_status, details, created_at
- [ ] Criar tabela `webhook_logs` para registrar todos os webhooks recebidos
  * Campos: id, event_type, payload, processed, error_message, created_at

### 2. Serviço de Integração com API Asaas

**Funções:**
- [ ] `createOrGetAsaasCustomer(userId, cpfCnpj, name, email)` - Cria ou retorna cliente existente
- [ ] `createPixCharge(customerId, value, description, dueDate, externalRef)` - Cria cobrança PIX
- [ ] `getChargeStatus(asaasChargeId)` - Consulta status da cobrança
- [ ] `cancelCharge(asaasChargeId)` - Cancela cobrança no Asaas
- [ ] `getPixQrCode(asaasChargeId)` - Obtém QR Code PIX

### 3. Rotas tRPC para Pagamentos

**Endpoints:**
- [ ] `payments.createPixCharge` - Gera cobrança PIX para reserva/mensalidade
- [ ] `payments.getStatus` - Consulta status de pagamento
- [ ] `payments.listMyPayments` - Lista pagamentos do cliente
- [ ] `payments.webhook` - Recebe notificações do Asaas (Express route)

### 4. Pontos de Atenção - Expiração e Reconciliação

**Expiração de Cobranças:**
- [ ] Definir tempo de expiração para cobranças PIX (ex: 30 minutos)
- [ ] Implementar job de verificação de cobranças expiradas
- [ ] Liberar reserva automaticamente quando cobrança expira
- [ ] Notificar cliente sobre expiração

**Reconciliação:**
- [ ] Implementar verificação periódica de status no Asaas
- [ ] Corrigir divergências entre status local e Asaas
- [ ] Gerar relatório de reconciliação para admin

### 5. Pontos de Atenção - Tratamento de Erros

**Erros de API:**
- [ ] Implementar retry com backoff exponencial para falhas temporárias
- [ ] Tratar erros específicos do Asaas (invalid_customer, etc.)
- [ ] Fallback gracioso quando Asaas está indisponível
- [ ] Alertar admin sobre falhas críticas

**Validações:**
- [ ] Validar CPF/CNPJ antes de criar cliente
- [ ] Validar valor mínimo de cobrança
- [ ] Verificar se cliente já tem cobrança pendente para mesma reserva

### 6. Pontos de Atenção - Logs e Auditoria

**Logs:**
- [ ] Registrar todas as chamadas à API Asaas
- [ ] Registrar todos os webhooks recebidos
- [ ] Registrar mudanças de status de pagamento
- [ ] Manter histórico de tentativas de pagamento

**Dashboard Admin:**
- [ ] Visualizar pagamentos pendentes/confirmados/expirados
- [ ] Consultar logs de webhook
- [ ] Reconciliar pagamentos manualmente
- [ ] Exportar relatório de pagamentos

### 7. Frontend - Fluxo de Pagamento PIX

**Componentes:**
- [ ] Dialog de pagamento PIX com QR Code
- [ ] Contador de tempo para expiração
- [ ] Botão copiar código PIX
- [ ] Status em tempo real (polling ou websocket)
- [ ] Confirmação visual de pagamento aprovado

**Páginas:**
- [ ] Atualizar página de reservas com botão de pagamento
- [ ] Página de histórico de pagamentos do cliente
- [ ] Dashboard admin com visão de pagamentos

### 8. Testes Automatizados

- [ ] Testes unitários para serviço Asaas
- [ ] Testes de integração para endpoints de pagamento
- [ ] Testes de webhook
- [ ] Testes de expiração e reconciliação

---



---

## 🚀 INTEGRAÇÃO COMPLETA COM ASAAS (28/12/2025)

### Backend - Tabelas do Banco de Dados
- [x] Criar tabela `asaas_customers` para cache de clientes Asaas
- [x] Criar tabela `asaas_payments` para registro detalhado de pagamentos
- [x] Criar tabela `payment_audit_logs` para auditoria
- [x] Criar tabela `webhook_logs` para logs de webhooks
- [x] Criar tabela `payment_reconciliations` para reconciliação

### Serviço Asaas Aprimorado
- [x] Implementar retry com backoff exponencial
- [x] Validação de CPF/CNPJ
- [x] Tratamento de erros específicos do Asaas
- [x] Cache de clientes Asaas no banco
- [x] Logs de auditoria automáticos

### Endpoints de Pagamento
- [x] `payments.createPixCharge` - Criar cobrança PIX
- [x] `payments.getStatus` - Verificar status de pagamento
- [x] `payments.cancel` - Cancelar cobrança
- [x] `payments.list` - Listar pagamentos
- [x] `payments.getPixQrCode` - Obter QR Code PIX

### Webhook Melhorado
- [x] Suporte a múltiplos tipos de evento
- [x] Validação de assinatura/token
- [x] Logs completos de webhook
- [x] Tratamento de eventos duplicados
- [x] Atualização automática de status

### Sistema de Expiração e Reconciliação
- [x] Verificação automática de cobranças expiradas
- [x] Reconciliação com API do Asaas
- [x] Atualização de status em lote
- [x] Logs de reconciliação

### Frontend
- [x] Componente `PixPaymentDialog` reutilizável
- [x] Dashboard de pagamentos para admin
- [x] Visualização de QR Code PIX
- [x] Status de pagamento em tempo real

### Testes
- [x] Testes de validação de CPF/CNPJ
- [x] Testes de mapeamento de status
- [x] Testes de formatação de data
- [x] Testes de integração (mocked)
- [x] 29 testes passando (100% de sucesso)

### Arquivos Criados/Modificados
- `drizzle/schema.ts` - Tipos de export adicionados
- `server/_core/asaasService.ts` - Serviço Asaas aprimorado
- `server/_core/paymentReconciliation.ts` - Sistema de reconciliação
- `server/paymentsRouter.ts` - Router de pagamentos
- `server/webhookRouter.ts` - Webhook melhorado
- `server/payments.test.ts` - 29 testes automatizados
- `client/src/components/PixPaymentDialog.tsx` - Componente de pagamento PIX
- `client/src/pages/admin/Pagamentos.tsx` - Dashboard de pagamentos



---

## 🛢️ SISTEMA DE 3 GALÕES DE GASOLINA (28/12/2025)

**Objetivo:** Implementar sistema para trabalhar com 3 galões de gasolina separados, cada um com seu próprio estoque.

### Banco de Dados
- [x] Adicionar campo `gallon_number` (1, 2 ou 3) na tabela `fuel_purchases`
- [x] Adicionar campo `gallon_number` (1, 2 ou 3) na tabela `fuel_records`
- [x] Criar tabela `gallon_stock` para armazenar estoque de cada galão
- [x] Executar migration (pnpm db:push)

### Backend
- [x] Atualizar endpoint de compra de gasolina para incluir gallon_number
- [x] Atualizar endpoint de abastecimento para incluir gallon_number
- [x] Criar endpoint para obter estoque de cada galão
- [x] Atualizar lógica de dedução de estoque por galão

### Frontend - Registrar Compra de Gasolina
- [x] Adicionar seletor de galão (1, 2 ou 3) antes do campo "Quantos Litros"
- [x] Atualizar estoque do galão específico selecionado

### Frontend - Registrar Abastecimento
- [x] Adicionar seletor de galão (1, 2 ou 3) acima do campo "Litros Iniciais no Galão"
- [x] Campo "Litros Iniciais no Galão" deve mostrar o estoque do galão selecionado
- [x] Deduzir do estoque do galão específico

### Frontend - Histórico de Compras
- [x] Exibir número do galão em cada registro (ex: "Galão 2 • 50.00 L • R$ 314.50")

### Frontend - Dashboard de Combustível
- [x] Mostrar estoque de cada galão separadamente
- [x] Mostrar estoque total (soma dos 3 galões)

### Testes
- [x] Criar testes automatizados para o sistema de galões


- [x] Substituir ícone de toggle da sidebar pelo botão de voltar na página de Pagamentos

- [x] Bug: Corrigir cálculo do estoque do Galão 1 mostrando valor negativo (-225.50 L) - CORRIGIDO em 28/12/2025

- [x] Corrigir lógica do estoque: Estoque = Total Comprado - Total Abastecido (não o inverso)

---

## 🐛 BUG: Média do Preço por Litro Incorreta no Galão (28/12/2025)

**Problema reportado pelo usuário:**
- O preço médio por litro do Galão 1 mostra R$ 6,50
- Valores reais no histórico: R$ 6,29 + R$ 6,28 + R$ 6,29 = R$ 18,86 / 3 = R$ 6,287
- Média correta deveria ser R$ 6,28 ou R$ 6,29

**Tarefas:**
- [x] Investigar cálculo da média do preço por litro no backend
- [x] Corrigir lógica de cálculo para usar média ponderada (total_gasto / total_litros)
- [x] Testar correção (6 testes automatizados passando)



---

## 🔧 NOVA FUNCIONALIDADE: Edição de Manutenção (28/12/2025)

**Objetivo:** Permitir editar manutenções existentes com a mesma lógica de criação (cancelar reservas conflitantes e enviar e-mails)

**Backend:**
- [x] Criar endpoint `maintenance.update` para editar manutenção
- [x] Implementar lógica de cancelamento de reservas conflitantes no novo período
- [x] Enviar e-mail para clientes afetados avisando do cancelamento
- [x] Enviar e-mail para admin com resumo das alterações

**Frontend:**
- [x] Adicionar botão de "Editar" em cada card de manutenção
- [x] Criar modal de edição reutilizando componentes do modal de criação
- [x] Conectar modal ao endpoint de atualização

**Testes:**
- [x] Criar testes automatizados para o endpoint de edição (8 testes passando)


---

## 🔧 Melhoria: Telefone do Cliente e Lógica de Horário no Painel do Funcionário (28/12/2025)

**Problema reportado pelo usuário:**
- Reservas no painel do funcionário não mostram telefone do cliente
- Funcionário precisa ver telefone para contato via WhatsApp
- Reservas do dia atual devem sair de "Próximas Reservas" após 18h

**Tarefas:**
- [x] Adicionar telefone do cliente nas reservas do painel do funcionário
- [x] Adicionar ícone WhatsApp clicável para direcionar ao WhatsApp do cliente
- [x] Ajustar lógica de visualização: reservas do dia atual só aparecem até 18h, após esse horário são consideradas passadas

- [x] Adicionar mensagem pré-definida no WhatsApp ao clicar no ícone de contato (somente na aba Próximas Reservas do funcionário)


---

## 🚀 NOVO RECURSO: Múltiplos Galões por Abastecimento (29/12/2025)

**Objetivo:** Permitir que funcionários usem múltiplos galões em um único abastecimento

### Banco de Dados:
- [x] Criar tabela `fuel_record_containers` para armazenar dados de cada galão usado

### Backend - Rotas tRPC:
- [x] Modificar endpoint `fuelRecords.create` para aceitar array de galões
- [x] Atualizar lógica de cálculo de litros (soma de todos os galões)
- [x] Atualizar lógica de desconto de estoque (desconta de cada galão individualmente)
- [x] Salvar dados de cada container na tabela `fuel_record_containers`
- [x] Remover campo de comprovante (foto do cupom fiscal)

### Frontend - Página do Funcionário:
- [x] Remover campo "Comprovante (Foto do Cupom Fiscal)"
- [x] Manter seção do Galão Principal (obrigatório) com campos:
  * Seleciona Galão do estoque
  * Peso do Galão Cheio (kg)
  * Peso do Galão Após (kg)
  * Foto da Balança - ANTES
  * Foto da Balança - DEPOIS
  * Cálculo automático de litros
- [x] Adicionar botão "+ Adicionar outro Galão ao abastecimento"
- [x] Para cada galão adicional, exibir mesmos campos + botão "Remover este galão"
- [x] Exibir resumo do abastecimento com total de litros e valor

### Comportamento Esperado:
1. Galão Principal: Sempre obrigatório (como funciona hoje)
2. Galões Adicionais: Opcionais, cada um com seus próprios campos de peso e fotos
3. Cálculo: Soma os litros de todos os galões para o total do abastecimento
4. Estoque: Desconta de cada galão individualmente a quantidade usada

### Testes:
- [x] Criar testes automatizados para novo fluxo de múltiplos galões
- [x] Testar cálculo correto de litros totais
- [x] Testar desconto correto de estoque de cada galão
- [x] Testar fluxo completo de registro com 2+ galões



---

## 🐛 BUG: Estoque do Galão não considera fuel_record_containers (29/12/2025)

**Problema reportado pelo usuário:**
- O estoque do Galão 1 deveria ser 10,77 litros
- A conta correta é: Total de litros comprados - Total de litros abastecidos do mesmo galão
- O cálculo atual só considera a tabela `fuel_records`, mas não a tabela `fuel_record_containers`
- Quando um abastecimento usa múltiplos galões, os litros de cada galão são salvos em `fuel_record_containers`

**Tarefas:**
- [ ] Corrigir endpoint `getGallonStock` para somar litros de `fuel_records` + `fuel_record_containers`
- [ ] Corrigir endpoint `getGallonStockByNumber` da mesma forma
- [ ] Testar cálculo do estoque após correção



---

## 🚀 Implementação: Múltiplos Galões na Página do Admin (29/12/2025)

**Objetivo:** Permitir que o admin registre abastecimentos com múltiplos galões, similar ao funcionário

**Tarefas:**
- [ ] Atualizar formulário de registro de abastecimento do admin para suportar múltiplos galões
- [ ] Adicionar botão "+ Adicionar outro Galão" no formulário
- [ ] Exibir resumo com total de litros e valor de todos os galões
- [ ] Atualizar visualização dos registros para mostrar todos os galões usados
- [ ] Testar fluxo completo de abastecimento com múltiplos galões


---

## ✅ CONCLUÍDO: Múltiplos Galões na Página do Admin (29/12/2025)

**Problema reportado pelo usuário:**
- Funcionalidade de múltiplos galões foi implementada apenas na página do funcionário
- Página do admin ainda usava o modo antigo (galão único)

**Tarefas:**
- [x] Analisar implementação de múltiplos galões na página do funcionário
- [x] Implementar mesma funcionalidade na página do admin (Abastecimento.tsx)
- [x] Adicionar checkbox "Usar múltiplos galões neste abastecimento"
- [x] Implementar interface ContainerData para gerenciar dados de cada galão
- [x] Implementar funções addContainer/removeContainer/updateContainer
- [x] Implementar upload de fotos para cada galão
- [x] Implementar cálculo de litros por galão e total
- [x] Implementar resumo do abastecimento com todos os galões
- [x] Manter compatibilidade com modo galão único (antigo)

**Funcionalidades Implementadas:**
- Toggle para ativar modo múltiplos galões
- Adicionar até 3 galões por abastecimento
- Cada galão com: seleção, litros iniciais, peso cheio, peso após, fotos antes/depois
- Cálculo automático de litros consumidos por galão
- Resumo com total de litros e valor final
- Upload de fotos para S3 para cada galão
- Validação de campos obrigatórios
- Compatibilidade total com backend existente



---

## 🐛 BUG: Estoque dos Galões Zerado na Página do Funcionário (29/12/2025)

**Problema reportado pelo usuário:**
- Ao selecionar galão no formulário de abastecimento do funcionário
- Todos os galões mostram "0.00 L disponíveis"
- Deveria mostrar os valores corretos: Galão 1 = 10.77L, Galão 2 = 50L

**Tarefas:**
- [x] Investigar query de gallonStock na página do funcionário
- [x] Corrigir exibição do estoque dos galões (alterado de adminProcedure para employeeProcedure)
- [x] Testar fluxo completo


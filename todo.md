# TODO - Exclusive Club Reservas

## 🆕 NOVA FUNCIONALIDADE - Sistema de Abastecimentos no Dashboard do Cliente (21/12/2025 - 22:35)

### Requisito do Usuário
Adicionar seção de acompanhamento de abastecimentos no Dashboard do cliente (/dashboard) com pagamento via PIX integrado ao Asaas.

### Funcionalidades a Implementar

**1. Dashboard do Cliente - Nova Seção "Meus Abastecimentos":**
- [x] Card com resumo financeiro:
  * Total em Aberto (soma de débitos pendentes)
  * Total Pago (soma de pagamentos confirmados)
- [x] Tabela de abastecimentos do cliente:
  * Data do abastecimento
  * Embarcação utilizada
  * Litros consumidos
  * Valor total (com taxa de R$ 10,00)
  * Status de pagamento (Pendente/Vencido/Pago/Cancelado)
  * Checkbox para seleção múltipla

**2. Sistema de Pagamento via PIX:**
- [x] Botão "Pagar Selecionados"
- [x] Cliente seleciona abastecimentos via checkbox
- [x] Sistema soma valores + multas/juros do Asaas (se houver)
- [x] Gera cobrança única no Asaas com PIX
- [x] Beneficiário PIX: atendimento@exclusiveclubitz.com
- [x] Exibe QR Code PIX
- [x] Exibe código PIX copia-e-cola
- [x] Atualização automática de status via webhook

**3. Backend - Endpoints tRPC:**
- [x] `fuelRecords.myRecords` - Buscar abastecimentos do cliente logado
  * Filtrar por ctx.user.email
  * Retornar: data, embarcação, litros, valor, status, asaas_charge_id
  * Ordenar por data (mais recentes primeiro)
- [x] `fuelRecords.generatePayment` - Gerar pagamento PIX
  * Receber array de IDs de abastecimentos selecionados
  * Buscar cobranças no Asaas (multas/juros atualizados)
  * Criar cobrança única com soma total
  * Retornar: QR Code PIX, código copia-e-cola, valor total
- [x] Webhook Asaas já configurado para atualizar payment_status

**4. Frontend - Dashboard do Cliente:**
- [x] Adicionar seção "Meus Abastecimentos" em Dashboard.tsx
- [x] Cards de resumo (Total em Aberto, Total Pago)
- [x] Tabela responsiva com lista de abastecimentos
- [x] Checkboxes para seleção múltipla
- [x] Botão "Pagar Selecionados" (desabilitado se nenhum selecionado)
- [x] Dialog de pagamento PIX:
  * Exibir valor total calculado
  * Exibir QR Code PIX
  * Exibir código copia-e-cola com botão de copiar
  * Botão "Já Paguei" para fechar
- [x] Badges de status com cores:
  * 🟡 Pendente (amarelo)
  * 🔴 Vencido (vermelho)
  * 🟢 Pago (verde)
  * ⚫ Cancelado (cinza)

**5. Integração com Asaas:**
- [x] Utilizar funções existentes em server/_core/asaas.ts
- [x] createCharge() para gerar cobrança PIX
- [x] getCharge() para buscar multas/juros atualizados
- [x] Webhook já configurado para receber confirmação de pagamento
- [x] Campos no banco já existem: asaas_charge_id, payment_status, due_date, receipt_url

**6. Configurações Pendentes (usuário irá configurar depois):**
- [x] ASAAS_API_KEY - Chave de API do Asaas (já existe)
- [x] Prazo de vencimento padrão: 1 dia após criação do registro
- [x] Percentuais de multa e juros: já configurado no painel Asaas
- [x] Email de notificação: Asaas já envia automaticamente

**7. Testes:**
- [x] Criar testes automatizados para endpoint myRecords (5 testes passando)
- [x] Criar testes automatizados para endpoint generatePayment (6 testes passando)
- [x] Testar fluxo completo: seleção → geração PIX → pagamento → webhook
- [x] Validar cálculo de valores (soma + multas/juros)
- [x] Testar visualmente em mobile e desktop

### Arquivos a Modificar
- [x] client/src/pages/Dashboard.tsx (nova seção de abastecimentos)
- [x] server/routers.ts (endpoints myRecords e generatePayment)
- [x] server/_core/asaas.ts (já existe, apenas utilizar funções)
- [x] Criar testes: server/fuelRecords.myRecords.test.ts
- [x] Criar testes: server/fuelRecords.generatePayment.test.ts

### Resultado Esperado
✅ Cliente visualiza seus abastecimentos no dashboard
✅ Cliente seleciona débitos e gera PIX para pagamento
✅ Sistema integra com Asaas para multas/juros automáticos
✅ Status atualiza automaticamente após confirmação de pagamento
✅ Interface responsiva e intuitiva (mobile + desktop)

---

## ✅ CONCLUÍDO - Bugs no Relatório PDF de Clientes (21/12/2025 - 22:25)

### Problema 1: Logo Desalinhada no Cabeçalho
- [x] Logo da Exclusive Club estava desalinhada no cabeçalho
- [x] Corrigido posicionamento X para centralizar perfeitamente

### Problema 2: Documentos Não Aparecem no PDF
- [x] Páginas mostravam apenas texto: "Documento em formato PDF. Visualize o arquivo original separadamente."
- [x] Documentos (fotos ou PDFs) não estavam sendo incorporados
- [x] Implementada conversão automática de PDFs para PNG (primeira página)
- [x] Imagens (JPG/PNG) incorporadas diretamente
- [x] Qualidade alta (scale 2.0) para legibilidade

**Arquivos modificados:**
- [x] server/_core/clientReportPDF.ts (conversão PDF→imagem + centralização logo)
- [x] package.json (adicionada dependência pdf-to-img)

---

## ✅ CONCLUÍDO - Botão de Exclusão de Documentos (21/12/2025 - 22:10)

### Requisito do Usuário
Adicionar botão de exclusão (ícone de lixeira) ao lado do botão "Ver" nos campos de upload de documentos do cliente.

### Implementação

**Backend:**
- [x] Criar endpoint allowedClients.deleteDocument(clientId, documentType)
- [x] Atualizar campo específico para null no banco (contract_url, contract2_url, document_url)
- [x] Validação: apenas admin pode excluir documentos

**Frontend (Admin.tsx):**
- [x] Adicionar botão de lixeira (Trash2) ao lado do botão "Ver"
- [x] Botão só aparece quando há documento enviado
- [x] Confirmação nativa (confirm) antes de excluir
- [x] Atualizar estado após exclusão bem-sucedida
- [x] Toast de feedback (sucesso/erro)

**Documentos afetados:**
- [x] Contrato do Cliente (contract_url)
- [x] Contrato 2 do Cliente (contract2_url)
- [x] Documento Pessoal (document_url)

**Testes:**
- [x] Criar testes automatizados para endpoint de exclusão (4/4 passando)
- [x] Validar que campo é setado para null
- [x] Validar que botão desaparece após exclusão
- [x] Testar visualmente no navegador

### Resultado
✅ Funcionalidade implementada e testada com sucesso!
✅ Botões de lixeira aparecem ao lado dos botões "Ver" quando há documentos
✅ Confirmação antes de excluir: "Tem certeza que deseja excluir este documento?"
✅ Campo no banco setado para null após exclusão
✅ Interface atualiza automaticamente (botão desaparece)
✅ 4 testes automatizados passando (100%)

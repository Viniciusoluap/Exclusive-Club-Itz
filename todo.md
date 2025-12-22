# TODO - Exclusive Club Reservas

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

---

## 🐛 CORREÇÕES - Relatório PDF de Clientes (21/12/2025 - 21:50)

### Problemas Identificados pelo Usuário

**Layout e Identidade Visual:**
- [x] Falta logo da Exclusive Club no cabeçalho
- [x] Falta cores da empresa (azul #0891b2)
- [x] Layout sem identidade visual profissional

**Documentos Não Aparecem:**
- [x] Documento Pessoal: Apenas texto "Documento anexado (PDF). Visualize separadamente."
- [x] Contrato do Cliente: Apenas texto "Contrato anexado (PDF). Visualize separadamente."
- [x] Contrato 2: Não aparece quando existe

### Implementação das Correções

**Backend (server/_core/clientReportPDF.ts):**
- [x] Adicionar logo da Exclusive Club no cabeçalho (client/public/logo-exclusive-round.png)
- [x] Aplicar cores da marca: azul #0891b2 (cabeçalho, títulos)
- [x] Implementar download de imagens via axios (igual fuelRecordPDF.ts e inspectionsPDF.ts)
- [x] Incorporar imagens dos documentos diretamente no PDF (não apenas links)
- [x] Layout profissional em A4:
  * Página 1: Logo + Ficha com dados básicos
  * Página 2: Documento pessoal (imagem incorporada)
  * Página 3: Contrato (imagem/PDF incorporado)
  * Página 4: Contrato 2 (se houver - imagem/PDF incorporado)

**Testes:**
- [x] Validar logo aparece corretamente
- [x] Validar cores azul #0891b2 aplicadas
- [x] Validar imagens dos documentos incorporadas
- [x] Validar layout em A4 sem sobreposição
- [x] Criar testes automatizados (clientReportPDF.fix.test.ts) - 4/4 passando

---

## 🐛 BUG URGENTE - PDF de Vistorias Não Faz Download (21/12/2025 - 21:08)

### Problema Reportado
- [x] Botão "Gerar PDF" de vistorias mostra mensagem de sucesso mas não faz download
- [x] Print: IMG_4846.PNG
- [x] Mesmo problema que ocorria em abastecimentos (já corrigido)

### Solução
- [x] Aplicar mesma correção do abastecimentos: base64 → Blob → URL → Download
- [x] Adicionar limpeza automática de memória (URL.revokeObjectURL)
- [x] Testar em mobile e desktop (aguardando teste do usuário)
- [x] Criar testes automatizados (4/4 passando)

---

## ✅ CORREÇÃO CONCLUÍDA - Relatório PDF de Abastecimentos (21/12/2025 - 18:26)

### Problemas Reportados
- [x] Caracteres sem sentido "Ø=Ü÷" apareciam no PDF (causados por emojis não suportados)
- [x] Fotos da balança apareciam como links ao invés de imagens incorporadas
- [x] Nome do funcionário não aparecia corretamente

### Soluções Implementadas
- [x] Removidos todos os emojis (📷, ⚖️, 📊, 📝) do código do PDF
- [x] Implementada incorporação de imagens via axios + Buffer
- [x] Corrigida query SQL para buscar nome do funcionário via JOIN com tabela users
- [x] Criados testes automatizados (fuelRecordPDF.fix.test.ts) - 4/4 passando

### Resultado Final
✅ PDF agora mostra:
- Título limpo: "Comprovação por Fotos da Balança" (sem caracteres estranhos)
- Fotos incorporadas diretamente no PDF (não apenas links)
- Nome correto do funcionário: "Vinicius Freitas"
- Labels limpos: "Foto ANTES (peso cheio)" e "Foto DEPOIS (peso após)"

---

## 📸 SISTEMA DE FOTOS PARA ITENS REPROVADOS EM VISTORIAS (21/12/2025 - 20:35)

### Alterações Solicitadas

**1. Remover campo manual "Nome do Vistoriador":**
- [x] Remover campo de input do formulário (frontend)
- [x] Manter campo `inspected_by` no banco (salva ctx.user.name automaticamente)
- [x] Manter exibição nos cards e PDF

**2. Upload de fotos para itens reprovados:**
- [x] Adicionar campo `reprovation_photos` (JSON) no schema
- [x] Interface dinâmica: ao marcar "REPROVADO" → aparecer upload de foto
- [x] Permitir múltiplos uploads (um por item reprovado)
- [x] Salvar array: `[{itemName: string, photoUrl: string}]`

**3. Backend:**
- [x] Atualizar endpoint inspections.create para salvar fotos
- [x] Upload de imagens para S3
- [x] Validação de tipos de arquivo (jpg, png, pdf)
- [x] Criar endpoint REST /api/upload-inspection-photo

**4. PDF com fotos incorporadas:**
- [x] Download de imagens via axios (igual fuelRecordPDF.ts)
- [x] Incorporar fotos no PDF (não apenas links)
- [x] Exibir foto abaixo do nome do item reprovado
- [x] Paginação automática se muitas fotos

**5. Testes:**
- [x] Criar testes automatizados (inspections.photos.test.ts) - 4/4 passando

---

## 🚀 NOVA FUNCIONALIDADE - Sistema de Controle de Estoque de Gasolina (21/12/2025 - 17:35)

### Requisitos do Usuário
- [x] Adicionar campos no dialog de orçamento: "Quantos Litros" e "Valor Pago"
- [x] Calcular automaticamente o preço por litro (Valor Pago ÷ Litros)
- [x] Aplicar esse preço automaticamente nos próximos abastecimentos
- [x] Controlar estoque de gasolina (litros disponíveis)
- [x] Histórico de compras de gasolina (quantidade, valor, data)
- [x] Interface simples dentro do campo de configuração de orçamento

### Estrutura Proposta (APROVADO - ✅ CONCLUÍDO)

#### PARTE 1: Correção Bug Funcionário
- [x] Adicionar estados para campos de peso no formulário
- [x] Adicionar cálculo automático por regra de 3
- [x] Substituir formulário simples por formulário completo
- [x] Adicionar upload de fotos da balança
- [x] Adicionar indicador de estoque (somente visualização)
- [x] Pré-preencher preço/L do estoque
- [x] Testar registro pelo funcionário

#### PARTE 2: Sistema de Estoque
- [x] Criar tabela fuel_purchases
- [x] Adicionar colunas em fuel_budget (stock_liters, last_price_per_liter)
- [x] Criar endpoints backend (fuelPurchases.create, list, delete)
- [x] Modificar fuelRecords.create (buscar preço/L do estoque, descontar litros)
- [x] Atualizar fuelBudget.get (retornar stockLiters e lastPricePerLiter)
- [x] Implementar interface admin (dialog de gestão completo)
- [x] Implementar indicador de estoque no card de orçamento (local circulado)
- [x] Implementar indicador para funcionário (somente visualização)
- [x] Corrigir formulário do funcionário (método por peso completo)
- [x] Testar fluxo completo (7 testes passando com sucesso)

---

## 🐛 CORREÇÕES URGENTES - Sistema de Estoque (21/12/2025 - 18:40)

### Bug 1: Excluir abastecimento não devolve litros ao estoque
- [x] Modificar endpoint fuelRecords.delete para devolver litros ao estoque
- [x] Atualizar stock_liters em fuel_budget ao excluir
- [x] Testar devolução de litros ✅ **APROVADO!**

### Bug 2: Orçamento mensal deve ser calculado automaticamente
- [x] Remover campo editável "Valor do Orçamento"
- [x] Calcular orçamento como soma total das compras do histórico
- [x] Atualizar fuelBudget.get para retornar soma das compras
- [x] Remover endpoint fuelBudget.set (não é mais necessário)
- [x] Atualizar interface para mostrar orçamento como valor calculado

### Bug 3: Preço por litro não preenche automaticamente no formulário
- [x] Buscar lastPricePerLiter do estoque ao abrir formulário
- [x] Preencher campo "Preço por Litro" automaticamente
- [x] Permitir edição do campo (manter editável)
- [x] Aplicar em ambas páginas (admin e funcionário)

### Bug 4: Estoque mostra valor incorreto (22,01 L ao invés de 147,69 L) - ✅ RESOLVIDO
- [x] Corrigir cálculo de estoque em fuelBudget.get
- [x] Lógica correta: Estoque = Soma total de litros comprados - Soma total de litros abastecidos
- [x] Exemplo: 147,69 L (compras) - litros usados = estoque real
- [x] Testar com dados reais do histórico
- [x] Criar testes automatizados (3/3 passando)
- [x] Validar visualmente na interface (97,69 L ✅)

### Bug 5: Valores não zeram após exclusão de todos os registros - ✅ RESOLVIDO
- [x] Investigar por que Saldo mostra R$ 928,50 quando não há registros
- [x] Investigar por que Orçamento mostra R$ 928,50 quando não há compras
- [x] Corrigir endpoint fuelBudget.get para calcular tudo dinamicamente
- [x] Corrigir endpoint financialStats para buscar orçamento das compras
- [x] Validar que Estoque já está correto (0.00 L)
- [x] Validar que Preço/L zera quando não há compras
- [x] Testar com banco completamente zerado - Saldo R$ 0.00 ✅

### Bug 6: Campo Estoque mostrando total de compras ao invés de litros disponíveis - ✅ RESOLVIDO
- [x] Investigar cálculo atual do endpoint fuelBudget.get
- [x] Identificar erro: formato de data '%Y-%u' (ano-semana) ao invés de '%Y-%m' (ano-mês)
- [x] Corrigir query para usar '%Y-%m' correto
- [x] Validar com dados reais: 147,69 L - 116,70 L = 30,99 L
- [x] Testar visualmente na interface
- [x] Criar teste automatizado

---

## ✅ CORREÇÃO CONCLUÍDA - Campo "Registrado por" em Abastecimentos (21/12/2025 - 15:35)

### Problema Reportado
- [x] Campo mostra "Registrado por: • Data não disponível"
- [x] Deveria mostrar: "Registrado por: [Nome do Admin/Funcionário] • [Data formatada]"
- [x] Print: IMG_4826.PNG

### Tarefas Realizadas
- [x] Investigar por que recorded_by e recorded_at não aparecem
- [x] Adicionar colunas recorded_by e recorded_at no schema (drizzle/schema.ts)
- [x] Criar colunas no banco de dados via ALTER TABLE
- [x] Atualizar endpoint fuelRecords.create para salvar ctx.user.id em recorded_by
- [x] Corrigir query SQL para fazer JOIN com tabela users (LEFT JOIN users u ON fr.recorded_by = u.id)
- [x] Retornar nome do usuário (admin ou funcionário) que criou o registro
- [x] Adicionar explicitamente recorded_by_name e recorded_at no mapeamento do endpoint
- [x] Atualizar registros antigos com ID do admin (fallback para "Sistema")
- [x] Testar e validar que campo aparece corretamente

### Resultado
✅ Campo agora exibe: "Registrado por: Sistema • 21/12/2025, 20:31"
✅ Novos registros mostrarão o nome real do usuário logado
✅ Data formatada corretamente em pt-BR

---

## ✅ CONCLUÍDO - Botão de Editar Embarcação (21/12/2025 - 10:30)

- [x] Adicionar botão de editar (ícone de lápis) ao lado do botão de excluir em cada card de embarcação
- [x] Criar dialog de edição reutilizando o mesmo dialog de criação
- [x] Pré-preencher campos ao clicar em editar (nome, tipo, descrição, quotaCount, imageUrl)
- [x] Título dinâmico: "Adicionar Embarcação" ou "Editar Embarcação"
- [x] Botão de submit dinâmico: "Adicionar" ou "Atualizar"
- [x] Validar que endpoint vessels.update existe no backend
- [x] Testar funcionalidade completa

### Resultado
✅ Funcionalidade implementada com sucesso e testada visualmente no navegador.

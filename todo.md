# TODO - Exclusive Club Reservas

## 🐛 BUGS CRÍTICOS - Relatório PDF de Clientes (21/12/2025 - 22:25)

### Problema 1: Logo Desalinhada no Cabeçalho
**Reportado pelo usuário via screenshot:**
- [x] Logo da Exclusive Club está desalinhada no cabeçalho
- [x] Deve estar centralizada horizontalmente
- [x] Atualmente aparece deslocada para a esquerda

**Arquivo afetado:** server/_core/clientReportPDF.ts

### Problema 2: Documentos Não Aparecem no PDF
**Reportado pelo usuário via screenshot:**
- [x] Páginas mostram apenas texto: "Documento em formato PDF. Visualize o arquivo original separadamente."
- [x] Documentos (fotos ou PDFs) que foram feitos upload NÃO estão sendo incorporados
- [x] Eles devem aparecer visualmente no relatório (imagens incorporadas)

**Comportamento esperado:**
- [x] Documento Pessoal: Imagem/PDF incorporado na página 2
- [x] Contrato do Cliente: Imagem/PDF incorporado na página 3
- [x] Contrato 2 do Cliente: Imagem/PDF incorporado na página 4 (se houver)

**Solução:**
- [x] Usar axios para baixar imagens/PDFs das URLs
- [x] Incorporar diretamente no PDF (igual fuelRecordPDF.ts e inspectionsPDF.ts)
- [x] Suportar formatos: JPG, PNG, PDF (convertidos para imagem)
- [x] Ajustar tamanho para caber na página A4

**Arquivos a modificar:**
- [x] server/_core/clientReportPDF.ts (download e incorporação)
- [x] Instalar pdf-to-img para converter PDFs em imagens
- [x] Implementar conversão de PDF para imagem antes de incorporar

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

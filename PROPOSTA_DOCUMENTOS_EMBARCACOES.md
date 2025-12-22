# 📄 PROPOSTA: Sistema de Documentos de Embarcações

## 🎯 Objetivo
Implementar sistema de upload e gerenciamento de documentos das embarcações com controle de acesso:
- **Admin:** Faz upload dos documentos
- **Cliente:** Visualiza e baixa documentos apenas das embarcações que possui cotas

---

## 📋 Requisitos Funcionais

### 1. Upload de Documentos (Admin)
**Localização:** Dialog de "Adicionar/Editar Embarcação" na página Admin

**Campos novos:**
- 📄 **Documento da Embarcação** (obrigatório)
  - Exemplo: Registro da embarcação, certificado de navegabilidade
  - Formatos aceitos: PDF, JPG, PNG
  - Tamanho máximo: 10 MB
  
- 📎 **Documento Extra** (opcional)
  - Exemplo: Seguro, laudo técnico, manual
  - Formatos aceitos: PDF, JPG, PNG
  - Tamanho máximo: 10 MB

**Botões por documento:**
- 👁️ **Ver** - Abre documento em nova aba
- 🗑️ **Excluir** - Remove documento (com confirmação)

---

### 2. Visualização Admin
**Localização:** Página Admin → Seção Embarcações

**Funcionalidades:**
- Ver documentos de qualquer embarcação
- Fazer upload/substituir documentos
- Excluir documentos
- Indicador visual quando documento está presente ✅

---

### 3. Dashboard do Cliente
**Localização:** Nova seção "📄 Documentos das Minhas Embarcações"

**Regra de acesso:**
- Cliente vê APENAS embarcações onde possui cotas ativas
- Exemplo: Se tem 2 cotas no Jetski A → vê documentos do Jetski A
- Se não tem cotas no Jetski B → NÃO vê documentos do Jetski B

**Interface:**
```
┌─────────────────────────────────────────────┐
│  📄 Documentos das Minhas Embarcações       │
├─────────────────────────────────────────────┤
│                                             │
│  🚤 JETSKI SEADOO GTI SE 130HP             │
│  ├─ 📄 Documento da Embarcação              │
│  │   [📥 Baixar Documento]                  │
│  └─ 📎 Documento Extra                      │
│      [📥 Baixar Documento]                  │
│                                             │
│  ⛵ LANCHA FOCKER 255                       │
│  ├─ 📄 Documento da Embarcação              │
│  │   [📥 Baixar Documento]                  │
│  └─ 📎 Documento Extra                      │
│      [Não disponível]                       │
│                                             │
└─────────────────────────────────────────────┘
```

**Funcionalidades:**
- Cards agrupados por embarcação
- Botão "Baixar" para cada documento disponível
- Indicador "Não disponível" quando documento não foi enviado
- Responsivo (mobile + desktop)

---

## 🛠️ Implementação Técnica

### Backend

#### 1. Schema do Banco de Dados
```typescript
// drizzle/schema.ts
export const vessels = mysqlTable("vessels", {
  // ... campos existentes ...
  
  // NOVOS CAMPOS:
  documentUrl: text("document_url"),        // Documento principal
  extraDocumentUrl: text("extra_document_url"), // Documento extra
});
```

#### 2. Endpoints tRPC
```typescript
// server/routers.ts

// Endpoint para cliente buscar embarcações onde possui cotas
vessels.getMyVessels: protectedProcedure.query(async ({ ctx }) => {
  // Busca embarcações onde cliente tem cotas ativas
  // Retorna: id, name, type, documentUrl, extraDocumentUrl
});

// Endpoint para admin fazer upload
vessels.updateDocuments: adminProcedure
  .input(z.object({
    vesselId: z.number(),
    documentUrl: z.string().optional(),
    extraDocumentUrl: z.string().optional(),
  }))
  .mutation(async ({ input }) => {
    // Atualiza campos document_url e extra_document_url
  });

// Endpoint para admin excluir documento
vessels.deleteDocument: adminProcedure
  .input(z.object({
    vesselId: z.number(),
    documentType: z.enum(['document', 'extraDocument']),
  }))
  .mutation(async ({ input }) => {
    // Seta campo para null
  });
```

#### 3. Upload de Arquivos
- Reutilizar endpoint `/api/upload` já existente
- Arquivos salvos no S3 (bucket público)
- Retorna URL pública para salvar no banco

---

### Frontend

#### 1. Admin.tsx - Dialog de Embarcações
```tsx
// Adicionar 2 campos de upload após "Quantidade de Cotas"

<div>
  <Label>Documento da Embarcação</Label>
  <Input type="file" accept=".pdf,.jpg,.jpeg,.png" />
  {documentUrl && (
    <>
      <Button variant="outline" onClick={() => window.open(documentUrl)}>
        👁️ Ver
      </Button>
      <Button variant="destructive" onClick={handleDeleteDocument}>
        🗑️ Excluir
      </Button>
    </>
  )}
</div>

<div>
  <Label>Documento Extra (opcional)</Label>
  <Input type="file" accept=".pdf,.jpg,.jpeg,.png" />
  {extraDocumentUrl && (
    <>
      <Button variant="outline" onClick={() => window.open(extraDocumentUrl)}>
        👁️ Ver
      </Button>
      <Button variant="destructive" onClick={handleDeleteExtraDocument}>
        🗑️ Excluir
      </Button>
    </>
  )}
</div>
```

#### 2. Dashboard.tsx - Nova Seção
```tsx
// Adicionar após seção "Meus Abastecimentos"

<section>
  <h2>📄 Documentos das Minhas Embarcações</h2>
  
  {myVessels.map(vessel => (
    <Card key={vessel.id}>
      <CardHeader>
        <h3>🚤 {vessel.name}</h3>
      </CardHeader>
      <CardContent>
        <div>
          <p>📄 Documento da Embarcação</p>
          {vessel.documentUrl ? (
            <Button onClick={() => downloadDocument(vessel.documentUrl)}>
              📥 Baixar Documento
            </Button>
          ) : (
            <p className="text-muted-foreground">Não disponível</p>
          )}
        </div>
        
        <div>
          <p>📎 Documento Extra</p>
          {vessel.extraDocumentUrl ? (
            <Button onClick={() => downloadDocument(vessel.extraDocumentUrl)}>
              📥 Baixar Documento
            </Button>
          ) : (
            <p className="text-muted-foreground">Não disponível</p>
          )}
        </div>
      </CardContent>
    </Card>
  ))}
</section>
```

---

## 🧪 Testes Automatizados

### 1. Backend Tests
```typescript
// server/vessels.getMyVessels.test.ts
describe('vessels.getMyVessels', () => {
  it('retorna apenas embarcações onde cliente tem cotas');
  it('não retorna embarcações sem cotas do cliente');
  it('retorna URLs de documentos corretamente');
  it('bloqueia acesso de usuários não autenticados');
});

// server/vessels.updateDocuments.test.ts
describe('vessels.updateDocuments', () => {
  it('admin pode fazer upload de documentos');
  it('cliente comum não pode fazer upload');
  it('atualiza apenas campos especificados');
});

// server/vessels.deleteDocument.test.ts
describe('vessels.deleteDocument', () => {
  it('admin pode excluir documento principal');
  it('admin pode excluir documento extra');
  it('cliente comum não pode excluir');
  it('campo é setado para null após exclusão');
});
```

### 2. Frontend Tests
- Teste visual no navegador (admin + cliente)
- Validação de upload (tamanho, formato)
- Teste de download de documentos
- Responsividade (mobile + desktop)

---

## 📊 Resumo de Mudanças

### Arquivos a Criar
- ✅ `PROPOSTA_DOCUMENTOS_EMBARCACOES.md` (este arquivo)
- 🔜 `server/vessels.getMyVessels.test.ts`
- 🔜 `server/vessels.updateDocuments.test.ts`
- 🔜 `server/vessels.deleteDocument.test.ts`

### Arquivos a Modificar
- 🔜 `drizzle/schema.ts` - Adicionar campos documentUrl e extraDocumentUrl
- 🔜 `server/db.ts` - Adicionar query helpers para documentos
- 🔜 `server/routers.ts` - Adicionar 3 endpoints (getMyVessels, updateDocuments, deleteDocument)
- 🔜 `client/src/pages/Admin.tsx` - Adicionar campos de upload no dialog
- 🔜 `client/src/pages/Dashboard.tsx` - Adicionar seção de documentos

### Comandos a Executar
```bash
# 1. Atualizar schema do banco
pnpm db:push

# 2. Rodar testes
pnpm test

# 3. Validar no navegador
# - Login como admin → testar upload
# - Login como cliente → testar visualização
```

---

## ⏱️ Estimativa de Tempo
- Backend (schema + endpoints + testes): ~2h
- Frontend Admin (upload): ~1h
- Frontend Cliente (dashboard): ~1h
- Testes e validação: ~30min
- **TOTAL: ~4h30min**

---

## ❓ Perguntas para Aprovação

1. ✅ **Campos de upload:** Confirma 2 campos (Documento Principal + Documento Extra)?
2. ✅ **Formatos aceitos:** PDF, JPG, PNG estão ok?
3. ✅ **Tamanho máximo:** 10 MB por arquivo está adequado?
4. ✅ **Regra de acesso:** Cliente vê apenas embarcações onde possui cotas ativas?
5. ✅ **Localização no Dashboard:** Nova seção "Documentos das Minhas Embarcações" está ok?
6. ❓ **Obrigatoriedade:** Documento principal deve ser obrigatório para cadastrar embarcação?

---

## 🚀 Próximos Passos (Após Aprovação)

1. ✅ Receber aprovação do usuário
2. 🔜 Atualizar todo.md com tarefas detalhadas
3. 🔜 Implementar backend (schema + endpoints)
4. 🔜 Criar testes automatizados
5. 🔜 Implementar frontend admin
6. 🔜 Implementar frontend cliente
7. 🔜 Validar fluxo completo
8. 🔜 Criar checkpoint final

---

## 📸 Screenshots de Referência

Baseado nas imagens fornecidas pelo usuário:
- Dialog "Adicionar Embarcação" (IMG_4878.PNG)
- Dialog "Editar Embarcação" (IMG_4877.PNG)

**Campos atuais:**
- Nome (ex: "JETSKI SEADOO GTI SE 130HP")
- Tipo (dropdown: Lancha, Jetski, Iate, Veleiro)
- Descrição
- Capacidade
- Quantidade de Cotas

**Campos novos (após aprovação):**
- 📄 Documento da Embarcação [Upload] [Ver] [Excluir]
- 📎 Documento Extra [Upload] [Ver] [Excluir]

---

## ✅ Aguardando Aprovação do Usuário

**Por favor, revise a proposta acima e confirme:**
- ✅ Estrutura de campos está correta?
- ✅ Regras de acesso estão adequadas?
- ✅ Interface proposta atende às necessidades?
- ❓ Alguma modificação necessária antes de implementar?

**Após sua aprovação, iniciarei a implementação seguindo este plano detalhado.**

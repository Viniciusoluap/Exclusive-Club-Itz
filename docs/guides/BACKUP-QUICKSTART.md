# 🚀 Guia Rápido: Backup Automático

## ⚡ Início Rápido (3 passos)

### 1️⃣ Obter Credenciais do Google Drive

1. Acesse: https://console.cloud.google.com/
2. Crie/selecione um projeto
3. Ative a **Google Drive API**
4. Crie credenciais OAuth 2.0 (tipo: "Aplicativo para computador")
5. Baixe o arquivo JSON
6. Renomeie para `google-drive-credentials.json`
7. Coloque na raiz do projeto: `/home/ubuntu/exclusive-club-reservas/`

### 2️⃣ Configurar Autenticação

```bash
cd /home/ubuntu/exclusive-club-reservas
pnpm setup-drive
```

- Uma janela do navegador abrirá
- Faça login com sua conta Google
- Autorize o acesso ao Google Drive
- Pronto! O token será salvo automaticamente

### 3️⃣ Executar Backup

**Backup Manual:**
```bash
pnpm backup
```

**Backup Automático Diário (3h da manhã):**
```bash
pnpm backup-scheduler
```

> 💡 **Dica:** Mantenha o processo `backup-scheduler` rodando em segundo plano para backups automáticos

---

## 📦 O que é incluído no backup?

✅ **Banco de dados completo** (todas as tabelas em SQL)  
✅ **Código-fonte** (server, client, drizzle, shared)  
✅ **Arquivos do projeto** (package.json, configurações)  
✅ **Arquivos enviados** (fotos de abastecimento, etc.)

❌ **Excluído:** node_modules, .git, dist, logs

---

## 🗂️ Onde os backups são salvos?

📁 **Google Drive:**  
https://drive.google.com/drive/folders/1GStmc8RxPQTK_DmDz83x8e_dLUKUALZ1

📝 **Nome do arquivo:**  
`exclusive-club-backup-2026-02-15.zip`

⚠️ **Apenas o backup mais recente é mantido** (o anterior é automaticamente removido)

---

## 🔄 Como restaurar um backup?

1. Baixe o arquivo ZIP do Google Drive
2. Extraia o conteúdo
3. Restaure o banco:
   ```bash
   mysql -h HOST -u USER -p DATABASE < database-YYYY-MM-DD.sql
   ```
4. Instale dependências:
   ```bash
   pnpm install
   ```
5. Inicie o servidor:
   ```bash
   pnpm dev
   ```

---

## ❓ Problemas Comuns

### "Arquivo de credenciais não encontrado"
→ Verifique se `google-drive-credentials.json` está na raiz do projeto

### "Token expirado"
→ Execute novamente: `pnpm setup-drive`

### "Erro ao exportar banco de dados"
→ Verifique se `DATABASE_URL` está configurada

---

## 📚 Documentação Completa

Para mais detalhes, consulte: `BACKUP-SETUP.md`

---

**Última atualização:** 15/02/2026

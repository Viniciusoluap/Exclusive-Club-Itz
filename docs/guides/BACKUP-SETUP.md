# 📦 Configuração do Backup Automático para Google Drive

Este documento explica como configurar o sistema de backup automático diário que salva o banco de dados completo, código-fonte e arquivos do sistema no Google Drive.

## 📋 Pré-requisitos

- Conta Google com acesso ao Google Drive
- Acesso ao Google Cloud Console
- Pasta específica no Google Drive para armazenar backups

## 🔧 Configuração Inicial (Executar UMA VEZ)

### Passo 1: Criar Credenciais do Google Cloud

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/)

2. Crie um novo projeto ou selecione um existente

3. Ative a **Google Drive API**:
   - Menu lateral > "APIs e Serviços" > "Biblioteca"
   - Busque por "Google Drive API"
   - Clique em "Ativar"

4. Configure a tela de consentimento OAuth:
   - Menu lateral > "APIs e Serviços" > "Tela de consentimento OAuth"
   - Escolha "Externo" (ou "Interno" se for Google Workspace)
   - Preencha as informações básicas
   - Adicione o escopo: `https://www.googleapis.com/auth/drive.file`
   - Salve

5. Crie credenciais OAuth 2.0:
   - Menu lateral > "APIs e Serviços" > "Credenciais"
   - Clique em "Criar credenciais" > "ID do cliente OAuth"
   - Tipo de aplicativo: **"Aplicativo para computador"**
   - Nome: "Backup Exclusive Club" (ou outro nome de sua preferência)
   - Clique em "Criar"

6. Baixe o arquivo JSON de credenciais:
   - Clique no ícone de download ao lado da credencial criada
   - Salve o arquivo

### Passo 2: Configurar o Projeto

1. Renomeie o arquivo baixado para `google-drive-credentials.json`

2. Coloque o arquivo na raiz do projeto:
   ```
   /home/ubuntu/exclusive-club-reservas/google-drive-credentials.json
   ```

3. **IMPORTANTE**: Adicione ao `.gitignore` (já está configurado):
   ```
   google-drive-credentials.json
   google-drive-token.json
   ```

### Passo 3: Executar Setup de Autenticação

Execute o script de configuração:

```bash
cd /home/ubuntu/exclusive-club-reservas
pnpm setup-drive
```

O script irá:
1. Verificar se o arquivo de credenciais existe
2. Abrir uma janela do navegador para autenticação
3. Solicitar que você faça login com sua conta Google
4. Pedir autorização para acessar o Google Drive
5. Salvar o token de autenticação em `google-drive-token.json`
6. Testar a conexão com a pasta do Google Drive

**Siga as instruções no terminal e autorize o acesso quando solicitado.**

## 🚀 Uso

### Backup Manual

Para executar um backup manualmente:

```bash
cd /home/ubuntu/exclusive-club-reservas
pnpm backup
```

O script irá:
1. ✅ Exportar todo o banco de dados para SQL
2. ✅ Compactar banco + código + arquivos em ZIP
3. ✅ Fazer upload para o Google Drive
4. ✅ Remover backup anterior (mantém apenas o mais recente)
5. ✅ Limpar arquivos temporários

### Backup Automático Diário

O backup automático será configurado para executar diariamente às **3h da manhã**.

**Configuração do agendamento será feita na próxima etapa.**

## 📁 Estrutura do Backup

Cada backup contém:

```
exclusive-club-backup-2026-02-15.zip
├── database-2026-02-15.sql          # Banco de dados completo
├── server/                           # Código do backend
├── client/                           # Código do frontend
├── drizzle/                          # Schema e migrações
├── shared/                           # Código compartilhado
├── package.json                      # Dependências
└── ... (outros arquivos do projeto)
```

**Excluídos do backup:**
- `node_modules/` (pode ser reinstalado com `pnpm install`)
- `.git/` (histórico já está no GitHub)
- `dist/` (arquivos compilados)
- Arquivos temporários e logs

## 🔒 Segurança

- ✅ As credenciais OAuth são armazenadas localmente e **nunca** são enviadas para o repositório
- ✅ O token de acesso é renovado automaticamente
- ✅ Apenas a aplicação autorizada tem acesso à pasta específica do Drive
- ✅ Backups são criptografados em trânsito (HTTPS)

## 🗂️ Localização dos Backups

Os backups são salvos na pasta:
```
https://drive.google.com/drive/folders/1GStmc8RxPQTK_DmDz83x8e_dLUKUALZ1
```

**Apenas o backup mais recente é mantido** (o anterior é automaticamente removido).

## 🔄 Restauração de Backup

Para restaurar um backup:

1. Baixe o arquivo ZIP do Google Drive
2. Extraia o conteúdo
3. Restaure o banco de dados:
   ```bash
   mysql -h HOST -u USER -p DATABASE < database-YYYY-MM-DD.sql
   ```
4. Instale as dependências:
   ```bash
   pnpm install
   ```
5. Configure as variáveis de ambiente
6. Inicie o servidor:
   ```bash
   pnpm dev
   ```

## ❓ Solução de Problemas

### Erro: "Arquivo de credenciais não encontrado"
- Verifique se `google-drive-credentials.json` está na raiz do projeto
- Certifique-se de que o nome do arquivo está correto

### Erro: "Token expirado"
- Execute novamente: `pnpm setup-drive`
- Isso renovará o token de autenticação

### Erro: "Permissão negada ao acessar pasta"
- Verifique se a conta Google usada tem acesso à pasta do Drive
- Confirme o ID da pasta em `server/backup.ts` (linha 10)

### Erro ao exportar banco de dados
- Verifique se `mysqldump` está instalado no sistema
- Confirme que `DATABASE_URL` está configurada corretamente

## 📞 Suporte

Em caso de problemas, verifique:
1. Logs do terminal durante a execução
2. Permissões da pasta no Google Drive
3. Credenciais do Google Cloud Console
4. Conexão com o banco de dados

---

**Última atualização:** 15/02/2026

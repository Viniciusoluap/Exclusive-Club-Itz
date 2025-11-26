# Configuração de Emails SMTP - Exclusive Club

## Status Atual

⚠️ **ATENÇÃO:** O sistema de envio de emails via SMTP está configurado, mas apresentando erro de autenticação.

**Erro atual:** `535 Incorrect authentication data`

Isso significa que as credenciais SMTP fornecidas não estão sendo aceitas pelo servidor da Hostgator.

---

## Configurações Atuais

```
Servidor SMTP: mail.exclusiveclubitz.com
Porta: 587 (TLS)
Email: atendimento@exclusiveclubitz.com
Senha: Efficaz2010
```

---

## Como Resolver

### 1. Verificar se o Email Existe

1. Acesse o painel da Hostgator: https://hostgator.com.br
2. Faça login com: `paulovinicius92@hotmail.com`
3. Vá em **Contas de Email** → **Gerenciar**
4. Verifique se o email `atendimento@exclusiveclubitz.com` está criado

### 2. Verificar/Resetar a Senha

Se o email existe:
1. No painel de **Contas de Email**, clique em **Alterar Senha**
2. Defina uma nova senha forte
3. Atualize a senha no arquivo `server/_core/emailService.ts`

### 3. Criar o Email (se não existir)

Se o email não existe:
1. No painel da Hostgator, vá em **Contas de Email**
2. Clique em **Criar Conta de Email**
3. Preencha:
   - Email: `atendimento`
   - Domínio: `exclusiveclubitz.com`
   - Senha: (escolha uma senha forte)
4. Anote a senha e atualize no código

### 4. Verificar Domínio

1. Certifique-se de que o domínio `exclusiveclubitz.com` está ativo
2. Verifique se os registros MX estão configurados corretamente
3. Aguarde até 24h após criação do email para propagação DNS

---

## Testando a Configuração

Após corrigir as credenciais, execute o teste:

```bash
cd /home/ubuntu/exclusive-club-reservas
pnpm tsx server/email-test.ts
```

Se o teste passar, você verá:
```
✅ Email enviado com sucesso!
📬 Verifique a caixa de entrada (e spam) do email de destino.
```

---

## Alternativas

Se não conseguir configurar o SMTP da Hostgator, considere:

### 1. Gmail SMTP (Gratuito)
- Servidor: smtp.gmail.com
- Porta: 587
- Requer "Senha de App" (não a senha normal)
- Limite: 500 emails/dia

### 2. SendGrid (Gratuito até 100 emails/dia)
- Mais confiável para deliverability
- Menos chance de cair no spam
- API simples de integrar

### 3. AWS SES (Pago, mas barato)
- $0.10 por 1000 emails
- Excelente deliverability
- Requer configuração de domínio

---

## Código Atual

O sistema já está preparado para enviar emails. Os arquivos relevantes são:

- `server/_core/emailService.ts` - Configuração SMTP e função de envio
- `server/_core/emailNotification.ts` - Templates de emails
- `server/email-test.ts` - Script de teste

Quando as credenciais estiverem corretas, os emails serão enviados automaticamente para:
- ✅ Confirmação de reserva
- ❌ Cancelamento de reserva
- 🔧 Notificações de manutenção

---

## Suporte

Se precisar de ajuda, entre em contato com o suporte da Hostgator:
- Chat: https://www.hostgator.com.br/suporte
- Telefone: 0800 591 9895
- Email: suporte@hostgator.com.br

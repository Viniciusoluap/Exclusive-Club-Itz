# Automação de Lembretes Diários

Este documento explica como configurar o envio automático de lembretes 24h antes das reservas.

## Como Funciona

O script `server/daily-reminders.mjs` busca todas as reservas confirmadas para o dia seguinte e envia um email de lembrete para cada cliente.

## Teste Manual

Para testar o envio de lembretes manualmente:

```bash
cd /home/ubuntu/exclusive-club-reservas
node server/daily-reminders.mjs
```

Ou usando pnpm:

```bash
pnpm tsx server/daily-reminders.mjs
```

## Configuração do Cron Job

Para executar automaticamente todos os dias às 9h da manhã:

### 1. Abrir o crontab

```bash
crontab -e
```

### 2. Adicionar a linha

```
0 9 * * * cd /home/ubuntu/exclusive-club-reservas && /usr/bin/node server/daily-reminders.mjs >> /home/ubuntu/logs/reminders.log 2>&1
```

**Explicação:**
- `0 9 * * *` - Executar às 9h todos os dias
- `cd /home/ubuntu/exclusive-club-reservas` - Navegar para o diretório do projeto
- `/usr/bin/node server/daily-reminders.mjs` - Executar o script
- `>> /home/ubuntu/logs/reminders.log 2>&1` - Salvar logs em arquivo

### 3. Criar diretório de logs

```bash
mkdir -p /home/ubuntu/logs
```

### 4. Verificar cron configurado

```bash
crontab -l
```

## Logs

Os logs são salvos em `/home/ubuntu/logs/reminders.log`. Para visualizar:

```bash
tail -f /home/ubuntu/logs/reminders.log
```

## Horários Alternativos

- **8h da manhã:** `0 8 * * *`
- **10h da manhã:** `0 10 * * *`
- **Duas vezes ao dia (9h e 18h):** `0 9,18 * * *`

## Monitoramento

Para verificar se o cron está rodando:

```bash
# Ver processos do cron
ps aux | grep cron

# Ver logs do sistema
grep CRON /var/log/syslog | tail -20
```

## Troubleshooting

### Script não executa

1. Verificar permissões:
```bash
chmod +x server/daily-reminders.mjs
```

2. Verificar caminho do node:
```bash
which node
```

3. Usar caminho absoluto no crontab

### Emails não são enviados

1. Verificar configuração SMTP em `server/_core/emailService.ts`
2. Testar envio manual
3. Verificar logs em `/home/ubuntu/logs/reminders.log`

## Desabilitar Automação

Para desabilitar temporariamente:

```bash
crontab -e
# Comentar a linha com #
# 0 9 * * * cd /home/ubuntu/exclusive-club-reservas && node server/daily-reminders.mjs
```

Para remover completamente:

```bash
crontab -r
```

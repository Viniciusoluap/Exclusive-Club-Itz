# Configuração de Cron Jobs - Exclusive Club

Este documento explica como configurar todos os cron jobs para automação do sistema.

## Scripts Disponíveis

### 1. Lembretes Diários (daily-reminders.mjs)
Envia lembretes 24h antes das reservas confirmadas.

**Frequência:** Diariamente às 9h
**Script:** `server/daily-reminders.mjs`

### 2. Relatório Mensal (monthly-report.mjs)
Gera e envia relatório mensal com estatísticas para o admin.

**Frequência:** Dia 1 de cada mês às 9h
**Script:** `server/monthly-report.mjs`

---

## Configuração Rápida

### Passo 1: Criar Diretório de Logs

```bash
mkdir -p /home/ubuntu/logs
```

### Passo 2: Editar Crontab

```bash
crontab -e
```

### Passo 3: Adicionar as Linhas

```cron
# Lembretes diários às 9h
0 9 * * * cd /home/ubuntu/exclusive-club-reservas && /usr/bin/node server/daily-reminders.mjs >> /home/ubuntu/logs/daily-reminders.log 2>&1

# Relatório mensal no dia 1 às 9h
0 9 1 * * cd /home/ubuntu/exclusive-club-reservas && /usr/bin/node server/monthly-report.mjs >> /home/ubuntu/logs/monthly-report.log 2>&1
```

### Passo 4: Verificar Configuração

```bash
crontab -l
```

---

## Formato do Cron

```
┌───────────── minuto (0 - 59)
│ ┌───────────── hora (0 - 23)
│ │ ┌───────────── dia do mês (1 - 31)
│ │ │ ┌───────────── mês (1 - 12)
│ │ │ │ ┌───────────── dia da semana (0 - 6) (Domingo=0)
│ │ │ │ │
│ │ │ │ │
* * * * * comando a ser executado
```

---

## Exemplos de Horários Alternativos

### Lembretes Diários

```cron
# 8h da manhã
0 8 * * * cd /home/ubuntu/exclusive-club-reservas && node server/daily-reminders.mjs

# 10h da manhã
0 10 * * * cd /home/ubuntu/exclusive-club-reservas && node server/daily-reminders.mjs

# Duas vezes ao dia (9h e 18h)
0 9,18 * * * cd /home/ubuntu/exclusive-club-reservas && node server/daily-reminders.mjs

# A cada 6 horas
0 */6 * * * cd /home/ubuntu/exclusive-club-reservas && node server/daily-reminders.mjs
```

### Relatório Mensal

```cron
# Dia 1 às 8h
0 8 1 * * cd /home/ubuntu/exclusive-club-reservas && node server/monthly-report.mjs

# Dia 5 às 9h (enviar no dia 5 ao invés do dia 1)
0 9 5 * * cd /home/ubuntu/exclusive-club-reservas && node server/monthly-report.mjs

# Último dia do mês às 23h
0 23 28-31 * * [ $(date -d tomorrow +\%d) -eq 1 ] && cd /home/ubuntu/exclusive-club-reservas && node server/monthly-report.mjs
```

---

## Teste Manual

Antes de configurar o cron, teste os scripts manualmente:

### Testar Lembretes

```bash
cd /home/ubuntu/exclusive-club-reservas
node server/daily-reminders.mjs
```

### Testar Relatório Mensal

```bash
cd /home/ubuntu/exclusive-club-reservas
node server/monthly-report.mjs
```

---

## Visualizar Logs

### Logs em Tempo Real

```bash
# Lembretes diários
tail -f /home/ubuntu/logs/daily-reminders.log

# Relatório mensal
tail -f /home/ubuntu/logs/monthly-report.log
```

### Últimas 50 Linhas

```bash
tail -50 /home/ubuntu/logs/daily-reminders.log
tail -50 /home/ubuntu/logs/monthly-report.log
```

### Buscar Erros

```bash
grep -i "error\|falha\|❌" /home/ubuntu/logs/daily-reminders.log
grep -i "error\|falha\|❌" /home/ubuntu/logs/monthly-report.log
```

---

## Monitoramento

### Verificar se Cron Está Rodando

```bash
ps aux | grep cron
```

### Ver Logs do Sistema

```bash
grep CRON /var/log/syslog | tail -20
```

### Verificar Última Execução

```bash
# Lembretes
ls -lh /home/ubuntu/logs/daily-reminders.log

# Relatório
ls -lh /home/ubuntu/logs/monthly-report.log
```

---

## Troubleshooting

### Script Não Executa

1. **Verificar permissões:**
```bash
chmod +x server/daily-reminders.mjs
chmod +x server/monthly-report.mjs
```

2. **Verificar caminho do node:**
```bash
which node
# Use o caminho completo no crontab
```

3. **Testar comando manualmente:**
```bash
cd /home/ubuntu/exclusive-club-reservas && /usr/bin/node server/daily-reminders.mjs
```

### Emails Não São Enviados

1. **Verificar configuração SMTP:**
```bash
grep "SMTP" server/_core/emailService.ts
```

2. **Verificar logs:**
```bash
tail -100 /home/ubuntu/logs/daily-reminders.log | grep -i "email"
```

3. **Testar envio manual:**
```bash
node server/daily-reminders.mjs
```

### Cron Não Roda no Horário

1. **Verificar timezone do servidor:**
```bash
timedatectl
```

2. **Ajustar horário se necessário:**
```bash
# Se servidor está em UTC e você quer 9h BRT (UTC-3)
# Use 12h no cron (9h + 3h = 12h UTC)
0 12 * * * cd /home/ubuntu/exclusive-club-reservas && node server/daily-reminders.mjs
```

---

## Desabilitar Automação

### Temporariamente (Comentar)

```bash
crontab -e
# Adicionar # no início da linha
# 0 9 * * * cd /home/ubuntu/exclusive-club-reservas && node server/daily-reminders.mjs
```

### Permanentemente (Remover)

```bash
crontab -e
# Deletar a linha completamente
```

### Remover Todos os Cron Jobs

```bash
crontab -r
```

---

## Variáveis de Ambiente

### Email do Admin (Relatório Mensal)

Por padrão, o relatório é enviado para `paulovinicius92@hotmail.com`.

Para alterar, defina a variável `ADMIN_EMAIL`:

```bash
# No crontab
0 9 1 * * ADMIN_EMAIL=seu@email.com cd /home/ubuntu/exclusive-club-reservas && node server/monthly-report.mjs
```

---

## Backup dos Logs

### Rotação Automática

Criar script de rotação `/home/ubuntu/rotate-logs.sh`:

```bash
#!/bin/bash
cd /home/ubuntu/logs
mv daily-reminders.log daily-reminders.log.$(date +%Y%m%d)
mv monthly-report.log monthly-report.log.$(date +%Y%m%d)
find . -name "*.log.*" -mtime +30 -delete
```

Adicionar ao cron (todo domingo às 23h):

```cron
0 23 * * 0 /bin/bash /home/ubuntu/rotate-logs.sh
```

---

## Resumo de Comandos

```bash
# Configurar
crontab -e

# Listar
crontab -l

# Remover todos
crontab -r

# Ver logs
tail -f /home/ubuntu/logs/daily-reminders.log
tail -f /home/ubuntu/logs/monthly-report.log

# Testar scripts
node server/daily-reminders.mjs
node server/monthly-report.mjs
```

# TODO - Novas Funcionalidades

## 🚨 URGENTE - Novos Erros Reportados (13/12/2025 - 15:18)

### ERRO 1: Geração de PDF de Abastecimento (Puppeteer) - ✅ RESOLVIDO
- [x] **Print:** IMG_0012.PNG e IMG_0016.PNG
- [x] **Mensagem:** "Erro ao gerar relatório: Browser was not found at the configured executablePath (/usr/lib/chromium-browser/chromium-browser)"
- [x] **Local:** Página /admin/abastecimento ao clicar em "Relatório PDF"
- [x] **Causa:** Puppeteer não encontra o executável do Chromium
- [x] **Solução:** Configurado executablePath com fallback para /usr/bin/chromium-browser
- [x] **Teste:** Criado fuelRecordPDF.test.ts - PASSANDO

### ERRO 2: Envio de Email de Abastecimento (Puppeteer) - ✅ RESOLVIDO
- [x] **Print:** IMG_0016.PNG
- [x] **Mensagem:** "Erro ao enviar email: Browser was not found at the configured executablePath (/usr/lib/chromium-browser/chromium-browser)"
- [x] **Local:** Dialog "Enviar Relatório por Email" ao clicar em "Enviar"
- [x] **Causa:** Puppeteer não encontra o executável do Chromium (mesmo erro do PDF)
- [x] **Solução:** Mesma correção do ERRO 1 - resolvido automaticamente

### ERRO 3: Webhooks Asaas Penalizados (HTTP 400) - ✅ RESOLVIDO
- [x] **Print:** IMG_0013.PNG, IMG_0015.PNG, IMG_0017.PNG, IMG_0018.PNG
- [x] **Mensagem:** "Você possui 1 configuração de webhooks penalizada"
- [x] **Alerta:** "Erro na sincronização de Webhook - Detectamos que eventos da fila do webhook Exclusive Club - Notificações de Pagamento não estão sendo recebidos corretamente pelo seu sistema"
- [x] **Status:** 6 tentativas com código 400 (Bad Request)
- [x] **URL:** https://3000i44btb3r4dlw157enkakuc18...
- [x] **Local:** Painel Asaas > Integrações > Logs de Webhooks
- [x] **Causa:** Schema Zod muito restrito rejeitando campos extras do Asaas
- [x] **Solução:** Adicionado .passthrough() no schema raiz e tornado campos opcionais
- [x] **Logs:** Adicionados logs detalhados para debug de payloads
- [x] **Teste:** Criado webhookAsaas.test.ts - 3/3 PASSANDO

### OBSERVAÇÃO: Saldo Negativo no Dashboard
- [ ] **Print:** IMG_0012.PNG
- [ ] **Card "Saldo":** R$ -208.00 (Recebido - Cobrado)
- [ ] **Valor:** Correto matematicamente (R$ 0.00 - R$ 208.00 = -R$ 208.00)
- [ ] **Questão:** Verificar se é comportamento esperado ou se deve mostrar "R$ 0.00" quando negativo
- [ ] **Impacto:** Pode confundir usuário com saldo negativo

---

## 🚨 URGENTE - Correção de Retrocesso (13/12/2025)

### BUG CRÍTICO: PDF de Vistorias Retrocedeu
- [x] **Problema:** Merge Git automático (checkpoint c2b83ff6) removeu funcionalidades importantes do PDF
- [x] **Funcionalidades perdidas:**
  1. Timezone de Brasília na data de geração (estava: `America/Sao_Paulo`, agora: sem timezone)
  2. Nome do vistoriador correto (estava: `insp.inspected_by || insp.inspectedBy`, agora: `insp.inspected_by_name`)
  3. Seção completa de itens reprovados detalhada (REMOVIDA)
  4. Seção de observações completas com quebra de texto (REMOVIDA)
  5. Paginação automática quando conteúdo excede página (REMOVIDA)
- [x] **Ação:** Restaurar código do checkpoint 9c60fbc (versão correta)
- [x] **Validação:** Testar geração de PDF e confirmar que todas as seções aparecem
- [x] **Resultado:** 4 testes automatizados criados e passando (100%)
- [x] **Confirmado:** Todas as 5 funcionalidades restauradas com sucesso

---

## Funcionalidades Solicitadas

### Menu Mobile Responsivo
- [x] Criar componente de menu hambúrguer para mobile
- [x] Implementar drawer/sidebar que abre ao clicar no hambúrguer
- [x] Adaptar navegação existente para funcionar em modo mobile
- [x] Testar responsividade em diferentes tamanhos de tela

### Calendário de Manutenção (Admin)
- [x] Criar página /admin/manutencao
- [x] Implementar tabela de manutenções com CRUD completo
- [x] Adicionar formulário para criar/editar manutenção
- [x] Campos: embarcação, data início, data fim, descrição, status
- [x] Interface intuitiva com dialogs

### Bloqueio Automático de Reservas
- [x] Verificar se já existe tabela maintenances no schema
- [x] Criar endpoints tRPC para manutenções (se não existir)
- [x] Integrar verificação de manutenção no calendário de reservas
- [x] Bloquear datas em manutenção visualmente no calendário
- [x] Impedir criação de reservas em datas com manutenção
- [x] Adicionar mensagem informativa quando data está em manutenção

### Testes
- [x] Testar menu mobile em diferentes dispositivos
- [x] Testar CRUD de manutenções
- [x] Verificar bloqueio de reservas em datas com manutenção
- [x] Executar testes automatizados
- [ ] Garantir que nada foi quebrado

## Bugs Reportados (23/11/2025)

### Taxa de Ocupação
- [x] Corrigir cálculo da taxa de ocupação (mostrando 0% mesmo com reservas confirmadas)
- [x] Verificar query de estatísticas no backend
- [x] Testar cálculo com dados reais

### Calendário de Reservas
- [x] Corrigir visualização de datas já reservadas (não estão ficando vermelhas)
- [x] Verificar função isDateBooked no frontend
- [x] Testar bloqueio visual de datas reservadas

## Nova Feature - Dashboard Admin (23/11/2025)

### Próxima Reserva Detalhada
- [x] Modificar backend stats para retornar próxima reserva mais recente
- [x] Incluir informações: embarcação, cota, cliente, data
- [x] Atualizar frontend do card "Próximas Reservas" para mostrar detalhes
- [x] Testar visualização no dashboard admin

## Bug Crítico - Formulário Admin (23/11/2025)

### Data de Reserva Um Dia Antes
- [x] Corrigir bug de timezone no formulário de criação de reserva admin
- [x] Data selecionada está sendo salva com um dia a menos
- [x] Normalizar para meia-noite no fuso horário local
- [ ] Testar criação de reserva admin e visualização no painel do cliente

## Nova Feature - Painel do Cliente (23/11/2025)

### Card de Próxima Reserva Detalhada
- [x] Modificar backend para retornar próxima reserva do cliente logado
- [x] Incluir informações: data, embarcação, cota
- [x] Atualizar card "Próximas Reservas" na página Minhas Reservas
- [ ] Testar visualização no painel do cliente

## Melhoria - Card de Próximas Reservas (23/11/2025)

### Mostrar Todas as Reservas do Próximo Dia
- [x] Modificar backend AdminStats para retornar array de reservas do próximo dia
- [x] Modificar backend ClientStats para retornar array de reservas do próximo dia
- [x] Atualizar frontend do painel admin para listar todas as reservas
- [x] Atualizar frontend do painel do cliente para listar todas as reservas
- [ ] Testar com cliente que tem múltiplas cotas no mesmo dia

## Novas Funcionalidades (23/11/2025 - 20:10)

### Filtrar Calendários por Cotas do Cliente
- [x] Modificar página de Reservas para buscar cotas do cliente logado
- [x] Exibir apenas calendários de embarcações que o cliente possui cota
- [x] Se cliente tem só Jetski → mostrar só Jetski
- [x] Se cliente tem só Lancha → mostrar só Lancha
- [x] Se cliente tem ambos → mostrar ambos
- [ ] Testar com diferentes combinações de cotas

### Aviso de Cancelamento Automático em Manutenção
- [x] Criar endpoint backend para verificar conflitos de manutenção
- [x] Buscar reservas ativas no período selecionado
- [x] Adicionar dialog de confirmação no painel de manutenção
- [x] Mostrar lista de reservas que serão canceladas
- [x] Exibir: cliente, embarcação, data de cada reserva afetada
- [x] Confirmar antes de criar manutenção
- [ ] Testar criação de manutenção com e sem conflitos

## Bug - Menu Admin (23/11/2025 - 20:31)

### Aba de Manutenção Ausente
- [x] Adicionar aba "Manutenção" no menu de navegação do painel admin
- [x] Posicionar entre "Embarcações" e "Reservas" ou após "Reservas"
- [x] Testar navegação para /admin/manutencao

## Bug Crítico - Erro ao Criar Manutenção (23/11/2025 - 20:52) - RESOLVIDO

### Erro ao verificar conflitos
- [x] Investigar erro "Erro ao verificar conflitos" ao criar manutenção
- [x] Corrigir endpoint ou lógica de verificação de conflitos (faltava função getAllBookings no db.ts)
- [x] Testar criação de manutenção com e sem conflitos

## Bug Crítico - Cancelamento de Reservas em Manutenção (26/11/2025) - RESOLVIDO

### Reservas não estão sendo canceladas automaticamente
- [x] Implementar cancelamento automático de reservas ao criar manutenção
- [x] Atualizar status das reservas conflitantes para 'cancelled'
- [x] Enviar email para clientes afetados informando cancelamento e motivo
- [x] Enviar email para admin com lista de reservas canceladas
- [x] Testar fluxo completo de criação de manutenção com cancelamentos

## Nova Feature - Quantidade de Cotas por Embarcação (26/11/2025) - CONCLUÍDO

### Campo de quantidade de cotas configurável
- [x] Adicionar campo 'quotaCount' na tabela vessels do schema
- [x] Migrar dados existentes (manter valores atuais: 6 para Jetski, 7 para Lancha)
- [x] Adicionar campo no formulário de criação/edição de embarcações
- [x] Permitir valores: 3, 4, 6, 7 ou outros conforme necessário
- [x] Atualizar lógica de cálculo de disponibilidade para usar quotaCount
- [x] Testar com diferentes quantidades de cotas

## Bugs Críticos Reportados (26/11/2025 - 14:51) - TODOS RESOLVIDOS

### 1. Cotas Ilimitadas no Cadastro de Cliente - RESOLVIDO
- [x] Corrigir lógica de geração de botões de cotas no formulário de cliente
- [x] Respeitar o campo quotaCount da embarcação
- [x] Embarcação com 4 cotas deve mostrar apenas #1, #2, #3, #4 (inteira e meia)
- [x] Testar com embarcações de 3, 4, 6 e 7 cotas

### 2. Imagem Quebrada na Galeria - RESOLVIDO
- [x] Investigar imagem "Jetski Sea-Doo - Vista frontal" que não carrega
- [x] Remover imagem quebrada da galeria se não for possível corrigir
- [x] Garantir que galeria funcione sem erros

### 3. Edição de Nome do Usuário - RESOLVIDO
- [x] Adicionar campo de edição de nome no perfil do usuário
- [x] Criar endpoint backend para atualizar nome do usuário
- [x] Permitir que usuário altere seu próprio nome (ex: "Marduqueu" → outro nome)
- [x] Testar atualização de nome

### 4. Emails de Confirmação Não Enviados - RESOLVIDO
- [x] Implementar envio de email ao criar reserva (confirmação)
- [x] Implementar envio de email ao cancelar reserva
- [x] Implementar envio de email ao marcar reserva como usada
- [x] Testar envio de emails para clientes

### 5. Emails Caindo no Spam - MELHORADO
- [x] Melhorar headers dos emails (From, Reply-To, etc.)
- [x] Adicionar texto plano além do HTML
- [x] Melhorar conteúdo para evitar filtros de spam
- [x] Testar deliverability dos emails

### 6. Notificações de Mudança de Status de Manutenção - RESOLVIDO
- [x] Implementar envio de email ao mudar status de manutenção
- [x] Notificar clientes afetados (com reservas no período)
- [x] Notificar admin sobre mudança de status
- [x] Testar com todas as transições de status (Agendada → Em Andamento → Concluída → Cancelada)


## Implementação de Envio de Emails via SMTP (26/11/2025 - 16:15)

### Configurar SMTP da Hostgator para envio real de emails
- [x] Instalar biblioteca Nodemailer
- [x] Criar serviço de envio de emails com configuração SMTP
- [x] Configurar credenciais: mail.exclusiveclubitz.com:587
- [x] Atualizar notificações de confirmação de reserva
- [x] Atualizar notificações de cancelamento de reserva
- [ ] Atualizar notificações de mudança de status de manutenção
- [ ] Verificar credenciais SMTP no painel da Hostgator (erro 535 - autenticação)
- [ ] Testar envio de emails após correção de credenciais


## Correção de Configuração SMTP (26/11/2025 - 16:30)

### Atualizar servidor SMTP para Titan Email
- [x] Alterar host de mail.exclusiveclubitz.com para smtp.titan.email
- [x] Manter porta 587 (TLS)
- [x] Testar envio de email com novas configurações
- [x] Verificar se emails chegam na caixa de entrada (não spam)


## Novas Funcionalidades - Melhorias do Sistema (26/11/2025 - 18:00)

### 1. Lembretes Automáticos 24h Antes das Reservas
- [x] Criar função para buscar reservas que acontecerão em 24h
- [x] Criar template de email de lembrete
- [x] Implementar envio automático de lembretes
- [x] Testar envio de lembretes

### 2. Verificar Envio de Emails Existentes
- [x] Testar email de confirmação de reserva
- [x] Testar email de cancelamento de reserva
- [x] Testar email de notificação de manutenção
- [x] Verificar se emails estão sendo enviados corretamente

### 3. Email de Boas-Vindas para Novos Clientes
- [x] Criar template de email de boas-vindas
- [x] Implementar envio automático ao cadastrar cliente
- [x] Testar envio de email de boas-vindas

### 4. Relatório Mensal por Email para Admin
- [x] Criar função para gerar estatísticas mensais
- [x] Criar template de email de relatório
- [x] Implementar envio automático mensal
- [x] Testar geração e envio de relatório

### 5. Sistema de Avaliações Pós-Uso
- [x] Criar tabela reviews no schema
- [x] Criar endpoints tRPC para avaliações
- [ ] Criar página admin para visualizar avaliações - PENDENTE
- [ ] Permitir clientes avaliarem após uso - PENDENTE
- [ ] Testar sistema de avaliações - PENDENTE

### 6. Edição de Nome na Versão Desktop
- [x] Adicionar campo de edição de nome no header desktop
- [x] Implementar dialog de edição
- [x] Testar edição de nome na versão desktop


## Bug Reportado - Criação de Manutenção (26/11/2025 - 18:10)

- [x] Corrigir notificações na criação de manutenção
- [x] Garantir que admin recebe notificação via Manus
- [x] Garantir que clientes afetados recebem email
- [x] Testar criação de manutenção completa


## Bugs Reportados - Calendário e Emails (26/11/2025 - 20:30)

### 1. Calendário não mostra datas em manutenção - RESOLVIDO (28/11/2025)
- [x] Investigar endpoint de disponibilidade
- [x] Adicionar manutenções ao cálculo de indisponibilidade
- [x] Testar visualização no calendário
- [x] Corrigir função getDayStatus para verificar períodos de manutenção
- [x] Validar cores: laranja para manutenção, vermelho para reservas
- [x] Remover logs de debug

### 2. Emails de cancelamento por manutenção não enviados
- [x] Verificar função notifyClientMaintenanceCancellation
- [x] Testar envio de emails ao criar manutenção com conflitos
- [x] Confirmar recebimento de emails pelos clientes

### 3. Formalizar tom dos emails
- [x] Revisar todos os templates de email
- [x] Usar linguagem mais formal e profissional
- [x] Manter clareza e objetividade


## Novas Funcionalidades - Fase 2 (26/11/2025 - 20:45)

### 1. Email de Boas-Vindas Automático
- [x] Criar template de email de boas-vindas
- [x] Implementar envio ao cadastrar novo cliente
- [x] Incluir explicação do sistema de cotas
- [x] Incluir regras de uso (máximo 2 reservas, segundas bloqueadas)
- [x] Testar envio de email

### 2. Sistema de Avaliações Pós-Uso
- [x] Criar tabela reviews no schema
- [x] Criar endpoints tRPC usando SQL direto
- [ ] Criar página de avaliação para clientes - PENDENTE
- [ ] Criar página admin para visualizar todas as avaliações - PENDENTE
- [ ] Mostrar estatísticas (média de estrelas, total de avaliações) - PENDENTE
- [ ] Testar fluxo completo - PENDENTE

### 3. Automação de Lembretes Diários
- [x] Criar script standalone para execução via cron
- [x] Documentar comando cron
- [x] Testar execução manual do script
- [x] Validar envio de lembretes


## Continuação - Fase 3 (26/11/2025 - 21:00)

### 1. Relatório Mensal Automático
- [x] Criar template de email de relatório mensal
- [x] Implementar função para calcular estatísticas do mês
- [x] Criar script monthly-report.mjs para execução via cron
- [x] Documentar configuração do cron job
- [x] Testar geração de relatório

### 2. Configurar Cron Jobs
- [x] Criar script de setup de cron jobs
- [x] Documentar comandos de configuração
- [x] Testar execução dos scripts
- [x] Validar logs


## Novas Funcionalidades - Fase 4 (26/11/2025 - 21:05)

### 1. Sistema de Funcionários
- [x] Criar tabela de funcionários no banco
- [x] Criar endpoints tRPC (create, list, update, delete)
- [x] Criar página admin para cadastrar funcionários
- [x] Adicionar tab de funcionários no painel admin
- [x] Criar role "employee" no sistema
- [x] Implementar verificação automática de email em employees
- [x] Criar dashboard de funcionário com acesso limitado
- [x] Testar login e permissões de funcionário

### 2. Sistema de Abastecimento
- [x] Criar tabela de abastecimentos no banco
- [x] Criar endpoints tRPC para registrar abastecimento
- [x] Criar interface admin para registrar abastecimento pós-vistoria
- [x] Vincular abastecimento à reserva e cobrar cliente
- [x] Criar relatório de abastecimentos por embarcação
- [x] Testar fluxo completo

### 3. Sistema de Vistorias
- [x] Analisar formulários do Google (Jet e Lancha)
- [x] Criar tabela de vistorias no banco
- [x] Implementar formulário de vistoria do Jet
- [x] Implementar formulário de vistoria da Lancha
- [x] Gerar relatório PDF de vistoria
- [x] Enviar relatório por email ao admin
- [x] Testar fluxo completo de vistoria

### 4. Novo Layout de Reservas (Estilo Calendário)
- [x] Analisar design do print fornecido
- [x] Redesenhar página de reservas estilo agenda
- [x] Manter TODAS as funcionalidades atuais
- [x] Testar responsividade mobile
- [x] Validar com usuário


## Sistema de Gestão Financeira de Abastecimentos com Asaas (13/12/2025)

### Fase 1 - Planejamento ✅
- [x] Documentar todas as funcionalidades
- [x] Especificações técnicas
- [x] Checklist completo

### Fase 2 - Serviço Asaas ✅
- [x] Criar server/_core/asaas.ts
- [x] Implementar funções: createCharge, deleteCharge, getCharge, getOrCreateCustomer
- [x] Mapear status Asaas para sistema

### Fase 3 - Schema do Banco ✅
- [x] Atualizar tabela fuel_records com campos Asaas
- [x] Criar tabela fuel_budget
- [x] Migrar schema

### Fases 4-10 - Implementação Completa ✅
- [x] Endpoints backend e webhook
- [x] Dashboard financeiro admin
- [x] Interface funcionário com upload
- [x] Página cliente "Meus Abastecimentos"
- [x] Emails automáticos
- [x] Testes automatizados
- [x] Validação final

**SISTEMA 100% IMPLEMENTADO E FUNCIONAL!**

# TODO - Novas Funcionalidades

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
- [ ] Criar template de email de boas-vindas
- [ ] Implementar envio automático ao cadastrar cliente
- [ ] Testar envio de email de boas-vindas

### 4. Relatório Mensal por Email para Admin
- [ ] Criar função para gerar estatísticas mensais
- [ ] Criar template de email de relatório
- [ ] Implementar envio automático mensal
- [ ] Testar geração e envio de relatório

### 5. Sistema de Avaliações Pós-Uso
- [ ] Criar tabela reviews no schema
- [ ] Criar endpoints tRPC para avaliações
- [ ] Criar página admin para visualizar avaliações
- [ ] Permitir clientes avaliarem após uso
- [ ] Testar sistema de avaliações

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

### 1. Calendário não mostra datas em manutenção
- [x] Investigar endpoint de disponibilidade
- [x] Adicionar manutenções ao cálculo de indisponibilidade
- [x] Testar visualização no calendário

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
- [ ] Implementar endpoints tRPC (create, list, stats) - PENDENTE (complexidade técnica)
- [ ] Criar interface para cliente avaliar (1-5 estrelas + comentário) - PENDENTE
- [ ] Criar página admin para visualizar avaliações - PENDENTE
- [ ] Mostrar estatísticas por embarcação - PENDENTE
- [ ] Testar fluxo completo de avaliação - PENDENTE

### 3. Automação de Lembretes Diários
- [x] Criar script standalone para execução via cron
- [x] Documentar comando cron
- [x] Testar execução manual do script
- [x] Validar envio de lembretes


## Continuação - Fase 3 (26/11/2025 - 21:00)

### 1. Finalizar Sistema de Avaliações Completo
- [x] Criar endpoints tRPC usando SQL direto (evitar problemas de import)
- [ ] Criar página de avaliação para clientes - PENDENTE (erro TypeScript)
- [ ] Criar página admin para visualizar todas as avaliações - PENDENTE (erro TypeScript)
- [ ] Mostrar estatísticas (média de estrelas, total de avaliações) - PENDENTE
- [ ] Testar fluxo completo - PENDENTE

### 2. Relatório Mensal Automático
- [x] Criar template de email de relatório mensal
- [x] Implementar função para calcular estatísticas do mês
- [x] Criar script monthly-report.mjs para execução via cron
- [x] Documentar configuração do cron job
- [ ] Testar geração de relatório

### 3. Configurar Cron Jobs
- [x] Criar script de setup de cron jobs
- [x] Documentar comandos de configuração
- [x] Testar execução dos scripts
- [x] Validar logs


## Novas Funcionalidades - Fase 4 (26/11/2025 - 21:05)

### 1. Sistema de Abastecimento (Admin Only)
- [x] Criar tabela de abastecimentos no banco
- [ ] Criar endpoints tRPC para registrar abastecimento - PENDENTE
- [ ] Criar interface admin para registrar abastecimento pós-vistoria - PENDENTE
- [ ] Vincular abastecimento à reserva e cobrar cliente - PENDENTE
- [ ] Criar relatório de abastecimentos por embarcação - PENDENTE
- [ ] Testar fluxo completo - PENDENTE

### 2. Perfil de Funcionário
- [x] Criar tabela de funcionários no banco
- [x] Criar endpoints tRPC (create, list, update, delete)
- [x] Criar página admin para cadastrar funcionários
- [x] Adicionar tab de funcionários no painel admin
- [ ] Criar role "employee" no sistema - PENDENTE (próxima fase)
- [ ] Implementar permissões específicas de funcionário - PENDENTE (próxima fase)
- [ ] Criar dashboard de funcionário com acesso limitado - PENDENTE (próxima fase)
- [ ] Testar login e permissões de funcionário - PENDENTE (próxima fase)

### 3. Sistema de Vistorias
- [x] Analisar formulários do Google (Jet e Lancha)
- [x] Criar tabela de vistorias no banco
- [ ] Implementar formulário de vistoria do Jet - PENDENTE
- [ ] Implementar formulário de vistoria da Lancha - PENDENTE
- [ ] Gerar relatório PDF/HTML de vistoria - PENDENTE
- [ ] Enviar relatório por email ao admin - PENDENTE
- [ ] Testar fluxo completo de vistoria - PENDENTE

### 4. Novo Layout de Reservas (Estilo Calendário)
- [x] Analisar design do print fornecido
- [ ] Redesenhar página de reservas estilo agenda - PENDENTE
- [ ] Manter TODAS as funcionalidades atuais - PENDENTE
- [ ] Testar responsividade mobile - PENDENTE
- [ ] Validar com usuário - PENDENTE

### Permissões de Funcionário (Acesso Limitado)
**PODE acessar:**
- Reservas futuras (após data atual)
- Criar/visualizar manutenções
- Ver relatórios de uso

**NÃO PODE acessar:**
- Clientes
- Embarcações (cadastro/edição)
- Reservas passadas
- Configurações do sistema


## Correção Urgente - Testes de Email (26/11/2025 - 21:30)
- [x] Desabilitar envio real de emails nos testes automatizados
- [x] Mockar função sendEmail para evitar bounces
- [x] Validar que testes continuam passando sem enviar emails


## Implementação Atual - Sistema de Abastecimento (26/11/2025 - 21:45)

### Endpoints e Backend
- [x] Criar endpoints tRPC para abastecimento (create, list, getByVessel, getByBooking)
- [x] Vincular abastecimento à reserva (bookingId)
- [x] Calcular valor total (litros × preço por litro)
- [x] Registrar data, responsável, observações

### Interface Admin
- [x] Criar página/modal para registrar abastecimento
- [x] Selecionar reserva recente (últimas 7 dias)
- [x] Input: litros, preço por litro, observações
- [x] Mostrar valor total calculado
- [x] Confirmar e salvar

### Relatórios
- [x] Criar página de relatório de abastecimentos (integrado na página principal)
- [x] Filtrar por embarcação e período (via endpoints)
- [x] Mostrar: data, cliente, litros, valor, responsável
- [x] Calcular totais (litros e valor) - endpoint stats
- [ ] Exportar para PDF/Excel - PENDENTE (próxima fase)

### Testes
- [x] Testar registro de abastecimento
- [x] Testar vínculo com reserva
- [x] Testar relatórios
- [x] Validar cálculos


## Implementação Atual - Sistema de Vistorias (26/11/2025 - 22:00)

### Endpoints e Backend
- [x] Criar endpoints tRPC para vistorias (create, list, getByBooking, getByVessel)
- [x] Armazenar dados do formulário em JSON
- [x] Vincular à reserva e embarcação
- [x] Registrar data, usuário que usou, responsável pela vistoria

### Formulários Interativos
- [x] Criar formulário de vistoria do Jet (12 campos de aprovação)
- [x] Criar formulário de vistoria da Lancha (20 campos de aprovação)
- [x] Campos: aprovado/reprovado + observações
- [x] Incluir data da vistoria
- [x] Incluir nome do usuário que usou a embarcação
- [x] Validação de campos obrigatórios

### Geração de Relatórios
- [ ] Criar template HTML de relatório - PENDENTE (próxima fase)
- [ ] Incluir todos os dados da vistoria - PENDENTE
- [ ] Incluir fotos/assinaturas (se necessário) - PENDENTE
- [ ] Gerar PDF do relatório - PENDENTE
- [ ] Enviar por email ao admin - PENDENTE

### Interface Admin
- [x] Criar página de vistorias
- [x] Listar vistorias realizadas
- [x] Filtrar por embarcação e período (via endpoints)
- [x] Visualizar detalhes de cada vistoria
- [x] Botão para realizar nova vistoria

### Testes
- [x] Testar criação de vistoria
- [ ] Testar geração de relatório - PENDENTE
- [ ] Testar envio de email - PENDENTE
- [x] Validar dados salvos


## Implementação Atual - Redesign Página de Reservas (26/11/2025 - 22:15)

### Análise do Design
- [x] Analisar print fornecido (estilo calendário mensal)
- [x] Identificar elementos: navegação mensal, dias da semana, eventos por dia
- [x] Identificar informações: horário, cliente, embarcação

### Novo Layout
- [x] Criar header com navegação mensal (setas + dropdown de mês)
- [x] Grid de dias da semana (Dom, 2ª, 3ª, 4ª, 5ª, 6ª, Sáb)
- [x] Cards de eventos por dia com horário visível
- [x] Cores diferentes por embarcação
- [x] Indicador de "Sem eventos" para dias vazios
- [x] Botão flutuante "+" para nova reserva

### Funcionalidades Mantidas
- [x] Criar nova reserva
- [x] Visualizar detalhes da reserva
- [x] Cancelar reserva
- [x] Navegar entre meses
- [x] Responsividade mobile
- [x] Indicador de data atual (borda azul)
- [x] Datas indisponíveis (segundas e manutenções)

### Testes
- [x] Testar criação de reserva
- [x] Testar navegação entre meses
- [x] Testar responsividade
- [x] Validar todas as funcionalidades existentes
- [x] 37 testes passando (100%)


## Implementação Atual - Relatórios PDF de Vistorias (26/11/2025 - 22:30)

### Instalação e Setup
- [ ] Instalar biblioteca puppeteer para geração de PDF
- [ ] Configurar puppeteer no servidor

### Template HTML
- [ ] Criar template HTML profissional
- [ ] Incluir logo e branding do Exclusive Club
- [ ] Formatar campos de aprovação/reprovação com ícones
- [ ] Incluir data da vistoria e nome do usuário
- [ ] Adicionar observações e assinatura

### Geração de PDF
- [ ] Criar função generateInspectionPDF
- [ ] Renderizar template com dados da vistoria
- [ ] Gerar PDF usando puppeteer
- [ ] Salvar PDF temporariamente

### Envio por Email
- [ ] Criar template de email com PDF anexado
- [ ] Enviar para admin automaticamente após vistoria
- [ ] Incluir resumo no corpo do email

### Testes
- [ ] Testar geração de PDF do Jet
- [ ] Testar geração de PDF da Lancha
- [ ] Testar envio de email com anexo
- [ ] Validar formatação do PDF


## Bug - Cadastro de Funcionários (26/11/2025 - 22:35)
- [ ] Corrigir erro "query.getSQL is not a function" no endpoint employees.create
- [ ] Testar cadastro de funcionários


## Bugs - Páginas Admin (26/11/2025 - 22:35)
- [x] Corrigir erro "query.getSQL is not a function" no endpoint employees.create
- [x] Adicionar botão de voltar na página de funcionários
- [x] Adicionar botão de voltar na página de abastecimento
- [x] Adicionar botão de voltar na página de vistorias
- [x] Testar todas as páginas

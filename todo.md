# Project TODO

## Banco de Dados e Backend
- [x] Criar tabela de clientes autorizados (allowedClients)
- [x] Criar tabela de embarcações (vessels)
- [x] Criar tabela de reservas (bookings)
- [x] Implementar procedures tRPC para gestão de clientes
- [x] Implementar procedures tRPC para gestão de embarcações
- [x] Implementar procedures tRPC para sistema de reservas
- [x] Adicionar validação de limite de 2 reservas simultâneas
- [x] Adicionar validação de bloqueio de segundas-feiras
- [x] Adicionar sistema de liberação automática após uso

## Design e Interface
- [x] Configurar paleta de cores azul/turquesa do site original
- [x] Adicionar logo da Exclusive Club
- [x] Criar página inicial (landing page) com hero section
- [x] Criar seção de apresentação das embarcações
- [x] Implementar design responsivo mobile-first

## Sistema de Autenticação
- [x] Implementar verificação de email autorizado no login
- [x] Criar página de acesso negado para emails não autorizados
- [x] Adicionar redirecionamento pós-login baseado em role

## Calendário de Reservas (Cliente)
- [x] Criar componente de calendário interativo
- [x] Implementar seleção de embarcação
- [x] Implementar seleção de data com bloqueio de segundas
- [x] Mostrar disponibilidade em tempo real
- [x] Implementar confirmação de reserva
- [x] Criar página "Minhas Reservas" com lista de reservas ativas
- [x] Adicionar funcionalidade de cancelamento de reserva
- [x] Adicionar indicador visual de limite de reservas (2/2)

## Painel Administrativo
- [x] Criar layout de dashboard administrativo
- [x] Implementar CRUD de clientes autorizados
- [x] Implementar CRUD de embarcações
- [x] Criar visualização de todas as reservas
- [x] Adicionar filtros por data, embarcação e cliente
- [x] Implementar marcação manual de "data utilizada"
- [x] Criar relatórios de uso e estatísticas
- [x] Adicionar sistema de notificações para o admin

## Testes
- [x] Criar testes para validação de regras de negócio
- [x] Criar testes para procedures de reserva
- [x] Criar testes para sistema de autenticação
- [x] Testar fluxo completo de reserva

## Documentação e Entrega
- [x] Documentar regras de negócio
- [x] Criar guia de uso para administrador
- [x] Criar guia de uso para clientes
- [x] Preparar checkpoint final

## Correções Urgentes
- [x] Corrigir problema de login
- [x] Corrigir problema de agendamento
- [x] Corrigir imagens das embarcações na página inicial
- [x] Testar fluxo completo após correções

## Diagnóstico e Correção Final
- [x] Identificar exatamente o que não está funcionando
- [ ] Corrigir problema reportado pelo usuário
- [ ] Testar novamente todo o fluxo
- [ ] Validar com o usuário

## Bug Crítico - Validação de Dia da Semana
- [ ] Corrigir validação que está bloqueando terças-feiras como segundas
- [ ] Testar com todas as terças de dezembro
- [ ] Validar que segundas continuam bloqueadas


## Novas Funcionalidades Implementadas

### Widget de Clima na Página de Reservas
- [x] Criar componente WeatherWidget para exibir previsão
- [x] Integrar widget na página de reservas
- [x] Mostrar alertas visuais para condições desfavoráveis
- [x] Atualizar previsão quando data for selecionada

### Calendário de Manutenção (Admin)
- [x] Criar tabela de manutenções no schema
- [x] Implementar CRUD de manutenções no backend
- [x] Criar interface de calendário no painel admin (/admin/manutencao)
- [x] Página com listagem e gestão de manutenções
- [ ] Implementar bloqueio automático de reservas em datas de manutenção
- [ ] Adicionar link no painel admin principal

### Configuração de API Key
- [x] Solicitar OPENWEATHER_API_KEY via webdev_request_secrets
- [x] Validar chave com teste de API
- [x] Documentar onde obter a chave gratuita
- [x] Criar arquivo weather.ts com integração OpenWeatherMap


## 🚀 Implementações Finais

### Link de Manutenção no Painel Admin
- [x] Adicionar card/botão de acesso ao calendário de manutenção
- [x] Integrar link na página /admin
- [x] Criar aba dedicada com descrição de funcionalidades

### Bloqueio Automático de Reservas
- [x] Verificar manutenções ao tentar criar reserva
- [x] Bloquear datas com manutenção programada
- [x] Exibir mensagem informativa ao usuário
- [x] Testar bloqueio com diferentes cenários (4/4 testes passando)

### Sistema de Emails Automáticos
- [x] Criar função de envio de email com previsão do tempo
- [x] Criar endpoints tRPC para admin executar manualmente
- [x] Implementar verificação de alertas de chuva (>80%)
- [x] Criar templates de email formatados
- [x] Testar envio de emails (4/4 testes passando)
- [x] Página /admin/emails com interface de gerenciamento
- [x] Integrar link no painel admin

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

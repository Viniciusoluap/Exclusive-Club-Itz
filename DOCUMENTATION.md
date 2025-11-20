# Sistema de Reservas - Exclusive Club

## Visão Geral

Sistema completo de reservas de embarcações para a Exclusive Club, desenvolvido com React, TypeScript, tRPC e MySQL. O sistema permite que clientes autorizados façam reservas de lanchas e jetskis através de um calendário interativo, com regras de negócio específicas.

## Regras de Negócio

### Controle de Acesso
- **Apenas emails pré-cadastrados** podem fazer reservas
- Administradores têm acesso total ao sistema
- Clientes não autorizados recebem mensagem de acesso negado

### Limite de Reservas
- Cada cliente pode ter **máximo 2 reservas simultâneas ativas**
- Após utilizar uma reserva, um novo slot é liberado
- O sistema bloqueia automaticamente novas reservas quando o limite é atingido

### Disponibilidade
- **Segundas-feiras são bloqueadas** - não é possível fazer reservas
- Não é possível reservar datas passadas
- Cada embarcação só pode ter uma reserva por data
- Sistema disponível o ano todo (exceto segundas)

### Status de Reservas
- **Confirmada**: Reserva ativa, conta para o limite de 2
- **Utilizada**: Reserva já usada, libera slot para nova reserva
- **Cancelada**: Reserva cancelada pelo cliente ou admin

## Funcionalidades

### Para Clientes
1. **Visualizar Embarcações**: Ver todas as embarcações disponíveis na página inicial
2. **Fazer Reservas**: 
   - Acessar calendário interativo
   - Selecionar data disponível (exceto segundas)
   - Escolher embarcação
   - Adicionar observações opcionais
3. **Gerenciar Reservas**:
   - Ver lista de todas as suas reservas
   - Cancelar reservas confirmadas
   - Acompanhar status (confirmada/utilizada/cancelada)
4. **Indicador de Limite**: Ver quantas reservas ativas possui (X/2)

### Para Administradores
1. **Gestão de Clientes Autorizados**:
   - Adicionar novos clientes (email, nome, telefone)
   - Ativar/desativar clientes
   - Remover clientes
2. **Gestão de Embarcações**:
   - Cadastrar novas embarcações (nome, tipo, descrição, capacidade)
   - Ativar/desativar embarcações
   - Remover embarcações
3. **Gestão de Reservas**:
   - Visualizar todas as reservas do sistema
   - Marcar reservas como "utilizadas"
   - Excluir reservas
   - Filtrar por status

## Estrutura Técnica

### Backend (tRPC)
- **Auth**: Autenticação com Manus OAuth
- **allowedClients**: CRUD de clientes autorizados (admin only)
- **vessels**: CRUD de embarcações
- **bookings**: Sistema de reservas com validações

### Banco de Dados
- **users**: Usuários do sistema (OAuth)
- **allowed_clients**: Emails autorizados a fazer reservas
- **vessels**: Embarcações disponíveis
- **bookings**: Reservas com timestamps UTC

### Frontend
- **Home** (`/`): Landing page com apresentação
- **Reservas** (`/reservas`): Calendário e gestão de reservas (cliente)
- **Admin** (`/admin`): Painel administrativo completo
- **AccessDenied** (`/acesso-negado`): Página de acesso negado

## Guia de Uso - Administrador

### Primeiro Acesso
1. Faça login com sua conta (o proprietário do projeto é automaticamente admin)
2. Acesse o painel administrativo pelo botão "Admin" no header

### Cadastrar Clientes
1. Vá para a aba "Clientes"
2. Clique em "Adicionar Cliente"
3. Preencha:
   - **Email** (obrigatório): Email que o cliente usará para login
   - **Nome** (obrigatório): Nome completo do cliente
   - **Telefone** (opcional): Contato do cliente
4. Clique em "Adicionar"

**Importante**: O cliente deve fazer login com o email cadastrado para ter acesso ao sistema.

### Cadastrar Embarcações
1. Vá para a aba "Embarcações"
2. Clique em "Adicionar Embarcação"
3. Preencha:
   - **Nome**: Ex: "Jetski Seadoo GTI SE 130HP"
   - **Tipo**: Lancha ou Jetski
   - **Capacidade**: Número de pessoas (opcional)
   - **Descrição**: Detalhes da embarcação (opcional)
4. Clique em "Adicionar"

### Gerenciar Reservas
1. Vá para a aba "Reservas"
2. Visualize todas as reservas com:
   - Nome do cliente e email
   - Embarcação reservada
   - Data da reserva
   - Status atual
3. Para marcar como utilizada:
   - Clique em "Marcar Usada" na reserva confirmada
   - Isso libera um slot para o cliente fazer nova reserva
4. Para excluir: Clique no ícone de lixeira

### Ativar/Desativar
- **Clientes**: Use o botão "Ativo/Inativo" para controlar acesso
- **Embarcações**: Use o botão "Ativa/Inativa" para disponibilidade

## Guia de Uso - Cliente

### Primeiro Acesso
1. Seu email deve estar cadastrado pelo administrador
2. Clique em "Agendar Reserva" ou "Fazer Login"
3. Faça login com sua conta

### Fazer uma Reserva
1. Acesse "Minhas Reservas" no menu
2. Verifique seu limite de reservas (máximo 2 ativas)
3. Role até o calendário da embarcação desejada
4. Navegue pelos meses usando as setas
5. Clique em uma data disponível (verde):
   - **Datas cinzas**: Indisponíveis (passadas ou segundas)
   - **Datas vermelhas**: Já reservadas
   - **Datas verdes**: Disponíveis
6. Confirme a reserva e adicione observações se necessário

### Gerenciar Suas Reservas
1. Na página "Minhas Reservas", veja todas as suas reservas
2. **Status**:
   - 🟢 **Confirmada**: Reserva ativa
   - 🔵 **Utilizada**: Já foi usada
   - ⚫ **Cancelada**: Foi cancelada
3. Para cancelar: Clique no "X" ao lado da reserva confirmada

### Limite de Reservas
- Você pode ter **no máximo 2 reservas confirmadas**
- Após usar uma reserva (admin marca como "utilizada"), você pode fazer uma nova
- O sistema mostra claramente quantas reservas você tem: "X/2 Reservas Ativas"

## Horário de Funcionamento
- **Terça a Domingo**: 10:00 - 19:00
- **Segunda-feira**: Fechado (reservas bloqueadas)

## Contato
- **Endereço**: Rua Leôncio Pires Dourado 840-A, Bacuri, Imperatriz - MA
- **Telefone**: Disponível no site

## Tecnologias Utilizadas
- **Frontend**: React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- **Backend**: Node.js, Express, tRPC 11
- **Banco de Dados**: MySQL/TiDB
- **Autenticação**: Manus OAuth
- **Testes**: Vitest

## Segurança
- Autenticação obrigatória para todas as operações
- Validação de emails autorizados
- Controle de acesso baseado em roles (admin/user)
- Validações server-side para todas as regras de negócio

## Manutenção

### Adicionar Novos Clientes
Use o painel admin para adicionar emails autorizados. Não é necessário modificar código.

### Adicionar Novas Embarcações
Use o painel admin para cadastrar novas embarcações. Todas as informações são gerenciadas pelo banco de dados.

### Backup de Dados
Recomenda-se fazer backup regular do banco de dados através do painel de gerenciamento do projeto.

## Suporte
Para dúvidas ou problemas, entre em contato através dos canais oficiais da Exclusive Club.

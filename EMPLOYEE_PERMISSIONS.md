# Permissões de Funcionários - Exclusive Club

## Visão Geral

O sistema possui **3 níveis de acesso**:

1. **Owner (Proprietário)** - Acesso total ao sistema
2. **Admin** - Acesso administrativo completo (mesmo nível do owner)
3. **Funcionário (Employee)** - Acesso limitado e específico

---

## Status Atual de Implementação

### ✅ Implementado

**Cadastro de Funcionários (Admin Only):**
- Admin pode cadastrar funcionários via `/admin/funcionarios`
- Campos: nome, email, telefone, embarcações responsáveis
- Funcionários cadastrados ficam inativos até fazer login

**Gerenciamento:**
- Listar todos os funcionários ativos
- Editar informações de funcionários
- Desativar funcionários (soft delete)
- Vincular funcionários a embarcações específicas

### ⚠️ Pendente de Implementação

**Sistema de Autenticação de Funcionários:**
- [ ] Criar role "employee" na tabela users
- [ ] Verificar se email do usuário está cadastrado em employees
- [ ] Atribuir role "employee" automaticamente no login
- [ ] Bloquear acesso se email não estiver cadastrado

**Dashboard de Funcionário:**
- [ ] Criar página `/employee/dashboard` com acesso limitado
- [ ] Mostrar apenas funcionalidades permitidas
- [ ] Ocultar menus administrativos

**Middleware de Permissões:**
- [ ] Criar `employeeProcedure` no tRPC
- [ ] Validar role "employee" em endpoints específicos
- [ ] Bloquear acesso a endpoints administrativos

---

## Lógica de Acesso Proposta

### Como Funcionará (Após Implementação)

1. **Cadastro pelo Admin:**
   - Admin acessa `/admin/funcionarios`
   - Cadastra email do funcionário (ex: `joao@example.com`)
   - Sistema salva na tabela `employees`

2. **Login do Funcionário:**
   - Funcionário acessa o sistema via Manus OAuth
   - Sistema verifica se email existe em `employees`
   - Se **SIM**: atribui role "employee" e permite acesso
   - Se **NÃO**: bloqueia acesso e exibe mensagem

3. **Acesso Restrito:**
   - Funcionário vê apenas menu limitado
   - Pode acessar apenas funcionalidades permitidas
   - Não pode acessar painel admin

---

## Permissões de Funcionário

### ✅ PODE Acessar

**Reservas Futuras:**
- Visualizar reservas confirmadas (após data atual)
- Filtrar por embarcação responsável
- Ver detalhes: cliente, data, horário, embarcação

**Manutenções:**
- Visualizar manutenções programadas
- Criar nova manutenção (apenas para embarcações responsáveis)
- Editar manutenções criadas por ele
- Ver histórico de manutenções

**Vistorias:**
- Registrar vistoria pré-uso
- Registrar vistoria pós-uso
- Ver histórico de vistorias
- Gerar relatório PDF de vistoria

**Abastecimento:**
- Registrar abastecimento pós-uso
- Ver histórico de abastecimentos
- Filtrar por embarcação responsável

**Relatórios Limitados:**
- Uso de embarcações (apenas responsáveis)
- Estatísticas básicas de ocupação
- Histórico de vistorias

### ❌ NÃO PODE Acessar

**Clientes:**
- Não pode cadastrar clientes
- Não pode editar clientes
- Não pode ver lista completa de clientes
- Não pode gerenciar cotas

**Embarcações:**
- Não pode cadastrar embarcações
- Não pode editar embarcações
- Não pode alterar quantidade de cotas
- Não pode desativar embarcações

**Reservas Passadas:**
- Não pode visualizar histórico completo
- Não pode editar reservas passadas
- Não pode cancelar reservas antigas

**Configurações:**
- Não pode acessar painel admin
- Não pode gerenciar outros funcionários
- Não pode alterar configurações do sistema
- Não pode ver relatórios financeiros completos

**Estatísticas Administrativas:**
- Não pode ver taxa de ocupação geral
- Não pode ver top clientes
- Não pode ver receita/faturamento
- Não pode exportar dados completos

---

## Estrutura de Dados

### Tabela `employees`

```sql
CREATE TABLE employees (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  vessel_ids JSON,  -- IDs das embarcações responsáveis
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### Tabela `users` (Modificação Necessária)

```sql
ALTER TABLE users 
MODIFY COLUMN role ENUM('user', 'admin', 'employee') DEFAULT 'user';
```

---

## Fluxo de Implementação

### Fase 1: Autenticação (Próxima)
1. Modificar schema de `users` para incluir role "employee"
2. Criar middleware de verificação de email em `employees`
3. Atribuir role automaticamente no login
4. Testar bloqueio de acesso para emails não cadastrados

### Fase 2: Dashboard Limitado
1. Criar página `/employee/dashboard`
2. Implementar menu de navegação limitado
3. Criar componente `EmployeeLayout` similar ao `DashboardLayout`
4. Testar acesso e navegação

### Fase 3: Endpoints Específicos
1. Criar `employeeProcedure` no tRPC
2. Implementar validação de role "employee"
3. Criar endpoints específicos para funcionários
4. Testar permissões em cada endpoint

### Fase 4: Interface de Funcionário
1. Criar páginas de vistorias para funcionário
2. Criar páginas de abastecimento para funcionário
3. Criar páginas de manutenção para funcionário
4. Implementar filtros por embarcação responsável

---

## Segurança

### Validações Necessárias

**Backend (tRPC):**
```typescript
// Exemplo de employeeProcedure
const employeeProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'employee' && ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso negado' });
  }
  return next({ ctx });
});
```

**Frontend (React):**
```typescript
// Exemplo de verificação de role
const { user } = useAuth();

if (user?.role === 'employee') {
  // Mostrar menu limitado
  return <EmployeeLayout />;
} else if (user?.role === 'admin') {
  // Mostrar menu admin
  return <DashboardLayout />;
}
```

---

## Notas Importantes

1. **Email é a chave de identificação:** O sistema usa o email para verificar se o usuário é funcionário cadastrado.

2. **Soft Delete:** Funcionários desativados não são deletados, apenas marcados como `is_active = false`.

3. **Embarcações Responsáveis:** Funcionário só pode ver/gerenciar embarcações que foram atribuídas a ele.

4. **Auditoria:** Todas as ações de funcionários são registradas com `recorded_by` para rastreabilidade.

5. **Hierarquia:** Admin pode fazer tudo que funcionário faz + funcionalidades administrativas.

---

## Próximos Passos

1. ✅ Cadastro de funcionários implementado
2. ⏳ Implementar autenticação e role "employee"
3. ⏳ Criar dashboard de funcionário
4. ⏳ Implementar permissões em endpoints
5. ⏳ Criar interfaces específicas para funcionário
6. ⏳ Testar fluxo completo de funcionário
